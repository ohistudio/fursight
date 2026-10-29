"""Cut each labelled rabbit out of a Roboflow COCO export, ready for behaviour labelling.

  ~/Documents/fursight-data/.venv/bin/python ml/prep_crops.py <coco export dir> <labels dir>

For every box: the photo, turned the right way up (iPhone HEIC keeps its rotation separately), cropped to the box
plus 12% around it so his whole outline is in, and shrunk to 384 px on the long side. Writes <labels dir>/crops/*.jpg
and <labels dir>/items.json (one entry per crop: id, split, source photo, box). Images never go in the repo.
"""
import json, os, sys
from PIL import Image, ImageOps
import pillow_heif

pillow_heif.register_heif_opener()
src, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, "crops"), exist_ok=True)
items, mismatched = [], 0
for split in ("train", "valid", "test"):
    coco = json.load(open(os.path.join(src, split, "_annotations.coco.json")))
    images = {im["id"]: im for im in coco["images"]}
    for a in coco["annotations"]:
        im = images[a["image_id"]]
        photo = ImageOps.exif_transpose(Image.open(os.path.join(src, split, im["file_name"]))).convert("RGB")
        # the boxes are drawn on the photo as Roboflow showed it: if it's still sideways, turn it to match
        if photo.size != (im["width"], im["height"]):
            mismatched += 1
            if photo.size == (im["height"], im["width"]): photo = photo.rotate(-90, expand=True)
        x, y, w, h = a["bbox"]
        px, py = w * 0.12, h * 0.12
        box = (max(0, x - px), max(0, y - py), min(photo.width, x + w + px), min(photo.height, y + h + py))
        crop = photo.crop(tuple(round(v) for v in box))
        crop.thumbnail((384, 384))
        cid = f"{split}-{a['id']}"
        crop.save(os.path.join(out, "crops", cid + ".jpg"), quality=88)
        name = (im.get("extra") or {}).get("name") or im["file_name"]
        items.append({"id": cid, "split": split, "photo": name, "file": f"{split}/{im['file_name']}", "box": [round(v) for v in a["bbox"]], "size": [im["width"], im["height"]]})
    print(split, "done", flush=True)
json.dump(items, open(os.path.join(out, "items.json"), "w"), indent=1)
print(f"{len(items)} crops; {mismatched} photos needed turning to match their boxes")
