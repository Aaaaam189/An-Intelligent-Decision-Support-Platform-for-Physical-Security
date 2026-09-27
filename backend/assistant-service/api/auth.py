"""JWT authentication dependency for the chat endpoint (Requirements 11.3, 11.5, 10.4).

This is the Python/FastAPI counterpart of the Go ``AuthMiddleware`` used by every
other service on the platform (see ``incident-service/middleware/auth_middleware.go``
and ``camera-service/middleware/auth_middleware.go``). It replicates the exact wire
contract so the same JWT issued by ``auth-service`` works unchanged here:

- Tokens are signed with **HS256** using the shared ``JWT_SECRET`` (from
  ``config/settings.py``), matching ``auth-service/utils/jwt.go``.
- The token is carried in the ``Authorization`` header using the ``Bearer`` scheme.
- Claims of interest are ``userId`` and ``role`` (the exact claim names the Go
  ``GenerateToken`` writes).

Any request that is missing the header, uses a non-``Bearer`` scheme, or presents a
malformed/invalid/expired/wrong-signature token is rejected with **401** *before* any
question processing happens (Req 11.5, 10.4). This mirrors the Go middleware, which
aborts with ``401`` for a missing/invalid header or an invalid/expired token.

Usage::

    @router.post("/chat")
    async def chat(principal: Principal = Depends(get_current_principal)):
        ...
"""

from __future__ import annotations

import logging
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)

# The signing algorithm shared with the Go services (auth-service/utils/jwt.go).
# Pinning to HS256 replicates the Go signing method and prevents algorithm-
# confusion attacks (e.g. a forged token claiming "none" or an RS256 header).
JWT_ALGORITHM = "HS256"

# The Bearer scheme prefix, matching the Go middleware's ``strings.HasPrefix``.
_BEARER_PREFIX = "Bearer "

# Error message reused for every rejection, matching the Go services'
# ``{"error": "invalid or expired token"}`` response body shape.
_UNAUTHORIZED_DETAIL = "invalid or expired token"


class Principal(BaseModel):
    """The authenticated caller extracted from a valid JWT.

    Mirrors the two values the Go middleware sets on the request context
    (``c.Set("userId", ...)`` and ``c.Set("role", ...)``): the user's id and
    role. Downstream role-scoping (Req 10.1/10.2) reads ``role`` to decide
    whether the caller is an ADMIN (all incidents) or a SECURITY_GUARD
    (restricted to their zones/assignments).
    """

    user_id: str
    role: str


def _unauthorized() -> HTTPException:
    """Build the standard 401 rejection (Req 11.5, 10.4).

    Includes the ``WWW-Authenticate: Bearer`` header per the HTTP spec for the
    Bearer scheme.
    """

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=_UNAUTHORIZED_DETAIL,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _extract_bearer_token(authorization: Optional[str]) -> str:
    """Return the raw token from an ``Authorization: Bearer <token>`` header.

    Rejects a missing header or a non-``Bearer`` scheme with 401, matching the
    Go middleware's ``authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ")``
    guard.
    """

    if not authorization or not authorization.startswith(_BEARER_PREFIX):
        raise _unauthorized()

    token = authorization[len(_BEARER_PREFIX):].strip()
    if not token:
        raise _unauthorized()
    return token


def _principal_from_claims(claims: dict) -> Principal:
    """Extract ``userId`` + ``role`` claims into a :class:`Principal`.

    A token that is validly signed but is missing either claim has no
    authenticated user for role scoping, so it is rejected with 401
    (Req 10.4).
    """

    user_id = claims.get("userId")
    role = claims.get("role")
    if not isinstance(user_id, str) or not user_id:
        raise _unauthorized()
    if not isinstance(role, str) or not role:
        raise _unauthorized()
    return Principal(user_id=user_id, role=role)


def get_current_principal(
    authorization: Optional[str] = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> Principal:
    """FastAPI dependency that authenticates the caller from the JWT.

    Replicates the Go ``AuthMiddleware`` (Req 11.3): extracts the ``Bearer``
    token, verifies its HS256 signature against the shared ``JWT_SECRET``, and
    returns the :class:`Principal` (``userId`` + ``role``). Any missing/invalid/
    expired token results in a 401 before the request is processed
    (Req 11.5, 10.4).
    """

    token = _extract_bearer_token(authorization)

    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
        )
    except jwt.PyJWTError as exc:
        # Covers expired signature, invalid signature, malformed token,
        # unexpected algorithm, etc. — all map to a single 401 (Req 11.5).
        logger.warning("JWT validation failed: %s", exc)
        raise _unauthorized() from exc

    return _principal_from_claims(claims)
