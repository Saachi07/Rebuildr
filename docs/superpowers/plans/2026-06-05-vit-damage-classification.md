# ViT Damage Classification Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gemini's damage grading with the fine-tuned ViT classifier so that ViT is the sole source of `damage_grade` in the pipeline.

**Architecture:** Gemini detects items and bounding boxes from the after-image; `predict_damage()` in `classifier/predict.py` classifies each cropped item as intact/salvageable/destroyed; `loss_report.py` uses a 3-class loss factor table and writes the final report to `outputs/report_{timestamp}.json`.

**Tech Stack:** Python 3.11, Flask, Pydantic v2, google-genai, PyTorch, HuggingFace Transformers (ViT), pytest

**Prerequisite:** A trained ViT checkpoint must exist at `ml/checkpoints/` before the pipeline can run. Train it with:
```bash
cd ml
python -m classifier.train --dataset ../dataset --output ./checkpoints
```

---

## File Map

| File | Change |
|---|---|
| `ml/damage_analyzer.py` | Remove `damage_grade` from `DamagedItem` schema and from Gemini prompt |
| `ml/app.py` | Wire `predict_damage()` into `/ml/analyze-damage` endpoint |
| `ml/loss_report.py` | New 3-class loss factors, updated Pydantic models, JSON file output |
| `ml/tests/test_damage_analyzer.py` | New — unit tests for updated schema/prompt |
| `ml/tests/test_app.py` | New — tests for ViT wiring in the endpoint |
| `ml/tests/test_loss_report.py` | New — tests for new loss factors and JSON file output |
| `ml/classifier/predict.py` | No changes needed |

---

## Task 1: Strip `damage_grade` from `damage_analyzer.py`

**Files:**
- Modify: `ml/damage_analyzer.py`
- Create: `ml/tests/test_damage_analyzer.py`

- [ ] **Step 1: Write the failing tests**

Create `ml/tests/__init__.py` (empty) and `ml/tests/test_damage_analyzer.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from damage_analyzer import DamagedItem, PROMPT


def test_damaged_item_has_no_damage_grade_field():
    fields = DamagedItem.model_fields
    assert "damage_grade" not in fields


def test_damaged_item_requires_name_category_description():
    item = DamagedItem(
        name="wooden chair",
        category="furniture",
        damage_description="legs charred",
    )
    assert item.name == "wooden chair"
    assert item.damage_description == "legs charred"


def test_prompt_does_not_mention_damage_grade():
    assert "damage grade" not in PROMPT.lower()
    assert "intact" not in PROMPT
    assert "smoke_damaged" not in PROMPT
    assert "partially_burned" not in PROMPT
    assert "destroyed" not in PROMPT
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ml
pytest tests/test_damage_analyzer.py -v
```

Expected: 3 failures — `damage_grade` still exists in schema and prompt.

- [ ] **Step 3: Remove `damage_grade` from `DamagedItem` schema**

In `ml/damage_analyzer.py`, replace lines 37–42:

```python
class DamagedItem(BaseModel):
    name: str
    category: Literal["furniture", "appliance", "electronics", "decor", "clothing", "other"]
    damage_description: str
    bounding_box: Optional[BoundingBox] = None
```

- [ ] **Step 4: Replace the Gemini PROMPT**

Replace the full `PROMPT` string (lines 14–27) with:

```python
PROMPT = """Analyze this post-disaster photo and identify every visible item.

For each item:
- Name it clearly (e.g. "wooden dining chair", "microwave")
- Assign it a category
- Describe the specific damage visible (burns, smoke, collapse, water, etc.)
- Provide a bounding box as pixel coordinates normalized to 0–1000
  (x1, y1 = top-left corner; x2, y2 = bottom-right corner)

Also note the room type and overall damage observations."""
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd ml
pytest tests/test_damage_analyzer.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add ml/damage_analyzer.py ml/tests/__init__.py ml/tests/test_damage_analyzer.py
git commit -m "feat: remove damage_grade from Gemini damage schema — ViT will classify"
```

---

## Task 2: Wire ViT into the `/ml/analyze-damage` endpoint

**Files:**
- Modify: `ml/app.py`
- Create: `ml/tests/test_app.py`

- [ ] **Step 1: Write the failing tests**

Create `ml/tests/test_app.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ml
pytest tests/test_app.py -v
```

Expected: 3 failures — `predict_damage` not imported or wired.

- [ ] **Step 3: Add the import and wire ViT into the endpoint**

Replace the full `ml/app.py` with:

