"""PDF extraction and plain-language document summary tools."""

from .config import load_env_file
from .extractor import extract_text_from_pdf
from .models import Deadline, DocumentSummary, ExtractionResult, FlaggedIssue
from .ocr import OCREngine, OCRError, PaddleOCREngine
from .pipeline import process_pdf
from .summarizer import GeminiSummarizer, summarize_document

__all__ = [
    "DocumentSummary",
    "Deadline",
    "ExtractionResult",
    "FlaggedIssue",
    "GeminiSummarizer",
    "OCREngine",
    "OCRError",
    "PaddleOCREngine",
    "extract_text_from_pdf",
    "load_env_file",
    "process_pdf",
    "summarize_document",
]
