# rebuildr — AI-Powered Disaster Recovery Assistant

## Project Overview
rebuildr is an AI-powered disaster readiness and post-disaster recovery platform for **Alberta and the rest of Canada**, helping disaster-affected communities navigate insurance claims, recovery processes, and fragmented support systems.

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

*Capture experience inspired by Encircle's verified field documentation workflow, retargeted at the consumer pre-loss market Encircle explicitly walked away from.*

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

## Task 1 — Identifying objects in images & estimating price

Two parallel approaches; build either as primary, keep the other as fallback.

### Approach A — Specialist pipeline (YOLO + lookup, local-first)
- **Identification:** Input → **YOLOv8m** *or* **EfficientNet-B0** *or* **Bingsu/vit-base-patch16-224-furniture** (pre-trained furniture ViT) → category label
- **Price:** category label → **curated Canadian retail price lookup table (CAD)** → user-adjustable default → optional **receipt OCR (PaddleOCR)** for exact purchase price
- *Note:* an earlier plan to use a "Furniture-price-prediction-by-regression" repo was scrapped — that turned out to be a 2,000-row African-market tabular dataset with a starter linear-regression script, not a pre-trained vision model.
- **Strengths:** deterministic, offline-friendly, no hallucination, easy to debug
- **Weaknesses:** more components to stitch together; quality capped by lookup table coverage

### Approach B — Multimodal LLM wrapper (single-call pipeline)
- **Single call:** Image + structured JSON prompt → response containing `room_type`, `items[]` (name, count, category, condition, visible brand, CAD price range), `notes`
- **Cloud (demo):** **Gemini 2.0 Flash** free tier (~15 req/min, ~1M tokens/day)
- **Local (production / offline):** **Ollama + Llama 3.2 Vision 11B** or **Qwen2-VL**
- Replaces YOLO + classifier + lookup table + description model in one call
- **Strengths:** one call does everything; quality often higher because the LLM combines visual recognition with world knowledge (knows a Herman Miller chair is expensive even in a dim photo)
- **Weaknesses:** occasional JSON drift (use Instructor/Outlines), price hallucination (clamp + user override), cloud variant needs internet
- See *Multimodal LLM Wrapping* section below for full options and the reference prompt

### Receipt OCR (used by both approaches)
**PaddleOCR** or **TrOCR** extracts exact purchase price, date, and merchant from attached receipts — beats any estimation and matches what insurance adjusters prefer. This is the highest-accuracy path for items where the user has receipts.

### Build recommendation
Build **Approach B with Gemini Flash** for the recorded demo (fastest end-to-end Phase I). Keep **Approach A with local YOLO + lookup** as the offline fallback, production path, and sanity check on Approach B's outputs. Apply receipt OCR on top of either approach for items with receipts attached.

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

The project constraint is **no paid APIs** — free-tier cloud services (Google Cloud Vision, Azure Computer Vision, HuggingFace Inference API, etc.) and locally-running pre-trained models are both fair game. Where Encircle uses paid foundation LLMs (OpenAI, Anthropic, Google), rebuildr substitutes free-tier or local equivalents — but the layered architecture pattern still applies.

---

# Pre-Trained Models — Available Building Blocks

The project constraint is **no paid APIs**. That leaves two options on the table:
1. **Free-tier cloud APIs** (Google Cloud Vision, Azure Computer Vision, HuggingFace Inference, etc.) — save development time, but watch quota limits and verify the free tier covers MVP usage
2. **Pre-trained models running locally** — full control, offline-capable, no quota concerns; most are on HuggingFace, downloadable once, and run on consumer-grade hardware (smaller variants run on a laptop or even a phone)

