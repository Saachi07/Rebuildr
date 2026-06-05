"""Safe text extraction for native, multi-page PDF documents."""

from __future__ import annotations

import re
import tempfile
from os import PathLike
from pathlib import Path
from typing import BinaryIO

from .exceptions import InvalidPDFError
from .models import ExtractionResult
from .ocr import OCREngine, PaddleOCREngine

DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024
DEFAULT_MAX_PAGES = 100
DEFAULT_OCR_DPI = 300


def _extract_with_markitdown(data: bytes) -> str | None:
    """Convert PDF to Markdown using MarkItDown; returns None if unavailable or fails."""
    try:
        from markitdown import MarkItDown
    except ImportError:
        return None
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(data)
            tmp_path = f.name
        result = MarkItDown().convert(tmp_path)
        text = result.text_content
        return text.strip() if text and text.strip() else None
    except Exception:
        return None
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


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
    use_markitdown: bool = False,
) -> ExtractionResult:
    """Extract text from PDF; optionally use MarkItDown for structured Markdown output.

    When use_markitdown=True, native pages are converted to structured Markdown
    (preserving tables, headers, and lists) instead of raw extracted text. OCR
    pages are always appended as labelled blocks. Falls back to plain PyMuPDF
    text if MarkItDown is not installed or returns nothing.
    """

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
        extraction_format = "text"

        if use_markitdown and native_text_pages > 0:
            md_text = _extract_with_markitdown(data)
            if md_text:
                # Structured Markdown from MarkItDown for native pages,
                # labelled OCR blocks appended at the end.
                ocr_sections = [p for p in pages if "(ocr)" in p]
                parts = [md_text]
                parts.extend(ocr_sections)
                text = "\n\n".join(parts)
                extraction_format = "markdown"
            else:
                warnings.append(
                    "MarkItDown was requested but is not installed or returned no text; "
                    "fell back to plain PyMuPDF extraction."
                )

        return ExtractionResult(
            text=text,
            page_count=document.page_count,
            pages_with_text=pages_with_text,
            character_count=len(text),
            native_text_pages=native_text_pages,
            ocr_pages=ocr_pages,
            ocr_engine=active_ocr_engine.name if ocr_pages else None,
            warnings=warnings,
            extraction_format=extraction_format,
        )
    finally:
        document.close()
