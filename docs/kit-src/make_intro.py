"""The intro scene for the trailer, in the kit schematic's style: the same room and pen, every prop in its own
group (so the page can show, hide and animate it), and Xiaosi's stickers for the page to move round the room.

    python3 docs/kit-src/make_intro.py   -> server/public/intro/intro.svg and intro/scene.json

The story itself (where he goes, what's said, when the kit arrives) lives in server/public/intro/index.html.
"""
import base64, io, json, math, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "make_kit.py")).read()
ns = {"__file__": os.path.join(HERE, "make_kit.py")}
exec(src.split("# ==== end of helpers")[0], ns)          # iso, poly, prism, cone, camera... and the palette
g = ns
g["OX"], g["OY"], g["SC"] = 720, 300, 0.86                 # centred on a 1600x900 stage
iso, poly, line, prism, ellipse_at, cone, camera = g["iso"], g["poly"], g["line"], g["prism"], g["ellipse_at"], g["cone"], g["camera"]
INK, MUTED, FERN, FERN_LIP, SUN, SUN_LIP, CORAL, SKY, SKY_LIP, GRAPE, GRAPE_LIP = (g[k] for k in "INK MUTED FERN FERN_LIP SUN SUN_LIP CORAL SKY SKY_LIP GRAPE GRAPE_LIP".split())
W, D, H = 700, 430, 300
PX0, PY0, PX1, PY1, PH = 70, 110, 470, 390, 64

out = []
def add(s): out.append(s)
def group(id_, inner, hidden=False): return f'<g id="{id_}"{" opacity=\"0\"" if hidden else ""}>{inner}</g>'

add('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 900" width="1600" height="900" font-family="Nunito, \'Avenir Next\', system-ui, sans-serif">')
add(f'''<defs>
  <pattern id="planks" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="matrix(0.866 0.5 -0.866 0.5 0 0)"><rect width="44" height="44" fill="#EFE8F7"/><path d="M0 43.5H44" stroke="#E1D7EE" stroke-width="2"/><path d="M22 0V44" stroke="#E7DFF2" stroke-width="1.4"/></pattern>
  <pattern id="litter" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#E9DCC2"/><circle cx="2" cy="2" r="1.3" fill="#D3C19E"/><circle cx="6" cy="6" r="1.2" fill="#D3C19E"/></pattern>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="{INK}" flood-opacity=".22"/></filter>
</defs>''')
add('<rect width="1600" height="900" fill="#F6F5F9"/>')

# ---------------------------------------------------------------- the room
r = poly([(0, 0, 0), (W, 0, 0), (W, D, 0), (0, D, 0)], "url(#planks)", "#D9D0E6", 2)
r += poly([(0, 0, 0), (W, 0, 0), (W, 0, H), (0, 0, H)], "#F8F5FC", "#DCD3E8", 2) + poly([(0, 0, 0), (0, D, 0), (0, D, H), (0, 0, H)], "#EFEAF7", "#DCD3E8", 2)
r += poly([(0, 0, 0), (W, 0, 0), (W, 0, 14), (0, 0, 14)], "#E6DDF1") + poly([(0, 0, 0), (0, D, 0), (0, D, 14), (0, 0, 14)], "#DED4EC")
r += poly([(300, 0, 120), (440, 0, 120), (440, 0, 250), (300, 0, 250)], "#E7F5FE", "#CFE6F6", 4) + line((370, 0, 120), (370, 0, 250), "#CFE6F6", 4) + line((300, 0, 185), (440, 0, 185), "#CFE6F6", 4)
r += poly([(300, 0, 0), (440, 0, 0), (600, 220, 0), (460, 220, 0)], "#FFFFFF", extra='opacity=".5"')
r += prism(640, 22, 0, 672, 54, 34, "#C7B9DD", "#B6A6D0", "#A894C6", stroke="none") + ellipse_at(656, 38, 34, 32, FERN) + ellipse_at(648, 30, 58, 22, FERN_LIP) + ellipse_at(662, 44, 72, 16, FERN)
add(group("room", r))

