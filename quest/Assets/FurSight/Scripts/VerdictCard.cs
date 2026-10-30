using System.Collections;
using TMPro;
using UnityEngine;

namespace FurSight
{
    // A card floating just above something real: white, rounded, with a chunky coloured lip underneath,
    // a round verdict badge, the food in bold and the verdict in its colour. A dot and stem tie it to the
    // thing itself. It pops in (dot, stem, card, then contents), and says its verdict with a sound, a buzz
    // and a little motion: sparkles for safe, a wobble for a treat, a "no" shake for don't.
    // Everything is in metres; the root turns to face the wearer.
    public class VerdictCard : MonoBehaviour
    {
        const float W = 0.28f, H = 0.13f, R = 0.024f, Lip = 0.008f;
        // depth: the card is a 12 mm tile, the badge a coin standing 9 mm proud of it, the close button 5 mm
        const float Thick = 0.012f, Coin = 0.009f, Key = 0.005f, Front = -Thick;

        Transform _card;
        float _until = float.MaxValue;
        bool _leaving;
        TextMeshPro _spinnerText;
        string _label;
        public System.Func<float> Level;   // optional live level (0-1), e.g. the mic while listening
        Transform _spinner;
        Bean _bean;
        float _h;                 // the card face's height, for hanging an action button under it
        Transform _action;
        TextMeshPro _actionText;

        // ---------------------------------------------------------------- verdict

        public static VerdictCard Verdict(Vector3 point, string food, string verdict, string reason, string extra, bool main = true, string word = null)
        {
            var (col, lip) = Theme.For(verdict);
            var c = New("Verdict " + food, point);
            float lift = main ? 0.07f : 0.05f;

            // the dot on the food: white ring, coloured centre
            var dot = new GameObject("Dot").transform;
            dot.SetParent(c.transform, false);
            Shapes.MakeSlab("Ring", dot, Shapes.CircleRing(0.015f), 0.004f, Color.white, Theme.CardLip, Vector3.zero);
            Shapes.MakeSlab("Fill", dot, Shapes.CircleRing(0.0105f), 0.003f, col, lip, new Vector3(0f, 0f, -0.004f));
            var stem = Shapes.Make("Stem", c.transform, Shapes.RoundedRect(0.004f, lift, 0.002f), Color.white, new Vector3(0f, lift / 2f, 0.0002f)).transform;
            // the stem grows from the dot: pivot it at its base
            var stemPivot = new GameObject("StemPivot").transform;
            stemPivot.SetParent(c.transform, false);
            stem.SetParent(stemPivot, true);

            c._card = new GameObject("Card").transform;
            c._card.SetParent(c.transform, false);

            // text first: the card is sized to fit it (nothing is cut off with "...")
            const float pad = 0.016f, header = 0.056f, gap = 0.01f;
            float textX = -W / 2f + 0.074f, textW = W - 0.074f - 0.044f;   // leaves room for the close button
            var title = Text(c._card, Capital(food), Theme.Black, 26f, Theme.Ink, new Vector2(textX, 0f), textW, 0.03f, 13f);
            var wordText = Text(c._card, word ?? Theme.Word(verdict), Theme.Black, 21f, col, new Vector2(textX, 0f), textW, 0.024f, 15f);
            string bodyText = string.IsNullOrEmpty(extra) ? reason : reason + "\n" + extra;
            float bodyW = W - 2f * pad;
            var body = Text(c._card, bodyText, Theme.Bold, 15f, Theme.Muted, new Vector2(-W / 2f + pad, 0f), bodyW, 0.01f, 15f);
            body.enableAutoSizing = false;
            body.textWrappingMode = TextWrappingModes.Normal;
            body.overflowMode = TextOverflowModes.Overflow;
            body.alignment = TextAlignmentOptions.TopLeft;
            float bodyH = string.IsNullOrEmpty(bodyText) ? 0f : body.GetPreferredValues(bodyText, bodyW * 100f, 0f).y * 0.01f;
            body.rectTransform.sizeDelta = new Vector2(bodyW * 100f, bodyH * 100f + 1f);
            float h = pad + header + (bodyH > 0f ? gap + bodyH : 0f) + pad;
            float top = h / 2f;
            c._h = h;
            c._card.localPosition = new Vector3(0f, lift + h / 2f + Lip, 0f);

            Shapes.MakeSlab("Lip", c._card, Shapes.RoundedRectRing(W, h, R), Thick, lip, lip, new Vector3(0f, -Lip, 0.003f));
            Shapes.MakeSlab("Face", c._card, Shapes.RoundedRectRing(W, h, R), Thick, Theme.Card, Theme.CardLip, Vector3.zero);

            var badge = new GameObject("Badge").transform;
            badge.SetParent(c._card, false);
            badge.localPosition = new Vector3(-W / 2f + 0.038f, top - pad - header / 2f, Front);
            Shapes.MakeSlab("BadgeLip", badge, Shapes.CircleRing(0.026f), Coin * 0.6f, lip, lip, new Vector3(0f, -0.0045f, 0f));
            Shapes.MakeSlab("BadgeFace", badge, Shapes.CircleRing(0.026f), Coin, col, lip, Vector3.zero);
            Icon(badge, verdict);

            Place(title, top - pad - 0.014f);
            Place(wordText, top - pad - 0.041f);
            Place(body, top - pad - header - gap - bodyH / 2f);
            var close = c.CloseButton(top);
            // the Bean sits on the card's top edge, above the badge, and reacts with the verdict
            c._bean = Bean.Make(c._card, new Vector3(-W / 2f + 0.05f, top + 0.001f, Front / 2f), 0.06f, main ? "idle" : Mood(verdict));
            if (!main) c.transform.localScale = Vector3.one * 0.72f;

            // entrance: dot, stem, card, then each line
            c.StartCoroutine(Juice.Pop(dot, 0f, 0.2f, 2.4f));
            c.StartCoroutine(Juice.Grow(stemPivot, 0.08f));
            c.StartCoroutine(Juice.Pop(c._card, 0.16f, 0.34f));
            c.StartCoroutine(Juice.Pop(badge, 0.28f, 0.3f, 2.6f));
            c.StartCoroutine(Juice.Pop(title.transform, 0.32f, 0.22f));
            c.StartCoroutine(Juice.Pop(wordText.transform, 0.37f, 0.22f));
            c.StartCoroutine(Juice.Pop(body.transform, 0.42f, 0.22f));
            c.StartCoroutine(Juice.Pop(close, 0.46f, 0.22f, 2.4f));
            c.StartCoroutine(Juice.Pop(c._bean.transform, 0.24f, 0.3f, 2.4f));
            if (main) c.StartCoroutine(c.React(verdict, badge));
            // stays until you close it or check again (walking round the room, it's still there)
            return c;
        }

