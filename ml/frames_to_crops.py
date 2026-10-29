"""Add Spark-labelled frames (ml/label/frames.js) to the labeller: crop the rabbit out of each frame by Spark's box.

  ~/Documents/fursight-data/.venv/bin/python ml/frames_to_crops.py <frames dir> <labels dir>

Frames with no rabbit are left out, and so are photos already in the Roboflow set (same IMG number), so one photo
never ends up on both sides of the train / test split. Crops get the same 12% margin and 384 px size as
ml/prep_crops.py. Adds to <labels dir>/items.json and puts Spark's labels in labels.json, where you can review them.
Run it again after more frames are labelled: frames already added are skipped.
"""
import json, os, re, sys
from PIL import Image

frames_dir, out = sys.argv[1], sys.argv[2]
frames = json.load(open(os.path.join(frames_dir, "frames.json")))
spark = json.load(open(os.path.join(frames_dir, "spark.json")))
items = json.load(open(os.path.join(out, "items.json")))
labels = json.load(open(os.path.join(out, "labels.json")))

have = {i["id"] for i in items}
img_no = lambda name: (re.search(r"IMG_[EO]?(\d{4})", name) or [None, None])[1]
roboflow = {img_no(i["photo"]) for i in items if not i["id"].startswith("xs-")} - {None}
added = empty = dupes = 0
for f in frames:
    s = spark.get(f["id"])
    if not s or f["id"] in have: continue
    l, t, r, b = s["box"]
    if s["posture"] == "not visible" or r - l < 20 or b - t < 20: empty += 1; continue
    if img_no(os.path.basename(f["source"])) in roboflow: dupes += 1; continue
    photo = Image.open(os.path.join(frames_dir, "frames", f["id"] + ".jpg"))
    W, H = photo.size
    x0, y0, x1, y1 = l * W / 1000, t * H / 1000, r * W / 1000, b * H / 1000
    px, py = (x1 - x0) * 0.12, (y1 - y0) * 0.12
    crop = photo.crop((round(max(0, x0 - px)), round(max(0, y0 - py)), round(min(W, x1 + px)), round(min(H, y1 + py))))
    crop.thumbnail((384, 384))
    crop.save(os.path.join(out, "crops", f["id"] + ".jpg"), quality=88)
    items.append({"id": f["id"], "split": f["split"], "photo": os.path.basename(f["source"]) + (f" @{f['t']}s" if f["t"] is not None else ""),
                  "file": f["source"], "box": [round(x0), round(y0), round(x1 - x0), round(y1 - y0)], "size": [W, H]})
    labels[f["id"]] = {**labels.get(f["id"], {}), "spark": {k: s[k] for k in ("posture", "activity", "is_xiaosi", "sure")}}
    added += 1

json.dump(items, open(os.path.join(out, "items.json"), "w"), indent=1)
json.dump(labels, open(os.path.join(out, "labels.json"), "w"), indent=1)
print(f"added {added} crops; left out {empty} with no rabbit and {dupes} already in the Roboflow set")
