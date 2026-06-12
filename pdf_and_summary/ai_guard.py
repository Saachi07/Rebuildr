"""Prompt-injection guard for untrusted document text and model output.

User documents are untrusted input that flows directly into Gemini prompts.
A malicious upload could embed instruction-like text ("ignore previous
instructions", fake system messages) hoping the model treats it as commands.
This module provides three layers:

1. sanitize_for_prompt: defuses obvious injection patterns in extracted
   document text. We prefer wrapping over deleting: legitimate policy text
   must survive untouched, so suspicious lines are prefixed with a marker
   rather than removed, and only structural attack syntax (fake role tags,
   code fences pretending to be system messages) is stripped.
2. Delimiters: the document text is passed to the model inside clearly
   delimited untrusted blocks; the system prompt states that everything
   between the delimiters is data, never instructions.
3. validate_model_output: post-checks Gemini output before it is persisted
   or rendered: strips script/html tags, blanks URLs not present in the
   source text, and caps string lengths.

The backend re-exports these functions from
backend/app/services/ai_guard.py; keep this module stdlib-only.
"""

from __future__ import annotations

import re
from typing import Any

# Markers that fence untrusted document text inside the prompt. The system
# prompt must state that content between these is data, never instructions.
UNTRUSTED_BLOCK_OPEN = "<<<DOCUMENT_TEXT_START>>>"
UNTRUSTED_BLOCK_CLOSE = "<<<DOCUMENT_TEXT_END>>>"

# Prefix attached to lines that look like injected instructions. Wrapping
# (instead of deleting) keeps the document content reviewable while making
# the line read as quoted data rather than a command.
_SUSPICIOUS_PREFIX = "[SUSPICIOUS TEXT IN DOCUMENT] "

# Instruction-like phrases that have no business appearing in an insurance
# or disaster-recovery document. Kept deliberately narrow so genuine policy
# language ("you are required to notify the insurer") is never flagged.
_INJECTION_LINE_RE = re.compile(
    r"(?:"
    r"ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|messages?)"
    r"|disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)"
    r"|forget\s+(?:all\s+|any\s+)?(?:previous|prior|your)\s+(?:instructions?|prompts?|rules?|training)"
    r"|you\s+are\s+now\s+(?:a|an|in)\b"
    r"|act\s+as\s+(?:a\s+|an\s+)?(?:system|developer|admin|jailbroken|DAN)\b"
    r"|pretend\s+(?:to\s+be|you\s+are)\s+"
    r"|system\s*prompt"
    r"|developer\s+mode"
    r"|jailbreak"
    r"|do\s+anything\s+now"
    r"|new\s+instructions?\s*:"
    r"|override\s+(?:your|the)\s+(?:instructions?|rules?|guidelines?)"
    r"|your\s+(?:new\s+)?(?:instructions?|task)\s+(?:is|are)\s+"
    r"|respond\s+only\s+with"
    r"|output\s+your\s+(?:system\s+prompt|instructions)"
    r")",
    re.IGNORECASE,
)

# Structural attack syntax: fake chat-role tags and markdown fences that
# claim to open a system or assistant message. These carry no legitimate
# document content, so stripping them outright is safe.
_ROLE_TAG_RE = re.compile(
    r"</?\s*(?:system|assistant|user|instructions?|im_start|im_end)\s*>"
    r"|\[/?(?:SYSTEM|INST|ASSISTANT)\]"
    r"|<\|/?(?:system|assistant|user|im_start|im_end)\|?>",
    re.IGNORECASE,
)
_FAKE_SYSTEM_FENCE_RE = re.compile(
    r"^```\s*(?:system|assistant|instructions?)\s*$", re.IGNORECASE | re.MULTILINE
)

# Output validation -----------------------------------------------------------

_HTML_TAG_RE = re.compile(
    r"<\s*script\b.*?<\s*/\s*script\s*>"  # script blocks, contents included
    r"|<\s*/?\s*[a-zA-Z][^>]*>",  # any other html tag, tag only
    re.IGNORECASE | re.DOTALL,
)
_URL_RE = re.compile(r"https?://[^\s)\]>\"']+", re.IGNORECASE)

