using System;
using UnityEngine;

namespace FurSight
{
    // One still from what the wearer sees, with everything needed to put an answer back into the room later.
    // A server answer takes seconds and the head moves meanwhile, so a Snapshot keeps the camera's pose at the
    // moment of capture, and the live depth along a grid of rays from that pose (what was where, then).
    public class Snapshot
    {
        public byte[] jpeg;
        public Pose pose;
        public Func<Vector2, Pose, Ray> rayFor;       // viewport (0-1, origin bottom-left) -> ray from the camera at `pose`
        public Vector2[] gridPoints;                  // viewport points that were depth-sampled
        public float[] gridDepth;                     // metres along each ray, or -1 where depth had nothing

        public Ray Ray(Vector2 viewport) => rayFor(viewport, pose);

        // Where something in the frame was, in the room. box is [x1,y1,x2,y2] on a 0-1000 grid, origin top-left
        // (how the models report it). Held food is the nearest thing in its box, so it takes the closest depth
        // sample inside the box; with none inside, the nearest sample to the middle; with no depth, a guess.
        public Vector3 WorldPoint(int[] box, float fallback = 0.45f)
        {
            var c = new Vector2((box[0] + box[2]) / 2000f, 1f - (box[1] + box[3]) / 2000f);
            Rect r = Rect.MinMaxRect(box[0] / 1000f, 1f - box[3] / 1000f, box[2] / 1000f, 1f - box[1] / 1000f);
            float best = -1f, nearestGap = float.MaxValue, nearestDepth = -1f;
            for (int i = 0; i < gridPoints.Length; i++)
            {
                if (gridDepth[i] <= 0f) continue;
                if (r.Contains(gridPoints[i]) && (best < 0f || gridDepth[i] < best)) best = gridDepth[i];
                float gap = (gridPoints[i] - c).sqrMagnitude;
                if (gap < nearestGap) { nearestGap = gap; nearestDepth = gridDepth[i]; }
            }
            float d = best > 0f ? best : nearestDepth > 0f ? nearestDepth : fallback;
            // a ray through the middle of the box ends at that depth (depth samples are along their own rays,
            // close enough at these angles)
            return Ray(c).GetPoint(Mathf.Clamp(d, 0.15f, 4f));
        }
    }

    // The camera behind every check. On Quest: the headset's own passthrough camera (MRUK's
    // PassthroughCameraAccess, needs horizonos.permission.HEADSET_CAMERA) with its real lens and pose, and the
    // live depth for distances. In the editor: the Mac's webcam, rays from the main camera, no depth.
    public class PetCamera : MonoBehaviour
    {
        public int sendSize = 512;      // longest side of the JPEG sent to the server (512 is plenty for food, half the upload of 768)
        public int jpegQuality = 75;
#if UNITY_EDITOR
        // Editor only: a "fake passthrough". A test photo hangs in front of the camera and is what gets sent, and
        // answers are mapped back onto it, so a card lands on the strawberry in the picture. N / B step through
        // Assets/FurSight/Editor/TestImages. Off: the Mac's webcam, with answers at arm's length.
        [Header("Editor testing")]
        public bool editorUsePhotos = true;
        public Texture2D editorTestImage;
        public float editorPhotoDistance = 0.6f;
        const string TestFolder = "Assets/FurSight/Editor/TestImages";
        System.Collections.Generic.List<Texture2D> _photos;
        Transform _backdrop;
        Material _backdropMat;
        Vector2 _photoSize;
#endif
        const int Grid = 9;             // 9x9 depth samples per snapshot

        public static PetCamera Instance { get; private set; }
        public bool Ready => Source() != null;

#if UNITY_ANDROID && !UNITY_EDITOR
        Meta.XR.PassthroughCameraAccess _pca;
        Meta.XR.EnvironmentRaycastManager _depth;
#endif
        WebCamTexture _webcam;
        RenderTexture _rt;
        Texture2D _read;

        void Awake() { Instance = this; }

