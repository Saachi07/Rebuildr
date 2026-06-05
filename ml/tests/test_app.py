import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
import io
from app import app

FAKE_DAMAGE = {
    "room_type": "living_room",
    "overall_damage_notes": "heavy fire damage",
    "items": [
        {
            "name": "leather sofa",
            "category": "furniture",
            "damage_description": "armrest charred",
            "bounding_box": {"x1": 100, "y1": 200, "x2": 600, "y2": 700},
        },
        {
            "name": "floor lamp",
            "category": "decor",
            "damage_description": "melted",
            "bounding_box": None,
        },
    ],
}

FAKE_VIT = {
    "damage_grade": "salvageable",
    "confidence": 0.91,
    "scores": {"intact": 0.03, "salvageable": 0.91, "destroyed": 0.06},
}


def _fake_image():
    from PIL import Image
    img = Image.new("RGB", (100, 100), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


@patch("app.predict_damage", return_value=FAKE_VIT)
@patch("app.analyze_damage_photo")
def test_vit_called_for_item_with_bounding_box(mock_gemini, mock_vit):
    mock_gemini.return_value = MagicMock(model_dump=lambda: FAKE_DAMAGE)
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    assert mock_vit.call_count == 1  # only the item with a bounding_box


@patch("app.predict_damage", return_value=FAKE_VIT)
@patch("app.analyze_damage_photo")
def test_item_without_bbox_gets_destroyed(mock_gemini, mock_vit):
    mock_gemini.return_value = MagicMock(model_dump=lambda: FAKE_DAMAGE)
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg")},
        content_type="multipart/form-data",
    )
    data = resp.get_json()
    lamp = next(i for i in data["items"] if i["name"] == "floor lamp")
    assert lamp["damage_grade"] == "destroyed"
    assert lamp["vit_confidence"] == 0.0


@patch("app.predict_damage", return_value=FAKE_VIT)
@patch("app.analyze_damage_photo")
def test_vit_grade_attached_to_item(mock_gemini, mock_vit):
    mock_gemini.return_value = MagicMock(model_dump=lambda: FAKE_DAMAGE)
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg")},
        content_type="multipart/form-data",
    )
    data = resp.get_json()
    sofa = next(i for i in data["items"] if i["name"] == "leather sofa")
    assert sofa["damage_grade"] == "salvageable"
    assert sofa["vit_confidence"] == 0.91
    assert sofa["vit_scores"] == {"intact": 0.03, "salvageable": 0.91, "destroyed": 0.06}
