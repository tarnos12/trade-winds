using System.Collections.Generic;
using TradeWinds.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace TradeWinds.Game
{
    public enum ToolKind
    {
        Inspect,
        Town,
        Building,
        Road,
        RemoveRoad,
    }

    /// <summary>Owns the World, drives the fixed 500 ms economy tick (× speed), and turns input into commands.</summary>
    public sealed class GameController : MonoBehaviour
    {
        public BoardView Board;
        public CameraRig CameraRig;
        public Hud Hud;
        [Tooltip("0 = random seed each new game.")]
        public uint Seed;
        [Tooltip("Pause the economy when the window loses focus (GDD §3).")]
        public bool PauseOnFocusLoss = true;

        public World World { get; private set; }
        public GeneratedMap Map { get; private set; }
        public uint CurrentSeed { get; private set; }
        public int Speed { get; private set; } = 1;
        public ToolKind Tool { get; private set; } = ToolKind.Inspect;
        public BuildingDef ToolBuilding { get; private set; }
        public Town SelectedTown { get; private set; }
        public string HoverHint { get; private set; } = "";

        int _speedBeforePause = 1;
        bool _focusPaused;
        double _accumulator;
        readonly Queue<(long tick, double tariff)> _tariffSamples = new Queue<(long, double)>();

        const float SecondsPerTick = 0.5f;
        const int MaxCatchUpTicks = 8;

        void Start()
        {
            NewGame(Seed != 0 ? Seed : (uint)System.Environment.TickCount);
        }

        public void NewGame(uint seed)
        {
            CurrentSeed = seed;
            Map = MapGen.Generate(seed);
            World = new World(PeasantContent.Create(), Map.Board, seed);
            Board.Bind(World);
            var center = Board.HexToWorld(Map.Start);
            CameraRig.CenterOn(center);
            var min = Board.HexToWorld(Core.Board.FromOffset(0, 0));
            var max = Board.HexToWorld(Core.Board.FromOffset(Map.Board.Width - 1, Map.Board.Height - 1));
            CameraRig.Bounds = Rect.MinMaxRect(min.x, min.y, max.x, max.y);
            SelectedTown = null;
            Tool = ToolKind.Inspect;
            _accumulator = 0;
            _tariffSamples.Clear();
            SetSpeed(1);
            Hud?.OnNewGame(this);
            Hud?.Toast("A new realm. Found your first Town on open ground near the green fields.");
        }

        // ------------------------------------------------------------------ speed & tools

        public void SetSpeed(int speed)
        {
            if (speed > 0) _speedBeforePause = speed;
            Speed = speed;
        }

        public void TogglePause() => SetSpeed(Speed == 0 ? _speedBeforePause : 0);

        public void SelectTool(ToolKind tool, BuildingDef building = null)
        {
            Tool = tool;
            ToolBuilding = building;
        }

        public void SelectTown(Town town)
        {
            SelectedTown = town;
            Board.SetSelection(town);
        }

        /// <summary>Tariff earned over the last game-minute.</summary>
        public double TariffPerMinute()
        {
            if (_tariffSamples.Count < 2) return 0;
            var first = _tariffSamples.Peek();
            double minutes = (World.Tick - first.tick) / 120.0;
            return minutes > 0 ? (World.LifetimeTariff - first.tariff) / minutes : 0;
        }

        // ------------------------------------------------------------------ loop

        void Update()
        {
            if (World == null) return;
            HandleKeys();

            bool overUi = Hud != null && Hud.IsPointerOverUi();
            CameraRig.Tick(overUi);
            HandlePointer(overUi);

            if (Speed > 0 && !_focusPaused)
            {
                _accumulator += Time.unscaledDeltaTime * Speed;
                int steps = 0;
                while (_accumulator >= SecondsPerTick && steps < MaxCatchUpTicks)
                {
                    World.Step();
                    _accumulator -= SecondsPerTick;
                    steps++;
                    if (World.Tick % 10 == 0)
                    {
                        _tariffSamples.Enqueue((World.Tick, World.LifetimeTariff));
                        while (_tariffSamples.Count > 13) _tariffSamples.Dequeue();
                    }
                }
                if (steps == MaxCatchUpTicks) _accumulator = 0;
            }

            Board.Render(Speed > 0 && !_focusPaused ? (float)(_accumulator / SecondsPerTick) : 0f);
        }

        void OnApplicationFocus(bool focus)
        {
            _focusPaused = PauseOnFocusLoss && !focus && !Application.isEditor;
        }

        public bool IsFocusPaused => _focusPaused;

        void HandleKeys()
        {
            var kb = Keyboard.current;
            if (kb == null) return;
            if (kb.spaceKey.wasPressedThisFrame) TogglePause();
            if (kb.digit1Key.wasPressedThisFrame) SetSpeed(1);
            if (kb.digit2Key.wasPressedThisFrame) SetSpeed(2);
            if (kb.digit4Key.wasPressedThisFrame) SetSpeed(4);
            if (kb.escapeKey.wasPressedThisFrame)
            {
                if (Tool != ToolKind.Inspect) SelectTool(ToolKind.Inspect);
                else SelectTown(null);
            }
        }

        void HandlePointer(bool overUi)
        {
            var mouse = Mouse.current;
            if (mouse == null) return;
            if (overUi)
            {
                Board.SetHover(null, false);
                HoverHint = "";
                return;
            }

            var world = CameraRig.ScreenToWorld(mouse.position.ReadValue());
            var hex = Board.WorldToHex(world);
            if (!World.Board.Contains(hex))
            {
                Board.SetHover(null, false);
                HoverHint = "";
                return;
            }

            var check = Check(hex);
            Board.SetHover(hex, check.Ok);
            HoverHint = Describe(hex) + (Tool == ToolKind.Inspect ? "" : check.Ok ? "" : "  —  " + check.Reason);

            bool click = mouse.leftButton.wasPressedThisFrame;
            bool paint = mouse.leftButton.isPressed && (Tool == ToolKind.Road || Tool == ToolKind.RemoveRoad);
            if (!click && !paint) return;
            Apply(hex, click);
        }

        CommandResult Check(Hex hex)
        {
            switch (Tool)
            {
                case ToolKind.Town: return World.CanFoundTown(hex);
                case ToolKind.Building: return World.CanPlaceBuilding(ToolBuilding, hex, out _);
                case ToolKind.Road:
                    if (World.Roads.Contains(hex)) return CommandResult.Fail("Already a road.");
                    return World.Board.IsPassable(hex) ? CommandResult.Success : CommandResult.Fail("Roads can't cross water or mountains.");
                case ToolKind.RemoveRoad:
                    return World.Roads.Contains(hex) ? CommandResult.Success : CommandResult.Fail("No road here.");
                default: return CommandResult.Success;
            }
        }

        void Apply(Hex hex, bool click)
        {
            switch (Tool)
            {
                case ToolKind.Town:
                {
                    var r = World.FoundTown(hex, out var town);
                    if (r.Ok)
                    {
                        SelectTown(town);
                        SelectTool(ToolKind.Inspect);
                        Hud?.Toast($"{town.Name} founded. Place Huts and producers next to it.");
                    }
                    else Hud?.Toast(r.Reason);
                    break;
                }
                case ToolKind.Building:
                {
                    var r = World.PlaceBuilding(ToolBuilding, hex, out var b);
                    if (r.Ok)
                    {
                        SelectTown(b.Town);
                        if (!Keyboard.current.shiftKey.isPressed) SelectTool(ToolKind.Inspect);
                    }
                    else Hud?.Toast(r.Reason);
                    break;
                }
                case ToolKind.Road:
                {
                    if (World.Roads.Contains(hex)) break;
                    var r = World.BuildRoad(hex);
                    if (!r.Ok && click) Hud?.Toast(r.Reason);
                    break;
                }
                case ToolKind.RemoveRoad:
                    World.RemoveRoad(hex);
                    break;
                default:
                    if (click) SelectTown(World.TownAt(hex));
                    break;
            }
        }

        string Describe(Hex hex)
        {
            var town = World.TownAt(hex);
            string terrain = World.Board[hex].ToString();
            if (town == null) return terrain;
            if (town.Center == hex) return $"{town.Name} (centre) on {terrain}";
            foreach (var b in town.Buildings)
                if (b.Hex == hex)
                {
                    string state = !b.Built ? "under construction"
                        : b.IsHouse ? $"{b.Residents:0.0}/{b.Def.HouseCapacity} residents"
                        : b.Workers > 0.01 ? $"{b.Workers:0.0} workers, store {b.OutputStore:0}"
                        : "no workers — build Huts";
                    return $"{b.Def.Name} of {town.Name}: {state}";
                }
            return terrain;
        }
    }
}
