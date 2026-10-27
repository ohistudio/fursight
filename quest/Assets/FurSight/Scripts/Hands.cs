using UnityEngine;
using UnityEngine.InputSystem;

namespace FurSight
{
    // Where the hands are, for UI: palm position and which way it faces, index fingertip, pinch.
    // Read from Meta's hand skeletons (OVRSkeleton + OVRHand on the rig's hand anchors), once per frame on demand.
    // Ported from Roll's RollHands. Palm convention: normal points out of the palm.
    // Editor, no hands: hold L for a left palm turned towards you under the mouse (opens the palm menu),
    // hold O for a right fingertip poking whatever is under the mouse.
    public static class Hands
    {
        public const int Left = 0, Right = 1;

        public struct Hand
        {
            public bool tracked;
            public Vector3 palm, normal, indexTip;
            public bool pinching;          // thumb and index together (with hysteresis)
            public float pinchStrength;    // 0 open to 1 tips together
            public Vector3 pinchPoint;     // between the two tips
            public bool hasAim;            // Meta's pointer pose: the system ray
            public Ray aim;
        }

        static readonly Hand[] s_hands = new Hand[2];
        static int s_frame = -1;
        static readonly OVRSkeleton[] s_meta = new OVRSkeleton[2];
        static readonly bool[] s_wasPinching = new bool[2];
        static float s_lookAt;

        public static Hand Get(int i) { Refresh(); return s_hands[i]; }

        static void Refresh()
        {
            if (s_frame == Time.frameCount) return;
            s_frame = Time.frameCount;
            s_hands[0].tracked = s_hands[1].tracked = false;
            ReadMeta();
            if (Application.isEditor) FakeHands();
        }

        static void ReadMeta()
        {
            if ((s_meta[0] == null || s_meta[1] == null) && Time.unscaledTime >= s_lookAt)
            {
                s_lookAt = Time.unscaledTime + 1f;
                foreach (var sk in Object.FindObjectsByType<OVRSkeleton>(FindObjectsSortMode.None))
                    s_meta[sk.GetSkeletonType() == OVRSkeleton.SkeletonType.XRHandRight ? 1 : 0] = sk;
            }
            for (int i = 0; i < 2; i++)
            {
                var sk = s_meta[i];
                if (sk == null || !sk.isActiveAndEnabled || !sk.IsInitialized || !sk.IsDataValid) continue;
                Transform palm = null, tip = null, wrist = null, indexK = null, littleK = null, thumb = null;
                foreach (var b in sk.Bones)
                    switch (b.Id)
                    {
                        case OVRSkeleton.BoneId.XRHand_Palm: palm = b.Transform; break;
                        case OVRSkeleton.BoneId.XRHand_IndexTip: tip = b.Transform; break;
                        case OVRSkeleton.BoneId.XRHand_Wrist: wrist = b.Transform; break;
                        case OVRSkeleton.BoneId.XRHand_IndexProximal: indexK = b.Transform; break;
                        case OVRSkeleton.BoneId.XRHand_LittleProximal: littleK = b.Transform; break;
                        case OVRSkeleton.BoneId.XRHand_ThumbTip: thumb = b.Transform; break;
                    }
                if (palm == null || wrist == null || indexK == null || littleK == null) continue;
                Vector3 across = Vector3.Cross(indexK.position - wrist.position, littleK.position - wrist.position).normalized;
                var ovr = sk.GetComponent<OVRHand>();
                float strength = ovr != null ? ovr.GetFingerPinchStrength(OVRHand.HandFinger.Index) : 0f;
                bool pinch = s_wasPinching[i] ? strength > 0.45f : strength > 0.85f;
                s_wasPinching[i] = pinch;
                Vector3 tipPos = tip != null ? tip.position : palm.position;
                s_hands[i] = new Hand
                {
                    tracked = true,
                    palm = palm.position,
                    normal = i == Right ? -across : across,
                    indexTip = tipPos,
                    pinching = pinch,
                    pinchStrength = strength,
                    pinchPoint = thumb != null ? (thumb.position + tipPos) * 0.5f : tipPos,
                    // the system ray, only while tracked well (it can snap back to the head when tracking drops)
                    hasAim = ovr != null && ovr.IsTracked && ovr.IsPointerPoseValid && ovr.PointerPose != null
                             && Vector3.Distance(ovr.PointerPose.position, palm.position) < 0.35f,
                    aim = ovr != null && ovr.PointerPose != null ? new Ray(ovr.PointerPose.position, ovr.PointerPose.forward) : default,
                };
            }
        }

        static void FakeHands()
        {
            var kb = Keyboard.current; var mouse = Mouse.current; var cam = Camera.main;
            if (kb == null || mouse == null || cam == null) return;
            var ray = cam.ScreenPointToRay(mouse.position.ReadValue());
            if (kb.lKey.isPressed && !s_hands[Left].tracked)
            {
                Vector3 palm = cam.transform.position + cam.transform.forward * 0.38f - cam.transform.up * 0.14f - cam.transform.right * 0.08f;
                s_hands[Left] = new Hand { tracked = true, palm = palm, normal = (cam.transform.position - palm).normalized, indexTip = palm + Vector3.up * 0.08f, pinchPoint = palm + Vector3.up * 0.07f };
            }
            if (kb.oKey.isPressed && !s_hands[Right].tracked && Physics.Raycast(ray, out RaycastHit hit, 5f, ~0, QueryTriggerInteraction.Collide))
            {
                Vector3 tip = hit.point + ray.direction * 0.004f;
                s_hands[Right] = new Hand { tracked = true, palm = tip - ray.direction * 0.09f, normal = Vector3.down, indexTip = tip, pinchPoint = tip - ray.direction * 0.02f };
            }
        }
    }
}
