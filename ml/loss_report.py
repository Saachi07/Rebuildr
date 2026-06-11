import json
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


class PriceRange(BaseModel):
    low: int
    high: int


class ItemLoss(BaseModel):
    name: str
    category: str
    pre_disaster_value: PriceRange
    pre_count: int
    salvageable_count: int
    damaged_count: int
    status: str
    estimated_loss: PriceRange


class LossReport(BaseModel):
    generated_at: str
    room_type: str
    items: list[ItemLoss]
    total_loss_low_cad: int
    total_loss_high_cad: int
    summary: str


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
    items = after_damage.get("items", [])
    room_type = after_damage.get("room_type", before_inventory.get("room_type", "other"))
    generated_at = datetime.now(timezone.utc).isoformat()

    item_losses = []
    for item in items:
        price = item.get("canadian_retail_estimate_cad", {})
        pre_count = item.get("pre_count", item.get("count", 1))
        price_low = price.get("low", 0)
        price_high = price.get("high", 0)
        total_low = price_low * pre_count
        total_high = price_high * pre_count
        damaged_count = item.get("damaged_count", 0)
        loss_fraction = damaged_count / pre_count if pre_count > 0 else 0

        item_losses.append(ItemLoss(
            name=item["name"],
            category=item.get("category", "other"),
            pre_disaster_value=PriceRange(low=total_low, high=total_high),
            pre_count=pre_count,
            salvageable_count=item.get("salvageable_count", 0),
            damaged_count=damaged_count,
            status=item.get("status", "damaged"),
            estimated_loss=PriceRange(
                low=round(total_low * loss_fraction),
                high=round(total_high * loss_fraction),
            ),
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
        summary=summary,
    )

    os.makedirs("outputs", exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with open(f"outputs/report_{timestamp}.json", "w") as f:
        json.dump(report.model_dump(), f, indent=2)

    return report
