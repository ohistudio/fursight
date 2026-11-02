using System.Collections;
using System.Collections.Generic;
using Meta.XR.EnvironmentDepth;
using Meta.XR.MRUtilityKit;
using UnityEngine;

namespace FurSight
{
    // Only your hands (and anything new in the room) go over FurSight's UI, never the room itself: the room from the
    // headset's Space Setup (its scanned mesh, loaded with MRUK) is cut out of the environment depth with Meta's
    // Depth Mask (EnvironmentDepthManager.MaskMeshFilters), as in Meta's Depth API advanced usage. Walls, the bed and
    // the desk no longer hide a label pinned on them; your hands aren't in the scan, so they still occlude.
    // Without a room scan nothing is masked (everything real occludes, as before).
    public class RoomMask : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot() { if (FindFirstObjectByType<RoomMask>() == null) new GameObject("Room mask").AddComponent<RoomMask>(); }

        IEnumerator Start()
        {
            if (Application.isEditor) yield break;   // no room scan or depth in the editor
            // the depth manager is added once the scene permission is granted (PetCamera)
            EnvironmentDepthManager dm = null;
            while ((dm = FindFirstObjectByType<EnvironmentDepthManager>()) == null) yield return new WaitForSeconds(0.5f);

            var mruk = MRUK.Instance;
            if (mruk == null)
            {
                var go = new GameObject("MRUK");
                go.SetActive(false);   // so its Awake sees our settings: we load the room ourselves
                mruk = go.AddComponent<MRUK>();
                mruk.SceneSettings = new MRUK.MRUKSettings { LoadSceneOnStartup = false };
                go.SetActive(true);
            }
            var load = mruk.LoadSceneFromDevice(requestSceneCaptureIfNoDataFound: false);
            while (!load.IsCompleted) yield return null;
            Debug.Log($"[FurSight] room scan: {load.Result}, rooms {mruk.Rooms.Count}");

            var filters = new List<MeshFilter>();
            foreach (var room in mruk.Rooms)
            {
                var anchor = room.GlobalMeshAnchor;
                var mesh = anchor != null ? anchor.GlobalMesh : null;
                if (mesh == null || mesh.vertexCount == 0) continue;
                var holder = new GameObject("Room mask mesh");
                holder.transform.SetParent(anchor.transform, false);
                holder.AddComponent<MeshFilter>().sharedMesh = mesh;
                filters.Add(holder.GetComponent<MeshFilter>());
            }
            if (filters.Count == 0) { Debug.LogWarning("[FurSight] no room mesh: the room still occludes (run Space Setup to scan it)"); yield break; }
            dm.MaskMeshFilters = filters;
            dm.MaskBias = 0.03f;   // a little nearer than the scan, so the real surfaces are fully cut out
            Debug.Log($"[FurSight] room masked out of depth: {filters.Count} mesh(es), {filters[0].sharedMesh.vertexCount} vertices");
        }
    }
}
