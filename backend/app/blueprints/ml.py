"""ML endpoints — Gemini-backed photo → inventory extraction."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from ..auth import require_auth
from ..services.gemini_inventory import ModelOverloaded, analyze_room_photo

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

    # "pre"  = before the disaster (proof of what the user owned).
    # "post" = after the disaster (showing the damage).
    # "auto" = let Gemini decide and report it back as detected_phase.
    pre_post = (request.form.get("pre_post") or "post").lower()
    if pre_post not in {"pre", "post", "auto"}:
        pre_post = "post"

    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured on server"}), 503

    try:
        result = analyze_room_photo(blob, api_key, pre_post=pre_post)
    except ModelOverloaded as exc:
        # Gemini is temporarily unavailable after retries — tell the client to
        # retry rather than reporting a server bug.
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:  # noqa: BLE001 — surface error to client
        return jsonify({"error": str(exc)}), 500
    return jsonify(result.model_dump())
