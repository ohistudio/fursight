"""Draw the FurSight kit schematic as an SVG: an isometric room with the pen, both pet cams and their views, the
FurSight Tray (and an exploded view of it), the hay and bowls, Xiaosi (his own sticker), and how the data flows.

    python3 docs/kit-src/make_kit.py      -> docs/kit.svg and server/public/kit/kit.svg

Every group has a class (b1, b2...) for the build order, so the /kit/ page can animate it piece by piece for the
trailer. As a plain image (the README) it's static.
"""
import base64, io, math, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
C30, S30 = math.cos(math.radians(30)), 0.5

INK, MUTED, LINE, CARD = "#2B2A33", "#6B6977", "#E4E1EA", "#FFFFFF"
FERN, FERN_LIP, SUN, SUN_LIP, CORAL, SKY, SKY_LIP, GRAPE, GRAPE_LIP = "#3DBE6B", "#2A9A52", "#FFB627", "#D9900A", "#FF4D5E", "#2FA8F5", "#1E86C9", "#9B6CF0", "#7A4ED1"

out = []
def add(s): out.append(s)

# ---------------------------------------------------------------- isometric helpers (room units, then screen)
OX, OY, SC = 470, 470, 0.98
def iso(x, y, z=0, ox=None, oy=None, sc=None):
    ox = OX if ox is None else ox; oy = OY if oy is None else oy; sc = SC if sc is None else sc
    return (ox + (x - y) * C30 * sc, oy + (x + y) * S30 * sc - z * sc)
def pts(ps, **k): return " ".join(f"{a:.1f},{b:.1f}" for a, b in (iso(*p, **k) for p in ps))
def poly(ps, fill, stroke="none", sw=0, extra="", **k): return f'<polygon points="{pts(ps, **k)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" {extra}/>'
def line(a, b, stroke, sw=2, extra="", **k):
    (x1, y1), (x2, y2) = iso(*a, **k), iso(*b, **k)
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" {extra}/>'
def prism(x0, y0, z0, x1, y1, z1, top, left, right, stroke=INK, sw=2, **k):
    return "".join([
        poly([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], right, stroke, sw, **k),
        poly([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], left, stroke, sw, **k),
        poly([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top, stroke, sw, **k)])
def ellipse_at(x, y, z, rx, fill, stroke="none", sw=0, extra="", **k):
    cx, cy = iso(x, y, z, **k); sc = k.get("sc", SC)
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx * sc * 1.22:.1f}" ry="{rx * sc * 0.70:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'
def hull(points):
    p = sorted(set(points))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for q in p:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], q) <= 0: hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]