For the MVP demo, **mixing both is reasonable** — use free cloud APIs where they accelerate development, swap to local for production / scale / privacy concerns (especially since rebuildr's pitch includes offline-first capture and handling household photos of vulnerable populations).

*Note: this catalog reflects training-data knowledge of the model ecosystem; verify latest variants, free-tier limits, and licenses before committing. Newer versions likely exist for several of these families.*

## Free-Tier Cloud APIs (no payment required for demo-scale usage)

These have free tiers that typically cover demo / hackathon / small-scale MVP usage without payment. Quotas vary and change; verify current limits at build time.

| API | Capabilities | Free Tier (approximate) |
|---|---|---|
| **Google Cloud Vision API** | Label detection, object localization, OCR, logo/landmark detection, text recognition | ~1,000 requests/month free |
| **Azure Computer Vision** | Image analysis, OCR (Read API), object detection, image tagging | ~5,000 transactions/month free |
| **AWS Rekognition** | Object/scene detection, OCR (DetectText), face detection | 5,000 images/month free (first 12 months) |
| **HuggingFace Inference API** | Run thousands of HF models via hosted API (vision, NLP, audio) | Rate-limited free tier |
| **Roboflow Universe** | Community-trained object detection models for specific domains | Free model hosting + inference |
| **Replicate** | Run open-source models (Llama, SAM, Whisper, etc.) via API | Some free credits, then per-second pricing |
| **Together AI** | Open-source LLM and vision model hosting | Free credits on signup |

**Trade-offs to weigh:**
- *Offline mode breaks* — every cloud call needs internet. Conflicts with rebuildr's post-disaster offline-first design.
- *Privacy* — sending household photos (potentially including kids, valuables, identifying info) to third-party clouds. Disaster-affected vulnerable populations may not consent.
- *Quota risk* — if usage spikes during an actual disaster event, free tier may not hold.
- *Control* — provider changes / deprecations could break your pipeline.

**Pragmatic call:** use cloud APIs for development speed and demo, build local fallbacks for the path to production.

## Multimodal LLM Wrapping 

A multimodal LLM can do object identification, counting, attribute extraction, and price estimation in **one prompted call** — replacing what would otherwise require YOLO + classifier + lookup table + description model stitched together. This is the "wrap a ChatGPT-like model" pattern and is often the fastest path to a working Phase I demo.

### Free cloud multimodal LLMs (demo path)

| Provider | Model | Free tier (approximate) |
|---|---|---|
| **Google Gemini** | **Gemini 2.0 Flash** *(recommended)* | ~15 req/min, ~1M tokens/day |
| Google Gemini | Gemini 1.5 Flash | similar, slightly older |
| **Groq** | Llama 4 Scout / Maverick (multimodal) | free tier, very fast |
| **HuggingFace Inference API** | LLaVA / Qwen2-VL / etc. | rate-limited free |
| **Cloudflare Workers AI** | LLaVA | free tier |
| **OpenRouter** | Several free multimodal endpoints (Llama 4 variants, etc.) | varies by model |

Vision quality on Gemini 2.0 Flash is comparable to GPT-4o for inventory-style tasks; integration is a single API call.

### Local multimodal LLMs (production / offline path)

| Tool | Model | Hardware needed |
|---|---|---|
| **Ollama** | **Llama 3.2 Vision 11B** *(recommended for production)* | ~12–16 GB RAM |
| Ollama | Llama 3.2 Vision 90B | high-end GPU |
| Ollama | Qwen2-VL — often better at structured JSON output | ~8–16 GB RAM |
| HF Transformers | LLaVA-1.5 / LLaVA-Next | varies |
| HF Transformers | **Moondream2** (1.8B) — runs on basic laptops | minimal |

Ollama setup is `ollama pull llama3.2-vision` then send images via its local API. This is the realistic offline path for disaster zones with no connectivity.

### Reference prompt pattern (Task 1)

```
Analyze this room photo. Return ONLY valid JSON:
{
  "room_type": "kitchen | bedroom | living_room | bathroom | other",
  "items": [
    {
      "name": "...",
      "category": "furniture | appliance | electronics | decor | clothing | other",
      "count": <integer>,
      "condition": "new | good | fair | worn | damaged",
      "visible_brand": "..." or null,
      "approximate_size": "small | medium | large",
      "canadian_retail_estimate_cad": {"low": <int>, "high": <int>}
    }
  ],
  "notes": "any visible damage, layout observations, or quality cues"
}
```

### Reliability tooling
- **Instructor** (Python) — forces valid JSON schema compliance, auto-retries on drift
- **Outlines** — alternative schema enforcement library
- **Pydantic** — validate parsed response structure

### Risks and mitigations
- *JSON drift:* schema enforcement libraries above; or a retry-on-parse-fail loop
- *Price hallucination:* clamp output to sane ranges (same lookup table as Approach A), let user override
- *Cloud offline-break:* swap to Ollama local for production / disaster zones
- *Quota limits:* Gemini's free tier handles tens of thousands of demo-scale calls; only an issue at real production scale

### Where this pattern fits in rebuildr
- **Phase I Task 1** (image → inventory + value) — primary application; one call replaces 4 specialist components
- **Phase II Task 3** (legal docs + user context → personalized to-do) — same pattern, text-only or multimodal LLM
- **Phase II scam detection** — combine with pre-trained phishing classifier for layered confidence
- **Document understanding** — multimodal LLM can read forms directly, replacing Donut/LayoutLM for many use cases

## Phase I — Image & Visual Tasks

### Object Detection (whole-room photos)
- **YOLOv8** (Ultralytics) — Variants: n, s, m, l, x. AGPL-3.0 (commercial use needs Ultralytics license).
- **YOLOv9 / YOLOv11** — newer in the same family
- **YOLO-World** — open-vocabulary detection (detect arbitrary classes via text prompt — useful for "find the dishwasher" without fine-tuning)
- **DETR / Deformable DETR** (Meta) — transformer-based end-to-end detector
- **Detectron2** (Meta) — Faster R-CNN, Mask R-CNN, RetinaNet

### Image Classification
- **EfficientNet-B0 → B7** — alternative
- **ResNet-50 / -101** — classic baselines
- **Vision Transformer (ViT)** — base, large
- **ConvNeXt-V2** — modern CNN
- **MobileNetV3** — best for on-device

### Single-Photo Item Identification (Encircle AI Item Descriptions pattern)
This is the key Encircle-inspired pattern — one photo → description + brand + model. Requires multimodal vision-language models:
- **CLIP** (OpenAI, open weights) — zero-shot classification via text prompts; great for "is this a couch / fridge / TV?"
- **BLIP-2** (Salesforce) — image captioning and visual question answering
- **LLaVA-1.5 / LLaVA-Next** — open multimodal LLM; describes images and answers questions about them
- **Moondream2** — very small (~1.8B params) multimodal model; runs on modest hardware
- **Qwen-VL / Qwen2-VL** (Alibaba) — open weights, multilingual
- **Florence-2** (Microsoft) — vision foundation model; detection, captioning, VQA in one
- **InstructBLIP**, **IDEFICS** (HuggingFace)

### Price Estimation / Item Valuation (Task 1 — money value estimation)

**Reality check from verified research:** there is no good off-the-shelf pre-trained model that goes from a single household-item photo to an accurate retail price. Price depends on brand, material, and current market — none reliably extractable from a generic image. The earlier candidate `Furniture-price-prediction-by-regression` turned out to be a 2,000-row Jumia (African e-commerce) tabular dataset with a starter linear regression script, **not** a pre-trained vision model. Unusable for Canadian household pricing.

**Practical no-training approach** — split Task 1 in two:

**Step 1 — Identification (fully pre-trained, zero or near-zero training):**
- **YOLOv8 (COCO weights)** — detects ~80 common objects including chair, couch, bed, dining table, TV, laptop, microwave, oven, toaster, sink, refrigerator. No training. 
- **CLIP** (OpenAI, open weights) — zero-shot classification by text prompt. Define your category list, embed item photos, classify by text similarity. No training.
- **Bingsu/vit-base-patch16-224-furniture** (HuggingFace) — pre-trained ViT classifier specifically for furniture taxonomy. Plug-and-play.
- **YOLO-World** — open-vocabulary detection with arbitrary text prompts. No training.
- **LLaVA-1.5 / Moondream2** — multimodal LLMs that describe items in natural language (item type, material, approximate quality). No training, just prompt.

**Step 2 — Valuation (no pre-trained model exists for this; use simpler approaches):**
- **Option A — Curated category-level price ranges** *(recommended for MVP).* A small JSON lookup table: `{"couch": [500, 3000], "fridge": [1000, 3000], "tv_55in": [600, 2000], ...}` with Canadian retail medians (CAD). Fast, transparent, no model, easy to maintain.
- **Option B — CLIP-based nearest-neighbor lookup.** Pre-embed a few hundred labeled Canadian retail listings. At inference: embed the user's photo, find closest reference items, average prices. No model training; just embedding + KNN.
- **Option C — Live web lookup at runtime.** Query a product search (free-tier API or scraping Amazon.ca / Best Buy / IKEA Canada) for similar items, return median price. Always current, but needs internet.
- **Option D — User-adjustable defaults.** Pre-fill a sensible default per category (from Option A), let user override. Most defensible for a demo since the user owns the final number.

**Recommended for rebuildr MVP:** **Option A + Option D combined** — pre-fill defaults from a curated table, user adjusts per item, optionally attach a receipt for exact price (Step 3 below). Zero training, deterministic, transparent.

**Step 3 — Receipt OCR for ground truth (where available):**
This is the Encircle pattern and the highest-accuracy path. If the user attached a purchase receipt to the inventory item, **PaddleOCR** or **TrOCR** extracts the actual purchase price, date, and merchant — which beats any estimation. Insurance adjusters prefer receipts; this aligns rebuildr's output with what claims processors actually want.

**Honest framing for the demo:** any single-image "AI price estimate" is a rough range. The pitch shouldn't be *"AI predicts your couch is worth $1,847"* — it should be *"AI identifies the couch, suggests a Canadian retail range, you confirm or adjust, and we attach receipts where you have them."* That's accurate, claim-defensible, and doesn't oversell.

### Image Segmentation (damage masks, photo annotations)
- **SAM / SAM-2** (Meta, Segment Anything) — segment anything in an image
- **Mask R-CNN** — instance segmentation
- **DeepLabV3+** — semantic segmentation

### Floor Plan Generation (smartphone-video walkthrough)
- **DUSt3R** — geometric 3D reconstruction from images
- **CubiCasa5K-based** research models for floor plans
- For on-device capture: native **ARKit (iOS)** / **ARCore (Android)** APIs (platform capability, not a model per se)

### OCR (Receipts, Document Images)
- **Tesseract** — classic open-source baseline
- **PaddleOCR** (Baidu) — high accuracy, multilingual, free
- **EasyOCR** — Python-friendly
- **TrOCR** (Microsoft) — transformer-based
- **Donut** (Naver) — OCR-free document understanding (reads documents directly)
- **LayoutLMv3** — text + layout for receipts/forms

### Pre- / Post-Disaster Damage Comparison
- **xView2 / xBD-trained models** — public building damage assessment models (satellite imagery)
- For consumer phone photos: image similarity via embeddings (CLIP image embeddings, Siamese networks)

## Phase II — Document & Text Tasks

### Document Text Extraction
- **PyMuPDF / pdfplumber** for native PDF text
- **Tesseract / PaddleOCR** for scanned documents
- **LayoutLMv3** for forms with structured layout

### Document Understanding
- **LayoutLM v1 / v2 / v3** — text + layout
- **Donut** — visual document understanding without OCR

### Text Simplification & Generation (local LLMs)
- **Llama 3.1 / 3.2 / 3.3** (Meta) — 1B, 3B, 8B, 70B variants. **Llama 3.2 1B/3B run on phones.**
- **Mistral 7B / Mistral Nemo (12B) / Mistral Small** — Apache 2.0
- **Phi-3 / Phi-3.5 / Phi-4** (Microsoft) — small but capable; **Phi-3.5-mini is a strong laptop default**
- **Qwen 2.5** (Alibaba) — 0.5B to 72B; strong multilingual including French
- **Gemma 2** (Google) — 2B, 9B, 27B
- **TinyLlama (1.1B)** — runs anywhere
- For pure simplification (not full chat): **T5 / FLAN-T5 / BART** are smaller and task-specific

### Text Classification (Scam Detection — Task 2)
- **DistilBERT** — fast, small, accurate (recommended default)
- **BERT / RoBERTa** — classic baselines
- **DeBERTa-v3** — stronger but heavier
- Fine-tune any of these on a labeled scam/legitimate corpus

### Named Entity Recognition (date extraction, agency names, deadlines)
- **spaCy** (`en_core_web_sm / md / lg / trf`) — production-ready
- **Flair NER**
- **BERT-NER** variants on HuggingFace

### Embeddings for RAG / Retrieval (chatbot, document Q&A)
- **sentence-transformers**: `all-MiniLM-L6-v2`, `all-mpnet-base-v2`
- **BGE** (BAAI): `bge-small-en`, `bge-base-en`, `bge-large-en`
- **E5** (Microsoft): `e5-small`, `e5-base`, `e5-large`, **`multilingual-e5`** for French
- **ColBERT** for retrieval

## Cross-Cutting Capabilities

### Speech-to-Text (Voice Notes, Video Narration)
- **Whisper** (OpenAI, MIT-licensed open weights) — `tiny / base / small / medium / large-v3`. Multilingual including French.
- **Whisper.cpp / Faster-Whisper** — efficient local inference
- **NeMo** (Nvidia) — alternative ASR toolkit
- **wav2vec 2.0** — older but solid

### Translation (Multi-Language Support)
- **NLLB** (No Language Left Behind, Meta) — 200 languages including some Cree and Inuktitut. *CC-BY-NC license — non-commercial only*
- **M2M-100** (Meta) — 100 languages, MIT-friendly
- **MarianMT** — language-pair-specific models, lightweight
- **mBART** — multilingual generation

*Indigenous Alberta language coverage in mainstream pre-trained models is limited. Cree (nêhiyawêwin), Blackfoot, Stoney Nakoda, and Dene have minimal open NLP support. Real coverage will likely require partnerships with First Nations University, the Indigenous Languages Component (Canadian Heritage), or community-led data efforts — not just plugging in a model.*

### Time-Series Forecasting (Predictive Capabilities — shelter shortages, recovery bottlenecks)
- **Prophet** (Meta) — classical, well-documented (recommended default)
- **NeuralProphet** — neural extension
- **TimesFM** (Google) — foundation model for time series
- **Chronos** (Amazon) — foundation model for time series
- **PatchTST** — transformer-based forecasting

### Geospatial / Clustering
Not pre-trained models in the LLM sense, but standard libraries and resources:
- **scikit-learn** — DBSCAN, k-means, HDBSCAN
- **torchgeo** — pre-trained models on satellite imagery (Sentinel, Landsat)
- **Segment Anything (SAM)** — for satellite/aerial image segmentation
- Wildfire spread modeling: research models like **WildFire-PINNs**, cellular automata simulations

## Licensing Quick Reference

| Family | License | Commercial Use |
|---|---|---|
| YOLOv8 / v11 (Ultralytics) | AGPL-3.0 | Requires paid Ultralytics license |
| EfficientNet, ResNet, ViT (via `timm`) | Apache 2.0 / MIT | Fine |
| CLIP | MIT | Fine |
| BLIP-2 | BSD-3 | Fine |
| LLaVA | Apache 2.0 (model); check base LLM | Check base |
| Moondream2 | Apache 2.0 | Fine |
| Llama 3.x | Custom Llama license | OK for most uses with attribution |
| Mistral | Apache 2.0 | Fine |
| Phi-3 / 3.5 / 4 | MIT | Fine |
| Gemma 2 | Custom Gemma license | OK with terms |
| Qwen 2.5 | Apache 2.0 (most variants) | Fine |
| Whisper | MIT | Fine |
| NLLB | CC-BY-NC | **Non-commercial only** |
| M2M-100, MarianMT | MIT | Fine |
| BERT / DistilBERT / RoBERTa | Apache 2.0 / MIT | Fine |
| Tesseract, PaddleOCR | Apache 2.0 | Fine |
| Donut, LayoutLMv3 | MIT / CC-BY-NC-SA (check variant) | Verify variant |
| SAM / SAM-2 | Apache 2.0 | Fine |

*Pragmatic note: for the academic/demo MVP scope, all of the above are usable. If rebuildr ever moves toward commercial deployment, prioritize Apache 2.0 / MIT / BSD models, swap YOLOv8 → DETR / Detectron2 if Ultralytics licensing is a concern, and swap NLLB → M2M-100 for translation. Licenses change; verify current terms on HuggingFace at integration time.*

## Recommended MVP Default Stack

Two viable architectures for Phase I. **Build both — Approach B as the headline demo path, Approach A as the offline fallback.**

### Architecture choice for Phase I

| | Approach A — Specialist pipeline | Approach B — Multimodal LLM wrapper |
|---|---|---|
| **Strategy** | YOLO + classifier + price lookup, stitched together | One multimodal LLM call does identification + count + description + valuation |
| **Demo speed** | Slower (more glue code) | **Faster** (single API call) |
| **Quality** | Capped by lookup table coverage | **Higher** — LLM uses visual + world knowledge together |
| **Offline** | **Yes** (all local) | Cloud variant breaks offline; local Ollama variant works |
| **Determinism** | **Predictable** | Occasional JSON drift, price hallucination |
| **When to use** | Production / offline / strict reproducibility | Demo, fast iteration, high quality |

### Phase I — Approach A (specialist pipeline, local-first)

| Capability | Primary pick | Free cloud alternative |
|---|---|---|
| Object detection | **YOLOv8m** COCO weights — 80 common household objects out of the box | Google Cloud Vision label/object detection |
| Furniture-specific classification | **Bingsu/vit-base-patch16-224-furniture** — pre-trained ViT | — |
| Zero-shot item classification | **CLIP** — prompt with category list, no training | HuggingFace Inference API (CLIP hosted) |
| Single-photo item description | **Moondream2** or **LLaVA-1.5-7B** | HuggingFace Inference API (BLIP-2 / LLaVA) |
| Price estimation | **Curated CAD lookup table** + user-adjustable + receipt OCR for exact values | Live web search of Amazon.ca / Best Buy (free-tier or scraping) |

### Phase I — Approach B (multimodal LLM wrapper)

| Capability | Cloud (demo) | Local (production / offline) |
|---|---|---|
| All-in-one Phase I (identify + count + describe + value) | **Gemini 2.0 Flash** free tier | **Ollama + Llama 3.2 Vision 11B** or **Qwen2-VL** |
| Lightweight local fallback | — | **Moondream2** (1.8B, runs anywhere) |
| Schema enforcement | **Instructor** + **Pydantic** | Same |
| Receipt OCR (still useful for ground truth) | **PaddleOCR** (or Gemini reads receipts directly) | **PaddleOCR** |

### Shared across both approaches (Phase II, Phase III, cross-cutting)

| Capability | Primary pick | Notes |
|---|---|---|
| Document OCR | **PaddleOCR** | Pre-trained, multilingual, no training |
| Document understanding | **Donut** | Pre-trained, OCR-free |
| Text simplification + Task 3 LLM | **Phi-3.5-mini** *or* **Llama 3.2 3B** (local) / **Gemini 2.0 Flash** (cloud) | Prompt-based, no fine-tuning |
| Scam classification (Task 2) | **ealvaradob/bert-finetuned-phishing** + LLM few-shot prompt | Pre-trained phishing classifier |
| Date / entity extraction | **spaCy** `en_core_web_trf` | Pre-trained NER |
| Embeddings / RAG | **`all-MiniLM-L6-v2`** | Pre-trained |
| Speech-to-text | **Whisper-base** or **Whisper-small** | Pre-trained, multilingual |
| Translation (EN ↔ FR) | **MarianMT** `en-fr` / `fr-en` | Pre-trained pair models |
| Time-series forecasting | **Prophet** | Classical, no neural training |
| Clustering (geospatial) | scikit-learn **HDBSCAN** | Unsupervised |
| Image segmentation | **SAM-2** | Pre-trained, zero-shot |

### Training summary

Of ~17 capabilities across both approaches, **only scam classification might benefit from light fine-tuning** for disaster-specific scams beyond generic phishing — and even that has a no-training fallback (pre-trained phishing model + few-shot LLM prompts). Everything else is download-and-run or prompt-and-go.

### Build sequence

1. **Week 1:** Approach B with Gemini Flash — get end-to-end Phase I working in days, not weeks
2. **Week 2:** Phase II + Phase III layered on top, using Gemini for Task 3 as well
3. **Week 3:** Approach A built in parallel as the offline fallback; swap Gemini → Ollama for the local story; demo polish

This sequence protects the recorded-demo deadline (Approach B ships fast) while still delivering the offline-capable production story (Approach A as backup).

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

**Priority focus**:
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