```python
import os
import tempfile

from flask import Flask, jsonify, request

from analyzer import analyze_room_photo
from classifier.predict import predict_damage
from damage_analyzer import analyze_damage_photo
from loss_report import generate_loss_report

app = Flask(__name__)


def _save_upload(file) -> str:
    filename = file.filename or ""
    suffix = os.path.splitext(filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    file.save(tmp.name)
    tmp.close()
    return tmp.name


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/ml/analyze-photo", methods=["POST"])
def analyze_photo():
    """Before-disaster photo → structured room inventory with CAD price estimates."""
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    tmp_path = _save_upload(request.files["image"])
    try:
        result = analyze_room_photo(tmp_path)
        return jsonify(result.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route("/ml/analyze-damage", methods=["POST"])
def analyze_damage():
    """Post-disaster photo → per-item damage assessment. Gemini detects items;
    ViT classifies damage grade for each item with a bounding box."""
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    tmp_path = _save_upload(request.files["image"])
    try:
        result = analyze_damage_photo(tmp_path)
        damage_dict = result.model_dump()

        for item in damage_dict["items"]:
            bbox = item.get("bounding_box")
            if bbox:
                vit = predict_damage(tmp_path, bounding_box=bbox)
                item["damage_grade"] = vit["damage_grade"]
                item["vit_confidence"] = vit["confidence"]
                item["vit_scores"] = vit["scores"]
            else:
                item["damage_grade"] = "destroyed"
                item["vit_confidence"] = 0.0
                item["vit_scores"] = {}

        return jsonify(damage_dict)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route("/ml/loss-report", methods=["POST"])
def loss_report():
    """Before inventory + after damage assessment → itemised loss report with CAD totals.

    Body (JSON):
    {
        "before_inventory": { ...output from /ml/analyze-photo... },
        "after_damage":     { ...output from /ml/analyze-damage... }
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    before_inventory = data.get("before_inventory")
    after_damage = data.get("after_damage")

    if not before_inventory or not after_damage:
        return jsonify({"error": "Both before_inventory and after_damage are required"}), 400

    try:
        result = generate_loss_report(before_inventory, after_damage)
        return jsonify(result.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5001, use_reloader=False)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ml
pytest tests/test_app.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add ml/app.py ml/tests/test_app.py
git commit -m "feat: wire ViT classifier into analyze-damage endpoint"
```

---

## Task 3: Update `loss_report.py` — 3-class factors, new schema, JSON output

**Files:**
- Modify: `ml/loss_report.py`
- Create: `ml/tests/test_loss_report.py`

- [ ] **Step 1: Write the failing tests**

Create `ml/tests/test_loss_report.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ml
pytest tests/test_loss_report.py -v
```

Expected: failures on LOSS_FACTORS keys, schema field names, and missing JSON file output.

- [ ] **Step 3: Rewrite `ml/loss_report.py`**

Replace the entire file with:

