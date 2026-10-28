"""Train FurSight's small behaviour model: what is the rabbit doing, from a crop of him.

  ~/Documents/fursight-data/.venv/bin/python ml/train.py <labels dir> <out dir> [--reviewed-only] [--epochs 20]

One small network (MobileNetV3 Small, Apache-friendly torchvision weights) with two heads:
  posture   one of loaf, sitting, stretched, flop, upright, hopping   (softmax)
  activity  any of eating, drinking, grooming, chewing, yawning       (one yes/no each)
Labels are yours where you reviewed a crop, otherwise Muse Spark's suggestion (unless --reviewed-only).
Uses the Roboflow train / valid / test split. Writes model.onnx (for the pet cam page), model.pt, labels.json
and report.txt with how it did on the test crops.
"""
import argparse, json, os, random
import torch, torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("labels"); ap.add_argument("out")
ap.add_argument("--reviewed-only", action="store_true"); ap.add_argument("--epochs", type=int, default=20)
args = ap.parse_args()
torch.manual_seed(7); random.seed(7)

POSTURES = ["loaf", "sitting", "stretched", "flop", "upright", "hopping"]
ACTIVITIES = ["eating", "drinking", "grooming", "chewing", "yawning"]
items = json.load(open(os.path.join(args.labels, "items.json")))
labels = json.load(open(os.path.join(args.labels, "labels.json")))

rows, from_you = [], 0
for it in items:
    l = labels.get(it["id"], {})
    if l.get("reviewed"): p, acts, mine = l["posture"], l.get("activity", []), True
    elif not args.reviewed_only and l.get("spark"): p, acts, mine = l["spark"]["posture"], l["spark"]["activity"], False
    else: continue
    if p not in POSTURES: continue   # "not visible" teaches nothing about posture
    from_you += mine
    rows.append((it["id"], it["split"], POSTURES.index(p), [float(a in acts) for a in ACTIVITIES]))
split = {s: [r for r in rows if r[1] == s] for s in ("train", "valid", "test")}
print(f"{len(rows)} crops ({from_you} reviewed by you): " + ", ".join(f"{s} {len(v)}" for s, v in split.items()))

MEAN, STD, SIZE = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225], 224
aug = transforms.Compose([transforms.RandomResizedCrop(SIZE, scale=(0.7, 1)), transforms.RandomHorizontalFlip(), transforms.ColorJitter(0.3, 0.3, 0.2), transforms.ToTensor(), transforms.Normalize(MEAN, STD)])
plain = transforms.Compose([transforms.Resize((SIZE, SIZE)), transforms.ToTensor(), transforms.Normalize(MEAN, STD)])

class Crops(Dataset):
    def __init__(self, rows, tf): self.rows, self.tf = rows, tf
    def __len__(self): return len(self.rows)
    def __getitem__(self, i):
        cid, _, p, a = self.rows[i]
        return self.tf(Image.open(os.path.join(args.labels, "crops", cid + ".jpg")).convert("RGB")), p, torch.tensor(a)

class Behaviour(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        self.features, self.pool = base.features, nn.AdaptiveAvgPool2d(1)
        self.neck = nn.Sequential(nn.Flatten(), nn.Linear(576, 256), nn.Hardswish(), nn.Dropout(0.3))
        self.posture, self.activity = nn.Linear(256, len(POSTURES)), nn.Linear(256, len(ACTIVITIES))
    def forward(self, x):
        h = self.neck(self.pool(self.features(x)))
        return self.posture(h), self.activity(h)

dev = "mps" if torch.backends.mps.is_available() else "cpu"
net = Behaviour().to(dev)
# rare postures and activities count for more, so it doesn't just learn "loaf"
pc = torch.tensor([sum(r[2] == i for r in split["train"]) for i in range(len(POSTURES))], dtype=torch.float)
pw = (pc.sum() / (pc.clamp(min=1) * len(POSTURES))).clamp(max=10)
ac = torch.tensor([sum(r[3][i] for r in split["train"]) for i in range(len(ACTIVITIES))])
aw = ((len(split["train"]) - ac) / ac.clamp(min=1)).clamp(max=20)
print("train postures:", dict(zip(POSTURES, pc.int().tolist())), " activities:", dict(zip(ACTIVITIES, ac.int().tolist())))
ce, bce = nn.CrossEntropyLoss(weight=pw.to(dev)), nn.BCEWithLogitsLoss(pos_weight=aw.to(dev))
opt = torch.optim.AdamW([{"params": net.features.parameters(), "lr": 3e-4}, {"params": [*net.neck.parameters(), *net.posture.parameters(), *net.activity.parameters()], "lr": 1e-3}], weight_decay=1e-4)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)
train_dl = DataLoader(Crops(split["train"], aug), batch_size=32, shuffle=True)

