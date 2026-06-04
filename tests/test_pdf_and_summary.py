import io
import json
import os
import sys
import tempfile
import types
import unittest
from urllib.error import HTTPError
from unittest.mock import MagicMock, patch

from pdf_and_summary.exceptions import InvalidPDFError, SummaryError
from pdf_and_summary.config import load_env_file
from pdf_and_summary.extractor import extract_text_from_pdf
from pdf_and_summary.models import Deadline, DocumentSummary, FlaggedIssue
from pdf_and_summary.ocr import PaddleOCREngine
from pdf_and_summary.pipeline import process_pdf
from pdf_and_summary.summarizer import GeminiSummarizer, summarize_document


class FakeDocument:
    needs_pass = False

    def __init__(self, pages):
        self.pages = pages
        self.page_count = len(pages)
        self.closed = False

    def __iter__(self):
        return iter(self.pages)

    def close(self):
        self.closed = True


class FakeOCREngine:
    name = "fake-ocr"

    def __init__(self, texts):
        self.texts = iter(texts)
        self.images = []

    def extract_text(self, image_bytes):
        self.images.append(image_bytes)
        return next(self.texts)


class ConfigTests(unittest.TestCase):
    def test_load_env_file_sets_missing_values_without_overriding_shell(self):
        with tempfile.NamedTemporaryFile(mode="w", delete=False) as env_file:
            env_file.write("GEMINI_API_KEY=file-key\nGEMINI_MODEL='file-model'\n")
            path = env_file.name
        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "shell-key"}, clear=True):
                loaded = load_env_file(path)
                self.assertTrue(loaded)
                self.assertEqual(os.environ["GEMINI_API_KEY"], "shell-key")
                self.assertEqual(os.environ["GEMINI_MODEL"], "file-model")
        finally:
            os.unlink(path)


class ExtractionTests(unittest.TestCase):
    def test_rejects_non_pdf_upload(self):
        with self.assertRaisesRegex(InvalidPDFError, "not a valid PDF"):
            extract_text_from_pdf(b"plain text")

    def test_extracts_and_labels_multiple_pages(self):
        page_one = MagicMock()
        page_one.get_text.return_value = "Coverage limit: $10,000\r\n"
        page_two = MagicMock()
        page_two.get_text.return_value = ""
        document = FakeDocument([page_one, page_two])
        fake_fitz = types.SimpleNamespace(open=MagicMock(return_value=document))

        with patch.dict(sys.modules, {"fitz": fake_fitz}):
            result = extract_text_from_pdf(
                io.BytesIO(b"%PDF-1.7 fake"), use_ocr=False
            )

        self.assertEqual(result.page_count, 2)
        self.assertEqual(result.pages_with_text, 1)
        self.assertEqual(result.native_text_pages, 1)
        self.assertEqual(result.ocr_pages, 0)
        self.assertIn("--- Page 1 (native) ---", result.text)
        self.assertIn("Page 2 contains no extractable text", result.warnings[0])
        self.assertTrue(document.closed)

    def test_uses_ocr_for_pages_without_native_text(self):
        native_page = MagicMock()
        native_page.get_text.return_value = "Native page text"
        scanned_page = MagicMock()
        scanned_page.get_text.return_value = ""
        pixmap = MagicMock()
        pixmap.tobytes.return_value = b"page-image"
        scanned_page.get_pixmap.return_value = pixmap
        document = FakeDocument([native_page, scanned_page])
        fake_fitz = types.SimpleNamespace(open=MagicMock(return_value=document))
        ocr = FakeOCREngine(["OCR page text"])

        with patch.dict(sys.modules, {"fitz": fake_fitz}):
            result = extract_text_from_pdf(b"%PDF-1.7 fake", ocr_engine=ocr)

        self.assertEqual(result.native_text_pages, 1)
        self.assertEqual(result.ocr_pages, 1)
        self.assertEqual(result.ocr_engine, "fake-ocr")
        self.assertIn("--- Page 1 (native) ---", result.text)
        self.assertIn("--- Page 2 (ocr) ---", result.text)
        self.assertEqual(ocr.images, [b"page-image"])
        scanned_page.get_pixmap.assert_called_once_with(dpi=200, alpha=False)

    def test_ocr_can_extract_fully_scanned_pdf(self):
        scanned_page = MagicMock()
        scanned_page.get_text.return_value = ""
        pixmap = MagicMock()
        pixmap.tobytes.return_value = b"page-image"
        scanned_page.get_pixmap.return_value = pixmap
        document = FakeDocument([scanned_page])
        fake_fitz = types.SimpleNamespace(open=MagicMock(return_value=document))

        with patch.dict(sys.modules, {"fitz": fake_fitz}):
            result = extract_text_from_pdf(
                b"%PDF-1.7 fake",
                ocr_engine=FakeOCREngine(["Scanned claim text"]),
            )

        self.assertIn("Scanned claim text", result.text)
        self.assertEqual(result.pages_with_text, 1)
        self.assertEqual(result.ocr_pages, 1)

    def test_uses_ocr_when_native_page_extraction_fails(self):
        failed_page = MagicMock()
        failed_page.get_text.side_effect = RuntimeError("native extraction failed")
        pixmap = MagicMock()
        pixmap.tobytes.return_value = b"page-image"
        failed_page.get_pixmap.return_value = pixmap
        document = FakeDocument([failed_page])
        fake_fitz = types.SimpleNamespace(open=MagicMock(return_value=document))

        with patch.dict(sys.modules, {"fitz": fake_fitz}):
            result = extract_text_from_pdf(
                b"%PDF-1.7 fake",
                ocr_engine=FakeOCREngine(["Recovered with OCR"]),
            )

        self.assertIn("Recovered with OCR", result.text)
        self.assertEqual(result.ocr_pages, 1)
        self.assertIn("Native text extraction failed on page 1", result.warnings[0])


