using UnityEngine;

namespace FurSight
{
    // The Bean: FurSight's little character, the same one as on the web app and the glasses, here in 3D.
    // A glossy jellybean head with short Netherland Dwarf ears, built from spheres and capsules so it needs
    // no model. It idles on its own (float, ear sway and flicks, blinks, glances, a sniff) and reacts to a
    // mood: safe hops with ears up, caution tilts with one ear folded, toxic shakes with its ears down,
    // thinking looks up. Built facing -Z (towards the wearer, like the cards); "size" is the head's width.
    public class Bean : MonoBehaviour
    {
        static readonly Color Body = Theme.Hex("#F1EDFA"), Face = Theme.Hex("#FFFFFF"), EarIn = Theme.Hex("#B596F5"),
            Eye = Theme.Hex("#18171D"), Nose = Theme.Hex("#C9A3E8");
        static Material _lit;

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

        void Build()
        {
            _t0 = Random.value * 10f;
            _blinkAt = Time.time + Random.Range(1f, 4f);
            _flickAt = Time.time + Random.Range(2f, 5f);
            _tilt = Node("Tilt", transform, Vector3.zero);
            _bob = Node("Bob", _tilt, Vector3.zero);

            Part(PrimitiveType.Sphere, "Head", _bob, new Vector3(0f, 0.4f, 0f), new Vector3(1f, 0.8f, 0.82f), Body, 0.85f);
            Part(PrimitiveType.Sphere, "Face", _bob, new Vector3(0f, 0.37f, -0.27f), new Vector3(0.7f, 0.54f, 0.3f), Face, 0.6f);
            _earL = Ear("Ear L", -1f);
            _earR = Ear("Ear R", 1f);

            _look = Node("Look", _bob, Vector3.zero);
            _eyes = Node("Eyes", _look, new Vector3(0f, 0.41f, -0.415f));
            foreach (var s in new[] { -1f, 1f })
            {
                Part(PrimitiveType.Sphere, "Eye", _eyes, new Vector3(0.11f * s, 0f, 0f), new Vector3(0.075f, 0.105f, 0.04f), Eye, 0.95f);
                Part(PrimitiveType.Sphere, "Glint", _eyes, new Vector3(0.11f * s - 0.015f, 0.025f, -0.02f), Vector3.one * 0.024f, Color.white, 0.3f);
            }
            Part(PrimitiveType.Sphere, "Nose", _look, new Vector3(0f, 0.315f, -0.425f), new Vector3(0.045f, 0.028f, 0.03f), Nose, 0.6f);
        }

        Transform Ear(string name, float side)
        {
            var pivot = Node(name, _bob, new Vector3(0.25f * side, 0.7f, 0.02f));
            Part(PrimitiveType.Capsule, "Ear", pivot, new Vector3(0f, 0.2f, 0f), new Vector3(0.19f, 0.22f, 0.15f), Body, 0.85f);
            Part(PrimitiveType.Capsule, "Inside", pivot, new Vector3(0f, 0.21f, -0.06f), new Vector3(0.1f, 0.16f, 0.05f), EarIn, 0.5f);
            return pivot;
        }

        static Transform Node(string name, Transform parent, Vector3 pos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = pos;
            return t;
        }

        static void Part(PrimitiveType type, string name, Transform parent, Vector3 pos, Vector3 scale, Color color, float gloss)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            Destroy(go.GetComponent<Collider>());   // looks only: keep it out of the card rays
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            var r = go.GetComponent<MeshRenderer>();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            _lit ??= Resources.Load<Material>("Bean/BeanLit");
            var m = new Material(_lit);
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", gloss);
            r.sharedMaterial = m;
        }

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
