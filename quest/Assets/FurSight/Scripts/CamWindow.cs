using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;

namespace FurSight
{
    // The pet cam, floating in front of you: the home webcam's latest pictures from the FurSight cam relay
    // (cam/ in the repo), a few times a second, on a white 3D tile with the camera's name, a live dot and a close key.
    // The relay only sends while someone watches, so opening this wakes the camera at home.
    public class CamWindow : MonoBehaviour
    {
        const float W = 0.36f, Pic = 0.32f, Thick = 0.012f;
        static CamWindow _open;

        Material _picMat;
        Texture2D _tex;
        TextMeshPro _status;
        Renderer _dot;
        float _lastFrame;
        string _viewer;

        public static void Toggle()
        {
            if (_open != null) { _open.Close(); return; }
            if (string.IsNullOrEmpty(FurSightApi.CamChannel)) { Debug.LogWarning("[FurSight] no pet cam linked"); }
            var head = Camera.main.transform;
            var flat = Vector3.ProjectOnPlane(head.forward, Vector3.up).normalized;
            var go = new GameObject("Pet Cam");
            // a little to the right of where you're looking, so it doesn't cover the room
            var side = Vector3.Cross(Vector3.up, flat);
            go.transform.position = head.position + flat * 0.55f + side * 0.14f + Vector3.down * 0.04f;
            go.transform.rotation = Quaternion.LookRotation(go.transform.position - head.position, Vector3.up);
            _open = go.AddComponent<CamWindow>();
        }

        void Start()
        {
            _viewer = "quest" + Random.Range(1000, 9999);
            float h = Pic + 0.07f;
            var tile = new GameObject("Tile").transform;
            tile.SetParent(transform, false);
            Shapes.MakeSlab("Lip", tile, Shapes.RoundedRectRing(W, h, 0.03f), Thick, Theme.SunLip, Theme.SunLip, new Vector3(0f, -0.008f, 0.003f));
            Shapes.MakeSlab("Face", tile, Shapes.RoundedRectRing(W, h, 0.03f), Thick, Theme.Card, Theme.CardLip, Vector3.zero);

            // the picture: a square quad on the front face (the relay sends 480x480 squares)
            var pic = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(pic.GetComponent<Collider>());
            pic.transform.SetParent(tile, false);
            pic.transform.localPosition = new Vector3(0f, -0.02f, -Thick - 0.0005f);
            pic.transform.localScale = new Vector3(Pic, Pic, 1f);
            _picMat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            _picMat.SetColor("_BaseColor", new Color(0.12f, 0.12f, 0.14f));
            pic.GetComponent<Renderer>().material = _picMat;

            float top = h / 2f;
            _dot = Shapes.MakeSlab("Live", tile, Shapes.CircleRing(0.006f), 0.003f, Theme.CardLip, Theme.CardLip, new Vector3(-W / 2f + 0.026f, top - 0.025f, -Thick)).GetComponent<Renderer>();
            var title = Label(tile, FurSightApi.CamName, Theme.Black, 18f, Theme.Ink, new Vector3(-W / 2f + 0.04f, top - 0.025f, -Thick - 0.001f), 0.2f);
            _status = Label(tile, "connecting", Theme.Bold, 13f, Theme.Muted, new Vector3(W / 2f - 0.14f, top - 0.025f, -Thick - 0.001f), 0.09f);
            _status.alignment = TextAlignmentOptions.MidlineRight;

            var x = new GameObject("Close").transform;
            x.SetParent(tile, false);
            x.localPosition = new Vector3(W / 2f - 0.022f, top - 0.025f, -Thick);
            Shapes.MakeSlab("Key", x, Shapes.CircleRing(0.011f), 0.004f, Theme.CardLip, Theme.Muted, Vector3.zero);
            Shapes.MakeSlab("X1", x, Shapes.RoundedRectRing(0.011f, 0.0026f, 0.0013f), 0.0015f, Theme.Muted, Theme.Muted, Vector3.back * 0.004f, 45f);
            Shapes.MakeSlab("X2", x, Shapes.RoundedRectRing(0.011f, 0.0026f, 0.0013f), 0.0015f, Theme.Muted, Theme.Muted, Vector3.back * 0.004f, -45f);
            CardButton.Add(x.gameObject, 0.018f, Close);

            StartCoroutine(Juice.Pop(transform, 0f, 0.3f));
            Sfx.Tick(transform.position);
            if (!string.IsNullOrEmpty(FurSightApi.CamChannel)) StartCoroutine(Pull());
            else _status.text = "no camera linked";
        }

        static TextMeshPro Label(Transform parent, string s, TMP_FontAsset font, float size, Color col, Vector3 leftMid, float width)
        {
            var t = new GameObject("Text").AddComponent<TextMeshPro>();
            t.transform.SetParent(parent, false);
            t.transform.localScale = Vector3.one * 0.01f;
            t.transform.localPosition = leftMid + Vector3.right * width / 2f;
            if (font != null) t.font = font;
            t.text = s; t.fontSize = size; t.color = col;
            t.alignment = TextAlignmentOptions.MidlineLeft;
            t.textWrappingMode = TextWrappingModes.NoWrap;
            t.overflowMode = TextOverflowModes.Ellipsis;
            t.rectTransform.sizeDelta = new Vector2(width * 100f, 3f);
            return t;
        }

        // the latest picture, about 6 times a second; the relay says how old it is
        IEnumerator Pull()
        {
            string url = FurSightApi.CamRelay.TrimEnd('/') + "/c/" + FurSightApi.CamChannel + "/frame.jpg?v=" + _viewer;
            while (true)
            {
                using (var req = UnityWebRequestTexture.GetTexture(url + "&t=" + Time.frameCount, true))
                {
                    req.timeout = 5;
                    yield return req.SendWebRequest();
                    if (req.result == UnityWebRequest.Result.Success && req.responseCode == 200 &&
                        float.TryParse(req.GetResponseHeader("x-frame-age"), out float age) && age < 3000f)
                    {
                        var tex = DownloadHandlerTexture.GetContent(req);
                        if (_tex != null) Destroy(_tex);
                        _tex = tex;
                        _picMat.SetTexture("_BaseMap", _tex);
                        _picMat.SetColor("_BaseColor", Color.white);
                        _lastFrame = Time.time;
                    }
                }
                bool live = _lastFrame > 0f && Time.time - _lastFrame < 3f;
                _status.text = live ? "live" : _lastFrame > 0f ? "paused" : "waking the camera";
                _dot.sharedMaterial = Shapes.Flat(live ? Theme.Coral : Theme.CardLip);
                yield return new WaitForSeconds(0.15f);
            }
        }

        public void Close()
        {
            if (_open == this) _open = null;
            StopAllCoroutines();
            StartCoroutine(Juice.ShrinkAway(transform));
        }

        void OnDestroy() { if (_tex != null) Destroy(_tex); if (_open == this) _open = null; }
    }
}
