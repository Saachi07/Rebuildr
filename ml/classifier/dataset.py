"""
Dataset loader for the fire damage classification dataset.

Expected directory layout (relative to dataset_root):
    chair_intact/                        → intact
    chair_intact_synthetic/              → intact
    chair_damaged/damaged/               → destroyed
    chair_damaged/damaged_synthetic/     → destroyed
    chair_damaged/salvageable/           → salvageable
    chair_damaged/salvageable_synthetic/ → salvageable
    table_intact/                        → intact (⚠ some filenames look damaged — verify)
    table_damaged/damaged/               → destroyed
    table_damaged/damaged_synthetic/     → destroyed
    table_damaged/salvageable/           → salvageable
    table_damaged/salvageable_synthetic/ → salvageable
"""

import os
import random
from pathlib import Path

from PIL import Image
from torch.utils.data import Dataset

LABEL2ID = {"intact": 0, "salvageable": 1, "destroyed": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}

# Maps each subfolder path (relative to dataset_root) to its class label.
# Adjust or extend this if more item types are added.
FOLDER_LABEL_MAP = {
    "chair_intact": "intact",
    "chair_intact_synthetic": "intact",
    "chair_damaged/damaged": "destroyed",
    "chair_damaged/damaged_synthetic": "destroyed",
    "chair_damaged/salvageable": "salvageable",
    "chair_damaged/salvageable_synthetic": "salvageable",
    # TODO: audit table_intact — a few filenames suggest misplaced damaged images
    "table_intact": "intact",
    "table_damaged/damaged": "destroyed",
    "table_damaged/damaged_synthetic": "destroyed",
    "table_damaged/salvageable": "salvageable",
    "table_damaged/salvageable_synthetic": "salvageable",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _collect_samples(dataset_root: str) -> list[tuple[str, int]]:
    """Walk FOLDER_LABEL_MAP and return (image_path, label_id) pairs."""
    root = Path(dataset_root)
    samples = []

    for rel_folder, label_str in FOLDER_LABEL_MAP.items():
        folder = root / rel_folder
        if not folder.exists():
            continue
        label_id = LABEL2ID[label_str]
        for f in folder.iterdir():
            if f.suffix.lower() in IMAGE_EXTENSIONS:
                samples.append((str(f), label_id))

    return samples


def build_splits(
    dataset_root: str,
    val_ratio: float = 0.2,
    seed: int = 42,
) -> tuple[list, list]:
    """Return (train_samples, val_samples) as lists of (path, label_id)."""
    samples = _collect_samples(dataset_root)
    random.seed(seed)
    random.shuffle(samples)
    split = int(len(samples) * (1 - val_ratio))
    return samples[:split], samples[split:]


class DamageDataset(Dataset):
    """PyTorch Dataset for fire damage classification.

    Args:
        samples:   List of (image_path, label_id) from build_splits().
        processor: HuggingFace ViTImageProcessor — handles resize + normalise.
    """

    def __init__(self, samples: list[tuple[str, int]], processor):
        self.samples = samples
        self.processor = processor

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict:
        path, label = self.samples[idx]
        image = Image.open(path).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs["pixel_values"].squeeze(0)
        return {"pixel_values": pixel_values, "labels": label}
