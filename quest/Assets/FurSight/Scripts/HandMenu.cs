using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace FurSight
{
    // The palm menu: turn your left palm towards you and four chunky 3D buttons pop up just above it,
    // Check food, Ask, Photo, Pet cam. Press with your right hand: poke a button, or point and pinch.
    // Turn the hand away and it tucks itself away. Controllers: X or Y opens it at the left controller.
    // Editor: hold L for a pretend left palm, or M to toggle; click or hold O to poke.
    // Shortcuts: A = check food, B = ask (controller); Space, Q, F, C in the editor.
    public class HandMenu : MonoBehaviour
    {
        const float W = 0.44f, H = 0.15f, Thick = 0.012f, Coin = 0.032f, CoinDepth = 0.012f;
        const float PalmScale = 0.75f;     // smaller on the hand than when it floats

        [Tooltip("How directly the palm has to face you to open the menu (1 = straight at you)")]
        public float openFacing = 0.55f, closeFacing = 0.3f;

        Transform _tracking, _panel;
        bool _open, _onPalm, _armed = true;
        float _facingFor, _awayFor;

        void Update()
        {
            if (_tracking == null) { var rig = FindFirstObjectByType<OVRCameraRig>(); if (rig != null) _tracking = rig.trackingSpace; }
            var kb = Keyboard.current;
            var act = FurSightActions.Instance;

            if (OVRInput.GetDown(OVRInput.Button.Three) || OVRInput.GetDown(OVRInput.Button.Four) || (kb != null && kb.mKey.wasPressedThisFrame))
            {
                if (_open) Close(); else Open(LeftControllerPoint() ?? InFront(), false);
            }
            if (act != null)
            {
                if (OVRInput.GetDown(OVRInput.Button.Two, OVRInput.Controller.RTouch) || (kb != null && kb.qKey.wasPressedThisFrame)) act.Ask();
                if (kb != null && kb.fKey.wasPressedThisFrame) act.TakePhoto();
                if (kb != null && kb.cKey.wasPressedThisFrame) CamWindow.Toggle();
            }
            Palm();
        }

        // ---------------------------------------------------------------- the palm

        void Palm()
        {
            var hand = Hands.Get(Hands.Left);
            var cam = Camera.main;
            float facing = -1f;
            if (hand.tracked && cam != null) facing = Vector3.Dot(hand.normal, (cam.transform.position - hand.palm).normalized);

            if (!_open)
            {
                if (facing < closeFacing) _armed = true;   // turn away once before it can open again
                _facingFor = facing > openFacing ? _facingFor + Time.deltaTime : 0f;
                if (_armed && _facingFor > 0.15f) { _armed = false; Open(PalmPoint(hand), true); }
                return;
            }
            if (!_onPalm || _panel == null) return;
            _awayFor = facing < closeFacing ? _awayFor + Time.deltaTime : 0f;
            if (_awayFor > 0.35f) { Close(); return; }
            if (hand.tracked) _panel.position = Vector3.Lerp(_panel.position, PalmPoint(hand), 1f - Mathf.Exp(-14f * Time.deltaTime));
        }

        // just above the palm, a little towards you, so the other hand has room to press
        static Vector3 PalmPoint(Hands.Hand hand) => hand.palm + hand.normal * 0.06f + Vector3.up * 0.1f;

        Vector3? LeftControllerPoint()
        {
            if (_tracking == null || !OVRInput.IsControllerConnected(OVRInput.Controller.LTouch)) return null;
            return _tracking.TransformPoint(OVRInput.GetLocalControllerPosition(OVRInput.Controller.LTouch)) + Vector3.up * 0.12f;
        }

        static Vector3 InFront()
        {
            var head = Camera.main.transform;
            return head.position + head.forward * 0.45f - Vector3.up * 0.12f;
        }

        // ---------------------------------------------------------------- the menu

        public void Open(Vector3 at, bool onPalm)
        {
            if (_open) return;
            _open = true; _onPalm = onPalm; _awayFor = 0f;
            Sfx.Tick(at);
            _panel = new GameObject("Hand Menu").transform;
            _panel.position = at;
            _panel.localScale = Vector3.one * (onPalm ? PalmScale : 1f);
            Face(_panel);
            var tile = new GameObject("Tile").transform;
            tile.SetParent(_panel, false);
            Shapes.MakeSlab("Lip", tile, Shapes.RoundedRectRing(W, H, 0.03f), Thick, Theme.CardLip, Theme.CardLip, new Vector3(0f, -0.007f, 0.003f));
            Shapes.MakeSlab("Face", tile, Shapes.RoundedRectRing(W, H, 0.03f), Thick, Theme.Card, Theme.CardLip, Vector3.zero);
            StartCoroutine(Juice.Pop(_panel, 0f, 0.28f));

            float gap = 0.104f, x0 = -gap * 1.5f;
            Button(tile, x0, "Check food", Theme.Fern, Theme.FernLip, AppleIcon, () => FurSightActions.Instance?.CheckFood(), 0.06f);
            Button(tile, x0 + gap, "Ask", Theme.Grape, Theme.GrapeLip, MicIcon, () => FurSightActions.Instance?.Ask(), 0.1f);
            Button(tile, x0 + gap * 2, "Photo", Theme.Sky, Theme.SkyLip, CameraIcon, () => PhotoFrame.Begin(), 0.14f);
            Button(tile, x0 + gap * 3, "Pet cam", Theme.Sun, Theme.SunLip, ScreenIcon, CamWindow.Toggle, 0.18f);
        }

        void Button(Transform tile, float x, string label, Color col, Color lip, System.Action<Transform, Color> icon, System.Action action, float delay)
        {
            var b = new GameObject(label).transform;
            b.SetParent(tile, false);
            b.localPosition = new Vector3(x, 0.014f, -Thick);
            var coin = new GameObject("Coin").transform;
            coin.SetParent(b, false);
            Shapes.MakeSlab("Lip", coin, Shapes.CircleRing(Coin), CoinDepth * 0.6f, lip, lip, new Vector3(0f, -0.005f, 0f));
            Shapes.MakeSlab("Face", coin, Shapes.CircleRing(Coin), CoinDepth, col, lip, Vector3.zero);
            var ic = new GameObject("Icon").transform;
            ic.SetParent(coin, false);
            ic.localPosition = Vector3.back * CoinDepth;
            icon(ic, col);
            var t = new GameObject("Label").AddComponent<TextMeshPro>();
            t.transform.SetParent(b, false);
            t.transform.localScale = Vector3.one * 0.01f;
            t.transform.localPosition = new Vector3(0f, -0.05f, -0.0012f);
            if (Theme.Black != null) t.font = Theme.Black;
            t.text = label; t.fontSize = 14f; t.color = Theme.Ink;
            t.alignment = TextAlignmentOptions.Center;
            t.rectTransform.sizeDelta = new Vector2(10f, 2.4f);
            CardButton.Add(coin.gameObject, Coin + 0.006f, () => { Close(); action(); });
            StartCoroutine(Juice.Pop(b, delay, 0.3f, 2.2f));
        }

        public void Close()
        {
            if (!_open) return;
            _open = false;
            if (_panel != null) StartCoroutine(Juice.ShrinkAway(_panel));
            _panel = null;
        }

        void LateUpdate() { if (_panel != null) Face(_panel); }

        static void Face(Transform t)
        {
            var cam = Camera.main;
            if (cam == null) return;
            var away = t.position - cam.transform.position;
            if (away.sqrMagnitude > 1e-4f) t.rotation = Quaternion.LookRotation(away, Vector3.up);
        }

        // ---------------------------------------------------------------- icons (white, raised on the coin)

        static void AppleIcon(Transform p, Color col)
        {
            Shapes.MakeSlab("Apple", p, Shapes.CircleRing(0.0115f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, -0.003f, 0f));
            Shapes.MakeSlab("Stem", p, Shapes.RoundedRectRing(0.0026f, 0.007f, 0.0013f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, 0.0105f, 0f));
            Shapes.MakeSlab("Leaf", p, Shapes.RoundedRectRing(0.0095f, 0.0045f, 0.0022f), 0.002f, Color.white, Theme.CardLip, new Vector3(0.0055f, 0.012f, 0f), 30f);
        }

        static void MicIcon(Transform p, Color col)
        {
            Shapes.MakeSlab("Head", p, Shapes.RoundedRectRing(0.012f, 0.02f, 0.006f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, 0.005f, 0f));
            Shapes.Make("Cup", p, Shapes.Arc(0.0115f, 0.0028f, 200f, 340f), Color.white, new Vector3(0f, 0.004f, -0.001f));
            Shapes.MakeSlab("Stand", p, Shapes.RoundedRectRing(0.003f, 0.006f, 0.0015f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, -0.0095f, 0f));
            Shapes.MakeSlab("Base", p, Shapes.RoundedRectRing(0.012f, 0.003f, 0.0015f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, -0.0128f, 0f));
        }

        static void CameraIcon(Transform p, Color col)
        {
            Shapes.MakeSlab("Body", p, Shapes.RoundedRectRing(0.03f, 0.02f, 0.005f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, -0.002f, 0f));
            Shapes.MakeSlab("Bump", p, Shapes.RoundedRectRing(0.011f, 0.006f, 0.002f), 0.002f, Color.white, Theme.CardLip, new Vector3(-0.005f, 0.009f, 0f));
            Shapes.MakeSlab("Lens", p, Shapes.CircleRing(0.0062f), 0.0015f, col, col, new Vector3(0f, -0.002f, -0.002f));
        }

        // a little screen with a live dot: the pet cam
        static void ScreenIcon(Transform p, Color col)
        {
            Shapes.MakeSlab("Screen", p, Shapes.RoundedRectRing(0.03f, 0.021f, 0.004f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, 0.002f, 0f));
            Shapes.MakeSlab("Stand", p, Shapes.RoundedRectRing(0.012f, 0.003f, 0.0015f), 0.002f, Color.white, Theme.CardLip, new Vector3(0f, -0.0125f, 0f));
            Shapes.MakeSlab("Live", p, Shapes.CircleRing(0.0042f), 0.0015f, Theme.Coral, Theme.CoralLip, new Vector3(0.008f, 0.007f, -0.002f));
        }
    }
}
