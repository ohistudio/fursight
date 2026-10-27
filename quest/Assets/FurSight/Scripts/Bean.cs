using UnityEngine;

namespace FurSight
{
    // The Bean: FurSight's little character, the same one as on the web app and the glasses, here in 3D.
    // A glossy jellybean head with short Netherland Dwarf ears, built from smooth generated shapes and lit by
    // its own Jelly shader (so it looks the same in any room), no model needed. It idles on its own (float, ear sway and flicks, blinks, glances, a sniff) and reacts to a
    // mood: safe hops with ears up, caution tilts with one ear folded, toxic shakes with its ears down,
    // thinking looks up. Built facing -Z (towards the wearer, like the cards); "size" is the head's width.
    public class Bean : MonoBehaviour
    {
        // each part's look for the Jelly shader: lit colour, shadow colour, rim colour, gloss, highlight, rim
        static readonly (string lit, string shade, string rim, float gloss, float spec, float rimK)
            Body = ("#F8F5FE", "#B3A2E2", "#EEE5FF", 48f, 0.7f, 0.55f),
            Face = ("#FFFFFF", "#D8CEF1", "#F6F1FF", 40f, 0.45f, 0.3f),
            EarIn = ("#BC9EF8", "#7C52D4", "#D9C8FF", 32f, 0.4f, 0.4f),
            Eye = ("#34313E", "#0B0A0F", "#55506A", 170f, 1.25f, 0.35f),
            Nose = ("#DDB9F3", "#A27CD8", "#F1E4FF", 40f, 0.5f, 0.3f);
        static Material _jelly;
        static readonly System.Collections.Generic.Dictionary<string, Material> _mats = new();
        static readonly System.Collections.Generic.Dictionary<Vector2, Mesh> _meshes = new();

        Transform _tilt, _bob, _earL, _earR, _look, _eyes;
        string _mood = "idle";
        float _t0, _moodAt, _blinkAt, _flickAt, _flickSide, _flickT = 1f;

        public static Bean Make(Transform parent, Vector3 localPos, float size, string mood = "idle")
        {
            var b = new GameObject("Bean").AddComponent<Bean>();
            b.transform.SetParent(parent, false);
            b.transform.localPosition = localPos;
            b.transform.localScale = Vector3.one * size;
            b.Build();
            b.SetMood(mood);
            return b;
        }

        // sizes below are radii, in head widths; the exponents make each part chunkier (<1) or rounder (1)
        void Build()
        {
            _t0 = Random.value * 10f;
            _blinkAt = Time.time + Random.Range(1f, 4f);
            _flickAt = Time.time + Random.Range(2f, 5f);
            _tilt = Node("Tilt", transform, Vector3.zero);
            _bob = Node("Bob", _tilt, Vector3.zero);

            Part("Head", _bob, new Vector3(0f, 0.4f, 0f), new Vector3(0.5f, 0.4f, 0.41f), 0.8f, 0.9f, Body);
            Part("Face", _bob, new Vector3(0f, 0.37f, -0.275f), new Vector3(0.35f, 0.27f, 0.15f), 0.75f, 0.75f, Face);
            _earL = Ear("Ear L", -1f);
            _earR = Ear("Ear R", 1f);

            _look = Node("Look", _bob, Vector3.zero);
            _eyes = Node("Eyes", _look, new Vector3(0f, 0.41f, -0.415f));
            foreach (var s in new[] { -1f, 1f })
                Part("Eye", _eyes, new Vector3(0.11f * s, 0f, 0f), new Vector3(0.038f, 0.053f, 0.022f), 1f, 1f, Eye);
            Part("Nose", _look, new Vector3(0f, 0.315f, -0.425f), new Vector3(0.024f, 0.015f, 0.016f), 0.9f, 1f, Nose);
        }