        IEnumerator React(string verdict, Transform badge)
        {
            yield return new WaitForSeconds(0.3f);
            var at = _card.position;
            if (_bean != null) _bean.SetMood(Mood(verdict));
            if (verdict == "safe")
            {
                Sfx.Safe(at);
                StartCoroutine(Juice.Buzz(0.25f, 0.06f));
                StartCoroutine(Juice.Sparkle(_card, badge.localPosition + Vector3.back * Coin, Theme.Fern, Theme.Sun, 0.05f));
            }
            else if (verdict == "caution")
            {
                Sfx.Treat(at);
                StartCoroutine(Juice.Buzz(0.35f, 0.08f));
                StartCoroutine(Wobble(badge));
            }
            else if (verdict == "toxic" || verdict == "vet")
            {
                Sfx.Nope(at);
                StartCoroutine(Juice.Buzz(0.8f, 0.18f));
                StartCoroutine(Juice.Shake(_card, 0.05f));
            }
            else Sfx.Tick(at);
        }

        static string Mood(string verdict) =>
            verdict == "safe" || verdict == "saved" || verdict == "linked" ? "safe"
            : verdict == "caution" || verdict == "toxic" || verdict == "vet" ? verdict : "idle";

        static IEnumerator Wobble(Transform t)
        {
            for (float e = 0f; e < 0.5f; e += Time.deltaTime)
            {
                if (t == null) yield break;
                t.localRotation = Quaternion.Euler(0f, 0f, Mathf.Sin(e * 26f) * 14f * (1f - e / 0.5f));
                yield return null;
            }
            if (t != null) t.localRotation = Quaternion.identity;
        }

