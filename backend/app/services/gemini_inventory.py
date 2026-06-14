"""Gemini-backed room photo → structured inventory.

Ported from the gemini-image-model branch (ml/analyzer.py). Takes raw
image bytes and returns a RoomAnalysis pydantic model containing detected
items with category, condition, brand, size, and a CAD price range.

The `pre_post` argument changes the prompt:
  - "pre"  → photo from before the disaster; the goal is "what did the
             user own", record items as undamaged.
  - "post" → photo from after the disaster; the goal is "what was lost
             or damaged", record the visible damage condition.
"""

from __future__ import annotations

import io
import time
from typing import Literal, Optional

from PIL import Image
from pydantic import BaseModel

# Gemini occasionally returns 503 UNAVAILABLE ("high demand") or 429
# RESOURCE_EXHAUSTED. These are transient, retry the primary model a few
# times, then fall back to a second model, before giving up.
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.0-flash"
_TRANSIENT_MARKERS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overloaded", "high demand")


class ModelOverloaded(RuntimeError):
    """Raised when Gemini stays unavailable after retries, maps to HTTP 503."""


def _is_transient(exc: Exception) -> bool:
    return any(marker in str(exc) for marker in _TRANSIENT_MARKERS)

# Shared prompt block: Canadian homeowner policy conventions for deciding
# whether an item is claimed as contents (personal property) or as part of
# the building (dwelling coverage). Mirrored by classify_claim_class below,
# which fills the field deterministically when the model omits it.
CLAIM_CLASS_GUIDE = """- claim_class: "contents" for personal property (furniture, electronics, clothing,
  area rugs, freestanding appliances like a fridge, washer, or microwave, decor,
  books, toys, kitchenware). "building" for parts of the dwelling (wall-to-wall
  carpet, hardwood/laminate/tile flooring, wallpaper, paint, light fixtures,
  ceiling fans, built-in cabinets, countertops, built-in appliances like a wall
  oven or built-in dishwasher, plumbing fixtures, windows, doors). "unclear" for
  anything ambiguous, for example when you cannot tell if an appliance is built in.
- claim_note: null for contents. For building items, one short sentence: this is
  usually part of the building, homeowners claim it under dwelling coverage, and
  renters should report it to their landlord. Keep it under 140 characters."""

# Salvageability rules for photos with visible damage. Only meaningful for
# post-loss photos; pre-loss photos always get null (enforced again in the
# post-pass, see finalize_analysis).
SALVAGE_GUIDE = """- salvageable: judge from the damage type and material. Solid metal or glass with
  smoke residue is often cleanable, so "likely". Upholstered furniture, mattresses,
  or particle board soaked by flood water is "unlikely". Electronics exposed to
  water or heat are "needs_professional_assessment". Anything ambiguous is
  "needs_professional_assessment", never a guess.
- salvage_note: one short plain-language sentence explaining why. When relevant,
  advise confirming with the insurer or a restoration professional. Never present
  salvageability as a promise."""

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

Be thorough. Include all significant items, furniture, appliances, electronics, decor.
If the item is destroyed beyond recognition, still record it with condition "damaged".

Also include for each item:
""" + SALVAGE_GUIDE + "\n" + CLAIM_CLASS_GUIDE

PRE_PROMPT = """Analyze this BEFORE-the-disaster room photo and return a structured inventory of everything visible.

This photo is being used as proof of what the homeowner owned prior to the loss.
Treat every item as undamaged.

For each item include:
- A descriptive name (e.g. "wooden dining chair", "stainless steel refrigerator")
- Category
- Count of identical items visible
- Condition based on visible wear ONLY (new / good / fair / worn). Never use "damaged", this is a pre-loss photo.
- Brand if visible on the item
- Approximate size
- Canadian retail price estimate in CAD (realistic low and high range, as if buying new today)
- bounding_box: the item's bounding box as normalized coordinates (x1, y1, x2, y2) where 0.0 is the left/top edge and 1.0 is the right/bottom edge of the image. If you cannot determine the bounding box, omit the field.

Be thorough. Include all significant items, furniture, appliances, electronics, decor.

Also include for each item:
- salvageable and salvage_note: always null. This is a pre-loss photo, so there is
  no damage to assess.
""" + CLAIM_CLASS_GUIDE

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

Be thorough. Include all significant items, furniture, appliances, electronics, decor.

Also include for each item:
""" + SALVAGE_GUIDE + """
  Only assess salvageability when detected_phase is "after"; if detected_phase is
  "before", set salvageable and salvage_note to null.
""" + CLAIM_CLASS_GUIDE


class PriceRange(BaseModel):
    low: int
    high: int


