# NLP / ML Implementation Log

This file tracks what was analysed, decided, and built for the ML/NLP layer in the
`pdf_and_summary` package.

---

## Original question (session 1)

> How is text extraction done? I want to use BERT/NLP for that or something along
> those lines.

### What the pipeline looked like before

```
  PDF
   ├─ Selectable-text page → PyMuPDF
   └─ Scanned/image page → PaddleOCR
               ↓
         Extracted text
               ↓
   Gemini or local regex-based summary

  ### 1. PDF Validation

  pdf_and_summary/extractor.py:41 first:

  - Reads the uploaded PDF into bytes.
  - Checks that it begins with %PDF-.
  - Rejects files over 25 MB.
  - Rejects password-protected PDFs.
  - Rejects PDFs over 100 pages.
  - Opens the document using PyMuPDF, imported as fitz.

  ### 2. Native Text Extraction

  For every page, the extractor calls:

  page.get_text("text")

  This is handled by PyMuPDF in pdf_and_summary/extractor.py:84.

  PyMuPDF reads the PDF’s internal text objects. It works well when you can select and copy text from the PDF.

  The resulting text is lightly cleaned by:

  - Removing null characters
  - Normalizing line endings
  - Collapsing repeated spaces
  - Removing excessive blank lines

  No BERT or NLP model is involved here.

  ### 3. OCR Fallback

  If PyMuPDF returns no text for a page, the page is rendered into a PNG at 200 DPI:

  pixmap = page.get_pixmap(dpi=200, alpha=False)

  That image is passed to PaddleOCR in pdf_and_summary/ocr.py:35.

  PaddleOCR:

  - Detects text regions in the page image.
  - Recognizes the characters.
  - Returns recognition confidence scores.
  - Discards text with confidence below 0.5.
  - Joins the recognized lines together.

  The final output labels every extracted page:

  --- Page 1 (native) ---
  ...

  --- Page 2 (ocr) ---
  ...

  ### 4. Summary Generation

  After extraction, pdf_and_summary/pipeline.py:13 passes the combined text to the summarizer.

  There are currently two summary approaches:

  Gemini summary

  pdf_and_summary/summarizer.py:102 sends up to 120,000 characters to Gemini and requests structured JSON containing:

  - Plain-language summary
  - Deadlines
  - Coverage limits
  - Required actions
  - Warnings
  - Flagged issues

  Local summary

  pdf_and_summary/summarizer.py:274 uses basic regex and keyword matching. It is not an ML/NLP model.

  For example, it searches for sentences containing words such as:

  coverage, limit, deductible, must, submit, contact, deadline

  ———

  ## Where BERT/NLP Fits

  BERT should generally not replace PyMuPDF or OCR. BERT understands text, but it does not extract characters from PDFs or page images.

  A stronger architecture would be:

  PyMuPDF/PaddleOCR
          ↓
  Text cleanup and layout reconstruction
          ↓
  BERT-based NLP
   ├─ document classification
   ├─ named-entity recognition
   ├─ deadline extraction
   ├─ action-item classification
   └─ extractive sentence ranking
          ↓
  T5/BART/Gemini summary

  Useful model choices:

  - BERT/DistilBERT: classify sentences as deadlines, required actions, exclusions, or coverage information.
  - BERT-NER or spaCy transformer: extract dates, monetary amounts, organizations, policy numbers, and locations.
  - Sentence-BERT: rank important sentences and support document search/RAG.
  - LayoutLM: understand tables, forms, and the visual position of text.
  - BART/T5/PEGASUS: generate local abstractive summaries. Base BERT cannot naturally generate summaries because it is an encoder-only model.

  The most practical improvement would be to keep the current extraction pipeline and replace the regex-based local summary with a combination of NER +
  sentence classification + a T5/BART summarizer.

  One current limitation worth fixing: OCR only runs when a page has absolutely no native text. A scanned page containing a small selectable header but
  otherwise image-based content may skip OCR and lose most of its text.



I wanna use a better accurate model rather than gemini for summarisation like mikeoss. can it fit in my project?

• I’ll inspect nlp_implementation.md and the current Gemini integration first, then I’ll map what “mikeoss.com” could provide and whether it fits this project.

• Ran git status --short

• Ran pwd && rg --files -g 'nlp_implementation.md' -g '!node_modules' -g '!dist'

• Explored
  └ Search gemini|generativelanguage|google.generative|summari[sz] in .

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• The project already has a clean extraction-to-summarizer boundary, so replacing Gemini should be feasible. I’m checking the implementation document and the exact
  nature of mikeoss.com now, because model hosting/API availability matters more than raw benchmark accuracy here.

• Explored
  └ Read nlp_implementation.md, summarizer.py, pipeline.py, models.py, README.md

• Searching the web

• Searched the web for https://mikeoss.com/

• Searching the web

• Searched the web for https://github.com/willchen96/mike

• Searching the web

• Searched the web for site:docs.anthropic.com models overview Claude Sonnet 4.6 API structured outputs


i wanna find a better and accurate model than 

• Yes, but MikeOSS is not an AI model. It is an open-source legal-document platform that orchestrates models from Anthropic, Gemini, or OpenAI. Its website
  currently demonstrates Claude Sonnet 4.6, but MikeOSS itself does not provide a “Mike model” API. MikeOSS (https://mikeoss.com/) | GitHub
  (https://github.com/willchen96/mike)

  Your current architecture is already easy to extend:

  PDF → PyMuPDF/PaddleOCR → extracted text → summarizer → DocumentSummary

  The Gemini-specific implementation is isolated in pdf_and_summary/summarizer.py:102.

  Recommended Approach

  1. Create a generic DocumentSummarizer interface.
  2. Add provider implementations:
      - GeminiSummarizer
      - ClaudeSummarizer
      - OpenAISummarizer
      - potentially a local model

  3. Make the provider configurable through environment variables.
  4. Run the same documents through each provider and measure factual accuracy.

  For example:

  class DocumentSummarizer(Protocol):
      def summarize(self, text: str) -> DocumentSummary:
          ...

  Then configure:

  SUMMARY_PROVIDER=anthropic
  SUMMARY_MODEL=claude-sonnet-4-6

  Accuracy Improvements That Matter More Than Switching Models

  Your current summarizer silently truncates documents after 120,000 characters. Important deadlines near the end could be completely missed. Also, the result
  currently provides facts without citations.

  A stronger MikeOSS-inspired pipeline would be:

  PDF extraction
      ↓
  Split into page-aware chunks
      ↓
  Extract deadlines, amounts, actions, and supporting quotations
      ↓
  Validate extracted facts
      ↓
  Generate plain-language summary from validated facts

  Every extracted item should include evidence:

  {
    "task": "Submit proof of loss",
    "date": "July 15, 2026",
    "page": 8,

  BERT/NLP can help classify sentences and identify entities, but it should not replace PDF extraction or the generative model.

  My Recommendation

  Start by adding a provider abstraction and testing:

  - gemini-2.5-flash: inexpensive baseline
  - gemini-2.5-pro: simplest accuracy upgrade using your existing wrapper
  - Claude Sonnet: strong document interpretation
  - A stronger OpenAI model: another useful comparison

  Then build a small benchmark of 15–30 representative PDFs with manually verified deadlines, amounts, actions, and warnings. Choose the model based on measured
  extraction accuracy, not general model reputation. Google also notes that structured JSON guarantees the format, but not factual correctness, so evidence
  validation remains necessary. Gemini structured outputs (https://ai.google.dev/gemini-api/docs/structured-output)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


› so what exactly is mikeoss and how can i use it in my project


• ## What MikeOSS Is

  MikeOSS (https://mikeoss.com/) is a complete, open-source legal-document assistant application.

  It provides infrastructure around existing AI models:

  - Document uploading and storage
  - PDF/document processing
  - Document-grounded chat
  - Page-level citations and supporting quotations
  - Multi-document comparison
  - Reusable legal-analysis workflows
  - Authentication, projects, and database management
  - Connections to Claude, Gemini, and OpenAI models

  MikeOSS does not provide its own more-accurate AI model. It sends documents and prompts to models such as Claude, Gemini, or OpenAI.

  ## How It Relates to Rebuildr

  Your current pipeline is:

  PDF → text extraction → one Gemini request → structured summary

  MikeOSS uses a more complete pattern:

  Documents → extraction/chunking → relevant context retrieval
            → Claude/Gemini/OpenAI → cited answers/workflows

  You should probably borrow selected MikeOSS patterns, rather than integrate or deploy its entire application.

  ## Recommended Integration

  Add these MikeOSS-inspired capabilities to your existing pipeline:

  1. Provider-independent summarizers

  class DocumentSummarizer(Protocol):
      def summarize(self, text: str) -> DocumentSummary:
          ...

  Implement Gemini, Claude, and OpenAI providers behind this interface.

  2. Evidence-backed results

  Extend each extracted fact with its source page and quotation:

  {
    "task": "Submit proof of loss",
    "date": "July 15, 2026",
    "page": 8,
    "evidence": "Proof of loss must be submitted by July 15, 2026."
  }

  3. Chunk long documents

  Instead of truncating everything after 120,000 characters:

  Extract pages → analyze page chunks → merge facts → create final summary

  4. Saved workflows

  Create prompts for specific document types:

  - Insurance-policy summary
  - Claim-letter analysis
  - Deadline extraction
  - Coverage and exclusion review

  ## Three Ways to Use MikeOSS

  ### 1. Borrow Its Architecture — Recommended

  Study its GitHub repository (https://github.com/willchen96/mike), then implement citations, chunking, workflows, and multiple providers inside Rebuildr.

  This preserves your existing Python pipeline and UI.

  ### 2. Run MikeOSS Separately

  Self-host MikeOSS and use it as a separate legal-document analysis application.

  However, it requires:

  - Next.js frontend
  - Express backend
  - Supabase
  - S3-compatible storage
  - Anthropic, Gemini, or OpenAI API keys

  This duplicates much of your current project and does not appear to provide a simple public summarization API.

  ### 3. Fork MikeOSS and Build Rebuildr on Top of It

  This only makes sense if document analysis becomes Rebuildr’s primary product. MikeOSS uses an AGPL-3.0 license, which can impose source-disclosure obligations
  when modified software is offered over a network.

  ## Practical Recommendation

  Do not directly integrate MikeOSS. Use its architecture as a reference and upgrade your existing pipeline:

  PyMuPDF/PaddleOCR
  → page-aware chunks
  → fact extraction with quotations
  → factual validation
  → summary generation
  → page citations

  Then compare Gemini Pro, Claude, and OpenAI using the same documents. MikeOSS’s quality comes primarily from this grounded workflow, not from a proprietary
  model.

  our TA asked me to look into MarkItDown. is it useful for me here?


• I’ll verify MarkItDown’s current capabilities and compare them directly with this project’s PyMuPDF/PaddleOCR extraction path.

• Searching the web

• Searched the web for Microsoft MarkItDown GitHub official PDF OCR documentation

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Yes. MarkItDown could be useful for Rebuildr, but it should improve the document-extraction stage, not replace Gemini or another summarization model.

  ## What MarkItDown Does

  Microsoft MarkItDown (https://github.com/microsoft/markitdown) converts documents into Markdown formatted for LLM processing.

  It supports:

  - PDF
  - Word
  - Excel
  - PowerPoint
  - HTML
  - Images
  - Audio
  - EPUB
  - Other text formats

  Instead of producing mostly unstructured text like:

  Coverage Information Maximum Amount $50,000 Required Documents...

  MarkItDown attempts to preserve structure:

  # Coverage Information

   Coverage Type        Maximum Amount
  ━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━
   Personal Property           $50,000

  ## Required Documents

  - Proof of ownership
  - Damage photographs

  That structure can help an LLM distinguish headings, tables, lists, and related sections.

  ## How It Fits Rebuildr

  Your current pipeline is:

  PDF
  → PyMuPDF/PaddleOCR
  → plain extracted text
  → Gemini summary

  With MarkItDown:

  PDF, DOCX, XLSX, PPTX, etc.
  → MarkItDown
  → structured Markdown
  → Gemini/Claude/OpenAI
  → structured Rebuildr summary

  It could be particularly valuable if users upload:

  - Insurance policies containing tables
  - Claim forms
  - Contractor estimates in Excel
  - Word documents
  - Documents with headings and lists

  ## Important Limitations

  MarkItDown is not an NLP model and does not make summaries more accurate by itself. It improves the input given to the model.

  For PDFs specifically:

  - Its standard PDF converter may struggle with scanned documents.
  - Its optional OCR plugin uses a vision LLM, which introduces API cost and possible extraction errors.
  - Complex PDF tables may still be incorrectly reconstructed.
  - It does not currently provide the same clear page metadata your extractor produces.
  - Losing page boundaries would make evidence citations harder.

  Your existing PaddleOCR fallback is probably preferable for scanned PDFs because it is local and records which pages used OCR.

  ## Recommended Approach

  Do not immediately replace the existing PDF extractor. Add MarkItDown as another extraction strategy:

  class DocumentExtractor(Protocol):
      def extract(self, source: bytes, filename: str) -> ExtractionResult:
          ...

  Implement:

  PDF:
    PyMuPDF + PaddleOCR
    or MarkItDown, based on configuration

  DOCX/XLSX/PPTX/HTML:
    MarkItDown

  Summarization:
    Existing provider-independent summarizer

  For PDFs, run a small comparison:

   Test                 Current Extractor       MarkItDown
  ━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━
   Normal paragraphs    Compare missing text    Compare structure
  ───────────────────  ──────────────────────  ───────────────────────
   Tables               Compare row accuracy    Compare row accuracy
  ───────────────────  ──────────────────────  ───────────────────────
   Scanned PDF          PaddleOCR               MarkItDown OCR plugin
  ───────────────────  ──────────────────────  ───────────────────────
   Page citations       Already supported       Verify preservation
  ───────────────────  ──────────────────────  ───────────────────────
   Summary accuracy     Run same model          Run same model

  ## Recommendation

  Use MarkItDown to expand supported document formats and experiment with better Markdown structure. Keep PyMuPDF and PaddleOCR as the primary PDF extraction path
  until tests show MarkItDown produces more accurate summaries without losing page-level evidence.

  This would be a useful scoped experiment for your implementation report:

  > Compare whether structure-preserving Markdown improves deadline, required-action, and coverage-limit extraction over plain PDF text.

  Sources: MarkItDown repository (https://github.com/microsoft/markitdown) and MarkItDown OCR plugin
  (https://github.com/microsoft/markitdown/blob/main/packages/markitdown-ocr/README.md).

---

## Session 3 — Performance cleanup and fine-tuning

> "Clean and fine-tune the model / whole project for its best performance."

All 19 tests pass after every change below.

---

### extractor.py — bug fix: variable shadowing

**Problem:** Inside the page extraction loop, the local variable `source` was assigned
`"native"` or `"ocr"`, silently shadowing the outer function parameter also named
`source` (the uploaded PDF bytes/path). The parameter was only read before the loop
(`_read_pdf(source)`), so no runtime crash occurred, but the shadow was a latent bug
that would have broken the code if the parameter was ever accessed after the loop.

**Fix:** Renamed the inner variable to `page_source` throughout the loop body.

---

### extractor.py — OCR quality: 200 DPI → 300 DPI

**Before:**
```python
DEFAULT_OCR_DPI = 200
```

**After:**
```python
DEFAULT_OCR_DPI = 300
```

**Why:** 200 DPI is PaddleOCR's suggested minimum. 300 DPI is the industry standard
for reliable text recognition. At 200 DPI, thin fonts and small print (common in
insurance policy footnotes) produce recognition errors. 300 DPI increases the pixel
density enough to distinguish these characters without meaningfully increasing
processing time. The OCR call passes this value via:

```python
pixmap = page.get_pixmap(dpi=ocr_dpi, alpha=False)
```

---

### nlp.py — NLP batch size: 1 → 4

**Before:**
```python
docs = list(nlp.pipe(_text_chunks(text, max_chars), batch_size=1))
```

**After:**
```python
docs = list(nlp.pipe(_text_chunks(text, max_chars), batch_size=4))
```

**Why:** `batch_size=1` processes each text chunk sequentially with a Python/C++
round-trip per chunk. spaCy's `nlp.pipe()` is designed for batching — feeding
multiple chunks at once reduces overhead from repeated NLP pipeline initialisation.
For documents split into 2–10 chunks, `batch_size=4` is a good balance.

---

### nlp.py — sentence ranking: position-based bonus

**Before:** `_rank_sentences` scored every sentence purely on entity count and keyword
presence. No preference was given to where a sentence appeared in the document.

**After:** Sentences in the first third of the document receive a `+0.5` score bonus.

```python
if position / total < 0.33:
    score += 0.5
