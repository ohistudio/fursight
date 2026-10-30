using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace FurSight
{
    // The things you can do from the hand menu:
    //   Check food: one frame to /api/food (FoodCheck does it)
    //   Check room: one frame to /api/room, a card pinned on each thing he could chew (RoomCheck does it)
    //   Ask: a frame for context + your spoken question (MicRecorder) to /api/ask, answer pinned to what it's about
    //   Note: say what you did ("fed him a strawberry, brushed his coat"); /api/note checks the food and puts the
    //         day it's OK again on the calendar, ticks his care, marks grooming done
    //   Take photo: a frame to /api/photo for a diary note, saved on the headset with the picture
    public class FurSightActions : MonoBehaviour
    {
        public float cardDistance = 0.5f;

        public static FurSightActions Instance { get; private set; }
        public bool Busy { get; private set; }

        MicRecorder _mic;
        VerdictCard _status;
        VerdictCard _last;
        Snapshot _askShot;

        void Awake()
        {
            Instance = this;
            _mic = GetComponent<MicRecorder>() ?? gameObject.AddComponent<MicRecorder>();
            _mic.Finished += (wav) => { if (_noting) OnNote(wav); else OnQuestion(wav); };
        }

        Vector3 InFront(float down = 0.1f)
        {
            var head = Camera.main.transform;
            return head.position + head.forward * cardDistance - Vector3.up * down;
        }

        public void CheckFood()
        {
            var food = GetComponent<FoodCheck>();
            if (food != null) food.Run();
        }

        public void CheckRoom()
        {
            var room = GetComponent<RoomCheck>() ?? gameObject.AddComponent<RoomCheck>();
            room.Run();
        }

        // "Hay: 40% left, 60% eaten since 08:10" on the rack itself; green when there's plenty, amber, red to top up
        readonly System.Collections.Generic.List<VerdictCard> _gauges = new System.Collections.Generic.List<VerdictCard>();
        void ShowLevels(JArray marks, Snapshot shot)
        {
            foreach (var g in _gauges) if (g != null) g.Dismiss();
            _gauges.Clear();
            float delay = 0.6f;
            foreach (var m in marks)
            {
                var box = m["box"]?.ToObject<int[]>();
                if (box == null || box.Length != 4) continue;
                int level = (int)m["level"];
                string kind = (string)m["kind"], label = (string)m["label"];
                string verdict = level >= 50 ? "safe" : level >= 20 ? "caution" : "toxic";
                string word = kind == "hay" ? $"{level}% left" : $"{level}% full";
                string why = m["gone"]?.Type == JTokenType.Integer ? $"{(int)m["gone"]}% eaten since {(string)m["since"]}, when it was {(int)m["from"]}%."
                    : m["from"]?.Type == JTokenType.Integer ? $"It was {(int)m["from"]}% at {(string)m["since"]}." : "No pet cam reading from this morning to compare.";
                if (level < 20) why += kind == "water" ? " Time to fill it." : kind == "hay" ? " Time for more hay." : " Top it up.";
                var at = PetCamera.Instance.Locate(shot, box);
                StartCoroutine(GaugeLater(delay, at, label, verdict, why, word));
                delay += 0.35f;
            }
        }

        System.Collections.IEnumerator GaugeLater(float wait, Vector3 at, string label, string verdict, string why, string word)
        {
            yield return new WaitForSeconds(wait);
            var head = Camera.main.transform.position;
            var g = VerdictCard.Verdict(at, label, verdict, why, null, false, word);
            g.transform.localScale = Vector3.one * 0.72f * Mathf.Clamp(Vector3.Distance(head, at) / 0.7f, 1f, 3f);
            g.KeepOpen();
            _gauges.Add(g);
            Sfx.Pin(at);
        }

        async Task StickerOn(VerdictCard card, string photo)
        {
            try
            {
                var tex = await Sticker.Make(photo);
                if (tex != null && card != null) card.AddSticker(tex);
            }
            catch (System.Exception e) { Debug.LogWarning("[FurSight] sticker: " + e.Message); }
        }

        // ---------------------------------------------------------------- ask

        public bool Listening => _mic.Recording;
        bool _noting;   // the mic is taking a note, not a question

        public void Ask()
        {
            if (_mic.Recording) { _mic.Stop(); return; }   // pressing Ask again finishes the question
            if (Busy || !Ready()) return;
            Busy = true; _noting = false;
            _askShot = PetCamera.Instance.Take();          // what you're looking at, for context
            Sfx.Snap(InFront());
            Clear();
            _status = VerdictCard.Checking(InFront(0.12f), "Ask about what you're looking at", "Listening", Theme.Grape);
            _status.Level = () => _mic.Level;
            _mic.Begin();
        }

        object _pending;   // when FurSight asked something back, the next question is the reply to it

        async void OnQuestion(byte[] wav)
        {
            if (_status != null) _status.Dismiss();
            if (wav == null)
            {
                _last = VerdictCard.Verdict(InFront(), "Didn't catch that", "none", "Press Ask and speak after the ring appears.", null);
                Busy = false;
                return;
            }
            _status = VerdictCard.Checking(InFront(0.12f), "Looking and thinking", "Thinking", Theme.Grape);
            try
            {
                var res = await FurSightApi.Post("/api/ask", new
                {
                    image = "data:image/jpeg;base64," + System.Convert.ToBase64String(_askShot.jpeg),
                    audio = System.Convert.ToBase64String(wav),
                    pet = PetProfile.Current.ForServer(),
                    from = "quest",
                    tz = FoodCheck.TzMinutes,
                    followup = _pending,
                }, 60);
                _pending = null;
                Debug.Log("[FurSight] ask: " + res.ToString(Newtonsoft.Json.Formatting.None));
                if (_status != null) _status.Dismiss();
                string q = (string)res["question"], answer = (string)res["answer"], about = (string)res["about"], verdict = (string)res["verdict"];
                var box = res["box"]?.Type == JTokenType.Array ? res["box"].ToObject<int[]>() : null;
                var at = box != null && box.Length == 4 ? PetCamera.Instance.Locate(_askShot, box) : InFront();
                string kind = verdict == "safe" || verdict == "caution" || verdict == "toxic" || verdict == "vet" ? verdict : "answer";
                string title = string.IsNullOrEmpty(about) ? PetProfile.Current.petName : about;
                if (res["needs"]?.Type == JTokenType.Object)
                {
                    // it couldn't tell, so it asks instead of guessing: press Ask again to reply
                    _pending = new { asked = (string)res["needs"]["ask"], question = q };
                    _last = VerdictCard.Verdict(InFront(), "Quick question", "none", (string)res["needs"]["ask"], "<color=#9A98A6>Press Ask to reply</color>");
                    return;
                }
                string asked = (string.IsNullOrEmpty(q) ? "" : "You asked: " + q) + How(res["steps"]);
                _last = VerdictCard.Verdict(at, title, kind, answer, string.IsNullOrEmpty(asked) ? null : "<color=#9A98A6>" + asked.TrimStart('\n') + "</color>");
                var marks = box != null && box.Length == 4 ? new System.Collections.Generic.List<HubClient.Mark> { new HubClient.Mark { b = box, v = kind, t = title } } : null;
                HubClient.Diary("ask", string.IsNullOrEmpty(q) ? title : q, answer, kind == "answer" ? null : kind, _askShot.jpeg, marks);
                // his sticker on the answer: from the pet cam picture where it found him, else from what you're
                // looking at (if he's in it; SAM finds nothing otherwise and there's no sticker)
                var snap = res["snapshot"] as JObject;
                if (snap != null && snap["found"]?.Type == JTokenType.Boolean && (bool)snap["found"] && !string.IsNullOrEmpty((string)snap["image"]))
                    _ = StickerOn(_last, (string)snap["image"]);
                else
                    _ = StickerOn(_last, "data:image/jpeg;base64," + System.Convert.ToBase64String(_askShot.jpeg));
                // hay, pellets and water measured in what you're looking at: a gauge pinned on each, at its depth
                if (res["marks"] is JArray lm) ShowLevels(lm, _askShot);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] ask failed: " + e.Message);
                if (_status != null) _status.Dismiss();
                _last = VerdictCard.Verdict(InFront(), "Couldn't answer", "none", "Try again in a moment.", null);
            }
            finally { Busy = false; }
        }

        // ---------------------------------------------------------------- note

        public void Note()
        {
            if (_mic.Recording) { _mic.Stop(); return; }   // pressing Note again finishes it
            if (Busy) return;
            if (!HubClient.Linked) { Clear(); _last = VerdictCard.Verdict(InFront(), "Link first", "none", "Notes go in your household's diary. Link this headset in the FurSight app.", null); return; }
            Busy = true; _noting = true;
            Sfx.Tick(InFront());
            Clear();
            _status = VerdictCard.Checking(InFront(0.12f), "Say what you did, like \"fed him a strawberry\"", "Listening", Theme.Ink);
            _status.Level = () => _mic.Level;
            _mic.Begin();
        }

        async void OnNote(byte[] wav)
        {
            _noting = false;
            if (_status != null) _status.Dismiss();
            if (wav == null)
            {
                _last = VerdictCard.Verdict(InFront(), "Didn't catch that", "none", "Press Note and speak after the ring appears.", null);
                Busy = false;
                return;
            }
            _status = VerdictCard.Checking(InFront(0.12f), "Adding it to the diary", "Saving", Theme.Ink);
            try
            {
                var res = await FurSightApi.Post("/api/note", new { audio = System.Convert.ToBase64String(wav), tz = FoodCheck.TzMinutes }, 60);
                Debug.Log("[FurSight] note: " + res.ToString(Newtonsoft.Json.Formatting.None));
                if (_status != null) _status.Dismiss();
                bool toxic = false;
                var lines = new System.Collections.Generic.List<string>();
                foreach (var d in res["done"] as JArray ?? new JArray())
                {
                    if ((string)d["verdict"] == "toxic") toxic = true;
                    if (lines.Count < 3) lines.Add((string)d["said"]);
                }
                _last = VerdictCard.Verdict(InFront(), toxic ? "Careful" : "Added", toxic ? "toxic" : "saved", string.Join("\n", lines),
                    "<color=#9A98A6>You said: " + (string)res["heard"] + "</color>");
                HubClient.Instance?.StartCoroutine(HubClient.Instance.Refresh());
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] note failed: " + e.Message);
                if (_status != null) _status.Dismiss();
                _last = VerdictCard.Verdict(InFront(), "Couldn't save", "none", "Try again in a moment.", null);
            }
            finally { Busy = false; }
        }

        // one line of what the Ask agent looked at and how many answers its checks stopped
        static string How(JToken steps)
        {
            if (steps == null || steps.Type != JTokenType.Array) return "";
            var used = new System.Collections.Generic.List<string>();
            int stopped = 0;
            foreach (var s in steps)
            {
                string tool = (string)s["tool"], label = (string)s["label"] ?? "";
                if ((string)s["kind"] == "check") stopped++;
                string name = (tool == "cam" || tool == "find" || tool == "zoom") && !label.EndsWith("off") ? "pet cam" : tool == "diary" ? "diary" : tool == "care" ? "care plan" : tool == "food" ? "safety list" : null;
                if (name != null && !used.Contains(name)) used.Add(name);
            }
            string line = used.Count > 0 ? "Looked at " + string.Join(", ", used) : "";
            if (stopped > 0) line += (line.Length > 0 ? " · " : "") + stopped + (stopped > 1 ? " answers" : " answer") + " stopped by a check";
            return line.Length > 0 ? "\n" + line : "";
        }

        // ---------------------------------------------------------------- photo

        // crop: the part of the view to keep (PhotoFrame's frame), null = the whole view. at: where the card goes.
        public async void TakePhoto(Rect? crop = null, Vector3? at = null)
        {
            if (Busy || !Ready()) return;
            Busy = true;
            var shot = PetCamera.Instance.Take(crop);
            Sfx.Snap(at ?? InFront());
            StartCoroutine(Juice.Buzz(0.3f, 0.05f));
            Clear();
            string stamp = System.DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
            string dir = Path.Combine(Application.persistentDataPath, "diary");
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, stamp + ".jpg"), shot.jpeg);   // the photo is kept even if the note fails
            var cardAt = at ?? InFront();
            _status = VerdictCard.Checking(cardAt - Vector3.up * 0.04f, "Writing a diary note", "Saving", Theme.Sky);
            try
            {
                var res = await FurSightApi.Post("/api/photo", new { image = "data:image/jpeg;base64," + System.Convert.ToBase64String(shot.jpeg), pet = PetProfile.Current.ForServer() });
                File.WriteAllText(Path.Combine(dir, stamp + ".json"), res.ToString());
                if (_status != null) _status.Dismiss();
                _last = VerdictCard.Verdict(cardAt, (string)res["title"], "saved", (string)res["note"], null);
                HubClient.Diary("photo", (string)res["title"], (string)res["note"], null, shot.jpeg);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] photo note failed: " + e.Message);
                if (_status != null) _status.Dismiss();
                _last = VerdictCard.Verdict(cardAt, "Photo saved", "saved", "Couldn't write a note just now; the picture is in the diary.", null);
            }
            finally { Busy = false; }
        }

        bool Ready()
        {
            if (PetCamera.Instance != null && PetCamera.Instance.Ready) return true;
            Debug.LogWarning("[FurSight] camera not ready");
            return false;
        }

        void Clear()
        {
            if (_last != null) _last.Dismiss();
            if (_status != null) _status.Dismiss();
        }
    }
}
