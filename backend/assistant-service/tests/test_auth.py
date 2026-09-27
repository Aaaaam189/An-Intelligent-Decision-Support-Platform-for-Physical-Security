"""Tests for the JWT auth dependency (api/auth.py).

Covers Requirements 11.3, 11.5, 10.4: replicate the Go ``AuthMiddleware``
(HS256 with the shared ``JWT_SECRET``, ``Bearer`` scheme, extract ``userId`` +
``role``) and reject missing/invalid/expired tokens with 401.
"""

from __future__ import annotations

import time

import jwt
import pytest
from fastapi import HTTPException

from api.auth import Principal, get_current_principal
from config.settings import get_settings

SECRET = get_settings().jwt_secret


def _make_token(claims: dict, *, secret: str = SECRET, algorithm: str = "HS256") -> str:
    return jwt.encode(claims, secret, algorithm=algorithm)


def _call(authorization):
    """Invoke the dependency with real settings, returning the Principal."""

    return get_current_principal(authorization=authorization, settings=get_settings())


# --- happy path ---------------------------------------------------------------


def test_valid_token_extracts_userid_and_role():
    token = _make_token(
        {"userId": "user-123", "role": "ADMIN", "exp": int(time.time()) + 3600}
    )
    principal = _call(f"Bearer {token}")
    assert isinstance(principal, Principal)
    assert principal.user_id == "user-123"
    assert principal.role == "ADMIN"


def test_valid_token_without_exp_is_accepted():
    # The Go GenerateToken always sets exp, but a token without exp is still a
    # validly signed token and should authenticate.
    token = _make_token({"userId": "u", "role": "SECURITY_GUARD"})
    principal = _call(f"Bearer {token}")
    assert principal.role == "SECURITY_GUARD"


# --- missing / malformed header (Req 11.5) ------------------------------------


def test_missing_header_rejected():
    with pytest.raises(HTTPException) as exc:
        _call(None)
    assert exc.value.status_code == 401


def test_non_bearer_scheme_rejected():
    token = _make_token({"userId": "u", "role": "ADMIN"})
    with pytest.raises(HTTPException) as exc:
        _call(f"Basic {token}")
    assert exc.value.status_code == 401


def test_bearer_with_empty_token_rejected():
    with pytest.raises(HTTPException) as exc:
        _call("Bearer ")
    assert exc.value.status_code == 401


# --- invalid / expired token (Req 11.5, 10.4) ---------------------------------


def test_expired_token_rejected():
    token = _make_token(
        {"userId": "u", "role": "ADMIN", "exp": int(time.time()) - 10}
    )
    with pytest.raises(HTTPException) as exc:
        _call(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_wrong_signature_rejected():
    token = _make_token(
        {"userId": "u", "role": "ADMIN"}, secret="a-different-secret"
    )
    with pytest.raises(HTTPException) as exc:
        _call(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_malformed_token_rejected():
    with pytest.raises(HTTPException) as exc:
        _call("Bearer not.a.jwt")
    assert exc.value.status_code == 401


def test_alg_none_token_rejected():
    # Algorithm-confusion: an unsigned "none" token must not be accepted.
    token = jwt.encode({"userId": "u", "role": "ADMIN"}, key=None, algorithm="none")
    with pytest.raises(HTTPException) as exc:
        _call(f"Bearer {token}")
    assert exc.value.status_code == 401


# --- missing claims (Req 10.4) ------------------------------------------------


def test_token_missing_userid_rejected():
    token = _make_token({"role": "ADMIN"})
    with pytest.raises(HTTPException) as exc:
        _call(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_token_missing_role_rejected():
    token = _make_token({"userId": "u"})
    with pytest.raises(HTTPException) as exc:
        _call(f"Bearer {token}")
    assert exc.value.status_code == 401
