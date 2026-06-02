# rebuildr — AI-Powered Disaster Recovery Assistant

## Project Overview
rebuildr (formerly EmberPath) is an AI-powered disaster readiness and post-disaster recovery platform for **Alberta and the rest of Canada**, helping disaster-affected communities navigate insurance claims, recovery processes, and fragmented support systems.

The platform is built **disaster-generic** (wildfires, floods, severe storms, other emergencies) but **geography-specific** — anchored in Alberta's regulatory, alerting, and aid ecosystem first (Alberta Emergency Alert, Alberta Disaster Recovery Program, IBC claim standards, Alberta Wildfire), extensible to other Canadian provinces.

Inspiration is drawn from three existing platforms covering different parts of the space:
- **FEMA app** (U.S.) — centralized consumer disaster support
- **American Red Cross Emergency app** (U.S.) — active-disaster safety features ("I'm Safe" check-ins, real-time alerts, shelter locator)
- **Encircle** (Canada) — professional-grade claims documentation rigor

rebuildr focuses primarily on **post-disaster recovery**, with extensions into pre-disaster preparedness (home inventory) and active-disaster safety (alerts, safety check-ins).

---

# Core Problem

Current disaster recovery systems are fragmented across:
- Insurance providers
- Government portals (federal + provincial)
- Emergency alerts
- Contractors
- Aid programs
- Community updates

After disasters, people are expected to:
- understand complex insurance/legal documents,
- document property damage,
- organize claims,
- access recovery resources,
- and rebuild their lives while under stress.

This process is difficult, confusing, and inaccessible — particularly for rural Albertans, Indigenous communities, immigrants, and others underserved by mainstream recovery channels.

---

# Main Goal

Reduce post-disaster chaos for Albertans and Canadians by creating:
- a centralized recovery interface,
- simplified recovery guidance,
- AI-assisted claims support,
- personalized recovery plans for vulnerable populations,
- across multiple disaster types,
- with deep integration into Alberta's specific aid and alert systems.

---

# Geographic & Regulatory Focus — Alberta, Canada

rebuildr is **disaster-type-generic** but **geography-specific**. Alberta is the anchor; the platform extends to other Canadian provinces over time.

## Why Alberta
- **High disaster frequency and severity:** 2013 Calgary / Southern Alberta floods, 2016 Fort McMurray wildfire (~$9.9B insured losses, largest evacuation in Canadian history), 2023 record-breaking wildfire season, 2024 Jasper wildfire
- **Significant rural and Indigenous populations** affected by recovery system gaps
- **Active provincial disaster infrastructure** to integrate with
- **Recurring annual wildfire seasons** producing ongoing demand
- **Recovery pain points are concrete** and well-documented from recent events

## Alberta Resources to Integrate
- **Alberta Emergency Alert** — provincial alert system (feeds into national Alert Ready)
- **Alberta Wildfire** (alberta.ca/wildfire) — active fire status, fire bans, evacuation info
- **Alberta Emergency Management Agency (AEMA)** — provincial emergency coordination
- **Alberta Disaster Recovery Program (DRP)** — provincial program for uninsurable disaster losses; a key aid pathway rebuildr should help users navigate
- **Alberta Health Services (AHS)** — hospital and healthcare locator
- **211 Alberta** — community resource line for non-emergency support
- **Indigenous Services Canada** federal pathways for First Nations and Métis Settlements
- **First Nations in Alberta** — Treaty 6, Treaty 7, Treaty 8 territories; many have distinct emergency protocols

## Canada-Wide Layer
- **Alert Ready** — national emergency alert system
- **Insurance Bureau of Canada (IBC)** — claim format standards
- **Canadian Red Cross** — partner organization for shelter and recovery
- **Indigenous Services Canada** — federal aid for Indigenous communities

*Note: Specific Alberta program names/URLs sourced from training-data knowledge. Verify program scope and current entry points before building integrations.*

---

