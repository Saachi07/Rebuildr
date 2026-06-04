
# Rebuildr — 3-Week MVP Roadmap (5 People)

## Team Roles

| Who | Focus |
|---|---|
| Person A | Backend API, Supabase, database |
| Person B | Frontend (React/Next.js), UI integration |
| Person C | Image classification pipeline (Phase I models) |
| Person D | Document processing + LLM tasks (Phase II/III) |
| Person E | Data collection, UI/UX design, demo prep, testing |

---

## What We're Building (MVP Scope)

A web app where a user can:

1. **Create a recovery case** after a disaster (name, disaster type, location, insurance info)
2. **Upload pre-disaster photos** → AI identifies items + estimates value → builds a home inventory
3. **Upload post-disaster photos** → AI identifies damage → generates a loss summary
4. **Upload insurance/aid documents** → AI simplifies the text and flags key deadlines
5. **Answer 5–6 intake questions** → get a personalized recovery to-do list routed to the right Alberta programs
6. **View everything** in a clean dashboard with a progress tracker

That's it. That's the MVP. Everything else is cut or deferred.

---

## What's CUT (Not in MVP)

These are all real features from instructions.md that we are **explicitly not building** in these 3 weeks. Don't spend time on them:

| Feature | Why it's cut |
|---|---|
| Offline mode / offline-first architecture | Adds massive complexity, needs service workers, IndexedDB — not needed for a demo |
| Floor plan generation from video | Research-grade problem (DUSt3R, etc.) — weeks of work alone |
| 360° photo capture | Hardware dependency, no clear model pipeline |
| Real-time multi-device sync | WebSocket infrastructure, conflict resolution — overkill for MVP |
| "I'm Safe" check-ins / family status | Requires notification infrastructure, contact management, real-time systems |
| Shelter/hospital locator | Needs live data feeds from AHS, Red Cross — API integrations we don't have |
| Alert Ready / Alberta Emergency Alert integration | Government API access is non-trivial and possibly gated |
| Speech-to-text video narration | Cool but not core — Whisper integration can wait |
| Multi-language / Indigenous language support | Important long-term, but translation pipelines are a separate project |
| Scam detection model (Task 2) | Fine-tuning a classifier needs labeled data we don't have yet |
| Receipt OCR | Nice-to-have, not blocking the demo |
| Photo annotation / markup tools | UI feature, not core AI value |
| Geo-tagging / timestamping | Metadata handling — add later |
| Time-series forecasting (shelter shortages, etc.) | No training data, speculative feature |
| Geospatial clustering / damage severity maps | Needs geospatial data we don't have |
| Contractor overload prediction | Already scoped out in instructions.md |
| Claim collaboration mode (adjuster + policyholder) | Multi-user auth, roles, permissions — too complex |
| Carrier-specific report formats | Polish feature, not MVP |
| Xactimate integration | B2B tool, not relevant yet |
| Recovery decision optimization (MDPs) | Aspirational / academic |
| Approach A specialist pipeline (YOLO + lookup) | We're going Approach B (Gemini Flash) only for MVP speed |
| Local Ollama fallback | Production concern, not demo concern |

**The rule: if it doesn't directly serve the demo flow (upload photos → see inventory → upload docs → get plan), it's cut.**

---

## What to Research (Before/During Week 1)

### Person C (Image Pipeline)
- [ ] **Gemini 2.0 Flash API** — sign up, get free API key, test with room photos. Verify the free tier limits (≈15 req/min, ≈1M tokens/day). Test the reference JSON prompt from instructions.md with 5–10 real room photos.
- [ ] **Instructor library** (Python) — test schema enforcement with Pydantic to prevent JSON drift from Gemini.
- [ ] **Canadian retail price ranges** — what's a reasonable lookup table look like? Check Canadian Tire, IKEA Canada, Best Buy Canada for ballpark ranges per furniture/appliance category. This becomes the "clamp" for hallucinated prices.
- [ ] **Pre/post disaster photo comparison** — simplest approach: CLIP embeddings of matched rooms, cosine similarity to detect changes. NOT full segmentation. Research whether Gemini can do "compare these two images and list what's damaged" in one call (likely yes).

### Person D (Documents + LLM)
- [ ] **Alberta DRP application forms** — find the actual forms online (alberta.ca). What does the application look like? What fields matter?
- [ ] **IBC claim standards** — what format do Canadian insurance claims follow? Find sample documents.
- [ ] **Gemini Flash for text tasks** — test document simplification. Feed it a sample insurance policy paragraph → get simplified output. Test to-do list generation from a legal document.
- [ ] **PyMuPDF / pdfplumber** — test PDF text extraction on real insurance documents (find samples online or create mock ones).
- [ ] **Recovery plan combinations** — draft the ~20–25 plan matrix from instructions.md. What questions map to what programs? This is a decision tree, not a model.

