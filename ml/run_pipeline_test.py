"""
Quick end-to-end pipeline test. Produces JSON files under ../outputs/ so
the results can be reviewed without starting the Flask server.

Run from the ml/ directory:
    python run_pipeline_test.py
"""

import json
import os
import sys
from pathlib import Path

# Load API key from .env.example if no .env exists
from dotenv import load_dotenv
env_path = Path(__file__).parent / ".env"
env_example_path = Path(__file__).parent / ".env.example"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv(env_example_path)

# Add ml/ to path so local imports work
sys.path.insert(0, str(Path(__file__).parent))

from analyzer import analyze_room_photo
from yolo_detector import detect_furniture
from loss_report import generate_loss_report

REPO_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = REPO_ROOT / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

PAIRS = [
    ("photo1_before.jpeg", "photo1_after.jpeg", "photo1"),
    ("photo2_before.jpeg", "photo2_after.jpeg", "photo2"),
    ("photo3_before.jpeg", "photo3_after.jpeg", "photo3"),
]


def run_pair(before_name: str, after_name: str, prefix: str):
    before_path = str(REPO_ROOT / before_name)
    after_path = str(REPO_ROOT / after_name)

    print(f"\n{'='*60}")
    print(f"[{prefix}] Analyzing BEFORE photo: {before_name}")

    before_inv = analyze_room_photo(before_path)
    before_dict = before_inv.model_dump()

    before_out = OUTPUT_DIR / f"{prefix}_before_inventory.json"
    with open(before_out, "w") as f:
        json.dump(before_dict, f, indent=2)
    print(f"  Saved: {before_out.name}")
    print(f"  Room: {before_dict['room_type']}  |  Items: {len(before_dict['items'])}")

    print(f"\n[{prefix}] Detecting items in AFTER photo: {after_name}")

    labels = list({item["yolo_label"] for item in before_dict["items"]})
    print(f"  YOLO labels to detect: {labels}")

    detected = detect_furniture(after_path, labels)
    print(f"  Detected counts: {detected}")

    # Build after-damage dict using same logic as app.py
    label_remaining = {label: detected.get(label, 0) for label in labels}
    result_items = []
    for item in before_dict["items"]:
        label = item["yolo_label"]
        pre_count = item.get("count", 1)
        available = label_remaining.get(label, 0)
        salvageable = min(available, pre_count)
        damaged = pre_count - salvageable
        label_remaining[label] = max(0, available - salvageable)

        if damaged == 0:
            status = "safe"
        elif salvageable == 0:
            status = "damaged"
        else:
            status = "partial"

        result_items.append({
            **item,
            "pre_count": pre_count,
            "salvageable_count": salvageable,
            "damaged_count": damaged,
            "status": status,
        })

    after_dict = {
        "room_type": before_dict.get("room_type", "other"),
        "items": result_items,
    }

    after_out = OUTPUT_DIR / f"{prefix}_after_damage.json"
    with open(after_out, "w") as f:
        json.dump(after_dict, f, indent=2)
    print(f"  Saved: {after_out.name}")

    damaged_items = [i for i in result_items if i["status"] != "safe"]
    print(f"  Items damaged/partial: {len(damaged_items)} / {len(result_items)}")

    print(f"\n[{prefix}] Generating loss report")
    report = generate_loss_report(before_dict, after_dict)
    report_dict = report.model_dump()

    report_out = OUTPUT_DIR / f"{prefix}_loss_report.json"
    with open(report_out, "w") as f:
        json.dump(report_dict, f, indent=2)
    print(f"  Saved: {report_out.name}")
    print(f"  Total loss estimate: ${report_dict['total_loss_low_cad']} - ${report_dict['total_loss_high_cad']} CAD")

    return before_dict, after_dict, report_dict


if __name__ == "__main__":
    print("Rebuildr ML Pipeline Test")
    print(f"Output directory: {OUTPUT_DIR}")

    for before_name, after_name, prefix in PAIRS:
        before_path = REPO_ROOT / before_name
        after_path = REPO_ROOT / after_name

        if not before_path.exists():
            print(f"\n[SKIP] {before_name} not found")
            continue
        if not after_path.exists():
            print(f"\n[SKIP] {after_name} not found")
            continue

        try:
            run_pair(before_name, after_name, prefix)
        except Exception as e:
            print(f"\n[ERROR] {prefix}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\n\nDone. JSON files written to: {OUTPUT_DIR}")
