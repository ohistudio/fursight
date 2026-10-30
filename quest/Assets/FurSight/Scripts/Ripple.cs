using System.Collections;
using UnityEngine;

namespace FurSight
{
    // The real thing a card is about, pinched: where a card lands, the object itself (what the headset camera sees of
    // it) swells toward you as if pulled up, then springs back (FurSight/Real Ripple). Sized to the object's box in
    // the picture, at its live depth. Nothing shows without live depth and the headset camera.
    public class Ripple : MonoBehaviour
    {
        static Ripple _runner;
        static Material _real;

        // the object in a box of a snapshot: where it is now (the depth through the middle of its box), and how big
        // (the box's corners at that distance)
        public static void On(Snapshot shot, int[] box, Color colour)
        {
            var cam = PetCamera.Instance;
            if (shot == null || box == null || box.Length != 4 || cam == null) return;
            var mid = shot.Ray(new Vector2((box[0] + box[2]) / 2000f, 1f - (box[1] + box[3]) / 2000f));
            if (!cam.DepthHit(mid, out var p, out _)) return;
            float d = Vector3.Distance(mid.origin, p);
            var a = shot.Ray(new Vector2(box[0] / 1000f, 1f - box[1] / 1000f)).GetPoint(d);
            var b = shot.Ray(new Vector2(box[2] / 1000f, 1f - box[3] / 1000f)).GetPoint(d);
            float size = Mathf.Clamp(Vector3.Distance(a, b) * 0.95f, 0.08f, 0.7f);
            At(p, size);
        }

        public static void At(Vector3 point, float size)
        {
            if (_runner == null) _runner = new GameObject("Pinches").AddComponent<Ripple>();
            _runner.StartCoroutine(_runner.Pinch(point, size, 1.8f));
        }

        IEnumerator Pinch(Vector3 point, float size, float life)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            _real ??= Resources.Load<Material>("RealRipple");
            var cam = PetCamera.Instance != null ? PetCamera.Instance.Live : null;
            if (_real == null || cam == null || Camera.main == null) yield break;
            var head = Camera.main.transform.position;
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(q.GetComponent<Collider>());
            q.name = "Pinch";
            var toward = (point - head).normalized;
            q.transform.SetPositionAndRotation(point - toward * 0.01f, Quaternion.LookRotation(toward));   // facing you, just in front of it
            q.transform.localScale = Vector3.one * size;
            var r = q.GetComponent<MeshRenderer>();
            r.sharedMaterial = _real;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var mpb = new MaterialPropertyBlock();
            for (float t = 0f; t < life; t += Time.deltaTime)
            {
                cam = PetCamera.Instance != null ? PetCamera.Instance.Live : null;
                if (cam == null) break;
                var pose = cam.GetCameraPose();
                var lens = cam.Intrinsics;
                Vector2 sensor = lens.SensorResolution, cur = cam.CurrentResolution;
                // the texture is the middle of the sensor at the picture's shape
                Vector2 k = new Vector2(cur.x / sensor.x, cur.y / sensor.y); k /= Mathf.Max(k.x, k.y);
                mpb.Clear();
                mpb.SetTexture("_CamTex", cam.GetTexture());
                mpb.SetMatrix("_WorldToCam", Matrix4x4.TRS(pose.position, pose.rotation, Vector3.one).inverse);
                mpb.SetVector("_Lens", new Vector4(lens.FocalLength.x, lens.FocalLength.y, lens.PrincipalPoint.x, lens.PrincipalPoint.y));
                mpb.SetVector("_Crop", new Vector4(sensor.x * (1f - k.x) * 0.5f, sensor.y * (1f - k.y) * 0.5f, sensor.x * k.x, sensor.y * k.y));
                mpb.SetFloat("_HasCam", 1f);
                mpb.SetFloat("_T", t / life);
                r.SetPropertyBlock(mpb);
                yield return null;
            }
            Destroy(q);
#else
            yield break;
#endif
        }
    }
}
