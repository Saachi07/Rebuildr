import os
from typing import Literal, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
from pydantic import BaseModel, Field

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

PROMPT = """Analyze this room photo and return a structured inventory of movable belongings and furnishings visible.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition based on visible wear
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range)

Include: furniture, appliances, electronics, decor, rugs, curtains, light fixtures (e.g. chandeliers, lamps), artwork, and other movable personal belongings.

Do NOT include: floors, flooring materials, walls, wallpaper, paint, ceilings, baseboards, door frames, window frames, chandeliers or any other permanent structural or architectural element of the building."""


class PriceRange(BaseModel):
    low: int
    high: int


class InventoryItem(BaseModel):
    name: str
    yolo_label: str = Field(
        description="Short 1-2 word noun for object detection. Examples: 'chair', 'sofa', 'refrigerator', 'bookshelf'. No adjectives."
    )
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


def analyze_room_photo(image_path: str) -> RoomAnalysis:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set. Add it to ml/.env")

    client = genai.Client(api_key=GEMINI_API_KEY)
    image = Image.open(image_path)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[PROMPT, image],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RoomAnalysis,
        ),
    )

    return response.parsed


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <image_path>")
        sys.exit(1)

    result = analyze_room_photo(sys.argv[1])
    print(result.model_dump_json(indent=2))
