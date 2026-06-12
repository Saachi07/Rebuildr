# PDF and Summary Pipeline

This package extracts text from multi-page PDFs and produces a structured,
plain-language summary. Native PDF text is preferred; pages without selectable
text use PaddleOCR when the optional OCR dependencies are installed. Gemini
configuration is required. PII is always redacted before sending text to Gemini
and rehydrated in the final summary.

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
python3 -m pip install -r pdf_and_summary/requirements-nlp.txt
python3 -m spacy download en_core_web_sm
export GEMINI_API_KEY="your-key"        # required
export GEMINI_MODEL="gemini-2.5-flash"  # optional
```

The local NLP path defaults to `en_core_web_sm`. For higher NER accuracy, install
another spaCy English model and set `SPACY_MODEL`, for example:

```bash
python3 -m spacy download en_core_web_trf
export SPACY_MODEL="en_core_web_trf"
```

Never commit a real key. `.env` variants are ignored, and `.env.example`
contains safe placeholders only.

The CLI automatically loads `.env` from the repository root. It prints the
selected summary provider to stderr before analysis.

## Usage

```bash
# Redact PII and summarize a PDF using Gemini (OCR runs automatically for scanned pages)
python3 -m pdf_and_summary.cli path/to/document.pdf

# Disable PaddleOCR fallback (text-extractable PDFs only)
python3 -m pdf_and_summary.cli --no-ocr path/to/document.pdf
```

PaddleOCR runs automatically for pages without selectable text. Scanned PDFs
and native-text PDFs are processed the same way — OCR is a transparent fallback.

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