# the lamp and its cable (the cable gets a red ring when he chews it, and when the room check finds it)
c = ellipse_at(670, 405, 0, 18, "#C9BFDA") + line((670, 405, 0), (670, 405, 150), "#B9AECB", 5)
lx, ly = iso(670, 405, 170)
c += f'<path d="M{lx - 26:.1f} {ly + 22:.1f} L{lx - 14:.1f} {ly - 12:.1f} H{lx + 14:.1f} L{lx + 26:.1f} {ly + 22:.1f} Z" fill="{SUN}" stroke="{INK}" stroke-width="2"/>'
cb = [iso(670, 405, 0), iso(620, 430, 0), iso(560, 400, 0), iso(520, 428, 0)]
c += f'<path d="M{cb[0][0]:.1f} {cb[0][1]:.1f} C{cb[1][0]:.1f} {cb[1][1]:.1f} {cb[2][0]:.1f} {cb[2][1]:.1f} {cb[3][0]:.1f} {cb[3][1]:.1f}" stroke="{INK}" stroke-width="3" fill="none"/>'
add(group("lamp", c))
rx, ry = iso(580, 412, 0)
add(group("cablering", f'<ellipse cx="{rx:.1f}" cy="{ry:.1f}" rx="48" ry="27" fill="{CORAL}" fill-opacity=".12" stroke="{CORAL}" stroke-width="4" stroke-dasharray="7 5"/>', True))

# half an avocado someone left on the floor: healthy for us, can be fatal for a rabbit (persin)
ax_, ay_ = iso(566, 272, 0)
avo = (f'<g transform="translate({ax_:.1f} {ay_ - 12:.1f}) rotate(-18)"><ellipse cx="0" cy="18" rx="26" ry="7" fill="{INK}" opacity=".12"/>'
       f'<path d="M0 -26 C16 -26 24 -6 24 6 C24 20 13 26 0 26 C-13 26 -24 20 -24 6 C-24 -6 -16 -26 0 -26 Z" fill="#3E6B2A" stroke="{INK}" stroke-width="2"/>'
       f'<path d="M0 -21 C12 -21 19 -5 19 6 C19 17 10 21 0 21 C-10 21 -19 17 -19 6 C-19 -5 -12 -21 0 -21 Z" fill="#C9DB7A"/>'
       f'<circle cx="0" cy="8" r="9" fill="#8A5A2B" stroke="{INK}" stroke-width="1.6"/><circle cx="-3" cy="5" r="2.4" fill="#B07B3A"/></g>')
add(group("avo", avo))
gx_, gy_ = iso(566, 272, 0)
add(group("avoglow", f'<ellipse cx="{gx_:.1f}" cy="{gy_:.1f}" rx="46" ry="26" fill="{CORAL}" fill-opacity=".14" stroke="{CORAL}" stroke-width="4" stroke-dasharray="7 5"/>', True))

# a strawberry: the treat he loves, and the worry since his GI stasis
bx_, by_ = iso(360, 330, 0)
berry = (f'<g transform="translate({bx_:.1f} {by_ - 18:.1f})"><ellipse cx="0" cy="20" rx="16" ry="5" fill="{INK}" opacity=".12"/>'
         f'<path d="M-12 -6 C-18 8 -4 22 0 22 C4 22 18 8 12 -6 C6 -11 -6 -11 -12 -6 Z" fill="{CORAL}" stroke="{INK}" stroke-width="2"/>'
         + "".join(f'<ellipse cx="{dx}" cy="{dy}" rx="1.2" ry="1.8" fill="#FFE27A"/>' for dx, dy in [(-5, -1), (4, -3), (7, 6), (-3, 7), (1, 14)])
         + f'<path d="M-10 -7 L-3 -12 L0 -18 L3 -12 L10 -7 Z" fill="{FERN}" stroke="{INK}" stroke-width="1.6"/></g>')
add(group("berry", berry, True))
add(group("berryq", f'<g transform="translate({bx_ + 26:.1f} {by_ - 58:.1f})"><circle r="16" fill="#FFFFFF" stroke="{SUN}" stroke-width="3"/><text y="7" text-anchor="middle" font-size="22" font-weight="900" fill="{SUN_LIP}">?</text></g>', True))

# ---------------------------------------------------------------- the pen, his litter tray, hay, bowls, hide
def panel(a, b, n):
    s = ""; (x0, y0), (x1, y1) = a, b
    for i in range(n + 1):
        t = i / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        s += line((x, y, 0), (x, y, PH), "#BDB2CF", 2.4)
    return s + line((x0, y0, PH), (x1, y1, PH), "#A99CC0", 4) + line((x0, y0, 10), (x1, y1, 10), "#BDB2CF", 3)