class OCRTests(unittest.TestCase):
    def test_paddle_ocr_filters_low_confidence_text(self):
        engine = PaddleOCREngine(minimum_confidence=0.5)
        result = MagicMock()
        result.json = {
            "res": {
                "rec_texts": ["Reliable text", "Low confidence text"],
                "rec_scores": [0.95, 0.2],
            }
        }
        pipeline = MagicMock()
        pipeline.predict.return_value = [result]
        engine._pipeline = pipeline

        text = engine.extract_text(b"image")

        self.assertEqual(text, "Reliable text")
        pipeline.predict.assert_called_once()


class SummaryTests(unittest.TestCase):
    def test_local_summary_extracts_high_value_sentences(self):
        text = (
            "Your policy covers fire damage up to $50,000 CAD. "
            "You must report the loss within 30 days. "
            "Call your adjuster for help."
        )

        result = summarize_document(text, prefer_gemini=False)

        self.assertEqual(result.provider, "local-extractive")
        self.assertEqual(result.deadlines, [])
        self.assertIn("$50,000 CAD", result.coverage_limits[0])
        self.assertIn("must report", result.required_actions[0])
        self.assertEqual(result.flagged_issues[-1].issue_type, "UNRELIABLE_DATA")

    def test_local_summary_builds_deadline_rows_for_clear_dates(self):
        result = summarize_document(
            "You must submit the claim by October 20, 2026.",
            prefer_gemini=False,
        )

        self.assertEqual(
            result.deadlines,
            [
                Deadline(
                    task="You must submit the claim by October 20, 2026.",
                    date="October 20, 2026",
                )
            ],
        )

    @patch("pdf_and_summary.summarizer.urlopen")
    def test_gemini_summary_parses_structured_response(self, urlopen):
        provider_payload = {
            "plain_language_summary": "Report the loss to your insurer.",
            "flagged_issues": [
                {"issue_type": "ACTION_REQUIRED", "message": "Contact your insurer."}
            ],
            "deadlines": [
                {"task": "Report the loss.", "date": "October 20, 2026"}
            ],
            "coverage_limits": ["Fire coverage is $50,000 CAD."],
            "required_actions": ["Contact your insurer."],
            "warnings": [],
        }
        response = MagicMock()
        response.read.return_value = json.dumps(
            {
                "candidates": [
                    {"content": {"parts": [{"text": json.dumps(provider_payload)}]}}
                ]
            }
        ).encode()
        urlopen.return_value.__enter__.return_value = response

        result = GeminiSummarizer(api_key="test-key").summarize("Policy text")

        self.assertEqual(
            result.plain_language_summary,
            provider_payload["plain_language_summary"],
        )
        self.assertTrue(result.provider.startswith("gemini:"))
        self.assertEqual(
            result.flagged_issues,
            [FlaggedIssue("ACTION_REQUIRED", "Contact your insurer.")],
        )
        self.assertEqual(
            result.deadlines,
            [Deadline("Report the loss.", "October 20, 2026")],
        )

    @patch("pdf_and_summary.summarizer.urlopen")
    def test_gemini_reports_non_retryable_http_error(self, urlopen):
        urlopen.side_effect = HTTPError(
            url="https://example.test",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=None,
        )

        with self.assertRaisesRegex(SummaryError, "HTTP status 403"):
            GeminiSummarizer(api_key="test-key").summarize("Policy text")

    @patch("pdf_and_summary.summarizer.time.sleep")
    @patch("pdf_and_summary.summarizer.urlopen")
    def test_gemini_retries_temporary_errors(self, urlopen, sleep):
        provider_payload = {
            "plain_language_summary": "Simple summary.",
            "flagged_issues": [],
            "deadlines": [],
            "coverage_limits": [],
            "required_actions": [],
            "warnings": [],
        }
        response = MagicMock()
        response.read.return_value = json.dumps(
            {
                "candidates": [
                    {"content": {"parts": [{"text": json.dumps(provider_payload)}]}}
                ]
            }
        ).encode()
        urlopen.side_effect = [
            HTTPError("https://example.test", 429, "Busy", None, None),
            response,
        ]
        response.__enter__.return_value = response

        result = GeminiSummarizer(api_key="test-key").summarize("Policy text")

        self.assertEqual(result.plain_language_summary, "Simple summary.")
        sleep.assert_called_once_with(1)

    def test_empty_text_is_rejected(self):
        with self.assertRaisesRegex(SummaryError, "no document text"):
            summarize_document("", prefer_gemini=False)


class PipelineTests(unittest.TestCase):
    @patch("pdf_and_summary.pipeline.summarize_document")
    @patch("pdf_and_summary.pipeline.extract_text_from_pdf")
    def test_pipeline_returns_serializable_contract(self, extract, summarize):
        extraction = MagicMock()
        extraction.text = "document text"
        extraction.to_dict.return_value = {"text": "document text"}
        extract.return_value = extraction
        summarize.return_value = DocumentSummary("Simple summary")

        result = process_pdf(b"%PDF-fake", prefer_gemini=False)

        self.assertEqual(result["extraction"]["text"], "document text")
        self.assertEqual(result["summary"]["plain_language_summary"], "Simple summary")

    @patch("pdf_and_summary.pipeline.extract_text_from_pdf")
    def test_pipeline_rejects_pdf_without_selectable_text(self, extract):
        extraction = MagicMock()
        extraction.text = ""
        extract.return_value = extraction

        with self.assertRaisesRegex(SummaryError, "No text could be extracted"):
            process_pdf(b"%PDF-fake", prefer_gemini=False)


if __name__ == "__main__":
    unittest.main()