# Generous cap: source quotes max out near 300 chars and summaries are a few
# paragraphs; anything beyond this is runaway output, not document content.
MAX_STRING_LENGTH = 4000


def sanitize_for_prompt(text: str) -> str:
    """Neutralize obvious prompt-injection patterns in document text.

    Returns the text with fake role tags and system-message code fences
    removed, and instruction-like lines prefixed with a marker so the model
    reads them as quoted data. Clean policy text passes through unchanged.
    """
    if not text:
        return text

    # Strip structural attack syntax outright; it is never document content.
    cleaned = _ROLE_TAG_RE.sub("", text)
    cleaned = _FAKE_SYSTEM_FENCE_RE.sub("```", cleaned)

    # Defuse the document's own copies of our delimiters so a malicious
    # upload cannot close the untrusted block early.
    cleaned = cleaned.replace(UNTRUSTED_BLOCK_OPEN, "").replace(UNTRUSTED_BLOCK_CLOSE, "")

    # Prefix instruction-like lines instead of deleting them: the document
    # owner should still be able to see what their file contains.
    lines = cleaned.split("\n")
    out_lines = []
    for line in lines:
        if _INJECTION_LINE_RE.search(line) and not line.startswith(_SUSPICIOUS_PREFIX):
            out_lines.append(_SUSPICIOUS_PREFIX + line)
        else:
            out_lines.append(line)
    return "\n".join(out_lines)


def contains_injection(text: str) -> bool:
    """Return True when the text contains instruction-like injection patterns."""
    if not text:
        return False
    return bool(_INJECTION_LINE_RE.search(text) or _ROLE_TAG_RE.search(text))


def wrap_untrusted(text: str) -> str:
    """Wrap sanitized document text in the untrusted-data delimiters."""
    return f"{UNTRUSTED_BLOCK_OPEN}\n{text}\n{UNTRUSTED_BLOCK_CLOSE}"


def _clean_string(
    value: str,
    source_text: str | None,
    warnings: list[str],
) -> str:
    """Strip html, blank unknown URLs, and cap length on one output string."""
    cleaned = value
    if _HTML_TAG_RE.search(cleaned):
        cleaned = _HTML_TAG_RE.sub("", cleaned)
        warnings.append("Removed html or script markup from model output.")

    if source_text is not None:
        for url in _URL_RE.findall(cleaned):
            if url not in source_text:
                cleaned = cleaned.replace(url, "[link removed]")
                warnings.append(
                    "Removed a URL from model output that does not appear in the document."
                )

    if len(cleaned) > MAX_STRING_LENGTH:
        cleaned = cleaned[:MAX_STRING_LENGTH]
        warnings.append("Truncated an overlong string in model output.")
    return cleaned


def _walk(node: Any, source_text: str | None, warnings: list[str]) -> Any:
    if isinstance(node, str):
        return _clean_string(node, source_text, warnings)
    if isinstance(node, dict):
        return {k: _walk(v, source_text, warnings) for k, v in node.items()}
    if isinstance(node, list):
        return [_walk(v, source_text, warnings) for v in node]
    return node


def validate_model_output(
    analysis_dict: dict[str, Any],
    source_text: str | None = None,
) -> list[str]:
    """Post-check Gemini output in place; return warnings about what changed.

    - Strips script and html tags from every string field.
    - When source_text is provided, blanks any URL the model emitted that is
      not present in the source document (a common exfiltration vector).
    - Caps string lengths at MAX_STRING_LENGTH.
    The dict is mutated in place so callers keep their reference.
    """
    if not isinstance(analysis_dict, dict):
        return []
    warnings: list[str] = []
    cleaned = _walk(analysis_dict, source_text, warnings)
    analysis_dict.clear()
    analysis_dict.update(cleaned)
    # Deduplicate while preserving order; the same fix repeated across many
    # fields is one finding, not twenty.
    seen: set[str] = set()
    unique = []
    for w in warnings:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique
