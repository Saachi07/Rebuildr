"""Public exceptions raised by the PDF and summary pipeline."""


class DocumentProcessingError(Exception):
    """Base exception for errors safe to show to an API caller."""


class InvalidPDFError(DocumentProcessingError):
    """Raised when an upload is not a usable PDF."""


class SummaryError(DocumentProcessingError):
    """Raised when a summary provider returns an unusable response."""
