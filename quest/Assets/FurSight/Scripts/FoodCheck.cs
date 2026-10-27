using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace FurSight
{
    // "Can he eat this?" Hold the food up and press Check food on the hand menu (or A; Space in the editor).
    // One frame goes to the server's /api/food (Muse Spark + the species safety list); the verdict comes back
    // with where the food was in the frame, and a card appears on the food in the room.
    public class FoodCheck : MonoBehaviour
    {
        [Header("Placement")]
        public float checkingDistance = 0.5f;   // where "Checking…" floats while we wait

        bool _busy;
        VerdictCard _checking;
        readonly System.Collections.Generic.List<VerdictCard> _cards = new System.Collections.Generic.List<VerdictCard>();

        void Start() => FurSightApi.Warm();

        public void Run() { if (!_busy) _ = Check(); }

        void Update()
        {
            if (_busy) return;
            if (Triggered()) _ = Check();
        }

        bool Triggered()
        {
            if (CardInput.Consumed) return false;   // that press closed a card
            if (Keyboard.current != null && Keyboard.current.spaceKey.wasPressedThisFrame) return true;
            // controller shortcut: A. Triggers and pinches are for pointing at buttons (the hand menu, card close).
            return OVRInput.GetDown(OVRInput.Button.One, OVRInput.Controller.RTouch);
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
            // a new look clears the last answers, so cards don't pile up
            foreach (var old in _cards) if (old != null) old.Dismiss();
            _cards.Clear();
            if (_checking != null) _checking.Dismiss();
            _checking = VerdictCard.Checking(head.position + head.forward * checkingDistance - Vector3.up * 0.12f, $"Can {PetProfile.Current.petName} eat this?");
            float t0 = Time.realtimeSinceStartup;
            try
            {
                var res = await FurSightApi.Post("/api/food", new
                {
                    image = "data:image/jpeg;base64," + System.Convert.ToBase64String(shot.jpeg),
                    pet = PetProfile.Current.ForServer(),
                });
                Debug.Log($"[FurSight] food check {Time.realtimeSinceStartup - t0:F1}s: {res.ToString(Newtonsoft.Json.Formatting.None)}");
                Show(res, shot);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] food check failed: " + e.Message);
                if (_checking != null) _checking.Dismiss();
                _checking = null;
                VerdictCard.Verdict(head.position + head.forward * checkingDistance, "Couldn't check", "unknown", "Try again in a moment.", null);
            }
            finally { _busy = false; }
        }

        void Show(JObject res, Snapshot shot)
        {
            if (_checking != null) { _checking.Dismiss(); _checking = null; }
            var items = res["items"] as JArray;
            if (items == null || items.Count == 0)
            {
                var head = Camera.main.transform;
                _cards.Add(VerdictCard.Verdict(head.position + head.forward * checkingDistance, "No food seen", "unknown", "Hold it up in front of you and try again.", null));
                return;
            }
            int held = res["held"]?.Type == JTokenType.Integer ? (int)res["held"] : 0;
            // the held item gets the full card; anything else in view gets a small one
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                var box = it["box"]?.ToObject<int[]>();
                if (box == null || box.Length != 4) continue;
                string verdict = (string)it["verdict"];
                _cards.Add(VerdictCard.Verdict(shot.WorldPoint(box), (string)it["food"], verdict, (string)it["reason"], i == held ? Extra(it, verdict) : null, i == held));
                if (i == held) HubClient.Diary("food", Capital((string)it["food"]), (string)it["reason"] + Plain(Extra(it, verdict)), verdict, shot.jpeg);
            }
        }

        static string Capital(string s) => string.IsNullOrEmpty(s) ? "Food" : char.ToUpper(s[0]) + s.Substring(1);
        static string Plain(string rich) => string.IsNullOrEmpty(rich) ? "" : " " + System.Text.RegularExpressions.Regex.Replace(rich, "<[^>]+>", "");

        // the line under the reason: how much for a treat, a better choice for a don't
        static string Extra(JToken it, string verdict)
        {
            string portion = (string)it["portion"], instead = (string)it["instead"];
            if (verdict == "caution" && !string.IsNullOrEmpty(portion) && portion != "none") return "<color=#2B2A33>How much:</color> " + portion;
            if (verdict == "toxic" && !string.IsNullOrEmpty(instead)) return "<color=#2B2A33>Instead:</color> " + instead;
            return null;
        }
    }
}
