using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace FurSight
{
    // The three things you can do from the hand menu:
    //   Check food: one frame to /api/food (FoodCheck does it)
    //   Ask: a frame for context + your spoken question (MicRecorder) to /api/ask, answer pinned to what it's about
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
            _mic.Finished += OnQuestion;
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

        // ---------------------------------------------------------------- ask

        public bool Listening => _mic.Recording;

        public void Ask()
        {
            if (_mic.Recording) { _mic.Stop(); return; }   // pressing Ask again finishes the question
            if (Busy || !Ready()) return;
            Busy = true;
            _askShot = PetCamera.Instance.Take();          // what you're looking at, for context
            Sfx.Snap(InFront());
            Clear();
            _status = VerdictCard.Checking(InFront(0.12f), "Ask about what you're looking at", "Listening", Theme.Grape);
            _status.Level = () => _mic.Level;
            _mic.Begin();
        }

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
                }, 60);
                Debug.Log("[FurSight] ask: " + res.ToString(Newtonsoft.Json.Formatting.None));
                if (_status != null) _status.Dismiss();
                string q = (string)res["question"], answer = (string)res["answer"], about = (string)res["about"], verdict = (string)res["verdict"];
                var box = res["box"]?.Type == JTokenType.Array ? res["box"].ToObject<int[]>() : null;
                var at = box != null && box.Length == 4 ? _askShot.WorldPoint(box) : InFront();
                string kind = verdict == "safe" || verdict == "caution" || verdict == "toxic" || verdict == "vet" ? verdict : "answer";
                string title = string.IsNullOrEmpty(about) ? PetProfile.Current.petName : about;
                string asked = string.IsNullOrEmpty(q) ? null : "<color=#9A98A6>You asked: " + q + "</color>";
                _last = VerdictCard.Verdict(at, title, kind, answer, asked);
                HubClient.Diary("ask", string.IsNullOrEmpty(q) ? title : q, answer, kind == "answer" ? null : kind, _askShot.jpeg);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[FurSight] ask failed: " + e.Message);
                if (_status != null) _status.Dismiss();
                _last = VerdictCard.Verdict(InFront(), "Couldn't answer", "none", "Try again in a moment.", null);
            }
            finally { Busy = false; }
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