def cone(apex, base, colour, cls):
    a = iso(*apex); bs = [iso(*b) for b in base]
    h = hull([a] + bs)
    edges = "".join(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{colour}" stroke-width="2.2" stroke-dasharray="7 7" opacity=".75"/>' for b in bs)
    return f'<g class="{cls} cone"><polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in h)}" fill="{colour}" opacity=".09"/>{edges}</g>'
def camera(x, y, z, lens, lens_lip, facing="down"):
    sx, sy = iso(x, y, z)
    if facing == "down":
        return (f'<g transform="translate({sx - 26:.1f} {sy - 18:.1f})"><rect width="52" height="30" rx="10" fill="{INK}"/><rect x="4" y="22" width="44" height="8" rx="4" fill="#45434F"/>'
                f'<circle cx="26" cy="24" r="9" fill="{lens}"/><circle cx="26" cy="24" r="4" fill="{lens_lip}"/><circle cx="44" cy="8" r="3" fill="{CORAL}"/></g>')
    return (f'<g transform="translate({sx - 26:.1f} {sy - 18:.1f})"><rect width="52" height="32" rx="10" fill="{INK}"/><circle cx="34" cy="16" r="10" fill="{lens}"/>'
            f'<circle cx="34" cy="16" r="4.5" fill="{lens_lip}"/><circle cx="10" cy="9" r="3" fill="{CORAL}"/></g>')

def sticker_b64():
    im = Image.open(os.path.join(ROOT, "server/public/demo/xiaosi-sticker-3.png"))
    im.thumbnail((180, 180))
    b = io.BytesIO(); im.save(b, "PNG", optimize=True)
    return im.size, base64.b64encode(b.getvalue()).decode()

W, D, H = 600, 430, 300          # room
PX0, PY0, PX1, PY1, PH = 70, 110, 470, 390, 64   # the pen

# ================================================================ document
add('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 1080" width="1600" height="1080" '
    'font-family="Nunito, \'Avenir Next\', \'Segoe UI\', system-ui, sans-serif">')
add('<title>The FurSight kit: two pet cams, the FurSight Tray and the app</title>')
add(f'''<defs>
  <pattern id="planks" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="matrix(0.866 0.5 -0.866 0.5 0 0)"><rect width="44" height="44" fill="#EFE8F7"/><path d="M0 43.5H44" stroke="#E1D7EE" stroke-width="2"/><path d="M22 0V44" stroke="#E7DFF2" stroke-width="1.4"/></pattern>
  <pattern id="litter" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#E9DCC2"/><circle cx="2" cy="2" r="1.3" fill="#D3C19E"/><circle cx="6" cy="6" r="1.2" fill="#D3C19E"/></pattern>
  <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{GRAPE_LIP}"/></marker>
  <filter id="lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="5" stdDeviation="0" flood-color="{INK}" flood-opacity=".10"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="{INK}" flood-opacity=".22"/></filter>
</defs>''')
add('<rect width="1600" height="1080" fill="#F6F5F9"/>')

# heading
add(f'<g class="b0"><text x="48" y="64" font-size="40" font-weight="900" fill="{INK}">The FurSight kit</text>'
    f'<text x="48" y="98" font-size="19" font-weight="700" fill="{MUTED}">Two pet cams and a smart litter tray watch the small daily things that change first. The app turns them into a diary,</text>'
    f'<text x="48" y="124" font-size="19" font-weight="700" fill="{MUTED}">alerts and a weekly card. Ray-Ban Display and Quest are optional extras.</text></g>')

# ---------------------------------------------------------------- the room: floor and walls
add('<g class="b1">')
add(poly([(0, 0, 0), (W, 0, 0), (W, D, 0), (0, D, 0)], "url(#planks)", "#D9D0E6", 2))
add(poly([(0, 0, 0), (W, 0, 0), (W, 0, H), (0, 0, H)], "#F8F5FC", "#DCD3E8", 2))       # back wall
add(poly([(0, 0, 0), (0, D, 0), (0, D, H), (0, 0, H)], "#EFEAF7", "#DCD3E8", 2))       # left wall
add(poly([(0, 0, 0), (W, 0, 0), (W, 0, 14), (0, 0, 14)], "#E6DDF1"))                   # skirting
add(poly([(0, 0, 0), (0, D, 0), (0, D, 14), (0, 0, 14)], "#DED4EC"))
# window on the back wall, with light falling on the floor
add(poly([(300, 0, 120), (440, 0, 120), (440, 0, 250), (300, 0, 250)], "#E7F5FE", "#CFE6F6", 4))
add(line((370, 0, 120), (370, 0, 250), "#CFE6F6", 4) + line((300, 0, 185), (440, 0, 185), "#CFE6F6", 4))
add(poly([(300, 0, 0), (440, 0, 0), (500, 120, 0), (360, 120, 0)], "#FFFFFF", extra='opacity=".45"'))
# a plant by the wall
add(prism(540, 22, 0, 572, 54, 34, "#C7B9DD", "#B6A6D0", "#A894C6", stroke="none"))
add(ellipse_at(556, 38, 34, 32, FERN, extra='opacity=".9"') + ellipse_at(548, 30, 58, 22, FERN_LIP) + ellipse_at(562, 44, 72, 16, FERN))
add('</g>')

# ---------------------------------------------------------------- a lamp and its cable: what the room check finds
add('<g class="b6">')
add(ellipse_at(560, 250, 0, 20, "#C9BFDA") + line((560, 250, 0), (560, 250, 170), "#B9AECB", 5))
lx, ly = iso(560, 250, 190)
add(f'<path d="M{lx - 26:.1f} {ly + 22:.1f} L{lx - 14:.1f} {ly - 12:.1f} H{lx + 14:.1f} L{lx + 26:.1f} {ly + 22:.1f} Z" fill="{SUN}" stroke="{INK}" stroke-width="2"/>')
cable = [iso(560, 250, 0), iso(585, 300, 0), iso(560, 360, 0), iso(600, 400, 0)]
add(f'<path d="M{cable[0][0]:.1f} {cable[0][1]:.1f} C{cable[1][0]:.1f} {cable[1][1]:.1f} {cable[2][0]:.1f} {cable[2][1]:.1f} {cable[3][0]:.1f} {cable[3][1]:.1f}" stroke="{INK}" stroke-width="3" fill="none"/>')
cx, cy = iso(575, 330, 0)
add(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="46" ry="26" fill="none" stroke="{CORAL}" stroke-width="3.5" stroke-dasharray="6 5" class="ring"/>')
add('</g>')

# ---------------------------------------------------------------- the pen: floor, back panels
add('<g class="b2">')
add(poly([(PX0, PY0, 0), (PX1, PY0, 0), (PX1, PY1, 0), (PX0, PY1, 0)], "#E2F3E8", "#CDE8D6", 2))
def panel(a, b, n):
    s = ""
    (x0, y0), (x1, y1) = a, b
    for i in range(n + 1):
        t = i / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        s += line((x, y, 0), (x, y, PH), "#BDB2CF", 2.4)
    s += line((x0, y0, PH), (x1, y1, PH), "#A99CC0", 4) + line((x0, y0, 10), (x1, y1, 10), "#BDB2CF", 3)
    return s
add(panel((PX0, PY0), (PX1, PY0), 20) + panel((PX0, PY0), (PX0, PY1), 14))
add('</g>')

# ---------------------------------------------------------------- the FurSight Tray in the pen, with its own camera
TX0, TY0, TX1, TY1 = 92, 135, 222, 225
add('<g class="b3">')
add(prism(TX0 - 6, TY0 - 6, 0, TX1 + 6, TY1 + 6, 7, GRAPE, GRAPE_LIP, "#6A42BF", sw=1.6))                 # the scale
add(prism(TX0, TY0, 7, TX1, TY1, 34, "#FFFFFF", "#F1EEF6", "#E4E0EC", sw=2))                              # the tray
add(poly([(TX0 + 8, TY0 + 8, 30), (TX1 - 8, TY0 + 8, 30), (TX1 - 8, TY1 - 8, 30), (TX0 + 8, TY1 - 8, 30)], "url(#litter)"))
for (x, y) in [(150, 170), (170, 190), (138, 200)]: add(ellipse_at(x, y, 31, 3.2, "#6E4B2A"))                   # a few droppings
rx_, ry_ = iso(TX1, (TY0 + TY1) / 2, 4)
add(f'<g transform="translate({rx_ + 4:.1f} {ry_ - 14:.1f})"><rect width="42" height="17" rx="5" fill="#22212A"/><text x="21" y="13" text-anchor="middle" font-size="11" font-weight="900" fill="#7CF0A3">1.10kg</text></g>')
tx_, ty_ = iso(TX1 - 30, TY1 + 6, 20)
add(f'<g transform="translate({tx_ - 6:.1f} {ty_ - 14:.1f})"><rect width="12" height="22" rx="6" fill="#FFFFFF" stroke="{CORAL}" stroke-width="2"/><rect x="4" y="8" width="4" height="11" rx="2" fill="{CORAL}"/></g>')
add(line((TX0 - 2, TY0 - 2, 34), (TX0 - 2, TY0 - 2, 120), "#B9AECB", 5) + line((TX0 - 2, TY0 - 2, 120), (150, 180, 120), "#B9AECB", 5))
add(cone((150, 180, 112), [(TX0 + 8, TY0 + 8, 30), (TX1 - 8, TY0 + 8, 30), (TX1 - 8, TY1 - 8, 30), (TX0 + 8, TY1 - 8, 30)], SUN, "b3c"))
add(camera(150, 180, 122, SUN, SUN_LIP))
add('</g>')

# ---------------------------------------------------------------- hay rack, bowls, hide
add('<g class="b4">')
HX0, HY0, HX1, HY1 = 238, 120, 330, 142
add(prism(HX0, HY0, 0, HX1, HY1, 10, "#E8E1F1", "#D9CFE6", "#CBBFDC", sw=1.4))
for i in range(9):
    x = HX0 + 6 + i * 10
    add(line((x, HY1, 10), (x, HY1, 70), INK, 2))
add(line((HX0, HY1, 70), (HX1, HY1, 70), INK, 3) + line((HX0, HY1, 40), (HX1, HY1, 40), INK, 2))
for i in range(14):
    x = HX0 + 4 + i * 6.6
    add(line((x, HY0 + 10, 30 + (i % 3) * 8), (x + 3, HY0 + 4, 74 + (i % 4) * 5), "#E0B23C" if i % 2 else "#C9971F", 3))
add(line((HX0 + 4, HY1 + 6, 2), (HX0 + 30, HY1 + 20, 0), "#E0B23C", 3) + line((HX0 + 50, HY1 + 8, 2), (HX0 + 70, HY1 + 22, 0), "#C9971F", 3))
# a hide: a box with an arched door
add(prism(392, 122, 0, 458, 188, 50, "#F3EEFF", "#E3DAF3", "#D6CBEA", sw=2))
door = [iso(408, 188, 0), iso(408, 188, 28), iso(442, 188, 28), iso(442, 188, 0)]
add(f'<path d="M{door[0][0]:.1f} {door[0][1]:.1f} L{door[1][0]:.1f} {door[1][1]:.1f} Q{(door[1][0] + door[2][0]) / 2:.1f} {(door[1][1] + door[2][1]) / 2 - 22:.1f} {door[2][0]:.1f} {door[2][1]:.1f} L{door[3][0]:.1f} {door[3][1]:.1f} Z" fill="#B9AECB"/>')
def bowl(x, y, colour, inside):
    return (ellipse_at(x, y, 0, 24, "#C9BFDA") + ellipse_at(x, y, 6, 24, colour, INK, 2) + ellipse_at(x, y, 9, 18, inside))
add(bowl(330, 210, SUN, "#B07B3A") + "".join(ellipse_at(330 + dx, 210 + dy, 10, 3, "#8E5F28") for dx, dy in [(-6, -2), (4, 3), (8, -5)]))
add(bowl(375, 240, SKY, "#BFE5FB"))
add('</g>')

# ---------------------------------------------------------------- Xiaosi, as his own sticker
(sw_, sh_), b64 = sticker_b64()
bx, by = iso(330, 320, 0)
add(f'<g class="b5"><ellipse cx="{bx:.1f}" cy="{by:.1f}" rx="40" ry="10" fill="{INK}" opacity=".12"/>'
    f'<image href="data:image/png;base64,{b64}" xlink:href="data:image/png;base64,{b64}" x="{bx - sw_ * 0.45:.1f}" y="{by - sh_ * 0.8:.1f}" width="{sw_ * 0.85:.1f}" height="{sh_ * 0.85:.1f}" class="bun"/></g>')

# ---------------------------------------------------------------- the pen's front panels (in front of everything inside)
add('<g class="b2">' + panel((PX0, PY1), (PX1, PY1), 20) + panel((PX1, PY0), (PX1, PY1), 14) + '</g>')

# ---------------------------------------------------------------- cam 1: on a boom over the pen, looking down
add('<g class="b7">')
add(line((270, 0, 280), (270, 250, 280), "#B9AECB", 7) + line((270, 0, 280), (270, 0, 230), "#B9AECB", 7))
add(cone((270, 250, 270), [(PX0, PY0, 0), (PX1, PY0, 0), (PX1, PY1, 0), (PX0, PY1, 0)], FERN, "b7c"))
add(camera(270, 250, 284, FERN, FERN_LIP))
add('</g>')

# ---------------------------------------------------------------- cam 2: on a shelf on the left wall, watching the room
add('<g class="b8">')
add(prism(0, 300, 196, 34, 380, 204, "#CBBFDD", "#B6A9CC", "#A99BC2", stroke="none"))
add(cone((20, 340, 214), [(W, 40, 0), (W, D, 0), (260, D, 0)], SKY, "b8c"))
add(camera(20, 340, 222, SKY, SKY_LIP, facing="side"))
add('</g>')

# ---------------------------------------------------------------- callouts on the room
def callout(n, colour, text_col, title, sub, at, box, cls):
    (ax, ay), (bxx, byy) = iso(*at), box
    w = 22 + max(len(title) * 9.6, len(sub) * 7.6) + 30
    return (f'<g class="{cls} callout"><path d="M{ax:.1f} {ay:.1f} L{bxx + (0 if bxx > ax else w):.1f} {byy + 22:.1f}" stroke="{INK}" stroke-width="1.6" opacity=".55" fill="none"/>'
            f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="5" fill="{colour}" stroke="#fff" stroke-width="2"/>'
            f'<g filter="url(#lift)"><rect x="{bxx:.1f}" y="{byy:.1f}" width="{w:.0f}" height="48" rx="14" fill="#FFFFFF" stroke="{LINE}" stroke-width="1.6"/></g>'
            f'<circle cx="{bxx + 22:.1f}" cy="{byy + 24:.1f}" r="13" fill="{colour}"/><text x="{bxx + 22:.1f}" y="{byy + 29:.1f}" text-anchor="middle" font-size="14" font-weight="900" fill="{text_col}">{n}</text>'
            f'<text x="{bxx + 44:.1f}" y="{byy + 21:.1f}" font-size="15.5" font-weight="900" fill="{INK}">{title}</text>'
            f'<text x="{bxx + 44:.1f}" y="{byy + 39:.1f}" font-size="12.5" font-weight="800" fill="{MUTED}">{sub}</text></g>')
add(callout(1, FERN, "#fff", "FurSight Cam: overhead", "poses, flops, hay and bowls", (270, 250, 300), (560, 150), "b7"))
add(callout(2, SKY, "#fff", "FurSight Cam: the room", "roaming, chewing, room checks", (20, 340, 236), (40, 300), "b8"))
add(callout(3, GRAPE, "#fff", "FurSight Tray", "his weight, droppings, temperature", (TX0, TY1, 20), (40, 760), "b3"))
add(callout(4, SUN, INK, "Hay, food and water", "in view, so FurSight sees them go", (HX1, HY1, 74), (700, 250), "b4"))
add(callout(5, CORAL, "#fff", "Room check", "rings what he could chew", (575, 330, 0), (700, 966), "b6"))

# ================================================================ right column: inside the Tray (exploded)
add('<g class="b9">')
add(f'<g filter="url(#lift)"><rect x="1010" y="160" width="550" height="470" rx="26" fill="#FFFFFF" stroke="{LINE}" stroke-width="2"/></g>')
add(f'<text x="1040" y="202" font-size="22" font-weight="900" fill="{INK}">Inside the FurSight Tray</text>')
add(f'<text x="1040" y="228" font-size="14.5" font-weight="700" fill="{MUTED}">Weighs him and what he leaves at every visit. Fewer visits</text>')
add(f'<text x="1040" y="248" font-size="14.5" font-weight="700" fill="{MUTED}">or less output is one of the earliest signs of gut stasis.</text>')
E = dict(ox=1150, oy=486, sc=0.66)
layers = [  # (z, draw, label, sub)
    (318, "lid", "Camera hood", "droppings: count, size, colour"),
    (238, "tray", "Litter tray", "any standard rabbit tray"),
    (160, "plate", "Scale plate", "spreads his weight evenly"),
    (72, "cells", "4 load cells", "him and what he leaves, to the gram"),
    (0, "board", "Board and sensors", "Wi-Fi, temperature, humidity"),
]
for z, kind, title, sub in layers:
    if kind == "board":
        add(prism(20, 20, z, 150, 110, z + 8, "#2F8F5B", "#257A4C", "#1E6A41", sw=1.2, **E))
        add(prism(50, 40, z + 8, 90, 75, z + 16, "#2B2A33", "#222129", "#1A1920", stroke="none", **E))
        add(prism(110, 70, z + 8, 132, 92, z + 20, "#FFFFFF", "#E4E0EC", "#D6D1E0", sw=1, **E))
    elif kind == "cells":
        for (x, y) in [(10, 10), (140, 10), (10, 100), (140, 100)]:
            add(prism(x, y, z, x + 22, y + 22, z + 12, "#D8D6DE", "#BDBAC6", "#A9A6B4", sw=1.2, **E))
    elif kind == "plate":
        add(prism(0, 0, z, 172, 132, z + 8, GRAPE, GRAPE_LIP, "#6A42BF", sw=1.4, **E))
    elif kind == "tray":
        add(prism(6, 6, z, 166, 126, z + 30, "#FFFFFF", "#F1EEF6", "#E4E0EC", sw=1.6, **E))
        add(poly([(14, 14, z + 27), (158, 14, z + 27), (158, 118, z + 27), (14, 118, z + 27)], "url(#litter)", **E))
    elif kind == "lid":
        add(line((0, 0, z - 30), (0, 0, z), "#B9AECB", 4, **E))
        add(prism(0, 0, z, 172, 20, z + 10, "#E8E1F1", "#D9CFE6", "#CBBFDC", sw=1.2, **E))
        cx2, cy2 = iso(86, 10, z + 10, **E)
        add(f'<g transform="translate({cx2 - 20:.1f} {cy2 - 18:.1f})"><rect width="40" height="22" rx="7" fill="{INK}"/><circle cx="20" cy="16" r="6" fill="{SUN}"/></g>')
    ax_, ay_, az_ = {"lid": (172, 20, z + 5), "tray": (166, 126, z + 15), "plate": (172, 132, z + 4), "cells": (162, 122, z + 6), "board": (150, 110, z + 4)}[kind]
    lx_, ly_ = iso(ax_, ay_, az_, **E)
    add(f'<line x1="{lx_ + 8:.1f}" y1="{ly_:.1f}" x2="1296" y2="{ly_:.1f}" stroke="{INK}" stroke-width="1.4" stroke-dasharray="3 4" opacity=".45"/>')
    add(f'<text x="1304" y="{ly_ - 2:.1f}" font-size="15.5" font-weight="900" fill="{INK}">{title}</text>'
        f'<text x="1304" y="{ly_ + 17:.1f}" font-size="12.5" font-weight="800" fill="{MUTED}">{sub}</text>')
# guide lines tying the layers together
for (x, y) in [(0, 0), (172, 0), (172, 132)]:
    add(line((x, y, 8), (x, y, 318), "#B9AECB", 1.4, extra='stroke-dasharray="2 6"', **E))
add('</g>')

# ================================================================ right column: from the kit to you
add('<g class="b10">')
add(f'<g filter="url(#lift)"><rect x="1010" y="656" width="550" height="370" rx="26" fill="{INK}"/></g>')
add(f'<text x="1040" y="698" font-size="22" font-weight="900" fill="#FFFFFF">From the kit to you</text>')
add(f'<text x="1040" y="724" font-size="14" font-weight="800" fill="#C9C7D2">Pictures, his weight and the room go up; verdicts and alerts come back.</text>')
def node(x, y, w, h, fill, title, sub, title_col="#FFFFFF", sub_col="#C9C7D2"):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}"/><text x="{x + 18}" y="{y + 30}" font-size="16" font-weight="900" fill="{title_col}">{title}</text>'
            + "".join(f'<text x="{x + 18}" y="{y + 52 + i * 19}" font-size="12.5" font-weight="800" fill="{sub_col}">{s}</text>' for i, s in enumerate(sub)))
