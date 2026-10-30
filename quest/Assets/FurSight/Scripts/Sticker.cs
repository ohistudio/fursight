using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace FurSight
{
    // A die-cut sticker of him from a pet cam picture, like the app's (public/sticker.js): SAM 3.1 outlines him
    // (/api/sticker), then the picture is cut to that outline and given a thick white border. Done here on the
    // headset, so the server needs no image library. null if he wasn't found.
    public static class Sticker
    {
        public static async Task<Texture2D> Make(string photoDataUrl)
        {
            var res = await FurSightApi.Post("/api/sticker", new { image = photoDataUrl }, 30);
            var m = res["mask"] as JObject;
            if (m == null) return null;
            var photo = new Texture2D(2, 2);
            if (!photo.LoadImage(System.Convert.FromBase64String(photoDataUrl.Substring(photoDataUrl.IndexOf(',') + 1)))) return null;
            return Cut(photo, m);
        }

        static Texture2D Cut(Texture2D photo, JObject m)
        {
            int mw = (int)m["w"], mh = (int)m["h"], mx = (int)m["x"], my = (int)m["y"];
            float sx = photo.width / (float)(int)m["image"]["w"], sy = photo.height / (float)(int)m["image"]["h"];
            var bits = System.Convert.FromBase64String((string)m["bits"]);
            int border = Mathf.Max(3, Mathf.RoundToInt(Mathf.Max(mw, mh) * 0.045f)), pad = border + 2;
            int w = mw + pad * 2, h = mh + pad * 2;

            // his silhouette (row 0 at the top, as the mask comes), then a disc stamped on every edge pixel for the border
            var inside = new bool[w * h];
            for (int y = 0; y < mh; y++) for (int x = 0; x < mw; x++) inside[(y + pad) * w + x + pad] = bits[y * mw + x] != 0;
            var white = new bool[w * h];
            var disc = new List<Vector2Int>();
            for (int dy = -border; dy <= border; dy++) for (int dx = -border; dx <= border; dx++) if (dx * dx + dy * dy <= border * border) disc.Add(new Vector2Int(dx, dy));
            for (int y = 1; y < h - 1; y++)
                for (int x = 1; x < w - 1; x++)
                {
                    int i = y * w + x;
                    if (!inside[i] || (inside[i - 1] && inside[i + 1] && inside[i - w] && inside[i + w])) continue;
                    foreach (var d in disc)
                    {
                        int px = x + d.x, py = y + d.y;
                        if (px >= 0 && py >= 0 && px < w && py < h) white[py * w + px] = true;
                    }
                }

            var src = photo.GetPixels32();
            var outPx = new Color32[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    int i = y * w + x, o = (h - 1 - y) * w + x;   // textures fill from the bottom row up
                    if (inside[i])
                    {
                        int px = Mathf.Clamp(Mathf.RoundToInt((mx + x - pad) * sx), 0, photo.width - 1);
                        int py = Mathf.Clamp(Mathf.RoundToInt((my + y - pad) * sy), 0, photo.height - 1);
                        outPx[o] = src[(photo.height - 1 - py) * photo.width + px];
                        outPx[o].a = 255;
                    }
                    else outPx[o] = white[i] ? new Color32(255, 255, 255, 255) : new Color32(255, 255, 255, 0);
                }
            Object.Destroy(photo);
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            tex.SetPixels32(outPx);
            tex.Apply();
            return tex;
        }
    }
}
