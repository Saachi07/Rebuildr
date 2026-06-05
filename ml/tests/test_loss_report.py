import sys, os, json, glob
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch
from loss_report import generate_loss_report, LOSS_FACTORS


BEFORE = {
    "room_type": "living_room",
    "items": [
        {
            "name": "leather sofa",
            "category": "furniture",
            "count": 1,
            "condition": "good",
            "canadian_retail_estimate_cad": {"low": 800, "high": 2500},
        },
        {
            "name": "coffee table",
            "category": "furniture",
            "count": 1,
            "condition": "good",
            "canadian_retail_estimate_cad": {"low": 200, "high": 600},
        },
    ],
}

AFTER = {
    "room_type": "living_room",
    "overall_damage_notes": "fire damage throughout",
    "items": [
        {
            "name": "leather sofa",
            "category": "furniture",
            "damage_description": "armrest charred",
            "bounding_box": {"x1": 100, "y1": 200, "x2": 600, "y2": 700},
            "damage_grade": "salvageable",
            "vit_confidence": 0.91,
            "vit_scores": {"intact": 0.03, "salvageable": 0.91, "destroyed": 0.06},
        }
        # coffee table absent — assumed destroyed
    ],
}


def test_loss_factors_are_three_classes():
    assert set(LOSS_FACTORS.keys()) == {"intact", "salvageable", "destroyed"}
    assert LOSS_FACTORS["intact"] == 0.0
    assert LOSS_FACTORS["salvageable"] == 0.6
    assert LOSS_FACTORS["destroyed"] == 1.0
    assert "smoke_damaged" not in LOSS_FACTORS
    assert "partially_burned" not in LOSS_FACTORS


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_salvageable_loss_is_60_percent(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    sofa = next(i for i in report.items if i.name == "leather sofa")
    assert sofa.damage_grade == "salvageable"
    assert sofa.estimated_loss.low == int(800 * 0.6)
    assert sofa.estimated_loss.high == int(2500 * 0.6)


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_unmatched_before_item_is_destroyed(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    table = next(i for i in report.items if i.name == "coffee table")
    assert table.damage_grade == "destroyed"
    assert table.estimated_loss.low == 200
    assert table.estimated_loss.high == 600
    assert "coffee table" in report.items_missing_from_after


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_report_has_generated_at(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    assert report.generated_at != ""
    assert "T" in report.generated_at  # ISO 8601 format


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_json_file_is_written(mock_summary, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_loss_report(BEFORE, AFTER)
    files = glob.glob(str(tmp_path / "outputs" / "report_*.json"))
    assert len(files) == 1
    with open(files[0]) as f:
        data = json.load(f)
    assert "total_loss_low_cad" in data
    assert "items_missing_from_after" in data
