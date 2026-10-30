using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace FurSight
{
    // "Can he eat this?" Hold the food up and press Check food on the hand menu (or A; Space in the editor).
    // One frame goes to the server's /api/food (Muse Spark + the species safety list); the verdict comes back
    // with where the food was in the frame, and a card appears on the food in the room. Once linked to a household,
    // the card also says when the pet last had it (and whether to wait), and "We fed him this" saves it with the
    // day it's OK again on the calendar (/api/fed).
    public class FoodCheck : MonoBehaviour
    {
        [Header("Placement")]
        public float checkingDistance = 0.5f;   // where "Checking…" floats while we wait

        bool _busy;
        VerdictCard _checking;
        readonly System.Collections.Generic.List<VerdictCard> _cards = new System.Collections.Generic.List<VerdictCard>();

        void Start() => FurSightApi.Warm();

        public float countdown = 3f;           // from the hand menu: time to pick the food up and hold it out

        // from the hand menu: a short countdown first, so the hand that pressed it can go and hold the food up
        public void Run() { if (!_busy) StartCoroutine(CountThenCheck()); }

        System.Collections.IEnumerator CountThenCheck()
        {
            _busy = true;
            var head = Camera.main.transform;
            if (_checking != null) _checking.Dismiss();
            _checking = VerdictCard.Checking(head.position + head.forward * checkingDistance - Vector3.up * 0.2f, "Hold the food up in front of you", "Hold it up 3", Theme.Fern);
            for (int n = Mathf.CeilToInt(countdown); n > 0; n--)
            {
                if (_checking != null) _checking.SetLabel("Hold it up " + n);
                Sfx.Count(head.position + head.forward * 0.4f);
                yield return new WaitForSeconds(1f);
            }
            _busy = false;
            _ = Check();
        }

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
                    tz = TzMinutes,
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
            var marks = new System.Collections.Generic.List<HubClient.Mark>();
            JToken heldItem = null;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                var box = it["box"]?.ToObject<int[]>();
                if (box == null || box.Length != 4) continue;
                string verdict = (string)it["verdict"];
                marks.Add(new HubClient.Mark { b = box, v = verdict, t = Capital((string)it["food"]) + ": " + Theme.Word(verdict) });
                if (i == held) heldItem = it;
                int hand = i == held ? InHand(shot, box) : -1;
                var at = hand >= 0 ? HandPoint(Hands.Get(hand)) : PetCamera.Instance.Locate(shot, box, 0.45f);
                if (hand < 0) Ripple.On(shot, box, Theme.For(verdict).main);
                var card = VerdictCard.Verdict(at, (string)it["food"], verdict, (string)it["reason"], i == held ? Extra(it, verdict) : null, i == held);
                _cards.Add(card);
                if (hand >= 0) card.Follow(() => { var hd = Hands.Get(hand); return hd.tracked ? HandPoint(hd) : (Vector3?)null; });
                if (i == held && verdict != "toxic" && HubClient.Linked)
                {
                    var item = it;
                    card.AddAction($"We fed {PetProfile.Current.petName} this", Theme.Fern, Theme.FernLip, () => _ = Fed(card, item));
                }
            }
            if (heldItem != null)
            {
                string v = (string)heldItem["verdict"];
                HubClient.Diary("food", Capital((string)heldItem["food"]), (string)heldItem["reason"] + Plain(Extra(heldItem, v)), v, shot.jpeg, marks);
            }
        }

        // in front of the palm, where the food is
        static Vector3 HandPoint(Hands.Hand hd) => hd.palm + hd.normal * 0.05f;

        // the food you're holding is in your hand: the tracked hand nearest the ray through its box (-1: none near)
        static int InHand(Snapshot shot, int[] box)
        {
            var ray = shot.Ray(new Vector2((box[0] + box[2]) / 2000f, 1f - (box[1] + box[3]) / 2000f));
            int best = -1; float bestGap = 0.3f;
            for (int h = 0; h < 2; h++)
            {
                var hand = Hands.Get(h);
                if (!hand.tracked) continue;
                float gap = Vector3.Cross(ray.direction, HandPoint(hand) - ray.origin).magnitude;
                if (gap < bestGap) { bestGap = gap; best = h; }
            }
            return best;
        }

        public static int TzMinutes => (int)System.TimeZoneInfo.Local.GetUtcOffset(System.DateTime.Now).TotalMinutes;

        // saved with how long to wait before the next one; that day goes on the household calendar
        async Task Fed(VerdictCard card, JToken it)
        {
            card.SetAction("Marking…");
            try
            {
                var r = await FurSightApi.Post("/api/fed", new { food = (string)it["food"], verdict = (string)it["verdict"], wait_days = it["wait_days"]?.Type == JTokenType.Integer ? (int)it["wait_days"] : 3, tz = TzMinutes });
                string next = (string)r["next"];
                card.SetAction(string.IsNullOrEmpty(next) ? "Marked" : "OK again " + Day(next), Theme.Sky);
                Sfx.Safe(card.transform.position);
                StartCoroutine(Juice.Buzz(0.2f, 0.05f));
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] fed failed: " + e.Message);
                card.SetAction("Couldn't save, try later", Theme.Coral);
            }
        }

        // "2026-11-01" -> "Sun 1 Nov"
        static string Day(string ymd) => System.DateTime.TryParseExact(ymd, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d)
            ? d.ToString("ddd d MMM", System.Globalization.CultureInfo.GetCultureInfo("en-GB")) : ymd;

        static string Capital(string s) => string.IsNullOrEmpty(s) ? "Food" : char.ToUpper(s[0]) + s.Substring(1);
        static string Plain(string rich) => string.IsNullOrEmpty(rich) ? "" : " " + System.Text.RegularExpressions.Regex.Replace(rich, "<[^>]+>", "");

        // the line under the reason: how much for a treat, a better choice for a don't
        static string Extra(JToken it, string verdict)
        {
            string portion = (string)it["portion"], instead = (string)it["instead"], line = null;
            if (verdict == "caution" && !string.IsNullOrEmpty(portion) && portion != "none") line = "<color=#2B2A33>How much:</color> " + portion;
            if (verdict == "toxic" && !string.IsNullOrEmpty(instead)) line = "<color=#2B2A33>Instead:</color> " + instead;
            // when he last had it: amber while it's still too soon
            var fed = it["fed"];
            if (fed != null && fed.Type == JTokenType.Object && !string.IsNullOrEmpty((string)fed["said"]))
            {
                bool wait = fed["wait_left"]?.Type == JTokenType.Integer && (int)fed["wait_left"] > 0;
                string had = (wait ? "<color=#D9900A>" : "<color=#2B2A33>") + (string)fed["said"] + "</color>";
                line = line == null ? had : line + "\n" + had;
            }
            return line;
        }
    }
}