```python
import json
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

LOSS_FACTORS = {
    "intact": 0.0,
    "salvageable": 0.6,
    "destroyed": 1.0,
}


class PriceRange(BaseModel):
    low: int
    high: int


class ItemLoss(BaseModel):
    name: str
    category: str
    pre_disaster_value: PriceRange
    damage_grade: str
    vit_confidence: float
    vit_scores: dict
    damage_description: str
    estimated_loss: PriceRange
    bounding_box: Optional[dict] = None


class LossReport(BaseModel):
    generated_at: str
    room_type: str
    items: list[ItemLoss]
    total_loss_low_cad: int
    total_loss_high_cad: int
    items_missing_from_after: list[str]
    summary: str


def _match_item(before_name: str, after_items: list[dict]) -> Optional[dict]:
    """Match a before-inventory item to an after-damage item by name similarity."""
    before_words = set(before_name.lower().split())
    best_match = None
    best_score = 0

    for after_item in after_items:
        after_words = set(after_item["name"].lower().split())
        overlap = len(before_words & after_words)
        if overlap > best_score:
            best_score = overlap
            best_match = after_item

    return best_match if best_score > 0 else None


def _generate_summary(report_data: dict) -> str:
    if not GEMINI_API_KEY:
        return "Loss report generated. API key required for narrative summary."

    client = genai.Client(api_key=GEMINI_API_KEY)

    prompt = f"""Write a concise, professional insurance claim summary based on this loss report.
Keep it under 150 words. Be factual and specific about what was lost and the estimated value.

Loss report data:
{json.dumps(report_data, indent=2)}"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt],
    )

    return response.text.strip()


def generate_loss_report(before_inventory: dict, after_damage: dict) -> LossReport:
    before_items = before_inventory.get("items", [])
    after_items = after_damage.get("items", [])
    room_type = before_inventory.get("room_type", after_damage.get("room_type", "other"))
    generated_at = datetime.now(timezone.utc).isoformat()

    item_losses = []
    missing_names = []

    for before_item in before_items:
        match = _match_item(before_item["name"], after_items)
        price = before_item.get("canadian_retail_estimate_cad", {})
        low = price.get("low", 0) * before_item.get("count", 1)
        high = price.get("high", 0) * before_item.get("count", 1)

        if match:
            grade = match.get("damage_grade", "destroyed")
            factor = LOSS_FACTORS.get(grade, 1.0)
            item_losses.append(ItemLoss(
                name=before_item["name"],
                category=before_item.get("category", "other"),
                pre_disaster_value=PriceRange(low=low, high=high),
                damage_grade=grade,
                vit_confidence=match.get("vit_confidence", 0.0),
                vit_scores=match.get("vit_scores", {}),
                damage_description=match.get("damage_description", ""),
                estimated_loss=PriceRange(low=int(low * factor), high=int(high * factor)),
                bounding_box=match.get("bounding_box"),
            ))
        else:
            missing_names.append(before_item["name"])
            item_losses.append(ItemLoss(
                name=before_item["name"],
                category=before_item.get("category", "other"),
                pre_disaster_value=PriceRange(low=low, high=high),
                damage_grade="destroyed",
                vit_confidence=0.0,
                vit_scores={},
                damage_description="Item not found in post-disaster photo — assumed total loss.",
                estimated_loss=PriceRange(low=low, high=high),
                bounding_box=None,
            ))

    total_low = sum(i.estimated_loss.low for i in item_losses)
    total_high = sum(i.estimated_loss.high for i in item_losses)

    report_data = {
        "room_type": room_type,
        "total_loss_cad": {"low": total_low, "high": total_high},
        "items": [i.model_dump() for i in item_losses],
    }

    summary = _generate_summary(report_data)

    report = LossReport(
        generated_at=generated_at,
        room_type=room_type,
        items=item_losses,
        total_loss_low_cad=total_low,
        total_loss_high_cad=total_high,
        items_missing_from_after=missing_names,
        summary=summary,
    )

    os.makedirs("outputs", exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with open(f"outputs/report_{timestamp}.json", "w") as f:
        json.dump(report.model_dump(), f, indent=2)

    return report
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ml
pytest tests/test_loss_report.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Run the full test suite**

```bash
cd ml
pytest tests/ -v
```

Expected: all tests pass (test_damage_analyzer, test_app, test_loss_report).

- [ ] **Step 6: Commit**

```bash
git add ml/loss_report.py ml/tests/test_loss_report.py
git commit -m "feat: update loss_report to 3-class ViT factors and write JSON output file"
```

---

## Task 4: Smoke Test End-to-End

This task verifies the full pipeline works with the trained ViT checkpoint. **Requires a checkpoint at `ml/checkpoints/`.**

- [ ] **Step 1: Start the Flask server**

```bash
cd ml
python app.py
```

Expected: `* Running on http://127.0.0.1:5001`

- [ ] **Step 2: Call `/ml/analyze-photo` with a before image**

```bash
curl -s -X POST http://127.0.0.1:5001/ml/analyze-photo \
  -F "image=@/path/to/before_photo.jpg" | python -m json.tool
```

Expected: JSON with `room_type`, `items[]` each containing `name`, `canadian_retail_estimate_cad`.

- [ ] **Step 3: Call `/ml/analyze-damage` with an after image**

```bash
curl -s -X POST http://127.0.0.1:5001/ml/analyze-damage \
  -F "image=@/path/to/after_photo.jpg" | python -m json.tool
```

Expected: JSON with `items[]` each containing `damage_grade` (intact/salvageable/destroyed), `vit_confidence`, `vit_scores`.

- [ ] **Step 4: Call `/ml/loss-report` with both inventories**

Paste the outputs from steps 2 and 3 as `before_inventory` and `after_damage`:

```bash
curl -s -X POST http://127.0.0.1:5001/ml/loss-report \
  -H "Content-Type: application/json" \
  -d '{
    "before_inventory": { ...paste step 2 output... },
    "after_damage": { ...paste step 3 output... }
  }' | python -m json.tool
```

Expected: JSON with `total_loss_low_cad`, `total_loss_high_cad`, `items[]` with ViT grades and loss ranges, `summary` narrative.

- [ ] **Step 5: Verify JSON file was written**

```bash
ls ml/outputs/
cat ml/outputs/report_*.json | python -m json.tool
```

Expected: one `report_{timestamp}.json` file with the full report.

- [ ] **Step 6: Final commit**

```bash
git add ml/outputs/.gitkeep
git commit -m "chore: add outputs/.gitkeep so the directory is tracked"
```
