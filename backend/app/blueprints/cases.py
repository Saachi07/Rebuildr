"""Recovery-case CRUD endpoints.

All access is gated by ``require_auth`` and goes through a per-user Supabase
client, so Postgres row-level security enforces ownership — the server-side
``user_id`` filter below is belt-and-braces.
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import user_client
from ..services.tags import derive_tags

bp = Blueprint("cases", __name__, url_prefix="/cases")


WRITABLE = {
    "case_name",
    "disaster_type",
    "region",
    "location",
    "incident_date",
    "status",
    "intake_answers",
}


def _sync_profile_location(sb, case_row: dict | None) -> None:
    """A case is often the first place the user types where they live.
    Mirror its location/region into a blank profile so readiness, regional
    matching, and alerts all benefit. Existing profile values win; this
    never overwrites anything the user set themselves, and it never blocks
    the case write."""
    if not case_row:
        return
    try:
        loc = case_row.get("location")
        region = case_row.get("region")
        if not loc and not region:
            return
        prof = (
            sb.table("profiles")
            .select("location, region")
            .eq("id", g.user_id)
            .maybe_single()
            .execute()
        )
        existing = prof.data or {}
        patch = {}
        if loc and not existing.get("location"):
            patch["location"] = loc
        if region and not existing.get("region"):
            patch["region"] = region
        if patch:
            sb.table("profiles").update(patch).eq("id", g.user_id).execute()
    except Exception:
        pass


@bp.get("")
@require_auth
def list_cases():
    sb = user_client(g.access_token)
    res = (
        sb.table("recovery_cases")
        .select("*")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return jsonify({"cases": res.data or []})


@bp.post("")
@require_auth
def create_case():
    data = request.get_json(silent=True) or {}
    if not data.get("case_name") or not data.get("disaster_type"):
        return jsonify({"error": "case_name and disaster_type are required"}), 400

    row = {k: v for k, v in data.items() if k in WRITABLE}
    row["user_id"] = g.user_id
    row["derived_tags"] = sorted(derive_tags(row.get("intake_answers") or {}))

    sb = user_client(g.access_token)
    res = sb.table("recovery_cases").insert(row).execute()
    created = res.data[0] if res.data else None
    _sync_profile_location(sb, created)
    return jsonify({"case": created}), 201


@bp.get("/<case_id>")
@require_auth
def get_case(case_id: str):
    sb = user_client(g.access_token)
    res = sb.table("recovery_cases").select("*").eq("id", case_id).maybe_single().execute()
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"case": res.data})


@bp.patch("/<case_id>")
@require_auth
def update_case(case_id: str):
    data = request.get_json(silent=True) or {}
    row = {k: v for k, v in data.items() if k in WRITABLE}
    if not row:
        return jsonify({"error": "no updatable fields provided"}), 400
    if "intake_answers" in row:
        row["derived_tags"] = sorted(derive_tags(row["intake_answers"] or {}))

    sb = user_client(g.access_token)
    res = sb.table("recovery_cases").update(row).eq("id", case_id).execute()
    if not res.data:
        return jsonify({"error": "not found"}), 404
    _sync_profile_location(sb, res.data[0])
    return jsonify({"case": res.data[0]})


@bp.delete("/<case_id>")
@require_auth
def soft_delete_case(case_id: str):
    sb = user_client(g.access_token)
    from datetime import datetime, timezone
    res = (
        sb.table("recovery_cases")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", case_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})
