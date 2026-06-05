"""
Fine-tune ViT on the fire damage dataset.

Usage:
    python -m classifier.train --dataset ../../dataset --output ./checkpoints

The script fine-tunes the full ViT model with AdamW and a cosine LR schedule,
saving the best checkpoint (by val accuracy) to --output.
"""

import argparse
import os

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from .dataset import DamageDataset, build_splits
from .model import load_model

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def train(
    dataset_root: str,
    output_dir: str,
    epochs: int = 10,
    batch_size: int = 16,
    lr: float = 2e-5,
    val_ratio: float = 0.2,
):
    os.makedirs(output_dir, exist_ok=True)

    print(f"Device: {DEVICE}")
    print(f"Loading dataset from: {dataset_root}")

    model, processor = load_model()
    model.to(DEVICE)

    train_samples, val_samples = build_splits(dataset_root, val_ratio=val_ratio)
    print(f"Train: {len(train_samples)} | Val: {len(val_samples)}")

    train_dataset = DamageDataset(train_samples, processor)
    val_dataset = DamageDataset(val_samples, processor)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=2)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss()

    best_val_acc = 0.0

    for epoch in range(epochs):
        # --- Training ---
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0

        for batch in train_loader:
            pixel_values = batch["pixel_values"].to(DEVICE)
            labels = batch["labels"].to(DEVICE)

            outputs = model(pixel_values=pixel_values)
            loss = criterion(outputs.logits, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * len(labels)
            train_correct += (outputs.logits.argmax(dim=-1) == labels).sum().item()
            train_total += len(labels)

        scheduler.step()

        # --- Validation ---
        val_acc = _evaluate(model, val_loader)

        avg_loss = train_loss / train_total
        avg_acc = train_correct / train_total
        print(
            f"Epoch {epoch + 1}/{epochs}  "
            f"loss={avg_loss:.4f}  train_acc={avg_acc:.3f}  val_acc={val_acc:.3f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            model.save_pretrained(output_dir)
            processor.save_pretrained(output_dir)
            print(f"  ✓ Saved best model (val_acc={val_acc:.3f})")

    print(f"\nTraining complete. Best val_acc: {best_val_acc:.3f}")
    print(f"Model saved to: {output_dir}")


def _evaluate(model: nn.Module, loader: DataLoader) -> float:
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for batch in loader:
            pixel_values = batch["pixel_values"].to(DEVICE)
            labels = batch["labels"].to(DEVICE)
            outputs = model(pixel_values=pixel_values)
            correct += (outputs.logits.argmax(dim=-1) == labels).sum().item()
            total += len(labels)
    return correct / total if total > 0 else 0.0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to dataset root")
    parser.add_argument("--output", default="./checkpoints", help="Where to save the model")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    train(
        dataset_root=args.dataset,
        output_dir=args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
    )
