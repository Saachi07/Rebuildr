from pathlib import Path

from ultralytics import YOLOWorld

_MODEL_PATH = Path(__file__).parent / "yolov8m-worldv2.pt"
_model = None


def _get_model() -> YOLOWorld:
    global _model
    if _model is None:
        _model = YOLOWorld(str(_MODEL_PATH))
    return _model


def detect_furniture(image_path: str, labels: list, conf: float = 0.40) -> dict:
    """Detect items in image by text prompt. Returns {label: detected_count}."""
    if not labels:
        return {}

    model = _get_model()
    model.set_classes(labels)
    results = model.predict(image_path, conf=conf, verbose=False)

    counts = {label: 0 for label in labels}
    for r in results:
        for cls_idx in r.boxes.cls.tolist():
            counts[labels[int(cls_idx)]] += 1
    return counts
