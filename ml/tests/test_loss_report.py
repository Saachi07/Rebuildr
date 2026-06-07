import sys, os, json, glob
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch
from loss_report import generate_loss_report


AFTER = {
    "room_type": "living_room",
    "items": [
        {
            "name": "leather sofa",
            "yolo_label": "sofa",
            "category": "furniture",
            "count": 1,
            "pre_count": 1,
            "salvageable_count": 1,
            "damaged_count": 0,
            "status": "safe",
            "canadian_retail_estimate_cad": {"low": 800, "high": 2500},
        },
        {
            "name": "coffee table",
            "yolo_label": "table",
            "category": "furniture",
            "count": 1,
            "pre_count": 1,
            "salvageable_count": 0,
            "damaged_count": 1,
            "status": "damaged",
            "canadian_retail_estimate_cad": {"low": 200, "high": 600},
        },
        {
            "name": "dining chair",
            "yolo_label": "chair",
            "category": "furniture",
            "count": 3,
            "pre_count": 3,
            "salvageable_count": 2,
            "damaged_count": 1,
            "status": "partial",
            "canadian_retail_estimate_cad": {"low": 100, "high": 200},
        },
    ],
}

BEFORE = {"room_type": "living_room", "items": []}


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_safe_item_has_zero_loss(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    sofa = next(i for i in report.items if i.name == "leather sofa")
    assert sofa.status == "safe"
    assert sofa.estimated_loss.low == 0
    assert sofa.estimated_loss.high == 0


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_damaged_item_has_full_loss(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    table = next(i for i in report.items if i.name == "coffee table")
    assert table.status == "damaged"
    assert table.estimated_loss.low == 200
    assert table.estimated_loss.high == 600


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_partial_item_loss_is_proportional(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    chair = next(i for i in report.items if i.name == "dining chair")
    assert chair.status == "partial"
    # 1 of 3 damaged: loss = (1/3) * (100 * 3) = 100 low, (1/3) * (200 * 3) = 200 high
    assert chair.estimated_loss.low == 100
    assert chair.estimated_loss.high == 200


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_totals_sum_item_losses(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    # sofa: 0+0, table: 200+600, chair: 100+200
    assert report.total_loss_low_cad == 300
    assert report.total_loss_high_cad == 800


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_report_has_generated_at(mock_summary):
    report = generate_loss_report(BEFORE, AFTER)
    assert "T" in report.generated_at


@patch("loss_report._generate_summary", return_value="Test summary.")
def test_json_file_is_written(mock_summary, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_loss_report(BEFORE, AFTER)
    files = glob.glob(str(tmp_path / "outputs" / "report_*.json"))
    assert len(files) == 1
    with open(files[0]) as f:
        data = json.load(f)
    assert "total_loss_low_cad" in data
    assert "items" in data
