"""Recommendation endpoints, drives the content-based filter.

GET  /cases/<case_id>/recommendations  → run the filter and return groups
POST /cases/<case_id>/recommendations  → run + persist into ``recommendations``
PATCH /recommendations/<rec_id>        → mark saved / dismissed / done

The filter is fed by three sources, all already persisted (no Gemini call
in this request path):

* the case row itself (disaster type, region, intake-derived tags),
* the image-classification pipeline, ``case_items`` rows created from
  ``POST /ml/analyze-photo`` results, folded into damage-severity tags via
  ``services.signals.inventory_signals_from_items``,
* the document pipeline, ``user_documents.gemini_analysis`` rows from
  ``POST /documents/<id>/analyze``, folded into insurer / deadline / denial
  signals via ``services.signals.document_signals_from_documents``.

Persisted statuses (saved / dismissed / done) are loaded on every run and
fed back into scoring, and the POST upsert preserves them instead of
resetting rows to "suggested". Impressions and status changes are logged so
the hand-tuned weights can eventually be replaced by a learned ranker.
"""

from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from ..auth import require_auth
from ..extensions import service_client, user_client
from ..services.content_filter import personalize_hints, recommend
from ..services.program_scraper import scrape_programs_for_case
from ..services.signals import (
    document_signals_from_documents,
    inventory_signals_from_items,
)

bp = Blueprint("recommendations", __name__)

# Recovery-phase ordering for the UI: safety first, rebuilding later.
# Types missing from this list sort after, alphabetically.
_CATEGORY_ORDER = [
    "shelter", "health", "documents", "insurance", "policy",
    "financial", "legal", "rebuild",
]


class _Context:
    __slots__ = ("case", "items", "resources", "sb",
                 "inventory", "documents", "documents_rows", "statuses", "rec_ids")

    def __init__(self, case, items, resources, sb,
                 inventory, documents, documents_rows, statuses, rec_ids):
        self.case = case
        self.items = items
        self.resources = resources
        self.sb = sb
        self.inventory = inventory
        self.documents = documents
        self.documents_rows = documents_rows  # raw document rows for readiness
        self.statuses = statuses      # resource_id -> status
        self.rec_ids = rec_ids        # resource_id -> recommendations row id


def _load_documents_signals(sb):
    """Fetch the caller's analyzed documents (RLS scopes to the user) and
    fold them into one DocumentSignals. Soft-fails to None, a broken
    documents table should never take recommendations down."""
    try:
        res = (
            sb.table("user_documents")
            .select("name, doc_type, gemini_analysis")
            .is_("deleted_at", "null")
            .not_.is_("gemini_analysis", "null")
            .execute()
        )
    except Exception:
        return None
    return document_signals_from_documents(res.data or [])


