import sys, os, json, io
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch
from app import app


FAKE_PRE = {
    "room_type": "living_room",
    "items": [
        {
            "name": "leather sofa",
            "yolo_label": "sofa",
            "category": "furniture",
            "count": 1,
            "condition": "good",
            "approximate_size": "large",
            "canadian_retail_estimate_cad": {"low": 800, "high": 2500},
        },
        {
            "name": "floor lamp",
            "yolo_label": "lamp",
            "category": "decor",
            "count": 1,
            "condition": "good",
            "approximate_size": "medium",
            "canadian_retail_estimate_cad": {"low": 50, "high": 150},
        },
    ],
}


def _fake_image():
    from PIL import Image
    img = Image.new("RGB", (100, 100), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


@patch("app.detect_furniture", return_value={"sofa": 1, "lamp": 0})
def test_detected_item_is_safe(mock_yolo):
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg"), "pre_inventory": json.dumps(FAKE_PRE)},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    sofa = next(i for i in data["items"] if i["name"] == "leather sofa")
    assert sofa["status"] == "safe"
    assert sofa["salvageable_count"] == 1
    assert sofa["damaged_count"] == 0


@patch("app.detect_furniture", return_value={"sofa": 1, "lamp": 0})
def test_undetected_item_is_damaged(mock_yolo):
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg"), "pre_inventory": json.dumps(FAKE_PRE)},
        content_type="multipart/form-data",
    )
    data = resp.get_json()
    lamp = next(i for i in data["items"] if i["name"] == "floor lamp")
    assert lamp["status"] == "damaged"
    assert lamp["salvageable_count"] == 0
    assert lamp["damaged_count"] == 1


@patch("app.detect_furniture", return_value={"chair": 2})
def test_partial_detection_gives_partial_status(mock_yolo):
    pre = {
        "room_type": "living_room",
        "items": [{
            "name": "dining chair",
            "yolo_label": "chair",
            "category": "furniture",
            "count": 3,
            "condition": "good",
            "approximate_size": "medium",
            "canadian_retail_estimate_cad": {"low": 100, "high": 200},
        }],
    }
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg"), "pre_inventory": json.dumps(pre)},
        content_type="multipart/form-data",
    )
    data = resp.get_json()
    chair = data["items"][0]
    assert chair["status"] == "partial"
    assert chair["salvageable_count"] == 2
    assert chair["damaged_count"] == 1


def test_missing_pre_inventory_returns_400():
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"image": (_fake_image(), "test.jpg")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400


def test_missing_image_returns_400():
    client = app.test_client()
    resp = client.post(
        "/ml/analyze-damage",
        data={"pre_inventory": json.dumps(FAKE_PRE)},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
