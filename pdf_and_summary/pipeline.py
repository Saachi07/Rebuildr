"""End-to-end PDF extraction and summary orchestration."""

from __future__ import annotations

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
    use_markitdown: bool = False,
) -> dict[str, Any]:
    """Extract and summarize a PDF document.

    Parameters
    ----------
    use_nlp:
        Run spaCy NER after extraction and include an ``nlp`` key in the result.
        Silently skipped when spaCy or its model is not installed.
    use_markitdown:
        Use MarkItDown to convert native PDF pages to structured Markdown before
        summarisation. Falls back to plain PyMuPDF text when not installed.
    """
    extraction = extract_text_from_pdf(
        source, use_ocr=use_ocr, use_markitdown=use_markitdown
    )
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

    summary = summarize_document(
        extraction.text,
        summarizer=summarizer,
        prefer_gemini=prefer_gemini,
        use_nlp=summary_use_nlp,
        nlp_analysis=nlp_analysis,
    )
    result["summary"] = summary.to_dict()
    return result
