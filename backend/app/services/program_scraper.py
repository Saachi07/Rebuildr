"""Scrape assistance programs from curated sources into the resources catalog.

The seeded catalog is a hand-curated snapshot; this service keeps it growing
and current. Given a case (disaster type, region, derived tags), it:

1. picks the curated sources relevant to that case,
2. fetches each page and strips it to plain text (stdlib only, no parser
   dependency; Gemini does the actual understanding),
3. asks Gemini to extract concrete assistance programs in the same shape as
   the ``resources`` table, constrained to the recommender's tag vocabulary,
4. upserts them with the service-role client (the catalog is shared and
   read-only under RLS) with a fresh ``scraped_at`` so freshness scoring
   and the per-source dedup both work.

Everything here is best-effort: a dead link or a malformed page skips that
source rather than failing the request.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date
from typing import Literal, Optional

import requests
from pydantic import BaseModel

# Resource types accepted by the catalog (mirrors the resources.type CHECK).
_RESOURCE_TYPES = (
    "policy", "shelter", "health", "documents", "insurance", "financial",
    "legal", "community", "rebuild", "preparedness", "transportation",
)

# The recommender's tag vocabulary (services.tags + services.signals).
# Gemini may only use these for requires/excludes so eligibility filtering
# keeps working.
_TAG_VOCAB = {
    "owner", "renter", "displaced", "on_reserve_or_metis", "needs_shelter",
    "insured", "uninsured", "insurance_unknown", "income_disrupted",
    "on_assistance", "insurance_claim_filed", "aid_applied", "not_yet_started",
    "has_kids", "has_seniors", "has_disability", "has_pets", "missing_id",
    "medication_visible", "documents_destroyed", "pet_items_present",
    "smoke_damage", "water_damage", "structural_damage", "total_loss",
    "appliances_lost", "cosmetic_only", "denial_received",
}

# Curated, trustworthy sources. region "*" means national; disaster_types
# ["*"] means any hazard. Per-case we fetch the few that match.
SOURCES: list[dict] = [
    {
        "key": "ab-emergency-financial",
        "url": "https://www.alberta.ca/emergency-financial-assistance",
        "region": "AB",
        "disaster_types": ["*"],
        "default_type": "financial",
    },
    {
        "key": "ab-drp",
        "url": "https://www.alberta.ca/disaster-recovery-programs",
        "region": "AB",
        "disaster_types": ["*"],
        "default_type": "financial",
    },
    {
        "key": "redcross-canada",
        "url": "https://www.redcross.ca/how-we-help/emergencies-and-disasters-in-canada",
        "region": "*",
        "disaster_types": ["*"],
        "default_type": "community",
    },
    {
        "key": "ibc-disaster",
        "url": "https://www.ibc.ca/stay-protected/severe-weather-safety",
        "region": "*",
        "disaster_types": ["*"],
        "default_type": "insurance",
    },
    {
        "key": "canada-benefits-disaster",
        "url": "https://www.canada.ca/en/services/benefits/disaster.html",
        "region": "*",
        "disaster_types": ["*"],
        "default_type": "financial",
    },
]

MAX_SOURCES_PER_RUN = 5
MAX_PAGE_CHARS = 15_000
FETCH_TIMEOUT_S = 12
_UA = {"User-Agent": "RebuildrBot/1.0 (+disaster recovery assistant; program discovery)"}

_SCRIPT_STYLE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.I | re.S)
_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t\r\f\v]+")
_BLANK_LINES = re.compile(r"\n\s*\n+")


class ScrapedProgram(BaseModel):
    title: str
    summary: str
    program_type: Literal[
        "policy", "shelter", "health", "documents", "insurance", "financial",
        "legal", "community", "rebuild", "preparedness", "transportation",
    ]
    url: Optional[str] = None
    phone: Optional[str] = None
    disaster_types: list[str] = []
    audience_tags: list[str] = []
    application_deadline: Optional[str] = None  # ISO date if the page states one


class ScrapedPrograms(BaseModel):
    programs: list[ScrapedProgram] = []


_PROMPT = """You are reading the text of a public web page about disaster
assistance in Canada, on behalf of someone recovering from: {disaster} in
{region}. What we know about them (semantic tags): {tags}.

Extract up to 6 CONCRETE assistance programs or services from the page that
could plausibly help this person. For each one return:
- title: the program's name as the page gives it.
- summary: 1-2 plain-language sentences on what it offers and who it is for.
  Warm, factual, no marketing fluff. Do not use em dashes.
- program_type: the best fit among policy, shelter, health, documents,
  insurance, financial, legal, community, rebuild, preparedness,
  transportation.
- url: the program's own link if the page text includes one, else omit.
- phone: a contact number if the page gives one, else omit.
- disaster_types: which hazards it applies to (wildfire, flood, tornado,
  hailstorm, earthquake, winter_storm), or ["*"] if it applies to any.
- audience_tags: who it is restricted to, ONLY using these exact tags:
  {vocab}. Leave empty when it is open to everyone.
- application_deadline: an ISO date (YYYY-MM-DD) ONLY if the page clearly
  states an application deadline. Never guess.

