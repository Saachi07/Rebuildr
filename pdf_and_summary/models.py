"""Structured results returned by the document-processing pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    page_count: int
    pages_with_text: int
    character_count: int
    native_text_pages: int = 0
    ocr_pages: int = 0
    ocr_engine: str | None = None
    warnings: list[str] = field(default_factory=list)
    extraction_format: str = "text"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FlaggedIssue:
    issue_type: str
    message: str


@dataclass(frozen=True)
class Deadline:
    task: str
    date: str


@dataclass(frozen=True)
class DocumentSummary:
    plain_language_summary: str
    flagged_issues: list[FlaggedIssue] = field(default_factory=list)
    deadlines: list[Deadline] = field(default_factory=list)
    coverage_limits: list[str] = field(default_factory=list)
    required_actions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    provider: str = "local"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
