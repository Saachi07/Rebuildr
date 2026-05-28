# Copilot Instructions — Rebuildr

## Project overview

Rebuildr is an AI-powered disaster recovery platform helping wildfire-affected communities navigate insurance claims, recovery processes, and fragmented support systems. The stack is a Flask backend (`/Rebuildr-backend`) and a Next.js frontend (`/Rebuildr-frontend`).

## Architecture context

- **Tier A - Image-based damage documentation:** Users upload damage photos. The backend classifies and auto-tags them (YOLO / ResNet) and links tagged evidence to specific to-do items from Tier B.
- **Tier B — Insurance document analysis:** Users upload insurance policies, claim docs, and government aid forms. The backend extracts text (pdfplumber / Tesseract OCR), sends it to an LLM (Anthropic, OpenAI, or Gemini SDK) for legal simplification and red-flag detection, then runs NLP (spaCy / fine-tuned BERT) to extract deadlines, amounts, contacts, and required actions into a structured recovery to-do list.
- **Tier C — Personalized recovery / MDP action planner
- **Storage:** S3-compatible object storage (Cloudflare R2 via boto3) for documents and photos. PostgreSQL (Supabase) for structured data.

## When performing a code review

### Security and privacy

- Confirm no API keys, secrets, or credentials are hard-coded. All secrets must come from environment variables or a `.env` file (never committed).
- Warn if error responses leak internal database column names, file paths, or stack traces to the frontend.
- Check that uploaded files are validated for type and size before processing. Only allow expected formats (PDF, PNG, JPG, JPEG, TIFF, DOCX).
- Ensure user-uploaded filenames are sanitized before storage — never use raw user input in file paths.
- Verify that LLM prompts do not include raw user PII unnecessarily. Strip or redact sensitive data before sending to external LLM APIs when possible.

### Backend (Flask / Python)

- Confirm there are no hard-coded magic numbers. Use named constants or config values (e.g., `MAX_UPLOAD_SIZE_MB`, `OCR_DPI`, `CLAIM_DEADLINE_BUFFER_DAYS`).
- Check that all Flask routes have proper error handling with try/except blocks and return consistent JSON error responses with appropriate HTTP status codes.
- Ensure NLP and ML model loading happens once at startup (not per-request). Models like spaCy pipelines, BERT, and YOLO should be loaded into memory on init.
- Verify that document processing tasks (OCR, LLM calls, image classification) use background task handling (Celery or similar) for anything that could exceed a few seconds — never block the request thread.
- Check that database queries use parameterized statements — no string interpolation in SQL.
- Ensure all file upload endpoints validate MIME type server-side, not just by file extension.
- Confirm that the NLP extraction pipeline (deadline/entity extraction) returns structured JSON with consistent field names: `task`, `deadline`, `priority`, `source_document`, `linked_evidence`.

### Frontend (Next.js)

- Check that all new UI components include `data-testid` attributes for testing.
- Ensure API calls to the Flask backend use a centralized API client or wrapper — no scattered raw `fetch` calls with hard-coded URLs.
- Verify that loading and error states are handled for every async operation (document upload, LLM processing, photo classification). Users in crisis should never see a blank screen or unhandled error.
- Check that the UI uses simplified, accessible language. Avoid legal or technical jargon in user-facing strings — the target audience includes users with lower digital literacy.
- Confirm that file upload components show clear progress indicators and file size limits.
- Ensure responsive design — the app must work on mobile since many disaster-affected users may only have phone access.
- Verify that the recovery to-do list UI clearly shows deadlines with visual urgency indicators (overdue, due soon, upcoming).

### Tier B ↔ Tier C integration

- When reviewing to-do list or claims code, confirm that each to-do item has an `evidence` field (array) that can hold references to Tier C damage photos.
- Check that damage photo tags from the image classifier match the vocabulary used in claim task categories — these must stay in sync.
- Verify that linking a photo to a claim item is a reversible action (users can unlink).

### Accessibility and equity

- Check that all user-facing text can be understood at a grade 8 reading level or below.
- Ensure no feature requires high-bandwidth assets (large images, heavy animations) without a low-bandwidth fallback.
- Verify that all form inputs have proper labels, aria attributes, and keyboard navigation support.
- Confirm color is never the sole indicator of status — always pair with text or icons.

### Testing

- Confirm that any new Flask route has at least one corresponding test covering the success path and one covering an error/validation path.
- Check that mock data used in tests reflects realistic disaster recovery scenarios (not generic placeholder data).
- Ensure image classification tests include edge cases: blurry photos, low-light conditions, partially obscured damage.
