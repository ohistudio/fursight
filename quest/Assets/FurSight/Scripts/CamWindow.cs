using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Video;

namespace FurSight
{
    // The pet cam, floating in front of you: the home webcam's pictures from the FurSight cam relay (cam/ in the
    // repo), pushed over a WebSocket as they arrive (asking for each one costs a round trip: ~2 fps instead of ~6),
    // with polling as the fallback. On a white 3D tile with the camera's name, a live dot and a close key.
    // The relay only sends while someone watches, so opening this wakes the camera at home.
    // With more than one camera, a sky key beside the close key (or V in the editor, or the right thumbstick
    // left/right) switches to the next one.
    public class CamWindow : MonoBehaviour
    {
        const float W = 0.36f, Pic = 0.32f, Thick = 0.012f;
        static CamWindow _open;

        Material _picMat;
        Texture2D _tex;
        TextMeshPro _status, _title;
        Renderer _dot;
        float _lastFrame;
        string _viewer;
        int _frames, _fps;
        float _fpsAt;
        readonly ConcurrentQueue<byte[]> _incoming = new ConcurrentQueue<byte[]>();
        CancellationTokenSource _cts;
        bool _socketOpen;
        VideoPlayer _player;
        RenderTexture _rt;

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
            _viewer = "quest" + UnityEngine.Random.Range(1000, 9999);
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
            _picMat = Shapes.Unlit();
            _picMat.SetColor("_BaseColor", new Color(0.12f, 0.12f, 0.14f));
            pic.GetComponent<Renderer>().material = _picMat;

            float top = h / 2f;
            _dot = Shapes.MakeSlab("Live", tile, Shapes.CircleRing(0.006f), 0.003f, Theme.CardLip, Theme.CardLip, new Vector3(-W / 2f + 0.026f, top - 0.025f, -Thick)).GetComponent<Renderer>();
            _title = Label(tile, FurSightApi.CamName, Theme.Black, 18f, Theme.Ink, new Vector3(-W / 2f + 0.04f, top - 0.025f, -Thick - 0.001f), 0.17f);
            _status = Label(tile, "connecting", Theme.Bold, 13f, Theme.Muted, new Vector3(W / 2f - 0.17f, top - 0.025f, -Thick - 0.001f), 0.09f);
            _status.alignment = TextAlignmentOptions.MidlineRight;

            var x = new GameObject("Close").transform;
            x.SetParent(tile, false);
            x.localPosition = new Vector3(W / 2f - 0.022f, top - 0.025f, -Thick);
            Shapes.MakeSlab("Key", x, Shapes.CircleRing(0.011f), 0.004f, Theme.CardLip, Theme.Muted, Vector3.zero);
            Shapes.MakeSlab("X1", x, Shapes.RoundedRectRing(0.011f, 0.0026f, 0.0013f), 0.0015f, Theme.Muted, Theme.Muted, Vector3.back * 0.004f, 45f);
            Shapes.MakeSlab("X2", x, Shapes.RoundedRectRing(0.011f, 0.0026f, 0.0013f), 0.0015f, Theme.Muted, Theme.Muted, Vector3.back * 0.004f, -45f);
            CardButton.Add(x.gameObject, 0.018f, Close);

            // next camera: only when there's more than one
            if (HubClient.Cams != null && HubClient.Cams.Count > 1)
            {
                var n = new GameObject("Next cam").transform;
                n.SetParent(tile, false);
                n.localPosition = new Vector3(W / 2f - 0.052f, top - 0.025f, -Thick);
                Shapes.MakeSlab("Key", n, Shapes.CircleRing(0.011f), 0.004f, Theme.Sky, Theme.SkyLip, Vector3.zero);
                var arrow = Label(n, "›", Theme.Black, 20f, Theme.Ink, new Vector3(-0.006f, 0.001f, -0.0045f), 0.012f);
                arrow.alignment = TextAlignmentOptions.Center;
                CardButton.Add(n.gameObject, 0.018f, () => Switch(1));
            }

            StartCoroutine(Juice.Pop(transform, 0f, 0.3f));
            Sfx.Tick(transform.position);
            Connect();
        }

        // a live cam: its pictures from the relay; a recording: the clip itself, played here at full frame rate
        void Connect()
        {
            if (!string.IsNullOrEmpty(FurSightApi.CamClip)) { PlayClip(FurSightApi.CamClip); return; }
            if (!string.IsNullOrEmpty(FurSightApi.CamChannel)) { _ = Socket(); StartCoroutine(FallbackIfNoSocket()); }
            else _status.text = "no camera linked";
        }

