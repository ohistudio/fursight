"""A concept render of the FurSight Tray, for the kit page and the README (not a photo of a real product).

    /Applications/Blender.app/Contents/MacOS/Blender -b -P docs/kit-src/tray_render.py -- docs/tray-concept.png
    python3 docs/kit-src/tray_labels.py docs/tray-concept.png docs/tray-concept.jpg

Shaped like a real rabbit litter tray: a tapered tub with a low front, a grid floor he stands on, and a wire hay
rack hooked over the back. FurSight hides in it: a slim scale under the tub (just a small readout on the front),
a camera built into the back corner looking down, a temperature sensor. Xiaosi's own sticker sits on the grid.
Anchor points for the labels are written next to the render (.json) for tray_labels.py.
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/tray.png"
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, rgb, rough=0.4, metal=0.0, emit=None, strength=4.0, spec=0.5, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m

def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

M = {
    "base": mat("base", srgb("#C9BEDB"), 0.5, coat=0.15),
    "foot": mat("foot", srgb("#5E5870"), 0.6),
    "accent": mat("accent", srgb("#9B6CF0"), 0.35, coat=0.3),
    "white": mat("white", srgb("#F7F6F9"), 0.25, coat=0.4),
    "screen": mat("screen", srgb("#141318"), 0.12, coat=1.0),
    "digits": mat("digits", srgb("#7CF0A3"), 0.4, emit=srgb("#7CF0A3"), strength=6),
    "led": mat("led", srgb("#3DBE6B"), 0.3, emit=srgb("#3DBE6B"), strength=12),
    "lens": mat("lens", srgb("#0B0B10"), 0.05, coat=1.0),
    "lensring": mat("lensring", srgb("#2FA8F5"), 0.3, emit=srgb("#2FA8F5"), strength=1.5),
    "litter": mat("litter", srgb("#D9C9A6"), 0.9),
    "litter2": mat("litter2", srgb("#C8B48A"), 0.9),
    "poo": mat("poo", srgb("#4A3322"), 0.7),
    "hay": mat("hay", srgb("#D7B95A"), 0.8),
    "hay2": mat("hay2", srgb("#B9A04A"), 0.8),
    "grid": mat("grid", srgb("#DCD3EC"), 0.45, coat=0.2),
    "wire": mat("wire", srgb("#F4F2F8"), 0.25, metal=0.6),
    "rack": mat("rack", srgb("#CFC6DD"), 0.4),
    "floor": mat("floor", srgb("#E6E0EF"), 0.85),
    "vent": mat("vent", srgb("#8A8399"), 0.6),
}

def box(name, size, loc, material, bevel=0.0, segs=6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL"); mod.width = bevel; mod.segments = segs; mod.limit_method = "ANGLE"
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o

def cyl(name, r, depth, loc, material, rot=(0, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name; o.data.materials.append(material); bpy.ops.object.shade_smooth()
    return o

def text(body, size, loc, rot, material, extrude=0.0006, align="CENTER"):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.object; t.data.body = body; t.data.size = size; t.data.extrude = extrude
    t.data.align_x = align; t.data.align_y = "CENTER"; t.data.materials.append(material)
    return t

# ---------------------------------------------------------------- the tub: tapered, high back and sides, a low front
TW, TD, TH, DROP = 0.46, 0.36, 0.15, 0.055       # width, depth, back height, how much lower the front is
Z0 = 0.022                                        # sits on the slim scale
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    x, y, z = v.co.x * TW, v.co.y * TD, v.co.z * TH
    if v.co.z > 0:
        x *= 1.09; y *= 1.09                          # walls flare out
        if v.co.y < 0: z -= DROP                      # the low front, so he can hop in
    v.co = Vector((x, y, z))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.5], context="FACES")
me = bpy.data.meshes.new("tub"); bm.to_mesh(me); bm.free()
tub = bpy.data.objects.new("tub", me); scene.collection.objects.link(tub)
tub.location = (0, 0, Z0 + TH / 2)
bev = tub.modifiers.new("bevel", "BEVEL"); bev.width = 0.05; bev.segments = 12; bev.limit_method = "ANGLE"
sol = tub.modifiers.new("solid", "SOLIDIFY"); sol.thickness = 0.012; sol.offset = -1
bev2 = tub.modifiers.new("bevel2", "BEVEL"); bev2.width = 0.004; bev2.segments = 4; bev2.limit_method = "ANGLE"
tub.data.materials.append(M["white"])
for p in tub.data.polygons: p.use_smooth = True

# ---------------------------------------------------------------- the hidden scale: a slim plinth, one small readout
PW, PD = TW - 0.07, TD - 0.07
box("plinth", (PW, PD, Z0), (0, 0, Z0 / 2), M["base"], bevel=0.008)
box("stripe", (PW - 0.02, 0.004, 0.004), (0, -PD / 2 - 0.0005, Z0 * 0.55), M["accent"], bevel=0.0015)
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl(f"foot{sx}{sy}", 0.016, 0.006, (sx * (TW / 2 - 0.05), sy * (TD / 2 - 0.05), 0.003), M["foot"])
# the front tab: a pull handle with a little readout and a status light
FY = -TD / 2 * 1.09 - 0.006; FZ = Z0 + TH - DROP - 0.006
box("tab", (0.12, 0.03, 0.02), (0, FY - 0.004, FZ), M["base"], bevel=0.008)
box("screen", (0.064, 0.004, 0.012), (0.004, FY - 0.0195, FZ + 0.001), M["screen"], bevel=0.002)
text("1.10 kg", 0.0075, (0.004, FY - 0.0218, FZ + 0.0005), (math.radians(90), 0, 0), M["digits"])
cyl("led", 0.0022, 0.003, (-0.042, FY - 0.019, FZ + 0.001), M["led"], rot=(math.radians(90), 0, 0))

# temperature and humidity: a few slots on the right
for i in range(5):
    box(f"vent{i}", (0.003, 0.012, 0.004), (PW / 2 + 0.0004, -0.03 + i * 0.016, Z0 * 0.55), M["vent"], bevel=0.001)

# ---------------------------------------------------------------- the grid floor he stands on (droppings fall through, stay in view)
GZ = Z0 + 0.035; GW, GD = TW - 0.035, TD - 0.035
ring = box("gridframe", (GW, GD, 0.008), (0, 0, GZ), M["grid"], bevel=0.006)
ring.modifiers.new("hole", "BOOLEAN")
hole = box("gridhole", (GW - 0.03, GD - 0.03, 0.05), (0, 0, GZ), M["grid"], bevel=0.01)
ring.modifiers["hole"].object = hole; ring.modifiers["hole"].operation = "DIFFERENCE"; hole.hide_render = hole.hide_viewport = True
nx, ny = 26, 20
for i in range(1, nx):
    box(f"gx{i}", (0.0035, GD - 0.02, 0.006), (-GW / 2 + i * GW / nx, 0, GZ), M["grid"])
for j in range(1, ny):
    box(f"gy{j}", (GW - 0.02, 0.0035, 0.006), (0, -GD / 2 + j * GD / ny, GZ), M["grid"])
# litter under the grid, two droppings on it (what the camera counts)
LZ = Z0 + 0.016
pellet = bpy.data.meshes.new("pellet")
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.004, radius2=0.004, depth=0.012); bm.to_mesh(pellet); bm.free()
pellet.materials.append(M["litter"])
for i in range(500):
    o = bpy.data.objects.new(f"pellet{i}", pellet); scene.collection.objects.link(o)
    o.location = (random.uniform(-GW / 2 + 0.02, GW / 2 - 0.02), random.uniform(-GD / 2 + 0.02, GD / 2 - 0.02), LZ + random.uniform(-0.004, 0.004))
    o.rotation_euler = (random.uniform(1.2, 1.9), 0, random.uniform(0, math.pi))
for i, (x, y) in enumerate([(-0.12, -0.06), (-0.105, -0.045), (-0.135, -0.035)]):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0065, location=(x, y, GZ + 0.008))
    o = bpy.context.object; o.scale = (1, 1, 0.85); o.data.materials.append(M["poo"]); bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- the wire hay rack, hooked over the back wall
BY = TD / 2 * 1.09 - 0.012; TOPZ = Z0 + TH
RX0, RX1 = -0.13, 0.09; RD = 0.07                     # x span, how far it sticks out from the back wall
def rod(name, a, b, r=0.0022):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(a + b) / 2, vertices=10)
    o = bpy.context.object; o.name = name; o.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); o.data.materials.append(M["wire"]); bpy.ops.object.shade_smooth()
for i in range(12):
    x = RX0 + i * (RX1 - RX0) / 11
    rod(f"rf{i}", (x, BY - RD, TOPZ - 0.085), (x, BY - RD, TOPZ + 0.01))          # front bars
    rod(f"rb{i}", (x, BY - RD, TOPZ - 0.085), (x, BY - 0.006, TOPZ - 0.05))        # sloping floor of the basket
rod("rtop", (RX0, BY - RD, TOPZ + 0.01), (RX1, BY - RD, TOPZ + 0.01), 0.003)
rod("rbot", (RX0, BY - RD, TOPZ - 0.085), (RX1, BY - RD, TOPZ - 0.085), 0.003)
rod("rmid", (RX0, BY - RD, TOPZ - 0.035), (RX1, BY - RD, TOPZ - 0.035))
for x in (RX0, RX1):
    rod(f"hook{x}", (x, BY - RD, TOPZ + 0.01), (x, BY + 0.012, TOPZ + 0.012), 0.003)
    rod(f"hookd{x}", (x, BY + 0.012, TOPZ + 0.012), (x, BY + 0.012, TOPZ - 0.02), 0.003)
for i in range(110):
    x = random.uniform(RX0 + 0.01, RX1 - 0.01); y = BY - random.uniform(0.01, RD - 0.008)
    cyl(f"hay{i}", 0.0013, random.uniform(0.06, 0.1), (x, y, TOPZ - 0.04 + random.uniform(0, 0.025)), M["hay"] if i % 2 else M["hay2"],
        rot=(random.uniform(-0.6, 0.6), random.uniform(-0.7, 0.7), 0), verts=6)

# ---------------------------------------------------------------- the camera, built into the back right corner, looking down
CX, CY, CZ = TW / 2 * 1.09 - 0.05, BY - 0.02, TOPZ + 0.045
box("camneck", (0.03, 0.022, 0.05), (CX, CY + 0.012, TOPZ + 0.018), M["white"], bevel=0.009)
pod = box("campod", (0.09, 0.06, 0.044), (CX, CY, CZ), M["white"], bevel=0.018)
pod.rotation_euler = (math.radians(-28), 0, math.radians(18))
face = Vector((0, -0.016, -0.016))
cam_r = pod.rotation_euler
def onpod(off): v = Vector(off); v.rotate(cam_r); return Vector((CX, CY, CZ)) + v
for name, r, d, m, off in [("camring", 0.013, 0.004, M["lensring"], (0, -0.006, -0.0185)), ("lens", 0.009, 0.004, M["lens"], (0, -0.006, -0.0195)),
                           ("camled", 0.0022, 0.003, M["led"], (0.024, -0.006, -0.0185))]:
    o = cyl(name, r, d, onpod(off), m); o.rotation_euler = cam_r

# ---------------------------------------------------------------- Xiaosi: his own sticker, standing on the grid, turned to the camera
STICK = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else None
CAM_LOC = Vector((0.86, -1.12, 0.62))
if STICK:
    img = bpy.data.images.load(STICK); iw, ih = img.size; SW = 0.15; SH = SW * ih / iw
    sx_, sy_ = 0.06, -0.03
    bpy.ops.mesh.primitive_plane_add(size=1, location=(sx_, sy_, GZ + 0.004 + SH / 2))
    st = bpy.context.object; st.scale = (SW, SH, 1)
    d = CAM_LOC - Vector((sx_, sy_, 0)); st.rotation_euler = (math.radians(90), 0, math.atan2(d.x, -d.y))
    sm = bpy.data.materials.new("sticker"); sm.use_nodes = True; nt = sm.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; b = nt.nodes["Principled BSDF"]
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"]); nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 0.25
    b.inputs["Roughness"].default_value = 0.6
    st.data.materials.append(sm)

# ---------------------------------------------------------------- where the labels point (written next to the render)
ANCHORS = {"camera": onpod((0, -0.006, -0.02)), "hay": Vector(((RX0 + RX1) / 2 - 0.03, BY - RD, TOPZ + 0.02)),
           "grid": Vector((0.15, -0.09, GZ + 0.004)), "scale": Vector((0.0, FY - 0.02, FZ)), "droppings": Vector((-0.12, -0.05, GZ + 0.01)),
           "vents": Vector((PW / 2, 0.0, Z0 * 0.55)), "him": Vector((0.06, -0.03, GZ + 0.12))}

# ---------------------------------------------------------------- studio: a soft backdrop, three lights, a camera
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0)); bpy.context.object.data.materials.append(M["floor"])
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 1.4, 1.5), rotation=(math.radians(90), 0, 0)); bpy.context.object.data.materials.append(M["floor"])
w = bpy.data.worlds.new("w"); scene.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (*srgb("#F3EEFA"), 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.22
def light(name, loc, energy, size, rgb=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA"); d.energy = energy; d.size = size; d.color = rgb
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.12)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
light("key", (-0.9, -0.9, 1.2), 34, 1.4)
light("fill", (1.1, -0.6, 0.6), 10, 1.2, (0.95, 0.93, 1.0))
light("rim", (0.3, 1.2, 1.0), 22, 1.0)
cd = bpy.data.cameras.new("cam"); cd.lens = 64
co = bpy.data.objects.new("camera", cd); scene.collection.objects.link(co); scene.camera = co
co.location = CAM_LOC
co.rotation_euler = (Vector((0.0, 0.03, 0.19)) - co.location).to_track_quat("-Z", "Y").to_euler()
cd.dof.use_dof = True; cd.dof.focus_distance = (Vector((0, 0, 0.15)) - co.location).length; cd.dof.aperture_fstop = 5.6

scene.render.engine = "CYCLES"
scene.cycles.samples = 128; scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    scene.cycles.device = "GPU"
except Exception as e:
    print("GPU not available:", e)
scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
import json
from bpy_extras.object_utils import world_to_camera_view
json.dump({k: [round(c, 4) for c in world_to_camera_view(scene, co, v)[:2]] for k, v in ANCHORS.items()}, open(out.rsplit(".", 1)[0] + ".json", "w"))
print("rendered", out)