# Phase I — Image Classification → Claims

*From whiteboard. Capture experience inspired by Encircle's verified field documentation workflow, retargeted at the consumer pre-loss market Encircle explicitly walked away from.*

## Pre-Disaster Flow
- User uploads photos of their home (or captures live during a guided walkthrough)
- System builds a home inventory:
  - **Image classification (IC)** detects objects
  - Manual option to add objects the model misses
  - Estimated monetary value (optional)
- Items **categorized by room**
- **Stored locally** on device
- Exportable as **PDF**

## Capture Enhancements (Encircle-inspired)

Encircle's published feature set for restoration contractors maps directly onto what consumers need for pre-loss documentation — but no one is offering this to consumers. Features to build:

- **Smartphone-video floor plan / room mapping** — Encircle proves this works without AR or LiDAR. User records a walkthrough video; server-side processing produces a 2D floor plan (Encircle's average turnaround is ~2 hours).
- **Single-photo AI item identification** — adopt Encircle's *AI Item Descriptions* pattern exactly: one photo → automated description, brand, model. Cuts inventory time substantially.
- **Video walkthroughs with AI narration summary** — record voice-over during filming (*"dishwasher, bought 2022, receipt attached"*); AI transcribes + summarizes per room.
- **Multi-language narration** — Encircle supports Spanish/French → English summaries. rebuildr should support English, French (Canadian official languages), and Indigenous Alberta languages where possible.
- **Photo annotation** — markup tools (arrows, circles, text) for highlighting items or damage.
- **Geo-tagging + timestamping** — automatic, embedded in metadata. Critical for proving when and where pre-loss photos were taken.
- **Receipt attachment per item** — link purchase receipts, warranties, proof-of-ownership.
- **OCR on receipts** — extract price, date, merchant into the inventory record automatically.
- **Offline mode** — full capture without connectivity; syncs when online. Essential for post-disaster zones (Encircle is fully offline-first).
- **Real-time multi-device sync** — family members can document different rooms simultaneously (Encircle has this for restoration teams; same value for households).
- **360° photo capture (future)** — Encircle integrates with Ricoh Theta; consumer alternative could be smartphone panorama or 360° camera support down the line.

## Post-Disaster Flow
- User uploads post-disaster photos (or records a video walkthrough of damaged property)
- System **compares with pre-disaster photos**
- Calculates **estimated monetary loss**
- Generates a **claim-ready report** with side-by-side pre/post evidence

## Open Items
- UI / UX design
- Test cases
- Exception handling

---

# Phase II — Document Processing & Recovery Guidance

*From whiteboard.*

## Inputs (Pre & Post)
- Insurance policies
- Claim documents
- Government aid forms (federal, Alberta DRP, Indigenous Services Canada)

## Pipeline
1. **Text extraction**
2. **Document storage** + optional **Chatbot**
3. **Text extraction** with:
   - Simplify text
   - Flag scams
   - Missing info check
4. **Recovery To-Do list** generation (Alberta-specific where applicable)
5. **Connect to Phase I** (image evidence linked to claims)

---

# Phase III — Personalized Recovery Plan

*From whiteboard.*

A guided onboarding flow that tailors the recovery experience to each user's situation. This is the personalization layer that makes the recovery to-do list and resource recommendations specific to the person, not generic.

## Personalized Intake
**5–6 personalised questions** covering:
- **Location** (Alberta region — urban / rural / remote / on-reserve)
- **Dependents** (kids, elderly, pets, mobility needs)
- **Residency / citizenship status** — Indigenous communities, immigrants, domestic (Canadian citizen) residents. Aid program eligibility, required forms, and available agencies differ substantially across these groups.

## Plan Generation
Based on intake answers, the system maps users to one of **~20–25 pre-built recovery plan combinations**, each tuned to the specific intersection of needs and routing to the right Alberta / Canadian aid pathways.

Example: *Indigenous + rural + dependents* routes through Indigenous Services Canada + band-level emergency management, while *immigrant + urban + renter* routes through Alberta DRP + tenant-specific insurance guidance.

## Progress Tracking
A **progress bar** keeps users motivated through the multi-step recovery process — small completion wins to encourage continued engagement during a stressful time.

---

# Models — Concrete AI Architecture

*From whiteboard.*

## Task 1 — Identifying objects in images & estimating price
- **Pipeline:** Input → **YOLOv8m** *or* **EfficientNet-B0** → **Linear Regression** (?) for price estimation
- Regression estimates monetary value using **similar-looking objects scraped from the internet** as reference data
- *Adopt Encircle's single-photo AI Item Descriptions pattern: one photo → description + brand + model + value, not many photos per item*
- Powers inventory + delta-loss calculation in Phase I

## Task 2 — Identifying scams
- **Pipeline:** Text input → **Classification model**
- Powers scam flagging in Phase II and broader misinformation detection

## Task 3 — Making tasks from legal documents & user's situation
- **Pipeline:** Text input → **NLP** → **LLM output**
- Combines extracted legal/policy content with Phase III user context → personalized, situation-aware to-do list
- Ties Phase II (documents) and Phase III (personalization) together

## AI Orchestration Pattern (Encircle-inspired)

Encircle's publicly described AI architecture is a useful blueprint for rebuildr. Their four-layer stack:

1. **Infrastructure** — private cloud; customer data never used to train public foundation models
2. **Technology** — orchestration of foundation LLMs (Encircle names OpenAI, Anthropic, and Google as their LLM providers) plus visual and audio analysis tools
3. **Architecture / Engineering** — domain-specific logic (Encircle: IICRC restoration standards. rebuildr equivalent: IBC claim standards, Alberta DRP requirements, Indigenous Services pathways), agentic workflows, and validation steps that refuse to guess when data is insufficient
4. **Application UI** — the user-facing experience

**Two principles to adopt explicitly:**
- **"Accuracy over completion"** — the system refuses to guess when input data is incomplete, rather than hallucinating. This is critical for claims and aid applications where errors have real financial consequences and could invalidate a submission.
- **Audit logging** — every AI interaction logged for an audit trail, so users (and adjusters) can see exactly how a recommendation was derived. Important when the output is going into a legal claim document.

The project constraints rule out external LLM API calls. Where Encircle uses external foundation LLMs, rebuildr substitutes local models (the project requirement) — but the layered architecture pattern still applies.

---

# Additional Features — Extended Recovery Coordination

The broader capability set surrounding the three core phases.

## Active-Disaster Safety (Red Cross Emergency App-inspired)

The American Red Cross Emergency app is the reference for **safety-during-disaster** features, complementing the post-disaster focus of the core platform.

- **Real-time location-based alerts** — feed from Alert Ready and Alberta Emergency Alert; notify users when their area is under active threat
- **"I'm Safe" status sharing** — one-tap broadcast to a designated contact list (*"I'm safe, evacuated to X"*). Huge anxiety reduction during active events.
- **Family check-in** — see status of designated contacts (with their consent)
- **Open shelter locator** — currently-active Red Cross / municipal shelters in the affected area, not a generic shelter list
- **First aid quick reference** — offline-available guides for common emergencies
- **Preparedness checklists per disaster type** — wildfire prep, flood prep, severe storm prep, 72-hour evacuation kit
- **Toolkit utilities** — flashlight, strobe, audible alarm (for users signaling help)
- **Customizable alert preferences** — choose disaster types and monitored locations (home + loved ones)

*Note: Red Cross app features cited from training-data knowledge; verify against the current American Red Cross Emergency app and the Canadian Red Cross "Be Ready" app for accuracy.*

## Claims & Documentation
- Insurance claims navigation
- Guidance on **where and how to file claims** — *the platform helps users navigate, it does not file claims on their behalf*
- **Contract simplification**, paired with chatbot
- **Date extraction** from documents → automatically generated **date-wise to-do list**
- **Scam and misinformation detection** across documents and communications
- **Claim collaboration mode** (Encircle-inspired) — policyholder, adjuster, and optionally contractor can view a shared claim record
- **Carrier-specific / stakeholder-specific report formats** — Encircle generates different report types per audience; rebuildr equivalent: IBC-compatible homeowner submission, Alberta DRP application format, Indigenous Services format
- *Future:* integrations with industry estimating tools like Xactimate

## Rebuilding & Permits
- **Rebuilding permit** guidance (municipal-specific where possible)
- **Recovery tracking** (per-user and per-region)

## Relocation & Emergency Resources
- **Relocation help**
- **Access to emergency resources**
- **Shelters nearby** — location + availability (live data where Red Cross / municipality feeds are available)
- **Nearby healthcare / hospitals** via AHS data
- **Backup contacts** — government, emergency services, key recovery agencies

## Alerts
- Detecting active disasters
- Predicting incoming disasters
- Integration with Alert Ready + Alberta Emergency Alert

## Predictive Capabilities
Forecasting based on historical and live data:
- **Shelter shortages**
- **Delayed rebuilding areas**
- **Recovery bottlenecks**

*Contractor overload prediction was scoped out (crossed off the board).*

## Clustering + Geospatial AI

**Priority focus** (per whiteboard):
- **Recovery speed by region**
- **Damage severity by area**

**Extended scope** for future phases:
- Healthcare availability
- Infrastructure access
- Wildfire / disaster spread modeling
- Evacuation areas

---

# Inspirations

rebuildr draws from three existing platforms covering different parts of the disaster / claims space. The combination is the differentiator — no single existing app does all three.

## 1. FEMA App (U.S.) — Consumer Disaster Support Template

A reference for **centralized, consumer-facing disaster support**. Notable patterns:
- Real-time alerts and warnings
- Shelter locator
- Emergency contact information
- Disaster recovery resources
- Application status tracking for federal aid

## 2. American Red Cross Emergency App — Active-Disaster Safety Template

A reference for **safety-during-disaster** features. Notable patterns:
- Real-time location-based emergency alerts (~35 disaster/weather types)
- "I'm Safe" notifications to broadcast status to family
- Family check-in to see loved ones' status
- Open shelter locator (active shelters only)
- First aid information (text + video)
- Step-by-step preparedness instructions per disaster type
- Customizable alerts (disaster type + monitored locations)
- Toolkit utilities (flashlight, strobe, alarm)
- Multi-language support

The Canadian equivalents to investigate are the Canadian Red Cross "Be Ready" app and their First Aid app, which cover overlapping but not identical ground.

*Feature set described from training-data knowledge — verify before relying on specifics.*

## 3. Encircle (Canada) — Professional Claims Documentation Template

A B2B field documentation and workflow platform for property restoration contractors, headquartered in Kitchener, Ontario. Trusted by 3,000+ restoration shops including Belfor, PuroClean, Paul Davis, ServiceMaster Restore, Restoration 1, and First General.

**Most transferable capabilities for rebuildr:**
- **Single-photo AI item identification** (Encircle AI Item Descriptions) — one photo → description + brand + model. Claimed to cut packout time by 50%+. Directly applicable to home inventory.
- **Smartphone-video floor plan generation** — no AR or LiDAR; server-side processing in ~2 hours. Walkable for any consumer with a phone.
- **Offline-first architecture** — full capture works without connectivity; syncs when online.
- **Real-time multi-device sync** — multiple users document simultaneously.
- **AI Video Summaries with multi-language input** — record narration in another language → English summary. rebuildr equivalent: English + French + Indigenous Alberta languages.
- **AI orchestration architecture** — multi-LLM orchestration + visual/audio analysis + domain-specific validation. Strong reference for rebuildr's stack.
- **"Accuracy over completion" principle** — refuse to guess; never hallucinate in claim documents.
- **Carrier-specific report formats** — different output formats per stakeholder.

**Critical positioning insight — the empty market:**

Encircle's consumer / pre-loss home inventory feature was reviewed positively as early as 2016, but as of 2026 the company has **explicitly deprioritized this segment** to focus entirely on B2B restoration contractors. There is no current standalone pre-loss documentation product marketed to homeowners.

**This is the gap rebuildr fills.** Encircle is the right reference for *documentation quality*, but the consumer pre-loss market is empty — and that's exactly where Phase I's pre-disaster home inventory lives.

**What rebuildr does NOT inherit from Encircle:**
- B2B pricing / restoration contractor positioning
- IICRC restoration certification standards (those are for professional contractors)
- Xactimate / restoration software integrations (contractor tools)
- Specialized hardware integrations (Tramex moisture meters, Ricoh Theta cameras) — rebuildr stays smartphone-only

## What rebuildr Adds That None of the Three Provides

- **FEMA's audience** (ordinary consumers in disasters)
- **with Encircle's documentation rigor** (in the segment Encircle abandoned)
- **and Red Cross's safety-during-disaster features**
- **all anchored in Alberta's specific aid ecosystem** (DRP, IBC, AEMA, Indigenous Services, Alberta Emergency Alert)
- **with AI-driven personalization** for vulnerable populations (Phase III)
- **document simplification for Canadian forms** specifically (Phase II)
- **scam detection** across documents and communications
- **predictive resource availability** at the regional level
- **multi-language support** including Indigenous Alberta languages

No existing app combines all of these for the Alberta / Canadian consumer market.

---

# Scope — Alberta-Anchored, Disaster-Generic

rebuildr is **disaster-type-generic** (wildfires, floods, severe storms) but **geography-specific** — Alberta first, expandable to the rest of Canada.

**Rationale:**
- Disaster-generic: the same pain points (fragmented claims, lost documentation, confusing aid forms) cross all disaster types
- Alberta-anchored: regulatory, aid, and alert systems are provincial; integrating deeply with Alberta's systems gives users genuinely useful answers, not generic guidance
- Wildfires are Alberta's primary recurring disaster, but the platform is not wildfire-only by design — floods (Calgary 2013), severe storms, and emerging climate events all qualify

**Target disaster categories:**
- Wildfires (Alberta primary)
- Floods
- Severe storms
- Other emergencies

The Alberta wildfire demo narrative — *Sarah photographed her home in March, the fire hit in July, rebuildr confirmed $14,200 in losses with photographic proof on both sides* — still anchors the MVP. The narrative is wildfire-specific by example; the platform is not wildfire-limited by design.

---

# AI Techniques — Consolidated View

| Capability | Concrete Models / Techniques |
|---|---|
| Object detection (Phase I) | YOLOv8m, EfficientNet-B0 |
| Single-photo item identification | Image → caption/classification model (Encircle pattern) |
| Price estimation (Phase I) | Linear Regression on similar-object reference data |
| Document simplification (Phase II) | NLP, Transformers, BERT/T5, RAG |
| Scam detection (Task 2) | Text classification |
| To-do generation from docs + user context (Task 3) | NLP + LLM (local, per project constraint) |
| Personalized recovery (Phase III) | Rule-based mapping: intake → 20–25 plan combinations |
| Recovery decision optimization | Markov Decision Processes (MDPs) — *aspirational* |
| Predictive capacity | Time-series forecasting |
| Geospatial layer | Clustering (DBSCAN, k-means), geospatial AI |
| OCR (receipts, document images) | Standard OCR + post-processing |
| Multi-language audio narration | Speech-to-text + translation + summarization |

Architecture pattern (per Encircle reference): foundation/local models → domain-specific logic + validation → application UI. "Accuracy over completion" — refuse to guess.

---

# AI for Good Angle

The project focuses on:
- equitable access to recovery support,
- reducing confusion during crises,
- simplifying inaccessible legal systems,
- supporting rural and underrepresented communities,
- explicit Alberta Indigenous community support (Treaty 6/7/8, Métis Settlements),
- reducing barriers to recovery.

The goal is not to replace human systems, but to make critical recovery information more understandable, accessible, and coordinated.

---

# Indigenous & Underrepresented Community Relevance

Alberta is home to Treaty 6, Treaty 7, and Treaty 8 First Nations, plus Métis Settlements and significant urban Indigenous populations. Many First Nations communities have distinct emergency management protocols and federal aid pathways through Indigenous Services Canada that differ from provincial DRP routes.

The Phase III intake explicitly tailors recovery plans across **residency / citizenship status**, since aid program eligibility and required documentation vary significantly between groups:
- **Indigenous communities** (Treaty 6 / 7 / 8, Métis Settlements, urban Indigenous) — aid via Indigenous Services Canada and band-level emergency management
- **Immigrants** (including newcomers unfamiliar with Canadian aid systems) — language and process navigation
- **Domestic residents** (Canadian citizens) — provincial Alberta DRP and insurance pathways
- **Rural and remote populations** — connectivity, distance from services
- **Users with lower digital literacy** — interface and assistance design

**Accessibility considerations:**
- simplified language,
- low-bandwidth support (essential in rural Alberta and remote communities),
- offline-first capture and reading (Encircle pattern),
- multi-language including English, French, and Indigenous Alberta languages where feasible,
- conversational recovery assistance.

---

# Name
## rebuildr

Replaces **EmberPath**. Broader (not tied to fire/embers), action-oriented, and works across disaster types.

---

# Updated 50-Word Summary

rebuildr is an AI-powered disaster recovery assistant for Alberta and Canada, helping affected communities navigate insurance claims, document damage, access safety resources, and rebuild after wildfires, floods, and storms. Inspired by FEMA, Red Cross, and Encircle, it combines image-based damage documentation, document simplification, personalized recovery planning, and Alberta aid pathway navigation.

---

# One-Line Pitch

**rebuildr** — an AI-powered, Alberta-first disaster recovery platform that helps communities document damage, navigate insurance and aid, stay safe during active emergencies, and rebuild — with plans personalized to each household's situation.

---

# 2-Minute Pitch Summary

The project focuses on the gap that exists *after* disaster evacuation. While many systems focus on prediction and emergency response, post-disaster recovery remains fragmented and difficult to navigate — and especially so for rural Albertans, Indigenous communities, immigrants, and other underserved groups.

rebuildr helps users:
- document damage with pre- and post-disaster photos (YOLOv8m / EfficientNet-B0 + price regression, plus single-photo AI item identification),
- understand insurance and aid documents (NLP simplification + scam classification),
- get a personalized recovery plan based on location, dependents, and demographic context (~20–25 plan combinations routing to Alberta DRP, Indigenous Services, or insurance carriers as appropriate),
- stay safe during active disasters with Red Cross-style "I'm Safe" check-ins and Alert Ready integration,
- access shelters, hospitals, and emergency resources nearby,
- track recovery progress on a motivating progress bar,
- avoid scams and misinformation,
- view regional recovery speed and damage severity through geospatial clustering.

The combination is novel: **FEMA's consumer audience, Encircle's documentation rigor (in the consumer market Encircle abandoned), Red Cross's safety features, all anchored in Alberta's specific aid ecosystem**. No existing app does this for Canadian disaster survivors.

---

# Future Scalability Ideas
- Extend from Alberta to British Columbia (wildfire-heavy), then Saskatchewan and Manitoba
- Eventually Canada-wide coverage with province-specific aid pathway modules
- Recovery analytics dashboards for municipalities
- Resource allocation prediction at the regional level
- Active-disaster misinformation detection
- Infrastructure recovery tracking
- API for emergency services / NGOs / Red Cross to plug in
- Partnership opportunities with Canadian Red Cross, Indigenous Services Canada, AEMA