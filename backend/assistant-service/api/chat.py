"""Chat endpoint for the assistant-service read path (design section 13).

This is the single authenticated HTTP entry point for the RAG chat feature. It
wires together the already-implemented read-path components into the sequence
the design's request lifecycle describes:

    validate JWT  ->  load memory  ->  rewrite follow-up  ->  route  ->
        (analytics | retrieve)  ->  ground + generate  ->  append memory

Exposed routes (the service owns its ``/assistant`` prefix internally; the
gateway strips ``/api`` so ``POST /api/assistant/chat`` arrives here as
``POST /assistant/chat``):

- ``POST /assistant/chat`` — body ``{ question, conversationId? }``. The JWT is
  validated by the :func:`api.auth.get_current_principal` dependency *before*
  any question processing (Req 11.3, 11.5, 10.4). An empty / whitespace-only
  question is rejected with **400** (design "Error Handling"). On success it
  returns ``{ answer, citations, conversationId }`` (Req 11.4).
- ``GET /health`` — ``{"status": "ok"}``, matching every other platform service.

Dispatch by classification (Req 7.2, 7.3, 7.4):

- ``AGGREGATE``   → :class:`~chat.analytics_client.AnalyticsClient` for exact,
  SQL-backed counts (never the LLM for the numbers). If analytics is
  unavailable, the answer states the count could not be retrieved rather than
  estimating (Req 7.5).
- ``PRECEDENT``   → role-scoped :class:`~chat.retriever.Retriever` semantic
  search, then grounded generation.
- ``EXPLANATORY`` → the same role-scoped retrieval of related incidents, then
  grounded generation. (The public API contract carries no explicit referenced
  incident id, so an explanatory question is answered from the incidents its
  text retrieves.)

The heavy dependencies are assembled once into a :class:`ChatService` and
injected via the :func:`get_chat_service` FastAPI dependency, which tests (and
``main.py``) can override with :func:`set_chat_service`.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import ValidationError

from api.auth import Principal, get_current_principal
from chat.analytics_client import AnalyticsClient
from chat.grounding import GroundedAnswer, GroundingBuilder
from chat.memory import Conversation, MemoryManager
from chat.retriever import Retriever, ZoneProvider
from chat.rewriter import rewrite_question
from chat.router import QuestionCategory, classify_question
from config.settings import Settings, get_settings
from models.api import ChatRequest, ChatResponse
from ollama.client import OllamaClient
from store.vector_index import VectorIndexStore

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Chat orchestration service ----------------------------------------------


class ChatService:
    """Sequences the read-path components to answer one chat question.

    All external dependencies (Ollama, Redis-backed memory, the vector store,
    analytics-worker) are injected, so the whole read path can be exercised with
    in-memory fakes in tests. The orchestration itself holds no I/O beyond
    delegating to those components.
    """

    def __init__(
        self,
        *,
        ollama: OllamaClient,
        memory: MemoryManager,
        retriever: Retriever,
        analytics: AnalyticsClient,
        grounding: GroundingBuilder,
        settings: Optional[Settings] = None,
        llm_classifier=None,
    ) -> None:
        self._ollama = ollama
        self._memory = memory
        self._retriever = retriever
        self._analytics = analytics
        self._grounding = grounding
        self._settings = settings or get_settings()
        self._llm_classifier = llm_classifier

    async def answer(
        self,
        *,
        question: str,
        conversation_id: Optional[str],
        principal: Principal,
    ) -> ChatResponse:
        """Answer ``question`` for the authenticated ``principal``.

        Runs the full read-path sequence and always returns a well-formed
        :class:`~models.api.ChatResponse` carrying the answer text, the
        Citations, and a non-empty conversation id (Req 11.4).
        """

        # 1. Load (or mint) the conversation memory for this caller (Req 9.4).
        conversation: Conversation = self._memory.resolve(
            conversation_id, principal.user_id
        )

        # 2. Rewrite a vague follow-up into a standalone question using the
        #    conversation context, before routing/retrieval (Req 9.3).
        rewritten = await rewrite_question(
            question,
            self._ollama,
            summary=conversation.summary,
            recent_turns=conversation.turns,
        )

        # 3. Classify the question into exactly one strategy (Req 7.1).
        category = classify_question(
            rewritten, llm_classifier=self._llm_classifier
        )

        # 4. Dispatch to the matching strategy (Req 7.2, 7.3, 7.4).
        if category == QuestionCategory.AGGREGATE:
            grounded = await self._answer_aggregate(rewritten)
        else:
            grounded = await self._answer_from_retrieval(rewritten, principal)

        # 5. Append this turn to memory, refresh TTL, summarize if long
        #    (Req 9.1, 9.2). The *original* question is stored verbatim.
        await self._memory.record_exchange(
            conversation, question, grounded.answer
        )

        # 6. Return the required response shape (Req 11.4).
        return ChatResponse(
            answer=grounded.answer,
            citations=grounded.citations,
            conversation_id=conversation.conversationId,
        )

    # -- strategy handlers -------------------------------------------------

    async def _answer_aggregate(self, question: str) -> GroundedAnswer:
        """Answer an aggregate/counting question from exact analytics counts.

        Numbers come from analytics-worker, never the LLM (Req 7.2). When the
        analytics endpoints are unavailable, the answer states the count could
        not be retrieved rather than estimating a value (Req 7.5).
        """

        analytics_context, available = await self._build_analytics_context()
        if not available:
            from chat.analytics_client import COUNT_UNAVAILABLE_MESSAGE

            return GroundedAnswer(
                answer=COUNT_UNAVAILABLE_MESSAGE,
                citations=[],
                grounded=False,
                withheld=False,
            )

        # Aggregate answers rest on analytics totals, not on individual incident
        # records, so no per-incident Citations are required (incident_based=False).
        return await self._grounding.build_answer(
            question,
            hits=[],
            analytics_context=analytics_context,
            incident_based=False,
        )

    async def _answer_from_retrieval(
        self, question: str, principal: Principal
    ) -> GroundedAnswer:
        """Answer a precedent/explanatory question via role-scoped retrieval.

        Embeds the question, runs role-scoped KNN, and grounds the answer on the
        retrieved incidents (Req 7.3, 7.4). Guard scoping is enforced inside the
        Retriever (Req 10.1, 10.2). When nothing in-scope matches, the empty hit
        set drives the grounding layer to an explicit insufficient-data answer
        (Req 8.2, 6.4).
        """

        retrieval = await self._retriever.retrieve(
            question,
            role=principal.role,
            user_id=principal.user_id,
        )
        return await self._grounding.build_answer(
            question,
            hits=retrieval.hits,
            incident_based=True,
        )

    async def _build_analytics_context(self) -> tuple[Optional[str], bool]:
        """Fetch exact counts from analytics-worker and format them for grounding.

        Returns ``(context_text, available)``. ``available`` is ``False`` only
        when every analytics endpoint is unavailable, in which case the caller
        surfaces the "count unavailable" message (Req 7.5).
        """

        summary_result = await self._analytics.get_summary()
        today_result = await self._analytics.get_today()

        if not summary_result.available and not today_result.available:
            return None, False

        lines: list[str] = []

        if today_result.available:
            lines.append(f"Incidents created today: {today_result.value}")

        if summary_result.available and summary_result.value is not None:
            summary = summary_result.value
            lines.append(f"Total incidents recorded: {summary.total_incidents}")
            if summary.by_priority:
                lines.append(
                    "Incidents by priority: "
                    + ", ".join(f"{k}={v}" for k, v in summary.by_priority.items())
                )
            if summary.by_status:
                lines.append(
                    "Incidents by status: "
                    + ", ".join(f"{k}={v}" for k, v in summary.by_status.items())
                )
            if summary.by_zone:
                lines.append(
                    "Incidents by zone: "
                    + ", ".join(f"{k}={v}" for k, v in summary.by_zone.items())
                )
            if summary.avg_resolution_seconds is not None:
                lines.append(
                    f"Average resolution time (seconds): "
                    f"{summary.avg_resolution_seconds}"
                )

        return "\n".join(lines), True


# --- Dependency wiring --------------------------------------------------------

_chat_service: Optional[ChatService] = None


def build_default_chat_service(
    settings: Optional[Settings] = None,
    *,
    zone_provider: Optional[ZoneProvider] = None,
) -> ChatService:
    """Assemble a :class:`ChatService` with real (production) dependencies.

    The ``zone_provider`` supplies a guard's permitted zone IDs (derived from
    their shifts) for role scoping. It is injected here rather than hard-wired
    so the shifts HTTP call can be provided by the application without coupling
    this module to it; when omitted, guards are scoped to incidents directly
    assigned to them.
    """

    settings = settings or get_settings()
    ollama = OllamaClient(settings=settings)
    vector_store = VectorIndexStore(settings=settings)
    memory = MemoryManager(ollama=ollama, settings=settings)
    retriever = Retriever(
        ollama_client=ollama,
        vector_store=vector_store,
        settings=settings,
        zone_provider=zone_provider,
    )
    analytics = AnalyticsClient(settings=settings)
    grounding = GroundingBuilder(ollama)
    return ChatService(
        ollama=ollama,
        memory=memory,
        retriever=retriever,
        analytics=analytics,
        grounding=grounding,
        settings=settings,
    )


def set_chat_service(service: Optional[ChatService]) -> None:
    """Install (or clear) the process-wide :class:`ChatService` singleton.

    Called by ``main.py`` during startup to inject the fully-wired service, and
    by tests to swap in a fake. Passing ``None`` resets it so the next request
    rebuilds a default instance.
    """

    global _chat_service
    _chat_service = service


def get_chat_service() -> ChatService:
    """FastAPI dependency returning the shared :class:`ChatService`.

    Lazily builds a default service on first use so the endpoint works even if
    ``main.py`` did not pre-install one. Tests override this via
    :func:`set_chat_service` or FastAPI dependency overrides.
    """

    global _chat_service
    if _chat_service is None:
        _chat_service = build_default_chat_service()
    return _chat_service


# --- Routes -------------------------------------------------------------------


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe, matching every other platform service."""

    return {"status": "ok"}


@router.post("/assistant/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    principal: Principal = Depends(get_current_principal),
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    """Answer a chat question (Req 11.1, 11.3, 11.4).

    The JWT is validated by the :func:`get_current_principal` dependency, which
    FastAPI resolves *before* this handler runs — so an invalid/expired/missing
    token is rejected with 401 before any question processing (Req 11.3, 11.5,
    10.4). The request body is parsed and validated here so an empty or
    whitespace-only question surfaces as **400** (design "Error Handling").
    """

    # Parse the raw body ourselves so a blank question maps to 400 (not 422).
    try:
        payload = await request.json()
    except Exception as exc:  # noqa: BLE001 - any malformed body is a 400
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="request body must be valid JSON",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="request body must be a JSON object",
        )

    try:
        chat_request = ChatRequest.model_validate(payload)
    except ValidationError as exc:
        # The most common cause is an empty/whitespace-only question (Req 11.1);
        # surface it as a 400 per the design's error-handling contract.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="question must not be empty",
        ) from exc

    return await service.answer(
        question=chat_request.question,
        conversation_id=chat_request.conversation_id,
        principal=principal,
    )
