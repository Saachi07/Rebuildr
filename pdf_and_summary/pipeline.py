"""End-to-end PDF extraction and summary orchestration."""

from __future__ import annotations

import dataclasses
from os import PathLike
from typing import Any, BinaryIO

from .exceptions import SummaryError
from .extractor import extract_text_from_pdf
from .summarizer import GeminiSummarizer, summarize_document


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
    """Extract and summarize a PDF document."""
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

    summary_text = extraction.text
    rmap = None
    if redact_pii:
        from .redactor import Redactor

        redactor = Redactor(use_nlp=use_nlp)
        summary_text, rmap = redactor.redact(extraction.text)
        result["redaction"] = {"enabled": True, "rehydrated": rehydrate, **rmap.stats()}
        result["extraction"]["text"] = summary_text
        if "nlp" in result:
            nlp_out = result["nlp"]
            for key in ("date_sentences", "top_sentences"):
                if key in nlp_out:
                    nlp_out[key] = [rmap.redact_text(s) for s in nlp_out[key]]

    summary = summarize_document(
        summary_text,
        summarizer=summarizer,
        prefer_gemini=prefer_gemini,
        use_nlp=summary_use_nlp,
        nlp_analysis=nlp_analysis,
    )

    # Rehydration happens locally after the API call, so placeholders that Gemini
    # echoes into any output field can be safely swapped back to the originals.
    if redact_pii and rehydrate and rmap:
        summary = dataclasses.replace(
            summary,
            plain_language_summary=rmap.rehydrate(summary.plain_language_summary),
            flagged_issues=[
                dataclasses.replace(issue, message=rmap.rehydrate(issue.message))
                for issue in summary.flagged_issues
            ],
            deadlines=[
                dataclasses.replace(
                    deadline,
                    task=rmap.rehydrate(deadline.task),
                    date=rmap.rehydrate(deadline.date),
                )
                for deadline in summary.deadlines
            ],
            coverage_limits=[rmap.rehydrate(s) for s in summary.coverage_limits],
            required_actions=[rmap.rehydrate(s) for s in summary.required_actions],
            warnings=[rmap.rehydrate(s) for s in summary.warnings],
        )

    result["summary"] = summary.to_dict()
    return result
