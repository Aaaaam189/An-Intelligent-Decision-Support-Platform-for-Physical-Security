"""Backfill Runner — index incidents that already existed before startup (Req 5).

When the assistant-service starts for the first time the Vector_Index is empty,
so the chat can only answer questions about incidents that arrive *after* launch.
The Backfill Runner fixes that by paging through the incidents already stored on
the platform and feeding each one through the same :class:`IndexingPipeline`
used by the live event consumer, so the chat can answer questions about history
from day one (Req 5.1).

Design (design.md §2 "Backfill Runner"):

- **Source of existing incidents:** ``GET /api/incidents`` on incident-service,
  called with the shared ``X-Internal-Service-Key`` header.
- **Concurrent:** runs as a background asyncio task so the event consumer keeps
  processing new events while the backfill is in progress (Req 5.2).
- **Idempotent:** each incident is fed through ``pipeline.index_incident`` which
  upserts one document keyed by ``incident:{id}``. Backfilling an incident that
  was also received live produces exactly one record (Req 1.5). To keep that
  guarantee, the backfill builds the **same** :class:`IncidentCreated` shape the
  live path uses, so the stored document (and its embedding) is byte-for-byte
  the same regardless of which path indexed it.
- **Resumable:** progress is checkpointed to the Redis key
  ``assistant:backfill:cursor`` after each page, so an interrupted run resumes
  from the last completed page on the next startup (Req 5.4). A terminal
  ``assistant:backfill:complete`` flag prevents the backfill from re-running
  once it has finished (Req 5.3).

Contract notes (see the module-level report returned to the orchestrator):

- incident-service's list endpoint (``GetAllIncidents``) returns the *entire*
  list as a flat JSON array ordered ``created_at DESC`` with **no** server-side
  pagination, so paging is done client-side over the returned list.
- The list response uses ``id`` (not ``incidentId``) for the incident ID, so it
  is remapped when building :class:`IncidentCreated`.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx
import redis

from config.settings import Settings, get_settings
from indexing.pipeline import IndexingPipeline
from models.events import IncidentCreated
from ollama.client import ModelUnavailableError

logger = logging.getLogger(__name__)

# Redis keys tracking backfill progress (design "Backfill state").
BACKFILL_COMPLETE_KEY = "assistant:backfill:complete"
BACKFILL_CURSOR_KEY = "assistant:backfill:cursor"

# Header carrying the shared internal-service secret (matches the Go services).
INTERNAL_KEY_HEADER = "X-Internal-Service-Key"

# Default number of incidents processed per checkpointed page. The source
# endpoint returns everything at once, so this only controls how often progress
# is checkpointed (and how much work is repeated after an interruption).
DEFAULT_PAGE_SIZE = 50

# Timeout for the (single) list request. Backfill is not latency-sensitive, so
# this is generous relative to the short timeouts used elsewhere.
DEFAULT_TIMEOUT_SECONDS = 30.0


def _to_incident_created(raw: dict[str, Any]) -> IncidentCreated:
    """Build an :class:`IncidentCreated` from an incident-service list row.

    The list endpoint's ``IncidentResponse`` uses ``id`` for the incident ID
    whereas the event contract uses ``incidentId``; every other field already
    matches the camelCase event aliases. We remap ``id`` -> ``incidentId`` and
    let the model ignore the extra fields (``riskScore``, ``ruleId``,
    ``shiftId``) it does not carry.

    Using the same ``IncidentCreated`` shape as the live consumer is what keeps
    backfill idempotent with live indexing (Req 1.5): the resulting stored
    document is identical no matter which path produced it.
    """

    payload = dict(raw)
    if "incidentId" not in payload and "id" in payload:
        payload["incidentId"] = payload["id"]
    return IncidentCreated.model_validate(payload)


class BackfillRunner:
    """Pages through existing incidents and indexes them, resumably.

    The runner owns its collaborators loosely: the :class:`IndexingPipeline` is
    shared with the live consumer, while the Redis client (for checkpoint keys)
    and the HTTP client (for the incident-service list call) are injectable so
    tests can supply in-memory fakes.
    """

    def __init__(
        self,
        pipeline: IndexingPipeline,
        *,
        settings: Optional[Settings] = None,
        redis_client: Optional["redis.Redis"] = None,
        http_client: Optional[httpx.AsyncClient] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._pipeline = pipeline
        self._settings = settings or get_settings()
        # A string-decoding client keeps the cursor/complete values easy to read.
        self._redis = redis_client or redis.Redis.from_url(
            self._settings.redis_url, decode_responses=True
        )
        self._owns_redis = redis_client is None
        self._http = http_client
        self._owns_http = http_client is None
        self._page_size = max(1, page_size)
        self._timeout = timeout

    # --- checkpoint helpers ------------------------------------------------

    def is_complete(self) -> bool:
        """Return ``True`` when the backfill has already finished (Req 5.3)."""

        return bool(self._redis.get(BACKFILL_COMPLETE_KEY))

    def _read_cursor(self) -> int:
        """Return the next page index to process (0 when never started)."""

        raw = self._redis.get(BACKFILL_CURSOR_KEY)
        if raw is None:
            return 0
        try:
            return max(0, int(raw))
        except (TypeError, ValueError):
            # A corrupt cursor should not wedge startup — restart from the top.
            logger.warning("Ignoring unparsable backfill cursor %r", raw)
            return 0

    def _write_cursor(self, page: int) -> None:
        """Persist the next page index to resume from (Req 5.4)."""

        self._redis.set(BACKFILL_CURSOR_KEY, str(page))

    def _mark_complete(self) -> None:
        """Set the terminal completion flag so the backfill never re-runs (Req 5.3)."""

        self._redis.set(BACKFILL_COMPLETE_KEY, "1")

    # --- source fetch ------------------------------------------------------

    def _get_http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=self._timeout)
        return self._http

    async def _fetch_incidents(self) -> list[dict[str, Any]]:
        """Fetch the full incident list from incident-service (Req 5.1).

        The endpoint returns a flat JSON array with no server-side pagination,
        so the whole list is retrieved once and paged client-side.
        """

        url = f"{self._settings.incident_service_url}/api/incidents"
        headers = {INTERNAL_KEY_HEADER: self._settings.internal_service_key}
        client = self._get_http()
        response = await client.get(url, headers=headers, timeout=self._timeout)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            logger.warning(
                "Backfill: unexpected incident list shape %s; expected a JSON array",
                type(data).__name__,
            )
            return []
        return [row for row in data if isinstance(row, dict)]

    # --- run ---------------------------------------------------------------

    async def run(self) -> int:
        """Run the backfill to completion (or until interrupted).

        Returns the number of incidents indexed during this invocation.

        Behaviour:

        - Skips entirely when the completion flag is set (Req 5.3).
        - Resumes from the checkpointed cursor, re-doing at most one page of
          already-indexed work — which is harmless because indexing is
          idempotent (Req 1.5, 5.4).
        - On a model-unavailable failure the run stops *without* marking
          complete, leaving the cursor in place so the next startup resumes and
          finishes the remaining incidents (Req 5.4). Other per-incident errors
          are logged and skipped so one bad incident cannot block the backfill.
        - Marks the backfill complete only after every incident has been
          processed (Req 5.3).
        """

        if self.is_complete():
            logger.info("Backfill already complete; skipping.")
            return 0

        try:
            incidents = await self._fetch_incidents()
        except Exception as exc:  # noqa: BLE001 - any fetch failure defers the run
            # Do not mark complete: the next startup will retry the whole run.
            logger.error("Backfill: failed to fetch existing incidents: %s", exc)
            return 0

        total = len(incidents)
        if total == 0:
            # Nothing to index — the backfill is trivially done (Req 5.3).
            logger.info("Backfill: no existing incidents found; marking complete.")
            self._mark_complete()
            return 0

        # Client-side paging: total pages ceil(total / page_size).
        total_pages = (total + self._page_size - 1) // self._page_size
        start_page = self._read_cursor()
        if start_page >= total_pages:
            # Cursor points past the end (e.g. the list shrank) — finish up.
            logger.info(
                "Backfill: cursor %d beyond %d page(s); marking complete.",
                start_page,
                total_pages,
            )
            self._mark_complete()
            return 0

        logger.info(
            "Backfill: indexing %d incident(s) across %d page(s), resuming at page %d.",
            total,
            total_pages,
            start_page,
        )

        indexed = 0
        for page in range(start_page, total_pages):
            begin = page * self._page_size
            end = min(begin + self._page_size, total)
            for raw in incidents[begin:end]:
                try:
                    event = _to_incident_created(raw)
                except Exception as exc:  # noqa: BLE001 - a malformed row is skipped
                    logger.warning(
                        "Backfill: skipping unparseable incident row (%s): %s",
                        type(exc).__name__,
                        exc,
                    )
                    continue

                try:
                    await self._pipeline.index_incident(event)
                    indexed += 1
                except ModelUnavailableError:
                    # Retryable: stop now, keep the cursor, resume next startup.
                    logger.warning(
                        "Backfill: embedding model unavailable at page %d; "
                        "pausing so it resumes on the next startup.",
                        page,
                    )
                    return indexed
                except Exception as exc:  # noqa: BLE001 - isolate one bad incident
                    logger.error(
                        "Backfill: failed to index incident %s (%s); continuing: %s",
                        event.incident_id,
                        type(exc).__name__,
                        exc,
                    )

            # Checkpoint AFTER a full page so a resume never skips work (Req 5.4).
            self._write_cursor(page + 1)

        self._mark_complete()
        logger.info("Backfill complete: indexed %d incident(s) this run.", indexed)
        return indexed

    # --- lifecycle ---------------------------------------------------------

    def start(self) -> "asyncio.Task[int]":
        """Launch :meth:`run` as a background asyncio task (Req 5.2).

        Returning the task lets the application await/cancel it on shutdown; the
        event consumer keeps running concurrently while the task is in flight.
        """

        return asyncio.create_task(self.run(), name="assistant-backfill")

    async def aclose(self) -> None:
        """Release owned clients (HTTP + Redis) if this runner created them."""

        if self._http is not None and self._owns_http:
            await self._http.aclose()
            self._http = None
        if self._owns_redis:
            try:
                self._redis.close()
            except Exception:  # noqa: BLE001 - close is best effort
                pass

    async def __aenter__(self) -> "BackfillRunner":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()