add(group("penback", poly([(PX0, PY0, 0), (PX1, PY0, 0), (PX1, PY1, 0), (PX0, PY1, 0)], "#E2F3E8", "#CDE8D6", 2) + panel((PX0, PY0), (PX1, PY0), 20) + panel((PX0, PY0), (PX0, PY1), 14)))
TX0, TY0, TX1, TY1 = 92, 135, 222, 225
add(group("trayscale", prism(TX0 - 6, TY0 - 6, 0, TX1 + 6, TY1 + 6, 7, GRAPE, GRAPE_LIP, "#6A42BF", sw=1.6), True))   # the FurSight Tray, arriving later
add(group("litter", prism(TX0, TY0, 7, TX1, TY1, 34, "#FFFFFF", "#F1EEF6", "#E4E0EC", sw=2)
          + poly([(TX0 + 8, TY0 + 8, 30), (TX1 - 8, TY0 + 8, 30), (TX1 - 8, TY1 - 8, 30), (TX0 + 8, TY1 - 8, 30)], "url(#litter)")))
rx_, ry_ = iso(TX1, (TY0 + TY1) / 2, 4)
tc = f'<g transform="translate({rx_ + 4:.1f} {ry_ - 14:.1f})"><rect width="44" height="17" rx="5" fill="#22212A"/><text x="22" y="13" text-anchor="middle" font-size="11" font-weight="900" fill="#7CF0A3">1.10kg</text></g>'
tc += line((TX0 - 2, TY0 - 2, 34), (TX0 - 2, TY0 - 2, 120), "#B9AECB", 5) + line((TX0 - 2, TY0 - 2, 120), (150, 180, 120), "#B9AECB", 5)
tc += cone((150, 180, 112), [(TX0 + 8, TY0 + 8, 30), (TX1 - 8, TY0 + 8, 30), (TX1 - 8, TY1 - 8, 30), (TX0 + 8, TY1 - 8, 30)], SUN, "") + camera(150, 180, 122, SUN, SUN_LIP)
add(group("traytop", tc, True))
HX0, HY0, HX1, HY1 = 238, 120, 330, 142
h = prism(HX0, HY0, 0, HX1, HY1, 10, "#E8E1F1", "#D9CFE6", "#CBBFDC", sw=1.4)
for i in range(9): h += line((HX0 + 6 + i * 10, HY1, 10), (HX0 + 6 + i * 10, HY1, 70), INK, 2)
h += line((HX0, HY1, 70), (HX1, HY1, 70), INK, 3) + line((HX0, HY1, 40), (HX1, HY1, 40), INK, 2)
add(group("hayrack", h))
hs = ""
for i in range(14):
    x = HX0 + 4 + i * 6.6
    hs += line((x, HY0 + 10, 30 + (i % 3) * 8), (x + 3, HY0 + 4, 74 + (i % 4) * 5), "#E0B23C" if i % 2 else "#C9971F", 3)
add(group("hay", hs))
def bowl(x, y, colour, inside): return ellipse_at(x, y, 0, 24, "#C9BFDA") + ellipse_at(x, y, 6, 24, colour, INK, 2) + ellipse_at(x, y, 9, 18, inside)
add(group("bowls", bowl(330, 210, SUN, "#B07B3A") + bowl(375, 240, SKY, "#BFE5FB")))
hide = prism(392, 122, 0, 458, 188, 50, "#F3EEFF", "#E3DAF3", "#D6CBEA", sw=2)
door = [iso(408, 188, 0), iso(408, 188, 28), iso(442, 188, 28), iso(442, 188, 0)]
hide += f'<path d="M{door[0][0]:.1f} {door[0][1]:.1f} L{door[1][0]:.1f} {door[1][1]:.1f} Q{(door[1][0] + door[2][0]) / 2:.1f} {(door[1][1] + door[2][1]) / 2 - 22:.1f} {door[2][0]:.1f} {door[2][1]:.1f} L{door[3][0]:.1f} {door[3][1]:.1f} Z" fill="#B9AECB"/>'
add(group("hide", hide))
add(group("penfront", panel((PX0, PY1), (PX1, PY1), 20) + panel((PX1, PY0), (PX1, PY1), 14)))

# ---------------------------------------------------------------- the kit arriving: cam 1 on the pen, cam 2 on the shelf
c0, c1, c2 = iso(270, PY0, PH), iso(270, PY0 - 10, 250), iso(270, 220, 236)
k1 = f'<path d="M{c0[0]:.1f} {c0[1]:.1f} Q{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f}" stroke="#8E84A3" stroke-width="7" fill="none" stroke-linecap="round"/>'
k1 += cone((270, 236, 222), [(PX0, PY0, 0), (PX1, PY0, 0), (PX1, PY1, 0), (PX0, PY1, 0)], FERN, "") + camera(270, 236, 236, FERN, FERN_LIP)
add(group("cam1", k1, True))
k2 = prism(0, 300, 196, 34, 380, 204, "#CBBFDD", "#B6A9CC", "#A99BC2", stroke="none")
k2 += f'<g id="cone2">{cone((22, 340, 222), [(W, 40, 0), (W, D, 0), (260, D, 0)], SKY, "")}</g>'
px_, py_ = iso(22, 340, 222)
k2 += (f'<g transform="translate({px_:.1f} {py_:.1f})"><ellipse cx="0" cy="16" rx="18" ry="7" fill="#45434F"/><rect x="-7" y="2" width="14" height="14" fill="#45434F"/>'
       f'<circle cx="0" cy="-4" r="19" fill="{INK}"/><circle cx="9" cy="-1" r="9" fill="{SKY}"/><circle cx="10" cy="-1" r="4" fill="{SKY_LIP}"/><circle cx="-9" cy="-14" r="2.6" fill="{CORAL}"/></g>')
