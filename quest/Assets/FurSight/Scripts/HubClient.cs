using System.Collections;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace FurSight
{
    // The Quest's place in a FurSight household. First run: it asks the hub for a 4-letter code and shows it on a
    // card ("enter K7Q2 in the FurSight app"); once your phone enters it, the hub hands this headset its own key,
    // which is kept on the device. From then on the pet comes from the household (name, species, breed, notes),
    // the pet cam list too, and every check, answer and photo is written to the shared diary.
    public class HubClient : MonoBehaviour
    {
        public string hub = "https://fursight-cam.wibble-crossplay.workers.dev";
        public static HubClient Instance { get; private set; }
        public static string Token => PlayerPrefs.GetString("fs.hubToken", "");
        public static bool Linked => !string.IsNullOrEmpty(Token);
        public JObject Me { get; private set; }

        VerdictCard _codeCard;

        void Awake() => Instance = this;

        IEnumerator Start()
        {
            yield return null;   // let the camera rig settle so the card lands in front of you
            if (Linked) yield return Refresh(); else yield return Link();
        }

        // ---------------------------------------------------------------- linking

        IEnumerator Link()
        {
            var start = Send("POST", "/hub/link/start", new { kind = "quest", name = SystemInfo.deviceModel.Contains("Quest") ? SystemInfo.deviceModel : "Quest" }, false);
            yield return start.SendWebRequest();
            if (start.result != UnityWebRequest.Result.Success) { Debug.LogWarning("[FurSight] hub unreachable: " + start.error); yield break; }
            var s = JObject.Parse(start.downloadHandler.text);
            string code = (string)s["code"], nonce = (string)s["nonce"];
            var head = Camera.main.transform;
            _codeCard = VerdictCard.Verdict(head.position + head.forward * 0.6f, "Link to FurSight", "none",
                $"In the FurSight app on your phone, open Devices, tap Link a device and enter\n<size=180%><color=#2B2A33>{string.Join(" ", code.ToCharArray())}</color></size>", null);
            _codeCard.KeepOpen();
            while (true)
            {
                yield return new WaitForSeconds(1.8f);
                var poll = Send("GET", $"/hub/link/poll?code={code}&nonce={nonce}", null, false);
                yield return poll.SendWebRequest();
                if (poll.result != UnityWebRequest.Result.Success) continue;
                var p = JObject.Parse(poll.downloadHandler.text);
                string status = (string)p["status"];
                if (status == "expired") { _codeCard.Dismiss(); yield return Link(); yield break; }
                if (status != "linked") continue;
                PlayerPrefs.SetString("fs.hubToken", (string)p["token"]);
                PlayerPrefs.Save();
                _codeCard.Dismiss();
                yield return Refresh();
                var pet = PetProfile.Current;
                VerdictCard.Verdict(head.position + head.forward * 0.6f, "Linked", "linked", pet != null ? $"Looking after {pet.petName} together." : "This Quest is part of your household now.", null);
                yield break;
            }
        }

        public void Unlink() { PlayerPrefs.DeleteKey("fs.hubToken"); PlayerPrefs.Save(); Me = null; StartCoroutine(Link()); }

        // the household: who the pet is, and which cameras there are
        public IEnumerator Refresh()
        {
            var r = Send("GET", "/hub/me", null, true);
            yield return r.SendWebRequest();
            if (r.responseCode == 401) { Debug.LogWarning("[FurSight] this Quest was unlinked"); Unlink(); yield break; }
            if (r.result != UnityWebRequest.Result.Success) yield break;
            Me = JObject.Parse(r.downloadHandler.text);
            var pet = (Me["pets"] as JArray)?.Count > 0 ? Me["pets"][0] : null;
            var profile = PetProfile.Current;
            if (pet != null && profile != null)
            {
                profile.petName = (string)pet["name"] ?? profile.petName;
                profile.species = (string)pet["species"] ?? profile.species;
                profile.breed = (string)pet["breed"] ?? profile.breed;
                string sex = (string)pet["sex"], notes = (string)pet["notes"];
                profile.notes = (sex == "male" ? "Male (he/him). " : sex == "female" ? "Female (she/her). " : "") + (notes ?? "");
            }
            var cams = Me["cams"] as JArray;
            if (cams != null && cams.Count > 0) FurSightApi.UseCam((string)cams[0]["channel"], (string)cams[0]["name"]);
            Debug.Log($"[FurSight] household {Me["household"]}: {profile?.petName}, {cams?.Count ?? 0} camera(s)");
        }

        // ---------------------------------------------------------------- the diary

        // fire and forget: a check, an answer or a photo, with the picture
        public static void Diary(string kind, string title, string note, string verdict, byte[] jpeg)
        {
            if (!Linked || Instance == null) return;
            Instance.StartCoroutine(Instance.Post(kind, title, note, verdict, jpeg));
        }

        IEnumerator Post(string kind, string title, string note, string verdict, byte[] jpeg)
        {
            var r = Send("POST", "/hub/diary", new { kind, title, note, verdict, pet = PetProfile.Current?.petName, image = jpeg != null ? "data:image/jpeg;base64," + System.Convert.ToBase64String(jpeg) : null }, true);
            yield return r.SendWebRequest();
            if (r.result != UnityWebRequest.Result.Success) Debug.LogWarning("[FurSight] diary: " + r.error + " " + r.downloadHandler?.text);
        }

        UnityWebRequest Send(string method, string path, object body, bool auth)
        {
            var req = new UnityWebRequest(hub.TrimEnd('/') + path, method) { downloadHandler = new DownloadHandlerBuffer(), timeout = 15 };
            if (body != null)
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(body, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore })));
                req.SetRequestHeader("Content-Type", "application/json");
            }
            if (auth) req.SetRequestHeader("Authorization", "Bearer " + Token);
            return req;   // the caller yields on req.SendWebRequest()
        }
    }
}
