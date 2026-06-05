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