add(group("cam2", k2, True))

# ---------------------------------------------------------------- what FurSight says, as cards that pop up later
def card(id_, x, y, colour, mark, title, word, word_col, sub, w=250):
    return group(id_, f'<g filter="url(#soft)"><rect x="{x}" y="{y}" width="{w}" height="82" rx="18" fill="#FFFFFF"/><rect x="{x}" y="{y + 76}" width="{w}" height="8" rx="4" fill="{colour}"/></g>'
                 f'<circle cx="{x + 30}" cy="{y + 32}" r="17" fill="{colour}"/><text x="{x + 30}" y="{y + 39}" text-anchor="middle" font-size="19" font-weight="900" fill="{INK}">{mark}</text>'
                 f'<text x="{x + 58}" y="{y + 29}" font-size="17" font-weight="900" fill="{INK}">{title}</text><text x="{x + 58}" y="{y + 49}" font-size="14" font-weight="900" fill="{word_col}">{word}</text>'
                 f'<text x="{x + 18}" y="{y + 69}" font-size="12.5" font-weight="800" fill="{MUTED}">{sub}</text>', True)
add(card("cardCable", 1150, 640, CORAL, "!", "Room check", "Cable within reach", "#D93545", "pet cam · run it behind the sofa"))
add(card("cardAvo", 1160, 400, CORAL, "✕", "Avocado", "Don't", "#D93545", "food check · persin can be fatal", w=260))
add(card("cardHay", 820, 70, SUN, "!", "Hay", "40% gone since 8 am", SUN_LIP, "pet cam · eating normally"))
add(card("cardTray", 60, 470, GRAPE, "✓", "Litter tray", "1.10 kg · 9 visits", GRAPE_LIP, "FurSight Tray · weight steady"))
add(card("cardBerry", 1150, 520, SUN, "!", "Strawberry", "Small treat only", SUN_LIP, "had some 2 days ago · OK again Sun", w=270))

# ask from the glasses or the Quest
ask = (f'<g filter="url(#soft)"><rect x="60" y="250" width="330" height="96" rx="20" fill="#FFFFFF"/><rect x="60" y="340" width="330" height="8" rx="4" fill="{GRAPE}"/></g>'
       f'<g transform="translate(80 270)" fill="none" stroke="{INK}" stroke-width="4"><rect x="0" y="4" width="26" height="20" rx="8"/><rect x="34" y="4" width="26" height="20" rx="8"/><path d="M26 13 H34"/><rect x="38" y="9" width="10" height="8" rx="2" fill="{FERN}" stroke="none"/></g>'
       f'<g transform="translate(84 304)"><rect width="56" height="30" rx="11" fill="{INK}"/><circle cx="17" cy="15" r="6" fill="{SKY}"/><circle cx="39" cy="15" r="6" fill="{SKY}"/></g>'
       f'<text x="160" y="284" font-size="15" font-weight="900" fill="{MUTED}">You ask: what\'s he doing?</text>'
       f'<text x="160" y="310" font-size="20" font-weight="900" fill="{INK}">Having a big flop</text>'
       f'<text x="160" y="330" font-size="13" font-weight="800" fill="{GRAPE_LIP}">Ray-Ban Display · Meta Quest · iPhone</text>')
add(group("cardAsk", ask, True))
# away from home: a phone with a FurSight notification carrying a sticker of him
away = (f'<g filter="url(#soft)"><rect x="1190" y="230" width="250" height="440" rx="38" fill="{INK}"/></g><rect x="1202" y="244" width="226" height="412" rx="28" fill="#EDE7F7"/>'
        f'<rect x="1272" y="254" width="86" height="18" rx="9" fill="{INK}"/>'
        f'<text x="1315" y="320" text-anchor="middle" font-size="40" font-weight="900" fill="{INK}">14:20</text>'
        f'<rect x="1214" y="350" width="202" height="190" rx="18" fill="#FFFFFF"/>'
        f'<rect x="1226" y="362" width="18" height="18" rx="5" fill="{GRAPE}"/><text x="1252" y="376" font-size="12" font-weight="900" fill="{MUTED}">FURSIGHT · now</text>'
        f'<text x="1226" y="402" font-size="15" font-weight="900" fill="{INK}">Xiaosi is being cheeky</text>'
        f'<image id="awaySticker" x="1255" y="410" width="120" height="120"/>'
        f'<rect x="1214" y="552" width="202" height="44" rx="14" fill="#FFFFFF"/><text x="1232" y="580" font-size="14" font-weight="800" fill="{MUTED}">Ask how he is…</text>')
