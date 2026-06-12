"""Gemini-backed room photo → structured inventory.

Ported from the gemini-image-model branch (ml/analyzer.py). Takes raw
image bytes and returns a RoomAnalysis pydantic model containing detected
items with category, condition, brand, size, and a CAD price range.

The `pre_post` argument changes the prompt:
  - "pre"  → photo from before the disaster; the goal is "what did the
             user own" — record items as undamaged.
  - "post" → photo from after the disaster; the goal is "what was lost
             or damaged" — record the visible damage condition.
"""

from __future__ import annotations

import io
import time
from typing import Literal, Optional

from PIL import Image
from pydantic import BaseModel

# Gemini occasionally returns 503 UNAVAILABLE ("high demand") or 429
# RESOURCE_EXHAUSTED. These are transient — retry the primary model a few
# times, then fall back to a second model, before giving up.
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.0-flash"
_TRANSIENT_MARKERS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overloaded", "high demand")


class ModelOverloaded(RuntimeError):
    """Raised when Gemini stays unavailable after retries — maps to HTTP 503."""


def _is_transient(exc: Exception) -> bool:
    return any(marker in str(exc) for marker in _TRANSIENT_MARKERS)

POST_PROMPT = """Analyze this AFTER-the-disaster room photo and return a structured inventory of everything visible.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition reflecting any visible damage (smoke, soot, water, charring, breakage)
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range, as if buying new today)
- bounding_box: the item's bounding box as normalized coordinates (x1, y1, x2, y2) where 0.0 is the left/top edge and 1.0 is the right/bottom edge of the image. If you cannot determine the bounding box, omit the field.

Be thorough. Include all significant items — furniture, appliances, electronics, decor.
If the item is destroyed beyond recognition, still record it with condition "damaged"."""

PRE_PROMPT = """Analyze this BEFORE-the-disaster room photo and return a structured inventory of everything visible.

This photo is being used as proof of what the homeowner owned prior to the loss.
Treat every item as undamaged.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition based on visible wear ONLY (new / good / fair / worn). Never use "damaged" — this is a pre-loss photo.
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range, as if buying new today)
- bounding_box: the item's bounding box as normalized coordinates (x1, y1, x2, y2) where 0.0 is the left/top edge and 1.0 is the right/bottom edge of the image. If you cannot determine the bounding box, omit the field.

Be thorough. Include all significant items — furniture, appliances, electronics, decor."""

AUTO_PROMPT = """Analyze this room photo and return a structured inventory of everything visible.

First decide whether this is a BEFORE photo (pristine, no disaster damage) or an
AFTER photo (visible fire, smoke, soot, water, charring, breakage or structural
damage) and set `detected_phase` to "before" or "after" accordingly.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition reflecting what you actually see. Only use "damaged" if there is
  visible disaster damage; otherwise use new / good / fair / worn.
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range, as if buying new today)
- bounding_box: the item's bounding box as normalized coordinates (x1, y1, x2, y2) where 0.0 is the left/top edge and 1.0 is the right/bottom edge of the image. If you cannot determine the bounding box, omit the field.

Be thorough. Include all significant items — furniture, appliances, electronics, decor."""


class PriceRange(BaseModel):
    low: int
    high: int


class BoundingBox(BaseModel):
    x1: float  # normalized 0.0–1.0 from left edge
    y1: float  # normalized 0.0–1.0 from top edge
    x2: float
    y2: float


class InventoryItem(BaseModel):
    name: str
    category: Literal["furniture", "appliance", "electronics", "decor", "clothing", "other"]
    count: int
    condition: Literal["new", "good", "fair", "worn", "damaged"]
    visible_brand: Optional[str] = None
    approximate_size: Literal["small", "medium", "large"]
    canadian_retail_estimate_cad: PriceRange
    bounding_box: Optional[BoundingBox] = None


class RoomAnalysis(BaseModel):
    room_type: Literal["kitchen", "bedroom", "living_room", "bathroom", "other"]
    items: list[InventoryItem]
    notes: str
    # Only populated when pre_post="auto" — Gemini's guess at whether this is a
    # before- or after-disaster photo, so the UI can default the toggle.
    detected_phase: Optional[Literal["before", "after"]] = None


def analyze_room_photo(
    image_bytes: bytes,
    api_key: str,
    *,
    pre_post: Literal["pre", "post", "auto"] = "post",
) -> RoomAnalysis:
    from google import genai
    from google.genai import types

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    from .gemini_schema import to_gemini_schema

    client = genai.Client(api_key=api_key)
    image = Image.open(io.BytesIO(image_bytes))
    prompt = {"pre": PRE_PROMPT, "post": POST_PROMPT, "auto": AUTO_PROMPT}[pre_post]
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=to_gemini_schema(RoomAnalysis),
    )

    response = _generate_with_retry(client, [prompt, image], config)
    return RoomAnalysis.model_validate_json(response.text)


def _generate_with_retry(client, contents, config, *, attempts: int = 3):
    """Call Gemini, retrying the primary model on transient outages and then
    falling back to a second model. Raises ModelOverloaded if it stays
    unavailable; re-raises any non-transient error immediately."""
    for attempt in range(attempts):
        try:
            return client.models.generate_content(
                model=PRIMARY_MODEL, contents=contents, config=config
            )
        except Exception as exc:  # noqa: BLE001
            if not _is_transient(exc):
                raise
            if attempt < attempts - 1:
                time.sleep(1.5 * (attempt + 1))  # 1.5s, 3s

    # Primary stayed unavailable — try the fallback model once.
    try:
        return client.models.generate_content(
            model=FALLBACK_MODEL, contents=contents, config=config
        )
    except Exception as exc:  # noqa: BLE001
        if _is_transient(exc):
            raise ModelOverloaded(
                "The image model is busy right now. Please try again in a moment."
            ) from exc
        raise
