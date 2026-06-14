"""Tests for the contents-vs-building claim classification and the
post-pass that backstops Gemini's inventory output.

Pure logic only, no Gemini calls: classify_claim_class is deterministic and
finalize_analysis operates on an already-parsed RoomAnalysis.
"""

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytest.importorskip("pydantic")

from app.services.gemini_inventory import (  # noqa: E402
    InventoryItem,
    PriceRange,
    RoomAnalysis,
    classify_claim_class,
    finalize_analysis,
)


def _item(name, category="other", low=100, high=200, count=1, **kwargs):
    return InventoryItem(
        name=name,
        category=category,
        count=count,
        condition="good",
        approximate_size="medium",
        canadian_retail_estimate_cad=PriceRange(low=low, high=high),
        **kwargs,
    )


class TestClassifyClaimClass:
    @pytest.mark.parametrize(
        "name, category, expected",
        [
            ("three-seat sofa", "furniture", "contents"),
            ("wall-to-wall carpet", "other", "building"),
            ("area rug", "decor", "contents"),
            ("floral wallpaper", "other", "building"),
            ("built-in oven", "appliance", "building"),
            ("stainless steel refrigerator", "appliance", "contents"),
            ("mystery gadget", "other", "unclear"),
            ("hardwood flooring", "other", "building"),
            ("table lamp", "decor", "contents"),
            ("ceiling fan", "other", "building"),
        ],
    )
    def test_classification(self, name, category, expected):
        claim_class, _note = classify_claim_class(name, category)
        assert claim_class == expected

    def test_building_items_get_a_note(self):
        _cls, note = classify_claim_class("wallpaper", "other")
        assert note and "building" in note.lower()

    def test_contents_items_get_no_note(self):
        _cls, note = classify_claim_class("sofa", "furniture")
        assert note is None

    def test_unclear_appliance_advises_adjuster(self):
        claim_class, note = classify_claim_class("dishwasher", "appliance")
        assert claim_class == "unclear"
        assert note and "adjuster" in note.lower()


class TestFinalizeAnalysis:
    def test_fills_missing_claim_class(self):
        analysis = RoomAnalysis(
            room_type="living_room",
            items=[_item("sofa", "furniture")],
            notes="",
        )
        out = finalize_analysis(analysis, "post")
        assert out.items[0].claim_class == "contents"

    def test_keeps_model_provided_claim_class(self):
        analysis = RoomAnalysis(
            room_type="kitchen",
            items=[_item("dishwasher", "appliance", claim_class="building")],
            notes="",
        )
        out = finalize_analysis(analysis, "post")
        assert out.items[0].claim_class == "building"

    def test_contents_total_counts_only_contents(self):
        analysis = RoomAnalysis(
            room_type="living_room",
            items=[
                _item("sofa", "furniture", low=500, high=1000),
                _item("hardwood flooring", "other", low=3000, high=6000),
                _item("tv", "electronics", low=400, high=800, count=2),
            ],
            notes="",
        )
        out = finalize_analysis(analysis, "post")
        assert out.contents_total_estimate_cad.low == 500 + 400 * 2
        assert out.contents_total_estimate_cad.high == 1000 + 800 * 2
        assert out.building_items_present is True

    def test_no_building_items_flag(self):
        analysis = RoomAnalysis(
            room_type="bedroom",
            items=[_item("bed frame", "furniture")],
            notes="",
        )
        out = finalize_analysis(analysis, "post")
        assert out.building_items_present is False

    def test_pre_loss_photos_never_have_salvageability(self):
        analysis = RoomAnalysis(
            room_type="bedroom",
            items=[
                _item(
                    "mattress",
                    "furniture",
                    salvageable="unlikely",
                    salvage_note="soaked",
                )
            ],
            notes="",
        )
        out = finalize_analysis(analysis, "pre")
        assert out.items[0].salvageable is None
        assert out.items[0].salvage_note is None

    def test_auto_phase_uses_detected_phase(self):
        analysis = RoomAnalysis(
            room_type="bedroom",
            items=[
                _item(
                    "mattress",
                    "furniture",
                    salvageable="unlikely",
                    salvage_note="soaked",
                )
            ],
            notes="",
            detected_phase="before",
        )
        out = finalize_analysis(analysis, "auto")
        assert out.items[0].salvageable is None

    def test_post_loss_salvageability_preserved(self):
        analysis = RoomAnalysis(
            room_type="bedroom",
            items=[
                _item(
                    "mattress",
                    "furniture",
                    salvageable="unlikely",
                    salvage_note="Soaked by flood water; confirm with your insurer.",
                )
            ],
            notes="",
        )
        out = finalize_analysis(analysis, "post")
        assert out.items[0].salvageable == "unlikely"
