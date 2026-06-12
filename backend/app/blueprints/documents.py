"""User document library.

Documents (insurance policies, claims, IDs, deeds, receipts) live in a
per-user library. They are no longer attached to cases — the library
stands on its own.

Blob storage goes to a private Supabase ``documents`` bucket via the
service role; clients get short-lived signed URLs on demand via
``GET /documents/<id>/url`` (not eagerly per-row at list time — that was
the dominant page-load cost).

Save is cheap: upload only stores the blob + a row. Classification +
extraction runs separately via ``POST /documents/<id>/analyze`` so the
user can choose to skip analysis or re-run it later.

Accepts PDFs and photos (JPEG/PNG/WebP/HEIC) — survivors usually have
phone photos of their paperwork, not scans.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, current_app, g, jsonify, request

from ..auth import require_auth
from ..extensions import service_client, user_client
from ..services.document_pipeline import PipelineUnavailable, analyze_document_rich
from ..services.gemini_documents import analyze_document

bp = Blueprint("documents", __name__, url_prefix="/documents")

BUCKET = "documents"
SIGNED_URL_TTL = 60 * 10  # 10 minutes

# mime -> storage extension. Gemini reads all of these natively.
ALLOWED_MIME = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}
EXT_TO_MIME = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
    "heif": "image/heif",
}

EDITABLE_DOC_TYPES = {
    "insurance_policy", "claim", "id", "deed", "receipt",
    "invoice", "estimate", "correspondence", "other",
}


def _resolve_mime(file) -> str | None:
    """Pick the real mime from the upload, falling back to the extension."""
    mime = (file.mimetype or "").lower()
    if mime in ALLOWED_MIME:
        return mime
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    return EXT_TO_MIME.get(ext)


def _signed_url(storage_path: str) -> str | None:
    try:
        svc = service_client()
        res = svc.storage.from_(BUCKET).create_signed_url(storage_path, SIGNED_URL_TTL)
        return res.get("signedURL") or res.get("signed_url")
    except Exception:
        return None


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "doc_type": row.get("doc_type"),
        "mime_type": row.get("mime_type"),
        "size_bytes": row.get("size_bytes"),
        "uploaded_at": row.get("uploaded_at"),
        "analyzed_at": row.get("analyzed_at"),
        "gemini_analysis": row.get("gemini_analysis"),
    }


# ---------------------------------------------------------------------------
# Library
# ---------------------------------------------------------------------------
@bp.get("")
@require_auth
def list_my_documents():
    """List the caller's documents. Does NOT generate signed URLs — clients
    call /documents/<id>/url only when actually opening a file. Cuts the
    list latency from O(n) storage roundtrips to one DB query."""
    sb = user_client(g.access_token)
    res = (
        sb.table("user_documents")
        .select("id, name, doc_type, mime_type, size_bytes, uploaded_at, analyzed_at, gemini_analysis")
        .is_("deleted_at", "null")
        .order("uploaded_at", desc=True)
        .execute()
    )
    return jsonify({"documents": [_serialize(r) for r in (res.data or [])]})


@bp.post("")
@require_auth
def upload_document():
    """Save a PDF or document photo. Does not run Gemini — call
    /documents/<id>/analyze for that."""
    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400
    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "file is required"}), 400

    mime = _resolve_mime(f)
    if mime is None:
        return jsonify({
            "error": "we support PDFs and photos (JPG, PNG, WebP, HEIC) — "
                     "a clear phone photo of the document works great"
        }), 415

    blob = f.read()
    size_bytes = len(blob)
    if size_bytes == 0:
        return jsonify({"error": "empty file"}), 400

    storage_path = f"{g.user_id}/{uuid.uuid4()}.{ALLOWED_MIME[mime]}"
    svc = service_client()
    svc.storage.from_(BUCKET).upload(
        storage_path,
        blob,
        {"content-type": mime, "upsert": "false"},
    )

    row = {
        "user_id": g.user_id,
        "name": f.filename,
        "mime_type": mime,
        "size_bytes": size_bytes,
        "storage_path": storage_path,
    }
    sb = user_client(g.access_token)
    res = sb.table("user_documents").insert(row).execute()
    if not res.data:
        try:
            svc.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass
        return jsonify({"error": "failed to record document"}), 500
    return jsonify({"document": _serialize(res.data[0])}), 201


@bp.patch("/<document_id>")
@require_auth
def update_document(document_id: str):
    """Let users rename a document or correct its type. A misclassified
    policy used to be silently excluded from the plan with no recourse."""
    body = request.get_json(silent=True) or {}
    patch: dict[str, Any] = {}

    name = body.get("name")
    if isinstance(name, str) and name.strip():
        patch["name"] = name.strip()[:200]

    doc_type = body.get("doc_type")
    if isinstance(doc_type, str):
        if doc_type not in EDITABLE_DOC_TYPES:
            return jsonify({"error": "unknown document type"}), 400
        patch["doc_type"] = doc_type

    if not patch:
        return jsonify({"error": "nothing to update"}), 400

    sb = user_client(g.access_token)
    res = sb.table("user_documents").update(patch).eq("id", document_id).execute()
    if not res.data:
        return jsonify({"error": "not found"}), 404
    return jsonify({"document": _serialize(res.data[0])})


@bp.delete("/<document_id>")
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


@bp.get("/<document_id>/url")
@require_auth
def document_url(document_id: str):
    """Issue a short-lived signed URL for one document. Called on click,
    not on list — keeps the list endpoint snappy."""
    sb = user_client(g.access_token)
    res = (
        sb.table("user_documents")
        .select("storage_path")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        return jsonify({"error": "not found"}), 404
    url = _signed_url(res.data["storage_path"])
    if not url:
        return jsonify({"error": "could not sign url"}), 500
    return jsonify({"url": url, "ttl_seconds": SIGNED_URL_TTL})


@bp.post("/<document_id>/analyze")
@require_auth
def analyze_document_endpoint(document_id: str):
    """Run Gemini classification + field extraction on a saved document.
    Persists the result so re-renders are free."""
    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured on server"}), 503

    sb = user_client(g.access_token)
    fetched = (
        sb.table("user_documents")
        .select("storage_path, mime_type")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not fetched.data:
        return jsonify({"error": "not found"}), 404

    try:
        svc = service_client()
        blob = svc.storage.from_(BUCKET).download(fetched.data["storage_path"])
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"could not load document: {exc}"}), 500

    mime = (fetched.data.get("mime_type") or "application/pdf").lower()

    try:
        result = analyze_document(blob, api_key, mime_type=mime)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500

    analysis = result.model_dump()

    # For documents that are actually disaster-recovery related, run the richer
    # pipeline (text extraction → spaCy NLP → structured Gemini summary) and
    # merge its findings — deadlines, flagged issues, coverage limits, required
    # actions, warnings — into the stored analysis. "other" documents are
    # skipped: they don't feed the plan, so the extra work isn't worth it.
    # The rich pipeline is PDF-text based, so photo uploads skip it too —
    # they still get the classifier summary above.
    if analysis.get("doc_type") != "other" and mime == "application/pdf":
        try:
            rich = analyze_document_rich(blob, api_key)
            # The richer plain-language summary supersedes the one-line classifier
            # blurb for display, but we keep the classifier `summary` too because
            # the recommender's signal extraction reads it.
            analysis["analysis"] = rich
        except PipelineUnavailable as exc:  # degrade — classification still stands
            current_app.logger.warning("rich document pipeline skipped: %s", exc)

    update = {
        "doc_type": analysis["doc_type"],
        "gemini_analysis": analysis,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    updated = (
        sb.table("user_documents")
        .update(update)
        .eq("id", document_id)
        .execute()
    )
    if not updated.data:
        return jsonify({"error": "failed to persist analysis"}), 500
    return jsonify({"document": _serialize(updated.data[0])})
