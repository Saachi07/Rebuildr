"""Safe text extraction for native, multi-page PDF documents."""

from __future__ import annotations

import re
from os import PathLike
from pathlib import Path
from typing import BinaryIO

from .exceptions import InvalidPDFError
from .models import ExtractionResult
from .ocr import OCREngine, PaddleOCREngine

DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024
DEFAULT_MAX_PAGES = 100
DEFAULT_OCR_DPI = 300


def _read_pdf(source: bytes | bytearray | PathLike[str] | BinaryIO) -> bytes:
    if isinstance(source, (bytes, bytearray)):
        return bytes(source)
    if isinstance(source, (str, PathLike)):
        try:
            return Path(source).read_bytes()
        except OSError as exc:
            raise InvalidPDFError("The PDF could not be read.") from exc
    if hasattr(source, "read"):
        data = source.read()
        if isinstance(data, bytes):
            return data
    raise InvalidPDFError("The uploaded document must be a PDF file.")


def annotate_pages(page_texts: list[str]) -> str:
    """Join per-page texts with [PAGE n] markers for the Gemini prompt.

    The summarizer asks Gemini to report the page number each verbatim quote
    came from; these markers are the only page-number signal it gets. Pages
    without extractable text are skipped entirely so the model never cites an
    empty page.
    """
    parts = []
    for index, page_text in enumerate(page_texts):
        if page_text.strip():
            parts.append(f"[PAGE {index + 1}]\n{page_text.strip()}")
    return "\n\n".join(parts)


def _clean_page_text(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text_from_pdf(
    source: bytes | bytearray | PathLike[str] | BinaryIO,
    *,
    max_file_size: int = DEFAULT_MAX_FILE_SIZE,
    max_pages: int = DEFAULT_MAX_PAGES,
    use_ocr: bool = True,
    ocr_engine: OCREngine | None = None,
    ocr_dpi: int = DEFAULT_OCR_DPI,
) -> ExtractionResult:
    """Extract text from a PDF using PyMuPDF, with PaddleOCR fallback for image-only pages."""

    data = _read_pdf(source)
    if not data.startswith(b"%PDF-"):
        raise InvalidPDFError("The uploaded document is not a valid PDF.")
    if len(data) > max_file_size:
        raise InvalidPDFError(
            f"The PDF exceeds the {max_file_size // (1024 * 1024)} MB size limit."
        )

    try:
        import fitz
    except ImportError as exc:
        raise InvalidPDFError(
            "PDF extraction is unavailable because PyMuPDF is not installed."
        ) from exc

    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise InvalidPDFError("The PDF is damaged or cannot be opened.") from exc

    try:
        if document.needs_pass:
            raise InvalidPDFError("Password-protected PDFs are not supported.")
        if document.page_count > max_pages:
            raise InvalidPDFError(f"The PDF exceeds the {max_pages}-page limit.")

        pages = []
        # One entry per physical page (empty string when nothing extractable)
        # so page_texts indexes stay aligned with page numbers.
        page_texts: list[str] = []
        pages_with_text = 0
        native_text_pages = 0
        ocr_pages = 0
        active_ocr_engine = ocr_engine
        warnings = []
        for index, page in enumerate(document):
            try:
                cleaned = _clean_page_text(page.get_text("text"))
            except Exception:
                cleaned = ""
                warnings.append(
                    f"Native text extraction failed on page {index + 1}; OCR fallback "
                    "was attempted."
                )
            page_source = "native"
            if not cleaned and use_ocr:
                if active_ocr_engine is None:
                    active_ocr_engine = PaddleOCREngine()
                pixmap = page.get_pixmap(dpi=ocr_dpi, alpha=False)
                cleaned = _clean_page_text(
                    active_ocr_engine.extract_text(pixmap.tobytes("png"))
                )
                page_source = "ocr"
            if cleaned:
                pages_with_text += 1
                if page_source == "ocr":
                    ocr_pages += 1
                else:
                    native_text_pages += 1
                pages.append(f"--- Page {index + 1} ({page_source}) ---\n{cleaned}")
            else:
                warnings.append(f"Page {index + 1} contains no extractable text.")
            page_texts.append(cleaned)

        if pages_with_text == 0:
            warnings.append(
                "No text was found after native extraction and OCR."
            )
        elif pages_with_text < document.page_count:
            warnings.append(
                "Some pages contained no extractable text after available processing."
            )
        if ocr_pages:
            warnings.append(
                f"OCR was used for {ocr_pages} page(s). Verify OCR-derived text "
                "against the original document."
            )

        text = "\n\n".join(pages)

        return ExtractionResult(
            text=text,
            page_count=document.page_count,
            pages_with_text=pages_with_text,
            character_count=len(text),
            native_text_pages=native_text_pages,
            ocr_pages=ocr_pages,
            ocr_engine=active_ocr_engine.name if ocr_pages else None,
            warnings=warnings,
            page_texts=page_texts,
        )
    finally:
        document.close()
