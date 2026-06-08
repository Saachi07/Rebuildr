"""Auth endpoints — thin wrappers over Supabase Auth.

The frontend talks to these endpoints, which in turn call Supabase Auth. We
could also have the frontend hit Supabase directly with the JS SDK; routing
through the backend keeps the surface area uniform and lets us layer
profile-side effects (e.g. seeding default cases) onto signup later.
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import anon_client, user_client

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _missing(*fields: str) -> tuple | None:
    data = request.get_json(silent=True) or {}
    for f in fields:
        if not data.get(f):
            return jsonify({"error": f"missing field: {f}"}), 400
    return None


@bp.post("/signup")
def signup():
    err = _missing("email", "password")
    if err:
        return err
    data = request.get_json()
    sb = anon_client()
    try:
        result = sb.auth.sign_up({
            "email": data["email"],
            "password": data["password"],
            "options": {
                "data": {"full_name": data.get("full_name", "")},
            },
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    user = result.user
    session = result.session
    return jsonify({
        "user": {"id": user.id, "email": user.email} if user else None,
        "session": {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "expires_in": session.expires_in,
        } if session else None,
    })


@bp.post("/login")
def login():
    err = _missing("email", "password")
    if err:
        return err
    data = request.get_json()
    sb = anon_client()
    try:
        result = sb.auth.sign_in_with_password({
            "email": data["email"],
            "password": data["password"],
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 401

    return jsonify({
        "user": {"id": result.user.id, "email": result.user.email},
        "session": {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "expires_in": result.session.expires_in,
        },
    })


@bp.post("/logout")
@require_auth
def logout():
    sb = user_client(g.access_token)
    try:
        sb.auth.sign_out()
    except Exception:
        pass
    return jsonify({"ok": True})


@bp.post("/refresh")
def refresh():
    err = _missing("refresh_token")
    if err:
        return err
    sb = anon_client()
    try:
        result = sb.auth.refresh_session(request.get_json()["refresh_token"])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 401
    return jsonify({
        "session": {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "expires_in": result.session.expires_in,
        },
    })


@bp.get("/me")
@require_auth
def me():
    sb = user_client(g.access_token)
    profile = sb.table("profiles").select("*").eq("id", g.user_id).maybe_single().execute()
    return jsonify({
        "id": g.user_id,
        "email": g.user_email,
        "profile": profile.data,
    })


@bp.patch("/me")
@require_auth
def update_me():
    data = request.get_json(silent=True) or {}
    allowed = {k: v for k, v in data.items() if k in {"full_name", "region", "language"}}
    if not allowed:
        return jsonify({"error": "no updatable fields provided"}), 400
    sb = user_client(g.access_token)
    res = sb.table("profiles").update(allowed).eq("id", g.user_id).execute()
    return jsonify({"profile": res.data[0] if res.data else None})