        Transform Ear(string name, float side)
        {
            var pivot = Node(name, _bob, new Vector3(0.25f * side, 0.7f, 0.02f));
            Part("Ear", pivot, new Vector3(0f, 0.2f, 0f), new Vector3(0.095f, 0.22f, 0.075f), 0.85f, 1f, Body);
            Part("Inside", pivot, new Vector3(0f, 0.21f, -0.06f), new Vector3(0.05f, 0.16f, 0.025f), 0.85f, 1f, EarIn);
            return pivot;
        }

        static Transform Node(string name, Transform parent, Vector3 pos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = pos;
            return t;
        }

        static void Part(string name, Transform parent, Vector3 pos, Vector3 radii, float e1, float e2,
            (string lit, string shade, string rim, float gloss, float spec, float rimK) look)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = radii;
            go.AddComponent<MeshFilter>().sharedMesh = Blob(e1, e2);
            var r = go.AddComponent<MeshRenderer>();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.sharedMaterial = Mat(look);
        }

        static Material Mat((string lit, string shade, string rim, float gloss, float spec, float rimK) l)
        {
            if (_mats.TryGetValue(l.lit, out var m) && m != null) return m;
            _jelly ??= Resources.Load<Material>("Bean/Jelly");
            m = new Material(_jelly) { name = "Jelly " + l.lit };
            m.SetColor("_BaseColor", Theme.Hex(l.lit));
            m.SetColor("_ShadeColor", Theme.Hex(l.shade));
            m.SetColor("_RimColor", Theme.Hex(l.rim));
            m.SetFloat("_Gloss", l.gloss);
            m.SetFloat("_Spec", l.spec);
            m.SetFloat("_Rim", l.rimK);
            return _mats[l.lit] = m;
        }

        // a unit superellipsoid with exact smooth normals: e = 1 is a sphere, lower is boxier (a jellybean)
        static Mesh Blob(float e1, float e2)
        {
            var key = new Vector2(e1, e2);
            if (_meshes.TryGetValue(key, out var mesh) && mesh != null) return mesh;
            const int seg = 48, rings = 32;
            var verts = new Vector3[(seg + 1) * (rings + 1)];
            var norms = new Vector3[verts.Length];
            for (int j = 0; j <= rings; j++)
            {
                float v = Mathf.Lerp(-Mathf.PI / 2f, Mathf.PI / 2f, j / (float)rings);
                for (int i = 0; i <= seg; i++)
                {
                    float u = Mathf.Lerp(-Mathf.PI, Mathf.PI, i / (float)seg);
                    int k = j * (seg + 1) + i;
                    verts[k] = new Vector3(C(v, e1) * C(u, e2), S(v, e1), C(v, e1) * S(u, e2));
                    norms[k] = new Vector3(C(v, 2f - e1) * C(u, 2f - e2), S(v, 2f - e1), C(v, 2f - e1) * S(u, 2f - e2)).normalized;
                }
            }
            var tris = new int[seg * rings * 6];
            for (int j = 0, t = 0; j < rings; j++)
                for (int i = 0; i < seg; i++)
                {
                    int a = j * (seg + 1) + i, b = a + seg + 1;
                    tris[t++] = a; tris[t++] = b; tris[t++] = a + 1;
                    tris[t++] = a + 1; tris[t++] = b; tris[t++] = b + 1;
                }
            mesh = new Mesh { name = $"Blob {e1} {e2}", vertices = verts, normals = norms, triangles = tris };
            mesh.RecalculateBounds();
            return _meshes[key] = mesh;
        }
        static float C(float w, float m) { float c = Mathf.Cos(w); return Mathf.Sign(c) * Mathf.Pow(Mathf.Abs(c), m); }
        static float S(float w, float m) { float s = Mathf.Sin(w); return Mathf.Sign(s) * Mathf.Pow(Mathf.Abs(s), m); }

        // ---------------------------------------------------------------- moods

        public void SetMood(string mood)
        {
            _mood = mood == "vet" ? "toxic" : string.IsNullOrEmpty(mood) ? "idle" : mood;
            _moodAt = Time.time;
        }

