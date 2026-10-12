using System.Collections.Generic;
using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Light visual feedback (GDD §12): coin bursts and +Tariff numbers on sales, chimney smoke,
    /// build-complete bursts. Pooled sprites, capped, driven by real time so it keeps moving while paused.</summary>
    public sealed class Juice : MonoBehaviour
    {
        const int MaxParticles = 240;
        const int MaxPopups = 24;
        const int Order = 22;

        sealed class Particle
        {
            public SpriteRenderer Sr;
            public Vector3 Velocity;
            public float Life, MaxLife, StartScale, EndScale, Gravity;
            public Color Color;
        }

        sealed class FloatText
        {
            public TextMesh Text;
            public float Life;
        }

        readonly List<Particle> _live = new List<Particle>();
        readonly Stack<Particle> _free = new Stack<Particle>();
        readonly List<FloatText> _popups = new List<FloatText>();
        Transform _root;
        Font _font;

        void Awake()
        {
            _root = new GameObject("Juice").transform;
            _root.SetParent(transform, false);
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        public void Clear()
        {
            foreach (var p in _live) Release(p);
            _live.Clear();
            foreach (var p in _popups) Destroy(p.Text.gameObject);
            _popups.Clear();
        }

        // ------------------------------------------------------------------ effects

        public void CoinBurst(Vector3 at, int count = 8)
        {
            for (int i = 0; i < count; i++)
            {
                float a = Random.Range(0.25f, 0.75f) * Mathf.PI;
                float speed = Random.Range(1.2f, 2.2f);
                Spawn(at, new Vector3(Mathf.Cos(a), Mathf.Sin(a)) * speed, Random.Range(0.55f, 0.8f), 0.12f, 0.06f, 4.5f, Palette.Castle);
            }
        }

        public void Smoke(Vector3 chimney)
        {
            var c = new Color(0.85f, 0.82f, 0.78f, 0.55f);
            Spawn(chimney + new Vector3(Random.Range(-0.05f, 0.05f), 0, 0),
                new Vector3(Random.Range(-0.08f, 0.08f), Random.Range(0.35f, 0.5f)), Random.Range(1.6f, 2.2f), 0.08f, 0.26f, -0.05f, c);
        }

        public void BuildBurst(Vector3 at, Color color)
        {
            const int n = 12;
            for (int i = 0; i < n; i++)
            {
                float a = i / (float)n * Mathf.PI * 2f;
                Spawn(at, new Vector3(Mathf.Cos(a), Mathf.Sin(a)) * 1.3f, 0.5f, 0.11f, 0.03f, 0f, color);
            }
        }

        public void Popup(Vector3 at, string text, Color color)
        {
            if (_popups.Count >= MaxPopups)
            {
                Destroy(_popups[0].Text.gameObject);
                _popups.RemoveAt(0);
            }
            var go = new GameObject("Popup");
            go.transform.SetParent(_root, false);
            go.transform.position = at + new Vector3(0, 0.35f, 0);
            var tm = go.AddComponent<TextMesh>();
            tm.text = text;
            tm.font = _font;
            tm.fontSize = 48;
            tm.characterSize = 0.045f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.fontStyle = FontStyle.Bold;
            tm.color = color;
            var mr = go.GetComponent<MeshRenderer>();
            mr.sharedMaterial = _font.material;
            mr.sortingOrder = Order + 1;
            _popups.Add(new FloatText { Text = tm, Life = 1.2f });
        }

        // ------------------------------------------------------------------ simulation

        void Spawn(Vector3 at, Vector3 velocity, float life, float startScale, float endScale, float gravity, Color color)
        {
            if (_live.Count >= MaxParticles) return;
            var p = _free.Count > 0 ? _free.Pop() : NewParticle();
            p.Sr.gameObject.SetActive(true);
            p.Sr.transform.position = at;
            p.Velocity = velocity;
            p.Life = p.MaxLife = life;
            p.StartScale = startScale;
            p.EndScale = endScale;
            p.Gravity = gravity;
            p.Color = color;
            _live.Add(p);
        }

        Particle NewParticle()
        {
            var go = new GameObject("Particle");
            go.transform.SetParent(_root, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = SpriteFactory.Circle;
            sr.sortingOrder = Order;
            return new Particle { Sr = sr };
        }

        void Release(Particle p)
        {
            p.Sr.gameObject.SetActive(false);
            _free.Push(p);
        }

        void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.1f);
            for (int i = _live.Count - 1; i >= 0; i--)
            {
                var p = _live[i];
                p.Life -= dt;
                if (p.Life <= 0)
                {
                    Release(p);
                    _live.RemoveAt(i);
                    continue;
                }
                float t = 1f - p.Life / p.MaxLife;
                p.Velocity.y -= p.Gravity * dt;
                p.Velocity *= 1f - 1.5f * dt;
                p.Sr.transform.position += p.Velocity * dt;
                p.Sr.transform.localScale = Vector3.one * Mathf.Lerp(p.StartScale, p.EndScale, t);
                var c = p.Color;
                c.a *= 1f - t * t;
                p.Sr.color = c;
            }

            for (int i = _popups.Count - 1; i >= 0; i--)
            {
                var p = _popups[i];
                p.Life -= dt;
                if (p.Life <= 0)
                {
                    Destroy(p.Text.gameObject);
                    _popups.RemoveAt(i);
                    continue;
                }
                p.Text.transform.position += new Vector3(0, 0.45f * dt, 0);
                var c = p.Text.color;
                c.a = Mathf.Clamp01(p.Life / 0.5f);
                p.Text.color = c;
            }
        }
    }
}
