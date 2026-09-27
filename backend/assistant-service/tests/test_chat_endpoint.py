"""Tests for the chat endpoint wiring (api/chat.py).

Covers the task's read-path wiring and its requirements:

- JWT validated before any processing; 401 for missing/invalid tokens
  (Req 11.3, 11.5, 10.4).
- Empty / whitespace-only question rejected with 400 (Req 11.1, design error
  handling).
- Successful response carries answer + citations + non-empty conversationId
  (Req 11.4).
- Dispatch by classification: AGGREGATE → analytics, PRECEDENT/EXPLANATORY →
  retrieval (Req 7.2, 7.3, 7.4).
- GET /health → {"status": "ok"}.

The real :class:`ChatService` orchestration runs against in-memory fakes for
Ollama / memory / retriever / analytics / grounding, so the whole read path is
exercised without external infrastructure.
"""

from __future__ import annotations

import time

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import chat as chat_module
from chat.analytics_client import AnalyticsResult, AnalyticsSummary
from chat.grounding import GroundedAnswer
from chat.memory import Conversation
from chat.retriever import RetrievalResult
from config.settings import get_settings
from models.api import Citation
from store.vector_index import SearchHit

SECRET = get_settings().jwt_secret


def _token(claims=None):
    claims = claims or {"userId": "u-1", "role": "ADMIN", "exp": int(time.time()) + 3600}
    return jwt.encode(claims, SECRET, algorithm="HS256")


# --- Fakes -------------------------------------------------------------------


class FakeOllama:
    """Async LLM/embedding stub. ``generate`` is only used by the rewriter."""

    async def generate(self, system, prompt):
        return ""  # empty → rewriter keeps the original question

    async def embed(self, text):
        return [0.0]


class FakeMemory:
    def __init__(self):
        self.recorded = []

    def resolve(self, conversation_id, user_id=None):
        return Conversation(
            conversationId=conversation_id or "conv-new",
            userId=user_id,
            summary="",
            turns=[],
        )

    async def record_exchange(self, conversation, user_message, assistant_message):
        self.recorded.append((conversation.conversationId, user_message, assistant_message))
        return conversation


class FakeRetriever:
    def __init__(self, hits):
        self._hits = hits
        self.calls = []

    async def retrieve(self, question, *, role, user_id=None, **kwargs):
        self.calls.append((question, role, user_id))
        return RetrievalResult(hits=self._hits, found=bool(self._hits))


class FakeAnalytics:
    def __init__(self, available=True):
        self._available = available
        self.calls = 0

    async def get_summary(self):
        self.calls += 1
        if not self._available:
            return AnalyticsResult.unavailable("nope")
        return AnalyticsResult.ok(
            AnalyticsSummary(total_incidents=7, by_priority={"CRITICAL": 3})
        )

    async def get_today(self):
        if not self._available:
            return AnalyticsResult.unavailable("nope")
        return AnalyticsResult.ok(3)


class FakeGrounding:
    """Records how it was called and echoes a deterministic grounded answer."""

    def __init__(self):
        self.calls = []

    async def build_answer(self, question, *, hits=None, analytics_context=None, incident_based=True):
        self.calls.append(
            {
                "question": question,
                "hits": list(hits or []),
                "analytics_context": analytics_context,
                "incident_based": incident_based,
            }
        )
        citations = [
            Citation(incident_id=h.incident_id, label="x", url=f"/incidents/{h.incident_id}")
            for h in (hits or [])
        ]
        return GroundedAnswer(answer="grounded answer", citations=citations, grounded=True)


def _make_service(*, hits=None, analytics_available=True):
    memory = FakeMemory()
    retriever = FakeRetriever(hits or [])
    analytics = FakeAnalytics(available=analytics_available)
    grounding = FakeGrounding()
    service = chat_module.ChatService(
        ollama=FakeOllama(),
        memory=memory,
        retriever=retriever,
        analytics=analytics,
        grounding=grounding,
    )
    return service, memory, retriever, analytics, grounding


def _make_client(service):
    app = FastAPI()
    app.include_router(chat_module.router)
    app.dependency_overrides[chat_module.get_chat_service] = lambda: service
    return TestClient(app)


# --- health ------------------------------------------------------------------


def test_health_ok():
    client = _make_client(_make_service()[0])
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# --- auth ordering (Req 11.3, 11.5, 10.4) ------------------------------------


def test_missing_token_rejected_before_processing():
    service, memory, retriever, analytics, grounding = _make_service()
    client = _make_client(service)
    resp = client.post("/assistant/chat", json={"question": "how many today?"})
    assert resp.status_code == 401
    # No processing happened.
    assert memory.recorded == []
    assert retriever.calls == []
    assert grounding.calls == []


def test_invalid_token_rejected():
    service, memory, *_ = _make_service()
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"question": "how many today?"},
        headers={"Authorization": "Bearer not.a.jwt"},
    )
    assert resp.status_code == 401
    assert memory.recorded == []


# --- empty question → 400 (Req 11.1) -----------------------------------------


def test_empty_question_rejected_with_400():
    service, memory, *_ = _make_service()
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"question": "   "},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 400
    assert memory.recorded == []


def test_missing_question_field_rejected_with_400():
    service, *_ = _make_service()
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"conversationId": "c-1"},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 400


# --- PRECEDENT dispatch → retrieval (Req 7.3, 11.4) --------------------------


def test_precedent_question_uses_retrieval_and_returns_shape():
    hits = [SearchHit(incident_id="inc-9", score=0.1, fields={"type": "THEFT"})]
    service, memory, retriever, analytics, grounding = _make_service(hits=hits)
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"question": "has anything like this happened before?"},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"] == "grounded answer"
    assert body["conversationId"]
    assert body["citations"][0]["incidentId"] == "inc-9"
    # Retrieval path taken, not analytics.
    assert len(retriever.calls) == 1
    assert analytics.calls == 0
    assert grounding.calls[0]["incident_based"] is True
    # Turn appended to memory (Req 9.1).
    assert len(memory.recorded) == 1


# --- AGGREGATE dispatch → analytics (Req 7.2) --------------------------------


def test_aggregate_question_uses_analytics_not_retrieval():
    service, memory, retriever, analytics, grounding = _make_service()
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"question": "how many incidents today?"},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 200
    # Analytics path taken, retrieval untouched.
    assert analytics.calls == 1
    assert retriever.calls == []
    call = grounding.calls[0]
    assert call["incident_based"] is False
    assert "today" in call["analytics_context"].lower()


def test_aggregate_unavailable_reports_count_could_not_be_retrieved():
    service, *_ = _make_service(analytics_available=False)
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"question": "how many incidents today?"},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 200
    assert "could not be retrieved" in resp.json()["answer"].lower()


# --- conversation id preserved -----------------------------------------------


def test_conversation_id_is_preserved_when_supplied():
    service, *_ = _make_service(hits=[SearchHit(incident_id="i", score=0.0, fields={})])
    client = _make_client(service)
    resp = client.post(
        "/assistant/chat",
        json={"question": "tell me more about it", "conversationId": "conv-42"},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 200
    assert resp.json()["conversationId"] == "conv-42"
