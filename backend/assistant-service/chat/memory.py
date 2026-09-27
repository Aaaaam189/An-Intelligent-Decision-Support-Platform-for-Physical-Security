"""Conversation memory manager for the assistant-service chat read path.

Manages Conversation_Memory in Redis (Requirement 9). A conversation is stored
as a single JSON document under the key ``assistant:conv:{conversationId}`` with
a configurable time-to-live (``MEMORY_TTL_SECONDS``):

    {
      "conversationId": "uuid",
      "userId": "uuid",
      "summary": "Earlier the user asked about ... (compacted)",
      "turns": [ { "role": "user"|"assistant", "content": "...", "at": 1700000000 } ]
    }

Responsibilities (design §12 "Memory Manager"):

- Store the recent turns of a conversation *verbatim* with a TTL that is
  refreshed on every write, so an active conversation stays alive while an idle
  one expires (Requirement 9.1).
- When a conversation grows beyond ``MEMORY_MAX_TURNS``, fold the older turns
  into a compact running ``summary`` via the LLM and keep only the most recent
  ``MEMORY_MAX_TURNS`` turns verbatim (Requirement 9.2). No older turn is
  retained verbatim once summarized.
- Treat a missing / expired conversation id as the start of a *fresh*
  conversation and mint a new id (Requirement 9.4).

Redis access is synchronous (mirroring :mod:`store.vector_index`), while
summarization is ``async`` because it calls the async :class:`OllamaClient`.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import List, Optional

import redis
from pydantic import BaseModel, Field

from config.settings import Settings, get_settings
from ollama.client import OllamaClient, OllamaError

logger = logging.getLogger(__name__)

# Key prefix for a conversation document. The full key is
# ``assistant:conv:{conversationId}``.
KEY_PREFIX = "assistant:conv:"

# System prompt used when compacting older turns into a running summary. Kept
# terse and grounding-friendly: the summary must preserve what was discussed
# without inventing facts, because it later feeds Question_Rewriting.
_SUMMARY_SYSTEM = (
    "You maintain a running summary of a support chat about security incidents. "
    "Produce a concise, factual summary of the conversation so far. Preserve "
    "concrete details the user referred to (incident ids, cameras, zones, "
    "dates, counts). Do not invent information. Return only the summary text."
)


class Turn(BaseModel):
    """A single verbatim chat turn stored in Conversation_Memory."""

    role: str  # "user" | "assistant"
    content: str
    at: int = Field(default_factory=lambda: int(time.time()))


class Conversation(BaseModel):
    """A conversation's stored memory: a running summary plus recent turns."""

    conversationId: str
    userId: Optional[str] = None
    summary: str = ""
    turns: List[Turn] = Field(default_factory=list)


def new_conversation_id() -> str:
    """Mint a new, unique conversation id."""

    return str(uuid.uuid4())


