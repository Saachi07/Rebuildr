"""Bearer-token auth helpers.

The frontend (or any API client) signs in against Supabase Auth and receives
an access token (a JWT). It then sends that token on every request as
``Authorization: Bearer <token>``. We verify the token's signature locally
and stash the user's id and email on ``flask.g`` for the duration of the
request.

Supabase now signs access tokens with asymmetric keys (ES256/RS256) by
default, with HS256 (shared JWT secret) available as a legacy fallback. We
support both: for asymmetric algorithms we fetch the project's JWKS once and
cache the keys; for HS256 we fall back to ``SUPABASE_JWT_SECRET``.
"""

from __future__ import annotations

import threading
from functools import wraps
from typing import Callable

import jwt
from flask import current_app, g, jsonify, request
from jwt import PyJWKClient


_jwks_lock = threading.Lock()
_jwks_clients: dict[str, PyJWKClient] = {}


def _extract_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.split(" ", 1)[1].strip() or None
    return None


def _jwks_client_for(supabase_url: str) -> PyJWKClient:
    with _jwks_lock:
        client = _jwks_clients.get(supabase_url)
        if client is None:
            jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
            _jwks_clients[supabase_url] = client
        return client


def _verify(token: str) -> dict:
    # Inspect the token header to decide which path to take.
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "")

    if alg == "HS256":
        secret = current_app.config.get("SUPABASE_JWT_SECRET")
        if not secret:
            raise RuntimeError("SUPABASE_JWT_SECRET is not configured")
        return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")

    # Asymmetric, verify against the project's JWKS.
    supabase_url = current_app.config.get("SUPABASE_URL")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    signing_key = _jwks_client_for(supabase_url).get_signing_key_from_jwt(token).key
    return jwt.decode(token, signing_key, algorithms=[alg], audience="authenticated")


def require_auth(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "missing bearer token"}), 401
        try:
            claims = _verify(token)
        except jwt.PyJWTError as exc:
            return jsonify({"error": f"invalid token: {exc}"}), 401

        g.user_id = claims.get("sub")
        g.user_email = claims.get("email")
        g.access_token = token
        if not g.user_id:
            return jsonify({"error": "token missing sub claim"}), 401
        return fn(*args, **kwargs)

    return wrapper
