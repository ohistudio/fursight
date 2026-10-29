"""A concept render of the FurSight Tray, for the kit page and the README (not a photo of a real product).

    /Applications/Blender.app/Contents/MacOS/Blender -b -P docs/kit-src/tray_render.py -- docs/tray-concept.png

Built from scratch in an empty scene: the scale base (display, status light, name, sensor vents), the litter tray
with paper litter and a couple of droppings, a clip-on hay rack, and the camera on its arm looking down. Studio
light, soft shadow, Cycles.
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

# ---------------------------------------------------------------- the scale base
BW, BD, BH = 0.50, 0.38, 0.034
box("base", (BW, BD, BH), (0, 0, BH / 2 + 0.006), M["base"], bevel=0.014)
box("foot", (BW - 0.03, BD - 0.03, 0.008), (0, 0, 0.004), M["foot"], bevel=0.003)
box("accent", (BW - 0.006, 0.006, 0.006), (0, -BD / 2 + 0.0, 0.010), M["accent"], bevel=0.002)
# display and status light on the front, the name beside them
box("screen", (0.10, 0.006, 0.024), (0.15, -BD / 2 - 0.001, BH / 2 + 0.006), M["screen"], bevel=0.003)
text("1.10 kg", 0.0135, (0.15, -BD / 2 - 0.0045, BH / 2 + 0.0055), (math.radians(90), 0, 0), M["digits"])
cyl("led", 0.003, 0.004, (0.088, -BD / 2 - 0.002, BH / 2 + 0.006), M["led"], rot=(math.radians(90), 0, 0))
text("FurSight", 0.018, (-0.16, -BD / 2 - 0.0035, BH / 2 + 0.0055), (math.radians(90), 0, 0), M["accent"], extrude=0.0008)
# sensor vents on the right side (temperature and humidity)
for i in range(6):
    box(f"vent{i}", (0.004, 0.006, 0.016), (BW / 2 + 0.0005, -0.04 + i * 0.014, BH / 2 + 0.006), M["vent"], bevel=0.001)

# ---------------------------------------------------------------- the litter tray (a tub: a box with no top, rounded, thick walls)
TW, TD, TH = 0.44, 0.32, 0.13
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co = Vector((v.co.x * TW, v.co.y * TD, v.co.z * TH))
top = [f for f in bm.faces if f.normal.z > 0.9]
bmesh.ops.delete(bm, geom=top, context="FACES")
me = bpy.data.meshes.new("tub"); bm.to_mesh(me); bm.free()
tub = bpy.data.objects.new("tub", me); scene.collection.objects.link(tub)
tub.location = (0, 0.005, BH + 0.006 + TH / 2)
bev = tub.modifiers.new("bevel", "BEVEL"); bev.width = 0.045; bev.segments = 10; bev.limit_method = "ANGLE"
sol = tub.modifiers.new("solid", "SOLIDIFY"); sol.thickness = 0.006; sol.offset = -1
bev2 = tub.modifiers.new("bevel2", "BEVEL"); bev2.width = 0.002; bev2.segments = 3; bev2.limit_method = "ANGLE"
tub.data.materials.append(M["white"])
for p in tub.data.polygons: p.use_smooth = True
# a rim lip round the top
box("rim", (TW + 0.012, TD + 0.012, 0.008), (0, 0.005, BH + 0.006 + TH - 0.002), M["white"], bevel=0.004).modifiers.new("hole", "BOOLEAN")
rim = bpy.data.objects["rim"]
cut = box("rimcut", (TW - 0.01, TD - 0.01, 0.05), (0, 0.005, BH + 0.006 + TH), M["white"], bevel=0.04)
rim.modifiers["hole"].object = cut; rim.modifiers["hole"].operation = "DIFFERENCE"
cut.hide_render = True; cut.hide_viewport = True

# paper litter: lots of little pellets, and two droppings
LZ = BH + 0.006 + 0.075
pellets = []
for k, m in enumerate([M["litter"], M["litter2"]]):
    me = bpy.data.meshes.new(f"pellet{k}")
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.0045, radius2=0.0045, depth=0.014); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(m); pellets.append(me)
for i in range(900):
    o = bpy.data.objects.new(f"pellet{i}", pellets[0 if i % 3 else 1]); scene.collection.objects.link(o)
    o.location = (random.uniform(-TW / 2 + 0.035, TW / 2 - 0.035), 0.005 + random.uniform(-TD / 2 + 0.035, TD / 2 - 0.035), LZ + random.uniform(-0.004, 0.006))
    o.rotation_euler = (random.uniform(1.2, 1.9), 0, random.uniform(0, math.pi))
for i, (x, y) in enumerate([(-0.06, -0.02), (-0.045, 0.01), (0.02, 0.04)]):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0055, location=(x, y, LZ + 0.008))
    o = bpy.context.object; o.scale = (1, 1, 0.85); o.data.materials.append(M["poo"]); bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- a clip-on hay rack on the back wall
RX, RY, RZ = -0.08, TD / 2 + 0.03, BH + 0.006 + TH + 0.03
box("rackback", (0.20, 0.006, 0.10), (RX, RY + 0.02, RZ), M["rack"], bevel=0.003)
for i in range(9):
    cyl(f"bar{i}", 0.0025, 0.10, (RX - 0.09 + i * 0.0225, RY - 0.03, RZ), M["rack"])
box("rackbottom", (0.20, 0.05, 0.006), (RX, RY - 0.005, RZ - 0.05), M["rack"], bevel=0.002)
for i in range(70):
    x = RX + random.uniform(-0.09, 0.09); y = RY + random.uniform(-0.025, 0.015)
    cyl(f"hay{i}", 0.0012, random.uniform(0.07, 0.13), (x, y, RZ + random.uniform(0.0, 0.04)), M["hay"] if i % 2 else M["hay2"],
        rot=(random.uniform(-0.5, 0.5), random.uniform(-0.6, 0.6), 0), verts=6)

# ---------------------------------------------------------------- the camera on its arm, looking down at the tray
PX, PY = BW / 2 - 0.04, BD / 2 - 0.035
cyl("post", 0.012, 0.29, (PX, PY, BH + 0.006 + 0.145), M["white"])
curve = bpy.data.curves.new("arm", "CURVE"); curve.dimensions = "3D"; curve.bevel_depth = 0.011; curve.bevel_resolution = 6
sp = curve.splines.new("BEZIER"); sp.bezier_points.add(1)
a, b = sp.bezier_points
a.co = (PX, PY, BH + 0.29); a.handle_left = (PX, PY, BH + 0.25); a.handle_right = (PX, PY, BH + 0.36)
b.co = (0.02, 0.02, BH + 0.37); b.handle_left = (0.14, 0.12, BH + 0.40); b.handle_right = (-0.04, -0.02, BH + 0.36)
arm = bpy.data.objects.new("arm", curve); scene.collection.objects.link(arm); arm.data.materials.append(M["white"])
cyl("cam", 0.042, 0.026, (0.02, 0.02, BH + 0.355), M["white"])
cyl("camring", 0.02, 0.004, (0.02, 0.02, BH + 0.3415), M["lensring"])
cyl("lens", 0.015, 0.006, (0.02, 0.02, BH + 0.340), M["lens"])
cyl("camled", 0.0025, 0.004, (0.052, 0.02, BH + 0.342), M["led"])

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
cd = bpy.data.cameras.new("cam"); cd.lens = 50
co = bpy.data.objects.new("camera", cd); scene.collection.objects.link(co); scene.camera = co
co.location = (0.86, -1.12, 0.62)
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
print("rendered", out)
