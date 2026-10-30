using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace FurSight
{
    // "What in here will he chew?" Look round the room and press Check room on the hand menu (R in the editor, via HandMenu).
    // One frame goes to the server's /api/room: Muse Spark lists what it can see that matters to a free-roaming
    // rabbit (cables, wood, toxic plants, small things, gaps, rugs he may pee on), and SAM 3.1 finds each one in
    // the picture. Each hazard gets a card pinned to the real thing, at the live depth along the ray through it,
    // most important first, one at a time: red for high risk, amber for medium, blue for low.
    public class RoomCheck : MonoBehaviour
    {
        public float checkingDistance = 0.6f;
        public float cardGap = 0.45f;          // seconds between cards appearing

        bool _busy;
        VerdictCard _checking;
        readonly List<VerdictCard> _cards = new List<VerdictCard>();

        public float countdown = 3f;   // time to drop your hands out of the picture after pressing

        public void Run() { if (!_busy) StartCoroutine(CountThenCheck()); }

        IEnumerator CountThenCheck()
        {
            _busy = true;
            Clear();
            var head = Camera.main.transform;
            _checking = VerdictCard.Checking(head.position + head.forward * checkingDistance - Vector3.up * 0.2f,
                "Hands down, look round the room", "Look around 3", Theme.Coral);
            for (int n = Mathf.CeilToInt(countdown); n > 0; n--)
            {
                if (_checking != null) _checking.SetLabel("Look around " + n);
                Sfx.Count(head.position + head.forward * 0.4f);
                yield return new WaitForSeconds(1f);
            }
            _busy = false;
            _ = Check();
        }

        async Task Check()
        {
            var cam = PetCamera.Instance;
            if (cam == null || !cam.Ready) { Debug.LogWarning("[FurSight] camera not ready"); return; }
            _busy = true;
            var shot = cam.Take();
            var head = Camera.main.transform;
            Sfx.Snap(head.position + head.forward * 0.3f);
            StartCoroutine(Juice.Buzz(0.2f, 0.04f));
            Clear();
            _checking = VerdictCard.Checking(head.position + head.forward * checkingDistance - Vector3.up * 0.15f,
                $"What could {PetProfile.Current.petName} chew?", "Checking the room");
            float t0 = Time.realtimeSinceStartup;
            try
            {
                var res = await FurSightApi.Post("/api/room", new
                {
                    image = "data:image/jpeg;base64," + System.Convert.ToBase64String(shot.jpeg),
                }, 110);
                Debug.Log($"[FurSight] room check {Time.realtimeSinceStartup - t0:F1}s: {res.ToString(Newtonsoft.Json.Formatting.None)}");
                StartCoroutine(Show(res["hazards"] as JArray, shot));
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] room check failed: " + e.Message);
                if (_checking != null) _checking.Dismiss();
                _checking = null;
                _cards.Add(VerdictCard.Verdict(head.position + head.forward * checkingDistance, "Couldn't check", "unknown", "Try again in a moment.", null));
                _busy = false;
            }
        }

        IEnumerator Show(JArray hazards, Snapshot shot)
        {
            if (_checking != null) { _checking.Dismiss(); _checking = null; }
            var head = Camera.main.transform;
            if (hazards == null || hazards.Count == 0)
            {
                _cards.Add(VerdictCard.Verdict(head.position + head.forward * checkingDistance, "Looks clear", "safe",
                    $"Nothing here for {PetProfile.Current.petName} to chew or swallow.", null));
                _busy = false;
                yield break;
            }
            var placed = new List<Vector3>();
            var used = new List<Vector2>();
            var marks = new List<HubClient.Mark>();
            var names = new List<string>();
            int shown = 0;
            foreach (var h in hazards)
            {
                var box = Box(h["boxes"] as JArray, used);
                if (box == null) continue;   // nothing left that isn't already pinned (two names for one plant)
                shown++;
                marks.Add(new HubClient.Mark { b = box, v = (string)h["risk"], t = (string)h["label"], n = shown });
                names.Add($"{shown} {h["label"]}");
                var point = Place(shot, box);
                string risk = (string)h["risk"];
                string verdict = risk == "high" ? "toxic" : risk == "medium" ? "caution" : "low";
                // far cards are bigger so they read the same as one at arm's length
                float scale = Mathf.Clamp(Vector3.Distance(head.position, point) / 0.7f, 1f, 3.2f);
                // two things close together: lift the later card clear of the first
                foreach (var p in placed) if (Vector3.Distance(p, point) < 0.22f * scale) point += Vector3.up * 0.2f * scale;
                placed.Add(point);
                var card = VerdictCard.Verdict(point, (string)h["label"], verdict, (string)h["why"],
                    string.IsNullOrEmpty((string)h["fix"]) ? null : "<color=#2B2A33>Fix:</color> " + (string)h["fix"], false, Word((string)h["kind"], risk));
                card.transform.localScale = Vector3.one * 0.72f * scale;
                card.KeepOpen();
                _cards.Add(card);
                Sfx.Pin(point);
                if (risk == "high") Sfx.Nope(point); else if (risk == "medium") Sfx.Treat(point);
                StartCoroutine(Juice.Buzz(risk == "high" ? 0.5f : 0.2f, 0.05f));
                yield return new WaitForSeconds(cardGap);
            }
            HubClient.Diary("room", $"Room check: {shown} things to sort", string.Join(", ", names), "caution", shot.jpeg, marks);
            _busy = false;
        }

        // at the live depth through its outline (PetCamera.Locate); without depth, the snapshot's grid
        static Vector3 Place(Snapshot shot, int[] box) => PetCamera.Instance.Locate(shot, box, 1.2f);

        // SAM can return the same thing for two names ("sideboard plants", "desk plants"), so take its first outline
        // whose middle isn't one already pinned. 0-1 from the top left -> [x1,y1,x2,y2] on the 0-1000 grid.
        static int[] Box(JArray boxes, List<Vector2> used)
        {
            if (boxes == null) return null;
            foreach (var b in boxes)
            {
                var r = new[] { (int)((float)b["x0"] * 1000f), (int)((float)b["y0"] * 1000f), (int)((float)b["x1"] * 1000f), (int)((float)b["y1"] * 1000f) };
                var mid = new Vector2((r[0] + r[2]) / 2f, (r[1] + r[3]) / 2f);
                bool taken = false;
                foreach (var u in used) if ((u - mid).magnitude < 50f) { taken = true; break; }
                if (taken) continue;
                used.Add(mid);
                return r;
            }
            return null;
        }

        // "High risk: chewing" (the colour and icon say it too, but never on their own)
        static string Word(string kind, string risk)
        {
            string what = kind == "cable" || kind == "chew" ? "chewing" : kind == "toxic" ? "toxic" : kind == "swallow" ? "swallowing"
                : kind == "stuck" ? "getting stuck" : kind == "stain" ? "peeing on it" : "worth a look";
            return (risk == "high" ? "High" : risk == "medium" ? "Medium" : "Low") + " risk: " + what;
        }

        public void Clear()
        {
            foreach (var c in _cards) if (c != null) c.Dismiss();
            _cards.Clear();
            if (_checking != null) { _checking.Dismiss(); _checking = null; }
        }
    }
}
