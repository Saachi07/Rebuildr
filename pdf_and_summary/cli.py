"""Command-line entry point for processing a PDF with Gemini."""

from __future__ import annotations

import argparse
import json
import sys

from .config import load_env_file
from .exceptions import DocumentProcessingError
from .pipeline import process_pdf
from .summarizer import GeminiSummarizer


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Redact PII and summarize a PDF using Gemini."
    )
    parser.add_argument("pdf", help="Path to a PDF file")
    parser.add_argument(
        "--no-ocr",
        action="store_true",
        help="Disable PaddleOCR fallback for pages without selectable text",
    )
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Local environment file to load (default: .env)",
    )
    args = parser.parse_args()
    load_env_file(args.env_file)
    try:
        summarizer = GeminiSummarizer()
        print(f"Using summary provider: gemini:{summarizer.model}", file=sys.stderr)
        result = process_pdf(
            args.pdf,
            summarizer=summarizer,
            use_ocr=not args.no_ocr,
            redact_pii=True,
        )
        print(json.dumps(result, indent=2))
    except DocumentProcessingError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
