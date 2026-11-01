using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;

namespace FurSight
{
    // His week, wrapped, in the room: a tall story card in front of you, one slide at a time like the web page
    // (public/wrapped/), with his cut-out stickers popping out in front of it and bobbing. The slides come from the
    // server's /api/wrapped, built from the household diary. Numbers count up; it moves on by itself every few
    // seconds, or swipe a hand across it (right to left for next, left to right for back), or press Back and Next. The last slides are this week's card (drawn here from the card's
    // layout) and the week in numbers; with no card yet, "Make this week's card" has Muse Spark write one and the
    // Quest draws it, saved to the diary so the phone and web show it too.
    public class WeekStory : MonoBehaviour
    {
        const float W = 0.42f, H = 0.56f, R = 0.04f, Thick = 0.012f, Front = -Thick, Dwell = 6.5f;
        static WeekStory _open;
        public static bool IsOpen => _open != null;
        public static void CloseIfOpen() { if (_open != null) _open.Close(); }   // Close all on the hand menu

        JObject _data;
        List<JObject> _slides = new List<JObject>();
        int _at;
        float _shownAt;
        Transform _panel, _content, _flow, _bars;
        MeshRenderer _bg;
        readonly List<(TextMeshPro t, int n, string fmt, float from)> _counters = new List<(TextMeshPro, int, string, float)>();
        readonly List<Transform> _bobbers = new List<Transform>();
        static readonly Dictionary<string, Texture2D> _tex = new Dictionary<string, Texture2D>();
        bool _making;

        public static void Open()
        {
            if (_open != null) { _open.Close(); return; }   // pressing His week again closes it
            var go = new GameObject("His week");
            _open = go.AddComponent<WeekStory>();
            _ = _open.Load();
        }

