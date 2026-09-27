"""Role-scoped semantic Retriever for the assistant-service chat read path.

Given a natural-language question, the Retriever finds the incidents most
related to it so the answer can be grounded on real records (Requirement 6):

1. Embed the question with the **same** Embedding_Model used at indexing time,
   via :class:`ollama.client.OllamaClient` (Requirement 6.1).
2. Run KNN nearest-neighbour search against the Vector_Index
   (:class:`store.vector_index.VectorIndexStore`) (Requirement 6.2).
3. Cap the number of returned incidents at ``RETRIEVAL_MAX_K`` (Requirement 6.3).
4. Apply **role scoping** as a RediSearch pre-filter so a guard can never
   retrieve (or later cite) an incident outside their scope (Requirements 10.1,
   10.2):

   - ``ADMIN`` → no filter; all incidents are eligible (Requirement 10.1).
   - ``SECURITY_GUARD`` → only incidents in the guard's permitted zones
     (derived from that guard's shifts) **or** incidents directly assigned to
     the guard (Requirement 10.2).

5. When nothing matches, report *"no related incidents found"* rather than an
   empty, unexplained result (Requirement 6.4).

Design note — OR scoping for guards
------------------------------------
A guard's scope is the *union* of "incident is in one of my zones" and
"incident is assigned to me". Those are two different metadata fields
(``zone_id`` and ``assigned_guard_id``), and the Vector_Index filter helper
combines multiple fields with AND, not OR. To get the correct OR semantics
without changing the store, the Retriever issues one KNN query per scope branch
(zones, assignment), then merges the hits (keeping the closest score per
incident), re-sorts by distance, and caps the merged set at ``K``. Each branch
is itself a proper RediSearch pre-filter, so no out-of-scope incident is ever
returned.

The guard's permitted zones come from the incident-service shifts and are
supplied to the Retriever as an injected dependency/parameter — either passed
explicitly to :meth:`Retriever.retrieve` or produced by an injected
``zone_provider`` callable — keeping this module free of direct HTTP coupling
and easy to test.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional, Sequence, Union

from config.settings import Settings, get_settings
from ollama.client import OllamaClient
from store.vector_index import SearchHit, VectorIndexStore

logger = logging.getLogger(__name__)

# Platform role names (must match the Go services' role strings exactly).
ROLE_ADMIN = "ADMIN"
ROLE_SECURITY_GUARD = "SECURITY_GUARD"

# Message surfaced when no in-scope incident is related to the question
# (Requirement 6.4).
NO_RELATED_INCIDENTS_MESSAGE = "No related incidents were found."

# A provider that returns the permitted zone IDs for a guard. It may be sync or
# async; the Retriever awaits the result when it is awaitable. Injected as a
# dependency so the Retriever does not couple to the incident-service HTTP call.
ZoneProvider = Callable[[str], Union[Sequence[str], Awaitable[Sequence[str]]]]


@dataclass(frozen=True)
class RetrievalResult:
    """The outcome of a retrieval attempt.

    Attributes:
        hits: The in-scope, role-permitted nearest incidents, ordered by
            ascending vector distance (closest first) and capped at ``K``.
        found: ``True`` when at least one in-scope incident matched.
        message: A human-readable note. When ``found`` is ``False`` this is the
            "no related incidents found" message (Requirement 6.4); otherwise
            ``None``.
    """

    hits: list[SearchHit] = field(default_factory=list)
    found: bool = False
    message: Optional[str] = None

    @property
    def incident_ids(self) -> list[str]:
        """The incident IDs of the retrieved hits, in order."""

        return [hit.incident_id for hit in self.hits]


class Retriever:
    """Embeds a question, runs role-scoped KNN, and caps results at ``K``."""

    def __init__(
        self,
        ollama_client: OllamaClient,
        vector_store: VectorIndexStore,
        settings: Optional[Settings] = None,
        *,
        zone_provider: Optional[ZoneProvider] = None,
    ) -> None:
        """Create the Retriever.

        Args:
            ollama_client: Client used to embed the question with the same model
                used for indexing (Requirement 6.1).
            vector_store: The Vector_Index store used for KNN search.
            settings: Optional settings override (defaults to ``get_settings()``).
            zone_provider: Optional callable that returns a guard's permitted
                zone IDs given the guard's user id. Used only when permitted
                zones are not passed explicitly to :meth:`retrieve`. May be sync
                or async.
        """

        self._ollama = ollama_client
        self._store = vector_store
        self._settings = settings or get_settings()
        self._max_k = self._settings.retrieval_max_k
        self._zone_provider = zone_provider

    async def retrieve(
        self,
        question: str,
        *,
        role: str,
        user_id: Optional[str] = None,
        permitted_zone_ids: Optional[Sequence[str]] = None,
        doc_type: Optional[str] = "incident",
        k: Optional[int] = None,
    ) -> RetrievalResult:
        """Retrieve the incidents most related to ``question`` for a user.

        Args:
            question: The (already-rewritten, standalone) question to search for.
            role: The requesting user's role (``ADMIN`` or ``SECURITY_GUARD``).
            user_id: The requesting user's id. Required for guard scoping so
                incidents assigned to the guard are included, and used to look
                up permitted zones when ``permitted_zone_ids`` is not supplied.
            permitted_zone_ids: The guard's permitted zone IDs (from their
                shifts). When ``None`` and a ``zone_provider`` was injected, the
                provider is consulted with ``user_id``.
            doc_type: Restrict results to a document type (``"incident"`` by
                default; pass ``None`` to search incidents and alerts alike).
            k: Optional override for the maximum number of results. Values above
                the configured ``RETRIEVAL_MAX_K`` are clamped down so retrieval
                never exceeds the configured maximum (Requirement 6.3).

        Returns:
            A :class:`RetrievalResult`. When no in-scope incident matches,
            ``found`` is ``False`` and ``message`` is the "no related incidents
            found" note (Requirement 6.4).
        """

        effective_k = self._effective_k(k)
        if effective_k <= 0:
            return self._empty_result()

        query = (question or "").strip()
        if not query:
            return self._empty_result()

        # (6.1) Embed the question with the same model used for indexing.
        embedding = await self._ollama.embed(query)

        normalized_role = (role or "").strip().upper()

        if normalized_role == ROLE_ADMIN:
            # (10.1) ADMIN sees everything: a single unfiltered KNN.
            hits = self._search(embedding, effective_k, self._base_filters(doc_type))
        elif normalized_role == ROLE_SECURITY_GUARD:
            # (10.2) Guard sees only their zones' incidents or their assignments.
            hits = await self._retrieve_for_guard(
                embedding=embedding,
                k=effective_k,
                user_id=user_id,
                permitted_zone_ids=permitted_zone_ids,
                doc_type=doc_type,
            )
        else:
            # Unknown/unsupported role → retrieve nothing (fail closed).
            logger.warning("retrieval requested for unsupported role '%s'", role)
            hits = []

        if not hits:
            return self._empty_result()
        return RetrievalResult(hits=hits, found=True, message=None)

    # --- Guard scoping ---------------------------------------------------

    async def _retrieve_for_guard(
        self,
        *,
        embedding: list[float],
        k: int,
        user_id: Optional[str],
        permitted_zone_ids: Optional[Sequence[str]],
        doc_type: Optional[str],
    ) -> list[SearchHit]:
        """Run role-scoped KNN for a SECURITY_GUARD (zones OR assignment).

        Issues one KNN query filtered to the guard's permitted zones and one
        filtered to incidents assigned to the guard, then merges the two hit
        sets (closest score wins per incident), re-sorts by ascending distance,
        and caps the union at ``k``. Each branch is a proper pre-filter, so the
        merged result can only ever contain in-scope incidents.
        """

        zones = await self._resolve_permitted_zones(user_id, permitted_zone_ids)

        if not zones and not user_id:
            # A guard with neither permitted zones nor an id has no scope at all.
            return []

        merged: dict[str, SearchHit] = {}

        if zones:
            zone_filters = self._base_filters(doc_type)
            zone_filters["zone_id"] = list(zones)
            for hit in self._search(embedding, k, zone_filters):
                self._merge_hit(merged, hit)

        if user_id:
            assigned_filters = self._base_filters(doc_type)
            assigned_filters["assigned_guard_id"] = user_id
            for hit in self._search(embedding, k, assigned_filters):
                self._merge_hit(merged, hit)

        # Lower COSINE distance == closer; sort ascending and cap at k.
        ordered = sorted(merged.values(), key=lambda h: h.score)
        return ordered[:k]

    async def _resolve_permitted_zones(
        self,
        user_id: Optional[str],
        permitted_zone_ids: Optional[Sequence[str]],
    ) -> list[str]:
        """Return the guard's permitted zone IDs.

        Prefers an explicitly supplied list; otherwise consults the injected
        ``zone_provider`` (awaiting it when it is async). Returns an empty list
        when neither source yields zones.
        """

        if permitted_zone_ids is not None:
            return [z for z in permitted_zone_ids if z]

        if self._zone_provider is not None and user_id:
            try:
                result = self._zone_provider(user_id)
                if _is_awaitable(result):
                    result = await result  # type: ignore[assignment]
            except Exception as exc:  # noqa: BLE001 - scoping must fail closed
                logger.warning(
                    "zone provider failed for guard '%s'; scoping to assignments only: %s",
                    user_id,
                    exc,
                )
                return []
            return [z for z in (result or []) if z]

        return []

    # --- Helpers ---------------------------------------------------------

    def _effective_k(self, k: Optional[int]) -> int:
        """Return the effective result cap, never above ``RETRIEVAL_MAX_K``.

        Guarantees Property 11 (retrieval never returns more than the configured
        maximum): any caller-supplied ``k`` is clamped to ``[0, RETRIEVAL_MAX_K]``.
        """

        if k is None:
            return self._max_k
        return max(0, min(k, self._max_k))

    @staticmethod
    def _base_filters(doc_type: Optional[str]) -> dict[str, object]:
        """Build the base pre-filter dict, optionally constrained by doc type."""

        filters: dict[str, object] = {}
        if doc_type:
            filters["doc_type"] = doc_type
        return filters

    def _search(
        self,
        embedding: list[float],
        k: int,
        filters: dict[str, object],
    ) -> list[SearchHit]:
        """Run a single KNN query, tolerating an unavailable/empty index."""

        try:
            return self._store.knn_search(embedding, k, filters=filters or None)
        except Exception as exc:  # noqa: BLE001 - a search failure yields no hits
            logger.warning("vector KNN search failed: %s", exc)
            return []

    @staticmethod
    def _merge_hit(merged: dict[str, SearchHit], hit: SearchHit) -> None:
        """Insert ``hit`` into ``merged`` keeping the closest score per incident."""

        existing = merged.get(hit.incident_id)
        if existing is None or hit.score < existing.score:
            merged[hit.incident_id] = hit

    @staticmethod
    def _empty_result() -> RetrievalResult:
        """Return the standard "no related incidents found" result (Req 6.4)."""

        return RetrievalResult(hits=[], found=False, message=NO_RELATED_INCIDENTS_MESSAGE)


def _is_awaitable(value: object) -> bool:
    """Return whether ``value`` is awaitable (a coroutine/future/awaitable)."""

    import inspect

    return inspect.isawaitable(value)
