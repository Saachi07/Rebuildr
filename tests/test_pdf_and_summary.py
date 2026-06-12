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
from pdf_and_summary.extractor import annotate_pages, extract_text_from_pdf
from pdf_and_summary.models import (
    CoverageLimit,
    CoverageScopeItem,
    Deadline,
    Deductible,
    DocumentSummary,
    FlaggedIssue,
    GlossaryTerm,
)
from pdf_and_summary.nlp import (
    SpaCyNLPEngine,
    contains_action_term,
    contains_deadline_term,
)
from pdf_and_summary.ocr import PaddleOCREngine
from pdf_and_summary.pipeline import process_pdf
from pdf_and_summary.summarizer import GeminiSummarizer, summarize_document
from pdf_and_summary.verification import (
    normalize_for_match,
    quote_found,
    verify_summary,
)


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
        # page_texts stays index-aligned with physical pages; the empty
        # second page is kept as an empty string.
        self.assertEqual(len(result.page_texts), 2)
        self.assertIn("Coverage limit", result.page_texts[0])
        self.assertEqual(result.page_texts[1], "")
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
        scanned_page.get_pixmap.assert_called_once_with(dpi=300, alpha=False)

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

        # Provider is "local-nlp" when spaCy is installed, "local-extractive" otherwise.
        self.assertIn(result.provider, ("local-extractive", "local-nlp"))
        self.assertEqual(result.deadlines, [])
        self.assertTrue(
            any("$50,000" in limit.text or "50,000 CAD" in limit.text or "50,000" in limit.text
                for limit in result.coverage_limits),
            f"Expected a coverage-limit sentence mentioning the amount; got {result.coverage_limits}",
        )
        self.assertTrue(
            any("must report" in s or "must" in s.lower()
                for s in result.required_actions),
            f"Expected a required-action sentence; got {result.required_actions}",
        )
        # Should flag ambiguous deadline ("within 30 days" has no explicit calendar date).
        self.assertTrue(
            any(fi.issue_type == "UNRELIABLE_DATA" for fi in result.flagged_issues),
            f"Expected an UNRELIABLE_DATA flag; got {result.flagged_issues}",
        )

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

    def test_local_summary_can_explicitly_skip_nlp(self):
        result = summarize_document(
            "You must submit the claim by October 20, 2026.",
            prefer_gemini=False,
            use_nlp=False,
        )

        self.assertEqual(result.provider, "local-extractive")


class NLPTests(unittest.TestCase):
    def test_engine_model_can_be_configured_from_environment(self):
        with patch.dict(os.environ, {"SPACY_MODEL": "custom_model"}):
            engine = SpaCyNLPEngine()

        self.assertEqual(engine.model, "custom_model")

    def test_keyword_matching_does_not_match_inside_other_words(self):
        self.assertFalse(contains_deadline_term("Maybe this can wait."))
        self.assertFalse(contains_deadline_term("Update the profile."))
        self.assertFalse(contains_action_term("The reportable total is listed."))

    def test_analyze_processes_text_beyond_first_chunk(self):
        engine = SpaCyNLPEngine(max_chunk_chars=80)
        text = (
            "General policy information without any important entities. " * 3
            + "You must submit the claim by October 20, 2026."
        )

        analysis = engine.analyze(text)

        self.assertIn("October 20, 2026", analysis.dates)
        self.assertTrue(any("must submit" in sentence for sentence in analysis.top_sentences))


class PipelineTests(unittest.TestCase):
    @patch("pdf_and_summary.pipeline.summarize_document")
    @patch("pdf_and_summary.pipeline.extract_text_from_pdf")
    def test_pipeline_returns_serializable_contract(self, extract, summarize):
        extraction = MagicMock()
        extraction.text = "document text"
        extraction.page_texts = ["document text"]
        extraction.to_dict.return_value = {"text": "document text"}
        extract.return_value = extraction
        summarize.return_value = DocumentSummary("Simple summary")

        result = process_pdf(b"%PDF-fake", prefer_gemini=False)

        self.assertEqual(result["extraction"]["text"], "document text")
        self.assertEqual(result["summary"]["plain_language_summary"], "Simple summary")
        summarize.assert_called_once()
        self.assertIn("nlp_analysis", summarize.call_args.kwargs)
        # The summarizer receives page-marked text built from page_texts.
        self.assertIn("[PAGE 1]", summarize.call_args.args[0])

    @patch("pdf_and_summary.pipeline.summarize_document")
    @patch("pdf_and_summary.pipeline.extract_text_from_pdf")
    def test_pipeline_verifies_quotes_against_page_texts(self, extract, summarize):
        extraction = MagicMock()
        extraction.text = "You must file within 60 days of the loss. Other text."
        extraction.page_texts = ["You must file within 60 days of the loss. Other text."]
        extraction.to_dict.return_value = {"text": extraction.text}
        extract.return_value = extraction
        summarize.return_value = DocumentSummary(
            "Summary.",
            deadlines=[
                Deadline(
                    task="File the claim.",
                    date="within 60 days",
                    source_quote="You must file within 60 days of the loss.",
                ),
                Deadline(
                    task="Invented step.",
                    date="within 5 days",
                    source_quote="This sentence is not in the document.",
                ),
            ],
        )

        result = process_pdf(b"%PDF-fake", prefer_gemini=False, use_nlp=False)

        deadlines = result["summary"]["deadlines"]
        self.assertTrue(deadlines[0]["verified"])
        self.assertFalse(deadlines[1]["verified"])
        self.assertEqual(
            result["summary"]["verification"],
            {"checked": True, "total": 2, "verified_count": 1},
        )

    @patch("pdf_and_summary.pipeline.extract_text_from_pdf")
    def test_pipeline_rejects_pdf_without_selectable_text(self, extract):
        extraction = MagicMock()
        extraction.text = ""
        extract.return_value = extraction

        with self.assertRaisesRegex(SummaryError, "No text could be extracted"):
            process_pdf(b"%PDF-fake", prefer_gemini=False)