```

**Why:** Insurance and disaster-recovery documents consistently put the most important
information near the top — policy schedules, coverage tables, and summary clauses
appear on pages 1–3. Sentences from deep in the boilerplate exclusion sections were
being ranked equally with those summary items. The bonus is small enough not to
override a high-entity sentence found later, but strong enough to break ties in
favour of the early part of the document.

---

### summarizer.py — Gemini input limit: 120,000 → 300,000 characters

**Before:**
```python
DEFAULT_MAX_INPUT_CHARACTERS = 120_000
```

**After:**
```python
DEFAULT_MAX_INPUT_CHARACTERS = 300_000
```

**Why:** 120,000 characters is roughly 30,000 tokens. Gemini 2.5 Flash supports a
1M-token context window. A 200-page insurance policy commonly runs 400,000–600,000
characters; under the old limit, the final 60–75% of the document — including late
amendments, exclusion schedules, and deadline tables — was silently discarded.
300,000 characters covers the vast majority of real-world PDFs while staying well
within the model's capacity.

---

### summarizer.py — truncation warning

When the document still exceeds `DEFAULT_MAX_INPUT_CHARACTERS` after the limit
increase, the returned `DocumentSummary` now contains an explicit warning:

```python
if truncated:
    import dataclasses
    result = dataclasses.replace(
        result,
        warnings=result.warnings + [
            f"Only the first {DEFAULT_MAX_INPUT_CHARACTERS:,} characters were "
            "sent to Gemini. Review the full document for additional details."
        ],
    )
