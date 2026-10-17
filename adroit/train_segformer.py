"""Fine-tune SegFormer-b0 for 3-class skin segmentation (background / skin / affected skin)."""
import argparse
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset, random_split
from transformers import SegformerForSemanticSegmentation

LABELS = {0: "background", 1: "skin", 2: "affected"}
SIZE = 512
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class SkinDataset(Dataset):
    def __init__(self, root: Path):
        self.images = sorted((root / "images").glob("*.jpg"))
        self.masks = root / "masks"

    def __len__(self):
        return len(self.images)

    def __getitem__(self, i):
        img_path = self.images[i]
        img = Image.open(img_path).convert("RGB").resize((SIZE, SIZE), Image.BILINEAR)
        mask = Image.open(self.masks / f"{img_path.stem}.png").resize((SIZE, SIZE), Image.NEAREST)
        x = (np.asarray(img, dtype=np.float32) / 255 - MEAN) / STD
        if np.random.rand() < 0.5:  # horizontal flip
            x, mask = x[:, ::-1], mask.transpose(Image.FLIP_LEFT_RIGHT)
        return torch.from_numpy(x.transpose(2, 0, 1).copy()), torch.from_numpy(np.asarray(mask, dtype=np.int64).copy())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    ds = SkinDataset(args.data)
    n_val = max(1, len(ds) // 10)
    train, val = random_split(ds, [len(ds) - n_val, n_val], generator=torch.Generator().manual_seed(0))
    train_dl = DataLoader(train, batch_size=args.batch, shuffle=True, num_workers=4)
    val_dl = DataLoader(val, batch_size=args.batch, num_workers=4)

    model = SegformerForSemanticSegmentation.from_pretrained(
        "nvidia/mit-b0", num_labels=len(LABELS), id2label=LABELS, label2id={v: k for k, v in LABELS.items()}
    ).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=6e-5)

    for epoch in range(args.epochs):
        model.train()
        for x, y in train_dl:
            loss = model(pixel_values=x.to(device), labels=y.to(device)).loss
            opt.zero_grad()
            loss.backward()
            opt.step()

        model.eval()
        inter = np.zeros(len(LABELS))
        union = np.zeros(len(LABELS))
        with torch.no_grad():
            for x, y in val_dl:
                logits = model(pixel_values=x.to(device)).logits
                pred = torch.nn.functional.interpolate(logits, size=y.shape[-2:], mode="bilinear").argmax(1).cpu()
                for c in LABELS:
                    inter[c] += ((pred == c) & (y == c)).sum().item()
                    union[c] += ((pred == c) | (y == c)).sum().item()
        iou = inter / np.maximum(union, 1)
        print(f"epoch {epoch + 1}: loss {loss.item():.3f} IoU " + " ".join(f"{LABELS[c]}={iou[c]:.3f}" for c in LABELS), flush=True)

    model.save_pretrained(args.out)


if __name__ == "__main__":
    main()