        void PlayClip(string url)
        {
            if (_player == null)
            {
                _player = gameObject.AddComponent<VideoPlayer>();
                _player.playOnAwake = false; _player.isLooping = true; _player.audioOutputMode = VideoAudioOutputMode.None;
                _player.renderMode = VideoRenderMode.RenderTexture;
                _rt = new RenderTexture(480, 480, 0);
                _player.targetTexture = _rt;
                _player.prepareCompleted += (vp) => { vp.Play(); _picMat.SetTexture("_BaseMap", _rt); _picMat.SetColor("_BaseColor", Color.white); };
            }
            _player.source = VideoSource.Url; _player.url = url; _player.Prepare();
        }

        void StopClip() { if (_player != null) { _player.Stop(); _player.url = null; } }

        // show the next camera: drop the old connection, start on the new one
        void Switch(int step)
        {
            if (!HubClient.NextCam(step)) return;
            _cts?.Cancel();
            StopAllCoroutines();
            while (_incoming.TryDequeue(out _)) { }
            _socketOpen = false; _lastFrame = 0f;
            _picMat.SetColor("_BaseColor", new Color(0.12f, 0.12f, 0.14f));
            _title.text = FurSightApi.CamName;
            Sfx.Tick(transform.position);
            StopClip();
            Connect();
            Status();
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
            Theme.Occlude(t);
            t.rectTransform.sizeDelta = new Vector2(width * 100f, 3f);
            return t;
        }

        // frames pushed by the relay, received off the main thread and handed over through a queue
        async Task Socket()
        {
            _cts = new CancellationTokenSource();
            var url = new Uri(FurSightApi.CamRelay.Replace("https://", "wss://").TrimEnd('/') + "/c/" + FurSightApi.CamChannel + "/watch");
            using (var ws = new ClientWebSocket())
            {
                try
                {
                    await ws.ConnectAsync(url, _cts.Token);
                    _socketOpen = true;
                    var buf = new byte[512 * 1024];
                    while (ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
                    {
                        int got = 0;
                        WebSocketReceiveResult r;
                        do
                        {
                            r = await ws.ReceiveAsync(new ArraySegment<byte>(buf, got, buf.Length - got), _cts.Token);
                            got += r.Count;
                        } while (!r.EndOfMessage && got < buf.Length);
                        if (r.MessageType == WebSocketMessageType.Binary && got > 0)
                        {
                            var frame = new byte[got];
                            Buffer.BlockCopy(buf, 0, frame, 0, got);
                            while (_incoming.Count > 1) _incoming.TryDequeue(out _);   // only the newest matters
                            _incoming.Enqueue(frame);
                        }
                    }
                }
                catch (Exception e) { if (!_cts.IsCancellationRequested) Debug.LogWarning("[FurSight] pet cam socket: " + e.Message); }
            }
        }

        IEnumerator FallbackIfNoSocket()
        {
            yield return new WaitForSeconds(4f);
            if (!_socketOpen) StartCoroutine(Pull());
        }

        void Update()
        {
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb != null && kb.vKey.wasPressedThisFrame) Switch(1);
            if (OVRInput.GetDown(OVRInput.Button.SecondaryThumbstickRight)) Switch(1);
            if (OVRInput.GetDown(OVRInput.Button.SecondaryThumbstickLeft)) Switch(-1);
            if (_incoming.TryDequeue(out var jpg))
            {
                if (_tex == null) _tex = new Texture2D(2, 2, TextureFormat.RGB24, false);
                if (_tex.LoadImage(jpg, false)) { _picMat.SetTexture("_BaseMap", _tex); _picMat.SetColor("_BaseColor", Color.white); _lastFrame = Time.time; _frames++; }
            }
            if (Time.time - _fpsAt >= 1f) { _fps = _frames; _frames = 0; _fpsAt = Time.time; Status(); }
        }

        void Status()
        {
            if (_status == null) return;
            if (_player != null && _player.isPlaying) { _status.text = (HubClient.Cams != null && HubClient.Cams.Count > 1 ? $"{HubClient.CamIndex() + 1}/{HubClient.Cams.Count} · " : "") + "recording"; _dot.sharedMaterial = Shapes.Flat(Theme.Coral); return; }
            bool live = _lastFrame > 0f && Time.time - _lastFrame < 3f;
            var cams = HubClient.Cams;
            string which = cams != null && cams.Count > 1 ? $"{HubClient.CamIndex() + 1}/{cams.Count} · " : "";
            _status.text = which + (live ? _fps + " fps" : _lastFrame > 0f ? "paused" : "waking");
            _dot.sharedMaterial = Shapes.Flat(live ? Theme.Coral : Theme.CardLip);
        }

        // fallback: ask for the latest picture back to back; the relay says how old it is
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
                        _frames++;
                    }
                    else yield return new WaitForSeconds(0.25f);
                }
            }
        }

        public void Close()
        {
            if (_open == this) _open = null;
            _cts?.Cancel();
            StopAllCoroutines();
            StartCoroutine(Juice.ShrinkAway(transform));
        }

        void OnDestroy() { _cts?.Cancel(); if (_tex != null) Destroy(_tex); if (_rt != null) _rt.Release(); if (_open == this) _open = null; }
    }
}
