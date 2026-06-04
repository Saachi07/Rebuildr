from flask import Blueprint, jsonify
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    db_status = "ok"
    db_error: str | None = None
    try:
        db.session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        db_status = "error"
        db_error = str(exc.__class__.__name__)

    payload = {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "db_dialect": db.engine.dialect.name,
    }
    if db_error:
        payload["db_error"] = db_error

    http_status = 200 if db_status == "ok" else 503
    return jsonify(payload), http_status
