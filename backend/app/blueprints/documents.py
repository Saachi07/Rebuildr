"""User document library + per-case attachment.

Documents (insurance policies, claims, IDs, deeds, receipts) live in a
per-user library. A single document can be attached to many cases via the
``case_documents`` join — so a user re-using the same insurance policy
across two disasters doesn't re-upload it.

Blob storage goes to a private Supabase ``documents`` bucket via the
service role; clients get short-lived signed URLs at read time.

PDFs only.
"""

from __future__ import annotations

import uuid
from typing import Any

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..extensions import service_client, user_client

bp = Blueprint("documents", __name__)

BUCKET = "documents"
SIGNED_URL_TTL = 60 * 10  # 10 minutes
ALLOWED_MIME = {"application/pdf"}
ALLOWED_DOC_TYPES = {"insurance_policy", "claim", "id", "deed", "receipt", "other"}


def _signed_url(storage_path: str) -> str | None:
    try:
        svc = service_client()
        res = svc.storage.from_(BUCKET).create_signed_url(storage_path, SIGNED_URL_TTL)
        return res.get("signedURL") or res.get("signed_url")
    except Exception:
        return None


def _serialize(row: dict[str, Any], include_url: bool = True) -> dict[str, Any]:
    out = {
        "id": row["id"],
        "name": row["name"],
        "doc_type": row.get("doc_type"),
        "mime_type": row.get("mime_type"),
        "size_bytes": row.get("size_bytes"),
        "uploaded_at": row.get("uploaded_at"),
    }
    if include_url and row.get("storage_path"):
        out["url"] = _signed_url(row["storage_path"])
    if "attached_at" in row:
        out["attached_at"] = row["attached_at"]
    return out


# ---------------------------------------------------------------------------
# User library
# ---------------------------------------------------------------------------
@bp.get("/documents")
@require_auth
def list_my_documents():
    sb = user_client(g.access_token)
    res = (
        sb.table("user_documents")
        .select("*")
        .is_("deleted_at", "null")
        .order("uploaded_at", desc=True)
        .execute()
    )
    return jsonify({"documents": [_serialize(r) for r in (res.data or [])]})


@bp.post("/documents")
@require_auth
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400
    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "file is required"}), 400

    mime = (f.mimetype or "").lower()
    if mime not in ALLOWED_MIME and not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "only PDF files are supported"}), 415

    doc_type = (request.form.get("doc_type") or "other").lower()
    if doc_type not in ALLOWED_DOC_TYPES:
        doc_type = "other"

    blob = f.read()
    size_bytes = len(blob)
    if size_bytes == 0:
        return jsonify({"error": "empty file"}), 400

    storage_path = f"{g.user_id}/{uuid.uuid4()}.pdf"
    svc = service_client()
    svc.storage.from_(BUCKET).upload(
        storage_path,
        blob,
        {"content-type": "application/pdf", "upsert": "false"},
    )

    row = {
        "user_id": g.user_id,
        "name": f.filename,
        "doc_type": doc_type,
        "mime_type": "application/pdf",
        "size_bytes": size_bytes,
        "storage_path": storage_path,
    }
    sb = user_client(g.access_token)
    res = sb.table("user_documents").insert(row).execute()
    if not res.data:
        # Roll back the storage upload so we don't orphan the blob.
        try:
            svc.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass
        return jsonify({"error": "failed to record document"}), 500
    return jsonify({"document": _serialize(res.data[0])}), 201


@bp.delete("/documents/<document_id>")
@require_auth
def delete_document(document_id: str):
    sb = user_client(g.access_token)
    fetch = (
        sb.table("user_documents")
        .select("storage_path")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not fetch.data:
        return jsonify({"error": "not found"}), 404

    res = sb.table("user_documents").delete().eq("id", document_id).execute()
    if not res.data:
        return jsonify({"error": "not found"}), 404

    try:
        service_client().storage.from_(BUCKET).remove([fetch.data["storage_path"]])
    except Exception:
        pass
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Per-case attachments
# ---------------------------------------------------------------------------
@bp.get("/cases/<case_id>/documents")
@require_auth
def list_case_documents(case_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("case_documents")
        .select("attached_at, user_documents!inner(*)")
        .eq("case_id", case_id)
        .execute()
    )
    out: list[dict[str, Any]] = []
    for row in res.data or []:
        doc = row.get("user_documents") or {}
        if doc.get("deleted_at"):
            continue
        out.append(_serialize({**doc, "attached_at": row.get("attached_at")}))
    return jsonify({"documents": out})


@bp.post("/cases/<case_id>/documents")
@require_auth
def attach_document(case_id: str):
    data = request.get_json(silent=True) or {}
    document_id = data.get("document_id")
    if not document_id:
        return jsonify({"error": "document_id is required"}), 400

    sb = user_client(g.access_token)
    sb.table("case_documents").upsert(
        {"case_id": case_id, "document_id": document_id},
        on_conflict="case_id,document_id",
    ).execute()

    fetched = (
        sb.table("user_documents")
        .select("*")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not fetched.data:
        return jsonify({"error": "document not found"}), 404
    return jsonify({"document": _serialize(fetched.data)}), 201


@bp.delete("/cases/<case_id>/documents/<document_id>")
@require_auth
def detach_document(case_id: str, document_id: str):
    sb = user_client(g.access_token)
    res = (
        sb.table("case_documents")
        .delete()
        .eq("case_id", case_id)
        .eq("document_id", document_id)
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})