        void Start()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            Permissions.Ask(Permissions.HeadsetCamera, ok =>
            {
                if (!ok) { Debug.LogWarning("[FurSight] camera permission refused"); return; }
                var go = new GameObject("Passthrough Camera");
                go.SetActive(false);   // set up before it wakes: it starts on enable
                go.transform.SetParent(transform, false);
                _pca = go.AddComponent<Meta.XR.PassthroughCameraAccess>();
                _pca.CameraPosition = Meta.XR.PassthroughCameraAccess.CameraPositionType.Left;
                // the sensor is square; the largest square keeps the whole field of view
                var best = new Vector2Int(1280, 1280);
                int area = 0;
                foreach (var r in Meta.XR.PassthroughCameraAccess.GetSupportedResolutions(Meta.XR.PassthroughCameraAccess.CameraPositionType.Left))
                    if (r.x == r.y && r.x * r.y > area && r.x <= 1600) { area = r.x * r.y; best = r; }
                _pca.RequestedResolution = best;
                go.SetActive(true);
                Debug.Log($"[FurSight] camera {best.x}x{best.y}");
                // one dialog at a time: a second request while the first is up gets dropped
                Permissions.Ask(Permissions.Scene, depthOk =>
                {
                    if (depthOk && Meta.XR.EnvironmentRaycastManager.IsSupported) _depth = gameObject.AddComponent<Meta.XR.EnvironmentRaycastManager>();
                    else Debug.LogWarning("[FurSight] no live depth: answers will float at arm's length");
                });
            });
#else
#if UNITY_EDITOR
            _photos = new System.Collections.Generic.List<Texture2D>();
            foreach (var guid in UnityEditor.AssetDatabase.FindAssets("t:Texture2D", new[] { TestFolder }))
                _photos.Add(UnityEditor.AssetDatabase.LoadAssetAtPath<Texture2D>(UnityEditor.AssetDatabase.GUIDToAssetPath(guid)));
            if (editorUsePhotos && editorTestImage == null && _photos.Count > 0) editorTestImage = _photos[0];
            if (editorUsePhotos && editorTestImage != null) { Debug.Log($"[FurSight] editor photos: {_photos.Count} (N / B to change), showing {editorTestImage.name}"); return; }
#endif
            if (WebCamTexture.devices.Length == 0) { Debug.LogWarning("[FurSight] no webcam"); return; }
            _webcam = new WebCamTexture(WebCamTexture.devices[0].name, 1280, 720, 30);
            _webcam.Play();
#endif
        }

        Texture Source()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            return _pca != null && _pca.IsPlaying ? _pca.GetTexture() : null;
#else
#if UNITY_EDITOR
            if (PhotoMode) return editorTestImage;
#endif
            return _webcam != null && _webcam.width > 16 ? _webcam : null;
#endif
        }

        // crop: part of the picture to keep, as a viewport rect (0-1, origin bottom-left); null = all of it
        public Snapshot Take(Rect? crop = null)
        {
            var src = Source();
            if (src == null) return null;
            _crop = crop ?? new Rect(0f, 0f, 1f, 1f);
            var shot = new Snapshot();

#if UNITY_ANDROID && !UNITY_EDITOR
            shot.pose = _pca.GetCameraPose();
            var pca = _pca;
            shot.rayFor = (v, p) => pca.ViewportPointToRay(v, p);
#else
#if UNITY_EDITOR
            if (PhotoMode) return TakePhoto(src);   // (photo mode: answers map back onto the test photo)
#endif
            var cam = Camera.main.transform;
            shot.pose = new Pose(cam.position, cam.rotation);
            var main = Camera.main;
            shot.rayFor = (v, p) =>
            {
                // the main camera's lens, from the pose we captured
                var local = main.ViewportPointToRay(new Vector3(v.x, v.y, 0f));
                var dir = p.rotation * (Quaternion.Inverse(main.transform.rotation) * local.direction);
                return new Ray(p.position, dir);
            };
#endif
            shot.jpeg = Jpeg(src);

            // depth, now, along a grid of rays from the capture pose
            shot.gridPoints = new Vector2[Grid * Grid];
            shot.gridDepth = new float[Grid * Grid];
            for (int y = 0, i = 0; y < Grid; y++)
                for (int x = 0; x < Grid; x++, i++)
                {
                    var v = new Vector2((x + 0.5f) / Grid, (y + 0.5f) / Grid);
                    shot.gridPoints[i] = v;
                    shot.gridDepth[i] = -1f;
#if UNITY_ANDROID && !UNITY_EDITOR
                    var ray = shot.Ray(v);
                    if (_depth != null && _depth.Raycast(ray, out var hit, 4f)) shot.gridDepth[i] = Vector3.Distance(ray.origin, hit.point);
#endif
                }
            return shot;
        }

        // metres along a ray to the real room right now, or -1 (no live depth, nothing within 4 m, or the editor)
        public float DepthAlong(Ray ray)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_depth != null && _depth.Raycast(ray, out var hit, 4f)) return Vector3.Distance(ray.origin, hit.point);
