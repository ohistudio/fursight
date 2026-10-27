using System.Collections;
using UnityEngine;

namespace FurSight
{
    // The feel-good bits: overshoot pop-ins, a "no" shake, a little sparkle burst, and controller buzzes.
    public static class Juice
    {
        public static float OutBack(float t, float s = 1.9f) { t -= 1f; return t * t * ((s + 1f) * t + s) + 1f; }
        public static float OutCubic(float t) { t = 1f - t; return 1f - t * t * t; }

        public static IEnumerator Pop(Transform t, float delay, float duration = 0.32f, float overshoot = 1.9f)
        {
            var target = t.localScale;
            t.localScale = Vector3.zero;
            if (delay > 0f) yield return new WaitForSeconds(delay);
            for (float e = 0f; e < duration; e += Time.deltaTime)
            {
                if (t == null) yield break;
                t.localScale = target * OutBack(e / duration, overshoot);
                yield return null;
            }
            if (t != null) t.localScale = target;
        }

        // grows a stem along local +Y from 0 to its full height
        public static IEnumerator Grow(Transform t, float delay, float duration = 0.14f)
        {
            var target = t.localScale;
            t.localScale = new Vector3(target.x, 0f, target.z);
            if (delay > 0f) yield return new WaitForSeconds(delay);
            for (float e = 0f; e < duration; e += Time.deltaTime)
            {
                if (t == null) yield break;
                t.localScale = new Vector3(target.x, target.y * OutCubic(e / duration), target.z);
                yield return null;
            }
            if (t != null) t.localScale = target;
        }

        // a firm side-to-side "no", fading out
        public static IEnumerator Shake(Transform t, float delay, float amount = 0.012f, float duration = 0.42f)
        {
            if (delay > 0f) yield return new WaitForSeconds(delay);
            var home = t.localPosition;
            for (float e = 0f; e < duration; e += Time.deltaTime)
            {
                if (t == null) yield break;
                float k = 1f - e / duration;
                t.localPosition = home + Vector3.right * Mathf.Sin(e * 46f) * amount * k;
                yield return null;
            }
            if (t != null) t.localPosition = home;
        }

        public static IEnumerator ShrinkAway(Transform t, float duration = 0.18f)
        {
            var from = t.localScale;
            for (float e = 0f; e < duration; e += Time.deltaTime)
            {
                if (t == null) yield break;
                t.localScale = from * (1f - e / duration);
                yield return null;
            }
            if (t != null) Object.Destroy(t.gameObject);
        }

        // a handful of small dots that burst outwards and fade, in the card's plane
        public static IEnumerator Sparkle(Transform parent, Vector3 centre, Color a, Color b, float delay, int count = 9, float radius = 0.06f)
        {
            if (delay > 0f) yield return new WaitForSeconds(delay);
            if (parent == null) yield break;
            var bits = new Transform[count];
            var dirs = new Vector3[count];
            for (int i = 0; i < count; i++)
            {
                float ang = (i / (float)count) * Mathf.PI * 2f + Random.Range(-0.25f, 0.25f);
                dirs[i] = new Vector3(Mathf.Cos(ang), Mathf.Sin(ang), 0f) * radius * Random.Range(0.75f, 1.15f);
                bits[i] = Shapes.Make("Sparkle", parent, Shapes.Circle(Random.Range(0.004f, 0.007f), 16), i % 2 == 0 ? a : b, centre + Vector3.back * 0.002f).transform;
            }
            const float dur = 0.55f;
            for (float e = 0f; e < dur; e += Time.deltaTime)
            {
                float k = OutCubic(e / dur);
                for (int i = 0; i < count; i++)
                {
                    if (bits[i] == null) continue;
                    bits[i].localPosition = centre + dirs[i] * k + Vector3.back * 0.002f;
                    bits[i].localScale = Vector3.one * (1f - e / dur);
                }
                yield return null;
            }
            foreach (var bit in bits) if (bit != null) Object.Destroy(bit.gameObject);
        }

        public static IEnumerator Buzz(float strength, float seconds)
        {
            OVRInput.SetControllerVibration(1f, strength, OVRInput.Controller.Touch);
            yield return new WaitForSeconds(seconds);
            OVRInput.SetControllerVibration(0f, 0f, OVRInput.Controller.Touch);
        }
    }
}
