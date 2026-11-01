using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace FurSight
{
    // Pressing buttons on cards and menus: poke them with your right index finger, or point with a controller
    // or a hand's ray and pull the trigger / pinch; in the editor, click (or hold O to poke under the mouse). Runs before FoodCheck so a press that lands on a button closes the card
    // instead of starting another check (Consumed tells FoodCheck to ignore it this frame).
    [DefaultExecutionOrder(-50)]
    public class CardInput : MonoBehaviour
    {
        public static bool Consumed { get; private set; }
        static readonly Dictionary<Collider, CardButton> _buttons = new Dictionary<Collider, CardButton>();

        public static void Register(CardButton b) => _buttons[b.Collider] = b;
        public static void Unregister(CardButton b) => _buttons.Remove(b.Collider);

        Transform _tracking;
        CardButton _hover;
        readonly bool[] _wasPinch = new bool[2];
        CardButton _poked;   // the button the fingertip is in (pressed once on the way in)
        bool _pokeDone;

        // where the hands are, for the UI shaders (FurSightHands.hlsl): only a real hand hides a card, never the room
        static readonly Vector4[] _handPts = new Vector4[4];
        static readonly int HandsId = Shader.PropertyToID("_FSHands");
        static void SendHands()
        {
            for (int h = 0; h < 2; h++)
            {
                var hand = Hands.Get(h);
                _handPts[h * 2] = hand.tracked ? new Vector4(hand.palm.x, hand.palm.y, hand.palm.z, 0.12f) : Vector4.zero;
                _handPts[h * 2 + 1] = hand.tracked ? new Vector4(hand.indexTip.x, hand.indexTip.y, hand.indexTip.z, 0.05f) : Vector4.zero;
            }
            Shader.SetGlobalVectorArray(HandsId, _handPts);
        }

        void Update()
        {
            Consumed = false;
            SendHands();
            if (_tracking == null) { var rig = FindFirstObjectByType<OVRCameraRig>(); if (rig != null) _tracking = rig.trackingSpace; }

            CardButton hovered = null;
            bool pressed = false;
            int beam = 0;
            foreach (var (ray, press, controller) in Pointers())
            {
                var b = Target(ray, controller);
                if (controller) Beam(beam++, ray, b);
                if (b == null) continue;
                if (hovered == null) { hovered = b; if (press) pressed = true; }
            }
            for (int i = beam; i < _beams.Count; i++) _beams[i].gameObject.SetActive(false);
            if (hovered != _hover) { if (_hover != null) _hover.Hover(false); if (hovered != null) { hovered.Hover(true); Sfx.Hover(hovered.transform.position); } _hover = hovered; }
            if (hovered != null && pressed && hovered.Ready) { Consumed = true; Pressed(hovered); _hover = null; }
            Poke();
        }

        // after any press, nothing else for a moment: a hand moving on doesn't press the next button too
        const float Cooldown = 0.5f, Dwell = 0.08f;
        static float _quietUntil;
        float _inSince;

        static void Pressed(CardButton b) { _quietUntil = Time.time + Cooldown; b.Press(); }

        // The fingertip shows it can press: within 12 cm of a button a ring appears on your index tip and closes in
        // as you reach it, the nearest button grows a little, and inside it the ring fills green as it presses.
        Transform _tip, _ring, _fill;
        CardButton _near;
        void Fingertip(Hands.Hand hand, int h)
        {
            CardButton nearest = null; float best = 0.12f;
            if (hand.tracked)
                foreach (var b in _buttons.Values)
                {
                    if (b == null || b.notHand == h || !b.Collider.enabled || !b.gameObject.activeInHierarchy) continue;
                    float d = Vector3.Distance(b.Collider.bounds.center, hand.indexTip);
                    if (d < best) { best = d; nearest = b; }
                }
            if (nearest != _near) { if (_near != null) _near.Hover(false); if (nearest != null) nearest.Hover(true); _near = nearest; }
            if (nearest == null) { if (_tip != null) _tip.gameObject.SetActive(false); return; }
            if (_tip == null)
            {
                _tip = new GameObject("Fingertip").transform;
                _ring = Shapes.Make("Ring", _tip, Shapes.Arc(0.012f, 0.0025f, 0f, 360f), Theme.Grape, Vector3.zero).transform;
                _fill = Shapes.Make("Fill", _tip, Shapes.Circle(0.006f, 20), Theme.Fern, Vector3.back * 0.0005f).transform;
                // drawn over everything: the rest of the UI hides behind your hand, but this sits on your fingertip
                var top = Resources.Load<Material>("FlatTop");
                if (top != null)
                    foreach (var (t, col) in new[] { (_ring, Theme.Grape), (_fill, Theme.Fern) })
                    { var m = new Material(top); m.SetColor("_BaseColor", col); t.GetComponent<MeshRenderer>().sharedMaterial = m; }
            }
            _tip.gameObject.SetActive(true);
            var cam = Camera.main.transform;
            _tip.position = hand.indexTip;
            _tip.rotation = Quaternion.LookRotation(hand.indexTip - cam.position, cam.up);
            float k = Mathf.InverseLerp(0.12f, 0.02f, best);                 // 0 far, 1 touching
            _ring.localScale = Vector3.one * Mathf.Lerp(1.6f, 0.75f, k);
            bool inside = nearest.Contains(hand.indexTip);
            _fill.localScale = Vector3.one * (inside ? Mathf.Clamp01((Time.time - _inSince) / Dwell) : 0f);
        }

        // a fingertip pushed into a button and held there a moment presses it once; it has to come out before it
        // can press again. Brushing past doesn't count.
        void Poke()
        {
            Fingertip(Hands.Get(Hands.Right), Hands.Right);
            CardButton inside = null;
            for (int h = 0; h < 2; h++)
            {
                var hand = Hands.Get(h);
                if (!hand.tracked) continue;
                foreach (var b in _buttons.Values)
                    if (b != null && b.notHand != h && b.Contains(hand.indexTip)) { inside = b; break; }
                if (inside != null) break;
            }
            if (inside != _poked) { _inSince = Time.time; _pokeDone = false; }
            _poked = inside;
            if (inside != null && !_pokeDone && inside.Ready && Time.time >= _quietUntil && Time.time - _inSince >= Dwell)
            {
                _pokeDone = true; Consumed = true; Pressed(inside);
            }
        }

        // every pointer this frame: its ray, and whether it was just pressed
        // what a pointer is on: the button it hits; for a controller, failing that, the button nearest its aim
        // within 7 degrees (the beam bends to it, so small buttons are easy to hit from across the room)
        CardButton Target(Ray ray, bool controller)
        {
            if (Physics.Raycast(ray, out var hit, 3f) && _buttons.TryGetValue(hit.collider, out var b)) return b;
            if (!controller) return null;
            CardButton best = null; float bestAngle = 7f;
            foreach (var c in _buttons.Values)
            {
                if (c == null || !c.Collider.enabled || !c.gameObject.activeInHierarchy) continue;
                var to = c.Collider.bounds.center - ray.origin;
                if (to.magnitude > 3f) continue;
                float a = Vector3.Angle(ray.direction, to);
                if (a < bestAngle) { bestAngle = a; best = c; }
            }
            return best;
        }

        // the controller's beam: a soft white line from the controller. On a button it bends to the button's middle
        // (a curve leaving along the controller and arriving square on), with a dot where it lands; otherwise a
        // short straight beam that fades out
        readonly List<LineRenderer> _beams = new List<LineRenderer>();
        static Material _beamMat;
        void Beam(int i, Ray ray, CardButton target)
        {
            while (_beams.Count <= i)
            {
                var go = new GameObject("Controller beam");
                var lr = go.AddComponent<LineRenderer>();
                lr.positionCount = 24; lr.useWorldSpace = true; lr.numCapVertices = 4;
                _beamMat ??= Resources.Load<Material>("FlatTop") is Material m ? new Material(m) : Shapes.Unlit();
                lr.sharedMaterial = _beamMat;
                _beamMat.SetColor("_BaseColor", Color.white);
                lr.colorGradient = new Gradient { colorKeys = new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                    alphaKeys = new[] { new GradientAlphaKey(0.9f, 0f), new GradientAlphaKey(0.9f, 1f) } };
                var dot = Shapes.Make("Dot", go.transform, Shapes.Circle(0.006f, 16), Theme.Grape, Vector3.zero);
                if (_beamMat != null) { var dm = new Material(_beamMat); dm.SetColor("_BaseColor", Theme.Grape); dot.GetComponent<MeshRenderer>().sharedMaterial = dm; }
                _beams.Add(lr);
            }
            var line = _beams[i];
            line.gameObject.SetActive(true);
            var tip = line.transform.GetChild(0);
            Vector3 a = ray.origin, end;
            if (target != null)
            {
                end = target.Collider.bounds.center;
                float d = Vector3.Distance(a, end);
                var ctrl = a + ray.direction * d * 0.5f;   // leaves along the controller, bends to the button
                for (int k = 0; k < line.positionCount; k++)
                {
                    float t = k / (line.positionCount - 1f);
                    line.SetPosition(k, (1 - t) * (1 - t) * a + 2 * (1 - t) * t * ctrl + t * t * end);
                }
                line.startWidth = 0.004f; line.endWidth = 0.002f;
                tip.gameObject.SetActive(true);
                tip.position = end - (end - Camera.main.transform.position).normalized * 0.012f;
                tip.rotation = Quaternion.LookRotation(end - Camera.main.transform.position);
            }
            else
            {
                end = a + ray.direction * 0.45f;
                for (int k = 0; k < line.positionCount; k++) line.SetPosition(k, Vector3.Lerp(a, end, k / (line.positionCount - 1f)));
                line.startWidth = 0.003f; line.endWidth = 0.0005f;
                tip.gameObject.SetActive(false);
            }
        }

        IEnumerable<(Ray, bool, bool)> Pointers()
        {
            var mouse = Mouse.current;
            if (mouse != null && Camera.main != null && Application.isEditor)
                yield return (Camera.main.ScreenPointToRay(mouse.position.ReadValue()), mouse.leftButton.wasPressedThisFrame, false);
            if (_tracking == null) yield break;
            foreach (var (c, button) in new[] { (OVRInput.Controller.RTouch, OVRInput.Button.SecondaryIndexTrigger), (OVRInput.Controller.LTouch, OVRInput.Button.PrimaryIndexTrigger) })
            {
                if (!OVRInput.IsControllerConnected(c)) continue;
                var pos = _tracking.TransformPoint(OVRInput.GetLocalControllerPosition(c));
                var rot = _tracking.rotation * OVRInput.GetLocalControllerRotation(c);
                yield return (new Ray(pos, rot * Vector3.forward), OVRInput.GetDown(button), true);
            }
            for (int h = 0; h < 2; h++)
            {
                var hand = Hands.Get(h);
                bool fresh = hand.tracked && hand.pinching && !_wasPinch[h];
                _wasPinch[h] = hand.tracked && hand.pinching;
                if (hand.tracked && hand.hasAim) yield return (hand.aim, fresh, false);
            }
        }
    }

    // A round button on a card: grows a little when pointed at, runs its action when pressed.
    public class CardButton : MonoBehaviour
    {
        public Collider Collider { get; private set; }
        public Action OnPress;
        public int notHand = -1;   // a hand whose fingertip doesn't press it (the one holding the menu)
        Vector3 _scale;

        public static CardButton Add(GameObject go, float hitRadius, Action onPress)
        {
            var b = go.AddComponent<CardButton>();
            var col = go.AddComponent<SphereCollider>();
            col.radius = hitRadius;
            b.Collider = col;
            b.OnPress = onPress;
            b._scale = go.transform.localScale;
            b._readyAt = Time.time + 0.5f;   // not while it's still popping in (the hand that opened it is right there)
            CardInput.Register(b);
            return b;
        }

        public void Hover(bool on) { if (this != null) transform.localScale = _scale * (on ? 1.25f : 1f); }

        // is a point (a fingertip) inside the button's press zone?
        public bool Contains(Vector3 p) => Collider != null && Collider.enabled && Collider.gameObject.activeInHierarchy &&
            Vector3.Distance(Collider.bounds.center, p) < ((SphereCollider)Collider).radius * Mathf.Max(transform.lossyScale.x, 1e-4f);
        float _readyAt;
        public bool Ready => Time.time >= _readyAt;
        public void Press() { Sfx.Press(transform.position); OnPress?.Invoke(); }
        void OnDestroy() => CardInput.Unregister(this);
    }
}
