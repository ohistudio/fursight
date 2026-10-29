using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace FurSight
{
    // Talks to the FurSight server (server/ in the repo). The Meta key never comes near the headset: the
    // server holds it, and the app proves it's ours with a shared token. Both settings live in
    // Resources/fursight_local.json, which git ignores:  { "server": "https://...", "token": "..." }
    public static class FurSightApi
    {
        [System.Serializable] class Local { public string server; public string token; public string camRelay; public string camChannel; public string camName; }

        static Local _local;
        static Local Settings
        {
            get
            {
                if (_local != null) return _local;
                var file = Resources.Load<TextAsset>("fursight_local");
                _local = file != null ? JsonConvert.DeserializeObject<Local>(file.text) : new Local();
                if (string.IsNullOrEmpty(_local.server)) Debug.LogWarning("[FurSight] no server set: add Resources/fursight_local.json");
                return _local;
            }
        }

        // the pet cam to watch (until the household lists its cameras): relay base URL + channel id
        // the household's camera wins over the one in the local settings file
        static string _camChannel, _camName, _camClip;
        public static void UseCam(string channel, string name, string clip = null) { _camChannel = channel; _camName = name; _camClip = clip; }
        // a cam playing a recording: the clip's address on the web app, so the window plays it itself (smoothly)
        public static string CamClip => string.IsNullOrEmpty(_camClip) ? null : Settings.server.TrimEnd('/') + _camClip;
        public static string CamRelay => string.IsNullOrEmpty(Settings.camRelay) ? "https://fursight-cam.wibble-crossplay.workers.dev" : Settings.camRelay;
        public static string CamChannel => _camChannel ?? Settings.camChannel;
        public static string CamName => _camName ?? (string.IsNullOrEmpty(Settings.camName) ? "Pet cam" : Settings.camName);

        // A server that hasn't been called for a while takes seconds to wake (a "cold start"). Knock once at launch
        // so the first real check doesn't pay for it. Any answer will do, even "POST only".
        public static async void Warm()
        {
            if (string.IsNullOrEmpty(Settings.server)) return;
            using var req = UnityWebRequest.Get(Settings.server.TrimEnd('/') + "/api/food");
            req.timeout = 10;
            var op = req.SendWebRequest();
            while (!op.isDone) await Task.Yield();
        }

        public static async Task<JObject> Post(string path, object body, int timeoutSeconds = 45)
        {
            var url = Settings.server.TrimEnd('/') + path;
            using var req = new UnityWebRequest(url, "POST");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(body)));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            if (!string.IsNullOrEmpty(Settings.token)) req.SetRequestHeader("x-fursight-app", Settings.token);
            if (HubClient.Linked) req.SetRequestHeader("Authorization", "Bearer " + HubClient.Token);
            req.timeout = timeoutSeconds;
            var op = req.SendWebRequest();
            while (!op.isDone) await Task.Yield();
            if (req.result != UnityWebRequest.Result.Success)
                throw new System.Exception($"{path}: {req.responseCode} {req.error} {req.downloadHandler?.text}");
            return JObject.Parse(req.downloadHandler.text);
        }
    }
}
