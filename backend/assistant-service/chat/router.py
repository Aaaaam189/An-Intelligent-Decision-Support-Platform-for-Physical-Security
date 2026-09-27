"""Question Router for the assistant-service chat read path.

Classifies each (already-rewritten) chat question into exactly one answer
strategy so the chat pipeline can dispatch it correctly (Requirement 7.1):

- ``AGGREGATE``   — counting / statistics questions ("how many critical
  incidents today?"). Answered from the Analytics_Worker SQL endpoints, never
  from the LLM (Requirement 7.2).
- ``PRECEDENT``   — precedent / semantic questions ("has anything like this
  happened at this camera before?"). Answered via Vector_Index Retrieval
  (Requirement 7.3).
- ``EXPLANATORY`` — questions that explain a specific incident ("why did this
  happen?"). Answered by retrieving the referenced incident plus related
  incidents (Requirement 7.4).

Classification is a **hybrid**: fast rule/keyword heuristics handle the common,
unambiguous cases, and an injectable LLM fallback classifier resolves ambiguous
inputs. The public :func:`classify_question` is a *pure function* over
``(question, referenced_incident_id, llm_classifier)`` — it performs no I/O of
its own and takes the classifier as a dependency, so the mapping is fully
testable without a live LLM (Design §8, Property 6).
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Callable, Optional


class QuestionCategory(str, Enum):
    """The three mutually exclusive answer strategies a question maps to."""

    AGGREGATE = "AGGREGATE"
    PRECEDENT = "PRECEDENT"
    EXPLANATORY = "EXPLANATORY"


# A classifier callable receives the question text and returns a category label
# (either a :class:`QuestionCategory` or a plain string naming one). It is only
# consulted for ambiguous inputs. Kept as a simple synchronous callable so the
# router stays a pure function and is trivial to fake in tests.
LlmClassifier = Callable[[str], object]


# --- Keyword / phrase heuristics -------------------------------------------------
#
# Phrases are matched case-insensitively as whole-word sequences. Ordering does
# not matter; each category accumulates a score equal to the number of distinct
# phrases it matches, and the highest-scoring category wins. Ties and zero-score
# (no phrase matched) inputs are treated as ambiguous and deferred to the LLM
# fallback (or a safe default when no classifier is supplied).

_AGGREGATE_PHRASES: tuple[str, ...] = (
    "how many",
    "how much",
    "how often",
    "count",
    "number of",
    "total",
    "sum of",
    "tally",
    "average",
    "most common",
    "statistics",
    "stats",
    "frequency",
    "trend",
    "today",
    "yesterday",
    "this week",
    "last week",
    "this month",
    "last month",
    "per day",
    "per week",
)

_EXPLANATORY_PHRASES: tuple[str, ...] = (
    "explain",
    "why did",
    "why was",
    "why is",
    "why does",
    "what happened",
    "what caused",
    "what led to",
    "tell me about",
    "describe",
    "walk me through",
    "details of",
    "more about this incident",
)

_PRECEDENT_PHRASES: tuple[str, ...] = (
    "has anything like",
    "anything like this",
    "similar",
    "happened before",
    "ever happened",
    "precedent",
    "in the past",
    "like this before",
    "history of",
    "seen this",
    "comparable",
)


def _phrase_score(haystack: str, phrases: tuple[str, ...]) -> int:
    """Return the number of distinct *phrases* found in ``haystack``.

    Matching is whole-word / whole-phrase (bounded by non-word characters) so
    that, for example, ``"count"`` does not match inside ``"accountant"``.
    ``haystack`` is expected to be already lower-cased.
    """

    score = 0
    for phrase in phrases:
        pattern = r"(?<!\w)" + re.escape(phrase) + r"(?!\w)"
        if re.search(pattern, haystack):
            score += 1
    return score


def _coerce_category(value: object) -> Optional[QuestionCategory]:
    """Best-effort conversion of an LLM classifier return value to a category.

    Accepts a :class:`QuestionCategory`, or any string that *contains* one of
    the category names (case-insensitive) so tolerant LLM outputs such as
    ``"Category: AGGREGATE"`` still resolve. Returns ``None`` when nothing
    recognizable is found.
    """

    if isinstance(value, QuestionCategory):
        return value
    if not isinstance(value, str):
        return None

    upper = value.upper()
    # Check EXPLANATORY before AGGREGATE/PRECEDENT: no substring overlap exists,
    # but iterating the enum keeps this exhaustive and future-proof.
    for category in QuestionCategory:
        if category.value in upper:
            return category
    return None


def classify_question(
    question: str,
    referenced_incident_id: Optional[str] = None,
    llm_classifier: Optional[LlmClassifier] = None,
) -> QuestionCategory:
    """Classify ``question`` into exactly one :class:`QuestionCategory`.

    Pure function: given the same arguments (and the same ``llm_classifier``
    behavior) it always returns the same category, and it performs no I/O beyond
    optionally invoking the supplied ``llm_classifier``.

    Decision procedure:

    1. If ``referenced_incident_id`` is provided, the question is about a
       specific incident → ``EXPLANATORY`` (Requirement 7.4). This is a strong,
       deterministic signal and short-circuits the heuristics.
    2. Otherwise, score the question against the AGGREGATE, EXPLANATORY, and
       PRECEDENT phrase sets. If a single category scores highest, return it.
    3. If the input is ambiguous (no phrase matched, or a tie for the top
       score), defer to ``llm_classifier`` when one is supplied; if the
       classifier is absent or returns something unrecognizable, fall back to
       ``PRECEDENT`` (semantic search is the safe general-purpose strategy).

    The function is total — it always returns exactly one category — which
    guarantees Property 6.

    Args:
        question: The natural-language question (already rewritten to be
            standalone). May be empty; an empty/whitespace question is treated
            as ambiguous.
        referenced_incident_id: Optional ID of an incident the question refers
            to (e.g. the incident the user opened when asking "why did this
            happen?"). Its presence forces ``EXPLANATORY``.
        llm_classifier: Optional callable used only for ambiguous inputs. It
            receives the question text and returns a category (or a string
            naming one). Injecting it as a dependency keeps this function pure
            and testable without a live LLM.

    Returns:
        The single :class:`QuestionCategory` the question maps to.
    """

    # Rule 1: an explicitly referenced incident means "explain this one".
    if referenced_incident_id is not None and str(referenced_incident_id).strip():
        return QuestionCategory.EXPLANATORY

    normalized = (question or "").strip().lower()

    # Rule 2: keyword/phrase heuristics.
    scores: dict[QuestionCategory, int] = {
        QuestionCategory.AGGREGATE: _phrase_score(normalized, _AGGREGATE_PHRASES),
        QuestionCategory.EXPLANATORY: _phrase_score(normalized, _EXPLANATORY_PHRASES),
        QuestionCategory.PRECEDENT: _phrase_score(normalized, _PRECEDENT_PHRASES),
    }
    top_score = max(scores.values())

    if top_score > 0:
        winners = [cat for cat, score in scores.items() if score == top_score]
        if len(winners) == 1:
            return winners[0]
        # A tie between categories is ambiguous → fall through to the LLM.

    # Rule 3: ambiguous input (no phrase matched or a tie) → LLM fallback.
    if llm_classifier is not None:
        try:
            resolved = _coerce_category(llm_classifier(normalized))
        except Exception:
            # A misbehaving classifier must never break routing; degrade to the
            # safe default rather than propagating the error into the chat path.
            resolved = None
        if resolved is not None:
            return resolved

    # Safe default: semantic precedent search answers the widest range of
    # free-form questions without fabricating counts.
    return QuestionCategory.PRECEDENT
