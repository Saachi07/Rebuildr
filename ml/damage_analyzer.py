import os
from typing import Literal, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
from pydantic import BaseModel

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

PROMPT = """Analyze this post-disaster photo and identify every visible item.

For each item:
- Name it clearly (e.g. "wooden dining chair", "microwave")
- Assign it a category
- Describe the specific damage visible (burns, smoke, collapse, water, etc.)
- Provide a bounding box as pixel coordinates normalized to 0–1000
  (x1, y1 = top-left corner; x2, y2 = bottom-right corner)

Also note the room type and overall damage observations."""


class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class DamagedItem(BaseModel):
    name: str
    category: Literal["furniture", "appliance", "electronics", "decor", "clothing", "other"]
    damage_description: str
    bounding_box: Optional[BoundingBox] = None


class DamageAssessment(BaseModel):
    room_type: Literal["kitchen", "bedroom", "living_room", "bathroom", "other"]
    items: list[DamagedItem]
    overall_damage_notes: str


def analyze_damage_photo(image_path: str) -> DamageAssessment:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set. Add it to ml/.env")

    client = genai.Client(api_key=GEMINI_API_KEY)
    image = Image.open(image_path)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[PROMPT, image],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=DamageAssessment,
        ),
    )

    return response.parsed


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python damage_analyzer.py <image_path>")
        sys.exit(1)

    result = analyze_damage_photo(sys.argv[1])
    print(result.model_dump_json(indent=2))
