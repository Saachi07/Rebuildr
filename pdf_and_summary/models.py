"""Structured results returned by the document-processing pipeline.

Several models carry a verbatim citation triple (source_quote, page_number,
verified). A litigation lawyer reviewing this product told us that quoting
the contract sentence verbatim is the required mitigation for the legal risk
of simplifying insurance language, so every extracted fact that a user might
act on carries the exact sentence it came from, the page it appears on, and
whether we could verify that quote against the locally extracted text.

verified semantics:
- True: the quote was found in the locally extracted text (whitespace and
  case normalized, cross-page matches allowed).
- False: the quote was not found; the UI labels it "unverified".
- None: there is no local text to check against (image uploads).
"""

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
    # Per-page plain text, indexed page 1 = page_texts[0]. Pages without
    # extractable text are kept as empty strings so indexes stay aligned
    # with physical page numbers for quote verification and [PAGE n] markers.
    page_texts: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FlaggedIssue:
    issue_type: str
    message: str
    source_quote: str | None = None
    page_number: int | None = None
    verified: bool | None = None


@dataclass(frozen=True)
class Deadline:
    task: str
    date: str
    source_quote: str | None = None
    page_number: int | None = None
    verified: bool | None = None


@dataclass(frozen=True)
class CoverageLimit:
    """A coverage amount with its verbatim citation.

    Previously coverage_limits was a list of plain strings; the citation
    requirement turned each entry into an object. The text field carries the
    plain-language line the UI renders.
    """

    text: str
    source_quote: str | None = None
    page_number: int | None = None
    verified: bool | None = None


@dataclass(frozen=True)
class GlossaryTerm:
    """An insurance term defined in plain language, cited to the document."""

    term: str
    definition: str
    source_quote: str | None = None
    page_number: int | None = None


@dataclass(frozen=True)
class CoverageScopeItem:
    """What the document actually says about one coverage category.

    A real survivor was told her personal property coverage was "only
    clothing and shoes" when the policy text covered furniture and
    appliances too. coverage_scope exists so users can see what the policy
    text actually says, with a citation, instead of relying on what someone
    told them on the phone.
    """

    item: str
    status: str  # "covered" | "not_covered" | "conditional" | "unclear"
    detail: str
    source_quote: str | None = None
    page_number: int | None = None
    verified: bool | None = None


@dataclass(frozen=True)
class Deductible:
    """The policy deductible, with a plain-language explanation.

    Percentage deductibles are a known surprise for survivors (2 percent of
    a $400,000 dwelling is $8,000, not $2), so detail must explain what the
    percentage applies to in plain language.
    """

    amount: str | None
    type: str  # "fixed" | "percentage" | "unknown"
    detail: str
    source_quote: str | None = None
    page_number: int | None = None
    verified: bool | None = None


@dataclass(frozen=True)
class DocumentSummary:
    plain_language_summary: str
    flagged_issues: list[FlaggedIssue] = field(default_factory=list)
    deadlines: list[Deadline] = field(default_factory=list)
    coverage_limits: list[CoverageLimit] = field(default_factory=list)
    required_actions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    glossary: list[GlossaryTerm] = field(default_factory=list)
    coverage_scope: list[CoverageScopeItem] = field(default_factory=list)
    deductible: Deductible | None = None
    # {"checked": bool, "total": int, "verified_count": int} set by the
    # verification pass; checked stays False when no local text exists.
    verification: dict[str, Any] = field(
        default_factory=lambda: {"checked": False, "total": 0, "verified_count": 0}
    )
    provider: str = "local"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
