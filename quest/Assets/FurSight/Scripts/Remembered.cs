using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;

namespace FurSight
{
    // The room remembers. Every hazard a room check pins is saved where it is, as a Meta spatial anchor (with its
    // name, risk and fix). The next time FurSight opens in that room, each comes back on the real thing: "Lamp
    // cable: still there? Did you sort it?", with Sorted it and Still there. And a new room check compares with
    // them: one that's in view but no longer found turns green ("Sorted: lamp cable"), one that's still there is
    // kept. Saved on the headset in remembered.json beside the anchors.
    // If the headset won't keep anchors (a sideloaded build Meta doesn't know yet), each is kept as a position in
    // the headset's tracking space instead, which holds between launches in the same guardian.
    public static class Remembered
    {
        [Serializable] class Item { public string id = "", label, risk, why, fix; public float x, y, z; public long at; }
        [Serializable] class Store { public List<Item> items = new List<Item>(); }

        static string FilePath => Path.Combine(Application.persistentDataPath, "remembered.json");
        static Store _store;
        static Store Data
        {
            get
            {
                if (_store != null) return _store;
                try { _store = File.Exists(FilePath) ? JsonUtility.FromJson<Store>(File.ReadAllText(FilePath)) : null; } catch { _store = null; }
                return _store ??= new Store();
            }
        }
        static void Save() { try { File.WriteAllText(FilePath, JsonUtility.ToJson(Data)); } catch (Exception e) { Debug.LogWarning("[FurSight] remembered: " + e.Message); } }

        static Transform Tracking => UnityEngine.Object.FindFirstObjectByType<OVRCameraRig>()?.trackingSpace;
        static Vector3 ToTracking(Vector3 world) { var t = Tracking; return t != null ? t.InverseTransformPoint(world) : world; }
        static Vector3 FromTracking(Vector3 local) { var t = Tracking; return t != null ? t.TransformPoint(local) : local; }

        // where each remembered thing is this session (anchors once they've localised)
        static readonly Dictionary<Item, Vector3> _where = new Dictionary<Item, Vector3>();
        static readonly List<GameObject> _bound = new List<GameObject>();

        // ---------------------------------------------------------------- saving

        /// A hazard just pinned by a room check: anchor it and keep it (one near the same spot is replaced)
        public static async void Remember(Vector3 point, string label, string risk, string why, string fix)
        {
            if (risk == "good") return;
            foreach (var old in Data.items.ToArray())
                if (Vector3.Distance(Pos(old), point) < 0.35f) Forget(old, false);
            var item = new Item { label = label, risk = risk, why = why, fix = fix, at = DateTimeOffset.UtcNow.ToUnixTimeSeconds() };
            var local = ToTracking(point); item.x = local.x; item.y = local.y; item.z = local.z;
            Data.items.Add(item);
            if (Data.items.Count > 30) Data.items.RemoveAt(0);
            _where[item] = point;
            Save();
            try
            {
                var go = new GameObject("Remembered " + label);
                go.transform.position = point;
                var a = go.AddComponent<OVRSpatialAnchor>();
                if (!await a.WhenCreatedAsync()) { Debug.LogWarning("[FurSight] anchor not created: " + label); UnityEngine.Object.Destroy(go); return; }
                var saved = await OVRSpatialAnchor.SaveAnchorsAsync(new[] { a });
                if (saved.Success) { item.id = a.Uuid.ToString(); Save(); _bound.Add(go); Debug.Log($"[FurSight] anchored {label} {item.id}"); }
                else { Debug.LogWarning($"[FurSight] anchor save failed ({saved.Status}): {label}; kept in tracking space"); UnityEngine.Object.Destroy(go); }
            }
            catch (Exception e) { Debug.LogWarning("[FurSight] anchor: " + e.Message); }
        }

        static Vector3 Pos(Item i) => _where.TryGetValue(i, out var p) ? p : FromTracking(new Vector3(i.x, i.y, i.z));

        static void Forget(Item item, bool save = true)
        {
            Data.items.Remove(item);
            _where.Remove(item);
            if (!string.IsNullOrEmpty(item.id) && Guid.TryParse(item.id, out var g))
                _ = OVRSpatialAnchor.EraseAnchorsAsync(null, new[] { g });
            if (save) Save();
        }

        // ---------------------------------------------------------------- coming back

