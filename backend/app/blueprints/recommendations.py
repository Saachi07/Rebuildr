"""Recommendation endpoints — drives the content-based filter.

GET  /cases/<case_id>/recommendations  → run the filter and return groups
POST /cases/<case_id>/recommendations  → run + persist into ``recommendations``
PATCH /recommendations/<rec_id>        → mark saved / dismissed / done
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import user_client
from ..services.content_filter import recommend

bp = Blueprint("recommendations", __name__)


class _Context:
    __slots__ = ("case", "items", "resources", "completed_ids", "sb")

    def __init__(self, case, items, resources, completed_ids, sb):
        self.case = case
        self.items = items
        self.resources = resources
        self.completed_ids = completed_ids
        self.sb = sb


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
    return _Context(case.data, items.data or [], resources.data or [], completed_ids, sb), None


@bp.get("/cases/<case_id>/recommendations")
@require_auth
def get_recommendations(case_id: str):
    ctx, err = _load_context(case_id)
    if err:
        return err
    top_k = int(request.args.get("top_k", 5))
    grouped = recommend(ctx.case, ctx.items, ctx.resources,
                        top_k_per_category=top_k,
                        completed_ids=ctx.completed_ids)
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
    case, items, resources, completed_ids, sb = (
        ctx.case, ctx.items, ctx.resources, ctx.completed_ids, ctx.sb
    )
    top_k = int((request.get_json(silent=True) or {}).get("top_k", 5))
    grouped = recommend(case, items, resources, top_k_per_category=top_k,
                        completed_ids=completed_ids)

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
        sb.table("recommendations").upsert(
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
