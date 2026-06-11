"""Gemini-backed PDF document classifier + summarizer.

Takes a PDF blob and returns a DocumentAnalysis describing what kind of
document it is, a short summary, and any key fields the model could lift
(policy numbers, claim numbers, dates, amounts, parties).

Used by the documents blueprint's /documents/<id>/analyze endpoint.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

DOC_TYPES = (
    "insurance_policy",
    "claim",
    "id",
    "deed",
    "receipt",
    "invoice",
    "estimate",
    "correspondence",
    "other",
)

PROMPT = """You are classifying a personal disaster-recovery document.

Read the PDF and return:
- doc_type: one of insurance_policy, claim, id, deed, receipt, invoice,
  estimate, correspondence, other.
- title: a short human-readable title for the document.
- summary: 1-3 sentences on what this document is and why it matters.
- key_fields: any structured fields you can lift verbatim — policy number,
  claim number, effective dates, parties, amounts. Omit fields you cannot
  find; do not guess.

Classification rules:
- Use the listed types ONLY for documents directly related to disaster
  recovery, insurance, or property/identity: policies, claims, government
  IDs, property deeds, repair receipts/invoices/estimates, and
  correspondence about a disaster or claim.
- Use doc_type=other for anything that is NOT a disaster-recovery document —
  including school or academic transcripts, medical records unrelated to a
  disaster claim, employment records, tax returns (unless proving property
  loss), financial statements, legal documents unrelated to property or
  insurance, and any document whose primary purpose has nothing to do with
  insuring, claiming, or recovering from a disaster.
- Do NOT force-fit an irrelevant document into the nearest category. When
  in doubt, use other.
- When using other, begin the summary with "This does not appear to be a
  disaster-recovery document." and briefly describe what it actually is."""


class KeyField(BaseModel):
    label: str
    value: str


class DocumentAnalysis(BaseModel):
    doc_type: Literal[
        "insurance_policy",
        "claim",
        "id",
        "deed",
        "receipt",
        "invoice",
        "estimate",
        "correspondence",
        "other",
    ]
    title: Optional[str] = None
    summary: str
    key_fields: list[KeyField] = []


def analyze_document(pdf_bytes: bytes, api_key: str) -> DocumentAnalysis:
    from google import genai
    from google.genai import types

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    from .gemini_schema import to_gemini_schema

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            PROMPT,
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=to_gemini_schema(DocumentAnalysis),
        ),
    )
    return DocumentAnalysis.model_validate_json(response.text)
