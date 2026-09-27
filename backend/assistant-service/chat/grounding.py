"""Grounding and Citation Builder for the assistant-service chat read path.

This module enforces the platform's *grounding contract* (Requirement 8): the
LLM must answer **only** from the incidents/analytics it is given, must say when
the available data is insufficient, and every answer that rests on real
incidents must come back with clickable Citations to those incidents.

It is split into small **pure functions** (prompt building, context labelling,
citation derivation) plus one thin orchestrator (:class:`GroundingBuilder`) that
holds the single I/O dependency — the injectable :class:`ollama.client.OllamaClient`
used to generate the answer. Keeping the logic pure makes the grounding
guarantees directly property-testable without a live LLM:

- The generation prompt always carries the grounding instruction and is *closed*
  over the provided context — it contains no incident record beyond those passed
  in (Requirement 8.1, Property 8).
- When there is nothing to answer from, an explicit insufficient-data answer is
  returned with no citations (Requirement 8.2).
- Citations are derived from the *role-permitted* context set the Retriever
  already scoped, so every Citation refers to a record that was in context and
  exposes an incident ID plus a well-formed ``/incidents/{id}`` link the
  frontend can render (Requirements 8.3, 8.5, 10.3, 13.3, Property 9).
- If an incident-based answer yields no derivable Citations, the answer is
  withheld and replaced with a "could not be sourced" response (Requirement 8.4,
  Property 10).

Note on role scoping: the :class:`~chat.retriever.Retriever` applies role
filters *before* returning hits, so the ``hits`` handed to this module are
already the role-permitted set. Deriving Citations only from those hits
therefore guarantees Citations can never fall outside the user's scope
(Requirement 10.3).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional, Sequence

from models.api import Citation
from ollama.client import OllamaClient
from store.vector_index import SearchHit

logger = logging.getLogger(__name__)


# --- Fixed grounding language -------------------------------------------------

#: The system prompt. Instructs the LLM to answer only from the provided context
#: and to state explicitly when the data is insufficient (Req 8.1, 8.2).
GROUNDING_SYSTEM_PROMPT = (
    "You are SentinelAI's security-incident assistant. Answer the user's "
    "question using ONLY the incident records and analytics results provided in "
    "the CONTEXT section below. Do not use any outside knowledge, and do not "
    "invent, assume, or infer incidents, numbers, names, or events that are not "
    "present in the CONTEXT. When you refer to an incident, refer to it by its "
    "labelled incident ID. If the CONTEXT does not contain enough information to "
    "answer the question, reply exactly with: "
    f'"{{insufficient}}" '
    "and nothing else. Be concise and factual."
)

#: Returned verbatim when there is no context to ground an answer on (Req 8.2).
INSUFFICIENT_DATA_MESSAGE = (
    "I don't have enough information in the available incident data to answer "
    "that question."
)

#: Returned when an incident-based answer cannot be backed by any Citation
#: (Req 8.4). The answer is withheld rather than shown unsourced.
COULD_NOT_BE_SOURCED_MESSAGE = (
    "I found related information but could not source it to specific incident "
    "records, so I'm withholding the answer."
)

#: Base path for an incident detail page. Citations expose ``/incidents/{id}``
#: so the frontend can render a link (Req 8.5, 13.3).
INCIDENT_URL_TEMPLATE = "/incidents/{incident_id}"

# Header markers used to delimit the closed context block in the prompt.
_CONTEXT_HEADER = "CONTEXT:"
_NO_RECORDS_MARKER = "(no incident records were retrieved)"
_ANALYTICS_HEADER = "ANALYTICS RESULTS:"


# --- Result shape -------------------------------------------------------------


@dataclass(frozen=True)
class GroundedAnswer:
    """The outcome of building a grounded answer.

    Attributes:
        answer: The final answer text to return to the user. This is either the
            LLM's grounded answer, the insufficient-data message (Req 8.2), or
            the "could not be sourced" withholding message (Req 8.4).
        citations: The Citations backing the answer. Always a role-permitted
            subset of the provided context (Req 8.3, 10.3); empty for
            insufficient-data and withheld answers.
        grounded: ``True`` when the answer is an LLM answer backed by context;
            ``False`` for the insufficient-data and withheld cases.
        withheld: ``True`` only when an incident-based answer was withheld
            because no Citations could be derived (Req 8.4).
    """

    answer: str
    citations: list[Citation] = field(default_factory=list)
    grounded: bool = False
    withheld: bool = False


# --- Pure helpers -------------------------------------------------------------


def _humanize_type(raw_type: str) -> str:
    """Turn an enum-style type (``UNAUTHORIZED_ACCESS``) into a readable phrase."""

    cleaned = (raw_type or "").replace("_", " ").strip()
    if not cleaned:
        return ""
    return cleaned.capitalize()


def build_citation_label(hit: SearchHit) -> str:
    """Build a human-readable Citation label from a hit's metadata.

    Uses the incident type (and priority when present) so the frontend link has
    meaningful text. Falls back to a short incident reference when no type is
    stored.
    """

    fields = hit.fields or {}
    type_label = _humanize_type(fields.get("type", ""))
    priority = (fields.get("priority", "") or "").strip()

    if type_label and priority:
        return f"{type_label} ({priority.capitalize()} priority)"
    if type_label:
        return type_label
    short = hit.incident_id[:8] if hit.incident_id else "unknown"
    return f"Incident {short}"


def derive_citations(hits: Sequence[SearchHit]) -> list[Citation]:
    """Derive Citations from the (role-permitted) context hits.

    Pure function (Req 8.3, 8.5, 10.3, 13.3, Property 9). For each hit with a
    non-empty incident ID it produces one :class:`~models.api.Citation` carrying:

    - ``incident_id`` — the incident UUID,
    - ``label`` — a readable label built from the hit's metadata,
    - ``url`` — a well-formed ``/incidents/{id}`` link the frontend renders.

    Because the Retriever role-scopes ``hits`` before they reach here, every
    Citation necessarily refers to a record the user is permitted to see, and
    duplicates (same incident matched via more than one scope branch) are
    collapsed to a single Citation. Hits with an empty/missing incident ID are
    skipped — they cannot be turned into a link — which is what allows the
    withholding rule (Req 8.4) to trigger when a set of hits yields no Citations.
    """

    citations: list[Citation] = []
    seen: set[str] = set()
    for hit in hits or []:
        incident_id = (hit.incident_id or "").strip()
        if not incident_id or incident_id in seen:
            continue
        seen.add(incident_id)
        citations.append(
            Citation(
                incident_id=incident_id,
                label=build_citation_label(hit),
                url=INCIDENT_URL_TEMPLATE.format(incident_id=incident_id),
            )
        )
    return citations


def format_context_record(index: int, hit: SearchHit) -> str:
    """Format a single retrieved incident as a labelled context line.

    Each record is labelled with its incident ID so the model can reference its
    sources (Req 8.1). Only the fields actually present on the hit are included;
    no data beyond the provided hit is added.
    """

    fields = hit.fields or {}
    parts: list[str] = [f"[Incident {hit.incident_id}]"]

    for key in ("type", "priority", "status"):
        value = (fields.get(key, "") or "").strip()
        if value:
            parts.append(f"{key}={value}")

    zone_id = (fields.get("zone_id", "") or "").strip()
    if zone_id:
        parts.append(f"zone_id={zone_id}")

    created_at = (fields.get("created_at", "") or "").strip()
    if created_at:
        parts.append(f"created_at={created_at}")

    description = (fields.get("description", "") or "").strip()
    line = f"{index}. " + " | ".join(parts)
    if description:
        line += f"\n   {description}"
    return line


def build_context_block(
    hits: Sequence[SearchHit],
    analytics_context: Optional[str] = None,
) -> str:
    """Build the closed CONTEXT block for the prompt (Req 8.1, Property 8).

    The returned block contains *only* the provided incident records and the
    optional analytics text — nothing else — so the prompt is closed over the
    given context. When no incident records are supplied, an explicit
    "no records" marker is used instead of fabricating any.
    """

    lines: list[str] = [_CONTEXT_HEADER]

    if hits:
        for index, hit in enumerate(hits, start=1):
            lines.append(format_context_record(index, hit))
    else:
        lines.append(_NO_RECORDS_MARKER)

    if analytics_context and analytics_context.strip():
        lines.append("")
        lines.append(_ANALYTICS_HEADER)
        lines.append(analytics_context.strip())

    return "\n".join(lines)


def build_grounding_prompt(
    question: str,
    hits: Sequence[SearchHit],
    analytics_context: Optional[str] = None,
) -> tuple[str, str]:
    """Build the ``(system, user)`` prompt pair for grounded generation.

    Pure function (Req 8.1, Property 8). The system prompt carries the grounding
    instruction (answer only from the provided data, state when insufficient),
    and the user prompt embeds the closed CONTEXT block followed by the
    question. The ``{insufficient}`` placeholder in the system prompt is bound to
    the canonical insufficient-data message so the model emits it verbatim when
    it cannot answer.
    """

    system_prompt = GROUNDING_SYSTEM_PROMPT.format(
        insufficient=INSUFFICIENT_DATA_MESSAGE
    )
    context_block = build_context_block(hits, analytics_context)
    user_prompt = f"{context_block}\n\nQUESTION: {(question or '').strip()}\n\nANSWER:"
    return system_prompt, user_prompt


def _looks_insufficient(answer: str) -> bool:
    """Return whether an LLM answer signals it could not answer from context."""

    normalized = (answer or "").strip().lower()
    if not normalized:
        return True
    return INSUFFICIENT_DATA_MESSAGE.lower() in normalized


# --- Orchestrator -------------------------------------------------------------


class GroundingBuilder:
    """Builds grounded answers with Citations, using an injectable LLM client.

    The only dependency is an :class:`~ollama.client.OllamaClient`, injected so
    the builder can be tested against a fake. All grounding decisions
    (insufficient-context short-circuit, prompt construction, citation
    derivation, withholding) live in the pure helpers above; this class only
    sequences them around the single ``generate`` call.
    """

    def __init__(self, ollama_client: OllamaClient) -> None:
        self._ollama = ollama_client

    async def build_answer(
        self,
        question: str,
        *,
        hits: Optional[Sequence[SearchHit]] = None,
        analytics_context: Optional[str] = None,
        incident_based: bool = True,
    ) -> GroundedAnswer:
        """Produce a grounded answer for ``question`` from the given context.

        Args:
            question: The (already-rewritten, standalone) question to answer.
            hits: The role-permitted incident records retrieved for the
                question. May be empty for aggregate/analytics-only answers.
            analytics_context: Optional pre-formatted analytics/count text to
                include in the context (e.g. exact SQL-backed counts).
            incident_based: Whether the answer rests on incident records. When
                ``True`` (precedent/explanatory questions) an answer with no
                derivable Citations is withheld (Req 8.4). When ``False``
                (pure analytics answers) an empty Citation list is allowed.

        Returns:
            A :class:`GroundedAnswer`. Cases:

            - **No context** (no hits and no analytics): the explicit
              insufficient-data answer with no Citations (Req 8.2).
            - **LLM signals insufficient**: the insufficient-data answer with no
              Citations (Req 8.2).
            - **Incident-based answer with no Citations**: withheld with the
              "could not be sourced" message (Req 8.4).
            - **Otherwise**: the LLM's grounded answer plus its Citations
              (Req 8.1, 8.3, 8.5).
        """

        hit_list = list(hits or [])
        has_analytics = bool(analytics_context and analytics_context.strip())

        # (8.2) Nothing to ground on → explicit insufficient-data answer, no cites.
        if not hit_list and not has_analytics:
            return GroundedAnswer(
                answer=INSUFFICIENT_DATA_MESSAGE,
                citations=[],
                grounded=False,
                withheld=False,
            )

        system_prompt, user_prompt = build_grounding_prompt(
            question, hit_list, analytics_context
        )
        raw_answer = await self._ollama.generate(system_prompt, user_prompt)

        # (8.2) The model itself reports the context was insufficient.
        if _looks_insufficient(raw_answer):
            return GroundedAnswer(
                answer=INSUFFICIENT_DATA_MESSAGE,
                citations=[],
                grounded=False,
                withheld=False,
            )

        # (8.3, 8.5, 10.3) Derive Citations from the role-permitted context set.
        citations = derive_citations(hit_list)

        # (8.4) An incident-based claim with no derivable Citations is withheld.
        if incident_based and hit_list and not citations:
            logger.warning(
                "withholding incident-based answer: no citations could be "
                "derived from %d hit(s)",
                len(hit_list),
            )
            return GroundedAnswer(
                answer=COULD_NOT_BE_SOURCED_MESSAGE,
                citations=[],
                grounded=False,
                withheld=True,
            )

        return GroundedAnswer(
            answer=raw_answer.strip(),
            citations=citations,
            grounded=True,
            withheld=False,
        )