def evaluate(rows):
    net.eval(); conf = [[0] * len(POSTURES) for _ in POSTURES]; tp = [0] * len(ACTIVITIES); fp = [0] * len(ACTIVITIES); fn = [0] * len(ACTIVITIES)
    with torch.no_grad():
        for x, p, a in DataLoader(Crops(rows, plain), batch_size=64):
            po, ao = net(x.to(dev))
            for t, g in zip(p.tolist(), po.argmax(1).cpu().tolist()): conf[t][g] += 1
            pred = (torch.sigmoid(ao).cpu() > 0.5)
            for i in range(len(ACTIVITIES)):
                tp[i] += int((pred[:, i] & (a[:, i] > 0)).sum()); fp[i] += int((pred[:, i] & (a[:, i] == 0)).sum()); fn[i] += int((~pred[:, i] & (a[:, i] > 0)).sum())
    n = sum(map(sum, conf)); acc = sum(conf[i][i] for i in range(len(POSTURES))) / max(1, n)
    return acc, conf, tp, fp, fn

best = -1
for ep in range(args.epochs):
    net.train(); total = 0
    for x, p, a in train_dl:
        x, p, a = x.to(dev), p.to(dev), a.to(dev)
        po, ao = net(x); loss = ce(po, p) + bce(ao, a)
        opt.zero_grad(); loss.backward(); opt.step(); total += loss.item() * len(x)
    sched.step()
    acc = evaluate(split["valid"])[0]
    print(f"epoch {ep + 1:2d}  loss {total / len(split['train']):.3f}  valid posture accuracy {acc:.1%}", flush=True)
    if acc > best: best = acc; torch.save(net.state_dict(), "/tmp/fursight-best.pt")

net.load_state_dict(torch.load("/tmp/fursight-best.pt"))
os.makedirs(args.out, exist_ok=True)
acc, conf, tp, fp, fn = evaluate(split["test"])
lines = [f"Test crops: {sum(map(sum, conf))}. Labels: {from_you} reviewed by you, the rest Muse Spark's.", f"Posture accuracy: {acc:.1%}", "", "Posture (rows = label, columns = model):", "            " + " ".join(f"{p[:9]:>9}" for p in POSTURES)]
lines += [f"{p[:11]:>11} " + " ".join(f"{v:>9}" for v in row) for p, row in zip(POSTURES, conf)]
lines += ["", "Activity (found / missed / false alarms):"] + [f"  {a:>9}: {tp[i]} / {fn[i]} / {fp[i]}" for i, a in enumerate(ACTIVITIES)]
report = "\n".join(lines); print("\n" + report)
open(os.path.join(args.out, "report.txt"), "w").write(report + "\n")
torch.save(net.state_dict(), os.path.join(args.out, "model.pt"))
json.dump({"postures": POSTURES, "activities": ACTIVITIES, "size": SIZE, "mean": MEAN, "std": STD, "activity_threshold": 0.5, "reviewed_by_you": from_you, "crops": len(rows)}, open(os.path.join(args.out, "labels.json"), "w"), indent=1)
net.cpu().eval()
torch.onnx.export(net, torch.zeros(1, 3, SIZE, SIZE), os.path.join(args.out, "model.onnx"), input_names=["image"], output_names=["posture", "activity"], dynamic_axes={"image": {0: "n"}}, opset_version=17)
print("saved", args.out, f"({os.path.getsize(os.path.join(args.out, 'model.onnx')) / 1e6:.1f} MB onnx)")
