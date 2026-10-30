using UnityEngine;

namespace FurSight
{
    // Small, soft UI sounds synthesised once at startup: no audio files to license or ship.
    // Rounded sine "plops" rather than beeps, played in space at the card so they come from the food.
    public static class Sfx
    {
        const int Rate = 44100;
        static AudioClip _snap, _safe, _treat, _nope, _tick, _open, _close, _hover, _press, _count, _pin;

        public static void Snap(Vector3 at) => Play(_snap ??= Tone("snap", new[] { (1400f, 900f, 0.05f) }, 0.35f), at);
        public static void Tick(Vector3 at) => Play(_tick ??= Tone("tick", new[] { (880f, 880f, 0.04f) }, 0.15f), at);
        // a rising two-note chime
        public static void Safe(Vector3 at) => Play(_safe ??= Tone("safe", new[] { (660f, 660f, 0.11f), (990f, 990f, 0.22f) }, 0.32f), at);
        // one friendly "boop", up then settle
        public static void Treat(Vector3 at) => Play(_treat ??= Tone("treat", new[] { (520f, 700f, 0.09f), (700f, 620f, 0.16f) }, 0.3f), at);
        // a low double "nuh-uh"
        public static void Nope(Vector3 at) => Play(_nope ??= Tone("nope", new[] { (300f, 240f, 0.12f), (0f, 0f, 0.05f), (260f, 190f, 0.18f) }, 0.4f), at);

        // the hand menu: a quick rising pop open, a falling one closed
        public static void Open(Vector3 at) => Play(_open ??= Tone("open", new[] { (520f, 780f, 0.07f), (780f, 1040f, 0.09f) }, 0.22f), at);
        public static void Close(Vector3 at) => Play(_close ??= Tone("close", new[] { (900f, 600f, 0.08f) }, 0.14f), at);
        // pointing at a button: barely there
        public static void Hover(Vector3 at) => Play(_hover ??= Tone("hover", new[] { (1500f, 1600f, 0.025f) }, 0.07f), at);
        // a button pressed: a firm little "tock"
        public static void Press(Vector3 at) => Play(_press ??= Tone("press", new[] { (1200f, 700f, 0.045f), (0f, 0f, 0.015f), (900f, 900f, 0.05f) }, 0.3f), at);
        // countdown: 3, 2, 1
        public static void Count(Vector3 at) => Play(_count ??= Tone("count", new[] { (740f, 740f, 0.07f) }, 0.22f), at);
        // a card landing on something real
        public static void Pin(Vector3 at) => Play(_pin ??= Tone("pin", new[] { (980f, 1300f, 0.05f), (1300f, 1250f, 0.08f) }, 0.2f), at);

        static void Play(AudioClip clip, Vector3 at)
        {
            var go = new GameObject("Sfx " + clip.name);
            go.transform.position = at;
            var src = go.AddComponent<AudioSource>();
            src.clip = clip;
            src.spatialBlend = 0.8f;   // mostly from the card, still audible from anywhere
            src.minDistance = 0.5f;
            src.Play();
            Object.Destroy(go, clip.length + 0.1f);
        }

        // segments of (start Hz, end Hz, seconds); 0 Hz is a rest. Soft attack and release on each.
        static AudioClip Tone(string name, (float f0, float f1, float dur)[] segs, float volume)
        {
            int total = 0;
            foreach (var s in segs) total += Mathf.CeilToInt(s.dur * Rate);
            var data = new float[total];
            int o = 0; double phase = 0;
            foreach (var (f0, f1, dur) in segs)
            {
                int n = Mathf.CeilToInt(dur * Rate);
                for (int i = 0; i < n; i++, o++)
                {
                    float t = i / (float)n;
                    if (f0 <= 0f) { data[o] = 0f; continue; }
                    phase += 2.0 * Mathf.PI * Mathf.Lerp(f0, f1, t) / Rate;
                    float env = Mathf.Min(1f, t * 12f) * Mathf.Pow(1f - t, 1.6f);
                    // sine plus a quiet octave for warmth
                    data[o] = (float)(System.Math.Sin(phase) * 0.85 + System.Math.Sin(phase * 2) * 0.15) * env * volume;
                }
            }
            var clip = AudioClip.Create(name, total, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
