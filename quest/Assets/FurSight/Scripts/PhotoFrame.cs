using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace FurSight
{
    // Take a photo like framing with your fingers: pinch with both hands and a viewfinder appears between
    // your pinches (corner brackets, a dotted edge, a bead on each pinch). Move your hands to size and aim it,
    // let go to take it: a shutter flash, and just what's inside the frame goes to the diary with a note.
    // Only after pressing Photo on the hand menu (for 20 s, or until a photo is taken): a two-hand pinch is easy
    // to make by accident. Without tracked hands (controllers, or the editor) Photo takes the whole view instead. Adapted from Roll's TextureGrab.
    public class PhotoFrame : MonoBehaviour
    {
        static PhotoFrame _instance;
        const float Inset = 0.025f, DotGap = 0.012f;

        readonly bool[] _pinch = new bool[2];
        readonly Vector3[] _last = new Vector3[2];
        readonly Vector3[] _corners = new Vector3[4];
        float _bothFor, _apartFor, _lostFor, _startedAt, _armedUntil;
        const float ArmedFor = 20f;
        bool _framing;
        Transform _root;
        readonly Transform[] _arms = new Transform[8];
        readonly Transform[] _beads = new Transform[2];
        readonly List<Transform> _dots = new List<Transform>();
        VerdictCard _hint;

        void Awake() => _instance = this;

        // the menu's Photo button
        public static void Begin()
        {
            var me = _instance;
            bool hands = Hands.Get(Hands.Left).tracked && Hands.Get(Hands.Right).tracked;
            if (me == null || !hands) { FurSightActions.Instance?.TakePhoto(); return; }
            var head = Camera.main.transform;
            if (me._hint != null) me._hint.Dismiss();
            me._armedUntil = Time.time + ArmedFor;
            me._hint = VerdictCard.Verdict(head.position + head.forward * 0.5f + Vector3.up * 0.05f, "Frame a photo", "none",
                "Pinch with both hands, pull them apart to frame it, then let go.", null);
        }

        void Update()
        {
            var act = FurSightActions.Instance;
            if (act == null || act.Busy) { End(); return; }
            float dt = Time.deltaTime;
            bool tracked = true;
            for (int i = 0; i < 2; i++)
            {
                var h = Hands.Get(i);
                if (!h.tracked) { tracked = false; continue; }
                // gentle: starts at a firm squeeze, holds until the fingers clearly open (tracking flickers)
                _pinch[i] = _pinch[i] ? h.pinchStrength > 0.25f || h.pinching : h.pinchStrength > 0.6f || h.pinching;
                if (_pinch[i]) _last[i] = h.pinchPoint;
            }
            bool both = _pinch[0] && _pinch[1];
            if (!_framing)
            {
                if (Time.time > _armedUntil) { _bothFor = 0f; if (_hint != null) { _hint.Dismiss(); _hint = null; } return; }
                _bothFor = both && tracked && Vector3.Distance(_last[0], _last[1]) > 0.1f ? _bothFor + dt : 0f;
                if (_bothFor > 0.2f) { _framing = true; _startedAt = Time.time; _apartFor = _lostFor = 0f; Sfx.Tick((_last[0] + _last[1]) / 2f); if (_hint != null) _hint.Dismiss(); }
                return;
            }
            _lostFor = tracked ? 0f : _lostFor + dt;
            if (_lostFor > 1.2f) { End(); return; }
            _apartFor = both || !tracked ? 0f : _apartFor + dt;
            if (_apartFor < 0.12f) Draw(_last[0], _last[1]);
            else Take();
        }

        // an upright rectangle facing you, your two pinches at opposite corners
        void Draw(Vector3 p, Vector3 q)
        {
            var head = Camera.main.transform;
            Vector3 right = head.right, up = head.up, mid = (p + q) / 2f;
            float hw = Mathf.Max(Mathf.Abs(Vector3.Dot(q - p, right)) / 2f - Inset, 0.02f);
            float hh = Mathf.Max(Mathf.Abs(Vector3.Dot(q - p, up)) / 2f - Inset, 0.02f);
            float t = Mathf.Clamp01((Time.time - _startedAt) / 0.22f);
            float grow = t >= 1f ? 1f + Mathf.Sin(Time.time * 5f) * 0.006f : Juice.OutBack(t);
            hw *= grow; hh *= grow;
            _corners[0] = mid - right * hw - up * hh; _corners[1] = mid + right * hw - up * hh;
            _corners[2] = mid + right * hw + up * hh; _corners[3] = mid - right * hw + up * hh;

            if (_root == null) Build();
            _root.rotation = Quaternion.LookRotation(head.forward, up);
            float arm = Mathf.Min(0.035f, Mathf.Min(hw, hh) * 0.6f);
            for (int i = 0; i < 4; i++)
            {
                Vector3 c = _corners[i], toNext = (_corners[(i + 1) % 4] - c).normalized, toPrev = (_corners[(i + 3) % 4] - c).normalized;
                Bar(_arms[i * 2], c, c + toNext * arm);
                Bar(_arms[i * 2 + 1], c, c + toPrev * arm);
            }
            int used = 0;
            for (int i = 0; i < 4; i++)
            {
                Vector3 a = _corners[i], b = _corners[(i + 1) % 4];
                float len = Vector3.Distance(a, b), free = len - arm * 2f - DotGap;
                int n = Mathf.Max(0, Mathf.FloorToInt(free / DotGap) + 1);
                Vector3 dir = (b - a) / Mathf.Max(len, 1e-5f);
                float start = (len - (n - 1) * DotGap) / 2f;
                for (int k = 0; k < n; k++)
                {
                    if (used == _dots.Count) _dots.Add(Shapes.Make("Dot", _root, Shapes.Circle(0.0026f, 12), Color.white, Vector3.zero).transform);
                    var d = _dots[used++];
                    d.gameObject.SetActive(true);
                    d.position = a + dir * (start + k * DotGap);
                    d.rotation = _root.rotation;
                }
            }
            for (int k = used; k < _dots.Count; k++) _dots[k].gameObject.SetActive(false);
            float pulse = 1f + Mathf.Sin(Time.time * 9f) * 0.15f;
            _beads[0].position = p; _beads[1].position = q;
            _beads[0].localScale = _beads[1].localScale = Vector3.one * pulse;
            _beads[0].rotation = _beads[1].rotation = _root.rotation;
        }

        void Build()
        {
            _root = new GameObject("Photo Frame").transform;
            for (int i = 0; i < 8; i++) _arms[i] = Shapes.MakeSlab("Bracket", _root, Shapes.RoundedRectRing(1f, 1f, 0.5f), 0.004f, Theme.Sky, Theme.SkyLip, Vector3.zero).transform;
            for (int i = 0; i < 2; i++) _beads[i] = Shapes.MakeSlab("Bead", _root, Shapes.CircleRing(0.007f), 0.004f, Theme.Sky, Theme.SkyLip, Vector3.zero).transform;
        }

        // a thick rounded bar from a to b, in the frame's plane
        void Bar(Transform t, Vector3 a, Vector3 b)
        {
            Vector3 d = b - a;
            float len = Mathf.Max(d.magnitude, 0.001f) + 0.006f;
            t.position = (a + b) / 2f;
            var r = _root.rotation;
            var inPlane = Quaternion.Inverse(r) * d;
            t.rotation = r * Quaternion.Euler(0f, 0f, Mathf.Atan2(inPlane.y, inPlane.x) * Mathf.Rad2Deg);
            t.localScale = new Vector3(len, 0.006f, 1f);
        }

        void Take()
        {
            var cam = PetCamera.Instance;
            Vector3 centre = (_corners[0] + _corners[2]) / 2f;
            Rect? crop = null;
            if (cam != null)
            {
                // the frame's corners as seen by the camera: that's the part of the picture to keep
                Vector2 min = new Vector2(1f, 1f), max = Vector2.zero;
                foreach (var c in _corners) { var v = cam.ViewportOf(c); min = Vector2.Min(min, v); max = Vector2.Max(max, v); }
                min = Vector2.Max(min, Vector2.zero); max = Vector2.Min(max, Vector2.one);
                if (max.x - min.x > 0.03f && max.y - min.y > 0.03f) crop = Rect.MinMaxRect(min.x, min.y, max.x, max.y);
            }
            StartCoroutine(Flash(_corners[0], _corners[2]));
            End();
            FurSightActions.Instance?.TakePhoto(crop, centre);
        }

        // the shutter: a white panel filling the frame, gone in a blink
        IEnumerator Flash(Vector3 a, Vector3 b)
        {
            var head = Camera.main.transform;
            var go = Shapes.Make("Flash", null, Shapes.RoundedRect(1f, 1f, 0.02f), Color.white, Vector3.zero);
            go.transform.position = (a + b) / 2f;
            go.transform.rotation = Quaternion.LookRotation(head.forward, head.up);
            Vector3 d = Quaternion.Inverse(go.transform.rotation) * (b - a);
            go.transform.localScale = new Vector3(Mathf.Abs(d.x), Mathf.Abs(d.y), 1f);
            StartCoroutine(Juice.Buzz(0.4f, 0.05f));
            for (float e = 0f; e < 0.18f; e += Time.deltaTime) { go.transform.localScale *= 0.97f; yield return null; }
            Destroy(go);
        }

        void End()
        {
            _framing = false; _bothFor = 0f; _armedUntil = 0f;
            if (_root != null) { Destroy(_root.gameObject); _root = null; _dots.Clear(); }
        }
    }
}
