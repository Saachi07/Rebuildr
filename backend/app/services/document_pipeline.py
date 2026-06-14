"""Rich document analysis via the repo-root ``pdf_and_summary`` package.

The cheap classifier (``gemini_documents.analyze_document``) tells us *what*
a document is. This wrapper runs the heavier pipeline, local PyMuPDF text
extraction, spaCy NLP entity pre-scan, then a structured Gemini summary, to
lift the things a recovering user actually needs: deadlines, flagged issues,
coverage limits, required actions, and plain-language warnings.

``pdf_and_summary`` lives at the repo root (a sibling of ``backend``), not on
the backend's import path, so we add it here. Its heavy deps (PyMuPDF, spaCy,
PaddleOCR) are imported lazily inside the package, so a missing dependency only
fails when we actually call the pipeline, which we catch and degrade from.

OCR is intentionally disabled: native, text-based PDFs are the common case and
Paddle is a very heavy optional install. PII redaction is on so personal
identifiers never reach the Gemini API in plaintext; the summary shown back to
the owner is rehydrated locally after the API call.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional

# Put the repo root (parent of ``backend``) on sys.path so ``pdf_and_summary``
# is importable. parents: [0]=services [1]=app [2]=backend [3]=repo root.
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


class PipelineUnavailable(RuntimeError):
    """Raised when the rich pipeline can't run (missing deps, no text, etc.)."""


def analyze_document_rich(pdf_bytes: bytes, api_key: str) -> dict[str, Any]:
    """Run the full extraction → NLP → Gemini-summary pipeline on a PDF.

    Returns a dict with the summary fields the frontend renders plus a compact
    ``nlp`` block of extracted entities. Raises :class:`PipelineUnavailable`
    on any failure so the caller can fall back to the cheap analysis alone.
    """
    if not api_key:
        raise PipelineUnavailable("GEMINI_API_KEY not configured")

    # GeminiSummarizer reads the key from the environment; the request path
    # already has it in app config, so make sure the env is populated.
    import os

    os.environ.setdefault("GEMINI_API_KEY", api_key)

    try:
        from pdf_and_summary import process_pdf
    except ImportError as exc:  # PyMuPDF / package not installed
        raise PipelineUnavailable(f"pdf_and_summary unavailable: {exc}") from exc

    try:
        result = process_pdf(
            pdf_bytes,
            prefer_gemini=True,
            use_ocr=False,
            use_nlp=True,
            redact_pii=True,
        )
    except Exception as exc:  # noqa: BLE001, any pipeline failure → degrade
        raise PipelineUnavailable(str(exc)) from exc

    return _shape(result)


def analyze_image_rich(image_bytes: bytes, api_key: str, mime_type: str) -> dict[str, Any]:
    """Run the rich structured analysis on a document photo.

    Photos have no locally extractable text, so the structured summary runs
    directly on the image bytes via Gemini, and quote verification is
    impossible: every verified flag is None and verification.checked is
    False. The returned dict matches :func:`analyze_document_rich` so the
    frontend renders both paths identically.
    """
    if not api_key:
        raise PipelineUnavailable("GEMINI_API_KEY not configured")

    from .gemini_documents import analyze_image_rich as _gemini_image_rich

    try:
        analysis = _gemini_image_rich(image_bytes, api_key, mime_type)
    except Exception as exc:  # noqa: BLE001 - any failure degrades to classifier-only
        raise PipelineUnavailable(str(exc)) from exc

    return {
        "plain_language_summary": analysis.get("plain_language_summary"),
        "flagged_issues": analysis.get("flagged_issues") or [],
        "deadlines": analysis.get("deadlines") or [],
        "coverage_limits": analysis.get("coverage_limits") or [],
        "required_actions": analysis.get("required_actions") or [],
        "warnings": analysis.get("warnings") or [],
        "glossary": analysis.get("glossary") or [],
        "coverage_scope": analysis.get("coverage_scope") or [],
        "deductible": analysis.get("deductible"),
        "verification": analysis.get("verification")
        or {"checked": False, "total": 0, "verified_count": 0},
        "summary_provider": "gemini-image",
        # No local extraction runs for photos; keep the blocks present so
        # consumers do not need to special-case the image path.
        "nlp": {"dates": [], "money": [], "organizations": [], "provider": None},
        "extraction_meta": {
            "page_count": None,
            "ocr_pages": None,
            "character_count": None,
        },
    }


def _shape(result: dict[str, Any]) -> dict[str, Any]:
    """Flatten the pipeline result into the fields we persist + render."""
    summary: dict[str, Any] = result.get("summary") or {}
    nlp: dict[str, Any] = result.get("nlp") or {}
    extraction: dict[str, Any] = result.get("extraction") or {}

    return {
        "plain_language_summary": summary.get("plain_language_summary"),
        "flagged_issues": summary.get("flagged_issues") or [],
        "deadlines": summary.get("deadlines") or [],
        "coverage_limits": summary.get("coverage_limits") or [],
        "required_actions": summary.get("required_actions") or [],
        "warnings": summary.get("warnings") or [],
        "glossary": summary.get("glossary") or [],
        "coverage_scope": summary.get("coverage_scope") or [],
        "deductible": summary.get("deductible"),
        "verification": summary.get("verification")
        or {"checked": False, "total": 0, "verified_count": 0},
        "summary_provider": summary.get("provider"),
        "nlp": {
            "dates": nlp.get("dates") or [],
            "money": nlp.get("money") or [],
            "organizations": nlp.get("organizations") or [],
            "provider": nlp.get("provider"),
        },
        "extraction_meta": {
            "page_count": extraction.get("page_count"),
            "ocr_pages": extraction.get("ocr_pages"),
            "character_count": extraction.get("character_count"),
        },
    }