class MemoryManager:
    """Redis-backed store for Conversation_Memory (Requirement 9)."""

    def __init__(
        self,
        client: Optional["redis.Redis"] = None,
        ollama: Optional[OllamaClient] = None,
        settings: Optional[Settings] = None,
    ) -> None:
        """Create the memory manager.

        Args:
            client: An optional pre-built redis client. When omitted, a client
                is built from ``REDIS_URL`` with ``decode_responses=True`` so the
                stored JSON round-trips as ``str``.
            ollama: An optional :class:`OllamaClient` used to summarize older
                turns. When omitted one is constructed lazily on first use.
            settings: Optional settings override (defaults to ``get_settings()``).
        """

        self._settings = settings or get_settings()
        self._ttl = int(self._settings.memory_ttl_seconds)
        self._max_turns = int(self._settings.memory_max_turns)
        self._client = client or redis.Redis.from_url(
            self._settings.redis_url, decode_responses=True
        )
        self._ollama = ollama
        self._owns_ollama = ollama is None

    # ------------------------------------------------------------------
    # Keys / helpers
    # ------------------------------------------------------------------
    @staticmethod
    def new_conversation_id() -> str:
        """Mint a new, unique conversation id (Requirement 9.4)."""

        return new_conversation_id()

    def _key(self, conversation_id: str) -> str:
        """Return the Redis key for a conversation document."""

        return f"{KEY_PREFIX}{conversation_id}"

    def _get_ollama(self) -> OllamaClient:
        if self._ollama is None:
            self._ollama = OllamaClient(settings=self._settings)
            self._owns_ollama = True
        return self._ollama

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------
    def load(self, conversation_id: Optional[str]) -> Optional[Conversation]:
        """Return the stored conversation, or ``None`` if missing / expired.

        A ``None`` / empty id, or an id whose TTL has elapsed, both surface as
        ``None`` here — callers use :meth:`resolve` to turn that into a fresh
        conversation (Requirement 9.4).
        """

        if not conversation_id:
            return None

        raw = self._client.get(self._key(conversation_id))
        if raw is None:
            return None

        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        try:
            return Conversation.model_validate_json(text)
        except ValueError:
            # A corrupt/unreadable document is treated as absent so the caller
            # starts fresh rather than crashing the chat request.
            logger.warning(
                "Discarding unreadable conversation memory for id %s",
                conversation_id,
            )
            return None

    def resolve(
        self,
        conversation_id: Optional[str],
        user_id: Optional[str] = None,
    ) -> Conversation:
        """Load an existing conversation or start a fresh one.

        When ``conversation_id`` is missing, unknown, or expired, a brand-new
        conversation with a freshly minted id is returned (Requirement 9.4). An
        existing conversation is returned as stored (its ``userId`` is filled in
        if it was absent).
        """

        existing = self.load(conversation_id)
        if existing is not None:
            if user_id and not existing.userId:
                existing.userId = user_id
            return existing

        return Conversation(
            conversationId=new_conversation_id(),
            userId=user_id,
            summary="",
            turns=[],
        )

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------
    def _save(self, conversation: Conversation) -> None:
        """Persist ``conversation`` with a refreshed TTL (Requirement 9.1)."""

        self._client.set(
            self._key(conversation.conversationId),
            conversation.model_dump_json(),
            ex=self._ttl,
        )

    async def append_turns(
        self,
        conversation: Conversation,
        turns: List[Turn],
    ) -> Conversation:
        """Append ``turns`` to ``conversation``, compact if long, and persist.

        The recent turns are stored verbatim; once the total exceeds
        ``MEMORY_MAX_TURNS`` the older turns are folded into the running summary
        via the LLM and only the most recent ``MEMORY_MAX_TURNS`` turns are kept
        verbatim (Requirements 9.1, 9.2). The TTL is refreshed on every write.
        """

        conversation.turns.extend(turns)
        await self._compact(conversation)
        self._save(conversation)
        return conversation

    async def record_exchange(
        self,
        conversation: Conversation,
        user_message: str,
        assistant_message: str,
    ) -> Conversation:
        """Append a user question and the assistant's answer as two turns."""

        now = int(time.time())
        return await self.append_turns(
            conversation,
            [
                Turn(role="user", content=user_message, at=now),
                Turn(role="assistant", content=assistant_message, at=now),
            ],
        )

    async def _compact(self, conversation: Conversation) -> None:
        """Summarize older turns when the conversation exceeds the max length.

        Keeps at most ``MEMORY_MAX_TURNS`` recent turns verbatim; the older ones
        are merged into ``conversation.summary`` and dropped so no older turn is
        retained verbatim (Requirement 9.2, Property 14).
        """

        max_turns = self._max_turns
        if max_turns <= 0 or len(conversation.turns) <= max_turns:
            return

        overflow = conversation.turns[:-max_turns]
        recent = conversation.turns[-max_turns:]

        conversation.summary = await self._summarize(conversation.summary, overflow)
        conversation.turns = recent

    async def _summarize(self, existing_summary: str, turns: List[Turn]) -> str:
        """Fold ``turns`` into ``existing_summary`` using the LLM.

        Falls back to a plain-text compaction when the LLM is unavailable so the
        memory stays bounded (Requirement 9.2) rather than growing unbounded or
        losing the conversation on a transient model outage.
        """

        transcript = _render_turns(turns)
        prompt_parts = []
        if existing_summary.strip():
            prompt_parts.append(f"Summary so far:\n{existing_summary.strip()}")
        prompt_parts.append(f"Older turns to fold into the summary:\n{transcript}")
        prompt_parts.append("Updated summary:")
        prompt = "\n\n".join(prompt_parts)

        try:
            summary = await self._get_ollama().generate(_SUMMARY_SYSTEM, prompt)
        except OllamaError as exc:
            logger.warning(
                "LLM summarization unavailable (%s); using text fallback", exc
            )
            return _fallback_summary(existing_summary, transcript)

        summary = summary.strip()
        if not summary:
            return _fallback_summary(existing_summary, transcript)
        return summary

    async def aclose(self) -> None:
        """Release resources this manager owns (an internally-built Ollama client)."""

        if self._ollama is not None and self._owns_ollama:
            await self._ollama.aclose()
            self._ollama = None


def _render_turns(turns: List[Turn]) -> str:
    """Render turns as a plain ``role: content`` transcript for the LLM."""

    return "\n".join(f"{turn.role}: {turn.content}" for turn in turns)


def _fallback_summary(existing_summary: str, transcript: str) -> str:
    """Combine the prior summary with a raw transcript when the LLM is down."""

    parts = [part for part in (existing_summary.strip(), transcript.strip()) if part]
    return "\n".join(parts)
