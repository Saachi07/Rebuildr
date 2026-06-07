import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import MagicMock, patch
import yolo_detector


def _make_results(cls_indices: list):
    mock_boxes = MagicMock()
    mock_boxes.cls.tolist.return_value = cls_indices
    mock_result = MagicMock()
    mock_result.boxes = mock_boxes
    return [mock_result]


@patch("yolo_detector.YOLOWorld")
def test_detect_returns_zero_for_undetected_labels(mock_cls):
    yolo_detector._model = None
    mock_model = MagicMock()
    mock_cls.return_value = mock_model
    mock_model.predict.return_value = _make_results([])

    result = yolo_detector.detect_furniture("img.jpg", ["sofa", "lamp"])
    assert result == {"sofa": 0, "lamp": 0}


@patch("yolo_detector.YOLOWorld")
def test_detect_counts_multiple_detections(mock_cls):
    yolo_detector._model = None
    mock_model = MagicMock()
    mock_cls.return_value = mock_model
    mock_model.predict.return_value = _make_results([0, 0, 1])  # 2 sofas, 1 lamp

    result = yolo_detector.detect_furniture("img.jpg", ["sofa", "lamp"])
    assert result == {"sofa": 2, "lamp": 1}


@patch("yolo_detector.YOLOWorld")
def test_detect_returns_empty_dict_for_empty_labels(mock_cls):
    yolo_detector._model = None
    result = yolo_detector.detect_furniture("img.jpg", [])
    assert result == {}
    mock_cls.assert_not_called()


@patch("yolo_detector.YOLOWorld")
def test_set_classes_called_with_labels(mock_cls):
    yolo_detector._model = None
    mock_model = MagicMock()
    mock_cls.return_value = mock_model
    mock_model.predict.return_value = _make_results([])

    yolo_detector.detect_furniture("img.jpg", ["chair", "table"])
    mock_model.set_classes.assert_called_once_with(["chair", "table"])
