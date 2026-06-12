"""PII redaction and rehydration for insurance documents."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RedactionMap:
    """Bidirectional map between placeholders and original values.

    The internal entries are never serialised into the pipeline result —
    only aggregate statistics are exposed so original PII stays out of logs.
    """

    _entries: dict[str, str] = field(default_factory=dict)  # placeholder -> original
    # Alternative surface forms (e.g. abbreviated addresses) that map to the
    # same placeholder but are not the canonical rehydration value.
    _aliases: dict[str, str] = field(default_factory=dict)  # alias_text -> placeholder

    def add(self, placeholder: str, original: str) -> None:
        self._entries[placeholder] = original

    def add_alias(self, placeholder: str, alias: str) -> None:
        """Register an alternative surface form that should be treated as *placeholder*."""
        self._aliases[alias] = placeholder

    def rehydrate(self, text: str) -> str:
        """Replace all placeholders in *text* with their original values."""
        for placeholder, original in self._entries.items():
            text = text.replace(placeholder, original)
        return text

    def redact_text(self, text: str) -> str:
        """Replace original values and known aliases in *text* with placeholders."""
        for placeholder, original in self._entries.items():
            text = text.replace(original, placeholder)
        for alias, placeholder in self._aliases.items():
            text = text.replace(alias, placeholder)
        return text

    def stats(self) -> dict[str, Any]:
        """Return aggregate statistics only — does not expose original values."""
        categories: dict[str, int] = {}
        for ph in self._entries:
            # placeholder format: [CATEGORY_N]
            cat = ph.strip("[]").rsplit("_", 1)[0]
            categories[cat] = categories.get(cat, 0) + 1
        return {"placeholder_count": len(self._entries), "categories": categories}

    def __len__(self) -> int:
        return len(self._entries)

    def __bool__(self) -> bool:
        return bool(self._entries)


# Policy / claim numbers — five common formats:
#   ASI-2024-00847     (letters – 4-digit year – 5+ digits)
#   TD-HM-456789       (letters – letters – 5+ digits, e.g. TD Insurance)
#   HOP-884-19A        (letters – digits – digits + letter suffix, e.g. Prairie Mutual)
#   AUTO-74-39928-AB   (letters – 2–4 digits – 4–6 digits – 1–3 letters, e.g. auto policies)
#   LIFE-T20-991204-BC (letters – letter+1–3 digits – 4–8 digits – 1–3 letters, e.g. life policies)
_POLICY_NUMBER_RE = re.compile(
    r"\b(?:"
    r"[A-Z]{2,5}-\d{4}-\d{5,}"
    r"|[A-Z]{2,5}-[A-Z]{2,5}-\d{5,}"
    r"|[A-Z]{2,5}-\d{2,4}-\d{2,4}[A-Z]{1,2}"
    r"|[A-Z]{2,6}-\d{2,4}-\d{4,6}-[A-Z]{1,3}"
    r"|[A-Z]{2,6}-[A-Z]\d{1,3}-\d{4,8}-[A-Z]{1,3}"
    r")\b"
)

# Legal descriptions: various orderings of Lot/Block/Plan used in Alberta
#   "Plan 0413057, Block 12, Lot 18, SW 23-24-1-W5M" (common on declarations pages)
#   "Lot 14, Block 22, Plan 7522143, City of Edmonton"
_LEGAL_DESCRIPTION_RE = re.compile(
    r"(?:Plan\s+\d+,\s*Block\s+\d+,\s*Lot\s+\d+|Lot\s+\d+,\s*Block\s+\d+,\s*Plan\s+\d+)"
    r"(?:[^.\n]*?(?:City\s+of\s+\w+|[NSEW]{1,2}\s*\d+-\d+-\d+-[WE]\d+))?",
    re.IGNORECASE,
)

# Loan numbers: Loan #7291-004-488-3
_LOAN_NUMBER_RE = re.compile(r"Loan\s+#[\w-]+", re.IGNORECASE)

# Broker reference numbers: Br. #AB-03291
_BROKER_REF_RE = re.compile(r"Br\.\s+#[\w-]+", re.IGNORECASE)

# Broker licence numbers: Broker Licence No. AB-03291
_LICENCE_NUMBER_RE = re.compile(
    r"Broker\s+Licence\s+No\.\s+[\w-]+", re.IGNORECASE
)

# Email addresses
_EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b")

# Phone numbers — local/direct lines only; toll-free variants filtered by _is_tollfree
_PHONE_RE = re.compile(r"(?<!\d)\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)")
_TOLLFREE_AREA_CODES = frozenset({"800", "877", "888", "866", "855", "844", "833"})

# Addresses: extracted from labelled fields and c/o blocks.
# Six branches:
#   1. Standard labelled fields (colon optional) — Mailing Address, Permanent
#      Address, Property Address; table-layout PDFs omit the colon.
#   2. c/o prefix.
#   3. "Location of loss" (IBC claim forms) — colon optional; PyMuPDF table
#      extraction omits the colon when label and value are in separate cells.
#   4. Bare "Address" label on its own line (IBC Proof of Loss table layout):
#         Insured
#         Sarah Thompson
#         Address          ← matched here (no colon, MULTILINE anchor)
#         123 Maple Crescent...
#   5. "Location:" labeled address field.
#   6. "Loss address" (property loss notice forms, e.g. Prairie Mutual HLN).
_ADDRESS_FIELD_RE = re.compile(
    # Standard labelled address fields — colon optional (table-layout PDFs omit it)
    r"(?:(?:Current\s+)?(?:Mailing Address|Permanent Address|Property Address)\s*:?)[\n ]\s*(.+?)(?:\n|$)"
    r"|c/o[ \t]+(.+?)(?:\n|$)"
    r"|(?:Location of loss)\s*:?[\n ]\s*(.+?)(?:\n|$)"
    r"|^Address\s*\n\s*(.+?)(?:\n|$)"
    r"|(?:^Location\s*:\s*)(.+?)(?:\n|$)"
    r"|(?:Loss\s+address)\s*:?[\n ]\s*(.+?)(?:\n|$)",
    re.IGNORECASE | re.MULTILINE,
)

_PERSON_MIN_WORDS = 2  # require at least first + last name to reduce false positives

# spaCy mislabels these as PERSON in insurance/construction documents
_PERSON_FP_WORDS = frozenset({
    "shingle", "asphalt", "dwelling", "superintendent",
    "roof", "veneer", "frame",
    # Insurance domain terms commonly mis-tagged as PERSON
    "adjuster", "inspector", "coordinator", "claims", "checklist",
    "guide", "appraisal", "loss", "form", "process", "wildfire",
    # Disaster-recovery form labels mis-tagged as PERSON
    "residence",
    # Retail store and product-category terms mis-tagged as PERSON in
    # Schedule of Loss tables (e.g. "Best Buy", "Microwave Oven")
    "buy", "oven", "microwave", "sofa", "couch", "television",
    "furniture", "appliance", "electronics",
    # Sentence-starter verbs / adjuster priority labels mis-tagged as PERSON
    # (e.g. spaCy tags "B. Needs" as a person when "B." looks like an initial
    # and "Needs" opens the next sentence with a capital letter)
    "needs", "requires", "pending",
    # Room / area names from property inventory forms mis-tagged as PERSON
    # when OCR renders "Room /Area: Kitchen + pantry" and spaCy sees the
    # value as a multi-token capitalized phrase (e.g. "Kitchen + pantry")
    "kitchen", "pantry", "bedroom", "bathroom", "garage", "basement",
    "hallway", "laundry",
    # Organization-indicator words — guard against "Prepared by" / "Claimant"
    # labeled-field regex capturing an insurer or broker name as a person
    "insurance", "company",
    # Document-section heading fragments mis-tagged as PERSON
    # (e.g. "Required Documents and Proofs" section heading causes spaCy to
    # tag "Required Documents" as a two-token PERSON entity)
    "proofs", "documents", "document", "required",
})

# Trailing form-label tokens that spaCy sometimes folds into PERSON entity
# boundaries when PDF table layout places the label on the very next line
# (e.g. "Sarah Thompson\nAddress" → trim to "Sarah Thompson").
# Also strips trailing phone/extension sequences on the next line
# (e.g. "Andre Wu\n1-866-555-0448" → trim to "Andre Wu").
_PERSON_TRAILING_LABEL_RE = re.compile(
    r"[\s,]*\b(?:Address|Phone|Email|Date|Signature|Occupation|Witness)\b\s*$"
    r"|[\s]*\n\s*[\d\+][\d\s\-().+ext.]{6,}$",
    re.IGNORECASE,
)

# Person names captured directly from labeled form fields (e.g. "Last Name: Johnson"
# or "Last Name\nJohnson" — colon optional for table-layout forms where label and
# value appear in adjacent cells with no colon separator).
# "Claimant / Beneficiary" and "Beneficiary" variants catch life/health claim forms.
_PERSON_FIELD_RE = re.compile(
    r"(?:Last Name|First Name|Full Name|Print Name|Named Insured|Insured"
    r"|Claimant(?:\s*/\s*Beneficiary)?|Beneficiary|Prepared by)"
    r"(?:[ \t]*:[ \t]*\n?[ \t]*|[ \t]*\n[ \t]*)"
    r"([A-Za-z][a-zA-Z'\-.]+(?:[ \t]+[A-Za-z][a-zA-Z'\-.]+)*)",
    re.IGNORECASE,
)

# Names in contact-information tables where spaCy never sees the name because
# the table layout presents each field on its own line:
#   Disaster Health Adjuster
#   Samira Cole
# The pattern matches a line ending with a recognised job-title word (the last word
# of the role description) followed immediately by a 2+-token capitalised name.
_CONTACT_TABLE_ROLES_RE = re.compile(
    r"^(?:[A-Z][a-zA-Z]*[ \t]+){0,4}"
    r"(?:Adjuster|Inspector|Coordinator|Examiner|Specialist|Supervisor"
    r"|Analyst|Advisor|Consultant|Representative|Officer|Director|Manager|Handler|Reviewer)"
    r"[ \t]*$\n"
    r"^([A-Z][a-z]+[ \t]+(?:[A-Z]\.[ \t]+)?[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?)[ \t]*$",
    re.MULTILINE,
)


class Redactor:
    """Replace PII with stable placeholders before sending document text to an LLM."""

    def __init__(self, use_nlp: bool = True) -> None:
        self.use_nlp = use_nlp

    def redact(self, text: str) -> tuple[str, RedactionMap]:
        """Replace PII with placeholders; same value always gets the same placeholder."""
        rmap = RedactionMap()
        counters: dict[str, int] = {}

        def next_ph(category: str) -> str:
            counters[category] = counters.get(category, 0) + 1
            return f"[{category}_{counters[category]}]"

        # (start, end, category, original_text)
        spans: list[tuple[int, int, str, str]] = []

        if self.use_nlp:
            person_spans = _merge_adjacent_persons(_person_spans(text), text)
        else:
            person_spans = []
        spans.extend(person_spans)
        salutation_extra, salutation_alias_pairs = _salutation_spans(person_spans, text)
        spans.extend(salutation_extra)

        # Pure-regex field extractor: catches split Last/First Name entries spaCy misses.
        for m in _PERSON_FIELD_RE.finditer(text):
            name = m.group(1).strip()
            if not name or not name[0].isupper():
                continue
            if re.search(r"\d", name):
                continue
            if any(w in name.lower() for w in _PERSON_FP_WORDS):
                continue
            spans.append((m.start(1), m.end(1), "PERSON", name))

        # Contact-table extractor: catches adjuster/examiner names in table layouts
        # where each field occupies its own line (spaCy never forms a PERSON entity
        # here because the name line has no surrounding sentence context).
        for m in _CONTACT_TABLE_ROLES_RE.finditer(text):
            name = m.group(1).strip()
            if not name or not name[0].isupper():
                continue
            if re.search(r"\d", name):
                continue
            if any(w in name.lower() for w in _PERSON_FP_WORDS):
                continue
            spans.append((m.start(1), m.end(1), "PERSON", name))

        for pattern, category in [
            (_POLICY_NUMBER_RE, "POLICY_NUMBER"),
            (_LEGAL_DESCRIPTION_RE, "LEGAL_DESCRIPTION"),
            (_LOAN_NUMBER_RE, "LOAN_NUMBER"),
            (_BROKER_REF_RE, "BROKER_REF"),
            (_LICENCE_NUMBER_RE, "LICENCE_NUMBER"),
            (_EMAIL_RE, "EMAIL"),
        ]:
            for m in pattern.finditer(text):
                spans.append((m.start(), m.end(), category, m.group(0)))

        # Phone numbers — skip toll-free (organizational) numbers
        for m in _PHONE_RE.finditer(text):
            if not _is_tollfree(m.group(0)):
                spans.append((m.start(), m.end(), "PHONE", m.group(0)))

        known_addresses: set[str] = set()
        for m in _ADDRESS_FIELD_RE.finditer(text):
            # _ADDRESS_FIELD_RE has three capture groups (one per branch);
            # exactly one will be non-None for any given match.
            addr = next(g for g in m.groups() if g is not None).strip()
            if len(addr) > 8:
                known_addresses.add(addr)

        seen_starts: set[int] = {s for s, *_ in spans}
        # Track abbreviated forms so they can be registered as rmap aliases later.
        abbrev_forms: list[tuple[str, str]] = []  # (canonical_addr, abbreviated_text)
        for addr in known_addresses:
            for m in re.finditer(re.escape(addr), text):
                spans.append((m.start(), m.end(), "ADDRESS", addr))
            # Use the street-number anchor (e.g. "4817 – 52") to find abbreviated
            # occurrences regardless of "Ave" vs "Avenue" spelling variations.
            number_m = re.match(r"(\d+\s*[–—\-]\s*\d+)", addr)
            if number_m:
                anchor = re.escape(number_m.group(1))
                abbrev_re = re.compile(anchor + r"[^\n]+")
                for m in abbrev_re.finditer(text):
                    if m.start() not in seen_starts:
                        abbrev_text = m.group(0)
                        spans.append((m.start(), m.end(), "ADDRESS", addr))
                        if abbrev_text != addr:
                            abbrev_forms.append((addr, abbrev_text))

        spans = _resolve_overlaps(spans)

        original_to_ph: dict[str, str] = {}
        for _, _, category, original in spans:
            if original not in original_to_ph:
                ph = next_ph(category)
                original_to_ph[original] = ph
                rmap.add(ph, original)

        # Register abbreviated address forms as aliases so redact_text() covers them
        for canonical, abbrev in abbrev_forms:
            if canonical in original_to_ph:
                rmap.add_alias(original_to_ph[canonical], abbrev)

        # Register salutation aliases so redact_text() catches them in Gemini output.
        for canonical, sal_form in salutation_alias_pairs:
            if canonical in original_to_ph:
                rmap.add_alias(original_to_ph[canonical], sal_form)

        # Register space-normalized alias for OCR newlines embedded in spaCy entities.
        for orig, ph in list(original_to_ph.items()):
            normalized = re.sub(r'\s+', ' ', orig).strip()
            if normalized != orig and normalized not in original_to_ph:
                rmap.add_alias(ph, normalized)

        # Apply replacements right-to-left to preserve character offsets
        chars = list(text)
        for start, end, _, original in sorted(spans, key=lambda x: x[0], reverse=True):
            ph = original_to_ph[original]
            chars[start:end] = list(ph)

        return "".join(chars), rmap


def _is_tollfree(phone: str) -> bool:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return digits[:3] in _TOLLFREE_AREA_CODES
    if len(digits) == 11 and digits[0] == "1":
        return digits[1:4] in _TOLLFREE_AREA_CODES
    return False


def _person_spans(text: str) -> list[tuple[int, int, str, str]]:
    """Return PERSON entity spans from spaCy. Returns [] if spaCy is unavailable."""
    try:
        from .nlp import _load_model
        nlp = _load_model("en_core_web_sm")
    except Exception:
        return []
    doc = nlp(text[: nlp.max_length - 1])
    spans = []
    for ent in doc.ents:
        if ent.label_ != "PERSON":
            continue
        val = ent.text.strip()

        # Strip trailing form-label tokens (e.g. "Sarah Thompson\nAddress" → "Sarah Thompson").
        m_trail = _PERSON_TRAILING_LABEL_RE.search(val)
        if m_trail:
            val = val[:m_trail.start()].rstrip()

        # Strip leading non-alpha chars (bullets, punctuation) spaCy folds into entity bounds.
        clean = re.sub(r"^[^a-zA-Z]+", "", val)

        # Strip leading tokens that appear in _PERSON_FP_WORDS — handles contact table rows
        # where spaCy includes the job title in the entity span boundary.
        # Strategy: find the LAST FP-word token in the span and take everything after it.
        # "Disaster Health Adjuster Samira Cole" → last FP token = "Adjuster" → "Samira Cole"
        tokens = clean.split()
        last_fp_idx = -1
        for i, tok in enumerate(tokens):
            if tok.rstrip(".,;:").lower() in _PERSON_FP_WORDS:
                last_fp_idx = i
        if last_fp_idx >= 0:
            clean = " ".join(tokens[last_fp_idx + 1:])  # empty → filtered by min_words below

        if len(clean.split()) < _PERSON_MIN_WORDS:
            continue
        # Reject all-lowercase spans ("sonic booms") that spaCy mislabels as PERSON.
        if not clean[0].isupper():
            continue
        # Spans containing digits are location/reference fragments, not names
        if re.search(r"\d", clean):
            continue
        if any(w in clean.lower() for w in _PERSON_FP_WORDS):
            continue

        # Locate `clean` within the entity boundary for accurate char offsets.
        found = text.find(clean, ent.start_char, ent.end_char + len(clean))
        if found != -1:
            start_char = found
            end_char = found + len(clean)
        else:
            # Fallback: derive offsets from entity bounds.
            leading_ws = len(ent.text) - len(ent.text.lstrip())
            start_char = ent.start_char + leading_ws
            end_char = (ent.start_char + leading_ws + len(val)) if m_trail else ent.end_char

        spans.append((start_char, end_char, "PERSON", clean))
    return spans


def _merge_adjacent_persons(
    spans: list[tuple[int, int, str, str]], text: str
) -> list[tuple[int, int, str, str]]:
    """Merge adjacent PERSON spans joined by '&' or 'and' to avoid bare connectors in redacted output."""
    sorted_persons = sorted(spans, key=lambda x: x[0])
    merged: list[tuple[int, int, str, str]] = []
    i = 0
    while i < len(sorted_persons):
        if i + 1 < len(sorted_persons):
            s1, e1, _, _ = sorted_persons[i]
            s2, e2, _, _ = sorted_persons[i + 1]
            between = text[e1:s2]
            # Connector may be between the two spans (normal case) or trailing
            # inside span1 — spaCy sometimes includes '&' in the entity boundary
            connector_between = re.match(r"^\s*(?:&|and)\s*$", between, re.IGNORECASE)
            connector_in_span1 = re.search(r"\s*\b(?:&|and)\s*$", text[s1:e1], re.IGNORECASE)
            if connector_between or connector_in_span1:
                merged.append((s1, e2, "PERSON", text[s1:e2]))
                i += 2
                continue
        merged.append(sorted_persons[i])
        i += 1
    return merged


def _salutation_spans(
    person_spans: list[tuple[int, int, str, str]], text: str
) -> tuple[list[tuple[int, int, str, str]], list[tuple[str, str]]]:
    """Return salutation spans and alias pairs so redact_text() catches 'Ms. Surname' forms in Gemini output."""
    extra: list[tuple[int, int, str, str]] = []
    alias_pairs: list[tuple[str, str]] = []
    seen_surnames: set[str] = set()
    covered: set[int] = {s for s, *_ in person_spans}

    for _, _, cat, original in person_spans:
        words = original.strip().split()
        if len(words) < 2:
            continue
        surname = words[-1]
        if surname in seen_surnames:
            continue
        seen_surnames.add(surname)
        pattern = re.compile(
            r"\b(?:Ms\.|Mr\.|Mrs\.|Dr\.)\s+" + re.escape(surname) + r"\b"
        )
        for m in pattern.finditer(text):
            if m.start() not in covered:
                extra.append((m.start(), m.end(), cat, original))
                covered.add(m.start())
        for prefix in ("Ms.", "Mr.", "Mrs.", "Dr."):
            alias_pairs.append((original, f"{prefix} {surname}"))
    return extra, alias_pairs


def _resolve_overlaps(
    spans: list[tuple[int, int, str, str]],
) -> list[tuple[int, int, str, str]]:
    """Remove overlapping spans, keeping the longer match at each position."""
    sorted_spans = sorted(spans, key=lambda x: (x[0], -(x[1] - x[0])))
    result: list[tuple[int, int, str, str]] = []
    last_end = -1
    for span in sorted_spans:
        if span[0] >= last_end:
            result.append(span)
            last_end = span[1]
    return result
