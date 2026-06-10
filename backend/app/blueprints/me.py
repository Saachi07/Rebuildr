"""Profile + readiness endpoints.

Reads from / writes to the ``profiles`` row that gets auto-created on
signup (see migration 0001). Readiness is derived: it's not stored.
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import user_client

bp = Blueprint("me", __name__, url_prefix="/me")

WRITABLE = {"full_name", "location", "region"}


def _readiness(sb, user_id: str) -> dict:
    """Tiny derived score for the progress bar. Six checks, each worth
    ~17 points. Cheap to compute on the fly — no caching needed yet."""
    checks: list[tuple[str, bool]] = []

    profile = (
        sb.table("profiles")
        .select("full_name, location")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    pdata = profile.data or {}
    checks.append(("profile_name", bool((pdata.get("full_name") or "").strip())))
    checks.append(("profile_location", bool((pdata.get("location") or "").strip())))

    cases = (
        sb.table("recovery_cases")
        .select("id", count="exact")
        .is_("deleted_at", "null")
        .execute()
    )
    checks.append(("has_case", (cases.count or 0) > 0))

    docs = (
        sb.table("user_documents")
        .select("id, doc_type", count="exact")
        .is_("deleted_at", "null")
        .execute()
    )
    doc_rows = docs.data or []
    checks.append(("has_document", (docs.count or 0) > 0))
    checks.append((
        "has_policy_document",
        any((d.get("doc_type") or "").lower() in {"insurance_policy", "policy"} for d in doc_rows),
    ))

    items = (
        sb.table("case_items")
        .select("id", count="exact")
        .execute()
    )
    checks.append(("has_inventory_item", (items.count or 0) > 0))

    done = sum(1 for _, ok in checks if ok)
    total = len(checks)
    pct = round(100 * done / total) if total else 0
    return {
        "percent": pct,
        "completed": done,
        "total": total,
        "checks": [{"key": k, "done": v} for k, v in checks],
    }


@bp.get("")
@require_auth
def get_me():
    sb = user_client(g.access_token)
    res = (
        sb.table("profiles")
        .select("id, full_name, location, region, language, terms_accepted_at, terms_version")
        .eq("id", g.user_id)
        .maybe_single()
        .execute()
    )
    profile = res.data or {"id": g.user_id}
    return jsonify({"profile": profile, "readiness": _readiness(sb, g.user_id)})


@bp.patch("")
@require_auth
def update_me():
    data = request.get_json(silent=True) or {}
    row = {k: v for k, v in data.items() if k in WRITABLE}
    if not row:
        return jsonify({"error": "no updatable fields provided"}), 400
    sb = user_client(g.access_token)
    res = sb.table("profiles").update(row).eq("id", g.user_id).execute()
    if not res.data:
        # First write — the trigger should have created the row, but be safe.
        row["id"] = g.user_id
        res = sb.table("profiles").insert(row).execute()
    return jsonify({"profile": res.data[0] if res.data else None, "readiness": _readiness(sb, g.user_id)})
