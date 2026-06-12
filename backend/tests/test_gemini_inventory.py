from app.services.gemini_inventory import BoundingBox, InventoryItem, PriceRange, RoomAnalysis


def _base_item(**kwargs):
    return dict(
        name="wooden chair",
        category="furniture",
        count=1,
        condition="good",
        approximate_size="medium",
        canadian_retail_estimate_cad=PriceRange(low=100, high=300),
        **kwargs,
    )


def test_bounding_box_is_optional_by_default():
    item = InventoryItem(**_base_item())
    assert item.bounding_box is None


def test_bounding_box_accepts_valid_normalized_coords():
    item = InventoryItem(**_base_item(
        bounding_box=BoundingBox(x1=0.1, y1=0.2, x2=0.5, y2=0.8)
    ))
    assert item.bounding_box.x1 == 0.1
    assert item.bounding_box.y2 == 0.8


def test_bounding_box_coerces_from_dict():
    item = InventoryItem(**_base_item(
        bounding_box={"x1": 0.0, "y1": 0.0, "x2": 1.0, "y2": 1.0}
    ))
    assert isinstance(item.bounding_box, BoundingBox)
    assert item.bounding_box.x2 == 1.0


def test_room_analysis_serialises_bbox():
    item = InventoryItem(**_base_item(
        bounding_box=BoundingBox(x1=0.1, y1=0.2, x2=0.5, y2=0.8)
    ))
    analysis = RoomAnalysis(room_type="living_room", items=[item], notes="")
    d = analysis.model_dump()
    assert d["items"][0]["bounding_box"]["x1"] == 0.1


def test_bounding_box_none_serialises_as_null():
    item = InventoryItem(**_base_item())
    d = item.model_dump()
    assert "bounding_box" in d
    assert d["bounding_box"] is None
