"""OCR adapters used when a PDF page has no selectable text."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Protocol

from .exceptions import DocumentProcessingError


class OCRError(DocumentProcessingError):
    """Raised when OCR cannot process a page."""


class OCREngine(Protocol):
    """Interface for page-image OCR implementations."""

    name: str

    def extract_text(self, image_bytes: bytes) -> str:
        """Return text recognized from an encoded page image."""


def _result_json(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", result)
    if callable(payload):
        payload = payload()
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("res")
    return nested if isinstance(nested, dict) else payload


class PaddleOCREngine:
    """Lazy PaddleOCR 3.x adapter using the mobile English OCR pipeline."""

    name = "paddleocr"

    def __init__(self, *, language: str = "en", minimum_confidence: float = 0.5):
        self.language = language
        self.minimum_confidence = minimum_confidence
        self._pipeline: Any | None = None

    def _get_pipeline(self) -> Any:
        if self._pipeline is not None:
            return self._pipeline
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise OCRError(
                "OCR is required, but PaddleOCR is not installed. Install "
                "pdf_and_summary/requirements-ocr.txt."
            ) from exc
        try:
            self._pipeline = PaddleOCR(
                lang=self.language,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        except Exception as exc:
            raise OCRError("PaddleOCR could not initialize.") from exc
        return self._pipeline

    def extract_text(self, image_bytes: bytes) -> str:
        if not image_bytes:
            return ""

        image_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as image:
                image.write(image_bytes)
                image_path = image.name

            results = self._get_pipeline().predict(image_path)
            lines = []
            for result in results:
                payload = _result_json(result)
                texts = payload.get("rec_texts", [])
                scores = payload.get("rec_scores", [])
                for index, text in enumerate(texts):
                    cleaned = str(text).strip()
                    score = float(scores[index]) if index < len(scores) else 1.0
                    if cleaned and score >= self.minimum_confidence:
                        lines.append(cleaned)
            return "\n".join(lines)
        except OCRError:
            raise
        except Exception as exc:
            raise OCRError("PaddleOCR could not process a PDF page.") from exc
        finally:
            if image_path:
                Path(image_path).unlink(missing_ok=True)