        // white glyphs drawn from rounded bars: check, "!" or cross
        static void Icon(Transform badge, string verdict)
        {
            Vector3 z = Vector3.back * Coin;
            if (verdict == "safe" || verdict == "saved" || verdict == "linked")
            {
                Shapes.MakeSlab("Check A", badge, Shapes.RoundedRectRing(0.013f, 0.0058f, 0.0029f), 0.002f, Color.white, Theme.CardLip, new Vector3(-0.0068f, -0.0012f, 0f) + z, -45f);
                Shapes.MakeSlab("Check B", badge, Shapes.RoundedRectRing(0.026f, 0.0058f, 0.0029f), 0.002f, Color.white, Theme.CardLip, new Vector3(0.0040f, 0.0030f, 0f) + z, 50f);
            }
            else if (verdict == "toxic" || verdict == "vet")
            {
                Shapes.MakeSlab("Cross A", badge, Shapes.RoundedRectRing(0.026f, 0.0062f, 0.0031f), 0.002f, Color.white, Theme.CardLip, z, 45f);
                Shapes.MakeSlab("Cross B", badge, Shapes.RoundedRectRing(0.026f, 0.0062f, 0.0031f), 0.002f, Color.white, Theme.CardLip, z, -45f);
            }
            else
            {
                Shapes.MakeSlab("Bang", badge, Shapes.RoundedRectRing(0.0062f, 0.019f, 0.0031f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, 0.0035f, 0f) + z);
                Shapes.MakeSlab("Dot", badge, Shapes.CircleRing(0.0036f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, -0.0105f, 0f) + z);
            }
        }

        // ---------------------------------------------------------------- one follow-up action

        // a chunky pill hanging under the card ("We fed him this"); pressing it runs onPress once
        const float ActW = 0.2f, ActH = 0.042f;

        public void AddAction(string label, Color col, Color lip, System.Action onPress)
        {
            if (_card == null || _action != null) return;
            _action = new GameObject("Action").transform;
            _action.SetParent(_card, false);
            _action.localPosition = new Vector3(0f, -_h / 2f - Lip - ActH / 2f - 0.014f, 0f);
            Pill(col, lip);
            _actionText = Text(_action, label, Theme.Black, 17f, Color.white, new Vector2(-ActW / 2f + 0.014f, 0f), ActW - 0.028f, 0.03f, 9f);
            _actionText.alignment = TextAlignmentOptions.Center;
            bool pressed = false;
            CardButton.Add(_action.gameObject, 0.05f, () => { if (pressed) return; pressed = true; KeepOpen(); onPress(); });
            StartCoroutine(Juice.Pop(_action, 0.55f, 0.25f, 2.2f));
        }

        void Pill(Color col, Color lip)
        {
            Shapes.MakeSlab("Lip", _action, Shapes.RoundedRectRing(ActW, ActH, ActH / 2f), Thick, lip, lip, new Vector3(0f, -0.005f, 0.003f));
            Shapes.MakeSlab("Face", _action, Shapes.RoundedRectRing(ActW, ActH, ActH / 2f), Thick, col, lip, Vector3.zero);
        }

        // after pressing: "Marking…", then what happened
        public void SetAction(string label, Color? col = null)
        {
            if (_actionText == null) return;
            _actionText.text = label;
            if (col.HasValue)
            {
                foreach (Transform t in _action) if (t.name == "Face" || t.name == "Lip") Destroy(t.gameObject);
                var lip = col.Value * 0.82f; lip.a = 1f;
                Pill(col.Value, lip);
            }
            StartCoroutine(Juice.Pop(_action, 0f, 0.2f, 2f));
            // stays up after, until closed
        }

        // ---------------------------------------------------------------- checking