class AnnotatePagesTests(unittest.TestCase):
    def test_marks_pages_and_skips_empty_ones(self):
        text = annotate_pages(["First page text.", "", "Third page text."])

        self.assertIn("[PAGE 1]\nFirst page text.", text)
        self.assertNotIn("[PAGE 2]", text)
        self.assertIn("[PAGE 3]\nThird page text.", text)

    def test_empty_input_produces_empty_string(self):
        self.assertEqual(annotate_pages([]), "")
        self.assertEqual(annotate_pages(["", "  "]), "")


class VerificationTests(unittest.TestCase):
    PAGES = [
        "Coverage A Dwelling is insured to $400,000. The deductible is $2,500.",
        "You must submit a Proof of Loss within 60 days after the date of loss.",
    ]

    def test_exact_quote_is_found(self):
        self.assertTrue(
            quote_found("The deductible is $2,500.", self.PAGES)
        )

    def test_missing_quote_is_not_found(self):
        self.assertFalse(
            quote_found("Sewer backup is fully covered with no limit.", self.PAGES)
        )

    def test_whitespace_and_case_are_normalized(self):
        self.assertTrue(
            quote_found("the  DEDUCTIBLE is\n$2,500.", self.PAGES)
        )
        self.assertEqual(
            normalize_for_match("  The\n\tDeductible  "), "the deductible"
        )

    def test_quote_spanning_a_page_break_matches(self):
        quote = "The deductible is $2,500. You must submit a Proof of Loss"
        self.assertTrue(quote_found(quote, self.PAGES))

    def test_no_local_text_returns_none(self):
        self.assertIsNone(quote_found("Anything at all.", []))
        self.assertIsNone(quote_found("Anything at all.", ["", "  "]))
        self.assertIsNone(quote_found(None, self.PAGES))
        self.assertIsNone(quote_found("", self.PAGES))

    def test_verify_summary_sets_flags_and_counters(self):
        summary = DocumentSummary(
            "Summary.",
            deadlines=[
                Deadline(
                    task="Submit Proof of Loss.",
                    date="within 60 days",
                    source_quote="You must submit a Proof of Loss within 60 days",
                ),
            ],
            flagged_issues=[
                FlaggedIssue(
                    issue_type="WARNING",
                    message="Fabricated.",
                    source_quote="Not present anywhere in the document.",
                ),
                # No quote at all: stays None and does not count.
                FlaggedIssue(issue_type="MISSING", message="No receipts."),
            ],
            coverage_limits=[
                CoverageLimit(
                    text="Dwelling insured to $400,000",
                    source_quote="Coverage A Dwelling is insured to $400,000.",
                ),
            ],
            coverage_scope=[
                CoverageScopeItem(
                    item="fire",
                    status="covered",
                    detail="Fire is covered.",
                    source_quote="The deductible is $2,500.",
                ),
            ],
            deductible=Deductible(
                amount="$2,500",
                type="fixed",
                detail="You pay the first $2,500.",
                source_quote="The deductible is $2,500.",
            ),
        )

        verified = verify_summary(summary, self.PAGES)

        self.assertTrue(verified.deadlines[0].verified)
        self.assertFalse(verified.flagged_issues[0].verified)
        self.assertIsNone(verified.flagged_issues[1].verified)
        self.assertTrue(verified.coverage_limits[0].verified)
        self.assertTrue(verified.coverage_scope[0].verified)
        self.assertTrue(verified.deductible.verified)
        self.assertEqual(
            verified.verification,
            {"checked": True, "total": 5, "verified_count": 4},
        )

    def test_verify_summary_with_no_local_text_marks_unchecked(self):
        summary = DocumentSummary(
            "Summary.",
            deadlines=[
                Deadline(task="Do it.", date="soon", source_quote="A quote."),
            ],
        )

        verified = verify_summary(summary, [])

        self.assertIsNone(verified.deadlines[0].verified)
        self.assertEqual(
            verified.verification,
            {"checked": False, "total": 0, "verified_count": 0},
        )


