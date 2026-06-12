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
max_benefit_cad      optional int — rough upper bound on the dollar value
                     this resource can unlock. None for non-monetary
                     resources (helplines, shelters, document replacement).
                     Used by the `personalize_more` unlock estimator.
priority_floor       optional float in [0,1] — lower bound on the final
                     scorer output for this resource. When non-zero, the
                     scorer applies max(scorer_total, priority_floor) so
                     a key resource (e.g. gio-ombud for denial cases)
                     always surfaces strongly when it passes the filter.
tags_added           optional list of strings — extra tags this resource
                     contributes back to the user's tag set if it's
                     surfaced (reserved for future feedback loops;
                     unused by the current scorer but stored on the row).

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
        # DRP structural repair caps run into the hundreds of thousands;
        # 300k is a conservative-but-meaningful anchor for the unlock math.
        "max_benefit_cad": 300_000,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # ~55% of insurable earnings up to ~$668/wk × ~45 wks ≈ $30k.
        # Conservative round-down to $25k.
        "max_benefit_cad": 25_000,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "isc-emap",
        "type": "policy",
        "title": "Indigenous Services Canada — Emergency Management Assistance Program",
        "body": "Covers eligible preparedness, response, evacuation, recovery, and rebuilding costs for on-reserve communities. Residents usually don't apply directly — support is coordinated through the band office, the community, or ISC.",
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
        # EMAP funds response + recovery at the community level; per-
        # household dollar value is highly variable. Conservative $100k
        # as a rebuild-scale anchor.
        "max_benefit_cad": 100_000,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # CRA relief is penalty/interest waivers + filing extensions —
        # dollar value depends entirely on the user's tax debt. Mark null
        # so it doesn't distort the unlock estimator.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Single adult Core Essentials rate ≈ $820/mo; family-of-three
        # ≈ $1,800/mo. Annualised ceiling ≈ $20k conservative.
        "max_benefit_cad": 20_000,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Existing AISH ($1,901/mo single adult) just kept flowing; this
        # is "don't lose what you already get" rather than a new unlock.
        # Annualised ≈ $23k as a continuation value.
        "max_benefit_cad": 23_000,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Lodging + immediate needs grants — non-monetary anchor.
        # Mark null so it doesn't double-count in the unlock estimator.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Non-monetary connector service.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Mobile feeding + emotional care — non-monetary.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Nurse advice line — non-monetary.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Crisis helpline — non-monetary.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Mental-health helpline — non-monetary.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Advisory service — doesn't pay out, but unlocks understanding
        # of an existing policy. Mark null.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # The mediator doesn't pay — it unlocks an underpaid claim. Null
        # max_benefit; the priority_floor is what makes denial cases see
        # it at the top of their list.
        "max_benefit_cad": None,
        "priority_floor": 0.85,
        "tags_added": [],
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
        # Fee waivers for replacement docs save tens of dollars per item.
        # Non-monetary at the rebuild scale we care about — null.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Same reasoning as Service Alberta — non-rebuild-scale dollar value.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # ReStore discounts + chapter-by-chapter rebuild support. Highly
        # variable; $25k as a midpoint anchor for the unlock estimator.
        "max_benefit_cad": 25_000,
        "priority_floor": 0.0,
        "tags_added": [],
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
        # Volunteer labour, not cash. Rough equivalent cost-of-services
        # for a multi-day mud-out / ash-out crew ≈ $5k. Conservative.
        "max_benefit_cad": 5_000,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "team-rubicon-canada",
        "type": "community",
        "title": "Team Rubicon Canada — Disaster Response",
        "body": "Free volunteer crews for debris removal, muck-outs, ash sifting, and damage assessment after floods, wildfires, and tornadoes. Veteran-led teams prioritize vulnerable households at no cost.",
        "url": "https://team-rubicon.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["wildfire", "flood", "tornado"],
        "supports_plans": [4, 7, 10, 11],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": 180,
        "scraped_at": None,
        # Volunteer labour — same cost-of-services anchor as Samaritan's Purse.
        "max_benefit_cad": 5_000,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "mennonite-disaster-service",
        "type": "community",
        "title": "Mennonite Disaster Service Canada",
        "body": "Volunteer cleanup, repair, and full home rebuilding after disasters, focused on uninsured and underinsured households, seniors, and people with disabilities. No cost to the homeowner.",
        "url": "https://mds.org",
        "phone": "1-866-261-1274",
        "region": "*",
        "disaster_types": ["wildfire", "flood", "tornado"],
        "supports_plans": [10, 11],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        # MDS does full rebuilds for the hardest-hit uninsured households.
        # $25k as a conservative repair-scale anchor.
        "max_benefit_cad": 25_000,
        "priority_floor": 0.0,
        "tags_added": [],
    },

    # ----- Cleanup pathways ----------------------------------------------
    # There is no single organization responsible for cleanup after a
    # disaster — who helps depends on whether the loss is insured,
    # uninsured, or covered by a government/community program. These two
    # entries route each side of that split.
    {
        "id": "cleanup-insured-pathway",
        "type": "rebuild",
        "title": "Insurer-arranged cleanup and restoration",
        "body": "If you're insured, your insurance company is the first point of contact for cleanup. They assign an adjuster, approve restoration contractors, and can cover smoke cleanup, water extraction, debris removal, and repairs subject to policy limits. Don't pay for cleanup yourself before asking your adjuster.",
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
        # Routing guidance — the dollars flow through the policy itself.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "cleanup-uninsured-pathway",
        "type": "rebuild",
        "title": "Cleanup help when you're uninsured",
        "body": "No single organization handles cleanup for uninsured losses. Government programs like Alberta DRP usually provide funding rather than crews, while volunteer organizations — Samaritan's Purse, Team Rubicon Canada, Mennonite Disaster Service, Salvation Army, and the Red Cross — provide free cleanup, debris removal, and rebuilding help, especially for vulnerable households.",
        "url": "https://ab.211.ca",
        "phone": "211",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [4, 7, 10, 11],
        "requires": ["uninsured"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        # Routing guidance — value comes from the orgs it points at.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },

    # ----- Indigenous recovery pathway -----------------------------------
    {
        "id": "indigenous-insurance-pathway",
        "type": "insurance",
        "title": "Insurance and recovery on reserve — what's different",
        "body": "There is no Indigenous-specific private insurance product, and on-reserve communities often face higher premiums, limited availability, and underinsurance. Recovery usually flows through EMAP, Indigenous Services Canada, and the band office rather than the standard insurance-then-DRP pathway — but if you do hold private home, tenant, or auto insurance, those claims run in parallel and are worth opening.",
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
        # Pathway guidance — non-monetary.
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },

    # ----- Insurance type guides ------------------------------------------
    # Plain-language explainers for the insurance products that matter
    # after a natural disaster in Alberta. Non-monetary: they unlock
    # understanding of coverage the user may already hold. Bodies are
    # keyword-dense on purpose — the TF-IDF scorer matches them against
    # case items and intake text.
    {
        "id": "ins-guide-homeowners",
        "type": "insurance",
        "title": "Homeowners insurance — what it covers after a disaster",
        "body": "Covers the dwelling, detached structures like garages and sheds, personal contents, liability, and additional living expenses (ALE) while your home is uninhabitable. Fire and hail are commonly covered; flood, overland water, and sewer backup usually require endorsements. Know your deductible and whether you have replacement cost or actual cash value before filing proof of loss.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 8, 9],
        "requires": ["owner"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-tenant",
        "type": "insurance",
        "title": "Tenant insurance — what it covers after a disaster",
        "body": "Covers your personal property, liability, and additional living expenses (ALE) like hotel and food if the rental is uninhabitable — the building itself is the landlord's insurance. Smoke damage to belongings and displacement during repairs are typical claims; flood coverage is usually an optional endorsement.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 6],
        "requires": ["renter"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-condo",
        "type": "insurance",
        "title": "Condo insurance — unit, betterments, and assessments",
        "body": "Covers your unit's interior finishes and improvements (betterments), personal contents, liability, and sometimes special assessments from the condo corporation after a big building loss. The building envelope and common elements fall under the condo corporation's master policy — ask about deductible assessment coverage.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 8, 9],
        "requires": ["owner"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-auto",
        "type": "insurance",
        "title": "Auto insurance — hail, flood, and wildfire claims",
        "body": "Comprehensive coverage handles most disaster losses to vehicles — hail damage, smoke, floodwater in the interior or engine, and fire during evacuation. Total losses pay out at actual cash value; ask about rental vehicle coverage and towing while yours is in repair.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 6, 8, 9],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-rv",
        "type": "insurance",
        "title": "RV insurance — motorhomes and trailers in a disaster",
        "body": "Covers motorhomes or trailers, the contents inside, liability, and often emergency accommodation if you're stranded by road closures or campground displacement. Hail, wildfire smoke, and flood losses are typical claims under comprehensive coverage.",
        "url": "https://ibc.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [6, 8, 9],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-boat",
        "type": "insurance",
        "title": "Boat insurance — storm and wildfire losses",
        "body": "Covers hull and machinery, liability, theft, sinking, and often salvage costs. Storm damage at the dock, hail, debris-damaged motors, and theft after emergency displacement are typical disaster claims — check navigation limits and lay-up period rules.",
        "url": "https://ibc.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [8, 9],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-farm",
        "type": "insurance",
        "title": "Farm insurance — buildings, machinery, and displacement",
        "body": "Package coverage for the farm dwelling, barns and outbuildings, machinery and equipment, and liability — sometimes business interruption and contents too. Wildfire loss to barns, wind damage to machine sheds, and hail-damaged equipment are typical claims; flood usually needs an endorsement.",
        "url": "https://ibc.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 8, 9],
        "requires": ["owner"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-crop",
        "type": "insurance",
        "title": "Crop insurance (AFSC) — yield and quality losses",
        "body": "Protects crop producers against production losses from insured perils — hail, flood, wind, frost, drought, and excess rain — including quality downgrades from wildfire smoke. Claims work through your acreage report, production guarantee, and an appraised loss; AFSC administers the program in Alberta.",
        "url": "https://afsc.ca",
        "phone": "1-877-899-2372",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-livestock",
        "type": "insurance",
        "title": "Livestock insurance — mortality and disaster losses",
        "body": "Covers livestock mortality, transit losses, and specified farm-animal risks depending on the program. Barn fires, smoke inhalation, injuries during evacuation, and flood-related mortality are typical disaster claims — valuation and salvage rules drive the payout.",
        "url": "https://afsc.ca",
        "phone": "1-877-899-2372",
        "region": "AB",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-business",
        "type": "insurance",
        "title": "Business insurance — operations, assets, and liability",
        "body": "Package policies combine property, liability, crime, equipment breakdown, and optional business interruption coverage. Store closures after evacuation, inventory lost to flooding or smoke, and customer injuries on damaged premises are typical disaster claims — flood and catastrophe risks may need endorsements.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-commercial-property",
        "type": "insurance",
        "title": "Commercial property insurance — buildings and stock",
        "body": "Covers business buildings, inventory, equipment, signage, and sometimes tenant improvements. Hail-collapsed roofs, wildfire-destroyed contents, and spoiled freezer stock after outages are typical claims; earthquake and flood often need separate buybacks or endorsements.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [5, 8, 9],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-business-interruption",
        "type": "insurance",
        "title": "Business interruption insurance — lost income during shutdown",
        "body": "Replaces lost income and extra expenses after an insured shutdown — payroll, rent, taxes, and relocation costs during evacuations, road closures, or long rebuilds. Coverage only triggers if the underlying property damage is covered; watch the waiting period and indemnity period limits.",
        "url": "https://ibc.ca",
        "phone": "1-844-227-5422",
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": ["income_disrupted"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-life",
        "type": "insurance",
        "title": "Life insurance — claims after a disaster-related death",
        "body": "Pays a death benefit to beneficiaries and can support mortgage payoff or family recovery after a disaster-related death. Beneficiaries file with proof of death; term and permanent policies both apply as long as the policy hadn't lapsed.",
        "url": "https://clhia.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-disability",
        "type": "insurance",
        "title": "Disability insurance — income replacement after injury",
        "body": "Replaces monthly income when illness or injury prevents work — including injuries during evacuation, smoke inhalation, or post-disaster stress claims depending on the policy. Check the elimination period and whether your policy uses an own-occupation or any-occupation definition.",
        "url": "https://clhia.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": ["income_disrupted"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-critical-illness",
        "type": "insurance",
        "title": "Critical illness insurance — lump sum after diagnosis",
        "body": "Pays a one-time lump sum after diagnosis of a covered serious illness such as cancer, heart attack, or stroke — including illness following prolonged disaster stress or delayed treatment. The payout is yours to use for care, travel, or household costs during the rebuild; survival periods and covered-condition lists apply.",
        "url": "https://clhia.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-extended-health",
        "type": "insurance",
        "title": "Extended health insurance — medication and counselling",
        "body": "Pays for medical services beyond public coverage — prescription drug replacement after evacuation, counselling and physiotherapy, dental, vision, and medical supplies. Lost medications, injury rehab after cleanup, and mental health support after trauma are typical disaster uses; check annual maximums and co-pays.",
        "url": "https://clhia.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [0, 5, 6, 8, 9],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-travel",
        "type": "insurance",
        "title": "Travel insurance — disasters during or interrupting a trip",
        "body": "Covers trip cancellation or interruption, emergency medical, baggage, and delays — natural disasters can trigger interruption benefits if your home becomes uninhabitable or wildfire road closures strand you. File with proof of the event and claim the unused portion of the trip.",
        "url": "https://clhia.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [0],
        "requires": [],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
    },
    {
        "id": "ins-guide-mortgage",
        "type": "insurance",
        "title": "Mortgage insurance — keeping payments current",
        "body": "Mortgage life insurance pays the lender or beneficiaries on death; mortgage disability and critical illness riders can make your payments if you can't work after a disaster-related injury or illness. Watch waiting periods and benefit limits — and check this coverage before missing a payment.",
        "url": "https://clhia.ca",
        "phone": None,
        "region": "*",
        "disaster_types": ["*"],
        "supports_plans": [4, 5, 8, 9],
        "requires": ["owner"],
        "excludes": [],
        "insurance_companies": None,
        "eligibility_days": None,
        "scraped_at": None,
        "max_benefit_cad": None,
        "priority_floor": 0.0,
        "tags_added": [],
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
