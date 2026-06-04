"""Command-line entry point for manually processing a PDF."""

from __future__ import annotations

import argparse
import json
import sys

from .config import load_env_file
from .exceptions import DocumentProcessingError
from .extractor import extract_text_from_pdf
from .pipeline import process_pdf
from .summarizer import GeminiSummarizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract and summarize a PDF.")
    parser.add_argument("pdf", help="Path to a PDF file")
    parser.add_argument(
        "--local",
        action="store_true",
        help="Use the local extractive summary even when GEMINI_API_KEY is set",
    )
    parser.add_argument(
        "--extract-only",
        action="store_true",
        help="Extract PDF text without generating a summary",
    )
    parser.add_argument(
        "--no-ocr",
        action="store_true",
        help="Disable PaddleOCR fallback for pages without selectable text",
    )
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Local environment file to load before analysis (default: .env)",
    )
    args = parser.parse_args()
    load_env_file(args.env_file)
    try:
        if args.extract_only:
            result = {
                "extraction": extract_text_from_pdf(
                    args.pdf, use_ocr=not args.no_ocr
                ).to_dict()
            }
        else:
            summarizer = None
            if args.local:
                print("Using summary provider: local-extractive", file=sys.stderr)
            else:
                summarizer = GeminiSummarizer()
                print(
                    f"Using summary provider: gemini:{summarizer.model}",
                    file=sys.stderr,
                )
            result = process_pdf(
                args.pdf,
                summarizer=summarizer,
                prefer_gemini=not args.local,
                use_ocr=not args.no_ocr,
            )
        print(json.dumps(result, indent=2))
    except DocumentProcessingError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