class RichSchemaParsingTests(unittest.TestCase):
    """Parsing of the extended Gemini payload: citations, glossary,
    coverage scope, and the deductible object."""

    def _summarize(self, provider_payload):
        response = MagicMock()
        response.read.return_value = json.dumps(
            {
                "candidates": [
                    {"content": {"parts": [{"text": json.dumps(provider_payload)}]}}
                ]
            }
        ).encode()
        with patch("pdf_and_summary.summarizer.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value = response
            return GeminiSummarizer(api_key="test-key").summarize("Policy text")

    def test_parses_rich_payload(self):
        payload = {
            "plain_language_summary": "Your policy summary.",
            "flagged_issues": [
                {
                    "issue_type": "WARNING",
                    "message": "Percentage deductible.",
                    "source_quote": "A deductible of 2% applies.",
                    "page_number": 3,
                }
            ],
            "deadlines": [
                {
                    "task": "Submit Proof of Loss.",
                    "date": "within 60 days",
                    "source_quote": "Proof of Loss within 60 days.",
                    "page_number": 2,
                }
            ],
            "coverage_limits": [
                {
                    "text": "Dwelling up to $400,000",
                    "source_quote": "Coverage A: $400,000.",
                    "page_number": 1,
                }
            ],
            "required_actions": ["Submit the form."],
            "warnings": ["Flood is excluded."],
            "glossary": [
                {
                    "term": "deductible",
                    "definition": "The part you pay first.",
                    "source_quote": "A deductible of 2% applies.",
                    "page_number": 3,
                }
            ],
            "coverage_scope": [
                {
                    "item": "personal property",
                    "status": "covered",
                    "detail": "Furniture and appliances are covered.",
                    "source_quote": "We insure your personal property.",
                    "page_number": 4,
                }
            ],
            "deductible": {
                "amount": "2%",
                "type": "percentage",
                "detail": "2 percent of your dwelling coverage.",
                "source_quote": "A deductible of 2% applies.",
                "page_number": 3,
            },
        }

        result = self._summarize(payload)

        self.assertEqual(
            result.deadlines,
            [
                Deadline(
                    task="Submit Proof of Loss.",
                    date="within 60 days",
                    source_quote="Proof of Loss within 60 days.",
                    page_number=2,
                    verified=None,
                )
            ],
        )
        self.assertEqual(
            result.coverage_limits,
            [
                CoverageLimit(
                    text="Dwelling up to $400,000",
                    source_quote="Coverage A: $400,000.",
                    page_number=1,
                    verified=None,
                )
            ],
        )
        self.assertEqual(
            result.glossary,
            [
                GlossaryTerm(
                    term="deductible",
                    definition="The part you pay first.",
                    source_quote="A deductible of 2% applies.",
                    page_number=3,
                )
            ],
        )
        self.assertEqual(result.coverage_scope[0].status, "covered")
        self.assertEqual(result.deductible.type, "percentage")
        self.assertEqual(result.deductible.amount, "2%")
        # verified is never taken from the model; it is filled locally.
        self.assertIsNone(result.flagged_issues[0].verified)

    def test_invalid_status_and_pages_are_normalized(self):
        payload = {
            "plain_language_summary": "Summary.",
            "flagged_issues": [],
            "deadlines": [
                {"task": "Do it.", "date": "soon", "page_number": 0}
            ],
            "coverage_limits": [],
            "required_actions": [],
            "warnings": [],
            "glossary": [],
            "coverage_scope": [
                {"item": "fire", "status": "maybe", "detail": "Unclear wording."}
            ],
            "deductible": None,
        }

        result = self._summarize(payload)

        self.assertIsNone(result.deadlines[0].page_number)
        self.assertEqual(result.coverage_scope[0].status, "unclear")
        self.assertIsNone(result.deductible)

    def test_glossary_is_capped_at_twelve_terms(self):
        payload = {
            "plain_language_summary": "Summary.",
            "flagged_issues": [],
            "deadlines": [],
            "coverage_limits": [],
            "required_actions": [],
            "warnings": [],
            "glossary": [
                {"term": f"term {i}", "definition": f"definition {i}"}
                for i in range(20)
            ],
            "coverage_scope": [],
            "deductible": None,
        }

        result = self._summarize(payload)

        self.assertEqual(len(result.glossary), 12)


if __name__ == "__main__":
    unittest.main()
