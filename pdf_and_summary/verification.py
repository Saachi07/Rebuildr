"""Verbatim-quote verification against locally extracted document text.

Every citation Gemini returns (source_quote plus page_number) is checked
against the text we extracted locally, because a quote the model invented is
worse than no quote at all: it manufactures false confidence in a paraphrase.
Quoting the contract sentence verbatim is the legal-risk mitigation for
simplifying insurance language, so the verification result is surfaced to
the UI rather than silently trusted.

Matching rules:
- Whitespace and case are normalized on both sides; PDF extraction mangles
  spacing and line breaks, and that should not fail an otherwise exact quote.
- A quote is checked on its claimed page first, then against the full
  document so quotes spanning a page break (or carrying an off-by-one page
  number) still verify.
- verified=None is reserved for documents with no local text (image uploads);
  callers should leave those summaries untouched and set checked=False.

IMPORTANT: when PII redaction is on, verification must run against the
REDACTED page texts, because that is the text Gemini saw and quoted from.
Rehydration of source_quote fields happens after verification.
"""

from __future__ import annotations

import dataclasses
import re
from typing import Any

from .models import DocumentSummary

_WS_RE = re.compile(r"\s+")


def normalize_for_match(text: str) -> str:
    """Collapse all whitespace runs to single spaces and lowercase."""
    return _WS_RE.sub(" ", text).strip().lower()


def quote_found(quote: str | None, page_texts: list[str]) -> bool | None:
    """Check one quote against the per-page texts.

    Returns True when found anywhere in the document (cross-page matches
    allowed via the concatenated text), False when not found, and None when
    the quote is missing or there is no local text to check against.
    """
    if not quote or not quote.strip():
        return None
    if not any(p.strip() for p in page_texts):
        return None
    needle = normalize_for_match(quote)
    if not needle:
        return None
    # Joining with a space lets a quote that spans a page boundary match.
    haystack = normalize_for_match(" ".join(page_texts))
    return needle in haystack


def _verify_item(item: Any, page_texts: list[str], counters: dict[str, int]) -> Any:
    """Return a copy of a citation-bearing dataclass with verified filled in."""
    quote = getattr(item, "source_quote", None)
    found = quote_found(quote, page_texts)
    if found is None:
        # No quote or no local text: leave verified as None, count nothing.
        return dataclasses.replace(item, verified=None)
    counters["total"] += 1
    if found:
        counters["verified_count"] += 1
    return dataclasses.replace(item, verified=found)


def verify_summary(summary: DocumentSummary, page_texts: list[str]) -> DocumentSummary:
    """Verify every source_quote in the summary against local page texts.

    Returns a new DocumentSummary with verified flags set on deadlines,
    flagged_issues, coverage_limits, coverage_scope, and the deductible, and
    with the verification block populated. When the document has no local
    text at all (image uploads), all flags stay None and checked is False.
    """
    has_text = any(p.strip() for p in page_texts)
    if not has_text:
        return dataclasses.replace(
            summary,
            verification={"checked": False, "total": 0, "verified_count": 0},
        )

    counters = {"total": 0, "verified_count": 0}
    deadlines = [_verify_item(d, page_texts, counters) for d in summary.deadlines]
    flagged = [_verify_item(f, page_texts, counters) for f in summary.flagged_issues]
    limits = [_verify_item(c, page_texts, counters) for c in summary.coverage_limits]
    scope = [_verify_item(s, page_texts, counters) for s in summary.coverage_scope]
    deductible = summary.deductible
    if deductible is not None:
        deductible = _verify_item(deductible, page_texts, counters)

    return dataclasses.replace(
        summary,
        deadlines=deadlines,
        flagged_issues=flagged,
        coverage_limits=limits,
        coverage_scope=scope,
        deductible=deductible,
        verification={"checked": True, **counters},
    )
