using System.Collections.Generic;
using TradeWinds.Core;
using UnityEngine;

namespace TradeWinds.Game
{
    /// <summary>Watches the World for things worth celebrating (a sale, a finished building, a Mission) and turns
    /// them into juice and sound. Reads the core only (ADR 0002); a new or loaded realm resets it silently.</summary>
    public sealed class Feedback : MonoBehaviour
    {
        GameController _game;
        Juice _juice;
        Sfx _sfx;
        World _world;

        readonly Dictionary<Town, double> _tariff = new Dictionary<Town, double>();
        readonly Dictionary<Town, bool> _townBuilt = new Dictionary<Town, bool>();
        readonly Dictionary<Building, (bool built, int level)> _buildings = new Dictionary<Building, (bool, int)>();
        readonly Dictionary<Building, float> _smoke = new Dictionary<Building, float>();
        int _compound, _mission;
        bool _victory;

        public void Init(GameController game, Juice juice, Sfx sfx)
        {
            _game = game;
            _juice = juice;
            _sfx = sfx;
        }

        void Snapshot()
        {
            _world = _game.World;
            _tariff.Clear();
            _townBuilt.Clear();
            _buildings.Clear();
            _smoke.Clear();
            _juice.Clear();
            foreach (var t in _world.Towns)
            {
                _tariff[t] = t.TariffGenerated;
                _townBuilt[t] = t.Built;
                foreach (var b in t.Buildings) _buildings[b] = (b.Built, b.Level);
            }
            _compound = _world.Castle?.Compound.Count ?? 0;
            _mission = _world.MissionIndex;
            _victory = _world.Victory;
        }

        Vector3 At(Hex h) => _game.Board.HexToWorld(h);

        void Update()
        {
            if (_game == null || _game.World == null) return;
            _sfx.SetAmbient(!_game.MenuOpen);
            if (_world != _game.World)
            {
                Snapshot();
                return;
            }
            if (_game.MenuOpen) return;

            foreach (var t in _world.Towns)
            {
                // Sales: the Town's Tariff contribution grew.
                _tariff.TryGetValue(t, out double before);
                double gained = t.TariffGenerated - before;
                if (gained >= 0.5)
                {
                    _juice.CoinBurst(At(t.Center), gained > 20 ? 10 : 6);
                    _juice.Popup(At(t.Center), "+" + gained.ToString("0"), Palette.Castle);
                    _sfx.PlayTrade();
                }
                _tariff[t] = t.TariffGenerated;

                if (_townBuilt.TryGetValue(t, out bool wasBuilt))
                {
                    if (!wasBuilt && t.Built)
                    {
                        _juice.BuildBurst(At(t.Center), Palette.Good);
                        _sfx.PlayConstruct();
                    }
                }
                else _sfx.PlayPlace();
                _townBuilt[t] = t.Built;

                foreach (var b in t.Buildings)
                {
                    if (!_buildings.TryGetValue(b, out var prev))
                    {
                        _sfx.PlayPlace();
                        _buildings[b] = (b.Built, b.Level);
                        continue;
                    }
                    if (!prev.built && b.Built)
                    {
                        _juice.BuildBurst(At(b.Hex), Palette.Good);
                        _sfx.PlayConstruct();
                    }
                    else if (b.Level > prev.level)
                    {
                        _juice.BuildBurst(At(b.Hex), Palette.Castle);
                        _sfx.PlayConstruct();
                    }
                    _buildings[b] = (b.Built, b.Level);
                }
            }

            int compound = _world.Castle?.Compound.Count ?? 0;
            if (compound > _compound)
            {
                var cb = _world.Castle.Compound[compound - 1];
                _juice.BuildBurst(At(cb.Hex), Palette.Castle);
                _sfx.PlayConstruct();
            }
            _compound = compound;

            if (_world.MissionIndex > _mission || (_world.Victory && !_victory)) _sfx.PlayFanfare();
            _mission = _world.MissionIndex;
            _victory = _world.Victory;

            if (_game.Speed > 0) EmitSmoke();
        }

        /// <summary>Working producers puff smoke now and then (a sign of life; idle buildings stay still).</summary>
        void EmitSmoke()
        {
            float now = Time.unscaledTime;
            foreach (var t in _world.Towns)
            foreach (var b in t.Buildings)
            {
                if (!b.Built || !b.IsWorkplace || b.IsUpgrading || b.Workers < 0.05) continue;
                if (_smoke.TryGetValue(b, out float next) && now < next) continue;
                _smoke[b] = now + Random.Range(1.4f, 2.4f) / Mathf.Max(1, _game.Speed);
                _juice.Smoke(At(b.Hex) + new Vector3(0.12f, 0.2f, 0));
            }
        }
    }
}