add(node(1040, 748, 230, 92, "#3A3946", "Household hub", ["shared diary, live pet cam relay,", "one household, every device"]))
add(node(1300, 748, 230, 92, GRAPE, "Meta Model API", ["Muse Spark: verdicts, poses, Ask", "SAM 3.1: him, hay, droppings"], sub_col="#F3EEFF"))
add(f'<path d="M1270 794 H1296" stroke="#FFFFFF" stroke-width="3" marker-end="url(#arr)" class="flow"/>')
devs = [("iPhone and web", "diary, stats, Ask, alerts", 1040), ("Ray-Ban Display", "can he eat this? pet cam", 1205), ("Meta Quest", "cards on real food", 1370)]
for t, s, x in devs:
    add(f'<rect x="{x}" y="876" width="160" height="132" rx="16" fill="#3A3946"/>')
    add(f'<text x="{x + 16}" y="978" font-size="15" font-weight="900" fill="#FFFFFF">{t}</text><text x="{x + 16}" y="997" font-size="12" font-weight="800" fill="#C9C7D2">{s}</text>')
# device icons
add(f'<g transform="translate(1058 890)"><rect width="38" height="62" rx="9" fill="#FFFFFF"/><rect x="4" y="6" width="30" height="46" rx="5" fill="{GRAPE}"/></g>')
add(f'<g transform="translate(1222 906)" fill="none" stroke="#FFFFFF" stroke-width="5"><rect x="0" y="4" width="34" height="26" rx="10"/><rect x="44" y="4" width="34" height="26" rx="10"/><path d="M34 15 H44"/><rect x="50" y="10" width="14" height="10" rx="2" fill="{FERN}" stroke="none"/></g>')
add(f'<g transform="translate(1388 904)"><rect width="74" height="44" rx="16" fill="#FFFFFF"/><circle cx="22" cy="22" r="9" fill="{SKY}"/><circle cx="52" cy="22" r="9" fill="{SKY}"/></g>')
for x in (1155, 1285, 1415):
    add(f'<path d="M{x} 840 V870" stroke="#FFFFFF" stroke-width="3" fill="none" marker-end="url(#arr)" class="flow"/>')
add('</g>')
# the kit feeds the hub
add(f'<path class="b10 flow" d="M984 794 H1034" stroke="{GRAPE_LIP}" stroke-width="3.5" fill="none" marker-end="url(#arr)"/>')

# footnote
add(f'<g class="b0"><text x="48" y="1042" font-size="14" font-weight="700" fill="{MUTED}">Schematic, not to scale. In the hackathon build the cams are any webcam or old phone running the FurSight cam page;</text>'
    f'<text x="48" y="1064" font-size="14" font-weight="700" fill="{MUTED}">the Tray\'s scale and sensors are simulated in the app, and labelled as simulated wherever they show.</text></g>')
add('</svg>')

svg = "\n".join(out)
for p in [os.path.join(ROOT, "docs/kit.svg"), os.path.join(ROOT, "server/public/kit/kit.svg")]:
    open(p, "w").write(svg)
print("wrote", len(svg) // 1024, "KB")
