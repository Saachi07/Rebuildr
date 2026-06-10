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
from typing import Literal, Optional

from PIL import Image
from pydantic import BaseModel

POST_PROMPT = """Analyze this AFTER-the-disaster room photo and return a structured inventory of everything visible.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition reflecting any visible damage (smoke, soot, water, charring, breakage)
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range, as if buying new today)

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

Be thorough. Include all significant items — furniture, appliances, electronics, decor."""


class PriceRange(BaseModel):
    low: int
    high: int


class InventoryItem(BaseModel):
    name: str
    category: Literal["furniture", "appliance", "electronics", "decor", "clothing", "other"]
    count: int
    condition: Literal["new", "good", "fair", "worn", "damaged"]
    visible_brand: Optional[str] = None
    approximate_size: Literal["small", "medium", "large"]
    canadian_retail_estimate_cad: PriceRange


class RoomAnalysis(BaseModel):
    room_type: Literal["kitchen", "bedroom", "living_room", "bathroom", "other"]
    items: list[InventoryItem]
    notes: str


def analyze_room_photo(
    image_bytes: bytes,
    api_key: str,
    *,
    pre_post: Literal["pre", "post"] = "post",
) -> RoomAnalysis:
    from google import genai
    from google.genai import types

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    client = genai.Client(api_key=api_key)
    image = Image.open(io.BytesIO(image_bytes))
    prompt = PRE_PROMPT if pre_post == "pre" else POST_PROMPT

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt, image],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RoomAnalysis,
        ),
    )
    return response.parsed
