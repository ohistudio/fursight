using TMPro;
using UnityEngine;

namespace FurSight
{
    // FurSight's look: bold flat colour on white, chunky rounded cards with a darker lip, Nunito.
    public static class Theme
    {
        public static readonly Color Fern = Hex("#3DBE6B"), FernLip = Hex("#2A9A52");
        public static readonly Color Sun = Hex("#FFB627"), SunLip = Hex("#D9900A");
        public static readonly Color Coral = Hex("#FF4D5E"), CoralLip = Hex("#D93545");
        public static readonly Color Sky = Hex("#2FA8F5"), SkyLip = Hex("#1E86C9");
        public static readonly Color Grape = Hex("#9B6CF0"), GrapeLip = Hex("#7A4ED1");
        public static readonly Color Ink = Hex("#2B2A33"), Muted = Hex("#6B6977"), Card = Hex("#FFFFFF"), CardLip = Hex("#E4E1EA");

        public static (Color main, Color lip) For(string verdict) =>
            verdict == "safe" ? (Fern, FernLip) : verdict == "caution" ? (Sun, SunLip) : verdict == "toxic" || verdict == "vet" ? (Coral, CoralLip) :
            verdict == "answer" ? (Grape, GrapeLip) : verdict == "linked" ? (Fern, FernLip) : (Sky, SkyLip);

        public static string Word(string verdict) =>
            verdict == "safe" ? "Safe" : verdict == "caution" ? "Small treat only" : verdict == "toxic" ? "Don't" :
            verdict == "vet" ? "See a vet today" : verdict == "saved" ? "Saved to the diary" : verdict == "linked" ? "All set" : "";

        static TMP_FontAsset _black, _bold;
        public static TMP_FontAsset Black => _black ??= Resources.Load<TMP_FontAsset>("Fonts/Nunito-900 SDF");
        public static TMP_FontAsset Bold => _bold ??= Resources.Load<TMP_FontAsset>("Fonts/Nunito-800 SDF");

        static Color Hex(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }
    }
}
