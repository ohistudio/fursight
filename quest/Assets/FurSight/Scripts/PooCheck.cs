using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace FurSight
{
    // The daily poo check. Press Poo check on the hand menu (or on today's to-dos) and look at the litter tray: after
    // a countdown one frame goes to /api/droppings. SAM counts and outlines the droppings, Muse Spark judges size and
    // shape next to the last check's photo and count. A dot sits on each dropping at its real depth, and a card over
    // the tray gives the verdict and how it compares with last time. Saved to the diary with the droppings marked.
    public class PooCheck : MonoBehaviour
    {
        public float countdown = 3f;
        bool _busy;
        VerdictCard _checking, _card;
        readonly List<GameObject> _dots = new List<GameObject>();

        static readonly Dictionary<string, (string verdict, string word)> Verdicts = new Dictionary<string, (string, string)>
        {
            { "normal", ("safe", "Looks healthy") }, { "watch", ("caution", "Keep an eye on it") }, { "vet", ("vet", "See a vet today") },
        };
        static readonly Dictionary<string, string> Trends = new Dictionary<string, string>
        {
            { "first", "First check" }, { "better", "Better than last check" }, { "same", "Same as last check" }, { "worse", "Worse than last check" },
        };

        public static void Begin()
        {
            var a = FurSightActions.Instance;
            if (a == null) return;
            (a.GetComponent<PooCheck>() ?? a.gameObject.AddComponent<PooCheck>()).Run();
        }

        public void Run() { if (!_busy) StartCoroutine(CountThenCheck()); }

        IEnumerator CountThenCheck()
        {
            _busy = true;
            Clear();
            var head = Camera.main.transform;
            _checking = VerdictCard.Checking(head.position + head.forward * 0.6f - Vector3.up * 0.2f, "Look at the litter tray, hands down", "Tray in view 3", Theme.Sun);
            for (int n = Mathf.CeilToInt(countdown); n > 0; n--)
            {
                if (_checking != null) _checking.SetLabel("Tray in view " + n);
                Sfx.Count(head.position + head.forward * 0.4f);
                yield return new WaitForSeconds(1f);
            }
            _ = Check();
        }

        async Task Check()
        {
            var cam = PetCamera.Instance;
            if (cam == null || !cam.Ready) { Debug.LogWarning("[FurSight] camera not ready"); if (_checking != null) _checking.Dismiss(); _busy = false; return; }
            var shot = cam.Take();
            var head = Camera.main.transform;
            Sfx.Snap(head.position + head.forward * 0.3f);
            StartCoroutine(Juice.Buzz(0.2f, 0.04f));
            if (_checking != null) _checking.Dismiss();
            _checking = VerdictCard.Checking(head.position + head.forward * 0.6f - Vector3.up * 0.15f, "Counting, and comparing with the last check", "Poo check", Theme.Sun);
            try
            {
                var res = await FurSightApi.Post("/api/droppings", new { image = "data:image/jpeg;base64," + System.Convert.ToBase64String(shot.jpeg) }, 90);
                Debug.Log("[FurSight] poo check: " + res.ToString(Newtonsoft.Json.Formatting.None));
                Show(res, shot);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] poo check failed: " + e.Message);
                if (_checking != null) _checking.Dismiss();
                _card = VerdictCard.Verdict(head.position + head.forward * 0.6f, "Couldn't check", "none", "Try again in a moment.", null);
            }
            finally { _checking = null; _busy = false; }
        }

        void Show(JObject res, Snapshot shot)
        {
            if (_checking != null) _checking.Dismiss();
            string v = (string)res["verdict"] ?? "watch";
            var (verdict, word) = Verdicts.TryGetValue(v, out var vw) ? vw : Verdicts["watch"];
            string trend = (string)res["trend"] ?? "first";
            int count = (int?)res["count"] ?? 0;
            var col = Theme.For(verdict).main;

            // a dot on each dropping, and the whole lot's outline for the card and the lift
            var marks = new List<HubClient.Mark>();
            int x0 = 1000, y0 = 1000, x1 = 0, y1 = 0;
            if (res["boxes"] is JArray boxes)
                foreach (var b in boxes)
                {
                    var r = new[] { (int)((float)b["x0"] * 1000f), (int)((float)b["y0"] * 1000f), (int)((float)b["x1"] * 1000f), (int)((float)b["y1"] * 1000f) };
                    marks.Add(new HubClient.Mark { b = r, v = verdict });
                    x0 = Mathf.Min(x0, r[0]); y0 = Mathf.Min(y0, r[1]); x1 = Mathf.Max(x1, r[2]); y1 = Mathf.Max(y1, r[3]);
                    if (_dots.Count < 40) _dots.Add(Dot(PetCamera.Instance.Locate(shot, r, 1.0f), col));
                }
            var head = Camera.main.transform;
            Vector3 at;
            if (marks.Count > 0)
            {
                var all = new[] { x0, y0, x1, y1 };
                at = PetCamera.Instance.Locate(shot, all, 1.0f) + Vector3.up * 0.05f;
                Ripple.On(shot, all, col);
            }
            else at = head.position + head.forward * 0.6f;

            string prev = res["previous"] is JArray p && p.Count > 0 && p[0]["count"] != null && p[0]["count"].Type == JTokenType.Integer ? $" (last time {(int)p[0]["count"]})" : "";
            string compare = $"<color=#2B2A33>{(Trends.TryGetValue(trend, out var tw) ? tw : Trends["first"])}:</color> {(string)res["compare"]}{prev}";
            _card = VerdictCard.Verdict(at, $"{count} found", verdict, (string)res["summary"], compare, true, word);
            float scale = Mathf.Clamp(Vector3.Distance(head.position, at) / 0.7f, 1f, 2.2f);
            _card.transform.localScale = Vector3.one * scale;
            StartCoroutine(DotsGoWith(_card));

            var extra = new JObject { ["count"] = count, ["verdict"] = v, ["trend"] = trend, ["size_spread"] = res["size_spread"] };
            HubClient.Diary("droppings", "Droppings check", $"{count} found. {(string)res["summary"]} {(string)res["compare"]}".Trim(), verdict, shot.jpeg, marks, extra);
            Todos.Done("poo");
        }

        // a small coloured dot with a white ring, facing you, on a dropping
        static GameObject Dot(Vector3 at, Color col)
        {
            var d = new GameObject("Dropping").transform;
            d.position = at;
            var head = Camera.main.transform;
            d.rotation = Quaternion.LookRotation(at - head.position, Vector3.up);
            Shapes.MakeSlab("Ring", d, Shapes.CircleRing(0.009f), 0.002f, Color.white, Theme.CardLip, Vector3.zero);
            Shapes.MakeSlab("Fill", d, Shapes.CircleRing(0.006f), 0.002f, col, col, new Vector3(0f, 0f, -0.002f));
            FurSightActions.Instance.StartCoroutine(Juice.Pop(d, Random.Range(0f, 0.4f), 0.25f, 2.4f));
            return d.gameObject;
        }

        // the dots go when the card is closed (or Close all)
        IEnumerator DotsGoWith(VerdictCard card)
        {
            while (card != null && !card.Leaving) yield return new WaitForSeconds(0.25f);
            ClearDots();
        }

        void ClearDots() { foreach (var d in _dots) if (d != null) Destroy(d); _dots.Clear(); }

        public void Clear()
        {
            ClearDots();
            if (_card != null) _card.Dismiss();
            if (_checking != null) _checking.Dismiss();
            _card = null; _checking = null;
        }
    }
}
