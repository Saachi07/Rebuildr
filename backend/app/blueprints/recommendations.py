"""Recommendation endpoints — drives the content-based filter.

GET  /cases/<case_id>/recommendations  → run the filter and return groups
POST /cases/<case_id>/recommendations  → run + persist into ``recommendations``
PATCH /recommendations/<rec_id>        → mark saved / dismissed / done

The filter is fed by three sources, all already persisted (no Gemini call
in this request path):

* the case row itself (disaster type, region, intake-derived tags),
* the image-classification pipeline — ``case_items`` rows created from
  ``POST /ml/analyze-photo`` results, folded into damage-severity tags via
  ``services.signals.inventory_signals_from_items``,
* the document pipeline — ``user_documents.gemini_analysis`` rows from
  ``POST /documents/<id>/analyze``, folded into insurer / deadline / denial
  signals via ``services.signals.document_signals_from_documents``.
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import user_client
from ..services.content_filter import recommend
from ..services.signals import (
    document_signals_from_documents,
    inventory_signals_from_items,
)

bp = Blueprint("recommendations", __name__)


class _Context:
    __slots__ = ("case", "items", "resources", "completed_ids", "sb",
                 "inventory", "documents")

    def __init__(self, case, items, resources, completed_ids, sb,
                 inventory, documents):
        self.case = case
        self.items = items
        self.resources = resources
        self.completed_ids = completed_ids
        self.sb = sb
        self.inventory = inventory
        self.documents = documents


def _load_documents_signals(sb):
    """Fetch the caller's analyzed documents (RLS scopes to the user) and
    fold them into one DocumentSignals. Soft-fails to None — a broken
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


def _load_context(case_id: str):
    sb = user_client(g.access_token)
    case = sb.table("recovery_cases").select("*").eq("id", case_id).maybe_single().execute()
    if not case.data:
        return None, (jsonify({"error": "case not found"}), 404)
    items = sb.table("case_items").select("*").eq("case_id", case_id).execute()
    resources = sb.table("resources").select("*").execute()
    completed = (
        sb.table("recommendations")
        .select("resource_id")
        .eq("case_id", case_id)
        .eq("status", "done")
        .execute()
    )
    completed_ids = {row["resource_id"] for row in (completed.data or [])}

    item_rows = items.data or []
    ctx = _Context(
        case.data,
        item_rows,
        resources.data or [],
        completed_ids,
        sb,
        inventory=inventory_signals_from_items(item_rows),
        documents=_load_documents_signals(sb),
    )
    return ctx, None


def _run(ctx: _Context, top_k: int):
    return recommend(
        ctx.case,
        ctx.items,
        ctx.resources,
        top_k_per_category=top_k,
        completed_ids=ctx.completed_ids,
        inventory=ctx.inventory,
        documents=ctx.documents,
    )


@bp.get("/cases/<case_id>/recommendations")
@require_auth
def get_recommendations(case_id: str):
    ctx, err = _load_context(case_id)
    if err:
        return err
    top_k = int(request.args.get("top_k", 5))
    grouped = _run(ctx, top_k)
    return jsonify({
        "case_id": case_id,
        "groups": {t: [r.to_dict() for r in recs] for t, recs in grouped.items()},
    })


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
                "status": "suggested",
            })
    if rows:
        # upsert keeps the cache fresh without piling duplicate rows.
        ctx.sb.table("recommendations").upsert(
            rows, on_conflict="case_id,resource_id"
        ).execute()

    return jsonify({
        "case_id": case_id,
        "count": len(rows),
        "groups": {t: [r.to_dict() for r in recs] for t, recs in grouped.items()},
    })


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
    return jsonify({"recommendation": res.data[0]})
