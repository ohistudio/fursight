using System.Collections;
using UnityEngine;

namespace FurSight
{
    // A ripple across a real surface where a card lands: the real table, rug or wall bending under rings (Real),
    // with three faint rings in the card's colour lying flat on it (along the surface the depth found), spreading out and fading. Drawn with the occluded UI shader, so real things in front
    // still hide it. Nothing shows without live depth.
    public class Ripple : MonoBehaviour
    {
        static Ripple _runner;
        static Material _mat;

        // through the middle of a box in a snapshot: where that ray meets the room now
        public static void On(Snapshot shot, int[] box, Color colour)
        {
            if (shot == null || box == null || box.Length != 4 || PetCamera.Instance == null) return;
            var ray = shot.Ray(new Vector2((box[0] + box[2]) / 2000f, 1f - (box[1] + box[3]) / 2000f));
            if (PetCamera.Instance.DepthHit(ray, out var p, out var n)) At(p, n, colour);
        }

        public static void At(Vector3 point, Vector3 normal, Color colour, float size = 0.32f)
        {
            _mat ??= Resources.Load<Material>("Sticker");
            if (_mat == null) return;
            if (_runner == null) _runner = new GameObject("Ripples").AddComponent<Ripple>();
            if (normal.sqrMagnitude < 1e-4f) normal = Vector3.up;
            _runner.StartCoroutine(_runner.Run(point, normal.normalized, colour, size));
        }

        static Material _real;

        // the real surface itself rippling: a disc that redraws the passthrough camera's picture of it, bent by
        // rings (FurSight/Real Ripple), kept up to date with the camera's pose and lens every frame
        IEnumerator Real(Vector3 point, Vector3 normal, Color colour, float size, float life)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            _real ??= Resources.Load<Material>("RealRipple");
            var cam = PetCamera.Instance != null ? PetCamera.Instance.Live : null;
            if (_real == null || cam == null) yield break;
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(q.GetComponent<Collider>());
            q.name = "Real ripple";
            q.transform.SetPositionAndRotation(point + normal * 0.003f, Quaternion.LookRotation(-normal));
            q.transform.localScale = Vector3.one * size * 1.4f;
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
                mpb.SetColor("_Tint", colour);
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

        IEnumerator Run(Vector3 point, Vector3 normal, Color colour, float size)
        {
            StartCoroutine(Real(point, normal, colour, size, 1.5f));
            var root = new GameObject("Ripple").transform;
            root.SetPositionAndRotation(point + normal * 0.004f, Quaternion.LookRotation(-normal));
            var rings = new (Transform t, Material m, float start)[3];
            for (int i = 0; i < 3; i++)
            {
                var g = Shapes.Make("Ring", root, Shapes.Arc(0.5f, 0.035f, 0f, 360f, 48), colour, Vector3.zero);
                var m = new Material(_mat);
                g.GetComponent<MeshRenderer>().sharedMaterial = m;
                rings[i] = (g.transform, m, i * 0.16f);
                g.transform.localScale = Vector3.zero;
            }
            const float life = 1.1f;
            for (float t = 0f; t < life + 0.4f; t += Time.deltaTime)
            {
                foreach (var (tr, m, start) in rings)
                {
                    float k = Mathf.Clamp01((t - start) / life);
                    tr.localScale = Vector3.one * size * Juice.OutCubic(k);
                    var c = colour; c.a = k <= 0f ? 0f : (1f - k) * 0.45f;   // faint: the room itself is doing the rippling
                    m.SetColor("_BaseColor", c);
                }
                yield return null;
            }
            foreach (var (_, m, _) in rings) Destroy(m);
            Destroy(root.gameObject);
        }
    }
}
