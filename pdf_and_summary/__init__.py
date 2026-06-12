"""PDF extraction and plain-language document summary tools."""

from .ai_guard import sanitize_for_prompt, validate_model_output, wrap_untrusted
from .config import load_env_file
from .extractor import annotate_pages, extract_text_from_pdf
from .models import (
    CoverageLimit,
    CoverageScopeItem,
    Deadline,
    Deductible,
    DocumentSummary,
    ExtractionResult,
    FlaggedIssue,
    GlossaryTerm,
)
from .ocr import OCREngine, OCRError, PaddleOCREngine
from .pipeline import process_pdf
from .redactor import RedactionMap, Redactor
from .summarizer import GeminiSummarizer, summarize_document
from .verification import normalize_for_match, quote_found, verify_summary

__all__ = [
    "CoverageLimit",
    "CoverageScopeItem",
    "Deadline",
    "Deductible",
    "DocumentSummary",
    "ExtractionResult",
    "FlaggedIssue",
    "GeminiSummarizer",
    "GlossaryTerm",
    "OCREngine",
    "OCRError",
    "PaddleOCREngine",
    "RedactionMap",
    "Redactor",
    "annotate_pages",
    "extract_text_from_pdf",
    "load_env_file",
    "normalize_for_match",
    "process_pdf",
    "quote_found",
    "sanitize_for_prompt",
    "summarize_document",
    "validate_model_output",
    "verify_summary",
    "wrap_untrusted",
]
