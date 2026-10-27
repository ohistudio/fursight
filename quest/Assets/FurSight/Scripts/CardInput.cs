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

        void Update()
        {
            Consumed = false;
            if (_tracking == null) { var rig = FindFirstObjectByType<OVRCameraRig>(); if (rig != null) _tracking = rig.trackingSpace; }

            CardButton hovered = null;
            bool pressed = false;
            foreach (var (ray, press) in Pointers())
            {
                if (!Physics.Raycast(ray, out var hit, 3f) || !_buttons.TryGetValue(hit.collider, out var b)) continue;
                hovered = b;
                if (press) pressed = true;
                break;
            }
            if (hovered != _hover) { if (_hover != null) _hover.Hover(false); if (hovered != null) hovered.Hover(true); _hover = hovered; }
            if (hovered != null && pressed) { Consumed = true; hovered.Press(); _hover = null; }
            Poke();
        }

        // a fingertip pushed into a button presses it once; it has to come out before it can press again
        void Poke()
        {
            CardButton inside = null;
            for (int h = 0; h < 2; h++)
            {
                var hand = Hands.Get(h);
                if (!hand.tracked) continue;
                foreach (var b in _buttons.Values)
                    if (b != null && b.Contains(hand.indexTip)) { inside = b; break; }
                if (inside != null) break;
            }
            if (inside != null && inside != _poked) { Consumed = true; inside.Press(); }
            _poked = inside;
        }

        // every pointer this frame: its ray, and whether it was just pressed
        IEnumerable<(Ray, bool)> Pointers()
        {
            var mouse = Mouse.current;
            if (mouse != null && Camera.main != null && Application.isEditor)
                yield return (Camera.main.ScreenPointToRay(mouse.position.ReadValue()), mouse.leftButton.wasPressedThisFrame);
            if (_tracking == null) yield break;
            foreach (var (c, button) in new[] { (OVRInput.Controller.RTouch, OVRInput.Button.SecondaryIndexTrigger), (OVRInput.Controller.LTouch, OVRInput.Button.PrimaryIndexTrigger) })
            {
                if (!OVRInput.IsControllerConnected(c)) continue;
                var pos = _tracking.TransformPoint(OVRInput.GetLocalControllerPosition(c));
                var rot = _tracking.rotation * OVRInput.GetLocalControllerRotation(c);
                yield return (new Ray(pos, rot * Vector3.forward), OVRInput.GetDown(button));
            }
            for (int h = 0; h < 2; h++)
            {
                var hand = Hands.Get(h);
                bool fresh = hand.tracked && hand.pinching && !_wasPinch[h];
                _wasPinch[h] = hand.tracked && hand.pinching;
                if (hand.tracked && hand.hasAim) yield return (hand.aim, fresh);
            }
        }
    }

    // A round button on a card: grows a little when pointed at, runs its action when pressed.
    public class CardButton : MonoBehaviour
    {
        public Collider Collider { get; private set; }
        public Action OnPress;
        Vector3 _scale;

        public static CardButton Add(GameObject go, float hitRadius, Action onPress)
        {
            var b = go.AddComponent<CardButton>();
            var col = go.AddComponent<SphereCollider>();
            col.radius = hitRadius;
            b.Collider = col;
            b.OnPress = onPress;
            b._scale = go.transform.localScale;
            CardInput.Register(b);
            return b;
        }

        public void Hover(bool on) { if (this != null) transform.localScale = _scale * (on ? 1.25f : 1f); }

        // is a point (a fingertip) inside the button's press zone?
        public bool Contains(Vector3 p) => Collider != null && Collider.enabled && Collider.gameObject.activeInHierarchy &&
            Vector3.Distance(Collider.bounds.center, p) < ((SphereCollider)Collider).radius * Mathf.Max(transform.lossyScale.x, 1e-4f);
        public void Press() { Sfx.Tick(transform.position); OnPress?.Invoke(); }
        void OnDestroy() => CardInput.Unregister(this);
    }
}
