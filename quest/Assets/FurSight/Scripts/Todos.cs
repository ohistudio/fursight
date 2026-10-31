using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace FurSight
{
    // Today's to-dos, as a card in front of you when FurSight opens (and from To-dos on the hand menu): the poo check
    // until it's done, grooming that's due, hay or water running low, a treat that's OK again. The list comes from
    // the server's /api/today, built from the household diary, so it matches the phone. A to-do the Quest can do
    // itself gets a button on the card ("Poo check now").
    public static class Todos
    {
        static VerdictCard _card;
        static readonly HashSet<string> _doneHere = new HashSet<string>();   // done on this headset since the list came

        public static async void Show()
        {
            if (!HubClient.Linked) return;
            if (_card != null) _card.Dismiss();
            var head = Camera.main.transform;
            var at = head.position + head.forward * 0.6f - Vector3.up * 0.05f;
            JArray todos;
            try
            {
                var res = await FurSightApi.Post("/api/today", new { tz = (int)System.TimeZoneInfo.Local.GetUtcOffset(System.DateTime.Now).TotalMinutes }, 20);
                todos = res["todos"] as JArray ?? new JArray();
            }
            catch (System.Exception e) { Debug.LogWarning("[FurSight] to-dos: " + e.Message); return; }

            var left = new List<JToken>();
            foreach (var t in todos) if (!_doneHere.Contains((string)t["id"])) left.Add(t);
            string pet = PetProfile.Current != null ? PetProfile.Current.petName : "him";
            if (left.Count == 0)
            {
                _card = VerdictCard.Verdict(at, "All done today", "safe", $"Nothing left to do for {pet} today.", null, true, "No to-dos");
                return;
            }
            var lines = new StringBuilder();
            bool poo = false;
            int n = 0;
            foreach (var t in left)
            {
                n++;
                string col = (string)t["verdict"] == "caution" ? "#D9900A" : (string)t["verdict"] == "safe" ? "#2A9A52" : "#1E86C9";
                if (lines.Length > 0) lines.Append('\n');
                lines.Append($"<color={col}><b>{n}</b></color>  <color=#2B2A33><b>{t["title"]}</b></color>  {t["note"]}");
                if ((string)t["action"] == "poo") poo = true;
            }
            _card = VerdictCard.Verdict(at, "Today's to-dos", "none", lines.ToString(), null, true,
                left.Count == 1 ? $"1 thing for {pet}" : $"{left.Count} things for {pet}");
            _card.KeepOpen();
            if (poo) _card.AddAction("Poo check now", Theme.Fern, Theme.FernLip, () => { _card.Dismiss(); PooCheck.Begin(); });
            Sfx.Pin(at);
        }

        // something on the list was just done here (the poo check): leave it off until the list is fetched afresh
        public static void Done(string id) => _doneHere.Add(id);
    }
}
