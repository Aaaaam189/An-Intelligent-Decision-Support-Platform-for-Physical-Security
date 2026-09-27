"""Name Resolver — turns UUID codes into human names (Requirement 2).

During indexing, incidents carry UUID codes for their zone, camera, and
assigned guard. To build a human-readable Incident_Description (Requirement 3)
the assistant needs the real names behind those codes. This module resolves
them by calling the existing platform services, attaching the shared
``X-Internal-Service-Key`` header that authenticates service-to-service calls
(the client-side counterpart of the Go ``internalauth.RequireInternalService``
middleware).

Resolution is *best effort*: on any failure — timeout, 404, non-2xx, malformed
body — the resolver returns the original UUID string as a fallback and never
raises, so a missing supporting service can never abort indexing of an incident
(Requirement 2.5).

A short-lived in-memory LRU + TTL cache avoids re-resolving the same zone,
camera, or guard repeatedly during backfill, where the same handful of zones
and cameras recur across thousands of incidents.

Upstream endpoints and response shapes (confirmed against the Go services):

| Method            | Call                                    | Name field  | Req |
| ----------------- | --------------------------------------- | ----------- | --- |
| ``resolve_zone``   | ``GET {camera}/api/zones/{id}``         | ``name``     | 2.1 |
| ``resolve_camera`` | ``GET {camera}/api/cameras/{id}``       | ``name``     | 2.2 |
| ``resolve_guard``  | ``GET {auth}/api/auth/users/{id}``      | ``fullName`` | 2.3 |
"""

from __future__ import annotations

import logging
import time
from collections import OrderedDict
from typing import Optional

import httpx

from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)

# Header name for the shared internal-service secret (matches the Go services).
INTERNAL_KEY_HEADER = "X-Internal-Service-Key"

# Default timeout for a single upstream call. Kept short so a slow/absent
# supporting service degrades quickly to the UUID fallback rather than stalling
# the indexing pipeline.
DEFAULT_TIMEOUT_SECONDS = 5.0

# Cache tuning: short-lived so renamed zones/cameras/guards are picked up soon,
# but long enough to cover a backfill run without re-resolving the same code.
DEFAULT_CACHE_MAXSIZE = 512
DEFAULT_CACHE_TTL_SECONDS = 300.0


class _TTLCache:
    """A tiny LRU + TTL cache for resolved names.

    Entries expire after ``ttl`` seconds and the cache evicts the
    least-recently-used entry once it exceeds ``maxsize``. Keys are namespaced
    by kind (``"zone"``/``"camera"``/``"guard"``) so identical UUIDs across
    different kinds never collide.
    """

    def __init__(self, maxsize: int = DEFAULT_CACHE_MAXSIZE, ttl: float = DEFAULT_CACHE_TTL_SECONDS) -> None:
        self._maxsize = maxsize
        self._ttl = ttl
        # key -> (expires_at, value)
        self._store: "OrderedDict[str, tuple[float, str]]" = OrderedDict()

    def get(self, key: str) -> Optional[str]:
        """Return the cached value for ``key`` or ``None`` if absent/expired."""

        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            # Expired — drop it and report a miss.
            self._store.pop(key, None)
            return None
        # Mark as most-recently-used.
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: str) -> None:
        """Store ``value`` under ``key`` and enforce the size bound."""

        self._store[key] = (time.monotonic() + self._ttl, value)
        self._store.move_to_end(key)
        while len(self._store) > self._maxsize:
            # Evict the least-recently-used entry.
            self._store.popitem(last=False)

    def clear(self) -> None:
        self._store.clear()


class NameResolver:
    """Resolves zone/camera/guard UUIDs to human names via platform services.

    The resolver owns an ``httpx.AsyncClient`` for connection reuse across the
    many calls made during backfill. Callers should ``await close()`` when done
    (or use it as an async context manager).
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.AsyncClient] = None,
        *,
        cache_maxsize: int = DEFAULT_CACHE_MAXSIZE,
        cache_ttl: float = DEFAULT_CACHE_TTL_SECONDS,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._settings = settings or get_settings()
        # Allow an injected client (used by tests with a fake transport);
        # otherwise create one with the default timeout.
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._owns_client = client is None
        self._cache = _TTLCache(maxsize=cache_maxsize, ttl=cache_ttl)

    async def __aenter__(self) -> "NameResolver":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP client if this resolver created it."""

        if self._owns_client:
            await self._client.aclose()

    # --- public resolution methods -------------------------------------------------

    async def resolve_zone(self, zone_id: str) -> str:
        """Return the zone name for ``zone_id`` (Req 2.1), or the UUID on failure."""

        return await self._resolve(
            kind="zone",
            code=zone_id,
            url=f"{self._settings.camera_service_url}/api/zones/{zone_id}",
            name_field="name",
        )

    async def resolve_camera(self, camera_id: str) -> str:
        """Return the camera name for ``camera_id`` (Req 2.2), or the UUID on failure."""

        return await self._resolve(
            kind="camera",
            code=camera_id,
            url=f"{self._settings.camera_service_url}/api/cameras/{camera_id}",
            name_field="name",
        )

    async def resolve_guard(self, guard_id: str) -> str:
        """Return the guard's full name for ``guard_id`` (Req 2.3), or the UUID on failure."""

        return await self._resolve(
            kind="guard",
            code=guard_id,
            url=f"{self._settings.auth_service_url}/api/auth/users/{guard_id}",
            name_field="fullName",
        )

    # --- internals -----------------------------------------------------------------

    async def _resolve(self, *, kind: str, code: Optional[str], url: str, name_field: str) -> str:
        """Resolve one code to a name, applying caching and UUID fallback.

        Any failure path returns the original ``code`` unchanged so indexing can
        proceed (Req 2.5). ``None``/empty codes return an empty string.
        """

        if not code:
            return code or ""

        cache_key = f"{kind}:{code}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        name = await self._fetch_name(url=url, name_field=name_field, fallback=code)
        # Only cache successful resolutions (where we got a real, different name).
        # Caching the fallback would pin a transient failure for the whole TTL.
        if name != code:
            self._cache.set(cache_key, name)
        return name

    async def _fetch_name(self, *, url: str, name_field: str, fallback: str) -> str:
        """Perform the HTTP GET and extract ``name_field``; fall back on any error."""

        headers = {INTERNAL_KEY_HEADER: self._settings.internal_service_key}
        try:
            response = await self._client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            # Timeouts, connection errors, etc. — degrade to the UUID (Req 2.5).
            logger.warning("Name resolution request failed for %s: %s", url, exc)
            return fallback

        if response.status_code < 200 or response.status_code >= 300:
            # 404 (not found), 401 (auth), 5xx, etc. — degrade to the UUID (Req 2.5).
            logger.warning("Name resolution for %s returned status %d", url, response.status_code)
            return fallback

        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning("Name resolution for %s returned invalid JSON: %s", url, exc)
            return fallback

        name = payload.get(name_field) if isinstance(payload, dict) else None
        if not isinstance(name, str) or not name.strip():
            # Missing or blank name field — treat as unresolved (Req 2.5).
            logger.warning("Name resolution for %s missing '%s' field", url, name_field)
            return fallback

        return name