add(group("cardAway", away, True))

# his week on a card (the weekly fact card, in miniature); the page fills in his stickers
X0, Y0 = 1110, 120
wk = (f'<g filter="url(#soft)"><rect x="{X0}" y="{Y0}" width="320" height="400" rx="24" fill="{GRAPE}"/></g>'
      f'<circle cx="{X0 + 290}" cy="{Y0 + 30}" r="70" fill="#FFFFFF" opacity=".1"/>'
      f'<text x="{X0 + 22}" y="{Y0 + 36}" font-size="17" font-weight="900" fill="#FFFFFF">XIAOSI&#39;S WEEK</text>'
      f'<text x="{X0 + 22}" y="{Y0 + 56}" font-size="11.5" font-weight="800" fill="#F3EEFF">23 to 29 Oct · aka Little Loaf, Mr Si</text>'
      f'<image class="wk" data-k="eating" x="{X0 + 14}" y="{Y0 + 72}" width="96" height="96" transform="rotate(-9 {X0 + 62} {Y0 + 120})"/>'
      f'<image class="wk" data-k="alert" x="{X0 + 212}" y="{Y0 + 70}" width="96" height="96" transform="rotate(8 {X0 + 260} {Y0 + 118})"/>'
      f'<image class="wk" data-k="stretch" x="{X0 + 80}" y="{Y0 + 70}" width="160" height="110"/>'
      f'<rect x="{X0 + 14}" y="{Y0 + 192}" width="292" height="196" rx="18" fill="#FFFFFF"/>'
      f'<text x="{X0 + 30}" y="{Y0 + 224}" font-size="19" font-weight="900" fill="{INK}">Little Loaf&#39;s lazy week</text>')
for i, (big, lab) in enumerate([("1.10 kg", "weight, steady"), ("17", "flops"), ("14 h 54", "loafing"), ("9", "tray visits a day")]):
    x, y = X0 + 26 + (i % 2) * 140, Y0 + 238 + (i // 2) * 66
    wk += (f'<rect x="{x}" y="{y}" width="128" height="56" rx="12" fill="#F3EEFF"/><text x="{x + 12}" y="{y + 27}" font-size="19" font-weight="900" fill="{INK}">{big}</text>'
           f'<text x="{x + 12}" y="{y + 46}" font-size="11" font-weight="800" fill="{MUTED}">{lab}</text>')
add(group("cardWeek", wk, True))

add('<g id="bunwrap"><ellipse id="bunshadow" cx="0" cy="0" rx="34" ry="9" fill="#2B2A33" opacity=".14"/><image id="bun" x="0" y="0" width="10" height="10"/></g>')
add('</svg>')

# ---------------------------------------------------------------- where he goes, and his stickers
def b64(name, box=170):
    im = Image.open(os.path.join(os.path.dirname(os.path.dirname(HERE)), "server/public/demo", name)); im.thumbnail((box, box))
    b = io.BytesIO(); im.save(b, "PNG", optimize=True)
    return {"src": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), "w": im.size[0], "h": im.size[1]}
spots = {"pen": (300, 300), "gate": (500, 330), "cable": (612, 396), "avo": (585, 250), "hay": (290, 175), "hunch": (300, 230), "away": (420, 360)}
scene = {"spots": {k: iso(x, y, 0) for k, (x, y) in spots.items()},
         "stickers": {"side": b64("xiaosi-sticker-3.png"), **{k: b64(f"story/{k}.png") for k in ["bum", "loaf", "eating", "alert", "grooming", "standing", "stretch"]}},
         "targets": {"cable": iso(580, 412, 0), "avo": iso(566, 272, 0)}}
dest = os.path.join(os.path.dirname(os.path.dirname(HERE)), "server/public/intro")
os.makedirs(dest, exist_ok=True)
open(os.path.join(dest, "intro.svg"), "w").write("\n".join(out))
json.dump(scene, open(os.path.join(dest, "scene.json"), "w"))
print("wrote intro.svg and scene.json")
