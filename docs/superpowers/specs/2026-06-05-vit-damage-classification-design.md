# ViT Damage Classification Pipeline — Design Spec

**Date:** 2026-06-05
**Status:** Approved

## Overview

Replace Gemini's damage grading in the after-image analysis step with a fine-tuned ViT classifier. Gemini remains responsible for item detection, bounding boxes, and the loss summary narrative. ViT is the sole source of damage grades.

This is a demo build — accuracy is acceptable over completeness. The ViT model is fine-tuned from `google/vit-base-patch16-224` on a chairs/tables damage dataset (intact / salvageable / destroyed). It will generalize reasonably to other furniture types via transfer learning.

---

## Data Flow

```
BEFORE IMAGE
  └─ POST /ml/analyze-photo
       └─ Gemini → item name, category, count, condition, price range (CAD)
            └─ Returns: before inventory JSON

AFTER IMAGE
  └─ POST /ml/analyze-damage
       └─ Gemini → item name, category, damage_description, bounding_box
            └─ For each item with a bounding_box:
                 crop image → ViT → damage_grade + confidence scores
            └─ Items without bounding_box → default to "destroyed"
            └─ Returns: after damage JSON (grade from ViT only)

LOSS REPORT
  └─ POST /ml/loss-report
       └─ Match before items → after items (word overlap)
       └─ Apply loss factors: intact=0%, salvageable=60%, destroyed=100%
       └─ Gemini writes insurance claim narrative
       └─ Writes report to outputs/report_{timestamp}.json
       └─ Returns same JSON to caller
```

`smoke_damaged` is removed — it was a Gemini-only label with no ViT equivalent.

---

## File Changes

### `ml/damage_analyzer.py`
- Remove `damage_grade` field from `DamagedItem` Pydantic schema
- Remove damage grading language from Gemini prompt
- Gemini returns: name, category, damage_description, bounding_box only

### `ml/app.py`
- In the `/ml/analyze-damage` endpoint, after Gemini returns items:
  - Loop over items
  - For each item with a `bounding_box`, crop the saved image and call `predict_damage()` from `classifier/predict.py`
  - Attach `damage_grade`, `vit_confidence`, `vit_scores` to the item
  - Items without a bounding box default to `damage_grade: "destroyed"`

### `ml/loss_report.py`
- Update `LOSS_FACTORS` to ViT's 3 classes:
  ```python
  LOSS_FACTORS = {"intact": 0.0, "salvageable": 0.6, "destroyed": 1.0}
  ```
- At end of `generate_loss_report()`, write report dict to `outputs/report_{timestamp}.json`

### `ml/classifier/predict.py`
- No changes expected — already handles bounding box cropping and returns `{damage_grade, confidence, scores}`

### Unchanged
- `ml/analyzer.py`
- `ml/classifier/model.py`, `train.py`, `dataset.py`

---

## JSON Output Schema

Written to `outputs/report_{timestamp}.json` and returned from `POST /ml/loss-report`:

```json
{
  "generated_at": "2026-06-05T12:00:00Z",
  "room_type": "living_room",
  "total_loss_low_cad": 1260,
  "total_loss_high_cad": 4560,
  "summary": "A fire caused significant damage to the living room...",
  "items": [
    {
      "name": "leather sofa",
      "category": "furniture",
      "pre_disaster_value": { "low": 800, "high": 2500 },
      "damage_grade": "salvageable",
      "vit_confidence": 0.91,
      "vit_scores": { "intact": 0.03, "salvageable": 0.91, "destroyed": 0.06 },
      "damage_description": "left armrest charred, cushions melted",
      "estimated_loss": { "low": 480, "high": 1500 },
      "bounding_box": { "x1": 100, "y1": 200, "x2": 600, "y2": 700 }
    }
  ],
  "items_missing_from_after": ["floor lamp", "bookshelf"]
}
```

### Key Fields for Frontend
| Field | Purpose |
|---|---|
| `damage_grade` | ViT classification: intact / salvageable / destroyed |
| `vit_confidence` | Model certainty — useful for flagging low-confidence items |
| `estimated_loss` | Low/high CAD range per item |
| `total_loss_low_cad` / `total_loss_high_cad` | Aggregate for damage report header |
| `items_missing_from_after` | Before-inventory items not found in after photo (assumed destroyed) |

---

## Loss Factor Mapping

| ViT Class | Loss Factor | CAD Impact |
|---|---|---|
| intact | 0% | No loss |
| salvageable | 60% | Partial loss |
| destroyed | 100% | Total loss |

---

## Constraints & Assumptions

- ViT model must be trained before the pipeline can run: `python -m classifier.train --dataset ../../dataset --output ./checkpoints`
- Dataset covers chairs and tables only; model generalizes to other furniture via transfer learning
- Items Gemini cannot localize (no bounding box) are conservatively graded as destroyed
- `outputs/` directory is created at runtime if it does not exist
- Demo build — no auth, no persistent DB, stateless endpoints
