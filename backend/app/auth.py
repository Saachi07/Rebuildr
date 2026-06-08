"""Bearer-token auth helpers.

The frontend (or any API client) signs in against Supabase Auth and receives
an access token (a JWT). It then sends that token on every request as
``Authorization: Bearer <token>``. We verify the token's signature locally
with the project's JWT secret, pull the user's id and email out of the
claims, and stash them on ``flask.g`` for the duration of the request.

This avoids a network round-trip to Supabase on every call while still
giving us a verified user identity.
"""

from __future__ import annotations

from functools import wraps
from typing import Callable

import jwt
from flask import current_app, g, jsonify, request


def _extract_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.split(" ", 1)[1].strip() or None
    return None


def _verify(token: str) -> dict:
    secret = current_app.config["SUPABASE_JWT_SECRET"]
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not configured")
    # Supabase signs access tokens with HS256 and sets audience to "authenticated".
    return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")


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
