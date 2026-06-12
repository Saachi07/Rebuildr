"""Tests for magic-number upload validation (sniff_mime).

The module is loaded by file path: it is stdlib-only with no Flask or
package-relative imports, so it does not need the backend app context.
"""

import importlib.util
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = REPO_ROOT / "backend" / "app" / "services" / "upload_validation.py"

spec = importlib.util.spec_from_file_location("upload_validation", MODULE_PATH)
upload_validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload_validation)

sniff_mime = upload_validation.sniff_mime
HEADER_LENGTH = upload_validation.HEADER_LENGTH


class SniffMimeTests(unittest.TestCase):
    def test_pdf(self):
        self.assertEqual(sniff_mime(b"%PDF-1.7 rest of file"), "application/pdf")

    def test_jpeg(self):
        self.assertEqual(sniff_mime(b"\xff\xd8\xff\xe0\x00\x10JFIF"), "image/jpeg")

    def test_png(self):
        self.assertEqual(
            sniff_mime(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), "image/png"
        )

    def test_webp(self):
        self.assertEqual(sniff_mime(b"RIFF\x12\x34\x56\x78WEBPVP8 "), "image/webp")

    def test_heic(self):
        # ISO BMFF: 4-byte box size, "ftyp", then the brand.
        self.assertEqual(
            sniff_mime(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"), "image/heic"
        )

    def test_heif(self):
        self.assertEqual(
            sniff_mime(b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00"), "image/heif"
        )

    def test_spoofed_extension_content_wins(self):
        # An html file renamed to .pdf: the sniffer sees html, not a PDF.
        self.assertIsNone(sniff_mime(b"<!DOCTYPE html><html><body>"))
        # A Windows executable renamed to .jpg.
        self.assertIsNone(sniff_mime(b"MZ\x90\x00\x03\x00\x00\x00"))
        # Plain text renamed to .png.
        self.assertIsNone(sniff_mime(b"hello world this is text"))

    def test_riff_without_webp_fourcc_is_rejected(self):
        # WAV files are RIFF too; only the WEBP fourcc is a photo.
        self.assertIsNone(sniff_mime(b"RIFF\x12\x34\x56\x78WAVEfmt "))

    def test_ftyp_with_unknown_brand_is_rejected(self):
        # MP4 video is ISO BMFF but not a supported photo format.
        self.assertIsNone(sniff_mime(b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00"))

    def test_empty_and_short_inputs(self):
        self.assertIsNone(sniff_mime(b""))
        self.assertIsNone(sniff_mime(b"%P"))
        # Header length constant is enough for every signature we check.
        self.assertGreaterEqual(HEADER_LENGTH, 12)


if __name__ == "__main__":
    unittest.main()
