"""NLP entity extraction using spaCy for insurance and disaster-recovery documents."""

from __future__ import annotations

import os
import re
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from typing import Any

from .exceptions import DocumentProcessingError


class NLPError(DocumentProcessingError):
    """Raised when NLP processing fails."""


_DEADLINE_WORDS = frozenset(
    {"deadline", "due", "must", "submit", "before", "by", "no later than", "file", "report", "notify"}
)
_COVERAGE_WORDS = frozenset(
    {"coverage", "limit", "maximum", "deductible", "premium", "policy", "insured", "payable"}
)
_ACTION_WORDS = frozenset(
    {"must", "required", "shall", "submit", "provide", "contact", "notify", "report", "complete", "send"}
)
_IMPORTANT_LABELS = frozenset({"DATE", "MONEY", "PERCENT", "ORG", "LAW", "EVENT", "CARDINAL"})
_DISABLED_PIPES = frozenset({"tagger", "attribute_ruler", "lemmatizer"})

_MARKDOWN_TABLE_SEP_RE = re.compile(r"^[ \t]*\|[-:| \t]+\|.*$", re.MULTILINE)
_MARKDOWN_CELL_RE = re.compile(r"\|([^|\n]*)")
_MARKDOWN_HEADER_RE = re.compile(r"^#{1,6}[ \t]+", re.MULTILINE)
_BARE_NUMBER_RE = re.compile(r"^\d{3,5}$")
_ORG_NOISE_TOKENS = frozenset({
    "wood frame", "forced air", "copper & pex", "copper /",
    "wiring copper", "plumbing copper", "asphalt shingle", "owner-occupied",
})
_DATE_SENTENCE_MAX_CHARS = 300


def _strip_markdown_for_nlp(text: str) -> str:
    """Strip markdown tables and headers so spaCy sees plain token streams."""
    text = _MARKDOWN_TABLE_SEP_RE.sub("", text)
    text = _MARKDOWN_CELL_RE.sub(lambda m: " " + m.group(1).strip(), text)
    text = text.replace("|", " ")
    text = _MARKDOWN_HEADER_RE.sub("", text)
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_date_noise(val: str) -> bool:
    """Return True for bare numbers that spaCy mislabels as dates (e.g. address numbers)."""
    return bool(_BARE_NUMBER_RE.match(val.strip()))


def _is_org_noise(val: str) -> bool:
    """Return True for construction/material terms mislabeled as organizations."""
    return val.strip().casefold() in _ORG_NOISE_TOKENS


def _term_pattern(terms: frozenset[str]) -> re.Pattern[str]:
    alternatives = (
        re.escape(term).replace(r"\ ", r"\s+")
        for term in sorted(terms, key=len, reverse=True)
    )
    return re.compile(rf"(?<!\w)(?:{'|'.join(alternatives)})(?!\w)", re.IGNORECASE)


_DEADLINE_PATTERN = _term_pattern(_DEADLINE_WORDS)
_COVERAGE_PATTERN = _term_pattern(_COVERAGE_WORDS)
_ACTION_PATTERN = _term_pattern(_ACTION_WORDS)
_CALENDAR_DATE_PATTERN = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b"
    r"|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}/\d{1,2}/\d{2,4}\b",
    re.IGNORECASE,
)


@dataclass
class NLPAnalysis:
    dates: list[str] = field(default_factory=list)
    date_sentences: list[str] = field(default_factory=list)
    money: list[str] = field(default_factory=list)
    percentages: list[str] = field(default_factory=list)
    organizations: list[str] = field(default_factory=list)
    top_sentences: list[str] = field(default_factory=list)
    provider: str = "spacy"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SpaCyNLPEngine:
    """Lazy spaCy NER engine for document entity extraction."""

    def __init__(self, model: str | None = None, max_chunk_chars: int = 100_000):
        self.model = model or os.environ.get("SPACY_MODEL", "en_core_web_sm")
        self.max_chunk_chars = max_chunk_chars

    def _get_nlp(self) -> Any:
        return _load_model(self.model)

    def analyze(self, text: str, top_n: int = 15) -> NLPAnalysis:
        """Extract entities and rank important sentences from all document text."""
        text = _strip_markdown_for_nlp(text)
        nlp = self._get_nlp()
        max_chars = min(self.max_chunk_chars, nlp.max_length - 1)
        if max_chars < 1:
            raise NLPError("The configured spaCy model has an invalid maximum text length.")

        docs = list(nlp.pipe(_text_chunks(text, max_chars), batch_size=4))
        dates: list[str] = []
        date_sentences: list[str] = []
        money: list[str] = []
        percentages: list[str] = []
        organizations: list[str] = []
        seen_dates: set[tuple[str, str]] = set()
        seen_entities: set[tuple[str, str]] = set()

        for doc in docs:
            for ent in doc.ents:
                val = _clean_text(ent.text)
                if not val:
                    continue
                sentence = _sentence_for(ent)
                normalized = val.casefold()

                if ent.label_ == "DATE" and len(val) > 3:
                    if _is_date_noise(val):
                        continue
                    # Dedup on first 100 chars of sentence to avoid storing near-identical blocks
                    sent_key = sentence[:100].casefold()
                    key = (normalized, sent_key)
                    if key not in seen_dates:
                        seen_dates.add(key)
                        dates.append(val)
                        display = (
                            sentence
                            if len(sentence) <= _DATE_SENTENCE_MAX_CHARS
                            else sentence[:_DATE_SENTENCE_MAX_CHARS].rsplit(" ", 1)[0] + "…"
                        )
                        date_sentences.append(display)
                elif ent.label_ == "MONEY":
                    _append_unique(money, seen_entities, ent.label_, normalized, val)
                elif ent.label_ == "PERCENT":
                    _append_unique(percentages, seen_entities, ent.label_, normalized, val)
                elif ent.label_ == "ORG" and len(val) > 2:
                    if _is_org_noise(val):
                        continue
                    _append_unique(organizations, seen_entities, ent.label_, normalized, val)

        return NLPAnalysis(
            dates=dates[:20],
            date_sentences=date_sentences[:20],
            money=money[:20],
            percentages=percentages[:10],
            organizations=organizations[:10],
            top_sentences=_rank_sentences(docs, top_n),
        )