        async Task Load()
        {
            var head = Camera.main.transform;
            var fwd = Vector3.ProjectOnPlane(head.forward, Vector3.up).normalized;
            // in the editor the test photo hangs 0.6 m away, so come in front of it (smaller, so it looks the same)
            float dist = Application.isEditor ? 0.5f : 0.75f;
            transform.position = head.position + fwd * dist - Vector3.up * 0.05f;
            transform.localScale = Vector3.one * (dist / 0.75f);
            var waiting = VerdictCard.Checking(transform.position, "Gathering his week from the diary", "His week", Theme.Grape);
            try { _data = await FurSightApi.Post("/api/wrapped", new { }, 30); }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] wrapped: " + e.Message);
                if (waiting != null) waiting.Dismiss();
                VerdictCard.Verdict(transform.position, "Couldn't open his week", "none", HubClient.Linked ? "Try again in a moment." : "Link this Quest to your household first.", null);
                Destroy(gameObject);
                return;
            }
            if (waiting != null) waiting.Dismiss();
            if (this == null) return;
            foreach (var s in _data["slides"] as JArray) _slides.Add((JObject)s);
            Build();
            Show(0);
        }

        // ---------------------------------------------------------------- the frame

        void Build()
        {
            _panel = new GameObject("Panel").transform;
            _panel.SetParent(transform, false);
            Shapes.MakeSlab("Lip", _panel, Shapes.RoundedRectRing(W, H, R), Thick, Theme.Hex("#1F1D26"), Theme.Hex("#1F1D26"), new Vector3(0f, -0.01f, 0.004f));
            var bg = Shapes.MakeSlab("Back", _panel, Shapes.RoundedRectRing(W, H, R), Thick, Theme.Grape, Theme.GrapeLip, Vector3.zero);
            _bg = bg.GetComponent<MeshRenderer>();
            _bars = new GameObject("Bars").transform;
            _bars.SetParent(_panel, false);
            _bars.localPosition = new Vector3(0f, H / 2f - 0.022f, Front - 0.001f);
            float bw = (W - 0.06f - 0.004f * (_slides.Count - 1)) / _slides.Count;
            for (int i = 0; i < _slides.Count; i++)
            {
                var b = new GameObject("Bar " + i).transform;
                b.SetParent(_bars, false);
                b.localPosition = new Vector3(-W / 2f + 0.03f + bw / 2f + i * (bw + 0.004f), 0f, 0f);
                Shapes.Make("Track", b, Shapes.RoundedRect(bw, 0.005f, 0.0025f), new Color(1f, 1f, 1f, 1f) * 0.75f, Vector3.zero);
                var fill = new GameObject("FillPivot").transform;
                fill.SetParent(b, false);
                fill.localPosition = new Vector3(-bw / 2f, 0f, -0.0005f);
                Shapes.Make("Fill", fill, Shapes.RoundedRect(bw, 0.005f, 0.0025f), Color.white, new Vector3(bw / 2f, 0f, 0f));
                fill.localScale = new Vector3(0f, 1f, 1f);
            }
            // Back, Next and Close under the card
            Pill("Back", new Vector3(-0.13f, -H / 2f - 0.045f, 0f), Theme.Card, Theme.CardLip, Theme.Ink, () => Show(_at - 1));
            Pill("Next", new Vector3(0f, -H / 2f - 0.045f, 0f), Theme.Fern, Theme.FernLip, Color.white, () => Show(_at + 1));
            Pill("Close", new Vector3(0.13f, -H / 2f - 0.045f, 0f), Theme.Ink, Theme.Hex("#141319"), Color.white, Close);
            StartCoroutine(Juice.Pop(_panel, 0f, 0.35f, 1.6f));
            Sfx.Open(transform.position);
        }

        void Pill(string label, Vector3 at, Color col, Color lip, Color ink, System.Action onPress)
        {
            const float pw = 0.115f, ph = 0.042f;
            var b = new GameObject(label).transform;
            b.SetParent(_panel, false);
            b.localPosition = at;
            Shapes.MakeSlab("Lip", b, Shapes.RoundedRectRing(pw, ph, ph / 2f), Thick, lip, lip, new Vector3(0f, -0.005f, 0.003f));
            Shapes.MakeSlab("Face", b, Shapes.RoundedRectRing(pw, ph, ph / 2f), Thick, col, lip, Vector3.zero);
            var t = Text(b, label, Theme.Black, 15f, ink, pw - 0.02f, TextAlignmentOptions.Center);
            t.transform.localPosition = new Vector3(0f, 0f, Front - 0.0012f);
            CardButton.Add(b.gameObject, 0.035f, onPress);
        }

        // ---------------------------------------------------------------- one slide

        void Show(int i)
        {
            if (_slides.Count == 0 || i < 0) return;
            if (i >= _slides.Count) { if (_at == _slides.Count - 1) return; i = _slides.Count - 1; }
            _at = Mathf.Clamp(i, 0, _slides.Count - 1);
            _shownAt = Time.time;
            _counters.Clear();
            _bobbers.Clear();
            if (_content != null) Destroy(_content.gameObject);
            _content = new GameObject("Slide " + _at).transform;
            _content.SetParent(_panel, false);
            _flow = new GameObject("Flow").transform;   // the words and pictures, centred on the card once laid out
            _flow.SetParent(_content, false);
            var s = _slides[_at];
            var col = Theme.Hex((string)s["colour"] ?? "#9B6CF0");
            _bg.sharedMaterial = Shapes.Flat(col);
            for (int k = 0; k < _bars.childCount; k++)
                _bars.GetChild(k).Find("FillPivot").localScale = new Vector3(k < _at ? 1f : 0f, 1f, 1f);

            float top = H / 2f - 0.05f, y = top, x = -W / 2f + 0.035f, tw = W - 0.07f;
            bool card = s["card"] is JObject;
            if (s["kicker"] != null) y -= Line((string)s["kicker"], Theme.Black, 17f, new Color(1f, 1f, 1f, 0.85f), x, tw, y, 0.12f, true) + 0.014f;
            if (card) { CardSlide(s, y); y -= (W - 0.1f) * 1.25f; }
            else
            {
                if (s["big"] != null && (string)s["kicker"] == "Flop count") { y -= Big(s["big"], x, tw, y, 0.2f) + 0.006f; y -= Line((string)s["title"], Theme.Black, 40f, Color.white, x, tw, y, 0.26f) + 0.018f; }
                else
                {
                    if (s["title"] != null) y -= Line((string)s["title"], Theme.Black, 40f, Color.white, x, tw, y, 0.2f) + 0.016f;
                    if (s["big"] != null) y -= Big(s["big"], x, tw, y, 0.28f) + 0.018f;
                }
                if (s["list"] is JArray list) y -= List(list, x, tw, y) + 0.014f;
                if (s["body"] != null) y -= Line((string)s["body"], Theme.Bold, 24f, Color.white, x, tw, y, 0.34f) + 0.016f;
                if (s["images"] is JArray imgs && imgs.Count > 0) y -= Images(imgs, y) + 0.016f;
                if (s["summary"] is JArray sum) y -= Summary(sum, y) + 0.016f;
                if (s["foot"] != null) y -= Line((string)s["foot"], Theme.Bold, 15f, new Color(1f, 1f, 1f, 0.75f), x, tw, y, 0.46f);
            }
            // centre the block between the progress bars and the bottom (room kept for the card button)
            bool button = _at == _slides.Count - 1 && !(_data["has_card"]?.Value<bool>() ?? false);
            float room = top - (-H / 2f + 0.035f), used = top - y;
            if (used < room) _flow.localPosition = new Vector3(0f, -(room - used) / 2f, 0f);
            // his sticker pops out in front of the card, top right; little ones drift by the bottom corners
            if (s["sticker"] != null && s["sticker"].Type == JTokenType.String) Sticker((string)s["sticker"], new Vector3(W / 2f - 0.07f, H / 2f - 0.13f, -0.07f), 0.15f, -8f, 0.25f);
            if (s["minis"] is JArray minis)
                for (int k = 0; k < minis.Count && k < 3; k++)
                    Sticker((string)minis[k], new Vector3(k == 1 ? W / 2f - 0.02f : -W / 2f + 0.02f + k * 0.05f, -H / 2f + 0.06f + k * 0.03f, -0.035f - k * 0.01f), 0.065f, k % 2 == 1 ? 9f : -12f, 0.45f + k * 0.15f);
            if (button) MakeCardButton();
            StartCoroutine(Juice.Pop(_content, 0f, 0.3f, 1.5f));
            Sfx.Tick(transform.position);
        }

        void Update()
        {
            if (_panel == null) return;
            // face you, upright
            var cam = Camera.main;
            if (cam != null)
            {
                var away = transform.position - cam.transform.position; away.y = 0f;
                if (away.sqrMagnitude > 1e-4f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(away, Vector3.up), 1f - Mathf.Exp(-4f * Time.deltaTime));
            }
            Swipe();
            float e = Time.time - _shownAt;
            // the current bar fills; then on to the next slide (the last one stays)
            if (_at < _bars.childCount) _bars.GetChild(_at).Find("FillPivot").localScale = new Vector3(Mathf.Clamp01(e / Dwell), 1f, 1f);
            if (e > Dwell && _at < _slides.Count - 1 && !_making) Show(_at + 1);
            // numbers count up over a second
            foreach (var (t, n, fmt, from) in _counters)
            {
                if (t == null) continue;
                float k = Mathf.Clamp01((Time.time - from) / 1.1f), v = n * (1f - Mathf.Pow(1f - k, 3f));
                t.text = Format(v, fmt);
            }
            for (int k = 0; k < _bobbers.Count; k++)
            {
                var b = _bobbers[k];
                if (b == null) continue;
                b.localRotation = Quaternion.Euler(0f, Mathf.Sin(Time.time * 0.9f + k) * 10f, b.localEulerAngles.z);
            }
        }

        // swipe a hand across the card like a phone story: right to left for the next slide, left to right to go
        // back. The hand's path is followed in the card's own space: in front of it (within 30 cm) and over it,
        // and it has to travel 22 cm sideways within a third of a second, a deliberate sweep, not reaching for a button.
        readonly Queue<(float t, float x)>[] _path = { new Queue<(float, float)>(), new Queue<(float, float)>() };
        float _swipedAt = -9f;
        void Swipe()
        {
            for (int i = 0; i < 2; i++)
            {
                var hand = Hands.Get(i);
                var path = _path[i];
                if (!hand.tracked) { path.Clear(); continue; }
                var p = _panel.InverseTransformPoint(hand.palm);
                bool over = Mathf.Abs(p.y) < H / 2f && Mathf.Abs(p.x) < W / 2f + 0.12f && p.z < 0f && p.z > -0.2f;
                if (!over) { path.Clear(); continue; }
                path.Enqueue((Time.time, p.x));
                while (path.Count > 0 && Time.time - path.Peek().t > 0.33f) path.Dequeue();
                if (Time.time - _swipedAt < 0.9f || path.Count < 5) continue;
                float dx = p.x - path.Peek().x;
                if (Mathf.Abs(dx) < 0.22f) continue;
                _swipedAt = Time.time;
                path.Clear();
                StartCoroutine(Juice.Buzz(0.15f, 0.03f));
                if (dx < 0f) Show(_at + 1); else Show(_at - 1);
                return;
            }
        }

        static string Format(float v, string fmt) =>
            fmt == "hm" ? Hm(v) : fmt == "kg" ? (v / 1000f).ToString("0.00") + " kg" : Mathf.RoundToInt(v).ToString();

        // minutes -> "3h 20m" (like FSActivity.time)
        static string Hm(float minutes)
        {
            int m = Mathf.RoundToInt(minutes);
            return m < 60 ? m + "m" : (m / 60) + "h" + (m % 60 > 0 ? " " + (m % 60) + "m" : "");
        }

        // ---------------------------------------------------------------- pieces

        float Line(string s, TMP_FontAsset font, float size, Color col, float x, float w, float y, float delay, bool upper = false)
        {
            var t = Text(_flow, upper ? s.ToUpperInvariant() : s, font, size, col, w, TextAlignmentOptions.TopLeft);
            t.textWrappingMode = TextWrappingModes.Normal;
            float h = t.GetPreferredValues(t.text, w * 100f, 0f).y * 0.01f;
            t.rectTransform.sizeDelta = new Vector2(w * 100f, h * 100f + 1f);
            t.transform.localPosition = new Vector3(x + w / 2f, y - h / 2f, Front - 0.0015f);
            StartCoroutine(Juice.Pop(t.transform, delay, 0.3f, 1.4f));
            return h;
        }

        float Big(JToken big, float x, float w, float y, float delay)
        {
            var t = Text(_flow, "0", Theme.Black, 110f, Color.white, w, TextAlignmentOptions.TopLeft);
            const float h = 0.12f;
            t.rectTransform.sizeDelta = new Vector2(w * 100f, h * 100f);
            t.transform.localPosition = new Vector3(x + w / 2f, y - h / 2f, Front - 0.0015f);
            _counters.Add((t, (int)big["n"], (string)big["fmt"] ?? "n", Time.time + delay));
            StartCoroutine(Juice.Pop(t.transform, delay, 0.35f, 2f));
            return h;
        }

        float List(JArray list, float x, float w, float y)
        {
            float top = y;
            for (int i = 0; i < list.Count && i < 6; i++)
            {
                var row = list[i];
                var n = Text(_flow, (string)row["n"], Theme.Black, 32f, Color.white, 0.06f, TextAlignmentOptions.MidlineLeft);
                n.transform.localPosition = new Vector3(x + 0.03f, y - 0.024f, Front - 0.0015f);
                var t = Text(_flow, (string)row["text"], Theme.Black, 26f, Color.white, w - 0.07f, TextAlignmentOptions.MidlineLeft);
                t.transform.localPosition = new Vector3(x + 0.07f + (w - 0.07f) / 2f, y - 0.024f, Front - 0.0015f);
                StartCoroutine(Juice.Pop(n.transform, 0.25f + i * 0.15f, 0.25f, 2f));
                StartCoroutine(Juice.Pop(t.transform, 0.28f + i * 0.15f, 0.25f, 1.6f));
                y -= 0.054f;
            }
            return top - y;
        }

        // photos in white frames (or cut-outs standing free), three to a row, popping in one by one
        float Images(JArray imgs, float y)
        {
            int n = Mathf.Min(imgs.Count, 6), cols = n == 1 ? 1 : 3;
            float cell = n == 1 ? 0.26f : n <= 3 ? 0.115f : 0.11f, gap = 0.016f;
            int rows = (n + cols - 1) / cols;
            for (int i = 0; i < n; i++)
            {
                var im = imgs[i];
                int c = i % cols, r = i / cols, inRow = Mathf.Min(cols, n - r * cols);
                float cx = -(inRow - 1) * (cell + gap) / 2f + c * (cell + gap), cy = y - cell / 2f - r * (cell + 0.03f + gap);
                var f = new GameObject("Image " + i).transform;
                f.SetParent(_flow, false);
                f.localPosition = new Vector3(cx, cy, Front);
                f.localRotation = Quaternion.Euler(0f, 0f, (i % 2 == 0 ? -1f : 1f) * 3f);
                bool cut = im["sticker"]?.Value<bool>() ?? false;
                if (!cut) Shapes.MakeSlab("Frame", f, Shapes.RoundedRectRing(cell + 0.012f, cell + 0.012f, 0.012f), 0.004f, Theme.Card, Theme.CardLip, Vector3.zero);
                var q = Quad(f, cell, cell, cut);
                q.localPosition = new Vector3(0f, 0f, cut ? -0.02f : -0.0045f);
                _ = Fill(q, (string)im["id"], cell, cell, cut);
                string v = (string)im["verdict"];
                if (!string.IsNullOrEmpty(v))
                {
                    var (main, lip) = Theme.For(v);
                    Shapes.MakeSlab("Ring", f, Shapes.CircleRing(0.016f), 0.004f, Color.white, Theme.CardLip, new Vector3(cell / 2f - 0.004f, cell / 2f - 0.004f, -0.006f));
                    Shapes.MakeSlab("Verdict", f, Shapes.CircleRing(0.012f), 0.003f, main, lip, new Vector3(cell / 2f - 0.004f, cell / 2f - 0.004f, -0.01f));
                }
                string cap = (string)im["caption"];
                if (!string.IsNullOrEmpty(cap))
                {
                    var t = Text(f, cap, Theme.Black, 15f, Color.white, cell + 0.02f, TextAlignmentOptions.Center);
                    t.transform.localPosition = new Vector3(0f, -cell / 2f - 0.016f, -0.006f);
                    t.transform.localRotation = Quaternion.Inverse(f.localRotation);
                }
                StartCoroutine(Juice.Pop(f, 0.3f + i * 0.12f, 0.3f, 2.2f));
            }
            return rows * (cell + 0.03f + gap);
        }

        // the week in numbers: white tiles, two to a row
        float Summary(JArray sum, float y)
        {
            float tw = (W - 0.07f - 0.012f) / 2f, th = 0.08f;
            for (int i = 0; i < sum.Count; i++)
            {
                float cx = -W / 2f + 0.035f + tw / 2f + (i % 2) * (tw + 0.012f), cy = y - th / 2f - (i / 2) * (th + 0.012f);
                var tile = new GameObject("Tile " + i).transform;
                tile.SetParent(_flow, false);
                tile.localPosition = new Vector3(cx, cy, Front);
                Shapes.MakeSlab("Face", tile, Shapes.RoundedRectRing(tw, th, 0.016f), 0.005f, Theme.Card, Theme.CardLip, Vector3.zero);
                var b = Text(tile, (string)sum[i]["big"], Theme.Black, 32f, Theme.Ink, tw - 0.03f, TextAlignmentOptions.MidlineLeft);
                b.transform.localPosition = new Vector3(0f, 0.012f, -0.0065f);
                var l = Text(tile, (string)sum[i]["label"], Theme.Bold, 16f, Theme.Muted, tw - 0.03f, TextAlignmentOptions.MidlineLeft);
                l.transform.localPosition = new Vector3(0f, -0.021f, -0.0065f);
                StartCoroutine(Juice.Pop(tile, 0.2f + i * 0.1f, 0.3f, 2f));
            }
            return ((sum.Count + 1) / 2) * (th + 0.012f);
        }

        void Sticker(string id, Vector3 at, float size, float tilt, float delay)
        {
            var holder = new GameObject("Sticker").transform;
            holder.SetParent(_content, false);
            holder.localPosition = at;
            holder.localRotation = Quaternion.Euler(0f, 0f, tilt);
            var q = Quad(holder, size, size, true);
            _ = Fill(q, id, size, size, true);
            _bobbers.Add(holder);
            StartCoroutine(Juice.Pop(holder, delay, 0.35f, 2.6f));
        }

        // ---------------------------------------------------------------- this week's card

        void CardSlide(JObject s, float y)
        {
            var holder = new GameObject("Week card").transform;
            holder.SetParent(_flow, false);
            float cw = W - 0.1f;
            float ch = s["card"] is JObject layout ? DrawCard(holder, layout, cw) : 0f;
            holder.localPosition = new Vector3(0f, y - ch / 2f, -0.03f);
            holder.localRotation = Quaternion.Euler(0f, 0f, -1.5f);
            StartCoroutine(Juice.Pop(holder, 0.15f, 0.4f, 1.8f));
        }

        // the fact card, like the web app's (public/factcard.js): grape, his stickers big at the top, the week's
        // headline, four numbers and the highlights on a white card. Returns its height.
        public static float DrawCard(Transform parent, JObject L, float w)
        {
            float h = w * 1.25f, k = w / 1080f;   // the web card is 1080 x 1350
            var host = parent.GetComponentInParent<MonoBehaviour>();
            Shapes.MakeSlab("Lip", parent, Shapes.RoundedRectRing(w, h, 0.02f), 0.008f, Theme.GrapeLip, Theme.GrapeLip, new Vector3(0f, -0.006f, 0.003f));
            Shapes.MakeSlab("Card", parent, Shapes.RoundedRectRing(w, h, 0.02f), 0.008f, Theme.Grape, Theme.GrapeLip, Vector3.zero);
            const float z = -0.0085f;
            float left = -w / 2f + 70f * k, top = h / 2f;
            var name = Text(parent, ((string)L["name"] + "'s week").ToUpperInvariant(), Theme.Black, Pt(46f, k), Color.white, w - 140f * k, TextAlignmentOptions.MidlineLeft);
            name.transform.localPosition = new Vector3(left + (w - 140f * k) / 2f, top - 95f * k, z);
            var sub = Text(parent, (string)L["sub"] ?? "", Theme.Bold, Pt(32f, k), new Color(1f, 1f, 1f, 0.85f), w - 140f * k, TextAlignmentOptions.MidlineLeft);
            sub.transform.localPosition = new Vector3(left + (w - 140f * k) / 2f, top - 145f * k, z);
            // his stickers, the newest big in the middle
            if (L["stickers"] is JArray sts && host != null)
            {
                var spots = new[] { (new Vector2(0f, top - 425f * k), 420f, -2f), (new Vector2(-310f * k, top - 490f * k), 290f, -11f), (new Vector2(310f * k, top - 480f * k), 290f, 10f) };
                for (int i = sts.Count - 1; i >= 0; i--)
                {
                    if (i >= spots.Length) continue;
                    var (p, size, rot) = spots[i];
                    var sh = new GameObject("Sticker " + i).transform;
                    sh.SetParent(parent, false);
                    sh.localPosition = new Vector3(p.x, p.y, z - 0.004f - (i == 0 ? 0.03f : 0.012f));
                    sh.localRotation = Quaternion.Euler(0f, 0f, rot);
                    float s = (sts.Count == 1 ? 470f : size) * k;
                    var q = Quad(sh, s, s, true);
                    _ = Fill(q, (string)sts[i], s, s, true);
                    if (host != null) host.StartCoroutine(Juice.Pop(sh, 0.4f + i * 0.12f, 0.35f, 2.4f));
                }
            }
            // no cut-outs of him this week: the FurSight bean holds his place, happy
            if (!(L["stickers"] is JArray st2) || st2.Count == 0) Bean.Make(parent, new Vector3(0f, top - 600f * k, z - 0.01f), 280f * k, "safe");

            // the white card
            float cy = top - 690f * k, ch = h - 690f * k - 50f * k, cw = w - 100f * k;
            var white = new GameObject("Facts").transform;
            white.SetParent(parent, false);
            white.localPosition = new Vector3(0f, cy - ch / 2f, z);
            Shapes.MakeSlab("Lip", white, Shapes.RoundedRectRing(cw, ch, 48f * k), 0.004f, Theme.GrapeLip, Theme.GrapeLip, new Vector3(0f, -12f * k, 0.002f));
            Shapes.MakeSlab("Face", white, Shapes.RoundedRectRing(cw, ch, 48f * k), 0.004f, Theme.Card, Theme.CardLip, Vector3.zero);
            float iw = cw - 100f * k, ix = -cw / 2f + 50f * k, y = ch / 2f - 40f * k;
            var title = Text(white, (string)L["title"], Theme.Black, Pt(58f, k), Theme.Ink, iw, TextAlignmentOptions.TopLeft);
            title.textWrappingMode = TextWrappingModes.Normal;
            title.rectTransform.sizeDelta = new Vector2(iw * 100f, 140f * k * 100f);
            title.transform.localPosition = new Vector3(ix + iw / 2f, y - 70f * k, -0.0045f);
            y -= 120f * k;
            if (L["tiles"] is JArray tiles)
            {
                float tw = (iw - 24f * k) / 2f, th = 118f * k;
                for (int i = 0; i < tiles.Count && i < 4; i++)
                {
                    var tile = new GameObject("Tile " + i).transform;
                    tile.SetParent(white, false);
                    tile.localPosition = new Vector3(ix + tw / 2f + (i % 2) * (tw + 24f * k), y - th / 2f - (i / 2) * (th + 20f * k), -0.0045f);
                    Shapes.Make("Bg", tile, Shapes.RoundedRect(tw, th, 28f * k), Theme.Hex("#F3EEFF"), Vector3.zero);
                    var b = Text(tile, (string)tiles[i]["big"], Theme.Black, Pt(52f, k), Theme.Ink, tw - 50f * k, TextAlignmentOptions.MidlineLeft);
                    b.transform.localPosition = new Vector3(0f, 14f * k, -0.001f);
                    var l = Text(tile, (string)tiles[i]["label"], Theme.Bold, Pt(27f, k), Theme.Muted, tw - 50f * k, TextAlignmentOptions.MidlineLeft);
                    l.transform.localPosition = new Vector3(0f, -30f * k, -0.001f);
                }
                y -= ((Mathf.Min(tiles.Count, 4) + 1) / 2) * (th + 20f * k) + 10f * k;
            }
            if (L["highlights"] is JArray hs)
                foreach (var hl in hs)
                {
                    if (y < -ch / 2f + 70f * k) break;
                    Shapes.Make("Dot", white, Shapes.Circle(9f * k, 16), Theme.Fern, new Vector3(ix + 12f * k, y - 18f * k, -0.0045f));
                    var t = Text(white, (string)hl, Theme.Bold, Pt(30f, k), Theme.Ink, iw - 40f * k, TextAlignmentOptions.MidlineLeft);
                    t.transform.localPosition = new Vector3(ix + 40f * k + (iw - 40f * k) / 2f, y - 18f * k, -0.0045f);
                    y -= 40f * k;
                }
            bool sim = L["simulated"]?.Value<bool>() ?? false;
            var foot = Text(white, "FurSight · spoil them, worry less" + (sim ? " · includes simulated data" : ""), Theme.Bold, Pt(24f, k), Theme.Muted, iw, TextAlignmentOptions.MidlineLeft);
            foot.transform.localPosition = new Vector3(ix + iw / 2f, -ch / 2f + 30f * k, -0.0045f);
            return h;
        }

        // the web card's pixel sizes (on a 1080 wide card) as text points here: a point is a millimetre of type
        static float Pt(float px, float k) => px * k * 1000f;

        // no card this week yet: Muse Spark writes it from the diary, the server lays it out, the Quest draws it
        void MakeCardButton()
        {
            var b = new GameObject("Make card").transform;
            b.SetParent(_content, false);
            const float pw = 0.3f, ph = 0.05f;
            b.localPosition = new Vector3(0f, -H / 2f - 0.105f, 0f);   // under Back, Next and Close, clear of the card
            Shapes.MakeSlab("Lip", b, Shapes.RoundedRectRing(pw, ph, ph / 2f), Thick, Theme.Hex("#141319"), Theme.Hex("#141319"), new Vector3(0f, -0.005f, 0.003f));
            Shapes.MakeSlab("Face", b, Shapes.RoundedRectRing(pw, ph, ph / 2f), Thick, Theme.Card, Theme.CardLip, Vector3.zero);
            var t = Text(b, "Make this week's card", Theme.Black, 17f, Theme.Ink, pw - 0.03f, TextAlignmentOptions.Center);
            t.transform.localPosition = new Vector3(0f, 0f, Front - 0.0012f);
            CardButton.Add(b.gameObject, 0.04f, () => { if (!_making) _ = MakeCard(t); });
            StartCoroutine(Juice.Pop(b, 0.5f, 0.3f, 2f));
        }

        async Task MakeCard(TextMeshPro label)
        {
            _making = true;
            if (label != null) label.text = "Muse Spark is writing it…";
            try
            {
                var r = await FurSightApi.Post("/api/recap", new { save = true }, 60);
                if (this == null) return;
                _data["has_card"] = true;
                var slide = new JObject { ["colour"] = "#7A4ED1", ["kicker"] = "This week's card", ["title"] = r["title"], ["card"] = r["layout"], ["card_id"] = r["entry"] };
                _slides.Insert(_slides.Count - 1, slide);
                Destroy(_bars.gameObject);
                var keep = _panel; _panel = null;
                Destroy(keep.gameObject);
                Build();
                Sfx.Safe(transform.position);
                Show(_slides.Count - 2);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] week card: " + e.Message);
                if (label != null) label.text = "Couldn't make it, try again";
            }
            finally { _making = false; }
        }

        // ---------------------------------------------------------------- helpers

        static TextMeshPro Text(Transform parent, string s, TMP_FontAsset font, float size, Color col, float w, TextAlignmentOptions align)
        {
            var go = new GameObject("Text");
            go.transform.SetParent(parent, false);
            go.transform.localScale = Vector3.one * 0.01f;
            var t = go.AddComponent<TextMeshPro>();
            if (font != null) t.font = font;
            t.text = s; t.fontSize = size; t.color = col;
            t.alignment = align;
            t.textWrappingMode = TextWrappingModes.NoWrap;
            t.overflowMode = TextOverflowModes.Ellipsis;
            t.enableAutoSizing = true; t.fontSizeMax = size; t.fontSizeMin = size * 0.5f;
            t.rectTransform.sizeDelta = new Vector2(w * 100f, size * 0.16f);
            Theme.Occlude(t);
            return t;
        }

        static Material _stickerMat;
        static Transform Quad(Transform parent, float w, float h, bool cutout)
        {
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(q.GetComponent<Collider>());
            q.transform.SetParent(parent, false);
            q.transform.localScale = new Vector3(w, h, 1f);
            _stickerMat ??= Resources.Load<Material>("Sticker");
            var mat = cutout && _stickerMat != null ? new Material(_stickerMat) : Shapes.Unlit();
            mat.SetColor("_BaseColor", new Color(1f, 1f, 1f, 0f));   // hidden until the picture arrives
            q.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return q.transform;
        }

        // load a diary picture into a quad, fitted inside w x h (a photo is cropped to fill instead)
        static async Task Fill(Transform q, string id, float w, float h, bool fit)
        {
            if (string.IsNullOrEmpty(id)) return;
            if (!_tex.TryGetValue(id, out var tex) || tex == null) { tex = await HubClient.DiaryImage(id); if (tex != null) _tex[id] = tex; }
            if (q == null || tex == null) return;
            var mat = q.GetComponent<MeshRenderer>().sharedMaterial;
            mat.SetTexture("_BaseMap", tex);
            mat.SetColor("_BaseColor", Color.white);
            float a = tex.width / (float)tex.height;
            if (fit) q.localScale = a > w / h ? new Vector3(w, w / a, 1f) : new Vector3(h * a, h, 1f);
            else
            {
                // crop the middle to the frame's shape
                float want = w / h;
                if (a > want) { float sx = want / a; mat.SetTextureScale("_BaseMap", new Vector2(sx, 1f)); mat.SetTextureOffset("_BaseMap", new Vector2((1f - sx) / 2f, 0f)); }
                else { float sy = a / want; mat.SetTextureScale("_BaseMap", new Vector2(1f, sy)); mat.SetTextureOffset("_BaseMap", new Vector2(0f, (1f - sy) / 2f)); }
            }
        }

        public void Close()
        {
            if (_open == this) _open = null;
            Sfx.Close(transform.position);
            StartCoroutine(CloseNow());
        }

        IEnumerator CloseNow()
        {
            yield return Juice.ShrinkAway(transform);
            Destroy(gameObject);
        }

        void OnDestroy() { if (_open == this) _open = null; }
    }
}
