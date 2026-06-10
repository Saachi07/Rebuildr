"""Recommendations blueprint.

`POST /cases/<id>/recommendations` — pulls the case row from the DB,
folds in optional image / document signals + intake answers from the
request body, and returns the categorised "maybe you can do" list.

The `Recommender` is constructed once at app startup (see
`backend/app/__init__.py`) — DB resources are loaded into a list of
dicts and handed to the standalone recommender module so it stays free
of SQLAlchemy at request time.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Optional

import numpy as np
from flask import Blueprint, current_app, jsonify, request

from ..extensions import db
from ..models import CaseResourceFeedback, RecoveryCase

# Make the standalone `questions/` package importable.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_QUESTIONS_DIR = _REPO_ROOT / "questions"
if str(_QUESTIONS_DIR) not in sys.path:
    sys.path.insert(0, str(_QUESTIONS_DIR))

from recommender import (  # noqa: E402
    DamageSeverity,
    DocumentDeadline,
    DocumentFindings,
    InventorySummary,
    Recommendation,
    Recommender,
)


bp = Blueprint("recommendations", __name__)


# ---------------------------------------------------------------------------
# Recommender lifecycle
# ---------------------------------------------------------------------------

def build_recommender_from_db() -> Recommender:
    """Load resources from the DB and construct a single Recommender."""
    from ..models import Resource

    rows = db.session.query(Resource).all()
    resources = [r.to_recommender_dict() for r in rows]
    # Embedder disabled here — first-call latency from sentence-transformers
    # would be jarring in the request path. The blueprint relies on plan
    # alignment + feature match + insurer + deadline pressure.
    return Recommender(resources=resources, load_embedder=False)


def get_recommender() -> Recommender:
    rec = current_app.extensions.get("rebuildr_recommender")
    if rec is None:
        rec = build_recommender_from_db()
        current_app.extensions["rebuildr_recommender"] = rec
    return rec


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@bp.post("/cases/<int:case_id>/recommendations")
def get_recommendations(case_id: int):
    case = db.session.get(RecoveryCase, case_id)
    if case is None or case.deleted_at is not None:
        return jsonify({"error": "case not found"}), 404

    payload = request.get_json(silent=True) or {}
    debug = bool(payload.get("debug"))

    inventory_summary = _parse_inventory_summary(payload.get("inventory_summary"))
    document_findings = _parse_document_findings(payload.get("document_findings"))

    intake_answers = payload.get("intake_answers") or {}

    # Honour persisted feedback first, then merge with anything in the body.
    persisted = (
        db.session.query(CaseResourceFeedback)
        .filter(CaseResourceFeedback.case_id == case_id)
        .all()
    )
    completed = {f.resource_id for f in persisted if f.status == "completed"}
    dismissed = {f.resource_id for f in persisted if f.status == "dismissed"}
    completed |= set(payload.get("completed_resource_ids") or [])
    dismissed |= set(payload.get("dismissed_resource_ids") or [])

    user_context = {
        "region": _province_from_location(case.location),
        "disaster_type": case.disaster_type,
        "disaster_date": case.incident_date,
        "insurance_company": case.insurance_provider,
        "intake_answers": intake_answers,
    }

    # Uniform "everything's equally likely" prior — the real plan
    # distribution comes from the intake engine, which doesn't ship in
    # the request body. If the frontend has it, accept it; otherwise
    # the resources still rank by their other features.
    plan_distribution = np.array(payload.get("plan_distribution") or [1.0 / 12] * 12)

    result = get_recommender().recommend(
        plan_distribution=plan_distribution,
        user_context=user_context,
        completed_resource_ids=completed,
        dismissed_resource_ids=dismissed,
        inventory_summary=inventory_summary,
        document_findings=document_findings,
        debug=debug,
    )

    return jsonify(_serialize(result, debug=debug))


# ---------------------------------------------------------------------------
# Feedback writes — completions / dismissals
# ---------------------------------------------------------------------------

@bp.post("/cases/<int:case_id>/recommendations/<resource_id>/feedback")
def record_feedback(case_id: int, resource_id: str):
    case = db.session.get(RecoveryCase, case_id)
    if case is None or case.deleted_at is not None:
        return jsonify({"error": "case not found"}), 404

    payload = request.get_json(force=True) or {}
    status = payload.get("status")
    if status not in {"completed", "dismissed"}:
        return jsonify({"error": "status must be 'completed' or 'dismissed'"}), 400

    row = (
        db.session.query(CaseResourceFeedback)
        .filter_by(case_id=case_id, resource_id=resource_id)
        .one_or_none()
    )
    if row is None:
        row = CaseResourceFeedback(
            case_id=case_id, resource_id=resource_id, status=status,
        )
        db.session.add(row)
    else:
        row.status = status
    db.session.commit()

    return jsonify(row.to_dict())


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _parse_inventory_summary(d: Optional[dict]) -> Optional[InventorySummary]:
    if not d:
        return None
    sev_raw = d.get("damage_severity")
    sev: Optional[DamageSeverity] = None
    if sev_raw:
        try:
            sev = DamageSeverity(sev_raw)
        except ValueError:
            sev = None
    return InventorySummary(
        total_value_low=float(d.get("total_value_low") or 0.0),
        total_value_high=float(d.get("total_value_high") or 0.0),
        damage_severity=sev,
        detected_tags=set(d.get("detected_tags") or []),
    )


def _parse_document_findings(d: Optional[dict]) -> Optional[DocumentFindings]:
    if not d:
        return None
    deadlines = []
    for entry in d.get("deadlines") or []:
        try:
            due = date.fromisoformat(entry["due_date"][:10])
        except (KeyError, ValueError, TypeError):
            continue
        deadlines.append(DocumentDeadline(
            source_doc=str(entry.get("source_doc", "document")),
            label=str(entry.get("label", "deadline")),
            due_date=due,
        ))
    return DocumentFindings(
        deadlines=deadlines,
        denial_flag=bool(d.get("denial_flag")),
        extracted_insurer=d.get("extracted_insurer"),
        ale_exhausted=bool(d.get("ale_exhausted")),
    )


def _province_from_location(location: str) -> Optional[str]:
    """Tiny heuristic. The recovery case stores location as free text;
    when it ends in ", AB" / ", BC" we can pull a province code, but
    we don't try harder than that here."""
    if not location:
        return None
    parts = [p.strip() for p in location.split(",")]
    last = parts[-1].upper() if parts else ""
    if len(last) == 2 and last.isalpha():
        return last
    return None


def _serialize(result: dict, debug: bool) -> dict:
    def rec_to_dict(rec: Optional[Recommendation]):
        return rec.to_dict() if rec is not None else None

    out = {
        "by_category": {
            cat: [rec_to_dict(r) for r in recs]
            for cat, recs in result["by_category"].items()
        },
        "top_pick": rec_to_dict(result.get("top_pick")),
        "deadline_radar": [rec_to_dict(r) for r in result.get("deadline_radar") or []],
        "personalize_more": result.get("personalize_more") or [],
    }
    if debug and "debug" in result:
        out["debug"] = result["debug"]
    return out
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