### Person E (Data + UI)
- [ ] **Sample room photos** — collect 20–30 photos of furnished rooms (kitchens, bedrooms, living rooms, bathrooms). Use royalty-free sources (Unsplash, Pexels) or photograph your own spaces.
- [ ] **Sample "post-disaster" photos** — harder to find ethically. Look for Creative Commons disaster damage photos. Or: take the pre-disaster photos and describe hypothetical damage for the AI to work with.
- [ ] **Mock insurance documents** — create 3–4 fake but realistic insurance policy excerpts and claim forms for testing Phase II.
- [ ] **UI/UX wireframes** — sketch the 5 key screens (see below). Use Figma, paper, or whatever is fast. Don't over-design — functional beats pretty.
- [ ] **Alberta recovery program info** — compile a reference sheet: Alberta DRP eligibility, Indigenous Services Canada pathways, IBC basics. This becomes the content behind the personalized plans.

### 5 Key Screens to Wireframe
1. **Dashboard** — list of user's recovery cases with status
2. **New Case** — form: case name, disaster type, location, date, insurance info
3. **Home Inventory** — photo upload area + AI-generated item list with editable values
4. **Document Center** — upload PDFs/images of insurance docs, see simplified summaries
5. **Recovery Plan** — intake questionnaire → personalized to-do checklist with progress bar

---

## Alternatives to Explore

If something isn't working, here are fallback options:

