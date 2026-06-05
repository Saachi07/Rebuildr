import os
import tempfile

from flask import Flask, jsonify, request

from analyzer import analyze_room_photo
from classifier.predict import predict_damage
from damage_analyzer import analyze_damage_photo
from loss_report import generate_loss_report

app = Flask(__name__)


def _save_upload(file) -> str:
    filename = file.filename or ""
    suffix = os.path.splitext(filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    file.save(tmp.name)
    tmp.close()
    return tmp.name


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/ml/analyze-photo", methods=["POST"])
def analyze_photo():
    """Before-disaster photo → structured room inventory with CAD price estimates."""
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    tmp_path = _save_upload(request.files["image"])
    try:
        result = analyze_room_photo(tmp_path)
        return jsonify(result.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route("/ml/analyze-damage", methods=["POST"])
def analyze_damage():
    """Post-disaster photo → per-item damage assessment. Gemini detects items;
    ViT classifies damage grade for each item with a bounding box."""
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    tmp_path = _save_upload(request.files["image"])
    try:
        result = analyze_damage_photo(tmp_path)
        damage_dict = result.model_dump()

        for item in damage_dict["items"]:
            bbox = item.get("bounding_box")
            if bbox:
                vit = predict_damage(tmp_path, bounding_box=bbox)
                item["damage_grade"] = vit["damage_grade"]
                item["vit_confidence"] = vit["confidence"]
                item["vit_scores"] = vit["scores"]
            else:
                item["damage_grade"] = "destroyed"
                item["vit_confidence"] = 0.0
                item["vit_scores"] = {}

        return jsonify(damage_dict)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route("/ml/loss-report", methods=["POST"])
def loss_report():
    """Before inventory + after damage assessment → itemised loss report with CAD totals.

    Body (JSON):
    {
        "before_inventory": { ...output from /ml/analyze-photo... },
        "after_damage":     { ...output from /ml/analyze-damage... }
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    before_inventory = data.get("before_inventory")
    after_damage = data.get("after_damage")

    if not before_inventory or not after_damage:
        return jsonify({"error": "Both before_inventory and after_damage are required"}), 400

    try:
        result = generate_loss_report(before_inventory, after_damage)
        return jsonify(result.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5001, use_reloader=False)
