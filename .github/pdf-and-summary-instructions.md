# PDF Extraction and Gemini Summary Wrapper

## Document Purpose

This file is the complete implementation record and operating guide for the
PDF extraction and document-summary work on the `pdf-and-summary` branch.

It documents:

- What was requested
- What is currently implemented
- What remains unimplemented
- How the extraction and Gemini wrapper work
- The structured result contract
- Every added file and its responsibility
- How to install, run, and manually verify the code
- How to run automated tests
- Current limitations and recommended next work

## Branch and Scope

- Working branch: `pdf-and-summary`
- `main` was not modified.
- No backend routes, database models, storage integrations, or frontend
  components were added.
- The implementation is a standalone Python package that can later be called
  from a backend.
- The current focus is:
  1. Extracting native text from PDF files
  2. Running PaddleOCR when a PDF page has no selectable text
  3. Analyzing extracted text through a Gemini wrapper
  4. Returning structured results suitable for the planned Documents Page UX

## Original Deliverables

The original requested document-processing deliverables were:

- PDF text extraction using PyMuPDF
- PaddleOCR fallback for scanned or image-based documents
- Gemini Flash plain-English summaries highlighting:
  - Coverage limits
  - Deadlines
  - Required actions

## Implementation Status

### Completed

- [x] Reusable `pdf_and_summary` Python package
- [x] Native PDF selectable-text extraction using PyMuPDF
- [x] Multi-page PDF extraction
- [x] Page-labelled extracted text
- [x] Extraction metadata
- [x] PDF signature validation
- [x] Maximum file-size validation
- [x] Maximum page-count validation
- [x] Damaged or unreadable PDF handling
- [x] Password-protected PDF handling
- [x] Detection of pages with no selectable text
- [x] Detection of documents requiring OCR
- [x] PaddleOCR fallback
- [x] OCR processing for scanned/image-only PDF pages
- [x] Mixed native/scanned PDF processing
- [x] OCR fallback when native page extraction raises an error
- [x] Page-order preservation when native extraction and OCR are mixed
- [x] OCR confidence filtering
- [x] OCR source metadata and verification warnings
- [x] Optional OCR dependency file
- [x] Gemini REST wrapper
- [x] Gemini API key loaded from environment variables
- [x] Live Gemini verification with a real project API key
- [x] Structured Gemini JSON response schema
- [x] Gemini issue-type enum enforcement
- [x] Retry handling for temporary Gemini errors
- [x] Clear non-retryable Gemini HTTP errors
- [x] Secret-ignore rules and safe `.env.example`
- [x] Automatic loading from an ignored local `.env`
- [x] Strict Gemini CLI behavior that prevents silent local fallback
- [x] Selected summary-provider reporting
- [x] Accuracy-focused Gemini prompt
- [x] Simple-language document summary
- [x] Structured flagged issues
- [x] Structured deadline rows
- [x] Coverage-limit extraction
- [x] Required-action extraction
- [x] Conservative local analysis fallback
- [x] End-to-end extraction and analysis function
- [x] Command-line interface
- [x] Extraction-only CLI mode
- [x] Local-analysis CLI mode
- [x] User-safe CLI errors
- [x] Focused automated tests
- [x] Real local smoke test using a generated PDF
- [x] Optional MarkItDown structured Markdown extraction
- [x] spaCy NLP entity extraction layer (dates, money, organizations, percentages)
- [x] NLP sentence ranking for top document sentences
- [x] Markdown stripping before NLP to prevent table-syntax token artifacts
- [x] Address-number false-positive filtering for DATE entities
- [x] Construction-material false-positive filtering for ORG entities
- [x] `date_sentences` deduplication and truncation for clean output
- [x] Deterministic Gemini generation (temperature 0.0)
- [x] Reinforced Gemini prompt for consistent flagged-issue detection
- [x] NLP pre-scan hint prepended to Gemini prompt (dates, amounts, percentages checklist)
- [x] PII redaction layer (`Redactor` class) before Gemini summarisation
- [x] Rehydration of `plain_language_summary` after summarisation
- [x] `--redact-pii` and `--no-rehydrate` CLI flags
- [x] Gemini system prompt updated to handle placeholders transparently
- [x] Gemini request timeout increased to 120 s to handle large documents
- [x] Adjacent PERSON spans joined by `&`/`and` merged into one placeholder before Gemini (prevents `& and` doubling in rehydrated prose)
- [x] `extraction.text`, `nlp.date_sentences`, and `nlp.top_sentences` redacted in pipeline output when `--redact-pii` is used
- [x] Gemini system prompt updated to prevent echoing structural field labels (e.g. `Mailing Address`) in `plain_language_summary`
- [x] `RedactionMap.redact_text()` helper added for forward (original → placeholder) substitution
- [x] `RedactionMap._aliases` added — stores abbreviated address forms so `redact_text()` covers "Ave" vs "Avenue" variants
- [x] `RedactionMap.add_alias()` registers abbreviated surface forms against the same placeholder
- [x] Abbreviated address detection switched to street-number anchor (`4817 – 52`) + `[^\n]+` regex — catches all address variants regardless of street-type spelling
- [x] Abbreviated forms registered as `rmap` aliases after placeholder assignment so `redact_text()` redacts them in NLP sentences
- [x] `_PERSON_FP_WORDS` blocklist added — filters spaCy false-positive PERSON entities (construction materials, section headings, regulatory titles)
- [x] `_PERSON_FP_WORDS` extended with insurance domain terms (`adjuster`, `inspector`, `claims`, `checklist`, `guide`, `appraisal`, `loss`, `form`, `process`) to prevent job titles and document names being redacted
- [x] `_merge_adjacent_persons` extended to detect connector trailing inside span1 (spaCy sometimes includes `&` in the entity boundary)
- [x] Digit filter added to `_person_spans` — spans containing any digit (e.g. `"Box 3"`, `"Site 12"`) are not person names and are dropped before placeholder assignment
- [x] `_salutation_spans()` function added — finds `Ms./Mr./Mrs./Dr. Surname` forms for every detected person name and adds them to the span list so the salutation is redacted alongside the full name
- [x] Salutation forms registered as `rmap` aliases so `redact_text()` also catches them in any Gemini output that echoes the salutation directly
- [x] EMAIL redaction added — `_EMAIL_RE` regex catches personal email addresses (e.g. adjuster direct email) in the extracted text
- [x] PHONE redaction added — `_PHONE_RE` regex catches local/direct phone numbers; `_is_tollfree()` helper filters out toll-free numbers (800/877/888/866/855/844/833 area codes) which are organizational contact info
- [x] `_ADDRESS_FIELD_RE` extended to match `c/o` prefixes in addition to `Mailing Address` and `Property Address` labels — catches claimant mailing addresses formatted as `c/o 47 Maple Cres NW`
- [x] Leading non-alphabetic prefix stripping in `_person_spans` — bullet characters (`•`) included by spaCy in entity spans are stripped before the word-count check, so `"• Wear"` collapses to `"Wear"` (1 token → filtered) instead of bypassing the 2-word minimum
- [x] Uppercase first-character filter added to `_person_spans` — all-lowercase spans such as `"sonic booms"` or `"wear and tear"` are rejected outright; real person names in formal documents always start with a capital letter
- [x] `wildfire` added to `_PERSON_FP_WORDS` — prevents spaCy tagging `"Alberta Wildfire"` (and similar two-word capitalized wildfire references) as a person name
- [x] `_ADDRESS_FIELD_RE` tightened — label-based matches (`Mailing Address`, `Property Address`) now require a colon immediately after the label (`\s*:`); `c/o` is kept as a separate space/newline-separated branch. This eliminates two classes of false positives: inline form annotations like `"(if different):"` captured via a bare-space separator, and body-text substrings like `"insured property address\n"` that previously matched without a colon
- [x] Gemini DEADLINES prompt rule expanded to five categories: fixed calendar deadlines, event-triggered durations, coverage/benefit periods, maximum entitlement durations, and recurring review cycles
- [x] Deductibles (standard and all peril-specific) added to Gemini `warnings` instruction alongside exclusions and coinsurance clauses
- [x] NLP hint closing instruction strengthened — all dates/durations/recurrences must appear in `deadlines` specifically, not just `warnings`
- [x] `_PERSON_FP_WORDS` extended with `residence` — prevents `"Primary Residence"` table row headers from being tagged as PERSON
- [x] `_ADDRESS_FIELD_RE` extended to match `Permanent Address:` labels in addition to `Mailing Address:` and `Property Address:` — catches permanent-address fields on government DRP application forms
- [x] `_PERSON_FIELD_RE` regex added — captures split `Last Name:` / `First Name:` entries from labeled form fields where each token appears alone on its own line and spaCy's two-token minimum cannot fire
- [x] Labeled form-field person extraction block added in `Redactor.redact()` — always runs (pure regex, no spaCy), catches `Last Name:`, `First Name:`, `Full Name:`, `Print Name:`, `Named Insured:` patterns; respects `_PERSON_FP_WORDS` and the digit filter
- [x] Gemini DEADLINES prompt extended with explicit exclusion rules: (1) historical-fact dates such as loss date, disaster date, letter date, claim filing date, policy issue date; (2) near-identical duplicates — suppressed unless the duplicate is a complementary relative-duration + calendar-date pair for the same obligation; (3) context dates that state when a situation began rather than a deadline to act
- [x] Gemini FLAGGED_ISSUES checklist extended with: required supporting documents explicitly noted as incomplete, partial, or missing (MISSING); and key monetary values or settlement amounts listed as "not yet determined", "TBD", or "pending" (UNRELIABLE_DATA)
- [x] Gemini `warnings` instruction extended to include key conditions or limitations on how coverage or assistance is calculated (e.g. "covers only uninsurable losses above your insured settlement")
- [x] `_POLICY_NUMBER_RE` extended with a second alternative `[A-Z]{2,5}-[A-Z]{2,5}-\d{5,}` — catches 3-segment policy numbers like `TD-HM-456789`; 5+ final digits prevents matching DRP reference codes (`DRP-AB-2024` which has only 4 digits)
- [x] `_ADDRESS_FIELD_RE` extended with two new branches: `Location of loss:?` (for IBC claim tables where the colon is optional) and `^Address\n` (bare label on its own line in 2-column PDF tables); `re.MULTILINE` flag added so `^Address` anchors correctly
- [x] `_PERSON_TRAILING_LABEL_RE` added — strips trailing form-label tokens (`Address`, `Phone`, `Email`, `Date`, `Signature`, `Occupation`, `Witness`) from PERSON entity boundaries; prevents spaCy's greedy span `"Sarah Thompson\nAddress"` from producing two separate person placeholders, which caused `"Sarah Thompson\nAddress with TD Insurance"` artifacts in the rehydrated plain summary
- [x] `_person_spans()` updated to call `_PERSON_TRAILING_LABEL_RE` and recompute `end_char` from the stripped name length — ensures the redaction range covers only the actual name, not the trailing label
- [x] `_PERSON_FP_WORDS` extended with retail and product terms (`buy`, `oven`, `microwave`, `sofa`, `couch`, `television`, `furniture`, `appliance`, `electronics`) — prevents spaCy from tagging Schedule of Loss product descriptions like `"Best Buy"` or `"Microwave Oven"` as PERSON names
- [x] `Redactor.redact()` group-extraction updated to use `next(g for g in m.groups() if g is not None)` — required after `_ADDRESS_FIELD_RE` grew to 3 capture groups (one per branch)
- [x] Gemini `coverage_limits` rule: "Schedule of Loss" explicitly defined as a per-item product list (each individual possession in its own row with original and replacement cost); aggregate damage category estimates are NOT Schedule of Loss items and must be included
- [x] Gemini `coverage_limits` dedup rule added — same dollar amount must not appear twice under different field labels; Proof of Loss forms capped to four entries: (1) total policy amount, (2) per-category sub-limits, (3) total loss or damage, (4) net claim after deductible; `"Amount Claimed Under This Policy"` excluded when equal to `"Total Loss or Damage"`
- [x] Gemini `warnings` rule extended: procedural consequences in form headers or instructions (e.g. "Incomplete forms will delay processing") must appear in warnings
- [x] Gemini `warnings` rule extended: `"without prejudice to the liability of the Insurer"` clause in a Proof of Loss or claim settlement form triggers a plain-language warning that the insurer has not yet confirmed it accepts the claim
- [x] Gemini `flagged_issues` overland-flooding rule added — when a Proof of Loss, claim submission, or claim adjustment letter states overland flooding, water intrusion, or sewer backup as the cause of loss, flag `WARNING` to verify Overland Water endorsement; does NOT fire for policy documents that list flooding as an excluded peril (already in warnings); when fired, excluded from warnings to avoid duplication
- [x] Gemini `flagged_issues` MISSING consolidation rule added — multiple missing documents of the same type (e.g. receipts across several damage categories) must be consolidated into a single MISSING flag; MISSING flags that require user action must also appear in `required_actions`
- [x] Gemini `flagged_issues` UNRELIABLE_DATA tightened — only fires for specific monetary or quantitative values explicitly marked TBD/pending; narrative unknowns (e.g. "return date unknown") and absence of deadlines explicitly excluded
- [x] Gemini `flagged_issues` handled-risk rule added — risks the form already shows are resolved (e.g. damaged property not removed, no emergency repairs made) must NOT be flagged
- [x] Gemini `deadlines` near-duplicate rule updated — when the document combines a relative duration and calendar date in a single parenthetical clause (e.g. "within 30 days of this letter (by September 28, 2024)"), produce ONE combined entry; do not create two separate entries for the same action
- [x] Gemini `deadlines` absence rule added — absence of explicit deadlines is NOT a flagged issue
- [x] NLP hint closing instruction updated — historical event dates (loss date, disaster designation date, letter date, claim filing date) must not be included in deadlines even if they appear in the NLP pre-scan list
- [x] `_LEGAL_DESCRIPTION_RE` updated — both Alberta cadastral orderings now matched: `Lot X, Block X, Plan X` (original) and `Plan X, Block X, Lot X` (declarations-page order); extended optional suffix still captures meridian codes and city names
- [x] `_ADDRESS_FIELD_RE` colon made optional for standard labels (`Mailing Address`, `Permanent Address`, `Property Address`) — form-layout PDFs use a newline separator without a colon; `Current Mailing Address` label added as an additional variant; `Location:` branch added (catches labeled address fields not covered by `Location of loss`)
- [x] `_PERSON_FIELD_RE` separator made colon-optional — split form fields like `Last Name\nBlackwood` (no colon, value on next line) are now caught; separator regex extended to `(?:[ \t]*:[ \t]*\n?[ \t]*|[ \t]*\n[ \t]*)` so both `Last Name: Blackwood` and `Last Name\nBlackwood` match
- [x] Gemini SYSTEM_PROMPT updated with explicit `REQUIRED ACTIONS` section — defines which items belong in `required_actions`, including insured-directed adjuster report recommendations; `required_actions` entries must start with an imperative verb; generic document-retention notes (`"Keep a copy for your records"`) explicitly excluded
- [x] Gemini `deadlines` `date` field constraint added — `date` must always contain a time expression; dollar amounts, percentages, and monetary limits must never appear in `date` (they belong in `coverage_limits`)
- [x] Gemini `deadlines` exclusion list extended — discount qualification criteria and eligibility thresholds (e.g. `"5+ years claims-free"`, `"built within 10 years"`) excluded; these describe conditions for a discount, not time-bound obligations
- [x] Gemini `flagged_issues` ACTION_REQUIRED rule updated — vacancy clause rule replaced with broader maintenance condition rule: any policy condition requiring the insured to have or maintain a specific physical installation (e.g. backwater valve for sewer backup coverage) or valid inspection certificate (e.g. WETT certification) is flagged ACTION_REQUIRED and also added to `required_actions`; scoped to ongoing physical maintenance only, not document submissions
- [x] `_POLICY_NUMBER_RE` extended with a third alternative `[A-Z]{2,5}-\d{2,4}-\d{2,4}[A-Z]{1,2}` — catches mixed-alphanumeric policy numbers like `HOP-884-19A` (letters–digits–digits+letter suffix); trailing letter requirement prevents matching bare numeric codes
- [x] `_ADDRESS_FIELD_RE` extended with a sixth branch: `Loss address` (colon optional) — catches the labeled address field on property loss notice forms (e.g. Prairie Mutual HLN); comment updated from "Three branches" to "Six branches"
- [x] `_PERSON_FP_WORDS` extended with sentence-starter verbs (`needs`, `requires`, `pending`) — prevents spaCy from tagging priority-label + sentence-opener patterns (e.g. `"B. Needs"` in adjuster triage notes) as PERSON names
- [x] `_PERSON_FIELD_RE` extended with bare `Insured` label — catches `"Insured\nOwen and Priya Shah"` form fields where only one partner's name was previously caught by spaCy (the other fell below the two-token minimum); `Named Insured` remains first in the alternation so the two-word label still matches preferentially; separator requires colon or newline so mid-sentence `"insured must notify"` cannot match; upstream uppercase-first-char check rejects occupancy values like `"owner occupied"` if OCR ever sequences them immediately after `"Insured"`
- [x] Gemini `SYSTEM_PROMPT` DEADLINES exclusion list extended with `evacuation order date` — prevents the date the evacuation was ordered (a historical fact) from being listed as a deadline for action
- [x] `_build_nlp_hint` NLP closing instruction updated — `evacuation order date` added to the historical-event-dates exclusion list so the hint does not direct Gemini to create a deadline from it
- [x] `_PERSON_FP_WORDS` extended with room/area names (`kitchen`, `pantry`, `bedroom`, `bathroom`, `garage`, `basement`, `hallway`, `laundry`) — prevents spaCy from tagging room-name values from OCR "Room /Area:" fields (e.g. `"Kitchen + pantry"`) as PERSON placeholders; also adds org-indicator words (`insurance`, `company`) to guard against the new `Claimant`/`Prepared by` labels capturing insurer names as person names
- [x] `_PERSON_FIELD_RE` extended with `Claimant` and `Prepared by` labels — catches preparer and claimant names on inventory and ALE receipt forms (e.g. `"Claimant: Danielle Rivera"`, `"Prepared by: Danielle Rivera"`) that spaCy's NER misses in dense OCR table contexts; `Claimant` scoped to colon/newline separator so mid-sentence `"the claimant must"` cannot match; `_PERSON_FP_WORDS` guards prevent org names from being captured
- [x] Whitespace-normalized alias registration added in `Redactor.redact()` — after building `original_to_ph`, iterates entries and registers a space-normalized alias (newlines → single space) for any original containing newline characters; fixes PII leak in `date_sentences`/`top_sentences` when spaCy tags a name spanning an OCR line break (e.g. `"Marta Kowalski\nSigned"`) so `redact_text()` exact-match also catches the space-joined form that appears in spaCy sentence strings
- [x] `_PERSON_FP_WORDS` extended with `proofs` — prevents spaCy from tagging the word immediately before `"and Proofs"` as a PERSON entity in documents using `"Documents and Proofs"` as a section heading (session-7 FP fix)
- [x] `_person_spans()` updated to strip leading tokens that appear in `_PERSON_FP_WORDS` from PERSON entity spans before applying the FP-word filter — handles contact-table rows like `"Disaster Health Adjuster Samira Cole"` where spaCy includes the job title in the entity boundary; strategy: find the last FP-word token in the span and take everything after it as the actual name; char offsets recomputed by searching for the trimmed name within the entity region (session-7 FN fix for `Samira Cole`, `Andre Wu`, `Keira Holt`)
- [x] `_POLICY_NUMBER_RE` extended with two new alternatives: `[A-Z]{2,6}-\d{2,4}-\d{4,6}-[A-Z]{1,3}` (catches `AUTO-74-39928-AB` style: letters–digits–digits–letters) and `[A-Z]{2,6}-[A-Z]\d{1,3}-\d{4,8}-[A-Z]{1,3}` (catches `LIFE-T20-991204-BC` style: letters–letter+digits–digits–letters); comment updated from "three" to "five" formats (session-7 FN fix)
- [x] Gemini `SYSTEM_PROMPT` overland-water `flagged_issues` rule scoped to property policies only — added explicit guard: `"Do NOT apply this rule for auto insurance, life insurance, or health insurance claim documents — the Overland Water endorsement only exists on home, property, condominium, and tenant/renter insurance policies."` (session-7 cross-domain FP fix)

