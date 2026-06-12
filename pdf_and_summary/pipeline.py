"""End-to-end PDF extraction and summary orchestration."""

from __future__ import annotations

import dataclasses
from os import PathLike
from typing import Any, BinaryIO

from .exceptions import SummaryError
from .extractor import annotate_pages, extract_text_from_pdf
from .summarizer import GeminiSummarizer, summarize_document
from .verification import verify_summary


def process_pdf(
    source: bytes | bytearray | PathLike[str] | BinaryIO,
    *,
    summarizer: GeminiSummarizer | None = None,
    prefer_gemini: bool = True,
    use_ocr: bool = True,
    use_nlp: bool = True,
    redact_pii: bool = False,
    rehydrate: bool = True,
) -> dict[str, Any]:
    """Extract and summarize a PDF document.

    Order of operations matters for quote verification: Gemini sees the
    redacted, page-marked text, so source_quote verification runs against
    the redacted page texts (the text the model could actually quote from),
    and only after that are placeholders rehydrated back to the originals,
    including inside source_quote fields.
    """
    extraction = extract_text_from_pdf(source, use_ocr=use_ocr)
    if not extraction.text.strip():
        raise SummaryError("No text could be extracted from this document.")

    result: dict[str, Any] = {"extraction": extraction.to_dict()}
    nlp_analysis = None
    summary_use_nlp = use_nlp

    if use_nlp:
        try:
            from .nlp import NLPError, SpaCyNLPEngine

            nlp_analysis = SpaCyNLPEngine().analyze(extraction.text)
            result["nlp"] = nlp_analysis.to_dict()
        except NLPError:
            summary_use_nlp = False

    # Per-page texts feed both the [PAGE n] markers Gemini cites and the
    # local quote-verification pass.
    page_texts = list(extraction.page_texts)
    rmap = None
    if redact_pii:
        from .redactor import Redactor

        redactor = Redactor(use_nlp=use_nlp)
        redacted_full, rmap = redactor.redact(extraction.text)
        # Redact each page with the same map so placeholders stay stable
        # across the full text, the page markers, and verification.
        page_texts = [rmap.redact_text(p) for p in page_texts]
        result["redaction"] = {"enabled": True, "rehydrated": rehydrate, **rmap.stats()}
        result["extraction"]["text"] = redacted_full
        # Never expose raw per-page text once redaction is requested.
        result["extraction"]["page_texts"] = page_texts
        if "nlp" in result:
            nlp_out = result["nlp"]
            for key in ("date_sentences", "top_sentences"):
                if key in nlp_out:
                    nlp_out[key] = [rmap.redact_text(s) for s in nlp_out[key]]

    # Gemini receives [PAGE n] markers so it can report the page each
    # verbatim quote came from; the markers are also the only page signal
    # available to local fallback summaries, which simply strip them.
    summary_text = annotate_pages(page_texts) or extraction.text

    summary = summarize_document(
        summary_text,
        summarizer=summarizer,
        prefer_gemini=prefer_gemini,
        use_nlp=summary_use_nlp,
        nlp_analysis=nlp_analysis,
    )

    # Verify quotes against the (possibly redacted) text the model saw,
    # BEFORE rehydration swaps placeholders back to original PII.
    summary = verify_summary(summary, page_texts)

    # Rehydration happens locally after the API call, so placeholders that Gemini
    # echoes into any output field can be safely swapped back to the originals.
    if redact_pii and rehydrate and rmap:
        summary = _rehydrate_summary(summary, rmap)

    result["summary"] = summary.to_dict()
    return result


def _rehydrate_text(rmap: Any, value: str | None) -> str | None:
    """Rehydrate an optional string; citation fields may legitimately be None."""
    if value is None:
        return None
    return rmap.rehydrate(value)


def _rehydrate_summary(summary: Any, rmap: Any) -> Any:
    """Swap placeholders back to originals across every output field,
    including the verbatim source_quote citations."""
    deductible = summary.deductible
    if deductible is not None:
        deductible = dataclasses.replace(
            deductible,
            amount=_rehydrate_text(rmap, deductible.amount),
            detail=rmap.rehydrate(deductible.detail),
            source_quote=_rehydrate_text(rmap, deductible.source_quote),
        )
    return dataclasses.replace(
        summary,
        plain_language_summary=rmap.rehydrate(summary.plain_language_summary),
        flagged_issues=[
            dataclasses.replace(
                issue,
                message=rmap.rehydrate(issue.message),
                source_quote=_rehydrate_text(rmap, issue.source_quote),
            )
            for issue in summary.flagged_issues
        ],
        deadlines=[
            dataclasses.replace(
                deadline,
                task=rmap.rehydrate(deadline.task),
                date=rmap.rehydrate(deadline.date),
                source_quote=_rehydrate_text(rmap, deadline.source_quote),
            )
            for deadline in summary.deadlines
        ],
        coverage_limits=[
            dataclasses.replace(
                limit,
                text=rmap.rehydrate(limit.text),
                source_quote=_rehydrate_text(rmap, limit.source_quote),
            )
            for limit in summary.coverage_limits
        ],
        glossary=[
            dataclasses.replace(
                term,
                term=rmap.rehydrate(term.term),
                definition=rmap.rehydrate(term.definition),
                source_quote=_rehydrate_text(rmap, term.source_quote),
            )
            for term in summary.glossary
        ],
        coverage_scope=[
            dataclasses.replace(
                scope,
                detail=rmap.rehydrate(scope.detail),
                source_quote=_rehydrate_text(rmap, scope.source_quote),
            )
            for scope in summary.coverage_scope
        ],
        deductible=deductible,
        required_actions=[rmap.rehydrate(s) for s in summary.required_actions],
        warnings=[rmap.rehydrate(s) for s in summary.warnings],
    )
