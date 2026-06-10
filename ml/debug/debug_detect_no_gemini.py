import json
import os
import sys
from datetime import datetime, timezone

from PIL import Image

from yolo_detector import _get_model


def debug_detect(image_path: str, labels_json_path: str) -> None:
    with open(labels_json_path) as f:
        labels = json.load(f)

    if not isinstance(labels, list) or not labels:
        print("JSON must be a non-empty list of label strings, e.g. [\"chair\", \"sofa\"]")
        return

    model = _get_model()
    model.set_classes(labels)
    results = model.predict(image_path, conf=0.40, verbose=False)

    counts = {label: [] for label in labels}
    for r in results:
        for cls_idx, conf in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist()):
            label = labels[int(cls_idx)]
            counts[label].append(conf)

    print(f"Labels searched: {', '.join(labels)}")
    print("Detections:")
    for label, confs in counts.items():
        if confs:
            conf_str = ", ".join(f"{c:.2f}" for c in confs)
            print(f"  {label:<20} x{len(confs)}  (conf: {conf_str})")
        else:
            print(f"  {label:<20} x0")

    os.makedirs("../../outputs/images", exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = f"../../outputs/images/debug_{timestamp}.jpg"

    annotated = results[0].plot()  # BGR numpy array from ultralytics
    Image.fromarray(annotated[..., ::-1]).save(output_path)  # BGR → RGB

    print(f"Saved: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python debug_detect.py <image_path> <labels.json>")
        print('Example labels.json: ["chair", "sofa", "table"]')
        sys.exit(1)

    debug_detect(sys.argv[1], sys.argv[2])