        void Update()
        {
            float t = Time.time + _t0, since = Time.time - _moodAt, dt = Time.deltaTime;
            bool safe = _mood == "safe", caution = _mood == "caution", toxic = _mood == "toxic", thinking = _mood == "thinking";

            // float: a slow bob with a little squash; a hop when it's safe
            float period = thinking ? 2f : toxic ? 4.5f : 3.2f;
            float wave = Mathf.Sin(t * Mathf.PI * 2f / period);
            float y = (wave * 0.5f + 0.5f) * 0.06f, sx = 1f - wave * 0.012f, sy = 1f + wave * 0.012f;
            if (safe && since < 0.75f)
            {
                float p = since / 0.75f;
                y += 4f * 0.55f * p * (1f - p);
                float squash = p < 0.12f || p > 0.85f ? 0.09f : -0.05f;
                sx += squash; sy -= squash;
            }
            _bob.localPosition = new Vector3(0f, y, 0f);
            _bob.localScale = new Vector3(sx, sy, sx);

            // tilt: caution leans, toxic shakes "no" once
            float tilt = caution ? 8f : 0f;
            if (toxic && since < 0.5f) tilt = Mathf.Sin(since * 30f) * 7f * (1f - since / 0.5f);
            _tilt.localRotation = Quaternion.Slerp(_tilt.localRotation, Quaternion.Euler(0f, 0f, tilt), 1f - Mathf.Exp(-dt * 12f));

            // ears: sway and the odd flick when idle, up for safe, one folded for caution, down for toxic
            float swayL = 12f + Mathf.Sin(t * 1.19f) * 4f, swayR = -10f + Mathf.Sin(t * 1.03f + 1f) * 4f;
            if (Time.time > _flickAt) { _flickSide = Random.value < 0.5f ? -1f : 1f; _flickAt = Time.time + Random.Range(3f, 6f); _flickT = 0f; }
            _flickT += dt;
            float flick = _flickT < 0.25f ? Mathf.Sin(_flickT / 0.25f * Mathf.PI) * 11f : 0f;
            float l = safe ? 4f : toxic ? 62f : swayL + (_flickSide < 0f ? flick : 0f);
            float r = safe ? -4f : toxic ? -62f : caution ? -38f : swayR - (_flickSide > 0f ? flick : 0f);
            float k = 1f - Mathf.Exp(-dt * (safe || toxic || caution ? 14f : 30f));
            _earL.localRotation = Quaternion.Slerp(_earL.localRotation, Quaternion.Euler(0f, 0f, l), k);
            _earR.localRotation = Quaternion.Slerp(_earR.localRotation, Quaternion.Euler(0f, 0f, r), k);

            // eyes: blink, glance about (look up when thinking), a happy squint for safe, lower for toxic
            float blink = 1f;
            if (Time.time > _blinkAt) { float b = (Time.time - _blinkAt) / 0.14f; blink = b < 1f ? 1f - Mathf.Sin(b * Mathf.PI) * 0.9f : 1f; if (b >= 1f) _blinkAt = Time.time + Random.Range(3f, 6f); }
            float squint = safe ? 0.6f : toxic ? 0.85f : 1f;
            _eyes.localScale = new Vector3(1f, blink * squint, 1f);
            Vector3 look = thinking ? new Vector3(Mathf.Sin(t * 2.6f) * 0.05f, 0.045f, 0f)
                : toxic ? new Vector3(0f, -0.03f, 0f)
                : new Vector3((Mathf.PerlinNoise(t * 0.25f, 0.3f) - 0.5f) * 0.14f, (Mathf.PerlinNoise(0.7f, t * 0.25f) - 0.5f) * 0.04f, 0f);
            _look.localPosition = Vector3.Lerp(_look.localPosition, look, 1f - Mathf.Exp(-dt * 6f));
        }
    }
}
