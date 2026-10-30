"""Labels on the FurSight Tray render, in the kit schematic's style: numbered pills with a leader line to the part.

    python3 docs/kit-src/tray_labels.py docs/tray-concept.png docs/tray-concept.jpg

Reads the anchor points tray_render.py wrote next to the render (<render>.json, 0-1 from the bottom left), crops to
16:9 and draws the labels.
"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB"); W, H = im.size
anchors = json.load(open(src.rsplit(".", 1)[0] + ".json"))
TOP = H - W * 9 // 16                                    # crop the empty backdrop above
im = im.crop((0, TOP, W, H)); H = im.height
px = lambda k: (anchors[k][0] * W, (1 - anchors[k][1]) * (H + TOP) - TOP)

AV = "/System/Library/Fonts/Avenir Next.ttc"
F_T, F_S, F_N, F_H, F_C = (ImageFont.truetype(AV, s, index=i) for s, i in ((27, 0), (20, 2), (20, 0), (44, 8), (21, 2)))
INK, MUTED, WHITE = (43, 42, 51), (107, 105, 119), (255, 255, 255)
d = ImageDraw.Draw(im)

# number, title, line, colour, the part it points at, where the label sits (top left of the pill)
LABELS = [
    (1, "Built-in camera", "looks down: droppings, visits", (46, 168, 245), px("camera"), (1225, 175)),
    (2, "Hay rack", "hooks on; the camera sees what's left", (255, 178, 63), px("hay"), (790, 40)),
    (3, "Grid floor", "droppings stay on top, in view", (155, 108, 240), (1010, 560), (1215, 395)),
    (4, "Droppings", "counted and sized every visit", (122, 78, 209), px("droppings"), (60, 330)),
    (5, "Hidden scale", "weighs him every time he hops in", (61, 187, 110), px("scale"), (60, 600)),
    (6, "Temperature sensor", "warns you on hot days", (255, 90, 106), px("vents"), (1180, 760)),
]
for n, title, line, col, (ax, ay), (lx, ly) in LABELS:
    tw = max(d.textlength(title, font=F_T), d.textlength(line, font=F_S))
    w, h = int(tw) + 92, 78
    cx, cy = (lx + w if ax > lx + w else lx if ax < lx else ax), (ly + h if ay > ly + h else ly)
    cx = min(max(ax, lx + 24), lx + w - 24)
    d.line([(cx, cy), (ax, ay)], fill=INK, width=3)
    d.ellipse((ax - 9, ay - 9, ax + 9, ay + 9), fill=WHITE, outline=INK, width=3)
    d.rounded_rectangle((lx, ly + 5, lx + w, ly + h + 5), 22, fill=(225, 220, 234))       # the drop, like the kit's cards
    d.rounded_rectangle((lx, ly, lx + w, ly + h), 22, fill=WHITE)
    d.ellipse((lx + 18, ly + 22, lx + 52, ly + 56), fill=col)
    d.text((lx + 35, ly + 39), str(n), font=F_N, fill=WHITE, anchor="mm")
    d.text((lx + 66, ly + 12), title, font=F_T, fill=INK)
    d.text((lx + 66, ly + 46), line, font=F_S, fill=MUTED)

d.text((60, 52), "The FurSight Tray", font=F_H, fill=INK)
d.text((62, 110), "a concept render, not a photo", font=F_C, fill=MUTED)
im.save(out, quality=88)
print("wrote", out, im.size)
