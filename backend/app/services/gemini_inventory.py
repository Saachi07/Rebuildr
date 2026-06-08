"""Gemini-backed room photo → structured inventory.

Ported from the gemini-image-model branch (ml/analyzer.py). Takes raw
image bytes and returns a RoomAnalysis pydantic model containing detected
items with category, condition, brand, size, and a CAD price range.
"""

from __future__ import annotations

import io
from typing import Literal, Optional

from PIL import Image
from pydantic import BaseModel

PROMPT = """Analyze this room photo and return a structured inventory of everything visible.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition based on visible wear
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range)

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


def analyze_room_photo(image_bytes: bytes, api_key: str) -> RoomAnalysis:
    from google import genai
    from google.genai import types

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    client = genai.Client(api_key=api_key)
    image = Image.open(io.BytesIO(image_bytes))

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[PROMPT, image],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RoomAnalysis,
        ),
    )
    return response.parsed
