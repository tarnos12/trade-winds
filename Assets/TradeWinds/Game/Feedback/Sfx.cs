using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Soft procedural sounds and an ambient bed (GDD §12), synthesised at start-up — no audio files.
    /// Mute with M or the HUD button; the choice is remembered.</summary>
    public sealed class Sfx : MonoBehaviour
    {
        const int Rate = 44100;
        const string MuteKey = "tw_muted";
        public float Master = 0.22f;

        AudioSource _oneShots, _ambient;
        AudioClip _place, _trade, _construct, _fanfare, _ambientLoop;
        float _lastTrade;

        public bool Muted { get; private set; }

        void Awake()
        {
            Muted = PlayerPrefs.GetInt(MuteKey, 0) == 1;
            var cam = Camera.main;
            if (cam != null && cam.GetComponent<AudioListener>() == null && FindFirstObjectByType<AudioListener>() == null)
                cam.gameObject.AddComponent<AudioListener>();

            _oneShots = gameObject.AddComponent<AudioSource>();
            _oneShots.playOnAwake = false;
            _ambient = gameObject.AddComponent<AudioSource>();
            _ambient.playOnAwake = false;
            _ambient.loop = true;

            _place = Make("place", 0.18f, Place);
            _trade = Make("trade", 0.5f, Trade);
            _construct = Make("construct", 0.7f, Construct);
            _fanfare = Make("fanfare", 1.3f, Fanfare);
            _ambientLoop = Make("ambient", 12f, Ambient);
            _ambient.clip = _ambientLoop;
            _ambient.volume = Master * 0.55f;
        }

        public void ToggleMute()
        {
            Muted = !Muted;
            PlayerPrefs.SetInt(MuteKey, Muted ? 1 : 0);
            SetAmbient(_ambientWanted);
        }

        bool _ambientWanted;

        /// <summary>Ambient plays while a realm is open (not on the start screen) and sound is on.</summary>
        public void SetAmbient(bool on)
        {
            _ambientWanted = on;
            bool play = on && !Muted;
            if (play && !_ambient.isPlaying) _ambient.Play();
            else if (!play && _ambient.isPlaying) _ambient.Pause();
        }

        public void PlayPlace() => Play(_place, 0.8f);
        public void PlayConstruct() => Play(_construct, 0.7f);
        public void PlayFanfare() => Play(_fanfare, 0.9f);

        /// <summary>Coin chime for Tariff income, throttled so busy markets don't clatter.</summary>
        public void PlayTrade()
        {
            if (Time.unscaledTime - _lastTrade < 0.55f) return;
            _lastTrade = Time.unscaledTime;
            Play(_trade, 0.5f);
        }

        void Play(AudioClip clip, float volume)
        {
            if (Muted || clip == null) return;
            _oneShots.PlayOneShot(clip, volume * Master);
        }

        // ------------------------------------------------------------------ synthesis

        delegate void Writer(float[] s);

        static AudioClip Make(string name, float seconds, Writer write)
        {
            var samples = new float[Mathf.CeilToInt(seconds * Rate)];
            write(samples);
            var clip = AudioClip.Create(name, samples.Length, 1, Rate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        static float Env(float t, float attack, float decay) => t < attack ? t / attack : Mathf.Exp(-(t - attack) / decay);

        static void AddTone(float[] s, float start, float freq, float amp, float attack, float decay, float overtone = 0.25f)
        {
            int from = (int)(start * Rate);
            for (int i = from; i < s.Length; i++)
            {
                float t = (i - from) / (float)Rate;
                float e = Env(t, attack, decay);
                if (e < 0.0005f && t > attack) break;
                float ph = 2f * Mathf.PI * freq * t;
                s[i] += amp * e * (Mathf.Sin(ph) + overtone * Mathf.Sin(2f * ph));
            }
        }

        /// <summary>A wooden "tok": a short damped low tone plus a soft click.</summary>
        static void Place(float[] s)
        {
            AddTone(s, 0, 190f, 0.6f, 0.002f, 0.035f, 0.5f);
            var rng = new System.Random(1);
            float lp = 0;
            for (int i = 0; i < Rate * 0.02f && i < s.Length; i++)
            {
                lp += 0.3f * ((float)rng.NextDouble() * 2 - 1 - lp);
                s[i] += lp * 0.4f * (1 - i / (Rate * 0.02f));
            }
        }

        /// <summary>A two-note coin chime.</summary>
        static void Trade(float[] s)
        {
            AddTone(s, 0, 1318.5f, 0.22f, 0.003f, 0.12f, 0.1f);
            AddTone(s, 0.08f, 1760f, 0.2f, 0.003f, 0.18f, 0.1f);
        }

        /// <summary>Two mallet thunks and a soft chime: a building is finished.</summary>
        static void Construct(float[] s)
        {
            AddTone(s, 0, 150f, 0.5f, 0.002f, 0.05f, 0.6f);
            AddTone(s, 0.12f, 170f, 0.5f, 0.002f, 0.05f, 0.6f);
            AddTone(s, 0.26f, 784f, 0.22f, 0.005f, 0.25f, 0.15f);
        }

        /// <summary>C–E–G–C: a Mission is complete.</summary>
        static void Fanfare(float[] s)
        {
            float[] notes = { 523.25f, 659.25f, 783.99f, 1046.5f };
            for (int i = 0; i < notes.Length; i++) AddTone(s, i * 0.13f, notes[i], 0.22f, 0.01f, i == 3 ? 0.5f : 0.22f, 0.2f);
        }

        /// <summary>A quiet bed: filtered-noise wind with a slow swell over two soft drones; loops seamlessly.</summary>
        static void Ambient(float[] s)
        {
            int n = s.Length, fade = Rate / 2;
            var buf = new float[n + fade];
            var rng = new System.Random(7);
            float lp1 = 0, lp2 = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                float t = i / (float)Rate;
                lp1 += 0.02f * ((float)rng.NextDouble() * 2 - 1 - lp1);
                lp2 += 0.02f * (lp1 - lp2);
                float swell = 0.55f + 0.45f * Mathf.Sin(2f * Mathf.PI * t / 6f);
                float wind = lp2 * 6f * swell;
                float drone = 0.05f * Mathf.Sin(2f * Mathf.PI * 110f * t) + 0.04f * Mathf.Sin(2f * Mathf.PI * 110.5f * t) + 0.025f * Mathf.Sin(2f * Mathf.PI * 165f * t);
                buf[i] = Mathf.Clamp(wind + drone, -1f, 1f) * 0.6f;
            }
            // The loop's end runs on into buf[n..]; blend that overhang into the start so the seam is continuous.
            for (int i = 0; i < n; i++)
            {
                float k = i < fade ? i / (float)fade : 1f;
                s[i] = buf[i] * k + (i < fade ? buf[n + i] * (1 - k) : 0f);
            }
        }
    }
}
