using UnityEngine;

namespace FurSight
{
    // His stickers come alive: a slow sway and bob, a little breathing, and every few seconds a hop, sometimes with
    // a twist in the air like a binky (squash, up, spin, land, squash). Goes on a wrapper between the sticker's
    // holder (which pops in) and the picture (which is sized to fit), so neither fights it.
    public class Wiggle : MonoBehaviour
    {
        float _size, _phase, _nextHop, _hopAt = -9f;
        bool _twist;
        const float HopTime = 0.55f;

        /// wrap a new child of parent that wiggles; put the sticker's picture inside it. size: the sticker's width (m)
        public static Transform Make(Transform parent, float size)
        {
            var t = new GameObject("Wiggle").transform;
            t.SetParent(parent, false);
            var w = t.gameObject.AddComponent<Wiggle>();
            w._size = size;
            w._phase = Random.value * 10f;
            w._nextHop = Time.time + Random.Range(1.6f, 4f);
            return t;
        }

        void Update()
        {
            float t = Time.time + _phase;
            // idle: sway, bob, breathe
            float sway = Mathf.Sin(t * 1.3f) * 5f, bob = Mathf.Sin(t * 2.1f) * 0.035f * _size, breathe = 1f + Mathf.Sin(t * 2.6f) * 0.025f;
            Vector3 scale = new Vector3(breathe, 2f - breathe, 1f);
            float spin = 0f;
            if (Time.time >= _nextHop && _hopAt < 0f) { _hopAt = Time.time; _twist = Random.value < 0.4f; }
            if (_hopAt >= 0f)
            {
                float k = (Time.time - _hopAt) / HopTime;
                if (k >= 1f) { _hopAt = -9f; _nextHop = Time.time + Random.Range(3.5f, 6.5f); }
                else if (k < 0.18f) { float s = Mathf.Sin(k / 0.18f * Mathf.PI); scale = new Vector3(1f + 0.14f * s, 1f - 0.16f * s, 1f); }   // crouch
                else if (k < 0.82f)
                {
                    float a = (k - 0.18f) / 0.64f;   // in the air
                    bob += Mathf.Sin(a * Mathf.PI) * 0.22f * _size;
                    scale = new Vector3(0.94f, 1.08f, 1f);
                    if (_twist) spin = Mathf.SmoothStep(0f, 360f, a);
                    sway += Mathf.Sin(a * Mathf.PI * 2f) * 9f;
                }
                else { float s = Mathf.Sin((k - 0.82f) / 0.18f * Mathf.PI); scale = new Vector3(1f + 0.12f * s, 1f - 0.12f * s, 1f); }   // land
            }
            transform.localPosition = new Vector3(0f, bob, 0f);
            transform.localRotation = Quaternion.Euler(0f, spin, sway);
            transform.localScale = scale;
        }
    }
}
