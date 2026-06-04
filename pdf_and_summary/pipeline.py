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
) -> dict[str, Any]:
    extraction = extract_text_from_pdf(source, use_ocr=use_ocr)
    if not extraction.text.strip():
        raise SummaryError(
            "No text could be extracted from this document."
        )
    summary = summarize_document(
        extraction.text,
        summarizer=summarizer,
        prefer_gemini=prefer_gemini,
    )
    return {
        "extraction": extraction.to_dict(),
        "summary": summary.to_dict(),
    }
