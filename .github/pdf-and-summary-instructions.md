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
Send extracted text to Gemini, or use local fallback
        |
        v
Return structured extraction and summary JSON
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
  ]
}
```

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

- Normal analysis now requires Gemini configuration.
- The CLI automatically loads `.env` from the repository root.
- `--env-file /path/to/file` loads a different environment file.
- Shell environment values take precedence over environment-file values.
- The selected provider is printed to stderr before analysis.
- A missing key now produces an actionable error.
- Local analysis must be explicitly requested with `--local`.

Expected Gemini provider message:

```text
Using summary provider: gemini:gemini-2.5-flash
```

### Gemini Prompt Rules

The wrapper instructs Gemini to:

- Use plain language at approximately grade 8 reading level or below
- Prioritize accuracy over completion
- Never invent a deadline
- Never invent an amount or coverage limit
- Never invent a contact
- Never invent a required action
- Flag ambiguous dates as unreliable instead of guessing
- Return JSON matching the required response schema

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

Example complete result:

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
    "warnings": []
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

### `pdf_and_summary/summarizer.py`

Implements:

- Gemini REST wrapper
- Gemini system prompt
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

- Normal strict Gemini analysis
- `--local` mode
- `--extract-only` mode
- `--env-file` mode
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

### Check Extraction Only

```bash
python3 -m pdf_and_summary.cli --extract-only /full/path/to/document.pdf
```

Expected output:

- JSON printed to the terminal
- `extraction.text` contains page-labelled text
- `page_count` matches the PDF
- `pages_with_text` is greater than zero
- `warnings` is empty for a normal text PDF

To explicitly disable OCR:

```bash
python3 -m pdf_and_summary.cli --extract-only --no-ocr /full/path/to/document.pdf
```

### Check Local Analysis Without Gemini

```bash
python3 -m pdf_and_summary.cli --local /full/path/to/document.pdf
```

Expected output:

- Extraction metadata
- `summary.plain_language_summary`
- `summary.flagged_issues`
- `summary.deadlines`
- `summary.coverage_limits`
- `summary.required_actions`
- `summary.provider` equals `local-extractive`

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
python3 -m pdf_and_summary.cli --extract-only /full/path/to/scanned-document.pdf
```

Expected result:

- PaddleOCR runs for pages without selectable text.
- OCR-derived text appears under a page label ending in `(ocr)`.
- `ocr_pages` is greater than zero.
- `ocr_engine` is `paddleocr`.
- Warnings tell the user to verify OCR-derived text.

To check behavior without OCR:

```bash
python3 -m pdf_and_summary.cli --extract-only --no-ocr /full/path/to/scanned-document.pdf
```

### View CLI Help

```bash
python3 -m pdf_and_summary.cli --help
```

Available modes:

```text
--local
--extract-only
--no-ocr
--env-file
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

The Gemini wrapper sends at most the first 120,000 extracted characters. A
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

1. Add standalone scanned-image input support.
2. Store per-line OCR confidence values when detailed review is needed.
3. Add image preprocessing for low-quality, rotated, or photographed documents.
4. Add configurable OCR language selection.
5. Pre-download and cache OCR models for deployment.
6. Add long-document chunking before Gemini analysis.
7. Integrate the package into backend document-upload routes and the Documents
   Page frontend.

## OCR Implementation Reference

The PaddleOCR adapter follows the PaddleOCR 3.x general OCR pipeline pattern:

- Python integration creates a `PaddleOCR` pipeline.
- OCR inference uses `predict(...)`.
- Structured OCR output is read from each result's JSON data.
- The default PP-OCRv5 mobile detection and recognition models are downloaded
  on first use.

Official reference:

- https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html
