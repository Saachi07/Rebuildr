"""ML endpoints — Gemini-backed photo → inventory extraction."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from ..auth import require_auth
from ..services.gemini_inventory import analyze_room_photo

bp = Blueprint("ml", __name__, url_prefix="/ml")


@bp.post("/analyze-photo")
@require_auth
def analyze_photo():
    if "image" not in request.files:
        return jsonify({"error": "image file is required"}), 400
    f = request.files["image"]
    if not f or not f.filename:
        return jsonify({"error": "image file is required"}), 400

    blob = f.read()
    if not blob:
        return jsonify({"error": "empty image"}), 400

    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured on server"}), 503

    try:
        result = analyze_room_photo(blob, api_key)
    except Exception as exc:  # noqa: BLE001 — surface error to client
        return jsonify({"error": str(exc)}), 500
    return jsonify(result.model_dump())
