"""Case-item CRUD — the damaged objects inside a recovery case.

These rows feed the content-based filter: an item's ``category``,
``material``, ``damage_type`` and ``damage_severity`` are appended to the
query vector the recommender builds for that case.
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import user_client

bp = Blueprint("items", __name__, url_prefix="/cases/<case_id>/items")

WRITABLE = {
    "name",
    "category",
    "material",
    "estimated_value",
    "damage_type",
    "damage_severity",
    "confidence",
    "image_url",
    "description",
}


@bp.get("")
@require_auth
def list_items(case_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=False)
        .execute()
    )
    return jsonify({"items": res.data or []})


@bp.post("")
@require_auth
def create_item(case_id: str):
    data = request.get_json(silent=True) or {}
    if not data.get("name"):
        return jsonify({"error": "name is required"}), 400
    row = {k: v for k, v in data.items() if k in WRITABLE}
    row["case_id"] = case_id
    sb = user_client(g.access_token)
    res = sb.table("case_items").insert(row).execute()
    return jsonify({"item": res.data[0] if res.data else None}), 201


@bp.patch("/<item_id>")
@require_auth
def update_item(case_id: str, item_id: str):
    data = request.get_json(silent=True) or {}
    row = {k: v for k, v in data.items() if k in WRITABLE}
    if not row:
        return jsonify({"error": "no updatable fields provided"}), 400
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .update(row)
        .eq("id", item_id)
        .eq("case_id", case_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"item": res.data[0]})


@bp.delete("/<item_id>")
@require_auth
def delete_item(case_id: str, item_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .delete()
        .eq("id", item_id)
        .eq("case_id", case_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})
