"""Analytics client for exact, SQL-backed incident counts.

This module lets the assistant answer *aggregate / counting* questions
("how many critical incidents happened today?") with **exact** numbers taken
from the existing ``analytics-worker`` service rather than from the LLM
(Requirement 7.2). The analytics-worker keeps an ``IncidentStat`` table in
MariaDB and exposes SQL-backed aggregate endpoints; those numbers are
authoritative, so the assistant must never let the language model guess them.

Crucially, when analytics-worker is unavailable (down, timing out, or
returning an error), this client surfaces an explicit *"count unavailable"*
sentinel instead of a number (Requirement 7.5). The caller (the grounding /
answer layer) then tells the user the exact count could not be retrieved,
rather than estimating or fabricating a value.

Endpoints (matching the design's documented contract, called with the shared
internal-service key ``X-Internal-Service-Key``):

- ``GET /api/analytics/summary`` → aggregate totals grouped by priority,
  status and zone, plus average resolution time.
- ``GET /api/analytics/today``   → number of incidents created today.
- ``GET /api/analytics/alerts``  → list of stored critical-unassigned alerts.

The response JSON shapes mirror the analytics-worker Go handlers exactly
(``services.Summary``, ``{"incidentsToday": <int>}`` and a list of
``models.CriticalAlert``).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Generic, Optional, TypeVar

import httpx

from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Default timeout (seconds) for every analytics-worker call. Kept short so a
# slow or unresponsive analytics-worker degrades quickly to the "unavailable"
# sentinel instead of blocking the chat response.
_DEFAULT_TIMEOUT_SECONDS = 5.0

# Internal-service authentication header name, matching the Go
# ``internalauth.RequireInternalService`` / ``AttachInternalKey`` contract.
_INTERNAL_KEY_HEADER = "X-Internal-Service-Key"


# --- Response shapes (mirror the analytics-worker Go handlers) ---------------


@dataclass(frozen=True)
class AnalyticsSummary:
    """Mirror of ``services.Summary`` returned by ``GET /analytics/summary``."""

    total_incidents: int
    by_priority: dict[str, int] = field(default_factory=dict)
    by_status: dict[str, int] = field(default_factory=dict)
    by_zone: dict[str, int] = field(default_factory=dict)
    avg_resolution_seconds: Optional[float] = None

    @classmethod
    def from_json(cls, data: dict) -> "AnalyticsSummary":
        return cls(
            total_incidents=int(data.get("totalIncidents", 0) or 0),
            by_priority={k: int(v) for k, v in (data.get("byPriority") or {}).items()},
            by_status={k: int(v) for k, v in (data.get("byStatus") or {}).items()},
            by_zone={k: int(v) for k, v in (data.get("byZone") or {}).items()},
            avg_resolution_seconds=(
                float(data["avgResolutionSeconds"])
                if data.get("avgResolutionSeconds") is not None
                else None
            ),
        )


@dataclass(frozen=True)
class CriticalAlert:
    """Mirror of ``models.CriticalAlert`` returned by ``GET /analytics/alerts``."""

    id: str
    incident_id: str
    zone_id: str
    priority: str
    message: str
    created_at: str

    @classmethod
    def from_json(cls, data: dict) -> "CriticalAlert":
        return cls(
            id=str(data.get("id", "")),
            incident_id=str(data.get("incidentId", "")),
            zone_id=str(data.get("zoneId", "")),
            priority=str(data.get("priority", "")),
            message=str(data.get("message", "")),
            created_at=str(data.get("createdAt", "")),
        )


# --- Result wrapper with an explicit "unavailable" sentinel ------------------


@dataclass(frozen=True)
class AnalyticsResult(Generic[T]):
    """Either an available analytics value or an explicit "unavailable" marker.

    We deliberately model unavailability as data rather than raising, so the
    answer pipeline is *forced* to branch on it and report "the exact count
    could not be retrieved" instead of silently defaulting to a number
    (Requirement 7.5).
    """

    available: bool
    value: Optional[T] = None
    reason: Optional[str] = None

    @classmethod
    def ok(cls, value: T) -> "AnalyticsResult[T]":
        return cls(available=True, value=value, reason=None)

    @classmethod
    def unavailable(cls, reason: str) -> "AnalyticsResult[T]":
        return cls(available=False, value=None, reason=reason)

    def __bool__(self) -> bool:  # pragma: no cover - convenience only
        return self.available


# Human-readable message the answer layer can surface verbatim. Using a shared
# constant keeps the "never estimate" wording consistent across callers.
COUNT_UNAVAILABLE_MESSAGE = (
    "The exact count could not be retrieved from the analytics service."
)


class AnalyticsClient:
    """Thin async HTTP client over analytics-worker's aggregate endpoints.

    All calls attach the internal-service key and use a short timeout. Any
    transport error, timeout, non-2xx status, or unparseable body is converted
    into an ``AnalyticsResult.unavailable(...)`` so the caller never receives a
    fabricated number.
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        *,
        client: Optional[httpx.AsyncClient] = None,
        timeout: float = _DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._settings = settings or get_settings()
        self._base_url = self._settings.analytics_service_url.rstrip("/")
        self._internal_key = self._settings.internal_service_key
        self._timeout = timeout
        # An injected client (e.g. a test fake) is not owned/closed by us.
        self._client = client
        self._owns_client = client is None

    # -- lifecycle ----------------------------------------------------------

    async def aclose(self) -> None:
        """Close the underlying HTTP client if this instance created it."""
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "AnalyticsClient":
        return self

    async def __aexit__(self, *_exc) -> None:
        await self.aclose()

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    # -- internal request helper -------------------------------------------

    async def _get_json(self, path: str):
        """GET ``path`` from analytics-worker, returning parsed JSON.

        Raises on any failure; the public methods translate those into an
        unavailable sentinel. This separation keeps the "never estimate"
        policy in exactly one place per endpoint.
        """
        url = f"{self._base_url}{path}"
        client = self._get_client()
        response = await client.get(
            url,
            headers={_INTERNAL_KEY_HEADER: self._internal_key},
            timeout=self._timeout,
        )
        response.raise_for_status()
        return response.json()

    # -- public endpoints ---------------------------------------------------

    async def get_summary(self) -> AnalyticsResult[AnalyticsSummary]:
        """Return aggregate incident totals from ``GET /api/analytics/summary``.

        On any failure, returns an unavailable sentinel (Requirement 7.5).
        """
        try:
            data = await self._get_json("/api/analytics/summary")
            return AnalyticsResult.ok(AnalyticsSummary.from_json(data))
        except Exception as exc:  # noqa: BLE001 - all failures degrade to sentinel
            logger.warning("analytics summary unavailable: %s", exc)
            return AnalyticsResult.unavailable(COUNT_UNAVAILABLE_MESSAGE)

    async def get_today(self) -> AnalyticsResult[int]:
        """Return today's incident count from ``GET /api/analytics/today``.

        On any failure, returns an unavailable sentinel rather than a guessed
        number (Requirement 7.5).
        """
        try:
            data = await self._get_json("/api/analytics/today")
            count = int(data["incidentsToday"])
            return AnalyticsResult.ok(count)
        except Exception as exc:  # noqa: BLE001 - all failures degrade to sentinel
            logger.warning("analytics today count unavailable: %s", exc)
            return AnalyticsResult.unavailable(COUNT_UNAVAILABLE_MESSAGE)

    async def get_alerts(self) -> AnalyticsResult[list[CriticalAlert]]:
        """Return stored critical alerts from ``GET /api/analytics/alerts``.

        On any failure, returns an unavailable sentinel (Requirement 7.5).
        """
        try:
            data = await self._get_json("/api/analytics/alerts")
            rows = data if isinstance(data, list) else []
            alerts = [CriticalAlert.from_json(row) for row in rows]
            return AnalyticsResult.ok(alerts)
        except Exception as exc:  # noqa: BLE001 - all failures degrade to sentinel
            logger.warning("analytics alerts unavailable: %s", exc)
            return AnalyticsResult.unavailable(COUNT_UNAVAILABLE_MESSAGE)
