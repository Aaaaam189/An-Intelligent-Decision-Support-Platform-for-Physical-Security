"""Question Rewriter for the assistant-service chat read path.

A vague follow-up ("what about camera 3?", "why did that happen?") only makes
sense in the context of the earlier turns of a conversation. Retrieval, on the
other hand, works best against a *standalone* question that carries all the
context it needs on its own. This module bridges that gap: it rewrites a
context-dependent follow-up into a single self-contained question **before**
the question is routed and retrieved (Requirement 9.3).

The rewriter consumes the conversation context produced by the Memory Manager
(``chat/memory.py``) — the running ``summary`` of older turns plus the recent
turns kept verbatim — and the raw question, and returns a standalone question.

The LLM is injected as a dependency (any object exposing an async
``generate(system, prompt) -> str`` — e.g. :class:`ollama.client.OllamaClient`)
so the rewrite logic is fully testable without a live model. When there is no
prior context, when the question is already standalone, or when the LLM fails
or returns nothing usable, the rewriter safely returns the original question
unchanged — rewriting must never lose or corrupt the user's intent.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)

# The most recent turns to feed the model as context. The Memory Manager
# already bounds the verbatim tail (``MEMORY_MAX_TURNS``); this is an additional
# safety cap so an unusually long tail can't blow up the prompt.
_DEFAULT_MAX_CONTEXT_TURNS = 8

# System prompt: constrain the model to *only* rephrase, never answer.
_REWRITE_SYSTEM = (
    "You rewrite a user's latest message into a single standalone question for a "
    "security-incident search system. Use the conversation context to resolve "
    "vague references (pronouns like 'it', 'that', 'this', or omitted subjects) "
    "into explicit terms. Preserve the original meaning exactly. Do not answer "
    "the question, do not add new facts, and do not explain your reasoning. "
    "If the message is already a clear standalone question, return it unchanged. "
    "Respond with only the rewritten question on a single line."
)


@runtime_checkable
class SupportsGenerate(Protocol):
    """Minimal async LLM interface the rewriter depends on.

    Matches :meth:`ollama.client.OllamaClient.generate`, so the real client can
    be passed directly while tests can supply a lightweight fake.
    """

    async def generate(self, system: str, prompt: str) -> str:  # pragma: no cover - protocol
        ...


# Lower-cased tokens/prefixes that strongly suggest a message depends on earlier
# turns (a "follow-up") and therefore benefits from rewriting.
_FOLLOWUP_REFERENCE_WORDS: frozenset[str] = frozenset(
    {
        "it",
        "its",
        "it's",
        "that",
        "this",
        "these",
        "those",
        "them",
        "they",
        "their",
        "there",
        "he",
        "she",
        "him",
        "her",
        "his",
        "one",
        "ones",
        "same",
        "another",
        "again",
        "too",
        "also",
    }
)

_FOLLOWUP_LEADING_WORDS: frozenset[str] = frozenset(
    {
        "and",
        "but",
        "so",
        "then",
        "what",
        "why",
        "how",
        "who",
        "when",
        "where",
        "which",
        "ok",
        "okay",
    }
)


def _turn_role_content(turn: Any) -> tuple[str, str]:
    """Extract ``(role, content)`` from a turn that may be a dict or an object.

    Supports both the JSON-shaped dicts stored in Redis
    (``{"role": ..., "content": ...}``) and pydantic/attribute-style turn
    objects, so the rewriter stays decoupled from the concrete memory model.
    """

    if isinstance(turn, dict):
        role = turn.get("role", "")
        content = turn.get("content", "")
    else:
        role = getattr(turn, "role", "")
        content = getattr(turn, "content", "")
    return str(role or "").strip(), str(content or "").strip()


def _looks_like_followup(question: str) -> bool:
    """Heuristic: does ``question`` appear to depend on earlier turns?

    Returns ``True`` when the question is short, opens with a conjunction/bare
    interrogative, or contains a referring word (pronoun/demonstrative) — the
    hallmarks of a vague follow-up. This avoids paying for an LLM round-trip on
    questions that are already self-contained.
    """

    words = [w for w in question.lower().replace("?", " ").split() if w]
    if not words:
        return False

    # Very short messages ("why?", "and camera 3?") are almost always follow-ups.
    if len(words) <= 4:
        return True

    if words[0] in _FOLLOWUP_LEADING_WORDS:
        return True

    return any(word in _FOLLOWUP_REFERENCE_WORDS for word in words)


def _build_context_block(summary: Optional[str], turns: Iterable[Any], max_turns: int) -> str:
    """Render the summary + recent turns into a compact prompt context block."""

    lines: list[str] = []

    clean_summary = (summary or "").strip()
    if clean_summary:
        lines.append(f"Summary of earlier conversation: {clean_summary}")

    turn_list = list(turns or [])
    if max_turns > 0:
        turn_list = turn_list[-max_turns:]

    for turn in turn_list:
        role, content = _turn_role_content(turn)
        if not content:
            continue
        speaker = "User" if role.lower() == "user" else "Assistant"
        lines.append(f"{speaker}: {content}")

    return "\n".join(lines)


def _sanitize_rewrite(raw: str, fallback: str) -> str:
    """Clean the model output into a single-line standalone question.

    Guards against common LLM output noise (surrounding quotes, a leading
    ``"Question:"`` label, multi-line rambling). Returns ``fallback`` when the
    cleaned result is empty so a misbehaving model can never erase the question.
    """

    if not raw:
        return fallback

    text = raw.strip()
    # Keep only the first non-empty line — the instruction asks for one line.
    for line in text.splitlines():
        line = line.strip()
        if line:
            text = line
            break
    else:
        return fallback

    # Strip a leading label such as "Question:" or "Rewritten:".
    lowered = text.lower()
    for prefix in ("rewritten question:", "standalone question:", "question:", "rewritten:"):
        if lowered.startswith(prefix):
            text = text[len(prefix):].strip()
            break

    # Strip a single pair of wrapping quotes.
    if len(text) >= 2 and text[0] in "\"'“”" and text[-1] in "\"'“”":
        text = text[1:-1].strip()

    return text or fallback


async def rewrite_question(
    question: str,
    llm: SupportsGenerate,
    *,
    summary: Optional[str] = None,
    recent_turns: Optional[Iterable[Any]] = None,
    max_context_turns: int = _DEFAULT_MAX_CONTEXT_TURNS,
) -> str:
    """Rewrite a vague follow-up ``question`` into a standalone question.

    Uses the conversation context (``summary`` of older turns plus the
    ``recent_turns`` kept verbatim by the Memory Manager) to resolve vague
    references before the question is routed and retrieved (Requirement 9.3).

    The rewrite is *conservative*:

    - With no prior context (fresh conversation) the question is returned
      unchanged — there is nothing to resolve against.
    - A question that does not look like a follow-up (already self-contained) is
      returned unchanged, avoiding an unnecessary LLM call.
    - If the LLM is unreachable/errors, or returns empty/unusable text, the
      original question is returned unchanged. Rewriting must never drop or
      corrupt the user's intent.

    Args:
        question: The user's latest raw question.
        llm: An object exposing async ``generate(system, prompt) -> str`` (the
            injected LLM dependency; e.g. :class:`OllamaClient`).
        summary: The running summary of older turns from Conversation_Memory.
        recent_turns: The recent verbatim turns (dicts with ``role``/``content``
            or attribute-style objects). Only the last ``max_context_turns`` are
            used.
        max_context_turns: Safety cap on how many recent turns are included in
            the prompt.

    Returns:
        A standalone, searchable question. Never empty when ``question`` is
        non-empty; falls back to the original text on any failure.
    """

    original = (question or "").strip()
    if not original:
        return original

    context_block = _build_context_block(summary, recent_turns or [], max_context_turns)

    # No prior context → treat as a fresh, already-standalone question.
    if not context_block:
        return original

    # Already self-contained → no rewrite needed.
    if not _looks_like_followup(original):
        return original

    prompt = (
        f"{context_block}\n\n"
        f"Latest user message: {original}\n\n"
        "Rewrite the latest user message as a single standalone question."
    )

    try:
        raw = await llm.generate(_REWRITE_SYSTEM, prompt)
    except Exception as exc:  # noqa: BLE001 - degrade gracefully on any LLM failure
        logger.warning(
            "Question rewrite failed (%s: %s); using the original question",
            type(exc).__name__,
            exc,
        )
        return original

    rewritten = _sanitize_rewrite(raw or "", original)
    if rewritten != original:
        logger.debug("Rewrote follow-up %r -> %r", original, rewritten)
    return rewritten
