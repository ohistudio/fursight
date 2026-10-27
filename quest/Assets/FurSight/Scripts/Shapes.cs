using System.Collections.Generic;
using UnityEngine;

namespace FurSight
{
    // Flat shapes built as meshes, so cards stay crisp at any distance without textures:
    // rounded rectangles (cards, pills, icon strokes) and circles (badges, dots).
    public static class Shapes
    {
        static readonly Dictionary<Color, Material> _mats = new Dictionary<Color, Material>();
        static readonly Dictionary<string, Mesh> _meshes = new Dictionary<string, Mesh>();

        public static Material Flat(Color c)
        {
            if (_mats.TryGetValue(c, out var m) && m != null) return m;
            m = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { name = "Flat " + ColorUtility.ToHtmlStringRGB(c) };
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Cull", 0f);   // two-sided: slab walls and caps show whichever way they're wound
            return _mats[c] = m;
        }

        // centred on the origin in the XY plane, facing -Z (towards a camera looking down +Z)
        public static Mesh RoundedRect(float w, float h, float r, int seg = 8)
        {
            string key = $"rr{w:F3}x{h:F3}r{r:F3}";
            if (_meshes.TryGetValue(key, out var cached)) return cached;
            r = Mathf.Min(r, w / 2f, h / 2f);
            var verts = new List<Vector3> { Vector3.zero };
            var corners = new[] { new Vector2(w / 2 - r, h / 2 - r), new Vector2(-w / 2 + r, h / 2 - r), new Vector2(-w / 2 + r, -h / 2 + r), new Vector2(w / 2 - r, -h / 2 + r) };
            for (int c = 0; c < 4; c++)
                for (int i = 0; i <= seg; i++)
                {
                    float a = (c * 90f + 90f * i / seg) * Mathf.Deg2Rad;
                    verts.Add(new Vector3(corners[c].x + Mathf.Cos(a) * r, corners[c].y + Mathf.Sin(a) * r, 0f));
                }
            return _meshes[key] = Fan(verts);
        }

        public static Mesh Circle(float r, int seg = 40)
        {
            string key = $"c{r:F3}";
            if (_meshes.TryGetValue(key, out var cached)) return cached;
            var verts = new List<Vector3> { Vector3.zero };
            for (int i = 0; i < seg; i++) { float a = 2f * Mathf.PI * i / seg; verts.Add(new Vector3(Mathf.Cos(a) * r, Mathf.Sin(a) * r, 0f)); }
            return _meshes[key] = Fan(verts);
        }

        // ring arc from a0 to a1 degrees (for the "checking" spinner)
        public static Mesh Arc(float r, float thickness, float a0, float a1, int seg = 32)
        {
            var verts = new List<Vector3>(); var tris = new List<int>();
            for (int i = 0; i <= seg; i++)
            {
                float a = Mathf.Lerp(a0, a1, (float)i / seg) * Mathf.Deg2Rad;
                var d = new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0f);
                verts.Add(d * (r - thickness / 2)); verts.Add(d * (r + thickness / 2));
                if (i > 0) { int k = i * 2; tris.AddRange(new[] { k - 2, k, k - 1, k - 1, k, k + 1 }); }
            }
            var m = new Mesh { vertices = verts.ToArray(), triangles = tris.ToArray() };
            m.RecalculateBounds();
            return m;
        }

        // ---- 3D: outlines extruded into slabs (front cap one colour, walls another), for cards that pop out

        public static List<Vector2> RoundedRectRing(float w, float h, float r, int seg = 8)
        {
            r = Mathf.Min(r, w / 2f, h / 2f);
            var ring = new List<Vector2>();
            var corners = new[] { new Vector2(w / 2 - r, h / 2 - r), new Vector2(-w / 2 + r, h / 2 - r), new Vector2(-w / 2 + r, -h / 2 + r), new Vector2(w / 2 - r, -h / 2 + r) };
            for (int c = 0; c < 4; c++)
                for (int i = 0; i <= seg; i++)
                {
                    float a = (c * 90f + 90f * i / seg) * Mathf.Deg2Rad;
                    ring.Add(new Vector2(corners[c].x + Mathf.Cos(a) * r, corners[c].y + Mathf.Sin(a) * r));
                }
            return ring;
        }

        public static List<Vector2> CircleRing(float r, int seg = 40)
        {
            var ring = new List<Vector2>();
            for (int i = 0; i < seg; i++) { float a = 2f * Mathf.PI * i / seg; ring.Add(new Vector2(Mathf.Cos(a) * r, Mathf.Sin(a) * r)); }
            return ring;
        }

        // front cap at z = -depth (towards the viewer), back at z = 0; submesh 0 = cap, 1 = walls + back
        public static Mesh Slab(List<Vector2> ring, float depth)
        {
            int n = ring.Count;
            var v = new List<Vector3>();
            var cap = new List<int>(); var walls = new List<int>();
            v.Add(new Vector3(0f, 0f, -depth));
            for (int i = 0; i < n; i++) v.Add(new Vector3(ring[i].x, ring[i].y, -depth));
            for (int i = 1; i <= n; i++) { cap.Add(0); cap.Add(i % n + 1); cap.Add(i); }
            int b = v.Count;
            v.Add(Vector3.zero);
            for (int i = 0; i < n; i++) v.Add(new Vector3(ring[i].x, ring[i].y, 0f));
            for (int i = 1; i <= n; i++) { walls.Add(b); walls.Add(b + i); walls.Add(b + i % n + 1); }
            for (int i = 0; i < n; i++)
            {
                int f0 = 1 + i, f1 = 1 + (i + 1) % n, k0 = b + 1 + i, k1 = b + 1 + (i + 1) % n;
                walls.AddRange(new[] { f0, f1, k0, k0, f1, k1 });
            }
            var m = new Mesh { subMeshCount = 2 };
            m.SetVertices(v);
            m.SetTriangles(cap, 0);
            m.SetTriangles(walls, 1);
            m.RecalculateBounds();
            return m;
        }

        public static GameObject MakeSlab(string name, Transform parent, List<Vector2> ring, float depth, Color front, Color sides, Vector3 localPos, float rotZ = 0f)
        {
            var go = Make(name, parent, Slab(ring, depth), front, localPos, rotZ);
            go.GetComponent<MeshRenderer>().sharedMaterials = new[] { Flat(front), Flat(sides) };
            return go;
        }

        static Mesh Fan(List<Vector3> verts)
        {
            var tris = new List<int>();
            int n = verts.Count - 1;
            for (int i = 1; i <= n; i++) { tris.Add(0); tris.Add(i % n + 1); tris.Add(i); }
            var m = new Mesh { vertices = verts.ToArray(), triangles = tris.ToArray() };
            m.RecalculateBounds();
            return m;
        }

        public static GameObject Make(string name, Transform parent, Mesh mesh, Color color, Vector3 localPos, float rotZ = 0f)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.Euler(0f, 0f, rotZ);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = Flat(color);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go;
        }
    }
}
