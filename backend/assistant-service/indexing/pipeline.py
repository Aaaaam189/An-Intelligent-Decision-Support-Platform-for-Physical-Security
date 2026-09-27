"""Indexing Pipeline for the assistant-service write path (design section 5).

Orchestrates the four stages that turn an incident event into a searchable
Vector_Index document:

    resolve names  ->  build description  ->  embed  ->  store (upsert)

One incident always produces exactly one document keyed by ``incident:{id}``,
so processing the same incident again (live event, retry, or backfill) simply
overwrites the prior document — indexing is idempotent (Req 1.5, 4.2).

Event handling:

- ``incident.created`` (:meth:`IndexingPipeline.index_incident`) resolves the
  zone/camera/guard names, builds the Incident_Description, embeds it with the
  local Ollama embedding model, and upserts one document with all required
  metadata (Req 1.1, 1.2, 4.2, 12.2).
- ``incident.status_changed`` (:meth:`IndexingPipeline.apply_status_change`)
  applies the update over the already-stored document (the event carries no
  ``cameraId``/``type``), re-embeds the refreshed description, and upserts so
  the stored document reflects the latest status while keeping all required
  metadata (Req 1.2).
- ``alert.critical_unassigned`` (:meth:`IndexingPipeline.index_alert`) embeds
  the alert *message* and stores a **separate** alert document keyed by
  ``alert:{id}`` with its incident ID and zone ID (Req 4.3).

Failure policy (design "Error Handling"):

- If embedding fails because the model is **unavailable**
  (:class:`~ollama.client.ModelUnavailableError`), the error propagates so the
  consumer can requeue the event. Because the upsert only runs *after* a
  successful embedding, no partial record is ever written (Req 4.4,
  Property 17).
- For a CriticalAlert, if embedding the message fails for any reason **other
  than** model unavailability, the alert is skipped (logged, not stored) and
  processing continues without raising (Req 4.5, Property 18).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from indexing.description import build_description
from models.events import CriticalAlert, IncidentCreated, IncidentStatusChanged
from models.internal import ResolvedIncident, VectorDocument
from ollama.client import ModelUnavailableError, OllamaClient
from resolver.name_resolver import NameResolver
from store.vector_index import VectorIndexStore

logger = logging.getLogger(__name__)

# Key suffix prefix for a CriticalAlert document. Stored under
# ``incident:alert:{id}`` (still inside the index prefix) so it is a distinct
# document from the incident's own ``incident:{id}`` record (Req 4.3).
_ALERT_KEY = "alert:{incident_id}"


def _to_unix_seconds(value: Optional[datetime]) -> Optional[int]:
    """Convert a datetime to unix seconds (NUMERIC field), or ``None``.

    Naive datetimes are assumed to be UTC so the stored ``created_at`` is
    stable regardless of the publisher's timezone handling.
    """

    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp())


class IndexingPipeline:
    """Resolve -> describe -> embed -> store, for one incident or alert.

    The pipeline is stateless between calls; all persistent state lives in the
    Vector_Index. It holds references to the collaborators it orchestrates so
    the consumer and backfill runner can share a single configured instance.
    """

    def __init__(
        self,
        resolver: NameResolver,
        ollama: OllamaClient,
        store: VectorIndexStore,
    ) -> None:
        self._resolver = resolver
        self._ollama = ollama
        self._store = store

    # ------------------------------------------------------------------
    # incident.created
    # ------------------------------------------------------------------
    async def index_incident(self, event: IncidentCreated) -> str:
        """Index a newly created incident (Req 1.1, 1.2, 4.2, 12.2).

        Returns the Redis key of the upserted document.

        Raises:
            ModelUnavailableError: The embedding model is unavailable; nothing
                is written so the caller can requeue and retry (Req 4.4).
        """

        resolved = await self._resolve_incident(
            incident_id=event.incident_id,
            camera_id=event.camera_id,
            zone_id=event.zone_id,
            type_=event.type,
            priority=event.priority,
            status=event.status,
            assigned_guard_id=event.assigned_guard_id,
            created_at=event.created_at,
            closed_at=event.closed_at,
        )
        return await self._embed_and_store(resolved)

    # ------------------------------------------------------------------
    # incident.status_changed
    # ------------------------------------------------------------------
    async def apply_status_change(self, event: IncidentStatusChanged) -> str:
        """Apply a status-changed update so the stored doc reflects the latest
        status while preserving all required metadata (Req 1.2).

        The event omits ``cameraId`` and ``type``, so those are recovered from
        the already-stored document when present; the refreshed description is
        re-embedded and upserted under the same ``incident:{id}`` key, keeping
        exactly one record per incident (Req 1.5).

        Raises:
            ModelUnavailableError: The embedding model is unavailable; the
                existing document is left untouched (no partial write, Req 4.4).
        """

        existing = self._store.get(event.incident_id) or {}

        # ``cameraId``/``type`` are not part of a status_changed payload — carry
        # them forward from the previously stored document (Req 1.2 metadata
        # completeness). ``camera_id`` falls back to the zone id only as a last
        # resort so resolution still has something to work with.
        camera_id = existing.get("camera_id") or event.zone_id
        type_ = existing.get("type") or "INCIDENT"

        resolved = await self._resolve_incident(
            incident_id=event.incident_id,
            camera_id=camera_id,
            zone_id=event.zone_id,
            type_=type_,
            priority=event.priority,
            status=event.status,
            assigned_guard_id=event.assigned_guard_id,
            created_at=event.created_at,
            closed_at=event.closed_at,
        )
        return await self._embed_and_store(resolved)

    # ------------------------------------------------------------------
    # alert.critical_unassigned
    # ------------------------------------------------------------------
    async def index_alert(self, event: CriticalAlert) -> Optional[str]:
        """Index a CriticalAlert message as a separate alert document (Req 4.3).

        Returns the Redis key of the stored alert document, or ``None`` when the
        alert was skipped because embedding failed for a non-availability
        reason (Req 4.5, Property 18).

        Raises:
            ModelUnavailableError: The embedding model is unavailable; the alert
                is not stored and the caller can requeue (Req 4.4).
        """

        try:
            embedding = await self._ollama.embed(event.message)
        except ModelUnavailableError:
            # Retryable: let the consumer requeue this event (Req 4.4).
            raise
        except Exception as exc:  # noqa: BLE001 — non-availability failure
            # Skip and continue without storing (Req 4.5, Property 18).
            logger.warning(
                "Skipping CriticalAlert for incident %s: embedding failed (%s: %s)",
                event.incident_id,
                type(exc).__name__,
                exc,
            )
            return None

        document = VectorDocument(
            incident_id=event.incident_id,
            doc_type="alert",
            zone_id=event.zone_id,
            priority=event.priority,
            description=event.message,
            embedding=embedding,
        )
        key = self._store.upsert(
            event.incident_id,
            document.model_dump(),
            doc_key=_ALERT_KEY.format(incident_id=event.incident_id),
        )
        logger.info("Indexed CriticalAlert document %s", key)
        return key

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    async def _resolve_incident(
        self,
        *,
        incident_id: str,
        camera_id: str,
        zone_id: str,
        type_: str,
        priority: str,
        status: str,
        assigned_guard_id: Optional[str],
        created_at: Optional[datetime],
        closed_at: Optional[datetime],
    ) -> ResolvedIncident:
        """Resolve zone/camera/guard UUIDs to names (Req 2.1-2.5).

        Resolution never raises: the resolver falls back to the raw UUID on any
        failure, so indexing always proceeds (Req 2.5).
        """

        zone_name = await self._resolver.resolve_zone(zone_id)
        camera_name = await self._resolver.resolve_camera(camera_id)

        guard_name: Optional[str] = None
        if assigned_guard_id:
            guard_name = await self._resolver.resolve_guard(assigned_guard_id)

        return ResolvedIncident(
            incident_id=incident_id,
            camera_id=camera_id,
            zone_id=zone_id,
            type=type_,
            priority=priority,
            status=status,
            zone_name=zone_name,
            camera_name=camera_name,
            assigned_guard_id=assigned_guard_id,
            assigned_guard_name=guard_name,
            created_at=created_at,
            closed_at=closed_at,
        )

    async def _embed_and_store(self, resolved: ResolvedIncident) -> str:
        """Build the description, embed it, and upsert one incident document.

        The embedding is generated *before* the upsert, so if the embedding
        model is unavailable the exception propagates and no partial document is
        written (Req 4.4, Property 17).
        """

        description = build_description(resolved)

        # A ModelUnavailableError here propagates to the caller (retryable);
        # nothing has been written yet, so no partial record can exist.
        embedding = await self._ollama.embed(description)

        document = VectorDocument(
            incident_id=resolved.incident_id,
            doc_type="incident",
            zone_id=resolved.zone_id,
            camera_id=resolved.camera_id,
            type=resolved.type,
            priority=resolved.priority,
            status=resolved.status,
            assigned_guard_id=resolved.assigned_guard_id,
            created_at=_to_unix_seconds(resolved.created_at),
            description=description,
            embedding=embedding,
        )
        key = self._store.upsert(resolved.incident_id, document.model_dump())
        logger.info(
            "Indexed incident %s (status=%s) at %s",
            resolved.incident_id,
            resolved.status,
            key,
        )
        return key
