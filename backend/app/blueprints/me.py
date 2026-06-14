"""Profile + readiness endpoints, plus full data export and account
deletion.

Reads from / writes to the ``profiles`` row that gets auto-created on
signup (see migration 0001). Readiness is derived: it's not stored.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, g, json, jsonify, request

from ..auth import require_auth
from ..extensions import user_client

bp = Blueprint("me", __name__, url_prefix="/me")

WRITABLE = {"full_name", "location", "region", "language", "policy_reviewed_at"}


def is_recent(ts: str | None, days: int) -> bool:
    """Whether an ISO timestamp falls within the last `days` days. Pure so
    the readiness date math is unit-testable."""
    if not ts:
        return False
    try:
        parsed = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - parsed <= timedelta(days=days)


def build_export(
    *,
    profile: dict,
    cases: list,
    items: list,
    documents: list,
    communications: list,
    ale_expenses: list,
    recommendations: list,
) -> dict:
    """Assemble the full-export payload. Pure so it is unit-testable; the
    endpoint just feeds it query results."""
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "cases": cases,
        "items": items,
        "documents": documents,
        "communications": communications,
        "ale_expenses": ale_expenses,
        "recommendations": recommendations,
    }


def _readiness(sb, user_id: str) -> dict:
    """Tiny derived score for the progress bar. Eight checks. Cheap to
    compute on the fly, no caching needed yet."""
    checks: list[tuple[str, bool]] = []

    profile = (
        sb.table("profiles")
        .select("full_name, location, policy_reviewed_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    pdata = profile.data or {}
    checks.append(("profile_name", bool((pdata.get("full_name") or "").strip())))
    checks.append(("profile_location", bool((pdata.get("location") or "").strip())))
    # Having the right coverage at the right time is the top preventable
    # cause of denied or reduced claims, so an annual policy review counts
    # toward readiness.
    checks.append(("policy_reviewed_recently", is_recent(pdata.get("policy_reviewed_at"), 365)))

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
        .select("id, created_at")
        .execute()
    )
    item_rows = items.data or []
    checks.append(("has_inventory_item", len(item_rows) > 0))
    # Stale photo inventories slow down catastrophic-loss claims; an
    # adjuster can work much faster from photos under a year old.
    checks.append((
        "inventory_fresh",
        any(is_recent(i.get("created_at"), 365) for i in item_rows),
    ))

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
        .select("id, full_name, location, region, language, policy_reviewed_at, terms_accepted_at, terms_version")
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
    # The "I reviewed my policy" button sends the literal "now" so the
    # client clock can never backdate the review.
    if row.get("policy_reviewed_at") == "now":
        row["policy_reviewed_at"] = datetime.now(timezone.utc).isoformat()
    sb = user_client(g.access_token)
    res = sb.table("profiles").update(row).eq("id", g.user_id).execute()
    if not res.data:
        # First write: the trigger should have created the row, but be safe.
        row["id"] = g.user_id
        res = sb.table("profiles").insert(row).execute()
    return jsonify({"profile": res.data[0] if res.data else None, "readiness": _readiness(sb, g.user_id)})


@bp.get("/export")
@require_auth
def export_my_data():
    """Everything the user owns, as one JSON download. A user disputing a
    claim needs their records outside the app, on their own terms."""
    sb = user_client(g.access_token)

    def rows(table: str, order: str | None = None):
        q = sb.table(table).select("*").eq(
            "id" if table == "profiles" else "user_id", g.user_id
        )
        if order:
            q = q.order(order, desc=True)
        return q.execute().data or []

    profile_res = (
        sb.table("profiles").select("*").eq("id", g.user_id).maybe_single().execute()
    )
    payload = build_export(
        profile=profile_res.data or {"id": g.user_id},
        cases=rows("recovery_cases", "created_at"),
        items=rows("case_items"),
        documents=rows("user_documents", "created_at"),
        communications=rows("case_communications", "occurred_at"),
        ale_expenses=rows("ale_expenses", "created_at"),
        recommendations=rows("recommendations"),
    )
    return Response(
        json.dumps(payload, indent=2, default=str),
        mimetype="application/json",
        headers={"Content-Disposition": "attachment; filename=rebuildr-export.json"},
    )


@bp.delete("")
@require_auth
def delete_account():
    """Erase the account: every row, every stored file, then the login
    itself. Requires confirm: "DELETE" in the body so a stray client call
    cannot wipe someone's records."""
    data = request.get_json(silent=True) or {}
    if data.get("confirm") != "DELETE":
        return jsonify({"error": 'To delete your account, send {"confirm": "DELETE"}.'}), 400

    from ..extensions import service_client

    warnings: list[str] = []
    sb = user_client(g.access_token)
    svc = service_client()

    # Storage first, while the rows that reference the files still exist.
    for bucket in ("documents", "item-images"):
        try:
            listed = svc.storage.from_(bucket).list(g.user_id) or []
            paths = [f"{g.user_id}/{obj['name']}" for obj in listed if obj.get("name")]
            if paths:
                svc.storage.from_(bucket).remove(paths)
        except Exception:
            warnings.append(
                f"Some files in {bucket} could not be removed automatically; they are no longer reachable and will be cleaned up."
            )

    # Children before parents so foreign keys never block the wipe.
    for table in (
        "recommendations",
        "case_communications",
        "ale_expenses",
        "case_items",
        "user_documents",
        "recovery_cases",
    ):
        try:
            sb.table(table).delete().eq("user_id", g.user_id).execute()
        except Exception:
            warnings.append(f"Could not fully clear {table}.")
    try:
        sb.table("profiles").delete().eq("id", g.user_id).execute()
    except Exception:
        warnings.append("Could not fully clear profile.")

    # Finally the auth user, via the service role.
    try:
        svc.auth.admin.delete_user(g.user_id)
    except Exception:
        warnings.append(
            "Your data was removed but the login could not be deleted automatically. Contact support to finish."
        )

    out: dict = {"ok": True}
    if warnings:
        out["warnings"] = warnings
    return jsonify(out)