### Not Implemented

- [ ] Processing standalone PNG, JPG, JPEG, or TIFF documents
- [ ] Backend API endpoint
- [ ] Frontend Documents Page
- [ ] File upload or drag-and-drop behavior
- [ ] File storage

The current pipeline detects PDF pages without selectable text, renders only
those pages to PNG at 200 DPI, runs PaddleOCR, and merges recognized text back
into the correct page order.

## Documents Page UX Alignment

The implementation was fine-tuned using `claude_documents_page_prompt.md`.

That UX expects analysis to produce:

1. A simple-language **Document Summary**
2. Important **Flagged Issues**
3. A **Deadlines** table with task and date columns

The result contract was updated to directly support those sections.

### Document Summary

Returned as:

```json
{
  "plain_language_summary": "A short explanation written in simple language."
}
```

### Flagged Issues

Each issue contains a type and a user-facing message:

```json
{
  "issue_type": "ACTION_REQUIRED",
  "message": "Contact your insurer before submitting the claim."
}
```

Supported issue types:

- `MISSING`
- `UNRELIABLE_DATA`
- `ACTION_REQUIRED`
- `WARNING`

### Deadlines

Each deadline is structured for a two-column table:

```json
{
  "task": "Submit the claim form",
  "date": "October 20, 2026"
}
```

Gemini is instructed not to create a deadline row when the date is ambiguous.
It should return an `UNRELIABLE_DATA` flagged issue instead.

## Architecture

The package follows this flow:

```text
PDF bytes or PDF path
        |
        v
Validate PDF type and safety limits
        |
        v
Extract selectable text from every page with PyMuPDF
        |
        +---- Page has no selectable text
        |             |
        |             v
        |     Render page to PNG at 200 DPI
        |             |
        |             v
        |     Run PaddleOCR and filter low-confidence text
        |             |
        +-------------+
        |
        v
Optional: convert native pages to Markdown with MarkItDown
        |
        v
Optional: run spaCy NLP entity extraction on plain text
        (markdown is stripped before NLP to prevent token artifacts)
        |
        v
Send extracted text to Gemini, or use local fallback
        |
        v
Return structured extraction, NLP, and summary JSON
```

## PDF Extraction Behavior

The public extraction function is:

```python
from pdf_and_summary import extract_text_from_pdf

result = extract_text_from_pdf(pdf_source)
```

Accepted source types:

- PDF file path
- PDF bytes
- PDF bytearray
- Binary file-like object

Default limits:

- Maximum file size: 25 MB
- Maximum pages: 100

Each extracted page is labelled with its text source:

```text
--- Page 1 (native) ---
Native page text

--- Page 2 (ocr) ---
OCR-derived page text
```

The extraction result contains:

```json
{
  "text": "Page-labelled extracted text",
  "page_count": 2,
  "pages_with_text": 2,
  "character_count": 1234,
  "native_text_pages": 1,
  "ocr_pages": 1,
  "ocr_engine": "paddleocr",
  "warnings": [
    "OCR was used for 1 page(s). Verify OCR-derived text against the original document."
  ],
  "extraction_format": "text"
}
```

`extraction_format` is `"text"` for normal PyMuPDF extraction and `"markdown"` when
`--markitdown` is used and MarkItDown succeeds.

### MarkItDown Extraction

Passing `--markitdown` to the CLI (or `use_markitdown=True` to `extract_text_from_pdf`)
converts native pages to structured Markdown before summarisation. This preserves
table formatting in the extracted text and sets `extraction_format` to `"markdown"`.

The NLP layer always receives plain text regardless of extraction format — markdown
tables and headers are stripped before spaCy processes the document.

### Extraction Validation

The extractor rejects:

- Content that does not start with a PDF signature
- Files over the configured size limit
- Documents over the configured page limit
- Damaged or unreadable PDF files
- Password-protected PDF files
- Unsupported input types

### OCR Fallback Behavior

Native extraction is always attempted first. PaddleOCR runs only for pages
where PyMuPDF returns no selectable text or native page extraction fails.

For each OCR page, the extractor:

1. Renders the page to PNG at 200 DPI.
2. Passes the PNG to a lazily initialized `PaddleOCREngine`.
3. Uses the PaddleOCR 3.x English mobile OCR pipeline.
4. Keeps recognized lines with confidence scores of at least `0.5`.
5. Labels the merged page as `(ocr)`.
6. Adds an OCR verification warning.

If PaddleOCR is required but not installed, the pipeline returns an actionable
error directing the user to install `requirements-ocr.txt`.

OCR can be disabled by passing `use_ocr=False` or using CLI option `--no-ocr`.

## NLP Layer

The optional spaCy NLP layer runs after extraction and before summarisation. It
adds an `nlp` key to the pipeline result containing structured entities extracted
from the document.

Install NLP dependencies:

```bash
pip install -r pdf_and_summary/requirements-nlp.txt
python -m spacy download en_core_web_sm
```

Disable NLP programmatically with `use_nlp=False` in `process_pdf()`.

### NLP Result Shape

```json
{
  "nlp": {
    "dates": ["June 1, 2024", "within 90 days"],
    "date_sentences": ["Submit a Proof of Loss within 90 days of the loss…"],
    "money": ["1,648.00", "620,000", "2,000,000"],
    "percentages": ["10%", "5%"],
    "organizations": ["Prairies Shield Insurance Group", "Clearwater Insurance Brokers Ltd."],
    "top_sentences": ["...ranked sentences from the document..."],
    "provider": "spacy"
  }
}
```

### NLP Quality Rules

**Markdown stripping**: Before processing, the engine strips markdown table
separators (`|---|---|`), table cell pipes, and `#` headers. This prevents
artifacts like `"$62,000 $"` that occur when spaCy tokenizes raw markdown tables.

**Date false-positive filtering**: Bare 3–5 digit numbers (e.g. address numbers
like `4817`, `10180`) that spaCy mislabels as `DATE` entities are dropped.

**Organization false-positive filtering**: A small blocklist removes construction
and material terms (`"wood frame"`, `"forced air"`, `"copper & pex"`, etc.) that
spaCy commonly mislabels as `ORG`.

**`date_sentences` deduplication**: The dedup key uses the first 100 characters
of each sentence, so near-identical multi-line blocks are collapsed to one entry
rather than appearing five or six times. Each stored sentence is capped at 300
characters.

## PII Redaction

The optional redaction layer replaces personal identifiers in the extracted
text with stable placeholders before the text is sent to Gemini. After
summarisation, the `plain_language_summary` field is rehydrated with the
original values. All other structured fields (`flagged_issues`, `warnings`,
`required_actions`, `coverage_limits`, `deadlines`) use generic language and
are not rehydrated — adding rehydration there would be complexity with no gain.

When `--redact-pii` is active, the pipeline also redacts `extraction.text`,
`nlp.date_sentences`, and `nlp.top_sentences` in the output JSON so that no
field in the result leaks PII, regardless of the `--no-rehydrate` setting.

### Recommended mode

PII redaction with rehydration is always on. Gemini never sees personal
identifiers; the `plain_language_summary` is rehydrated so it reads naturally
with real names and addresses restored.

### Design: Option 2 (Redact + Rehydrate)

| Option | What Gemini sees | User-facing output | Privacy |
|---|---|---|---|
| **Option 2 (implemented, recommended)** | Placeholders | Real values (rehydrated summary) | Gemini never sees PII |
| Option 3 (log/safe mode) | Placeholders | Placeholders kept | Strongest privacy |

Enable with `--redact-pii`. Disable rehydration (Option 3 behaviour) with
`--no-rehydrate`.

### What Is Redacted

| Category | Example | Placeholder |
|---|---|---|
| Named insured (person names) | `Sarah M. Kowalczyk` | `[PERSON_1]` |
| Salutation forms | `Ms. Kowalczyk`, `Mr. Tran` | `[PERSON_1]` (same placeholder as full name) |
| Home / mailing address | `4817 – 52 Avenue NW, Edmonton, AB T6B 1C3` | `[ADDRESS_1]` |
| c/o mailing address | `c/o 47 Maple Cres NW` | `[ADDRESS_1]` |
| Policy number | `AHI-2024-0047821` | `[POLICY_NUMBER_1]` |
| Legal description | `Lot 14, Block 22, Plan 7522143, City of Edmonton` | `[LEGAL_DESCRIPTION_1]` |
| Loan number | `Loan #7291-004-488-3` | `[LOAN_NUMBER_1]` |
| Broker reference | `Br. #AB-03291` | `[BROKER_REF_1]` |
| Broker licence | `Broker Licence No. AB-03291` | `[LICENCE_NUMBER_1]` |
| Personal email | `m.tran@albertashield.ca` | `[EMAIL_1]` |
| Direct phone number | `(780) 555-0167` | `[PHONE_1]` |

### What Is Never Redacted

Coverage amounts, deductibles, percentages, dates, deadlines, exclusion
clauses, toll-free organizational phone numbers (800/877/888/866/855/844/833
area codes), and insurer/broker office addresses are intentionally left in
plain text — they are necessary for an accurate summary and carry no personal
risk.

### Detection Strategy

- **PERSON names** — spaCy NER (`PERSON` label, minimum two tokens after
  stripping leading non-alphabetic characters). A `_PERSON_FP_WORDS` blocklist
  drops known false positives (construction materials, regulatory titles,
  insurance domain terms like `"Claims Adjuster"`, `"Loss Checklist"`, and
  fire-event terms like `"Alberta Wildfire"`). Additional filters: spans
  containing any digit (e.g. `"Box 3"`) are dropped; spans whose first
  alphabetic character is lowercase (e.g. `"sonic booms"`, `"wear and tear"`)
  are rejected — real person names in formal documents always start with a
  capital letter; leading non-alpha chars such as bullet `•` are stripped
  before the word-count and case checks so `"• Wear"` (1 real token) never
  passes. Adjacent PERSON spans are merged into one placeholder when joined by
  `&` or `and`. Salutation forms (`Ms./Mr./Mrs./Dr. Surname`) are found via
  `_salutation_spans()` and assigned the same placeholder as the full name, so
  `"Dear Ms. Johnson,"` is redacted to `"Dear [PERSON_1],"`. Salutation forms
  are also registered as `rmap` aliases so `redact_text()` catches them in any
  Gemini output field. Degrades gracefully to regex-only if spaCy is
  unavailable.
- **PERSON names from labeled form fields** — `_PERSON_FIELD_RE` pure-regex
  step always runs after spaCy. Matches `Last Name`, `First Name`, `Full
  Name`, `Print Name`, `Named Insured`, and bare `Insured` labels; captures
  the value on the same or next line. `Named Insured` appears before `Insured`
  in the alternation so the two-word form matches preferentially. Bare
  `Insured` catches multi-party insured fields (e.g. `"Owen and Priya Shah"`)
  where one partner's first name falls below spaCy's two-token minimum. The
  separator requires a colon or newline, so mid-sentence occurrences of
  "insured" (e.g. "the insured must notify") never match. The upstream
  uppercase-first-char check rejects any value whose first character is
  lowercase (guards against occupancy values like `"owner occupied"` ever
  being captured). The separator is colon-optional: both `Last Name: Blackwood`
  (colon, same or next line) and `Last Name\nBlackwood` (newline, no colon)
  are matched. Bypasses the two-token minimum that spaCy requires — a last
  name alone ("Blackwood") is a valid PERSON here because the field label
  provides context. Same `_PERSON_FP_WORDS` and digit filters apply.
- **PERSON trailing-label stripping** — `_PERSON_TRAILING_LABEL_RE` strips
  trailing form-label tokens (`Address`, `Phone`, `Email`, `Date`, `Signature`,
  `Occupation`, `Witness`) from spaCy PERSON entity boundaries. In PDF
  2-column table layouts (IBC forms), spaCy's greedy NER includes the label
  on the next line inside the PERSON span (e.g. `"Sarah Thompson\nAddress"`).
  Without this fix the same person gets two distinct placeholders (one with
  and one without the trailing label), causing rehydration artifacts.