        public static VerdictCard Checking(Vector3 at, string question, string label = "Checking", Color? accent = null)
        {
            var c = New(label, at);
            c._label = label;
            var tint = accent ?? Theme.Sky;
            const float w = 0.21f, h = 0.06f;
            c._card = new GameObject("Card").transform;
            c._card.SetParent(c.transform, false);
            Shapes.MakeSlab("Lip", c._card, Shapes.RoundedRectRing(w, h, h / 2f), Thick, tint * 0.82f, tint * 0.82f, new Vector3(0f, -0.006f, 0.003f));
            Shapes.MakeSlab("Face", c._card, Shapes.RoundedRectRing(w, h, h / 2f), Thick, Theme.Card, Theme.CardLip, Vector3.zero);
            c._spinner = new GameObject("Spinner").transform;
            c._spinner.SetParent(c._card, false);
            c._spinner.localPosition = new Vector3(-w / 2f + 0.032f, 0f, Front - 0.001f);
            Shapes.Make("Track", c._spinner, Shapes.Arc(0.014f, 0.0055f, 0f, 360f), Theme.CardLip, Vector3.zero);
            Shapes.Make("Arc", c._spinner, Shapes.Arc(0.014f, 0.0055f, 0f, 110f), tint, Vector3.back * 0.0005f);
            float tx = -w / 2f + 0.058f, tw = w - 0.07f;
            c._spinnerText = Text(c._card, label, Theme.Black, 20f, Theme.Ink, new Vector2(tx, 0.009f), tw, 0.024f, 14f);
            Text(c._card, question, Theme.Bold, 13f, Theme.Muted, new Vector2(tx, -0.013f), tw, 0.018f, 9f);
            c._bean = Bean.Make(c._card, new Vector3(-w / 2f + 0.032f, h / 2f + 0.001f, Front / 2f), 0.045f, "thinking");
            c.StartCoroutine(Juice.Pop(c._card, 0f, 0.28f));
            c.StartCoroutine(Juice.Pop(c._bean.transform, 0.12f, 0.3f, 2.4f));
            return c;
        }

        // ---------------------------------------------------------------- shared

        static VerdictCard New(string name, Vector3 at)
        {
            var go = new GameObject(name);
            go.transform.position = at;
            var c = go.AddComponent<VerdictCard>();
            c.Face();
            return c;
        }

        static TextMeshPro Text(Transform parent, string s, TMP_FontAsset font, float size, Color color, Vector2 leftCentre, float width, float height, float minSize)
        {
            var go = new GameObject("Text");
            go.transform.SetParent(parent, false);
            // text is laid out in centimetres (scale 0.01) so font sizes read like points
            go.transform.localScale = Vector3.one * 0.01f;
            go.transform.localPosition = new Vector3(leftCentre.x + width / 2f, leftCentre.y, Front - 0.0012f);
            var t = go.AddComponent<TextMeshPro>();
            if (font != null) t.font = font;
            t.text = s;
            t.color = color;
            t.rectTransform.sizeDelta = new Vector2(width * 100f, height * 100f);
            t.fontSize = size;
            t.enableAutoSizing = true;
            t.fontSizeMax = size;
            t.fontSizeMin = minSize;
            t.alignment = TextAlignmentOptions.MidlineLeft;
            t.textWrappingMode = TextWrappingModes.NoWrap;
            t.overflowMode = TextOverflowModes.Ellipsis;
            Theme.Occlude(t);
            return t;
        }

        static void Place(TextMeshPro t, float y) { var p = t.transform.localPosition; t.transform.localPosition = new Vector3(p.x, y, p.z); }

        // a small grey circle with an ink cross, top right: point and press (or click) to close the card
        Transform CloseButton(float top)
        {
            var b = new GameObject("Close").transform;
            b.SetParent(_card, false);
            b.localPosition = new Vector3(W / 2f - 0.022f, top - 0.022f, Front);
            Shapes.MakeSlab("Key", b, Shapes.CircleRing(0.0125f), Key, Theme.CardLip, Theme.Muted, Vector3.zero);
            Shapes.MakeSlab("X1", b, Shapes.RoundedRectRing(0.012f, 0.0028f, 0.0014f), 0.0015f, Theme.Muted, Theme.Muted, Vector3.back * Key, 45f);
            Shapes.MakeSlab("X2", b, Shapes.RoundedRectRing(0.012f, 0.0028f, 0.0014f), 0.0015f, Theme.Muted, Theme.Muted, Vector3.back * Key, -45f);
            CardButton.Add(b.gameObject, 0.02f, Dismiss);   // generous hit area: small targets are hard to point at
            return b;
        }