Rules: only real, currently-described programs. No navigation links, no
donation appeals, no news stories. If the page describes nothing concrete,
return an empty list."""


def _html_to_text(html: str) -> str:
    text = _SCRIPT_STYLE.sub(" ", html)
    text = re.sub(r"<(br|/p|/div|/li|/h[1-6]|/tr)[^>]*>", "\n", text, flags=re.I)
    text = _TAGS.sub(" ", text)
    text = (
        text.replace("&amp;", "&").replace("&nbsp;", " ")
        .replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
        .replace("&quot;", '"')
    )
    text = _WS.sub(" ", text)
    text = _BLANK_LINES.sub("\n", text)
    return text.strip()[:MAX_PAGE_CHARS]


def _fetch_text(url: str) -> Optional[str]:
    try:
        res = requests.get(url, headers=_UA, timeout=FETCH_TIMEOUT_S)
        res.raise_for_status()
    except requests.RequestException:
        return None
    text = _html_to_text(res.text)
    return text if len(text) > 200 else None


def _extract_programs(page_text: str, case_ctx: dict, api_key: str) -> list[ScrapedProgram]:
    from google import genai
    from google.genai import types

    from .gemini_schema import to_gemini_schema

    prompt = _PROMPT.format(
        disaster=case_ctx.get("disaster_type") or "a disaster",
        region=case_ctx.get("region") or case_ctx.get("location") or "Canada",
        tags=", ".join(sorted(case_ctx.get("tags") or [])) or "none yet",
        vocab=", ".join(sorted(_TAG_VOCAB)),
    )
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt, page_text],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=to_gemini_schema(ScrapedPrograms),
        ),
    )
    return ScrapedPrograms.model_validate_json(response.text).programs


def _program_to_resource(p: ScrapedProgram, source: dict, incident: Optional[date]) -> dict:
    # Deterministic id so re-scrapes update in place instead of duplicating.
    digest = hashlib.sha1(f"{source['key']}|{p.title.lower().strip()}".encode()).hexdigest()[:12]
    body = p.summary.replace("—", ",").strip()
    if p.application_deadline:
        body = f"{body} Applications are noted as due by {p.application_deadline}."

    # The catalog models deadlines as days-since-incident windows; anchor a
    # stated calendar deadline to this case's incident date when we can.
    eligibility_days = None
    if p.application_deadline and incident:
        try:
            days = (date.fromisoformat(p.application_deadline) - incident).days
            if days > 0:
                eligibility_days = days
        except ValueError:
            pass

    return {
        "id": f"scraped-{digest}",
        "type": p.program_type if p.program_type in _RESOURCE_TYPES else source["default_type"],
        "title": p.title.strip()[:200],
        "body": body[:1000],
        "url": p.url or source["url"],
        "phone": p.phone,
        "region": source["region"],
        "disaster_types": p.disaster_types or source["disaster_types"],
        "requires": [t for t in p.audience_tags if t in _TAG_VOCAB],
        "excludes": [],
        "insurance_companies": [],
        "eligibility_days": eligibility_days,
        "scraped_at": date.today().isoformat(),
    }


def _relevant_sources(case_ctx: dict) -> list[dict]:
    region = (case_ctx.get("region") or "").strip().lower()
    disaster = case_ctx.get("disaster_type")
    picked = []
    for s in SOURCES:
        src_region = s["region"].lower()
        if src_region != "*" and region and src_region not in region and region not in src_region:
            continue
        if "*" not in s["disaster_types"] and disaster and disaster not in s["disaster_types"]:
            continue
        picked.append(s)
    return picked[:MAX_SOURCES_PER_RUN]


def scrape_programs_for_case(case: dict, tags: set[str], api_key: str, sb_service) -> dict:
    """Scrape the sources relevant to this case and upsert what Gemini
    extracts into the shared ``resources`` catalog. Returns a summary the
    endpoint can hand to the UI."""
    case_ctx = {
        "disaster_type": case.get("disaster_type"),
        "region": case.get("region"),
        "location": case.get("location"),
        "tags": tags,
    }
    incident = None
    if case.get("incident_date"):
        try:
            incident = date.fromisoformat(str(case["incident_date"])[:10])
        except ValueError:
            pass

    rows: list[dict] = []
    sources_checked: list[str] = []
    for source in _relevant_sources(case_ctx):
        page_text = _fetch_text(source["url"])
        if not page_text:
            continue
        sources_checked.append(source["url"])
        try:
            programs = _extract_programs(page_text, case_ctx, api_key)
        except Exception:
            continue
        rows.extend(_program_to_resource(p, source, incident) for p in programs)

    added = 0
    if rows:
        existing = sb_service.table("resources").select("id").in_(
            "id", [r["id"] for r in rows]
        ).execute()
        existing_ids = {row["id"] for row in (existing.data or [])}
        added = sum(1 for r in rows if r["id"] not in existing_ids)
        sb_service.table("resources").upsert(rows, on_conflict="id").execute()

    return {
        "sources_checked": len(sources_checked),
        "programs_found": len(rows),
        "programs_added": added,
    }