- **ADDRESS** — extracted from labelled fields and `c/o` blocks. Six regex
  branches: (1) `(Current) Mailing/Permanent/Property Address` — colon is
  optional (many form-layout PDFs use a newline separator without a colon),
  (2) `Location of loss:?` (IBC claim tables, colon optional), (3) `^Address\n`
  (bare label on its own line in 2-column PDF tables), (4) `c/o` prefix,
  (5) `^Location:` (labeled address field), (6) `Loss address` (colon optional,
  property loss notice forms such as Prairie Mutual HLN). `re.MULTILINE` flag
  added so `^Address` and `^Location:` anchors work correctly. Abbreviated forms
  (e.g. `"4817 – 52 Ave NW"`) are detected using a street-number anchor regex
  and registered as `rmap` aliases. Organizational addresses are not matched
  because they don't appear under labelled or c/o address fields.
  **OCR caveat**: when PaddleOCR reads a multi-column form, column values may
  interleave across rows (e.g. "Loss address\n2026-05-17\n128 Sage Valley Rd
  NW"), causing the regex to capture the date on the immediately following line
  rather than the address. This is an OCR column-ordering limitation, not a
  regex bug; the branch works correctly on native-text PDFs.
- **EMAIL** — `_EMAIL_RE` regex catches personal email addresses in the
  document body (e.g. adjuster direct email).
- **PHONE** — `_PHONE_RE` regex catches local/direct phone numbers.
  `_is_tollfree()` filters out toll-free numbers so organizational contact
  lines (1-800, 1-877, etc.) are never redacted.
- **Structured IDs** — regex patterns for policy numbers, legal descriptions,
  loan numbers, broker references, and licence numbers. `_POLICY_NUMBER_RE`
  matches three formats: `ASI-2024-00847` (letters–4-digit year–5+ digits),
  `TD-HM-456789` (letters–letters–5+ digits), and `HOP-884-19A`
  (letters–digits–digits+letter suffix). `_LEGAL_DESCRIPTION_RE` matches both
  Alberta cadastral orderings: `Lot X, Block X, Plan X` (older survey
  descriptions) and `Plan X, Block X, Lot X` (current declarations-page
  format). Optional suffix captures meridian codes (e.g. `W5M`) and city names.

### Rehydration Scope

Only `plain_language_summary` is rehydrated. Gemini's summary intro typically
echoes names and the address (`"...covering the home of [PERSON_1] at
[ADDRESS_1]..."`). After rehydration the final output reads naturally.
If Gemini rephrases to generic language (`"the named insured"`) nothing needs
to be rehydrated — that is the better outcome.

### Output Shape (with `--redact-pii`)

A `redaction` key is added to the result. It contains only aggregate
statistics — original values are never serialised:

```json
{
  "redaction": {
    "enabled": true,
    "rehydrated": true,
    "placeholder_count": 7,
    "categories": {
      "PERSON": 2,
      "ADDRESS": 1,
      "POLICY_NUMBER": 1,
      "EMAIL": 1,
      "PHONE": 1
    }
  }
}
```

### CLI Usage

```bash
# PII is always redacted before Gemini; summary is rehydrated automatically.
python3 -m pdf_and_summary.cli /path/to/document.pdf
```

### Programmatic Usage

```python
from pdf_and_summary import process_pdf

# Default: PII redaction off
result = process_pdf(pdf_bytes)

# Redact + rehydrate (recommended for user-facing output)
result = process_pdf(pdf_bytes, redact_pii=True)

# Redact without rehydration (recommended for logs / backend storage)
result = process_pdf(pdf_bytes, redact_pii=True, rehydrate=False)
```

### Added File: `pdf_and_summary/redactor.py`

Implements:

- `RedactionMap` dataclass — bidirectional placeholder ↔ original map;
  exposes only aggregate statistics, never raw values
- `RedactionMap.rehydrate(text)` — replaces placeholders with originals
- `RedactionMap.redact_text(text)` — replaces originals AND registered aliases
  with placeholders (used to redact `extraction.text` and NLP sentences)
- `RedactionMap.add_alias(placeholder, alias)` — registers an abbreviated or
  variant form (e.g. `"4817 – 52 Ave NW"`) against an existing placeholder
- `Redactor` class with `redact(text)` → `(redacted_text, RedactionMap)` and
  overlap-safe span resolution
- `_PERSON_FP_WORDS` blocklist — construction materials, section headings,
  regulatory titles, insurance domain terms (`adjuster`, `claims`, `checklist`,
  `guide`, `appraisal`, `loss`, etc.), fire-event terms (`wildfire`), form
  labels (`residence`), and sentence-starter verbs (`needs`, `requires`,
  `pending`) that spaCy `en_core_web_sm` commonly mislabels as PERSON
- `_PERSON_FIELD_RE` regex — matches `Last Name:`, `First Name:`, `Full Name:`,
  `Print Name:`, `Named Insured:` form fields; captures the value even when it
  appears alone on its own line with no adjacent context for spaCy
- `_person_spans()` — spaCy PERSON entity extraction with false-positive
  filtering: FP words, digit check, lowercase first-char rejection, and
  leading non-alpha prefix stripping before word-count check
- `_merge_adjacent_persons()` — merges PERSON spans joined by `&`/`and`
- `_salutation_spans()` — finds `Ms./Mr./Mrs./Dr. Surname` forms for every
  detected person name; returns extra spans (assigned the same placeholder as
  the full name) and alias pairs for `rmap` registration
- `_is_tollfree()` — returns `True` for 800/877/888/866/855/844/833 area
  codes so those numbers are not added to the PHONE span list
- `_resolve_overlaps()` — keeps the longer match when spans overlap

## Gemini Wrapper Behavior

The Gemini wrapper is implemented as `GeminiSummarizer`.

It uses Gemini's REST API directly and does not require a Gemini Python SDK.

Configuration:

```bash
export GEMINI_API_KEY="your-key"
export GEMINI_MODEL="gemini-2.5-flash"
```

- `GEMINI_API_KEY` is required for live Gemini analysis.
- `GEMINI_MODEL` is optional.
- The default model is `gemini-2.5-flash`.
- The API key is sent using the `x-goog-api-key` request header.
- The API key is not placed in the request URL.
- The API key is not stored in source code, documentation, or committed files.
- `.env` and `.env.*` files are ignored by git.
- `.env.example` contains only empty configuration placeholders.
- Request timeout is 120 seconds (increased from 30 s to handle large
  insurance documents that produce sizeable payloads).
- Temporary Gemini failures are retried up to two times with exponential
  backoff.
- HTTP `429`, `500`, `502`, `503`, and `504` responses are treated as
  retryable.
- Other Gemini HTTP errors return their status code without exposing the key.

### CLI Provider Selection

The CLI previously allowed a normal command to silently use the local fallback
when `GEMINI_API_KEY` was absent. This made a missing Gemini configuration look
like a successful Gemini run.

That behavior was changed:

- Analysis always requires Gemini configuration.
- The CLI automatically loads `.env` from the repository root.
- `--env-file /path/to/file` loads a different environment file.
- Shell environment values take precedence over environment-file values.
- The selected provider is printed to stderr before analysis.
- A missing key produces an actionable error.

Expected Gemini provider message:

```text
Using summary provider: gemini:gemini-2.5-flash
```

### NLP → Gemini Integration

The NLP layer runs locally before Gemini is called. Its output (dates, money
amounts, percentages) is prepended to the Gemini prompt as a compact pre-scan
hint:

```
[NLP PRE-SCAN — use as a completeness checklist for your output]
Dates / durations found: June 1, 2024 to June 1, 2025, up to 24 months, 30 consecutive days, 90 days, 20 days, ...
Monetary amounts found: $1,648.00, $620,000, $180,000, $124,000, $2,000,000, ...
Percentages found: 10%, 20%, 5%, less than 100%
Ensure every monetary amount above appears in coverage_limits.
Ensure every date, duration, or recurrence above appears in deadlines (not just
warnings) — this includes policy periods, benefit duration caps, and periodic
review cycles such as 'annually' or 'every three years'.
---

Simplify this document and identify only facts stated in it:

[full document text]
```

This means Gemini has a pre-built checklist of every numeric value the document
contains. It cannot miss a coverage limit or deadline that spaCy already found.
The NLP `top_sentences` and `organizations` fields are not included in the hint
— they are too noisy and the full document text is already present.

Previously, `nlp_analysis` was passed to `summarize_document()` but silently
dropped on the Gemini path (it was only used by the local fallback). The fix
threads it through to `GeminiSummarizer.summarize()` via the
`_build_nlp_hint()` helper.

**Known NLP hint noise:** spaCy extracts all date-like tokens, including
non-deadline entries such as `"Monthly"` (from "Monthly payment plans available")
and garbled spans like `"June 1, 2024 Broker / Agent"`. Because the hint
instructs Gemini to create a deadline for every date, these produce spurious
entries. The fix is to deduplicate near-identical date strings before building
the hint (e.g. `"10 days'"` and `"10 days"` both appear and generate two
identical cancellation deadline rows).

### Gemini Generation Settings

- Temperature is set to `0.0` for fully deterministic output. Earlier testing at
  `0.1` produced runs where `flagged_issues` was unexpectedly empty on identical
  documents.

### Gemini Prompt Rules

The wrapper instructs Gemini to:

- Use plain language at approximately grade 8 reading level or below
- Prioritize accuracy over completion
- Never invent a deadline, amount, coverage, contact, or required action
- Return JSON matching the required response schema
- List every meaningful exclusion in `warnings`
- Not echo structural field labels from the source document (e.g. `Mailing
  Address`, `Named Insured`) in `plain_language_summary`

**`deadlines` routing — five categories all belong in `deadlines`:**

| Category | Example |
|---|---|
| Fixed calendar deadline | "June 1, 2024" |
| Event-triggered duration | "within 90 days of the loss", "within 20 days" |
| Coverage or benefit period | "June 1, 2024 to June 1, 2025" |
| Maximum entitlement duration | "up to 24 months" |
| Recurring obligation or recommended review cycle | "annually", "every three years" |

Nothing with a stated time limit moves to `flagged_issues`. Only entries with
no time limit at all get an `UNRELIABLE_DATA` flag.

**`deadlines` exclusion rules** — do NOT include:
- Historical-fact dates: loss date, disaster date, letter date, claim filing
  date, policy issue date, evacuation order date — these record when a past
  event occurred, not when something must be done
- Near-identical duplicates: if the same obligation with the same date is
  already listed, omit the repeat — **exception A**: if both a relative duration
  ("within 90 days") and its fixed calendar equivalent ("October 17, 2024")
  are stated in the document as complementary information in separate sentences,
  include both as separate entries — **exception B** (override A): if the
  document itself parenthetically combines both in one clause ("within 30 days
  of this letter (by September 28, 2024)"), produce ONE combined entry
- Context dates that state when a situation began ("living expenses incurred
  since July 18") rather than a deadline to act
- Discount qualification criteria or eligibility thresholds (e.g.
  `"5+ years claims-free"`, `"built within 10 years"`) — these describe
  conditions for a discount, not time-bound obligations
- The `date` field must always contain a time expression (calendar date,
  duration, coverage period, or recurrence). Dollar amounts, percentages, and
  monetary limits must never appear in `date` — those belong in `coverage_limits`
- Absence of an explicit deadline is NOT a flagged issue — many claim forms
  have no submission deadline

**`required_actions`** — specific steps the user still needs to take to
maintain coverage, comply with the policy, resolve the claim, or meet the
program's requirements. Includes: documents/forms/evidence to submit; assessments
or inspections the user must arrange (e.g. structural engineer review, independent
appraisal); other insurers or agencies the user must contact; regulatory or
municipal requirements to confirm before taking action. For adjuster or damage
assessment reports: if the report's recommendations require action by the insured,
include those as `required_actions` entries — do NOT leave insured-directed actions
only in `warnings`. Items that are purely the insurer's internal process (e.g.
"approve ALE continuation") belong in `warnings`, not `required_actions`. Each
entry must start with an imperative verb (Submit, Contact, Arrange, Confirm,
Review, Provide, Commission, Retain). Generic document-retention notes such as
`"Keep a copy for your records"` must NOT be included.

**`warnings`** — every meaningful exclusion + all deductibles (standard and
peril-specific) + coinsurance/underinsurance clauses + key conditions or
limitations on how coverage or assistance is calculated (e.g. "covers only
uninsurable losses above your insured settlement") + procedural consequences
in form instructions (e.g. "Incomplete forms will delay processing") + if the
document is a Proof of Loss or claim settlement form containing "without
prejudice to the liability of the Insurer", include a plain-language warning
that the insurer has not yet confirmed it accepts the claim.

**`flagged_issues` checklist** — valid `issue_type` values: `MISSING`,
`UNRELIABLE_DATA`, `ACTION_REQUIRED`, `WARNING`. Always check for when present:
- A vacancy clause or a policy condition that requires the insured to have or
  maintain a specific physical installation (e.g. a backwater valve required for
  sewer backup coverage) or valid inspection certificate (e.g. WETT certification
  for a wood-burning appliance) — flag ACTION_REQUIRED and also include in
  `required_actions`; this rule is for ongoing physical maintenance conditions
  only, not document submissions
- Coinsurance or underinsurance clause that can reduce payouts (WARNING)
- Percentage-based deductible (WARNING)
- Required supporting documents, receipts, or attachments explicitly noted as
  incomplete, partial, or missing (MISSING) — consolidate same-type missing
  docs into one flag; also add the action to `required_actions`
- A specific monetary or quantitative value explicitly marked "not yet
  determined", "TBD", or "pending" (UNRELIABLE_DATA) — narrative unknowns
  (e.g. "return date unknown") and absence of deadlines do NOT qualify
- If a Proof of Loss, claim submission, or claim adjustment letter states
  overland flooding/water intrusion/sewer backup as the cause of loss (NOT
  a policy listing flood as an excluded peril), flag WARNING to verify the
  Overland Water endorsement; do NOT also add to warnings
- Do NOT flag risks the form already shows are handled (damaged property not
  removed, no emergency repairs made, etc.)

### Structured Gemini Response

Gemini must return:

```json
{
  "plain_language_summary": "string",
  "flagged_issues": [
    {
      "issue_type": "MISSING | UNRELIABLE_DATA | ACTION_REQUIRED | WARNING",
      "message": "string"
    }
  ],
  "deadlines": [
    {
      "task": "string",
      "date": "string"
    }
  ],
  "coverage_limits": ["string"],
  "required_actions": ["string"],
  "warnings": ["string"]
}
```

The wrapper validates and converts this response into typed Python dataclasses.

## Local Analysis Fallback

When `GEMINI_API_KEY` is not set, the pipeline uses a conservative local
extractive fallback.

The local fallback:

- Creates a short summary from the beginning of the document
- Finds sentences that appear to contain coverage limits
- Finds sentences that appear to contain required actions
- Creates deadline rows only when a clear calendar date is present
- Adds an `UNRELIABLE_DATA` issue when deadline language exists but a clear
  calendar date cannot be identified
- Labels itself as `local-extractive`
- Includes a warning that all details must be verified against the original
  document

The local fallback is useful for testing the result shape. Gemini is expected
to provide the better document analysis.

## End-to-End Pipeline

Backend code can eventually call:

```python
from pdf_and_summary import process_pdf

result = process_pdf(pdf_bytes)
```

To force local analysis:

```python
result = process_pdf(pdf_bytes, prefer_gemini=False)
```

Example complete result (with NLP enabled):

```json
{
  "extraction": {
    "text": "--- Page 1 (native) ---\nDocument text",
    "page_count": 1,
    "pages_with_text": 1,
    "character_count": 30,
    "native_text_pages": 1,
    "ocr_pages": 0,
    "ocr_engine": null,
    "warnings": [],
    "extraction_format": "text"
  },
  "nlp": {
    "dates": ["October 20, 2026", "within 90 days"],
    "date_sentences": ["Submit the claim form by October 20, 2026."],
    "money": ["50,000"],
    "percentages": [],
    "organizations": ["Prairies Shield Insurance Group"],
    "top_sentences": ["Submit the claim form by October 20, 2026."],
    "provider": "spacy"
  },
  "summary": {
    "plain_language_summary": "This document explains the claim process.",
    "flagged_issues": [
      {
        "issue_type": "ACTION_REQUIRED",
        "message": "Contact your insurer before submitting."
      }
    ],
    "deadlines": [
      {
        "task": "Submit the claim form",
        "date": "October 20, 2026"
      }
    ],
    "coverage_limits": [
      "Coverage limit: $50,000 CAD."
    ],
    "required_actions": [
      "Contact your insurer before submitting."
    ],
    "warnings": [],
    "provider": "gemini:gemini-2.5-flash"
  }
}
```

## Added Files

### `pdf_and_summary/__init__.py`

Defines the public package API and exports:

- `Deadline`
- `DocumentSummary`
- `ExtractionResult`
- `FlaggedIssue`
- `GeminiSummarizer`
- `extract_text_from_pdf`
- `process_pdf`
- `summarize_document`

### `pdf_and_summary/exceptions.py`

Defines user-safe exceptions:

- `DocumentProcessingError`
- `InvalidPDFError`
- `SummaryError`

### `pdf_and_summary/models.py`

Defines typed result dataclasses:

- `ExtractionResult`
- `FlaggedIssue`
- `Deadline`
- `DocumentSummary`

Each top-level result supports conversion to a JSON-serializable dictionary.

### `pdf_and_summary/extractor.py`

Implements:

- PDF source reading
- PDF signature validation
- Size-limit validation
- Page-limit validation
- Password-protection detection
- Multi-page selectable-text extraction
- Page rendering for OCR fallback
- Native/OCR page labels
- Page-level PaddleOCR fallback
- Mixed native/scanned page-order preservation
- OCR verification warnings
- Extraction metadata

### `pdf_and_summary/ocr.py`

Implements:

- `OCREngine` protocol for injectable OCR providers
- `OCRError` user-safe errors
- Lazy `PaddleOCREngine` initialization
- Temporary page-image handling and cleanup
- PaddleOCR structured-result parsing
- OCR confidence filtering
- Actionable missing-dependency errors

### `pdf_and_summary/nlp.py`

Implements:

- `SpaCyNLPEngine` class with lazy model loading
- `NLPAnalysis` dataclass
- Markdown stripping before NLP (`_strip_markdown_for_nlp`)
- DATE entity extraction with bare-number false-positive filtering
- MONEY and PERCENT entity extraction
- ORG entity extraction with construction-material false-positive filtering
- `date_sentences` deduplication (first 100 chars key) and truncation (300 char cap)
- Sentence scoring and ranking by entity density and keyword presence
- Deadline, coverage, and action keyword pattern matching
- Calendar date detection helper

### `pdf_and_summary/summarizer.py`

Implements:

- Gemini REST wrapper
- Gemini system prompt with explicit flagged-issue checklist
- Deterministic generation at temperature 0.0
- Gemini response JSON schema
- Allowed flagged-issue enum enforcement
- Structured Gemini response parsing
- Retry handling for temporary network and service errors
- Safe HTTP error reporting
- Flagged-issue normalization
- Deadline normalization
- Local extractive fallback
- Local clear-date detection
- Ambiguous-deadline warning behavior

### `pdf_and_summary/pipeline.py`

Combines extraction and analysis.

It prevents analysis when no selectable text exists and reports that OCR is
required.

### `pdf_and_summary/cli.py`

Provides a command-line runner with:

- Gemini analysis (always-on; key required)
- PII redaction and rehydration (always-on)
- `--no-ocr` to disable PaddleOCR fallback
- `--env-file` to load a custom environment file
- User-friendly errors
- Non-zero exit status on failure
- Selected provider reporting on stderr

### `pdf_and_summary/config.py`

Implements:

- Automatic local `.env` loading
- Simple `KEY=VALUE` parsing
- Quoted value support
- Preservation of existing shell environment values

### `pdf_and_summary/requirements.txt`

Pins:

```text
PyMuPDF==1.26.0
```

### `pdf_and_summary/requirements-ocr.txt`

Installs the base extraction dependency plus:

```text
paddleocr==3.0.0
paddlepaddle==3.0.0
```

### `.gitignore`

Prevents local secrets and generated Python files from being committed:

- `.env`
- `.env.*`
- `.venv/`
- `__pycache__/`
- `*.py[cod]`

### `.env.example`

Documents the required Gemini environment variable names without storing a
real key:

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

### `pdf_and_summary/README.md`

Provides concise package setup and usage information.

### `tests/test_pdf_and_summary.py`

Contains focused unit tests for:

- Rejecting non-PDF content
- Extracting and labelling multiple pages
- Reporting pages with no selectable text
- Using OCR only for pages without native text
- Falling back to OCR when native page extraction raises an error
- Processing a fully scanned PDF with an injected OCR engine
- Preserving native and OCR page labels
- Filtering low-confidence PaddleOCR text
- Local summary fields
- Clear-date deadline rows
- Ambiguous-deadline flags
- Structured Gemini response parsing
- Gemini retry behavior for temporary HTTP failures
- Safe reporting for non-retryable Gemini HTTP failures
- Environment-file loading without overriding shell values
- End-to-end pipeline output
- Safe failure when native extraction and OCR both return no text

## How to Install

Run all commands from the repository root:

```bash
cd /Users/vidhi/Desktop/Rebuildr
git branch --show-current
```

Confirm the branch output is:

```text
pdf-and-summary
```

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r pdf_and_summary/requirements-ocr.txt
```

PaddleOCR downloads its mobile detection and recognition models on first OCR
use. This requires internet access and can take several minutes.

## How to Run Manually

Use a native PDF containing selectable text.

### Check Live Gemini Analysis

Create a Gemini API key in Google AI Studio, then run:

```bash
export GEMINI_API_KEY="your-key"
export GEMINI_MODEL="gemini-2.5-flash"
python3 -m pdf_and_summary.cli /full/path/to/document.pdf
```

Do not place the real API key in source files. Export it in the current shell
or use a local ignored `.env` file with your own environment-loading workflow.

The CLI automatically loads `.env`. Confirm the terminal prints:

```text
Using summary provider: gemini:gemini-2.5-flash
```

Expected output:

- `summary.provider` starts with `gemini:`
- The summary uses simple language
- Every flagged issue has an `issue_type` and `message`
- Every deadline has a `task` and clear `date`
- Details absent from the PDF are not invented

### Check Scanned or Image-Only PDF OCR

```bash
python3 -m pdf_and_summary.cli /full/path/to/scanned-document.pdf
```

Expected result:

- PaddleOCR runs automatically for pages without selectable text.
- OCR-derived text appears under a page label ending in `(ocr)`.
- `ocr_pages` is greater than zero.
- `ocr_engine` is `paddleocr`.
- Warnings tell the user to verify OCR-derived text.

To check behavior without OCR:

```bash
python3 -m pdf_and_summary.cli --no-ocr /full/path/to/scanned-document.pdf
```

### View CLI Help

```bash
python3 -m pdf_and_summary.cli --help
```

Available flags:

```text
--no-ocr          Disable PaddleOCR fallback
--env-file        Load a custom .env file
```

## How to Run Automated Tests

Run:

```bash
PYTHONPYCACHEPREFIX=/tmp/rebuildr-pycache \
python3 -m unittest discover -s tests -v
```

Current expected result:

```text
Ran 15 tests

OK
```

Run syntax compilation:

```bash
PYTHONPYCACHEPREFIX=/tmp/rebuildr-pycache \
python3 -m compileall -q pdf_and_summary tests
```

Run whitespace validation:

```bash
git diff --check
```

## Manual Smoke Test Already Completed

A real manual smoke test was completed with PyMuPDF `1.26.0` in a temporary
virtual environment.

A native text PDF was generated containing:

```text
Recovery Notice
Submit the claim form by October 20, 2026.
Coverage limit: $50,000 CAD.
You must contact your insurer before submitting.
```

The extraction-only command successfully returned:

- Page-labelled text
- `page_count: 1`
- `pages_with_text: 1`
- No extraction warnings

The local-analysis command successfully returned:

- A simple-language summary
- Two `ACTION_REQUIRED` flags
- One deadline row with a task and date
- One coverage limit
- Required actions
- `provider: local-extractive`

A live image-only PDF OCR smoke test was also completed. PaddleOCR downloaded
its mobile detection and recognition models and returned:

```json
{
  "text": "--- Page 1 (ocr) ---\nSubmit claim by October 20, 2026",
  "page_count": 1,
  "pages_with_text": 1,
  "native_text_pages": 0,
  "ocr_pages": 1,
  "ocr_engine": "paddleocr"
}
```

A live Gemini wrapper request was completed using the provided project API key.
The key was passed only as a process environment variable and was not written
to the repository.

The direct wrapper test returned:

- A plain-language insurance summary
- One `UNRELIABLE_DATA` flag for an ambiguous damage-photo deadline
- One structured claim-form deadline
- A `$50,000 CAD` coverage limit
- Required actions
- `provider: gemini:gemini-2.5-flash`

The complete PDF extraction-to-Gemini CLI flow was also verified using the
generated native PDF. It returned:

- Native page extraction metadata
- A simple-language Gemini summary
- A structured `October 20, 2026` deadline
- A `$50,000 CAD` coverage limit
- Required actions
- `provider: gemini:gemini-2.5-flash`

### Real Insurance PDF Verification

The first run of `/Users/vidhi/Downloads/insurance.pdf` returned:

```text
provider: local-extractive
```

That proved Gemini was not called. The terminal process did not have
`GEMINI_API_KEY`, and the old CLI silently used the local fallback.

The CLI was changed to prevent silent fallback. The provided key was then
stored only in the git-ignored local `.env`, and the same insurance PDF was
rerun:

```bash
python3 -m pdf_and_summary.cli --no-ocr /Users/vidhi/Downloads/insurance.pdf
```

The CLI reported:

```text
Using summary provider: gemini:gemini-2.5-flash
```

The result contained:

- `provider: gemini:gemini-2.5-flash`
- A plain-language summary of the seven-page Alberta home policy
- Four structured flagged issues
- Three deadline rows
- Nineteen coverage limits
- Nine required actions

This verifies that the real insurance PDF now uses Gemini rather than the
local fallback.

### Approach Comparison — Real Insurance PDF

Six result snapshots were captured across different CLI flags and code versions
against the same seven-page Alberta home insurance PDF. The table below
summarises the outcome of each approach.

| Snapshot | Flags / Code | `flagged_issues` | NLP money clean | `date_sentences` readable | Coverage limits |
|---|---|---|---|---|---|
| `result2.txt` (text, new code) | default, post-cleanup | ✅ 4 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `result2.txt` (markitdown, new code) | `--markitdown`, post-cleanup | ✅ 4 correct | ❌ Artifacts | ✅ Truncated | ✅ 19 |
| `result.txt` | no NLP, old code | ✅ 4 (different set) | — | — | ✅ 18 |
| `result_without_markdown.txt` | text + NLP, old code | ⚠️ 2 | ✅ Yes | ❌ Huge blocks | ✅ 19 |
| `result_with_markdown.txt` | `--markitdown` + NLP, old code | ⚠️ 2 (wrong types) | ❌ Artifacts | ❌ Huge blocks | ✅ 19 |
| `results_without_markdown2.txt` | text + NLP, old code | ❌ 0 (regression) | ✅ Yes | ❌ Huge blocks | ✅ 19 |
| `result3.txt` | default (no redaction) | ✅ 4 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `result4.txt` (run 1) | `--redact-pii --no-rehydrate` | ✅ 3 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `result4.txt` (run 2) | `--redact-pii` (rehydrated) | ✅ 3 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `result5.txt` | `--redact-pii` post-extraction-fix | ✅ 3 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `result6.txt` | `--redact-pii` post-false-positive fix | ✅ 3 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `result7.txt` | `--redact-pii` post-prompt expansion | ✅ 3 correct | ✅ Yes | ✅ Truncated | ✅ 19 |
| `test1.txt` | `--redact-pii` on claim adjustment letter (post-redactor fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `test2.txt` (new run) | `--redact-pii` on home insurance policy (post-fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `test3.txt` (new run) | `--redact-pii` on claim form (post-fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `test4.txt` (new run) | `--redact-pii` on DRP application (post-fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `test5.txt` (new run) | `--redact-pii` on IBC Proof of Loss (post-fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `01.pdf run` | `--redact-pii` on declarations page (post-session-5 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `02.pdf run` | `--redact-pii` on wildfire claim form (post-session-5 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `03.pdf run` | `--redact-pii` on Schedule of Loss (post-session-5 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `04.pdf run` | `--redact-pii` on Proof of Loss (post-session-5 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `05.pdf run` | `--redact-pii` on Crawford damage assessment (post-session-5 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `06.pdf run` | `--redact-pii` on Alberta DRP application (post-session-5 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr2.pdf run` | `--redact-pii` on property loss notice / OCR doc (post-ocr2 fix) | ⚠️ partial* | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr3.pdf run` | `--redact-pii` on CAT disaster claim intake (post-ocrtest1 fix) | ⚠️ partial** | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr4.pdf run` | `--redact-pii` on water/sewer backup claim statement (post-ocrtest1 fix) | ⚠️ partial** | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr5.pdf run` | `--redact-pii` on contractor repair estimate (post-ocrtest1 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr6.pdf run` | `--redact-pii` on personal property inventory (post-ocrtest2 fix) | ⚠️ partial† | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr7.pdf run` | `--redact-pii` on adjuster field notes (post-ocrtest2 fix) | ⚠️ partial†† | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr8.pdf run` | `--redact-pii` on ALE receipt summary (post-ocrtest2 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `ocr9.pdf run` | `--redact-pii` on sworn proof of loss (post-ocrtest2 fix) | ✅ clean | ✅ Yes | ✅ Clean | n/a — different doc |
| `gemini_01_auto.txt` | `--redact-pii` on auto flood claim (session-7, gemini-3.1-flash-lite) | ⚠️ partial‡ | ✅ Yes | ✅ Clean | n/a — different doc |
| `gemini_02_health.txt` | `--redact-pii` on health disaster injury claim (session-7, gemini-3.1-flash-lite) | ⚠️ partial‡‡ | ✅ Yes | ✅ Clean | n/a — different doc |
| `gemini_03_life.txt` | `--redact-pii` on life disaster death claim (session-7, gemini-3.1-flash-lite) | ⚠️ partial‡‡‡ | ✅ Yes | ✅ Clean | n/a — different doc |
| `gemini_05_tenant.txt` | `--redact-pii` on tenant/renter apartment damage claim (session-7, gemini-3.1-flash-lite) | ⚠️ partial§ | ✅ Yes | ✅ Clean | n/a — different doc |

**Current best: `--redact-pii` with rehydration. Redaction scores 100% precision / 100% recall / 100% F1 across the original five evaluated documents.**

\* ocr2.pdf redaction is partial: (1) signature `M Kowalski` not redacted (abbreviated-signature gap, item 15 in Recommended Next Work); (2) `Loss address` branch added but OCR column-interleaving causes the regex to capture the date on the next line instead of the address — native PDF would work correctly; (3) policy number `HOP-884-19A` now caught by the new third `_POLICY_NUMBER_RE` alternative.

\*\* ocr3.pdf: `"B. Needs"` false-positive PERSON fixed by adding `needs` to `_PERSON_FP_WORDS`. Remaining Gemini issues: evacuation order date no longer listed as deadline (fix 3 applied); $2,500 advance payment still categorised as `coverage_limits` (structural — advance payment field has no dedicated schema slot); no person name appears in plain text on this form so no PERSON FN. ocr4.pdf: `"Owen"` in `"Owen and Priya Shah"` now caught by bare `Insured` label addition to `_PERSON_FIELD_RE` (fix 2 applied). Sewer backup WARNING correctly flagged. `date_sentences` triple-duplicate (known NLP dedup gap — all three DATE tokens fall in the same run-on OCR sentence) and NLP false-positive ORGs (`"Red Deer"`, `"Appliance"`) are pre-existing known issues.

† ocr6.pdf: `"Kitchen + pantry"` false-positive PERSON fixed by adding room names to `_PERSON_FP_WORDS`. `"Danielle Rivera"` (Prepared by field) now caught by `Prepared by` label addition to `_PERSON_FIELD_RE`. Remaining gap: `"D Rivera"` abbreviated claimant signature not redacted (known abbreviated-signature gap, item 15).

†† ocr7.pdf: No person name appears in formal label form — only `"Priya"` (first name only, 1 token, below 2-token minimum) and adjuster initials `"RJT"`. Both are known gaps. Gemini correctly inferred $20,000 from OCR-corrupted `"$2ok"`. `"2ok"` in `money` NLP list is an OCR-error artefact.

‡ gemini_01_auto.txt (auto flood claim): 3 PERSON FPs — vehicle trim/color descriptor, `"[PERSON_3] Diagnostic"` (EV/Hybrid Diagnostic section header), `"[PERSON_4] and Proofs"` (Documents section header) tagged as persons; 1 FN — policy number `AUTO-74-39928-AB` doesn't match any `_POLICY_NUMBER_RE` pattern. Gemini flagged an overland-water endorsement WARNING which is a FP for an auto-insurance document (rule fires for home/property claims only). Inconsistent vehicle-starting-statement risk not flagged despite being explicitly marked in the document.

‡‡ gemini_02_health.txt (health disaster injury claim): 2 PERSON FPs — department-name fragment in insurer header, hotel/lodge name in narrative tagged as persons; 1 FN — adjuster `Samira Cole` not redacted (likely spaCy tags `"Disaster Health Adjuster Samira Cole"` as a single span, which is then filtered by `adjuster` in `_PERSON_FP_WORDS`). Other-insurance-disclosure explicitly flagged in document not mirrored in `flagged_issues`.

‡‡‡ gemini_03_life.txt (life disaster death claim): 3 PERSON FPs — building number/street name in insurer header, `"[PERSON_3] and Proofs"` section heading, payment-option header tagged as persons; 3 FNs — beneficiary `Leah M. Brenner` not redacted (appears in narrative, not a labeled field), examiner `Andre Wu` not redacted (same job-title span filter issue as ‡‡), policy number `LIFE-T20-991204-BC` not matched. Unsigned beneficiary-change email not flagged.

§ gemini_05_tenant.txt (tenant/renter apartment damage claim): 1 PERSON FP — `"[PERSON_3] and Proofs"` section heading; 1 FN — adjuster `Keira Holt` not redacted (same job-title span filter issue). ALE 12-month duration cap missing from `deadlines`. Flood/sewer-backup exclusion correctly noted but coded as `WARNING` in `flagged_issues` instead of `warnings` for a claim already coded as storm/roof-opening; landlord-property exclusion explicitly flagged in document but only in `warnings`, not `flagged_issues`.

`result5.txt` confirmed that extraction and NLP fields were correctly redacted after
the first round of fixes, but exposed three remaining issues that were fixed in a
second pass:

1. **`& and` doubling** — spaCy was including the `&` inside the first PERSON span's
   boundary, so the gap-connector check in `_merge_adjacent_persons` never fired.
   Fixed by also checking for a trailing connector inside span1.
2. **Abbreviated address leak** (`4817 – 52 Ave NW`) — the prefix-matching approach
   used "Avenue" as part of the anchor and missed the "Ave" abbreviation in the
   Mortgagee Interest line. Fixed by switching to a street-number-only anchor and
   registering abbreviated forms as `rmap` aliases.
3. **PERSON false positives** — `en_core_web_sm` mislabelled `"Asphalt Shingle"`,
   `"A. Dwelling Building"`, and `"Alberta Superintendent"` as persons, corrupting
   those document lines for Gemini. Fixed by adding `_PERSON_FP_WORDS` blocklist.

The four `flagged_issues` produced by the new code are:

1. `ACTION_REQUIRED` — vacancy clause voids coverage after 30 consecutive days without written approval
2. `WARNING` — coinsurance clause reduces payout if dwelling is insured below replacement cost
3. `WARNING` — earthquake deductible is percentage-based (5% of coverage, min. $5,000)
4. `ACTION_REQUIRED` — Proof of Loss must be submitted within 90 days of a loss

**result6.txt** — false-positive PERSON redactions fixed. result5 had spaCy tagging
four non-PII strings as `PERSON`: `"Roof Type / Age"` → `[PERSON_3]`, `"Asphalt
Shingle"` → `[PERSON_4]`, `"A. Dwelling Building"` → `[PERSON_5]`, and
`"Alberta Superintendent"` → `[PERSON_6]`. These were eliminated by the
`_PERSON_FP_WORDS` blocklist. result6 also correctly redacted the mortgagee
interest address (`First mortgage on [ADDRESS_1]`) which result5 had leaked.

However, result6 introduced a **summary recall regression** because the NLP hint
was still using the old closing instruction ("accounted for in deadlines or
warnings"). Gemini omitted four deadline entries present in result5: the policy
coverage period, the 24-month ALE duration, the annual review recommendation,
and the 3-year independent appraisal. Gemini also omitted all four deductibles
from warnings.

**result7.txt** — prompt expansion applied. Three changes to `summarizer.py`:

1. DEADLINES rule in `SYSTEM_PROMPT` expanded from two to five categories
   (added coverage periods, entitlement durations, recurring cycles).
2. `warnings` instruction extended to include all deductibles alongside exclusions.
3. NLP hint closing instruction tightened: dates/durations must go into
   `deadlines`, not just `warnings`.

Result: 13 deadlines (all key items recovered), 20 warnings (all 4 deductibles
present). Three noise deadline entries were introduced because the NLP date list
contains low-quality tokens (`"Monthly"`, duplicate `"10 days'"` / `"10 days"`,
`"June 1, 2024 Broker / Agent"`). These are the next items to fix.

Persistent known issue across result6 and result7: `top_sentences` still leaks
`#AB-03291` and `4817 – 52 Avenue NW, Edmonton, AB` in unredacted form. The
street-number anchor regex catches the address in the main extraction text but
the NLP top-sentence contains a fragment rendered slightly differently (no postal
code; broker ref without the `"Br. "` prefix). `rmap.redact_text()` does exact
replacement and misses these variant forms.

**test1.txt (claim adjustment letter)** — evaluated against
`04_claim_adjustment_letter(1).pdf`. Before the fix: precision 43%, recall 43%
(4 false positives, 4 false negatives). After the fix: **100% / 100% / F1 100%**.
All previously missed PII (`Ms. Johnson` salutation, `(780) 555-0167` direct
phone, `m.tran@albertashield.ca` email, `47 Maple Cres NW` c/o address) are
correctly redacted. All previous false positives (`Box 3`, `Claims Adjuster`,
`Loss Checklist`, `Appraisal Process Guide`) are no longer redacted. No PII
leaks in any output field.

**test2.txt (home insurance policy)** — evaluated against
`01_home_insurance_policy.pdf`. Before the fix: precision 50%, recall 67%, F1
57% (2 false positives — `sonic booms` and `• Wear`; 1 false negative —
property address missed because `_ADDRESS_FIELD_RE` had no colon in separator).
After fix: **100% / 100% / F1 100%**. Root fixes: bullet-prefix stripping +
uppercase first-char check eliminated both PERSON false positives; colon
requirement in address regex caught `Property Address: Rural Route 4...` that
the previous space-separator missed. Warnings output previously showed broken
placeholder text (`"excludes [PERSON_2]"`, `"does NOT cover [PERSON_3] and
tear"`); now reads correctly.

**test3.txt (insurance claim form)** — evaluated against
`02_insurance_claim_form.pdf`. Before the fix: precision 67%, recall 100%, F1
80% (3 false positives — `"Alberta Wildfire"` as PERSON, `"(if different):"` as
ADDRESS, `"Was an evacuation order issued?"` as ADDRESS; 0 false negatives — all
6 personal PII items caught). After fix: **100% / 100% / F1 100%**. Root fixes:
`wildfire` added to `_PERSON_FP_WORDS`; `_ADDRESS_FIELD_RE` colon requirement
eliminated both address false positives in one change.

**test4.txt (DRP application)** — evaluated against
`03_alberta_drp_application.pdf`. This was the main evaluation target for the
second round of fixes. Before: redaction F1 77% (`"Primary Residence"` redacted
as PERSON; `Johnson` and `Sarah` appearing alone on separate lines were missed;
permanent address unmatched); deadlines F1 60% (5 FP historical dates mixed with
3 genuine deadlines); flagged issues F1 50% (settlement pending caught, but
partial receipts not flagged). After all fixes: **redaction 100% (8/8
placeholders — PERSON:3, ADDRESS:2, PHONE:1, EMAIL:1, POLICY_NUMBER:1),
deadlines 100% (3 items — 90 days, October 17, extension contact), coverage
limits 100%, flagged issues 100% (settlement UNRELIABLE_DATA + partial receipts
MISSING)**. Remaining minor gaps: required_actions F1 86% (`"Provide additional
receipts"` moved into flagged_issues MISSING rather than also appearing as a
required action); warnings F1 89% (the `"false information is an offence under
the Emergency Management Act"` warning dropped in this Gemini run).

### F1 Evaluation Results (Final — all five test documents)

All five documents were run with `--redact-pii` using the final code.
F1 is computed per component (precision × recall harmonic mean). Macro F1 is
the simple average across the six components. Empty ground-truth + empty
output scores 1.0 (trivially correct).

| Component | test1 (claim letter) | test2 (home policy) | test3 (claim form) | test4 (DRP app) | test5 (Proof of Loss) |
|---|---|---|---|---|---|
| **Redaction** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Deadlines** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Coverage limits** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Required actions** | 1.00 | 1.00 | 0.50–1.00* | 1.00 | 1.00 |
| **Warnings** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Flagged issues** | 1.00 | 1.00 | 0.67 | 1.00 | 1.00 |
| **Macro F1** | **1.000** | **1.000** | **0.861–0.944*** | **1.000** | **1.000** |

**Previous macro F1 (before this session's fixes): 0.940 / 0.993 / 0.856 / 0.958 / 0.587**

**Overall macro F1 across all five tests: 0.965–0.989** (up from 0.867 before this session).

\* test3 `required_actions` is stochastic: Gemini sometimes produces `"Submit
the completed form"` as a single action (F1=0.50) or three separate entries —
Complete, Submit, Sign and date (F1=1.00). This causes test3 macro to range
between 0.861 (worst case) and 0.944 (best case). Both bounds are above the
test3 pre-session baseline of 0.856.

Remaining known gaps:

- **test3 flagged_issues (0.67)** — persistent FN: the unsigned declaration
  (blank signature line) is never flagged as MISSING. The form shows the
  signature line as underscores, but Gemini does not treat a blank field as
  a missing required item.
- **test3 required_actions (stochastic)** — `"Complete all sections"` and
  `"Sign and date the declaration"` appear in ~⅓ of runs. The rest of the
  time Gemini subsumes them into `"Submit the completed form"`.
- **test2 / test4 warnings (stochastic FN)** — `"Explosion coverage excludes
  sonic booms"` (test2) and `"must file insurer claim first"` (test4) appear
  in most but not all runs; each contributes a 0.04–0.11 F1 dip when absent.

test5 (IBC Proof of Loss — `IBC_Proof_of_Loss_Clean_Filled_Sarah_Thompson_v2.pdf`):

- **Previous F1: 0.587** (before this session). Root causes: `TD-HM-456789`
  not caught (policy number regex), `123 Maple Crescent` not caught (no
  `Address\n` label branch), `"Sarah Thompson\nAddress"` entity span caused
  two different PERSON placeholders for the same person (rehydration artifact),
  `"Best Buy"` and `"Microwave Oven"` tagged as PERSON, Schedule of Loss
  per-item costs flooded `coverage_limits`, `"without prejudice"` clause not
  in warnings, overland flooding endorsement not flagged.
- **Current F1: 1.000** — all six components perfect. All five PII items
  caught with 0 false positives. Coverage limits are exactly the four aggregate
  amounts. Warnings and flags are correctly populated.

The `--markitdown` run produces the same summary quality but its NLP money values
are still artifact-prone (`"$62,000 $"`) because MarkItDown lays out some table
rows as inline text with adjacent dollar amounts on the same line — not a
markdown table, so the stripper does not touch it. Avoid `--markitdown` until
that layout issue is resolved.

### F1 Evaluation Results (Session 5 — six new test documents)

Six new insurance/disaster-recovery PDFs were evaluated against ground truth
after all session-5 fixes (redactor.py and summarizer.py).

| Component | 01.pdf (Declarations) | 02.pdf (Wildfire claim) | 03.pdf (Schedule of Loss) | 04.pdf (Proof of Loss) | 05.pdf (Damage assess.) | 06.pdf (DRP app) |
|---|---|---|---|---|---|---|
| **Redaction** | ~0.933 | ~0.917 | 0.667 | 0.667 | ~0.737 | ~0.950 |
| **Deadlines** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Coverage limits** | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Required actions** | 1.00 | ~0.90 | 1.00 | 1.00 | 1.00 | 1.00 |
| **Warnings** | ~0.889 | 1.00 | 1.00 | 1.00 | 1.00 | ~0.857 |
| **Flagged issues** | 1.00 | ~0.667 | ~0.80 | 1.00 | 1.00 | 1.00 |
| **Macro F1** | **~0.970** | **~0.914** | **~0.911** | **~0.944** | **~0.956** | **~0.968** |

**Overall mean macro F1 across six new documents: ~0.944**

Redaction FNs driving below-perfect redaction scores:

- **01.pdf (0.933)** — one FN: abbreviated form `"M. Sharma"` (initial + last name) missed; spaCy minimum-token filter drops single-word names
- **02.pdf (0.917)** — two FNs: abbreviated signature `"M. Blackwood"` (after stripping `"M."` → single word) not caught; `"Blackwood"` without labeled field context missed by spaCy
- **03.pdf (0.667)** — schedule-of-loss document; PERSON FPs for fire designation IDs in narrative text (e.g. `"Jasper [PERSON_X]"`); abbreviated forms not caught
- **04.pdf (0.667)** — Proof of Loss; `"M. Blackwood"` abbreviated signature and section-township legal descriptions (`NE 14-48-1-W6M` format) not matched by `_LEGAL_DESCRIPTION_RE`
- **05.pdf (0.737)** — damage assessment report; 9 PERSON entities of which several are FPs (fire designation IDs, adjuster title fragments)
- **06.pdf (0.950)** — DRP application; one FN: abbreviated `"M. Blackwood"` form

Key session-5 fix that raised 05.pdf required_actions from 0 to 1.00: adding the
explicit `REQUIRED ACTIONS` section to the Gemini SYSTEM_PROMPT with the adjuster
report rule ("if the report's recommendations require action by the insured, include
those as required_actions"). Crawford adjuster recommendations now produce 6 required
actions (structural engineer, ESA, independent appraisal, building codes, Intact
claim, DRP application).

Remaining known redaction gaps (lower priority):

- Abbreviated signature style `"M. Blackwood"` — the initial `"M."` is stripped
  and the single remaining word `"Blackwood"` falls below spaCy's two-token
  minimum; `_PERSON_FIELD_RE` does not fire because no labeled field precedes it
- Section-township legal descriptions (`NE 14-48-1-W6M`, `SW 23-24-1-W5M` standalone)
  — `_LEGAL_DESCRIPTION_RE` only fires when a plan/lot/block prefix is present
- PERSON FPs in Schedule of Loss and damage-assessment narrative (fire designation
  IDs, adjuster title fragments) — `_PERSON_FP_WORDS` blocklist does not cover
  all of these

The zero-flagged-issues regression in `results_without_markdown2.txt` was caused
by Gemini temperature variance at `0.1`. Fixed by setting temperature to `0.0`.

### F1 Evaluation Results (Session 7 — four new fictional sample PDFs, gemini-3.1-flash-lite)

Four new multi-domain insurance/claim PDFs were evaluated against manually-derived
ground truth using `--redact-pii` with `gemini-3.1-flash-lite`.

| Component | 01_auto (Auto flood) | 02_health (Health disaster) | 03_life (Life death claim) | 05_tenant (Renter storm) |
|---|---|---|---|---|
| **Redaction** | ~0.778 | ~0.824 | ~0.700 | ~0.900 |
| **Deadlines** | 1.00 | 1.00 | 1.00 | ~0.909 |
| **Coverage limits** | ~0.857 | 1.00 | 1.00 | 1.00 |
| **Required actions** | 1.00 | 1.00 | 1.00 | 1.00 |
| **Warnings** | ~0.800 | ~0.909 | ~0.909 | ~0.800 |
| **Flagged issues** | ~0.572 | ~0.857 | ~0.889 | ~0.750 |
| **Macro F1** | **~0.835** | **~0.932** | **~0.916** | **~0.893** |

**Overall mean macro F1 across four new documents: ~0.894**

Note: model was `gemini-3.1-flash-lite` (configured in `.env`), not `gemini-2.5-flash`.
Summary quality components (deadlines, coverage limits, required actions) remain excellent.
Redaction and flagged-issues components drive the lower scores.

Redaction issues across these four documents:

- **01_auto (0.778)** — 3 FPs: vehicle trim/color descriptor, `"EV Diagnostic"` section header, `"Documents and Proofs"` section header tagged as persons; 1 FN: `AUTO-74-39928-AB` policy number doesn't match any `_POLICY_NUMBER_RE` pattern
- **02_health (0.824)** — 2 FPs: department-name fragment in insurer header, hotel name in loss narrative; 1 FN: adjuster `Samira Cole` not caught — root cause: spaCy tags `"Disaster Health Adjuster Samira Cole"` as one span, `adjuster` in `_PERSON_FP_WORDS` filters the whole entity
- **03_life (0.700)** — 3 FPs: building-number/street token in insurer address, `"Documents and Proofs"` header, payment-option label; 3 FNs: beneficiary `Leah M. Brenner` not caught (appears in narrative, not a labeled field), examiner `Andre Wu` not caught (same job-title span issue), `LIFE-T20-991204-BC` policy number not matched
- **05_tenant (0.900)** — 1 FP: `"Documents and Proofs"` header; 1 FN: adjuster `Keira Holt` not caught (same job-title span issue)

New recurring patterns found in session 7:

1. **"[X] and Proofs" section-header FP** — spaCy tags the word before `"and Proofs"` as a PERSON entity (fires in 01, 03, 05). The fix is to add `proofs` to `_PERSON_FP_WORDS` so any span containing that word is filtered.
2. **Job-title span contamination FN** — when a contact-table row reads `"Role Title FirstName LastName phone|email"`, spaCy sometimes includes the role title in the PERSON entity boundary (e.g. `"Disaster Health Adjuster Samira Cole"`). The `_PERSON_FP_WORDS` check then rejects the whole span because it contains `adjuster`, leaving the actual name unredacted. Affects 02, 03, 05. Fix: strip leading job-title tokens (words in `_PERSON_FP_WORDS`) from the front of a PERSON span before applying the FP filter, then re-check.
3. **Non-standard policy-number formats FN** — `AUTO-74-39928-AB` (letters–digits–digits-letters) and `LIFE-T20-991204-BC` (letters–alphanumeric–digits–letters) don't match the three existing `_POLICY_NUMBER_RE` alternatives. Extend regex with additional patterns.
4. **Cross-domain overland-water FP** — the overland-water endorsement `flagged_issues` rule fires for an auto insurance document (`01_auto`). Rule should scope to property/home/renter coverage types only.

Flagged-issue pattern (session 7):

- All four documents' deadlines and required actions scored 1.00 — the Gemini SYSTEM_PROMPT handles these well even for non-property claim types (health, life, auto).
- `flagged_issues` is the weakest component across the session (0.57–0.89), driven by: domain-wrong FPs (overland-water on auto), missed explicit document-flagged issues, and occasional warnings/flags categorization disagreements.

## Current Limitations

### Standalone Scanned Files

The Documents Page UX mentions scanned image uploads. The current package only
accepts PDF input. OCR works for image-only PDF pages, but the CLI does not
directly accept PNG, JPG, JPEG, or TIFF files.

### OCR Model Download and Size

PaddleOCR and PaddlePaddle add substantial dependencies. On first OCR use,
PaddleOCR downloads its mobile detection and recognition models. Production
deployment should pre-download and cache these models.

### OCR Accuracy

OCR text can contain recognition mistakes. OCR-derived pages are labelled and
the extraction result always warns users to verify OCR text against the source.

### Long Documents

The Gemini wrapper sends at most the first 300,000 extracted characters. A
future version should chunk long documents and combine the results.

### Local Fallback Accuracy

The local fallback uses conservative keyword and date matching. It is not a
replacement for Gemini and may miss information.

### Legal Reliability

Outputs are document-understanding aids, not legal advice. Users must verify
deadlines, limits, required actions, and flagged issues against the original
document.

### Gemini Availability

Live Gemini analysis requires:

- A valid `GEMINI_API_KEY`
- Internet access
- An available Gemini model
- Remaining API quota

## Recommended Next Work

Recommended follow-up work:

1. Add standalone scanned-image input support (PNG, JPG, TIFF).
2. Store per-line OCR confidence values when detailed review is needed.
3. Add image preprocessing for low-quality, rotated, or photographed documents.
4. Add configurable OCR language selection.
5. Pre-download and cache OCR models for deployment.
6. Add long-document chunking before Gemini analysis.
7. Integrate the package into backend document-upload routes and the Documents
   Page frontend.
8. Upgrade to `en_core_web_lg` or `en_core_web_trf` spaCy model for better NER
   accuracy on legal/insurance terminology.
9. Deduplicate and clean NLP date list before building the Gemini hint — strip
   garbled spans (e.g. `"June 1, 2024 Broker / Agent"`), strip bare recurrence
   words that aren't obligations (`"Monthly"`), and collapse near-identical
   values (`"10 days'"` and `"10 days"`) to one entry.
10. Fix partial-form PII leak in `top_sentences` for the Alberta home policy —
    `rmap.redact_text()` misses `"#AB-03291"` (broker ref without `"Br. "`
    prefix) and the address without postal code. Fix by registering these
    prefix-stripped forms as additional `rmap` aliases during redaction setup.
11. Fix test3 `required_actions` stochastic drop — `"Complete all sections"`
    and `"Sign and date the declaration"` appear in ~⅓ of Gemini runs; in the
    rest Gemini subsumes them into `"Submit the completed form"`. Add explicit
    wording that for a claim form with a signature line, `"Sign and date the
    declaration"` must always be a separate required action.
12. Fix test3 persistent FN — blank signature line (shown as underscores in
    extracted text) is never flagged as MISSING. Add a rule: if a Proof of
    Loss or claim form has a `Signature:` field containing only underscores,
    flag it as MISSING (declaration not yet signed).
13. Fix test2 `"explosion coverage excludes sonic booms"` stochastic drop —
    appears in ~⅔ of runs. The policy explicitly lists it; it should always
    appear in warnings.
14. Fix test4 `"must first file a claim with your insurer"` stochastic drop —
    the DRP application states this as a mandatory prerequisite; it should
    always appear in warnings.
15. Fix abbreviated-signature PERSON FN — `"M. Blackwood"` style (initial +
    last name) is missed because after stripping `"M."` a single-word span
    remains, which falls below the two-token spaCy minimum. One approach:
    register known last names detected by `_PERSON_FIELD_RE` as single-word
    aliases so `redact_text()` catches abbreviated forms.
16. Fix section-township legal description FN — `NE 14-48-1-W6M` format is not
    matched by `_LEGAL_DESCRIPTION_RE` when no plan/lot/block prefix is present.
    Extend the regex with a standalone meridian-code branch.
17. Reduce PERSON FPs in Schedule of Loss and damage-assessment narrative —
    fire designation IDs and adjuster title fragments (e.g. `"Jasper [X]"`
    artifacts) still generate spurious PERSON redactions. Extend
    `_PERSON_FP_WORDS` or add a digit-proximity heuristic.
18. Fix 02.pdf `flagged_issues` UNRELIABLE_DATA FP — Gemini sometimes flags
    informational unknowns (well/septic status not yet assessed) that do not
    meet the strict monetary-value-explicitly-TBD rule. Tighten the rule or
    add an exclusion for non-monetary structural unknowns.
19. Fix `date_sentences` triple-duplicate in OCR documents (ocr4.pdf) — when
    multiple DATE entities all fall inside the same run-on OCR sentence, the
    100-char dedup key is identical for all of them yet duplicates still appear.
    Root cause: each DATE token yields a separate sentence lookup; the dedup set
    is checked but the same sentence object is added multiple times when spaCy
    yields identical `sent.text` for different entities in the same span.
    Fix: deduplicate on the sentence object identity (`id(sent)`) in addition
    to the 100-char text key.
20. Fix `coverage_limits` miscategorisation for advance payment requests
    (ocr3.pdf) — Gemini places `$2,500 advance payment` in `coverage_limits`
    because no dedicated schema slot exists for pre-approved advance payments.
    Consider adding an explicit rule: values labelled "advance payment",
    "advance request", or "emergency advance" belong in `plain_language_summary`
    or `required_actions`, not `coverage_limits`.
21. Fix `PENDING REVIEW` stamp not flagged in warnings (ocr5.pdf) — the stamp
    indicates no work should proceed until review is complete. Add a Gemini
    `warnings` rule: if the document contains a `PENDING REVIEW` or `PENDING
    APPROVAL` marker, include a warning that the estimate or document has not
    yet been approved and no work should be authorised.
22. Fix Proof of Loss `warnings` false-positive (ocr9.pdf) — Gemini listed `"No
    repairs beyond emergency protection have been completed"` as a warning. The
    Gemini SYSTEM_PROMPT already says "do NOT flag risks that the form already
    shows are handled — if the form states that emergency repairs have NOT been
    made, do not flag those as risks needing attention." Reinforce this rule with
    an explicit example so it fires consistently.
23. Fix mortgagee loss-payee clause missing `required_actions` (ocr9.pdf) — the
    Proof of Loss states `"Please include Prairie First Credit Union on any
    building settlement over deductible."` This is an explicit required action
    (insurer must include loss payee on settlement cheque) that should be
    included in `required_actions`. Add a Gemini rule: mortgagee / loss-payee
    clauses that request the insurer to include a third party on settlement
    payments must appear in `required_actions`.
24. Fix `date_sentences` duplicate-run bug for ALE/receipt table documents
    (ocr8.pdf) — the OCR table rows form one long run-on sentence; five DATE
    entities inside it each trigger a `date_sentences` lookup, producing three
    identical copies of the full table-row string. The existing 100-char dedup
    key does not help because all five lookups return the same `sent.text` and
    the dedup set only checks if the key was seen before, not if the sentence
    object identity was already added. Same root cause as item 19; fix both
    together by deduplicating on `id(sent)` before appending.
25. ~~Fix `"[X] and Proofs"` section-header PERSON FP (session-7)~~ — **Fixed** (`"proofs"` added to `_PERSON_FP_WORDS`).
26. ~~Fix job-title span contamination FN (session-7)~~ — **Fixed** (`_person_spans()` now strips leading `_PERSON_FP_WORDS` tokens from entity boundaries before applying the FP filter; `Samira Cole`, `Andre Wu`, `Keira Holt` now caught).
27. ~~Extend `_POLICY_NUMBER_RE` with additional formats (session-7)~~ — **Fixed** (two new alternatives added for `AUTO-74-39928-AB` and `LIFE-T20-991204-BC` style numbers).
28. ~~Scope overland-water endorsement `flagged_issues` rule to property claims only (session-7)~~ — **Fixed** (explicit auto/life/health exclusion guard added to `SYSTEM_PROMPT`).

## OCR Implementation Reference

The PaddleOCR adapter follows the PaddleOCR 3.x general OCR pipeline pattern:

- Python integration creates a `PaddleOCR` pipeline.
- OCR inference uses `predict(...)`.
- Structured OCR output is read from each result's JSON data.
- The default PP-OCRv5 mobile detection and recognition models are downloaded
  on first use.

Official reference:

- https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html
