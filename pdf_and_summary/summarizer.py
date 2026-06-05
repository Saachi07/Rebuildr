"""Plain-language summaries with optional Gemini structured generation."""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .exceptions import SummaryError
from .models import Deadline, DocumentSummary, FlaggedIssue

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_MAX_INPUT_CHARACTERS = 300_000
DEFAULT_MAX_RETRIES = 3
RETRYABLE_HTTP_STATUS_CODES = {429, 500, 502, 503, 504}

SYSTEM_PROMPT = """You simplify disaster-recovery and insurance documents.
Accuracy is more important than completion. Never invent a deadline, amount,
coverage, contact, or required action. Use plain language at a grade 8 reading
level or below.

The result will appear in a Documents Page with a Document Summary card and a
Deadlines table. Flag only issues supported by the text. Use one of these flag
types: MISSING, UNRELIABLE_DATA, ACTION_REQUIRED, WARNING. For a deadline, use
the task and date stated in the document; reproduce the date exactly as written.
If the date is ambiguous, do not put it in deadlines; add an UNRELIABLE_DATA
flag instead. Clearly say when the document does not provide enough information.

For coverage_limits, include the monetary amount and what it covers in the same
string (e.g. "Fire and water damage up to $50,000 CAD"). For required_actions,
start each entry with an imperative verb (Submit, Contact, Report, Provide).

Return only valid JSON with this exact shape:
{
  "plain_language_summary": "string",
  "flagged_issues": [
    {"issue_type": "MISSING", "message": "string"}
  ],
  "deadlines": [
    {"task": "string", "date": "string"}
  ],
  "coverage_limits": ["string"],
  "required_actions": ["string"],
  "warnings": ["string"]
}
"""


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _flagged_issues(value: Any) -> list[FlaggedIssue]:
    if not isinstance(value, list):
        return []
    issues = []
    allowed_types = {"MISSING", "UNRELIABLE_DATA", "ACTION_REQUIRED", "WARNING"}
    for item in value:
        if not isinstance(item, dict):
            continue
        issue_type = str(item.get("issue_type", "WARNING")).strip().upper()
        message = str(item.get("message", "")).strip()
        if issue_type not in allowed_types:
            issue_type = "WARNING"
        if message:
            issues.append(FlaggedIssue(issue_type=issue_type, message=message))
    return issues


def _deadlines(value: Any) -> list[Deadline]:
    if not isinstance(value, list):
        return []
    deadlines = []
    for item in value:
        if not isinstance(item, dict):
            continue
        task = str(item.get("task", "")).strip()
        date = str(item.get("date", "")).strip()
        if task and date:
            deadlines.append(Deadline(task=task, date=date))
    return deadlines


def _summary_from_payload(payload: dict[str, Any], provider: str) -> DocumentSummary:
    summary = payload.get("plain_language_summary")
    if not isinstance(summary, str) or not summary.strip():
        raise SummaryError("The summary provider did not return a usable summary.")
    return DocumentSummary(
        plain_language_summary=summary.strip(),
        flagged_issues=_flagged_issues(payload.get("flagged_issues")),
        deadlines=_deadlines(payload.get("deadlines")),
        coverage_limits=_strings(payload.get("coverage_limits")),
        required_actions=_strings(payload.get("required_actions")),
        warnings=_strings(payload.get("warnings")),
        provider=provider,
    )


