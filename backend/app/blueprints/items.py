"""Case-item CRUD — damaged objects in a user's library.

Originally items belonged to a single case (case_items.case_id NOT NULL).
After migration 0006 they're a per-user library that can optionally be
linked to a case — see the SQL for the new RLS policies.

Routes:
    /items                         user-scoped CRUD (the library)
    /cases/<case_id>/items         legacy + scoped view for the recommender

These rows feed the content-based filter: an item's ``category``,
``material``, ``damage_type`` and ``damage_severity`` are appended to the
query vector the recommender builds for that case.
"""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import user_client

bp = Blueprint("items", __name__)

# Per-case view (kept for the recommender and the case-scoped Inventory page)
case_bp = Blueprint("case_items", __name__, url_prefix="/cases/<case_id>/items")

# User library
lib_bp = Blueprint("user_items", __name__, url_prefix="/items")

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
    "room",
    "case_id",
}


# ---------------------------------------------------------------------------
# Case-scoped (legacy + recommender)
# ---------------------------------------------------------------------------
@case_bp.get("")
@require_auth
def list_items_for_case(case_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=False)
        .execute()
    )
    return jsonify({"items": res.data or []})


@case_bp.post("")
@require_auth
def create_item_for_case(case_id: str):
    data = request.get_json(silent=True) or {}
    if not data.get("name"):
        return jsonify({"error": "name is required"}), 400
    row = {k: v for k, v in data.items() if k in WRITABLE}
    row["case_id"] = case_id
    row["user_id"] = g.user_id
    sb = user_client(g.access_token)
    res = sb.table("case_items").insert(row).execute()
    return jsonify({"item": res.data[0] if res.data else None}), 201


@case_bp.patch("/<item_id>")
@require_auth
def update_item_for_case(case_id: str, item_id: str):
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


@case_bp.delete("/<item_id>")
@require_auth
def delete_item_for_case(case_id: str, item_id: str):
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


# ---------------------------------------------------------------------------
# User library
# ---------------------------------------------------------------------------
@lib_bp.get("")
@require_auth
def list_my_items():
    """Every item the user owns, across cases or library-only."""
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .select("*")
        .eq("user_id", g.user_id)
        .order("created_at", desc=False)
        .execute()
    )
    return jsonify({"items": res.data or []})


@lib_bp.post("")
@require_auth
def create_library_item():
    """Create an item that may or may not be attached to a case yet."""
    data = request.get_json(silent=True) or {}
    if not data.get("name"):
        return jsonify({"error": "name is required"}), 400
    row = {k: v for k, v in data.items() if k in WRITABLE}
    row["user_id"] = g.user_id
    # If the caller didn't pass case_id, the item lives in the library only.
    sb = user_client(g.access_token)
    res = sb.table("case_items").insert(row).execute()
    return jsonify({"item": res.data[0] if res.data else None}), 201


@lib_bp.patch("/<item_id>")
@require_auth
def update_library_item(item_id: str):
    data = request.get_json(silent=True) or {}
    row = {k: v for k, v in data.items() if k in WRITABLE}
    if not row:
        return jsonify({"error": "no updatable fields provided"}), 400
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .update(row)
        .eq("id", item_id)
        .eq("user_id", g.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"item": res.data[0]})


@lib_bp.delete("/<item_id>")
@require_auth
def delete_library_item(item_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .delete()
        .eq("id", item_id)
        .eq("user_id", g.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


@lib_bp.post("/<item_id>/attach/<case_id>")
@require_auth
def attach_item_to_case(item_id: str, case_id: str):
    """Link a library item to a case so it shows up in that case's
    recommendations and inventory view."""
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .update({"case_id": case_id})
        .eq("id", item_id)
        .eq("user_id", g.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"item": res.data[0]})


@lib_bp.post("/<item_id>/detach")
@require_auth
def detach_item(item_id: str):
    """Remove the case link — the item stays in the user's library."""
    sb = user_client(g.access_token)
    res = (
        sb.table("case_items")
        .update({"case_id": None})
        .eq("id", item_id)
        .eq("user_id", g.user_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"item": res.data[0]})