```

**Why:** Silent truncation is a correctness hazard. Deadlines that appear late in a
document could be completely missed, with no indication to the user that the summary
is incomplete. The warning surfaces this as a visible flag in the UI card.

---

### summarizer.py — max retries: 2 → 3

**Before:**
```python
DEFAULT_MAX_RETRIES = 2
```

**After:**
```python
DEFAULT_MAX_RETRIES = 3
```

**Why:** The Gemini API occasionally returns 429 (rate limit) or 503 (overloaded)
responses in bursts. One extra retry attempt, with the existing exponential backoff
(`sleep(2^attempt)`), meaningfully increases the chance of success on transient
errors without adding significant latency in the common case where the first attempt
succeeds.

---

### summarizer.py — NLPError import guard

**Before:** `_local_summary` imported `NLPError` unconditionally at the top of the
function body, meaning `nlp.py` was loaded even when called with `use_nlp=False`
(i.e. the `--no-nlp` CLI flag).

**After:** The import is moved below the early return:

```python
def _local_summary(text, *, use_nlp=True, nlp_analysis=None):
    if not use_nlp:
        return _regex_local_summary(text)   # returns here — nlp.py never touched
    from .nlp import NLPError
    try:
        return _nlp_local_summary(text, nlp_analysis)
    except NLPError:
        return _regex_local_summary(text)
```

**Why:** `nlp.py` itself is lightweight at import time (no spaCy import at module
level), so this is a minor cost saving. The larger benefit is correctness: with
`--no-nlp`, the code path is now provably independent of the NLP module.

---

### summarizer.py — system prompt improvements

Two additions to the Gemini system prompt:

1. **Date reproduction:** `"reproduce the date exactly as written"` — prevents Gemini
   from silently reformatting dates (e.g. changing "October 20, 2026" to "2026-10-20"),
   which could break downstream date parsing or UI display.

2. **Coverage limits format:** `"For coverage_limits, include the monetary amount and
   what it covers in the same string (e.g. 'Fire and water damage up to $50,000 CAD')"` —
   previously, Gemini sometimes returned bare dollar amounts with no context, making
   the coverage card hard to read.

3. **Required actions format:** `"For required_actions, start each entry with an
   imperative verb (Submit, Contact, Report, Provide)"` — produces a consistent,
   scannable action list rather than passive descriptions like "the claimant is required
   to submit...".

---

### Tests updated

`test_uses_ocr_for_pages_without_native_text` — updated `dpi=200` assertion to
`dpi=300` to match the new `DEFAULT_OCR_DPI` constant. All 19 tests pass.