def _load_document_rows(sb):
    """Fetch raw document rows (all docs, not just analyzed) for readiness
    checking. Soft-fails to empty list."""
    try:
        res = (
            sb.table("user_documents")
            .select("id, doc_type")
            .is_("deleted_at", "null")
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def _load_profile(sb):
    """Caller's profile row, region/location fallback when the case doesn't
    carry them. Soft-fails to an empty dict."""
    try:
        res = (
            sb.table("profiles")
            .select("region, location")
            .eq("id", g.user_id)
            .maybe_single()
            .execute()
        )
        return res.data or {}
    except Exception:
        return {}


def _load_context(case_id: str):
    sb = user_client(g.access_token)
    case = sb.table("recovery_cases").select("*").eq("id", case_id).maybe_single().execute()
    if not case.data:
        return None, (jsonify({"error": "case not found"}), 404)

    # Demographic fallback: a case without a region inherits the user's
    # profile region so regional aid programs still surface.
    profile = _load_profile(sb)
    if not case.data.get("region") and profile.get("region"):
        case.data["region"] = profile["region"]
    if not case.data.get("location") and profile.get("location"):
        case.data["location"] = profile["location"]

    items = sb.table("case_items").select("*").eq("case_id", case_id).execute()
    resources = sb.table("resources").select("*").execute()
    persisted = (
        sb.table("recommendations")
        .select("id, resource_id, status")
        .eq("case_id", case_id)
        .execute()
    )
    statuses = {row["resource_id"]: row.get("status") or "suggested"
                for row in (persisted.data or [])}
    rec_ids = {row["resource_id"]: row["id"] for row in (persisted.data or [])}

    item_rows = items.data or []
    ctx = _Context(
        case.data,
        item_rows,
        resources.data or [],
        sb,
        inventory=inventory_signals_from_items(item_rows),
        documents=_load_documents_signals(sb),
        documents_rows=_load_document_rows(sb),
        statuses=statuses,
        rec_ids=rec_ids,
    )
    return ctx, None


def _run(ctx: _Context, top_k: int):
    return recommend(
        ctx.case,
        ctx.items,
        ctx.resources,
        top_k_per_category=top_k,
        inventory=ctx.inventory,
        documents=ctx.documents,
        statuses=ctx.statuses,
    )


def _ordered_categories(grouped) -> list[str]:
    known = {t: i for i, t in enumerate(_CATEGORY_ORDER)}
    return sorted(
        grouped.keys(),
        key=lambda t: (known.get(t, len(_CATEGORY_ORDER)), t),
    )


def _case_readiness(case, items, documents_rows, grouped) -> dict:
    """Compute case readiness across 5 equally-weighted dimensions (20% each).
    
    Returns:
    {
        "percent": 0-100,
        "completed": 0-5,
        "total": 5,
        "checks": [
            {"key": "...", "label": "...", "done": bool},
            ...
        ]
    }
    """
    checks = []

    # 1. Insurance document uploaded
    has_insurance = any(
        (d.get("doc_type") or "").lower() in {"insurance_policy", "policy"}
        for d in documents_rows
    )
    checks.append({
        "key": "insurance_document",
        "label": "Insurance policy uploaded",
        "done": has_insurance,
    })

    # 2. Home inventory exists
    has_inventory = len(items) > 0
    checks.append({
        "key": "inventory_exists",
        "label": "Home inventory completed",
        "done": has_inventory,
    })

    # 3. Optional intake questions answered
    intake_answered = bool(case.get("intake_answers"))
    checks.append({
        "key": "intake_answered",
        "label": "Optional questions answered",
        "done": intake_answered,
    })

    # 4. Basic case information complete (disaster type + region or location)
    has_type = bool(case.get("disaster_type"))
    has_location = bool(case.get("region") or case.get("location"))
    case_info_complete = has_type and has_location
    checks.append({
        "key": "case_info_complete",
        "label": "Case information complete",
        "done": case_info_complete,
    })

    # 5. Recovery plan generated (at least one recommendation exists)
    has_recommendations = bool(grouped and any(grouped.values()))
    checks.append({
        "key": "recommendations_generated",
        "label": "Recovery plan generated",
        "done": has_recommendations,
    })

    completed = sum(1 for c in checks if c["done"])
    total = len(checks)
    percent = round((completed / total) * 100) if total else 0

    return {
        "percent": percent,
        "completed": completed,
        "total": total,
        "checks": checks,
    }


def _response_payload(case_id: str, ctx: _Context, grouped) -> dict:
    """Shape the filter output for the frontend's RecommendResponse type:
    per-category groups (in recovery-phase order), a single top pick, a
    deadline radar, notes for categories that came back empty, and hints
    about what sharing more would unlock."""
    all_recs = [rec for recs in grouped.values() for rec in recs]
    for rec in all_recs:
        rec.rec_id = ctx.rec_ids.get(rec.resource["id"])

    # Top pick should be something still worth doing: never a resource the
    # user already finished or asked us to hide.
    actionable = [r for r in all_recs if r.status not in {"done", "dismissed"}]
    top_pick = max(actionable, key=lambda r: r.score, default=None)
    radar = sorted(
        (r for r in actionable
         if r.days_until_deadline is not None and r.days_until_deadline <= 60),
        key=lambda r: r.days_until_deadline,
    )[:5]

    by_category = {
        t: [r.to_dict() for r in grouped[t]]
        for t in _ordered_categories(grouped)
    }

    # A short, ordered to-do list: deadline-bound steps first (soonest at
    # the top), then the strongest remaining matches. The UI renders this
    # as a checklist wired to the same status endpoint.
    todo = sorted(
        actionable,
        key=lambda r: (
            r.days_until_deadline is None,
            r.days_until_deadline if r.days_until_deadline is not None else 0,
            -r.score,
        ),
    )[:8]

    # Categories that exist in the catalog but matched nothing, so the UI
    # can say why a section is missing instead of silently omitting it.
    catalog_types = {r.get("type") for r in ctx.resources if r.get("type")}
    empty_categories = sorted(catalog_types - set(grouped.keys()))

    # Impression telemetry: what was shown, at what score and rank. The
    # raw material for replacing hand-tuned weights with a learned ranker.
    current_app.logger.info(
        "rec_impressions case=%s shown=%s categories=%s top_pick=%s",
        case_id,
        len(all_recs),
        list(by_category.keys()),
        top_pick.resource["id"] if top_pick else None,
    )

    return {
        "case_id": case_id,
        "by_category": by_category,
        # Older clients read `groups`; same content, cheap to keep.
        "groups": by_category,
        "top_pick": top_pick.to_dict() if top_pick else None,
        "deadline_radar": [r.to_dict() for r in radar],
        "todo": [r.to_dict() for r in todo],
        "empty_categories": empty_categories,
        "personalize_more": personalize_hints(
            ctx.case, ctx.items, ctx.resources, ctx.inventory, ctx.documents,
        ),
        "readiness": _case_readiness(ctx.case, ctx.items, ctx.documents_rows, grouped),
    }


@bp.get("/cases/<case_id>/recommendations")
@require_auth
def get_recommendations(case_id: str):
    ctx, err = _load_context(case_id)
    if err:
        return err
    top_k = int(request.args.get("top_k", 5))
    grouped = _run(ctx, top_k)
    return jsonify(_response_payload(case_id, ctx, grouped))


@bp.post("/cases/<case_id>/recommendations")
@require_auth
def materialize_recommendations(case_id: str):
    ctx, err = _load_context(case_id)
    if err:
        return err
    top_k = int((request.get_json(silent=True) or {}).get("top_k", 5))
    grouped = _run(ctx, top_k)

    rows = []
    for recs in grouped.values():
        for rec in recs:
            rows.append({
                "case_id": case_id,
                "resource_id": rec.resource["id"],
                "score": float(rec.score),
                "reasons": rec.reasons,
                "rank": rec.rank,
                # Preserve the user's saved/dismissed/done choices; only
                # rows we've never seen start as "suggested".
                "status": ctx.statuses.get(rec.resource["id"], "suggested"),
            })
    if rows:
        # upsert keeps the cache fresh without piling duplicate rows.
        ctx.sb.table("recommendations").upsert(
            rows, on_conflict="case_id,resource_id"
        ).execute()
        # Re-read ids so the payload can carry rec_id for status updates,
        # including rows the upsert just created.
        persisted = (
            ctx.sb.table("recommendations")
            .select("id, resource_id, status")
            .eq("case_id", case_id)
            .execute()
        )
        ctx.rec_ids = {row["resource_id"]: row["id"] for row in (persisted.data or [])}
        ctx.statuses = {row["resource_id"]: row.get("status") or "suggested"
                        for row in (persisted.data or [])}

    payload = _response_payload(case_id, ctx, grouped)
    payload["count"] = len(rows)
    return jsonify(payload)


@bp.post("/cases/<case_id>/scrape-programs")
@require_auth
def scrape_programs(case_id: str):
    """Search curated assistance sources for programs matching this case
    and fold them into the shared catalog. Called by the frontend after the
    user answers the optional intake questions, so the extra detail they
    just shared immediately pays off in a richer plan."""
    ctx, err = _load_context(case_id)
    if err:
        return err
    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured on server"}), 503
    try:
        sb_service = service_client()
    except RuntimeError:
        return jsonify({"error": "catalog updates not configured on server"}), 503

    tags = set(ctx.case.get("derived_tags") or [])
    if ctx.inventory is not None:
        tags |= ctx.inventory.tags
    if ctx.documents is not None:
        tags |= ctx.documents.tags

    result = scrape_programs_for_case(ctx.case, tags, api_key, sb_service)
    current_app.logger.info(
        "program_scrape case=%s sources=%s found=%s added=%s",
        case_id, result["sources_checked"],
        result["programs_found"], result["programs_added"],
    )
    return jsonify(result)


@bp.patch("/recommendations/<rec_id>")
@require_auth
def update_recommendation(rec_id: str):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in {"suggested", "saved", "dismissed", "done"}:
        return jsonify({"error": "status must be one of suggested|saved|dismissed|done"}), 400
    sb = user_client(g.access_token)
    res = sb.table("recommendations").update({"status": status}).eq("id", rec_id).execute()
    if not res.data:
        return jsonify({"error": "not found"}), 404
    # Feedback telemetry: pairs with rec_impressions to tune ranking weights.
    row = res.data[0]
    current_app.logger.info(
        "rec_status_change rec=%s resource=%s case=%s status=%s",
        rec_id, row.get("resource_id"), row.get("case_id"), status,
    )
    return jsonify({"recommendation": row})
