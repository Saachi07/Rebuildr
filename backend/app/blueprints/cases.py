"""Recovery-case CRUD endpoints.

All access is gated by ``require_auth`` and goes through a per-user Supabase
client, so Postgres row-level security enforces ownership, the server-side
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
    "claim_stage",
    "checklist_state",
    "coverage_decisions",
}

# Where the insurance claim stands, in the order it usually progresses.
# Mirrored by the ClaimStage type in frontend/src/api.ts.
CLAIM_STAGES = (
    "not_started",
    "reported",
    "adjuster_assigned",
    "estimate_received",
    "settlement_offer",
    "payout",
    "closed",
    "denied",
)

STATUSES = {"draft", "active", "closed"}


def validate_claim_stage(value) -> bool:
    """Pure check so it is unit-testable without a request context."""
    return value in CLAIM_STAGES


def _validate_writable(row: dict) -> str | None:
    """Returns a user-facing error string, or None when the row is fine."""
    if "claim_stage" in row and row["claim_stage"] is not None:
        if not validate_claim_stage(row["claim_stage"]):
            return "claim_stage must be one of: " + ", ".join(CLAIM_STAGES)
    if "status" in row and row["status"] is not None:
        if row["status"] not in STATUSES:
            return "status must be one of: " + ", ".join(sorted(STATUSES))
    return None


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
    # A draft is the commit point for starting recovery: it is created before
    # the intake form so half-entered info autosaves into it. Name and type
    # are filled in as the user works, so we do not require them yet. Every
    # other create still needs both.
    is_draft = data.get("status") == "draft"
    if not is_draft and (not data.get("case_name") or not data.get("disaster_type")):
        return jsonify({"error": "case_name and disaster_type are required"}), 400

    row = {k: v for k, v in data.items() if k in WRITABLE}
    err = _validate_writable(row)
    if err:
        return jsonify({"error": err}), 400
    row["user_id"] = g.user_id
    row["derived_tags"] = sorted(derive_tags(row.get("intake_answers") or {}))
    # case_name and disaster_type are NOT NULL in the schema, but a draft is
    # created before the user has typed either (they autosave moments later,
    # and Continue writes the final values). Seed empty placeholders so the
    # very first draft insert doesn't trip the not-null constraint.
    if is_draft:
        row.setdefault("case_name", "")
        row.setdefault("disaster_type", "")

    sb = user_client(g.access_token)
    res = sb.table("recovery_cases").insert(row).execute()
    created = res.data[0] if res.data else None
    _sync_profile_location(sb, created)
    return jsonify({"case": created}), 201


# NOTE: this static route must be declared before the dynamic /<case_id>
# routes below, otherwise Flask would try to treat "deleted" as a case id.
@bp.get("/deleted")
@require_auth
def list_deleted_cases():
    """Cases deleted within the last 30 days, so an accidental delete is
    recoverable from the UI instead of being a support request."""
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    sb = user_client(g.access_token)
    res = (
        sb.table("recovery_cases")
        .select("*")
        .not_.is_("deleted_at", "null")
        .gte("deleted_at", cutoff)
        .order("deleted_at", desc=True)
        .execute()
    )
    return jsonify({"cases": res.data or []})


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
    err = _validate_writable(row)
    if err:
        return jsonify({"error": err}), 400
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


@bp.post("/<case_id>/restore")
@require_auth
def restore_case(case_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("recovery_cases")
        .update({"deleted_at": None})
        .eq("id", case_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"case": res.data[0]})


@bp.post("/<case_id>/close")
@require_auth
def close_case(case_id: str):
    """Mark a case finished. Closed cases stay readable (the records may
    matter for years) but stop cluttering the active list."""
    from datetime import datetime, timezone

    sb = user_client(g.access_token)
    res = (
        sb.table("recovery_cases")
        .update({"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", case_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"case": res.data[0]})


@bp.post("/<case_id>/reopen")
@require_auth
def reopen_case(case_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("recovery_cases")
        .update({"status": "active", "closed_at": None})
        .eq("id", case_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"case": res.data[0]})
