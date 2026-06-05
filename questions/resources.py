"""
Resource catalogue for the recommender.

A resource is anything we might surface to a user: a government policy,
a shelter, a hospital, a community program. The shape below is the
*one schema* — scraped government policies should be normalised into
this same shape before being fed into the recommender.

Tone reminder: recommendations are framed as "maybe you can do",
never "must do". The data here is what we suggest; the scorer
ranks; the UI does the soft framing.

Field reference
---------------
id                   stable string id
type                 category bucket — drives UI grouping
                     {policy, shelter, health, financial, community, documents}
title                short human-readable name
body                 one or two sentences explaining what it is / why it helps
url                  authoritative link
phone                optional callable number
region               province code (e.g. "AB") or "*" for national
disaster_types       list of disaster types it applies to, or ["*"] for any
                     e.g. {"wildfire", "flood", "tornado", "earthquake", "*"}
supports_plans       which of the 12 intake plan_ids this helps with — used
                     for plan-alignment scoring (dot-product against the
                     intake engine's plan distribution)
requires             user must have ALL of these derived tags
                     (see recommender.derive_tags for the vocabulary)
excludes             user must have NONE of these derived tags
insurance_companies  optional list of insurer names — if user's insurer
                     matches one of these, big score boost
eligibility_days     optional int — applications must be filed within this
                     many days of the disaster date. None = no window.
scraped_at           ISO date string if this came from the scraper, else
                     None for hand-curated entries. Drives freshness decay.

Scraper integration
-------------------
The web-scraping pipeline should emit dicts matching this schema and
either append to RESOURCES at startup or be loaded by
`load_scraped_resources(path)` and passed to `Recommender(resources=...)`.
The single hard part of scraping is structuring the unstructured —
budget for a small LLM pass at scrape-time to extract region,
disaster_types, audience tags, and deadlines from PDF prose.
"""

from typing import Optional


