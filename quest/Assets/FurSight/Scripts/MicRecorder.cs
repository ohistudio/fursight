using System;
using UnityEngine;

namespace FurSight
{
    // Records one spoken question from the headset mic at 16 kHz mono and hands it back as a WAV
    // (what Muse Voice Transcribe takes). Stops on its own after a pause once you've said something,
    // or at maxSeconds; Stop() ends it early.
    public class MicRecorder : MonoBehaviour
    {
        public const int Rate = 16000;
        public int maxSeconds = 10;
        public float silenceToStop = 1.2f;   // seconds of quiet after speech
        public float speechLevel = 0.02f;    // RMS above this counts as talking

        public bool Recording { get; private set; }
        public float Level { get; private set; }   // 0-1, for the listening card
        public event Action<byte[]> Finished;      // the WAV, or null if nothing was said

        AudioClip _clip;
        string _device;
        bool _heard;
        float _quietFor, _started;

        public void Begin()
        {
            if (Recording) return;
            Permissions.Ask(UnityEngine.Android.Permission.Microphone, ok =>
            {
                if (!ok || Microphone.devices.Length == 0) { Debug.LogWarning("[FurSight] no microphone"); Finished?.Invoke(null); return; }
                _device = Microphone.devices[0];
                _clip = Microphone.Start(_device, false, maxSeconds, Rate);
                Recording = true; _heard = false; _quietFor = 0f; _started = Time.time;
            });
        }

        public void Stop()
        {
            if (!Recording) return;
            int end = Microphone.GetPosition(_device);
            Microphone.End(_device);
            Recording = false;
            Level = 0f;
            if (!_heard || end <= 0) { Finished?.Invoke(null); return; }
            var samples = new float[end];
            _clip.GetData(samples, 0);
            Finished?.Invoke(Wav(samples));
        }

        void Update()
        {
            if (!Recording) return;
            int pos = Microphone.GetPosition(_device);
            if (pos > 512)
            {
                var tail = new float[512];
                _clip.GetData(tail, pos - 512);
                float sum = 0f;
                foreach (var v in tail) sum += v * v;
                float rms = Mathf.Sqrt(sum / tail.Length);
                Level = Mathf.Clamp01(rms * 12f);
                if (rms > speechLevel) { _heard = true; _quietFor = 0f; }
                else if (_heard) _quietFor += Time.deltaTime;
            }
            if ((_heard && _quietFor > silenceToStop) || Time.time - _started > maxSeconds - 0.2f) Stop();
        }

        static byte[] Wav(float[] samples)
        {
            var bytes = new byte[44 + samples.Length * 2];
            void Str(int at, string s) { for (int i = 0; i < 4; i++) bytes[at + i] = (byte)s[i]; }
            void I32(int at, int v) => BitConverter.GetBytes(v).CopyTo(bytes, at);
            void I16(int at, short v) => BitConverter.GetBytes(v).CopyTo(bytes, at);
            Str(0, "RIFF"); I32(4, 36 + samples.Length * 2); Str(8, "WAVE");
            Str(12, "fmt "); I32(16, 16); I16(20, 1); I16(22, 1); I32(24, Rate); I32(28, Rate * 2); I16(32, 2); I16(34, 16);
            Str(36, "data"); I32(40, samples.Length * 2);
            for (int i = 0; i < samples.Length; i++) I16(44 + i * 2, (short)(Mathf.Clamp(samples[i], -1f, 1f) * 32767f));
            return bytes;
        }
    }
}
