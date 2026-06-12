"""Plain-language summaries with optional Gemini structured generation."""

from __future__ import annotations

import dataclasses
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

DEFAULT_MODEL = "gemini-3.1-flash-lite"
DEFAULT_MAX_INPUT_CHARACTERS = 300_000
DEFAULT_MAX_RETRIES = 3
RETRYABLE_HTTP_STATUS_CODES = {429, 500, 502, 503, 504}

SYSTEM_PROMPT = """You simplify disaster-recovery and insurance documents.
Accuracy is more important than completion. Never invent a deadline, amount,
coverage, contact, or required action. Use plain language at a grade 8 reading
level or below.

The result will appear in a Documents Page with a Document Summary card, a
Flagged Issues section, and a Deadlines table. Use these rules to decide where
each piece of information goes:

DEADLINES — every time-bound obligation or coverage fact stated in the document, including:
• Fixed calendar deadlines (e.g. "June 1, 2024")
• Event-triggered durations (e.g. "within 90 days of the loss", "within 20 days")
• Coverage or benefit periods (e.g. "June 1, 2024 to June 1, 2025")
• Maximum entitlement durations (e.g. "up to 24 months")
• Recurring obligations or recommended review cycles (e.g. "annually", "every three years")
Reproduce the date or duration exactly as written. If no time limit is stated at
all, do not invent one — the absence of a deadline is not a flagged issue.
A step with any stated time limit belongs in deadlines — do not move it to flagged_issues.
The "date" field must always contain a time expression — a calendar date, a duration
("within 90 days"), a coverage period, or a recurring cycle. NEVER put a dollar amount,
percentage, or monetary limit in the "date" field — those belong in coverage_limits.
Do NOT include in deadlines:
• Dates that merely record when a past event occurred (e.g. loss date, disaster date,
  letter date, claim filing date, policy issue date, evacuation order date) — these are
  historical facts, not obligations
• Discount qualification criteria or eligibility thresholds (e.g. "5+ years claims-free",
  "built within 10 years") — these describe conditions for a discount, not time-bound obligations
• Near-identical duplicates — if the same obligation has already been listed with
  essentially the same task description, do not add it again. However, if a relative
  duration ("within 90 days") and its corresponding fixed calendar date ("October 17,
  2024") appear as complementary information in different sentences or clauses, include
  BOTH as separate entries. Exception: if the document parenthetically equates them in
  a single clause such as "within 30 days of this letter (by September 28, 2024)",
  produce exactly ONE combined entry — do not create two separate entries for the same action.
• Context dates describing when a situation began rather than a deadline to act
  (e.g. "living expenses incurred since July 18" states a start date, not a deadline)

FLAGGED ISSUES — conditions or clauses that need the user's attention but are
not themselves time-bound obligations. The only valid issue_type values are:
MISSING, UNRELIABLE_DATA, ACTION_REQUIRED, WARNING. Always check for and flag when present:
- A vacancy clause or a policy condition that requires the insured to have or maintain
  a specific physical installation (e.g. a backwater valve required for sewer backup
  coverage) or valid inspection certificate (e.g. WETT certification for a wood-burning
  appliance) — flag as ACTION_REQUIRED and also include in required_actions. This rule
  is for ongoing physical maintenance conditions only, not document submissions.
- A coinsurance or underinsurance clause that can reduce claim payouts if
  coverage is below replacement cost (WARNING)
- Any percentage-based deductible rather than a fixed dollar amount (WARNING)
- Required supporting documents, receipts, or attachments that are explicitly noted
  as incomplete, partial, or missing in the document (MISSING)
- A specific monetary amount, settlement figure, coverage total, or quantitative
  value that is explicitly marked "not yet determined", "TBD", "pending", or
  similarly unknown because an assessment has not been completed — flag as
  UNRELIABLE_DATA only when the document itself marks the value as unknown. Do
  NOT flag narrative unknowns (e.g. "return date unknown pending structural
  assessment"), the absence of explicit deadlines, or inherently open-ended
  situations — these are not unreliable data
- If the document is a completed Proof of Loss form, claim submission form, or
  claim adjustment letter (NOT a standard insurance policy document that lists
  covered or excluded perils) and the insured's stated cause of loss or damage
  specifically describes overland flooding, water intrusion, or sewer backup,
  flag as WARNING in flagged_issues that the policyholder should verify their
  policy explicitly includes an Overland Water or water-backup endorsement, as
  standard home insurance policies commonly exclude these perils. Do NOT flag
  this for a policy document that simply lists overland flooding as an excluded
  peril in its exclusions section — that information already belongs in warnings.
  When this is flagged in flagged_issues, do NOT also add it to warnings.
  IMPORTANT: Do NOT apply this rule when the stated cause of loss is wildfire,
  wind, hail, earthquake, or any non-water peril — even if water was used in
  firefighting suppression or is mentioned incidentally. Only flag it when the
  primary cause of loss is itself a water-entry event (flooding, backup, intrusion).
  IMPORTANT: Do NOT apply this rule for auto insurance, life insurance, or health
  insurance claim documents — the Overland Water endorsement only exists on home,
  property, condominium, and tenant/renter insurance policies.
When multiple required documents of the same type are missing or incomplete
(e.g., receipts absent across several damage categories), consolidate them into
a SINGLE MISSING flag rather than listing each category separately. If a MISSING
flag describes an action the user still needs to take (e.g., provide or submit
incomplete documents), also include that action in required_actions.
Do NOT duplicate something already in deadlines as a flagged issue.
Do NOT flag risks that the form already shows are handled — if the form states
that damaged property has NOT been removed, or emergency repairs have NOT been
made, do not flag those as risks needing attention.

For coverage_limits, include the monetary amount and what it covers in the same
string (e.g. "Fire and water damage up to $50,000 CAD"). List only aggregate
coverage amounts, policy sub-limits, and net settlement or claim totals. A
"Schedule of Loss" means a detailed per-item product list where each individual
possession (e.g., a specific television, appliance, sofa) has its own row with
original and replacement cost — do NOT include those per-item product costs.
Aggregate damage category estimates (e.g., "$195,000 for primary residence
structural damage") are NOT Schedule of Loss items and SHOULD be included. Do
not list two entries for the same dollar amount — if the same figure appears
under multiple labels, include it once with the most informative label. For a
Proof of Loss form specifically: include only (1) the total policy amount of
insurance, (2) coverage sub-limits per category, (3) the total loss or damage
amount, and (4) the net amount after deductible. Do NOT include "Amount Claimed
Under This Policy" as a separate entry when it equals the "Total Loss or Damage"
— that is a duplicate of the same figure under a different field label.
For claim adjustment or settlement letters: use the insurer's approved or
adjusted amount for each coverage category, not the amount originally claimed
by the policyholder. Where both figures appear, the approved amount is what the
user will receive and is the correct value to report. Always include the total
approved settlement net of deductible.

REQUIRED ACTIONS — specific steps the user still needs to take to maintain coverage,
comply with the policy, resolve the claim, or meet the program's requirements. Include:
• Documents, forms, or evidence the user must submit or provide
• Assessments or inspections the user must arrange (e.g. structural engineer review,
  environmental site assessment, independent appraisal)
• Other insurers or agencies the user must contact (e.g. to avoid claim duplication or
  access additional assistance programs)
• Regulatory or municipal requirements the user must confirm before taking action
  (e.g. updated building codes before rebuilding)
• In claim adjustment or settlement letters: each response option presented to the
  user is a required action — include every option explicitly (e.g. accept and sign
  the release form, submit additional documentation, request an independent appraisal,
  file a complaint with the regulator). These are distinct choices the user must
  actively decide on and act upon.
For adjuster or damage assessment reports: if the report's recommendations require
action by the insured or policyholder, include those as required_actions entries —
do NOT leave insured-directed actions only in warnings. Items that are purely the
insurer's internal process (e.g. "approve ALE continuation", "coordinate with
mortgagee") belong in warnings, not required_actions.
Start each required_actions entry with an imperative verb (Submit, Contact, Arrange,
Confirm, Review, Provide, Commission, Retain, Sign, Accept, Request, File).
Do NOT include generic administrative document-retention notes such as "Keep a copy
for your records", "Retain this form with your policy documents", or similar — these
are not meaningful user actions.

For warnings, list every meaningful exclusion the policyholder should know about,
plus all deductibles (standard and peril-specific), any coinsurance or underinsurance clauses,
and key conditions or limitations on how coverage or assistance is calculated
(e.g. "covers only uninsurable losses above your insured settlement"). Include
procedural consequences stated in the form header or instructions (e.g.
"Incomplete forms will delay processing", "Missing information may delay your
claim"). If the document is a Proof of Loss or claim settlement form that
contains the phrase "without prejudice to the liability of the Insurer" or
similar language, include a warning explaining this means the insurer has not
yet confirmed it accepts the claim or agrees to pay.

Some personal identifiers in the document may have been replaced with
placeholders such as [PERSON_1], [ADDRESS_1], or [POLICY_NUMBER_1]. Treat
each placeholder as if it were the real value and use it naturally in your
output — do not comment on or flag the placeholders themselves. In
plain_language_summary write naturally in prose; do not echo structural
field labels from the source document (such as "Mailing Address", "Named
Insured", or "Property Address").

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


def _build_nlp_hint(nlp_analysis: Any) -> str:
    """Prepend NLP-found dates/amounts/percentages to the prompt as a completeness checklist."""
    if nlp_analysis is None:
        return ""

    # Accept both the dataclass and its dict representation
    if hasattr(nlp_analysis, "dates"):
        dates = nlp_analysis.dates or []
        money = nlp_analysis.money or []
        percentages = nlp_analysis.percentages or []
    elif isinstance(nlp_analysis, dict):
        dates = nlp_analysis.get("dates") or []
        money = nlp_analysis.get("money") or []
        percentages = nlp_analysis.get("percentages") or []
    else:
        return ""

    money = [v for v in money if re.search(r"\d", v) and not re.search(r"[A-Za-z]{4,}", v)]

    if not (dates or money or percentages):
        return ""

    lines = ["[NLP PRE-SCAN — use as a completeness checklist for your output]"]
    if dates:
        lines.append("Dates / durations found: " + ", ".join(dates))
    if money:
        lines.append("Monetary amounts found: " + ", ".join(f"${v}" if not v.startswith("$") else v for v in money))
    if percentages:
        lines.append("Percentages found: " + ", ".join(percentages))
    lines.append(
        "Use monetary amounts above as a completeness checklist for coverage_limits "
        "(still apply the coverage_limits rules — do not include per-item Schedule of Loss costs). "
        "Use dates and durations above as a completeness checklist for deadlines — still apply "
        "the DEADLINES exclusion rules: historical event dates (loss date, disaster designation "
        "date, letter date, claim filing date, evacuation order date) do NOT belong in deadlines "
        "even if they appear here. "
        "Durations, benefit periods, and policy periods should appear in deadlines."
    )
    lines.append("---")
    return "\n".join(lines) + "\n\n"


class GeminiSummarizer:
    """Small Gemini REST client with no SDK dependency."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: int = 120,
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

    def summarize(self, text: str, nlp_analysis: Any = None) -> DocumentSummary:
        if not text.strip():
            raise SummaryError("There is no document text to summarize.")

        truncated = len(text) > DEFAULT_MAX_INPUT_CHARACTERS
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(self.model, safe='')}:generateContent"
        )
        hint = _build_nlp_hint(nlp_analysis)
        user_text = (
            hint
            + "Simplify this document and identify only facts "
            "stated in it:\n\n"
            + text[:DEFAULT_MAX_INPUT_CHARACTERS]
        )
        body = {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_text}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.0,
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
    summarizer: Any | None = None,
    prefer_gemini: bool = True,
    use_nlp: bool = True,
    nlp_analysis: Any = None,
) -> DocumentSummary:
    """Summarize text with Gemini when configured, otherwise use a local fallback."""

    if summarizer is not None:
        return summarizer.summarize(text, nlp_analysis=nlp_analysis)
    if prefer_gemini and os.environ.get("GEMINI_API_KEY"):
        return GeminiSummarizer().summarize(text, nlp_analysis=nlp_analysis)
    return _local_summary(text, use_nlp=use_nlp, nlp_analysis=nlp_analysis)
