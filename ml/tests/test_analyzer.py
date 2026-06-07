import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from analyzer import InventoryItem


def test_inventory_item_has_yolo_label_field():
    assert "yolo_label" in InventoryItem.model_fields


def test_inventory_item_yolo_label_accepts_short_noun():
    item = InventoryItem(
        name="blue velvet dining chair",
        yolo_label="chair",
        category="furniture",
        count=3,
        condition="good",
        approximate_size="medium",
        canadian_retail_estimate_cad={"low": 200, "high": 400},
    )
    assert item.yolo_label == "chair"


def test_inventory_item_yolo_label_has_description():
    field = InventoryItem.model_fields["yolo_label"]
    assert field.description is not None
    assert "adjective" in field.description.lower()