class GeminiSummarizer:
    """Small Gemini REST client with no SDK dependency."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: int = 30,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        self.timeout = timeout
        self.max_retries = max_retries
        if not self.api_key:
            raise SummaryError(
                "GEMINI_API_KEY is required for Gemini summaries. Export it in "
                "your shell or add it to the ignored local .env file. Use --local "
                "only when you intentionally want the local fallback."
            )

    def summarize(self, text: str) -> DocumentSummary:
        if not text.strip():
            raise SummaryError("There is no document text to summarize.")

        truncated = len(text) > DEFAULT_MAX_INPUT_CHARACTERS
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(self.model, safe='')}:generateContent"
        )
        body = {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": "Simplify this document and identify only facts "
                            "stated in it:\n\n" + text[:DEFAULT_MAX_INPUT_CHARACTERS]
                        }
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "plain_language_summary": {"type": "STRING"},
                        "flagged_issues": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "issue_type": {
                                        "type": "STRING",
                                        "enum": [
                                            "MISSING",
                                            "UNRELIABLE_DATA",
                                            "ACTION_REQUIRED",
                                            "WARNING",
                                        ],
                                    },
                                    "message": {"type": "STRING"},
                                },
                                "required": ["issue_type", "message"],
                            },
                        },
                        "deadlines": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "task": {"type": "STRING"},
                                    "date": {"type": "STRING"},
                                },
                                "required": ["task", "date"],
                            },
                        },
                        "coverage_limits": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                        "required_actions": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                        "warnings": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                    },
                    "required": [
                        "plain_language_summary",
                        "flagged_issues",
                        "deadlines",
                        "coverage_limits",
                        "required_actions",
                        "warnings",
                    ],
                },
            },
        }
        request = Request(
            endpoint,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            method="POST",
        )
        response_payload = self._send_request(request)
        try:
            content = response_payload["candidates"][0]["content"]["parts"][0]["text"]
            result = _summary_from_payload(json.loads(content), f"gemini:{self.model}")
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise SummaryError("Gemini returned an invalid structured response.") from exc
        if truncated:
            import dataclasses
            result = dataclasses.replace(
                result,
                warnings=result.warnings + [
                    f"Only the first {DEFAULT_MAX_INPUT_CHARACTERS:,} characters were "
                    "sent to Gemini. Review the full document for additional details."
                ],
            )
        return result

    def _send_request(self, request: Request) -> dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    return json.loads(response.read().decode("utf-8"))
            except HTTPError as exc:
                if exc.code not in RETRYABLE_HTTP_STATUS_CODES:
                    raise SummaryError(
                        f"Gemini rejected the request with HTTP status {exc.code}."
                    ) from exc
                last_error: Exception = exc
            except URLError as exc:
                last_error = exc
            except json.JSONDecodeError as exc:
                raise SummaryError("Gemini returned a non-JSON response.") from exc

            if attempt < self.max_retries:
                time.sleep(2**attempt)

        raise SummaryError(
            "Gemini is temporarily unavailable after multiple attempts."
        ) from last_error


def _matching_sentences(text: str, keywords: tuple[str, ...], limit: int = 8) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
    matches = []
    for sentence in sentences:
        cleaned = re.sub(r"\s+", " ", sentence).strip(" -")
        if cleaned and any(word in cleaned.lower() for word in keywords):
            matches.append(cleaned)
        if len(matches) == limit:
            break
    return matches


def _local_deadlines(text: str) -> list[Deadline]:
    date_pattern = re.compile(
        r"\b(?:January|February|March|April|May|June|July|August|September|"
        r"October|November|December)\s+\d{1,2},\s+\d{4}\b"
        r"|\b\d{4}-\d{2}-\d{2}\b",
        re.IGNORECASE,
    )
    deadlines = []
    for sentence in _matching_sentences(
        text, ("deadline", "due", "no later than", "before ", "by "), limit=12
    ):
        date = date_pattern.search(sentence)
        if date:
            deadlines.append(Deadline(task=sentence, date=date.group(0)))
    return deadlines[:8]


def _regex_local_summary(text: str) -> DocumentSummary:
    """Regex-based local summary; used when spaCy is unavailable."""
    cleaned = re.sub(r"--- Page \d+(?: \((?:native|ocr)\))? ---", "", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        raise SummaryError("There is no document text to summarize.")

    opening = cleaned[:700].rsplit(" ", 1)[0]
    if len(cleaned) > len(opening):
        opening += "..."
    deadlines = _local_deadlines(text)
    limits = _matching_sentences(
        text, ("coverage", "limit", "maximum", "deductible", "$", "cad")
    )
    actions = _matching_sentences(
        text, ("must ", "required", "submit", "provide", "contact", "notify", "report")
    )
    flagged_issues = [
        FlaggedIssue(issue_type="ACTION_REQUIRED", message=action)
        for action in actions
    ]
    ambiguous_deadlines = _matching_sentences(
        text, ("deadline", "due", "within ", "no later than", "before ", "by ")
    )
    if ambiguous_deadlines and not deadlines:
        flagged_issues.append(
            FlaggedIssue(
                issue_type="UNRELIABLE_DATA",
                message="A deadline may be present, but the local summary could not "
                "identify a clear calendar date. Review the original document.",
            )
        )
    return DocumentSummary(
        plain_language_summary=opening,
        flagged_issues=flagged_issues,
        deadlines=deadlines,
        coverage_limits=limits,
        required_actions=actions,
        warnings=[
            "This is a local extractive summary, not legal advice. Verify all details "
            "against the original document."
        ],
        provider="local-extractive",
    )


def _nlp_local_summary(text: str, analysis: Any = None) -> DocumentSummary:
    """NLP-enhanced local summary using spaCy NER and sentence ranking."""
    from .nlp import (
        SpaCyNLPEngine,
        contains_action_term,
        contains_coverage_term,
        contains_deadline_term,
        is_calendar_date,
    )

    cleaned = re.sub(r"--- Page \d+(?: \((?:native|ocr)\))? ---", "", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        raise SummaryError("There is no document text to summarize.")

    if analysis is None:
        analysis = SpaCyNLPEngine().analyze(cleaned, top_n=15)

    # Build deadlines: DATE entities whose surrounding sentence contains
    # deadline-context words.
    deadlines: list[Deadline] = []
    for date_text, sent in zip(analysis.dates, analysis.date_sentences):
        if is_calendar_date(date_text) and contains_deadline_term(sent):
            deadlines.append(Deadline(task=sent, date=date_text))
    deadlines = deadlines[:8]

    # Coverage limits: sentences from top_sentences that mention coverage/money,
    # plus raw money amounts when no sentences qualify.
    coverage_sentences = [
        s for s in analysis.top_sentences
        if contains_coverage_term(s)
    ]
    if not coverage_sentences and analysis.money:
        coverage_sentences = [f"Amount: {m}" for m in analysis.money[:4]]
    coverage_limits = coverage_sentences[:8]

    # Required actions: sentences with action words from the ranked list.
    action_sentences = [
        s for s in analysis.top_sentences
        if contains_action_term(s)
    ]

    # Plain-language summary: leading top sentences (up to 5).
    summary_sentences = analysis.top_sentences[:5]
    if summary_sentences:
        opening = " ".join(summary_sentences)
    else:
        opening = cleaned[:700].rsplit(" ", 1)[0]
        if len(cleaned) > len(opening):
            opening += "..."

    flagged_issues = [
        FlaggedIssue(issue_type="ACTION_REQUIRED", message=action)
        for action in action_sentences[:6]
    ]
    if analysis.dates and not deadlines:
        flagged_issues.append(
            FlaggedIssue(
                issue_type="UNRELIABLE_DATA",
                message="Date references were found but could not be mapped to clear "
                "deadlines. Review the original document.",
            )
        )

    return DocumentSummary(
        plain_language_summary=opening,
        flagged_issues=flagged_issues,
        deadlines=deadlines,
        coverage_limits=coverage_limits,
        required_actions=action_sentences[:8],
        warnings=[
            "This is an NLP-enhanced local summary. Verify all details against the "
            "original document."
        ],
        provider="local-nlp",
    )


def _local_summary(text: str, *, use_nlp: bool = True, nlp_analysis: Any = None) -> DocumentSummary:
    """Try NLP-enhanced summary first; fall back to regex when spaCy is unavailable."""
    if not use_nlp:
        return _regex_local_summary(text)
    from .nlp import NLPError
    try:
        return _nlp_local_summary(text, nlp_analysis)
    except NLPError:
        return _regex_local_summary(text)


def summarize_document(
    text: str,
    *,
    summarizer: GeminiSummarizer | None = None,
    prefer_gemini: bool = True,
    use_nlp: bool = True,
    nlp_analysis: Any = None,
) -> DocumentSummary:
    """Summarize text with Gemini when configured, otherwise use a local fallback."""

    if summarizer is not None:
        return summarizer.summarize(text)
    if prefer_gemini and os.environ.get("GEMINI_API_KEY"):
        return GeminiSummarizer().summarize(text)
    return _local_summary(text, use_nlp=use_nlp, nlp_analysis=nlp_analysis)
