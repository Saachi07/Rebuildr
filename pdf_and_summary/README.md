# PDF and Summary Pipeline

This package extracts text from multi-page PDFs and produces a structured,
plain-language summary. Native PDF text is preferred; pages without selectable
text use PaddleOCR when the optional OCR dependencies are installed. Normal
CLI analysis requires Gemini configuration. The conservative local extractive
summary is available only when `--local` is explicitly used.

The result contract matches the Documents Page UX in
`claude_documents_page_prompt.md`:

- `plain_language_summary` for the Document Summary card
- `flagged_issues` with `issue_type` and `message` for visible warning lines
- `deadlines` with `task` and `date` for the Deadlines table

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r pdf_and_summary/requirements-ocr.txt
export GEMINI_API_KEY="your-key"        # optional
export GEMINI_MODEL="gemini-2.5-flash"  # optional
```

Never commit a real key. `.env` variants are ignored, and `.env.example`
contains safe placeholders only.

The CLI automatically loads `.env` from the repository root. It prints the
selected summary provider to stderr before analysis.

## Usage

```bash
# Verify PDF text extraction only
python3 -m pdf_and_summary.cli --extract-only path/to/document.pdf

# Verify native extraction without running OCR
python3 -m pdf_and_summary.cli --extract-only --no-ocr path/to/document.pdf

# Verify extraction plus the local summary without an API key
python3 -m pdf_and_summary.cli --local path/to/document.pdf

# Verify extraction plus the Gemini wrapper
export GEMINI_API_KEY="your-key"
python3 -m pdf_and_summary.cli path/to/document.pdf
```

The Gemini wrapper uses structured JSON responses, validates the result shape,
and retries temporary service or rate-limit failures.

You can configure Gemini in the ignored local `.env`:

```text
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
```

Use `--env-file /path/to/local.env` to load a different environment file.

Backend code can call `pdf_and_summary.process_pdf(pdf_bytes)`. The returned
dictionary contains extraction metadata and these summary fields:
`plain_language_summary`, `flagged_issues`, `deadlines`, `coverage_limits`,
`required_actions`, `warnings`, and `provider`.

The extractor rejects non-PDF uploads, damaged or password-protected PDFs,
files over 25 MB, and documents over 100 pages. It labels each page as
`(native)` or `(ocr)`, records OCR metadata, and warns users to verify
OCR-derived text. OCR models download on first use. Standalone image uploads
are not supported yet.
