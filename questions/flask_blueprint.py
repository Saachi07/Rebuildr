"""
Example Flask blueprint integrating the intake engine.

Drop this into your existing app structure. It assumes you have a
RecoveryCase model and a SQLAlchemy `db` extension already wired up
(both visible in your existing recovery_case.py).

Add a new IntakeSession model (one row per intake run) and register
this blueprint with the app.

NOTE: For production, swap in proper auth/CSRF and store the engine
as a singleton in app.extensions or app.config so it loads once at
startup, not per-request.
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from intake_engine import IntakeEngine
from plans import plan_by_id
from questions import question_by_id


intake_bp = Blueprint("intake", __name__, url_prefix="/api")

# Singleton — load the model once when the app starts.
_engine: IntakeEngine | None = None

# Temporary in-memory session store for the example implementation.
# Production should persist sessions in the database (see IntakeSession sketch above).
_sessions: dict[str, dict] = {}

def init_engine(model_path: str, data_path: str) -> None:
    """Call this once during app startup, e.g. from create_app()."""
    global _engine
    _engine = IntakeEngine(model_path=model_path, data_path=data_path)


def engine() -> IntakeEngine:
    if _engine is None:
        raise RuntimeError("Intake engine not initialised — call init_engine() first.")
    return _engine


# ---------------------------------------------------------------------------
# Model — add this to your models package.
# ---------------------------------------------------------------------------
# from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
#
# class IntakeSession(db.Model):
#     __tablename__ = "intake_sessions"
#     id = Column(Integer, primary_key=True)
#     case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
#     answers = Column(JSON, nullable=False, default=dict)
#     status = Column(String(32), nullable=False, default="in_progress")
#     final_plan_id = Column(Integer, nullable=True)
#     confidence = Column(Integer, nullable=True)  # store as int percent
#     created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
#     updated_at = Column(DateTime(timezone=True),
#                         default=lambda: datetime.now(timezone.utc),
#                         onupdate=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@intake_bp.post("/cases/<int:case_id>/intake/start")
def start_intake(case_id: int):
    """
    Open a new intake session for the given case. Returns the first
    question (chosen adaptively — typically the housing question, but
    the engine decides).
    """
    from uuid import uuid4

    session_id = str(uuid4())
    answers = {}
    _sessions[session_id] = answers
    q = engine().next_question(answers)
    return jsonify({
        "session_id": session_id,
        "question": _serialise_question(q) if q else None,
        "done": q is None,
    })


@intake_bp.post("/intake/<session_id>/answer")
def submit_answer(session_id: str):
    """
    Submit an answer to the current question. Body:
        { "question_id": "housing", "answer": 1 }                 # single
        { "question_id": "documents", "answer": ["has_id", ...] } # multi
    Returns the next question, or the final plan if the engine is
    confident enough to stop.
    """
    payload = request.get_json(force=True)
    question_id = payload["question_id"]
    answer = payload["answer"]

    answers = _sessions.get(session_id)
    if answers is None:
        return jsonify({"error": "unknown session_id"}), 404
    q = question_by_id(question_id)
    engine().record_answer(answers, q, answer)

    # session.answers = answers
    # session.updated_at = datetime.now(timezone.utc)

    next_q = engine().next_question(answers)
    if next_q is None:
        plan_id, confidence = engine().final_plan(answers)
        plan = plan_by_id(plan_id)
        # session.status = "completed"
        # session.final_plan_id = plan_id
        # session.confidence = int(round(confidence * 100))
        # db.session.commit()
        return jsonify({
            "done": True,
            "plan": {
                "id": plan_id,
                "name": plan["name"],
                "summary": plan["summary"],
                "tasks": plan["tasks"],
                "confidence": confidence,
            },
        })

    # db.session.commit()
    return jsonify({
        "done": False,
        "question": _serialise_question(next_q),
    })


@intake_bp.get("/intake/<session_id>")
def get_session(session_id: str):
    """Return the current state of an intake session — useful for resuming."""
    # session = IntakeSession.query.get_or_404(session_id)
    return jsonify({
        "session_id": session_id,
        # "answers": session.answers,
        # "status": session.status,
        # "final_plan_id": session.final_plan_id,
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialise_question(q: dict) -> dict:
    """Strip the question down to what the frontend needs."""
    return {
        "id": q["id"],
        "type": q["type"],
        "title": q["title"],
        "subtitle": q["subtitle"],
        "options": q["options"],
    }