# Hand-curated seed list. Scraper output should be appended to (or
# loaded alongside) this list at app startup.
RESOURCES: list[dict] = [
    # ----- Government policies / programs --------------------------------
    {
        "id": "ab-drp",
        "type": "policy",
        "title": "Alberta Disaster Recovery Program (DRP)",
        "body": "Provincial program covering uninsurable losses from declared disasters — personal essentials, structural repair, temporary lodging.",
        "url": "https://alberta.ca/disaster-recovery-programs",
        "phone": "310-4455",
        "region": "AB",
        "disaster_types": ["wildfire", "flood", "tornado", "*"],
        "supports_plans": [4, 7, 10, 11],
        "requires": [],
        "excludes": ["on_reserve_or_metis"],
        "insurance_companies": None,
        "eligibility_days": 90,
        "scraped_at": None,
    },
    {
        "id": "ei",
        "type": "financial",
        "title": "Employment Insurance (EI) — disaster provisions",
        "body": "Federal income support during work interruptions. Service Canada often activates expedited processing for declared disasters, even without a formal layoff.",
        "url": "https://canada.ca/ei",
        "phone": "1-800-206-7218",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": ["income_disrupted"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "isc-emap",
        "type": "policy",
        "title": "Indigenous Services Canada — Emergency Management Assistance Program",
        "body": "Covers eligible response and recovery costs for on-reserve communities. Coordinated through the band office.",
        "url": "https://sac-isc.gc.ca/eng/1534954090122",
        "phone": "1-800-567-9604",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [2, 3],
        "requires": ["on_reserve_or_metis"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "cra-disaster-relief",
        "type": "financial",
        "title": "CRA Taxpayer Relief — disaster provisions",
        "body": "Cancellation of penalties and interest on tax debt for taxpayers affected by a declared disaster. Filing extensions also available.",
        "url": "https://canada.ca/en/revenue-agency/services/about-canada-revenue-agency-cra/complaints-disputes/cancel-waive-penalties-interest.html",
        "phone": "1-800-959-8281",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5, 8, 9, 10, 11],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "ab-income-support",
        "type": "financial",
        "title": "Alberta Works — Income Support",
        "body": "Short-term emergency financial help for Albertans whose income has dropped below basic-needs thresholds.",
        "url": "https://alberta.ca/income-support",
        "phone": "1-866-644-5135",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [4, 7],
        "requires": ["income_disrupted"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "aish",
        "type": "financial",
        "title": "AISH caseworker — update your file",
        "body": "If you were already receiving AISH or Income Support, contact your caseworker to update your address and confirm direct deposit continues.",
        "url": "https://alberta.ca/aish",
        "phone": "1-877-644-9992",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [4],
        "requires": ["on_assistance"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },

    # ----- Shelter / immediate safety -----------------------------------
    {
        "id": "red-cross-lodging",
        "type": "shelter",
        "title": "Canadian Red Cross — Emergency Lodging",
        "body": "24/7 emergency lodging and immediate financial assistance for people displaced by a disaster.",
        "url": "https://redcross.ca",
        "phone": "1-800-418-1111",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [0, 7],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "211-alberta",
        "type": "community",
        "title": "211 Alberta — Community Resource Line",
        "body": "Free 24/7 connector to local shelters, food banks, mental-health supports, and disaster assistance. Just dial 211.",
        "url": "https://ab.211.ca",
        "phone": "211",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [0, 4, 7, 10],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "salvation-army-ab",
        "type": "community",
        "title": "Salvation Army Alberta — Emergency Disaster Services",
        "body": "Mobile feeding, hydration, and emotional/spiritual care at evacuation centres across Alberta.",
        "url": "https://salvationarmy.ca",
        "phone": None,
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [0, 7],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },

    # ----- Health -------------------------------------------------------
    {
        "id": "ahs-health-link",
        "type": "health",
        "title": "AHS Health Link — 811",
        "body": "24/7 free nurse advice line. Useful for prescription refills lost in the disaster, or any non-emergency medical question.",
        "url": "https://albertahealthservices.ca/healthlink",
        "phone": "811",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": list(range(12)),
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "hope-for-wellness",
        "type": "health",
        "title": "Hope for Wellness Helpline",
        "body": "24/7 culturally grounded mental health and crisis support for Indigenous people across Canada.",
        "url": "https://hopeforwellness.ca",
        "phone": "1-855-242-3310",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [2, 3],
        "requires": ["on_reserve_or_metis"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "ahs-mental-health",
        "type": "health",
        "title": "Alberta Mental Health Helpline",
        "body": "24/7 confidential support, information, and referrals for any mental-health concern. Long recovery processes are exhausting — this exists for exactly that.",
        "url": "https://albertahealthservices.ca",
        "phone": "1-877-303-2642",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": list(range(12)),
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },

    # ----- Insurance ----------------------------------------------------
    {
        "id": "ibc-consumer",
        "type": "financial",
        "title": "Insurance Bureau of Canada — Consumer Info Centre",
        "body": "Free help understanding your policy, the claims process, and what additional living expenses (ALE) coverage typically pays for.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 6, 8, 9],
        "requires": ["insured"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "gio-ombud",
        "type": "financial",
        "title": "General Insurance OmbudService",
        "body": "Free, independent mediation if your insurance claim feels stuck or you've been denied something you think should be covered.",
        "url": "https://giocanada.org",
        "phone": "1-877-225-0446",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [8],
        "requires": ["insurance_claim_filed"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },

    # ----- Document replacement -----------------------------------------
    {
        "id": "service-alberta-id",
        "type": "documents",
        "title": "Service Alberta — replace ID",
        "body": "Replacement driver's licence, ID card, and registry documents. Fees are often waived for residents displaced by a declared disaster.",
        "url": "https://alberta.ca/registry-agents",
        "phone": None,
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [1],
        "requires": ["missing_id"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "service-canada-sin",
        "type": "documents",
        "title": "Service Canada — replace SIN and federal ID",
        "body": "Replacement Social Insurance Number card and other federal identity documents.",
        "url": "https://canada.ca/en/employment-social-development/services/sin.html",
        "phone": "1-800-622-6232",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [1],
        "requires": ["missing_id"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },

    # ----- Community / rebuild ------------------------------------------
    {
        "id": "habitat-ab",
        "type": "community",
        "title": "Habitat for Humanity — Alberta chapters",
        "body": "Long-term rebuild support and ReStore discounts for materials. Eligibility varies by chapter — worth a call.",
        "url": "https://habitat.ca",
        "phone": None,
        "region": "AB",
        "disaster_types": ["wildfire", "flood", "tornado", "*"],
        "supports_plans": [10, 11],
        "requires": ["owner"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
    },
    {
        "id": "samaritans-purse",
        "type": "community",
        "title": "Samaritan's Purse Canada — Disaster Relief",
        "body": "Free volunteer crews for mud-out, ash-out, and chainsaw work after floods, wildfires, and tornadoes.",
        "url": "https://samaritanspurse.ca",
        "phone": "1-866-628-6565",
        "region": "*",
        "disaster_types": ["wildfire", "flood", "tornado"],
        "supports_plans": [4, 7, 10, 11],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": 180,
        "scraped_at": None,
    },
]


def resource_by_id(rid: str) -> dict:
    for r in RESOURCES:
        if r["id"] == rid:
            return r
    raise KeyError(f"Unknown resource id: {rid}")


def load_scraped_resources(path: str) -> list[dict]:
    """
    Load a JSON list of scraped resources (one per record, matching the
    schema above) and return them. Caller is responsible for combining
    with RESOURCES before constructing the Recommender.
    """
    import json
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