@lru_cache(maxsize=4)
def _load_model(model: str) -> Any:
    """Load and configure each spaCy model once per process."""
    try:
        import spacy
    except ImportError as exc:
        raise NLPError(
            "spaCy is not installed. Run: pip install -r pdf_and_summary/requirements-nlp.txt"
        ) from exc
    try:
        nlp = spacy.load(model)
    except OSError as exc:
        raise NLPError(
            f"spaCy model '{model}' is not installed. "
            f"Run: python -m spacy download {model}"
        ) from exc

    unused_pipes = _DISABLED_PIPES.intersection(nlp.pipe_names)
    for pipe_name in unused_pipes:
        nlp.disable_pipe(pipe_name)
    if not {"parser", "senter", "sentencizer"}.intersection(nlp.pipe_names):
        nlp.add_pipe("sentencizer")
    return nlp


def _text_chunks(text: str, max_chars: int) -> list[str]:
    """Split long documents without silently dropping text."""
    chunks: list[str] = []
    remaining = text.strip()
    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        minimum_split = max_chars // 2
        split_at = max(
            remaining.rfind("\n", minimum_split, max_chars),
            remaining.rfind(". ", minimum_split, max_chars),
            remaining.rfind(" ", minimum_split, max_chars),
        )
        if split_at < 1:
            split_at = max_chars
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    return chunks


def _append_unique(
    values: list[str],
    seen: set[tuple[str, str]],
    label: str,
    normalized: str,
    value: str,
) -> None:
    key = (label, normalized)
    if key not in seen:
        seen.add(key)
        values.append(value)


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def is_calendar_date(text: str) -> bool:
    """Return whether text contains an explicit calendar date rather than a duration."""
    return bool(_CALENDAR_DATE_PATTERN.search(text))


def contains_deadline_term(text: str) -> bool:
    return bool(_DEADLINE_PATTERN.search(text))


def contains_coverage_term(text: str) -> bool:
    return bool(_COVERAGE_PATTERN.search(text))


def contains_action_term(text: str) -> bool:
    return bool(_ACTION_PATTERN.search(text))


def _sentence_for(ent: Any) -> str:
    try:
        return _clean_text(ent.sent.text)
    except (AttributeError, ValueError):
        return ""


def _rank_sentences(docs: list[Any], top_n: int) -> list[str]:
    scored: list[tuple[float, int, str]] = []
    total = max(sum(1 for doc in docs for _ in doc.sents), 1)
    position = 0
    for doc in docs:
        for sent in doc.sents:
            text = _clean_text(sent.text)
            if len(text) < 20:
                position += 1
                continue
            score = float(sum(2 for ent in sent.ents if ent.label_ in _IMPORTANT_LABELS))
            score += 1.0 if contains_deadline_term(text) else 0.0
            score += 1.0 if contains_coverage_term(text) else 0.0
            score += 1.0 if contains_action_term(text) else 0.0
            # Bonus for sentences in the first third, policy tables and key terms tend to appear early.
            if position / total < 0.33:
                score += 0.5
            if score > 0:
                scored.append((score, position, text))
            position += 1

    scored.sort(key=lambda item: (-item[0], item[1]))
    seen: set[str] = set()
    result: list[str] = []
    for _, _, sentence in scored:
        normalized = sentence.casefold()
        if normalized not in seen:
            seen.add(normalized)
            result.append(sentence)
        if len(result) >= top_n:
            break
    return result