| If this fails... | Try this instead |
|---|---|
| Gemini 2.0 Flash free tier hits rate limits | Groq free tier (Llama 4 Scout multimodal) or OpenRouter free endpoints |
| Gemini can't reliably compare pre/post photos | Skip comparison for MVP — just do separate inventories and manually diff |
| PDF text extraction is messy | Have users paste text directly instead of uploading PDFs |
| Supabase is flaky (Saachi's migration issues) | SQLite local database for demo, skip cloud entirely |
| React frontend is too slow to build | Use plain HTML + Tailwind + Alpine.js — faster for prototyping |
| Personalized plan logic is too complex | Reduce from 25 combinations to 5 hardcoded plans (urban/rural × insured/uninsured × dependents yes/no) |
| Price estimation is wildly inaccurate | Show "category range" instead of specific prices (e.g., "Couch: $500–$3,000 CAD") and let user override |

---

# WEEK 1: Foundation + First AI Integration

**Goal by end of Week 1:** Backend API is functional. Frontend has basic screens. Gemini Flash is identifying objects in photos and returning JSON. Document extraction works on sample PDFs.

## Person A (Backend)

**Days 1–2: Finish the recovery cases CRUD**
- Complete Tasks 5–10 from the backend progress doc (repository layer, service layer, routes, tests)
- The schema is already written. The app factory exists. Just wire up the remaining layers.
- Endpoints needed:
  - `POST /cases` — create a case
  - `GET /cases` — list all cases
  - `GET /cases/<id>` — get one case
  - `PATCH /cases/<id>` — update a case
  - `DELETE /cases/<id>` — archive (soft delete)

**Days 3–4: Add inventory endpoints**
- New table: `inventory_items` (case_id FK, item_name, category, condition, price_low, price_high, room_type, source_image_url, created_at)
- `POST /cases/<id>/inventory` — bulk insert items (from AI output)
- `GET /cases/<id>/inventory` — list items for a case
- `PATCH /inventory/<item_id>` — user edits an item (adjust price, name, etc.)
- `DELETE /inventory/<item_id>` — remove an item

**Day 5: Image upload + storage**
- Supabase Storage bucket for photos
- `POST /cases/<id>/photos` — upload photo, store in Supabase, return URL
- `GET /cases/<id>/photos` — list photos for a case
- Wire up: photo upload → call ML endpoint → save returned items to inventory

## Person B (Frontend)

**Days 1–2: Project setup + Dashboard + Case creation**
- Initialize React (or Next.js) project with Tailwind CSS
- Dashboard page: list cases from `GET /cases`, show status badges
- New Case form: all fields from the schema (case_name, disaster_type, location, incident_date, insurance fields)
- Connect to backend API

**Days 3–5: Home Inventory page**
- Photo upload component (drag-and-drop or file picker)
- Display uploaded photos in a grid
- "Analyze" button → sends photo to backend → backend calls ML → returns item list
- Editable inventory table: item name, category, count, condition, price range
- User can edit any field, add items manually, delete items
- Running total of estimated value at the bottom

## Person C (Image Pipeline)

**Days 1–2: Gemini Flash integration**
- Set up Gemini API access (Google AI Studio, free tier)
- Write a Python function: `analyze_room_photo(image_bytes) → structured JSON`
- Use the reference prompt from instructions.md (room_type, items with name/category/count/condition/brand/price_range)
- Add Instructor + Pydantic for schema enforcement
- Test on 10+ sample room photos, document accuracy

**Days 3–4: Price clamping + Canadian price table**
- Build the lookup table JSON: ~40–50 common household item categories with CAD price ranges
- Post-process Gemini output: clamp prices to table ranges, flag outliers
- Handle edge cases: items Gemini misidentifies, items with no price data

**Day 5: Create a Flask endpoint for the image pipeline**
- `POST /ml/analyze-photo` — accepts image, returns structured inventory JSON
- This is what Person A's photo upload endpoint will call
- Deploy locally, test end-to-end with frontend

## Person D (Documents + LLM)

**Days 1–3: Document text extraction pipeline**
- Build extraction function: PDF → text using PyMuPDF (for native PDFs) and PaddleOCR (for scanned docs)
- Test on 3–4 sample insurance documents
- Build simplification function: extracted text → Gemini Flash → simplified plain-English summary
- Prompt engineering: "Simplify this insurance document for someone who has just lost their home in a disaster. Highlight key deadlines, coverage limits, and required actions."

**Days 4–5: Recovery plan decision tree**
- Define the intake questions (from Phase III):
  1. What type of disaster? (fire/flood/storm/other)
  2. Location? (urban / rural / remote / on-reserve)
  3. Dependents? (kids / elderly / pets / mobility needs)
  4. Residency status? (Canadian citizen / Indigenous / immigrant)
  5. Do you have insurance? (yes / no / unsure)
  6. Housing status? (homeowner / renter)
- Map answers to recovery plans (start with 8–10 combinations, not 25)
- Each plan = a list of to-do items with links to the right Alberta programs
- Output: JSON structure that the frontend can render as a checklist

## Person E (Data + UI + Testing)

**Days 1–2: Data collection**
- Gather 30 room photos (varied rooms, quality levels)
- Create 4 mock insurance documents (PDFs)
- Compile Alberta recovery program reference sheet

**Days 3–4: UI wireframes → basic CSS**
- Finalize wireframes for 5 screens
- Pick a color scheme, create basic component styles
- Help Person B with Tailwind config and component styling

**Day 5: Testing + bug reporting**
- Test every endpoint Person A built (use Postman or similar)
- Test Person C's photo analysis with all 30 sample photos
- Document what works, what breaks, accuracy issues
- Create a shared bug/issue tracker (GitHub Issues)

---

# WEEK 2: Integration + Phase II/III + Polish

**Goal by end of Week 2:** All three phases work end-to-end in the app. User can go from creating a case → uploading photos → seeing inventory → uploading documents → getting simplified summaries → answering intake questions → seeing a personalized recovery plan.

## Person A (Backend)

**Days 1–2: Document endpoints**
- New table: `case_documents` (case_id FK, filename, storage_url, original_text, simplified_text, key_deadlines JSON, created_at)
- `POST /cases/<id>/documents` — upload doc, extract text (call Person D's pipeline), store results
- `GET /cases/<id>/documents` — list docs with summaries

**Days 3–4: Recovery plan endpoints**
- `POST /cases/<id>/intake` — accept intake answers, run through decision tree, return plan
- `GET /cases/<id>/plan` — get the generated plan
- `PATCH /cases/<id>/plan/tasks/<task_id>` — mark a task as complete (for progress tracking)
- Store plan as JSON in a `recovery_plans` table

**Day 5: Loss summary endpoint**
- `POST /cases/<id>/loss-report` — aggregate inventory items, calculate total estimated loss range, generate a summary
- `GET /cases/<id>/loss-report` — return the report (later: PDF export)
- Wire up pre/post photo comparison if  Person C has it ready, otherwise just aggregate the inventory

## Person B (Frontend)

**Days 1–2: Document Center page**
- Upload component for PDFs/images
- Display: original document (or preview) alongside simplified summary
- Highlight extracted deadlines and action items
- Connect to backend document endpoints

**Days 3–4: Recovery Plan page**
- Intake questionnaire (6 questions, one at a time or all on one page)
- Submit → display personalized to-do list
- Each task: checkbox, description, link to relevant program/resource
- Progress bar at the top (% of tasks completed)

**Day 5: Dashboard refinement + navigation**
- Case detail page pulling together all sections (inventory, documents, plan)
- Navigation between sections
- Status indicators on dashboard
- Basic responsive design (mobile-friendly)

## Person C (Image Pipeline)

**Days 1–3: Post-disaster photo analysis + comparison**
- Adapt the Gemini prompt for post-disaster photos: "Identify damaged items, severity of damage, items that appear destroyed vs. salvageable"
- If Gemini handles two-image comparison well: build a `compare_photos(pre_image, post_image) → damage_report` function
- If not: generate separate inventories and diff them programmatically (items present pre but missing/damaged post = losses)
- Output: structured JSON with item, pre-condition, post-condition, estimated loss

**Days 4–5: Reliability + edge cases**
- Test with poor lighting, cluttered rooms, unusual angles
- Add retry logic for Gemini failures
- Handle: "no items detected", blurry photos, non-room photos
- Improve price accuracy based on Person E's testing feedback from Week 1
- Document model limitations honestly

## Person D (Documents + LLM)

**Days 1–2: Improve document pipeline**
- Handle multi-page documents
- Extract structured data: deadlines, coverage amounts, policy numbers, contact info
- Format output as actionable items, not just summaries
- Test with Person E's mock documents + any real samples found

**Days 3–4: To-do list generation (Task 3)**
- Build the LLM prompt: given user's intake answers + extracted document info → generate a personalized, prioritized to-do list
- Each to-do item should include: what to do, why, deadline (if any), link/resource
- Merge rule-based plan (from the decision tree) with LLM-generated tasks from documents
- Validate output structure with Pydantic

**Day 5: Integrate into backend**
- Make sure  Person D's pipelines are callable from  Person A's endpoints
- End-to-end test: upload a real-ish insurance PDF → see simplified summary + tasks appear in the recovery plan
- Fix integration bugs

## Person E (Data + UI + Testing)

**Days 1–2: Demo scenario creation**
- Build "Sarah's story" from instructions.md as a complete test scenario:
  - 6 pre-disaster room photos (kitchen, living room, 2 bedrooms, bathroom, garage)
  - 3 post-disaster photos (showing damage)
  - 1 mock insurance policy PDF
  - 1 mock Alberta DRP application form
  - Intake answers for Sarah (rural Alberta, homeowner, Canadian citizen, no dependents)
- This becomes THE demo walkthrough

**Days 3–4: UI polish + UX improvements**
- Work with Person B on visual polish: loading states, error messages, empty states
- Write copy for the intake questions (clear, empathetic language)
- Write recovery plan task descriptions (actionable, linked to real Alberta resources)
- Test the full flow as a user — document friction points

**Day 5: Accuracy audit**
- Run all 30 sample photos through the pipeline, record:
  - Items correctly identified (%)
  - Items missed (%)
  - Price estimates vs. real retail (% within range)
  - False positives
- Run all mock documents through simplification, check for:
  - Key info preserved
  - Deadlines correctly extracted
  - Language actually simplified
- Create an accuracy summary for the demo

---

# WEEK 3: Demo Polish + Loss Report + Presentation

**Goal by end of Week 3:** A polished, demonstrable MVP. Someone can watch a 5-minute demo and understand exactly what Rebuildr does and why it matters. All rough edges smoothed for the happy path.

## Person A

**Days 1–2: Loss report generation**
- Combine pre/post inventory data into a structured loss report
- Include: item-by-item comparison, total estimated loss range, photo evidence references
- Add PDF export endpoint (use a simple library like `fpdf2` or `weasyprint`)
- The generated PDF should look like something you'd actually submit to an insurance company

**Days 3–4: Bug fixes + stability**
- Fix every bug from Person E's testing
- Add input validation everywhere (don't let bad data crash the API)
- Add proper error messages (user-friendly, not stack traces)
- Performance: make sure photo analysis doesn't timeout (add async processing or loading indicators)

**Day 5: Deploy**
- Deploy backend to a free tier (Render, Railway, or Fly.io)
- Make sure Supabase is configured for the deployed version
- Test all endpoints from the deployed URL
- If deployment is painful: have a clean local setup script so the demo runs from a laptop reliably

## Person B

**Days 1–2: Loss report page + PDF download**
- Display the loss report: side-by-side pre/post photos, item table with damage status, total loss estimate
- "Download PDF" button
- This is the money shot of the demo — make it look good

**Days 3–4: Demo flow polish**
- Smooth out the entire Sarah scenario flow
- Loading animations while AI processes photos (this takes a few seconds — make it feel intentional, not broken)
- Success/error toast notifications
- Empty states ("No items yet — upload a photo to get started")
- Mobile responsiveness check

**Day 5: Deploy frontend + final testing**
- Deploy to Vercel or Netlify
- Connect to deployed backend
- Run through Sarah's story 3 times end-to-end
- Fix any last visual bugs

## Person C

**Days 1–2: Final accuracy improvements**
- Tune prompts based on Week 2 accuracy audit
- Add category-specific prompt variations if certain room types perform poorly
- Ensure the price lookup table covers everything Sarah's story needs
- Final edge case handling

**Days 3–5: Support demo prep + documentation**
- Help Person E prepare before/after photo pairs that showcase the AI well (cherry-pick good examples)
- Write a short "how the AI works" explanation for the demo presentation
- Document the pipeline: what model, what prompt, what post-processing, known limitations
- Be available for bug fixes

## Person D

**Days 1–2: Final pipeline tuning**
- Improve document simplification quality based on Week 2 feedback
- Make sure the recovery plan feels genuinely personalized (not just a generic checklist)
- Add 2–3 more plan variations if time allows

**Days 3–5: Support demo prep + documentation**
- Help Person E create compelling mock documents for the demo
- Write "how document processing works" explanation
- Document the pipeline and limitations
- Be available for integration bug fixes

## Person E

**Days 1–2: Demo script + presentation**
- Write a 5-minute demo script based on Sarah's story
- Create presentation slides (problem → solution → demo → impact → future)
- Include accuracy numbers from the Week 2 audit
- Include the "AI for Good" angle — who this helps, why it matters

**Days 3–4: Final testing + demo rehearsal**
- Full end-to-end testing of deployed app
- Rehearse the demo with the team at least twice
- Identify and fix any demo-breaking bugs
- Prepare fallback plans (screenshots, pre-recorded video) in case live demo fails

**Day 5: Final polish**
- README update with setup instructions, architecture overview, team credits
- Clean up the GitHub repo (remove dead code, organize branches)
- Final demo rehearsal
- Celebrate — you built a thing

---

## Data Sources to Find

| What | Where to Look | Who |
|---|---|---|
| Room photos (furnished interiors) | Unsplash, Pexels, or photograph your own homes | Person E |
| Post-disaster damage photos | Creative Commons on Flickr, FEMA media library (public domain), news archives | Person E |
| Alberta DRP application form | alberta.ca/disaster-recovery-programs | Person D + Person E |
| Sample insurance policy (Canadian) | IBC website, or create realistic mock | Person D + Person E |
| Canadian retail prices by category | IKEA.ca, CanadianTire.ca, BestBuy.ca, Wayfair.ca — build a spreadsheet | Person C + Person E |
| Alberta Emergency Alert info | emergencyalert.alberta.ca |Person E (reference only, no integration) |
| Indigenous Services Canada disaster aid info | sac-isc.gc.ca |Person E (for plan content) |
| 211 Alberta resource info | ab.211.ca |Person E (for plan content) |

---

## Key Risk Areas

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gemini free tier rate-limited during demo | Low | Cache demo results; have pre-computed outputs ready as backup |
| Supabase migration issues (Saachi's known problem) | Medium | Have a SQLite fallback ready; or spin up a fresh Supabase project for MVP only |
| Photo analysis accuracy too low for demo | Medium | Cherry-pick good demo photos; be honest about limitations in presentation |
| Team members blocked waiting on each other | High | ML team exposes Flask endpoints early (even with mock data); frontend uses mock API until backend is ready |
| Scope creep ("but what about offline mode...") | High | Point at this document. If it's in the CUT list, it's cut. |

---

## Daily Standup Questions

Every day, each person answers 3 things (Slack, Discord, or 5-min call):
1. What did I finish yesterday?
2. What am I working on today?
3. Am I blocked on anything?

If you're blocked, tag the person who can unblock you. Don't wait.

---

## Definition of Done (MVP)

The MVP is "done" when someone who has never seen the project can:

1. Open the app in a browser
2. Create a new recovery case for a fictional wildfire in rural Alberta
3. Upload 3 room photos and see AI-generated inventory with prices
4. Upload a mock insurance policy and read a simplified summary
5. Answer 6 intake questions and receive a personalized recovery plan
6. See a progress bar update as they check off tasks
7. View an estimated total loss number

If all 7 work without crashing, you have an MVP. Everything else is bonus.