        static string Capital(string s) => string.IsNullOrEmpty(s) ? "Food" : char.ToUpper(s[0]) + s.Substring(1);

        public void KeepOpen() => _until = float.MaxValue;

        // every card up right now, for "Close all" on the hand menu
        static readonly System.Collections.Generic.List<VerdictCard> _all = new System.Collections.Generic.List<VerdictCard>();
        void OnEnable() => _all.Add(this);
        void OnDisable() => _all.Remove(this);
        public static int Count => _all.Count;
        public static void CloseAll() { foreach (var c in _all.ToArray()) if (c != null) c.Dismiss(); }

        // his sticker, stuck on the card's top right corner at a jaunty angle; it pops on and bobs gently
        static Material _stickerMat;
        public void AddSticker(Texture2D tex, float height = 0.11f)
        {
            if (_card == null || tex == null) return;
            _stickerMat ??= Resources.Load<Material>("Sticker");
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(q.GetComponent<Collider>());
            q.name = "Sticker";
            var t = q.transform;
            t.SetParent(_card, false);
            float w = height * tex.width / tex.height;
            t.localScale = new Vector3(w, height, 1f);
            t.localPosition = new Vector3(W / 2f - w * 0.35f, _h / 2f + height * 0.3f, Front - 0.004f);
            t.localRotation = Quaternion.Euler(0f, 0f, -8f);
            var mat = _stickerMat != null ? new Material(_stickerMat) : Shapes.Unlit();
            mat.SetTexture("_BaseMap", tex);
            mat.SetColor("_BaseColor", Color.white);
            q.GetComponent<MeshRenderer>().sharedMaterial = mat;
            Sfx.Pin(t.position);
            StartCoroutine(Juice.Pop(t, 0f, 0.35f, 2.6f));
            StartCoroutine(Bob(t));
            KeepOpen();
        }

        static IEnumerator Bob(Transform t)
        {
            yield return new WaitForSeconds(0.4f);
            var p = t.localPosition;
            while (t != null) { t.localPosition = p + Vector3.up * Mathf.Sin(Time.time * 2.2f) * 0.003f; t.localRotation = Quaternion.Euler(0f, 0f, -8f + Mathf.Sin(Time.time * 1.6f) * 2.5f); yield return null; }
        }

        // keep the card on something that moves (the hand holding the food) until it's lost for a moment; then it
        // stays where it was
        System.Func<Vector3?> _follow;
        float _lostFor;
        public void Follow(System.Func<Vector3?> target) { _follow = target; _lostFor = 0f; }

        // change the big line on a Checking card ("Hold it up 3")
        public void SetLabel(string label) => _label = label;

        public void Dismiss()
        {
            if (_leaving) return;
            _leaving = true;
            StartCoroutine(Juice.ShrinkAway(transform));
        }

        void Face()
        {
            var cam = Camera.main;
            if (cam == null) return;
            var away = transform.position - cam.transform.position;
            away.y = 0f;
            if (away.sqrMagnitude > 1e-4f) transform.rotation = Quaternion.LookRotation(away, Vector3.up);
        }

        void LateUpdate()
        {
            if (_follow != null && !_leaving)
            {
                var p = _follow();
                if (p.HasValue) { _lostFor = 0f; transform.position = Vector3.Lerp(transform.position, p.Value, 1f - Mathf.Exp(-18f * Time.deltaTime)); }
                else if ((_lostFor += Time.deltaTime) > 0.4f) _follow = null;
            }
            Face();
            if (_spinner != null)
            {
                _spinner.localRotation = Quaternion.Euler(0f, 0f, -Time.time * 360f);
                _spinnerText.text = _label + new string('.', 1 + (int)(Time.time * 3f) % 3);
                // listening: the ring swells with your voice instead of spinning steadily
                if (Level != null) _spinner.localScale = Vector3.one * (1f + Level() * 0.6f);
            }
            if (Time.time > _until) Dismiss();
        }
    }
}