class BoundingBox(BaseModel):
    x1: float  # normalized 0.0 to 1.0 from left edge
    y1: float  # normalized 0.0 to 1.0 from top edge
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
    # Salvageability is only assessed on post-loss photos and is never a
    # promise; salvage_note tells the user when to confirm with their insurer
    # or a restoration professional.
    salvageable: Optional[Literal["likely", "unlikely", "needs_professional_assessment"]] = None
    salvage_note: Optional[str] = None
    # Whether this is claimed as personal property (contents) or is part of
    # the building (dwelling coverage). Filled by the model, backstopped by
    # classify_claim_class when omitted.
    claim_class: Optional[Literal["contents", "building", "unclear"]] = None
    claim_note: Optional[str] = None


class RoomAnalysis(BaseModel):
    room_type: Literal["kitchen", "bedroom", "living_room", "bathroom", "other"]
    items: list[InventoryItem]
    notes: str
    # Only populated when pre_post="auto", Gemini's guess at whether this is a
    # before- or after-disaster photo, so the UI can default the toggle.
    detected_phase: Optional[Literal["before", "after"]] = None
    # Computed in Python after the model responds (so the math is right):
    # the estimate range counting only contents items, which is what a
    # personal property claim can actually include.
    contents_total_estimate_cad: Optional[PriceRange] = None
    building_items_present: bool = False


# Keyword fallback for claim_class, mirroring CLAIM_CLASS_GUIDE. Order
# matters: building checks run first because names like "carpet" should not
# fall through to a contents category default.
_BUILDING_KEYWORDS = (
    "wall-to-wall carpet", "wall to wall carpet", "carpeting", "carpet",
    "hardwood", "laminate", "tile floor", "tiling", "flooring", "floor",
    "wallpaper", "paint", "light fixture", "ceiling fan", "ceiling light",
    "chandelier", "pot light", "built-in", "built in", "countertop",
    "counter top", "cabinet", "cupboard", "wall oven", "range hood",
    "plumbing", "sink", "faucet", "toilet", "bathtub", "shower", "window",
    "door", "baseboard", "trim", "molding", "moulding", "radiator",
    "water heater", "furnace",
)

_CONTENTS_EXCEPTIONS = (
    # Items whose names contain a building keyword but are clearly portable.
    "area rug", "throw rug", "rug", "door mat", "doormat", "window fan",
    "floor lamp", "table lamp", "lamp", "curtain", "drape", "blind",
    "mirror", "painting", "paint set", "paint brush",
)

_BUILDING_NOTE = (
    "Usually part of the building. Homeowners claim it under dwelling "
    "coverage; renters should report it to their landlord."
)
_UNCLEAR_NOTE = (
    "Could be contents or part of the building. Ask your adjuster how to "
    "claim it."
)


def classify_claim_class(name: str, category: str) -> tuple[str, Optional[str]]:
    """Deterministic contents-vs-building fallback used when the model omits
    claim_class. Canadian homeowner policy convention: portable belongings
    are contents (personal property coverage); permanent fixtures and
    finishes are part of the building (dwelling coverage)."""
    lowered = (name or "").lower()
    if any(kw in lowered for kw in _CONTENTS_EXCEPTIONS):
        return "contents", None
    if any(kw in lowered for kw in _BUILDING_KEYWORDS):
        return "building", _BUILDING_NOTE
    if category in {"furniture", "electronics", "decor", "clothing"}:
        return "contents", None
    if category == "appliance":
        # Freestanding appliances are contents, built-ins are building; from
        # a name alone we usually cannot tell which. Dishwashers and ovens
        # are checked first because they are usually built in but the names
        # contain freestanding keywords ("washer").
        if any(kw in lowered for kw in ("dishwasher", "oven", "stove", "range", "cooktop")):
            return "unclear", _UNCLEAR_NOTE
        if any(kw in lowered for kw in ("fridge", "refrigerator", "washer", "dryer", "microwave", "toaster", "kettle", "blender", "air fryer", "vacuum")):
            return "contents", None
        return "unclear", _UNCLEAR_NOTE
    return "unclear", _UNCLEAR_NOTE


def finalize_analysis(analysis: "RoomAnalysis", pre_post: str) -> "RoomAnalysis":
    """Post-pass after Gemini responds: backstop claim_class, enforce the
    pre-loss salvageability rule, and compute contents-only totals in Python
    so the arithmetic never depends on the model."""
    phase = analysis.detected_phase if pre_post == "auto" else ("before" if pre_post == "pre" else "after")
    contents_low = 0
    contents_high = 0
    building_present = False
    for item in analysis.items:
        if not item.claim_class:
            item.claim_class, item.claim_note = classify_claim_class(item.name, item.category)
        if phase == "before":
            item.salvageable = None
            item.salvage_note = None
        if item.claim_class == "building":
            building_present = True
        elif item.claim_class == "contents":
            count = max(item.count, 1)
            contents_low += item.canadian_retail_estimate_cad.low * count
            contents_high += item.canadian_retail_estimate_cad.high * count
    analysis.contents_total_estimate_cad = PriceRange(low=contents_low, high=contents_high)
    analysis.building_items_present = building_present
    return analysis


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
    analysis = RoomAnalysis.model_validate_json(response.text)
    return finalize_analysis(analysis, pre_post)


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

    # Primary stayed unavailable, try the fallback model once.
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