        /// At launch: find the saved anchors in this room, and ask about each one on the real thing
        public static async Task Restore()
        {
            if (Data.items.Count == 0) return;
            var ids = new List<Guid>();
            foreach (var i in Data.items) if (Guid.TryParse(i.id, out var g)) ids.Add(g);
            if (ids.Count > 0)
            {
                try
                {
                    var unbound = new List<OVRSpatialAnchor.UnboundAnchor>();
                    var res = await OVRSpatialAnchor.LoadUnboundAnchorsAsync(ids, unbound);
                    if (!res.Success) Debug.LogWarning("[FurSight] anchors not loaded: " + res.Status);
                    foreach (var u in unbound)
                    {
                        if (!await u.LocalizeAsync()) continue;
                        var item = Data.items.Find(i => i.id == u.Uuid.ToString());
                        if (item == null) continue;
                        var go = new GameObject("Remembered " + item.label);
                        var a = go.AddComponent<OVRSpatialAnchor>();
                        u.BindTo(a);
                        _bound.Add(go);
                        await Task.Yield();
                        _where[item] = go.transform.position;
                    }
                    Debug.Log($"[FurSight] remembered: {_where.Count} of {Data.items.Count} found in this room");
                }
                catch (Exception e) { Debug.LogWarning("[FurSight] anchors: " + e.Message); }
            }
            // the ones found here (anchored), or kept by position when anchors weren't allowed
            var here = Data.items.FindAll(i => _where.ContainsKey(i) || string.IsNullOrEmpty(i.id));
            if (here.Count == 0) return;
            // first, in front of you: did you fix these from last time? Then each one on the real thing
            var head = Camera.main.transform;
            var fwd = Vector3.ProjectOnPlane(head.forward, Vector3.up).normalized;
            string when = DateTimeOffset.FromUnixTimeSeconds(here[here.Count - 1].at).ToLocalTime().ToString("ddd d MMM");
            string names = string.Join(", ", here.ConvertAll(i => i.label).GetRange(0, Mathf.Min(3, here.Count))) + (here.Count > 3 ? $" and {here.Count - 3} more" : "");
            VerdictCard.Verdict(head.position + fwd * 0.65f - Vector3.up * 0.08f, "From last time", "caution",
                $"Did you fix these from your last room check ({when})? {names}.", "Look around: each one has a card on it. Sorted it, or Still there.", false, "Room check")
                .TagAlong();
            Sfx.Pin(head.position + fwd * 0.65f);
            await Task.Delay(900);
            int shown = 0;
            foreach (var item in here)
            {
                if (shown >= 6) break;
                Ask(item, Pos(item));
                shown++;
                await Task.Delay(350);
            }
        }

        static void Ask(Item item, Vector3 at)
        {
            var head = Camera.main.transform;
            string when = DateTimeOffset.FromUnixTimeSeconds(item.at).ToLocalTime().ToString("ddd d MMM");
            string verdict = item.risk == "high" ? "toxic" : item.risk == "medium" ? "caution" : "low";
            var card = VerdictCard.Verdict(at, item.label, verdict, $"Last room check ({when}): {item.why}",
                string.IsNullOrEmpty(item.fix) ? "Did you sort it?" : "<color=#2B2A33>Did you sort it?</color> " + item.fix, false, "Still there?");
            card.transform.localScale = Vector3.one * 0.72f * Mathf.Clamp(Vector3.Distance(head.position, at) / 0.8f, 1f, 2f);
            card.KeepOpen();
            card.AddButton("Sorted it", Theme.Fern, Theme.FernLip, () =>
            {
                Forget(item);
                HubClient.Diary("room", "Sorted: " + item.label, item.fix, "safe", null);
                Sfx.Safe(at);
                card.Dismiss();
                VerdictCard.Verdict(at, item.label, "safe", "Sorted. One less thing for him to chew.", null, false, "Sorted");
            });
            card.AddButton("Still there", Theme.Sun, Theme.SunLip, () => card.Dismiss());
            Sfx.Pin(at);
        }

        // ---------------------------------------------------------------- a new room check

        /// After a room check: anything remembered that was in view of this photo but isn't among what was just
        /// found (nothing new within 50 cm) has been sorted. found: where this check pinned each hazard.
        public static void Compare(Snapshot shot, List<Vector3> found)
        {
            var fwd = shot.pose.forward;
            foreach (var item in Data.items.ToArray())
            {
                var p = Pos(item);
                var to = p - shot.pose.position;
                if (to.magnitude > 4.5f || Vector3.Angle(fwd, to) > 32f) continue;   // not in this photo
                if (found.Exists(f => Vector3.Distance(f, p) < 0.5f)) continue;      // still there (re-saved by Remember)
                Forget(item);
                var card = VerdictCard.Verdict(p, item.label, "safe", $"It was a {item.risk} risk last time; now it's sorted.", null, false, "Sorted since last time");
                card.transform.localScale = Vector3.one * 0.72f * Mathf.Clamp(Vector3.Distance(shot.pose.position, p) / 0.8f, 1f, 2f);
                card.KeepOpen();
                Sfx.Safe(p);
            }
        }
    }
}