#endif
            return -1f;
        }

        Rect _crop = new Rect(0f, 0f, 1f, 1f);

        // the picture (or the cropped part of it): scaled so the long side is sendSize, then JPEG
        byte[] Jpeg(Texture src)
        {
            float cw = src.width * _crop.width, ch = src.height * _crop.height;
            float k = (float)sendSize / Mathf.Max(cw, ch);
            int w = Mathf.Max(8, Mathf.RoundToInt(cw * k)), h = Mathf.Max(8, Mathf.RoundToInt(ch * k));
            if (_rt == null || _rt.width != w || _rt.height != h)
            {
                if (_rt != null) _rt.Release();
                _rt = new RenderTexture(w, h, 0, RenderTextureFormat.ARGB32);
                _read = new Texture2D(w, h, TextureFormat.RGB24, false);
            }
            Graphics.Blit(src, _rt, _crop.size, _crop.position);
            var prev = RenderTexture.active;
            RenderTexture.active = _rt;
            _read.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            _read.Apply(false);
            RenderTexture.active = prev;
            return _read.EncodeToJPG(jpegQuality);
        }

#if UNITY_EDITOR
        bool PhotoMode => editorUsePhotos && editorTestImage != null;

        void Update()
        {
            if (!PhotoMode) { if (_backdrop != null) _backdrop.gameObject.SetActive(false); return; }
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb != null && _photos.Count > 1 && (kb.nKey.wasPressedThisFrame || kb.bKey.wasPressedThisFrame))
            {
                int i = Mathf.Max(0, _photos.IndexOf(editorTestImage)) + (kb.nKey.wasPressedThisFrame ? 1 : -1);
                editorTestImage = _photos[(i + _photos.Count) % _photos.Count];
                Debug.Log("[FurSight] photo: " + editorTestImage.name);
            }
            PlaceBackdrop();
        }

        // the photo, as large as fits the camera's view at editorPhotoDistance, keeping its shape
        void PlaceBackdrop()
        {
            var cam = Camera.main;
            if (cam == null) return;
            if (_backdrop == null)
            {
                var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
                Destroy(q.GetComponent<Collider>());
                q.name = "Editor Photo";
                _backdrop = q.transform;
                _backdropMat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
                q.GetComponent<Renderer>().material = _backdropMat;
            }
            _backdrop.gameObject.SetActive(true);
            _backdrop.SetParent(cam.transform, false);
            float d = editorPhotoDistance;
            float viewH = 2f * d * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad), viewW = viewH * cam.aspect;
            float aspect = (float)editorTestImage.width / editorTestImage.height;
            _photoSize = aspect > viewW / viewH ? new Vector2(viewW, viewW / aspect) : new Vector2(viewH * aspect, viewH);
            _photoSize *= 0.9f;
            _backdrop.localPosition = new Vector3(0f, 0f, d);
            _backdrop.localRotation = Quaternion.identity;
            _backdrop.localScale = new Vector3(_photoSize.x, _photoSize.y, 1f);
            _backdropMat.SetTexture("_BaseMap", editorTestImage);
        }

        // a viewport point of the photo is a point on the backdrop; depth is the distance to it
        Snapshot TakePhoto(Texture src)
        {
            PlaceBackdrop();
            var cam = Camera.main.transform;
            var shot = new Snapshot { pose = new Pose(cam.position, cam.rotation), jpeg = Jpeg(src) };
            Vector2 size = _photoSize;
            float d = editorPhotoDistance;
            System.Func<Vector2, Vector3> local = v => new Vector3((v.x - 0.5f) * size.x, (v.y - 0.5f) * size.y, d);
            shot.rayFor = (v, p) => new Ray(p.position, (p.rotation * local(v)).normalized);
            shot.gridPoints = new Vector2[Grid * Grid];
            shot.gridDepth = new float[Grid * Grid];
            for (int y = 0, i = 0; y < Grid; y++)
                for (int x = 0; x < Grid; x++, i++)
                {
                    var v = new Vector2((x + 0.5f) / Grid, (y + 0.5f) / Grid);
                    shot.gridPoints[i] = v;
                    shot.gridDepth[i] = local(v).magnitude - 0.01f;   // just in front of the photo
                }
            return shot;
        }
#endif

        // where a point in the room appears in the camera picture (viewport 0-1, origin bottom-left)
        public Vector2 ViewportOf(Vector3 world)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_pca != null && _pca.IsPlaying) return _pca.WorldToViewportPoint(world);
#endif
#if UNITY_EDITOR
            if (PhotoMode && _backdrop != null)
            {
                // through the eye onto the hanging photo
                var cam = Camera.main.transform;
                var plane = new Plane(-_backdrop.forward, _backdrop.position);
                var ray = new Ray(cam.position, (world - cam.position).normalized);
                if (plane.Raycast(ray, out float d))
                {
                    var local = _backdrop.InverseTransformPoint(ray.GetPoint(d));   // quad is -0.5..0.5
                    return new Vector2(local.x + 0.5f, local.y + 0.5f);
                }
            }
#endif
            var v = Camera.main.WorldToViewportPoint(world);
            return new Vector2(v.x, v.y);
        }

        void OnDestroy()
        {
            if (_webcam != null) _webcam.Stop();
            if (_rt != null) _rt.Release();
        }
    }
}
