using System.Collections.Generic;
using System.IO;
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
        Destroy,
        ScoutFlag,
    }

    public enum MapSize
    {
        Small,
        Normal,
        Large,
    }

    /// <summary>Owns the World, drives the fixed 500 ms economy tick (× speed), saves/loads, and turns input into commands.</summary>
    public sealed class GameController : MonoBehaviour
    {
        public BoardView Board;
        public CameraRig CameraRig;
        public Hud Hud;
        [Tooltip("Balance numbers for new and loaded realms (falls back to code defaults).")]
        public BalanceAsset BalanceAsset;
        [Tooltip("Pause the economy when the window loses focus (GDD §3).")]
        public bool PauseOnFocusLoss = true;
        public float AutosaveSeconds = 30f;

        public World World { get; private set; }
        public uint CurrentSeed { get; private set; }
        public int Speed { get; private set; } = 1;
        public ToolKind Tool { get; private set; } = ToolKind.Inspect;
        public BuildingDef ToolBuilding { get; private set; }
        public Town SelectedTown { get; private set; }
        public Building SelectedBuilding { get; private set; }
        public bool CastleSelected { get; private set; }
        public Scout SelectedScout { get; private set; }
        public bool MenuOpen { get; private set; } = true;
        public string HoverHint { get; private set; } = "";
        public bool IsFocusPaused => _focusPaused;
        public bool VictorySeen;

        int _speedBeforePause = 1;
        bool _focusPaused;
        double _accumulator;
        float _nextAutosave;
        readonly Queue<(long tick, double tariff)> _tariffSamples = new Queue<(long, double)>();

        const float SecondsPerTick = 0.5f;
        const int MaxCatchUpTicks = 16;

        public static string SavePath => Path.Combine(Application.persistentDataPath, "trade-winds-save.json");
        public static bool HasSave => File.Exists(SavePath);

        void Start()
        {
            // A preview realm sits behind the start screen.
            NewGame((uint)System.Environment.TickCount, MapSize.Normal, openMenu: true);
        }

        // ------------------------------------------------------------------ game lifecycle

        public void NewGame(uint seed, MapSize size, bool openMenu = false)
        {
            CurrentSeed = seed;
            var settings = new MapSettings();
            switch (size)
            {
                case MapSize.Small: settings.Width = 36; settings.Height = 18; settings.Patches = 22; settings.Lakes = 2; settings.MountainRanges = 3; break;
                case MapSize.Large: settings.Width = 66; settings.Height = 33; settings.Patches = 56; settings.Lakes = 5; settings.MountainRanges = 8; settings.OreClusters = 6; break;
            }
            var map = MapGen.Generate(seed, settings);
            Bind(new World(GameContent.Create(BalanceAsset != null ? BalanceAsset.CreateCopy() : null), map.Board, seed, map.Start));
            VictorySeen = false;
            MenuOpen = openMenu;
            if (!openMenu)
            {
                SetSpeed(1);
                Hud?.Toast("A new realm. Found your first Town near the forest and fields around the Castle.");
                SaveNow();
            }
        }

        public bool Continue()
        {
            if (!LoadSave()) return false;
            MenuOpen = false;
            SetSpeed(1);
            Hud?.Toast("Welcome back.");
            return true;
        }

        void Bind(World world)
        {
            World = world;
            Board.Bind(World);
            var center = World.Castle != null ? World.Castle.Center : Core.Board.FromOffset(World.Board.Width / 2, World.Board.Height / 2);
            CameraRig.CenterOn(Board.HexToWorld(center));
            var min = Board.HexToWorld(Core.Board.FromOffset(0, 0));
            var max = Board.HexToWorld(Core.Board.FromOffset(World.Board.Width - 1, World.Board.Height - 1));
            CameraRig.Bounds = Rect.MinMaxRect(min.x, min.y, max.x, max.y);
            ClearSelection();
            Tool = ToolKind.Inspect;
            _accumulator = 0;
            _tariffSamples.Clear();
            Hud?.OnNewGame(this);
        }

        public void OpenMenu()
        {
            SaveNow();
            MenuOpen = true;
        }

        public void SaveNow()
        {
            if (World == null || MenuOpen) return;
            try
            {
                var json = JsonUtility.ToJson(SaveGame.Capture(World));
                File.WriteAllText(SavePath, json);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[TradeWinds] Save failed: " + e.Message);
            }
        }

        bool LoadSave()
        {
            try
            {
                if (!HasSave) return false;
                var data = JsonUtility.FromJson<SaveData>(File.ReadAllText(SavePath));
                Bind(SaveGame.Restore(data, GameContent.Create(BalanceAsset != null ? BalanceAsset.CreateCopy() : null)));
                CurrentSeed = World.Seed;
                VictorySeen = World.Victory;
                return true;
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[TradeWinds] Load failed: " + e.Message);
                Hud?.Toast("The saved realm couldn't be loaded.");
                return false;
            }
        }

        void OnApplicationQuit() => SaveNow();

        // ------------------------------------------------------------------ speed, tools, selection

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

        public void ClearSelection()
        {
            SelectedTown = null;
            SelectedBuilding = null;
            CastleSelected = false;
            Board?.SetSelection(null);
        }

        public void SelectTown(Town town, Building building = null)
        {
            ClearSelection();
            SelectedTown = town;
            SelectedBuilding = building;
            if (town != null) Board.SetSelection(building != null ? building.Hex : town.Center);
        }

        public void SelectCastle()
        {
            ClearSelection();
            CastleSelected = World.Castle != null;
            if (CastleSelected) Board.SetSelection(World.Castle.Center);
        }

        public void BeginScoutFlag(Scout scout)
        {
            SelectedScout = scout;
            SelectTool(ToolKind.ScoutFlag);
        }

        public void FocusOn(Hex h) => CameraRig.CenterOn(Board.HexToWorld(h));

        /// <summary>Tariff earned over roughly the last game-minute.</summary>
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
            bool overUi = Hud != null && Hud.IsPointerOverUi();
            if (!MenuOpen)
            {
                HandleKeys();
                CameraRig.Tick(overUi);
                HandlePointer(overUi);
            }

            bool running = Speed > 0 && !_focusPaused && !MenuOpen && !(Hud != null && Hud.ModalOpen);
            if (running)
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

                if (Time.unscaledTime >= _nextAutosave)
                {
                    _nextAutosave = Time.unscaledTime + AutosaveSeconds;
                    SaveNow();
                }
            }

            Board.Render(running ? (float)(_accumulator / SecondsPerTick) : 0f);
        }

        void OnApplicationFocus(bool focus)
        {
            _focusPaused = PauseOnFocusLoss && !focus && !Application.isEditor;
            if (!focus) SaveNow();
        }

        void HandleKeys()
        {
            var kb = Keyboard.current;
            if (kb == null || (Hud != null && Hud.TextFieldFocused)) return;
            if (kb.spaceKey.wasPressedThisFrame) TogglePause();
            if (kb.digit1Key.wasPressedThisFrame) SetSpeed(1);
            if (kb.digit2Key.wasPressedThisFrame) SetSpeed(2);
            if (kb.digit4Key.wasPressedThisFrame) SetSpeed(4);
            if (kb.rKey.wasPressedThisFrame) Hud?.ToggleResearch();
            if (kb.kKey.wasPressedThisFrame) SelectCastle();
            if (kb.escapeKey.wasPressedThisFrame)
            {
                if (Hud != null && Hud.CloseTopmost()) return;
                if (Tool != ToolKind.Inspect) SelectTool(ToolKind.Inspect);
                else ClearSelection();
            }
        }

        void HandlePointer(bool overUi)
        {
            var mouse = Mouse.current;
            if (mouse == null) return;
            if (overUi || (Hud != null && Hud.ModalOpen))
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
            HoverHint = Describe(hex) + (Tool == ToolKind.Inspect || check.Ok ? "" : "  —  " + check.Reason);

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
                    if (!World.IsRevealed(hex)) return CommandResult.Fail("Unexplored.");
                    return World.Board.IsPassable(hex) ? CommandResult.Success : CommandResult.Fail("Roads can't cross water or mountains.");
                case ToolKind.RemoveRoad:
                    return World.Roads.Contains(hex) ? CommandResult.Success : CommandResult.Fail("No road here.");
                case ToolKind.Destroy:
                {
                    var town = World.TownAt(hex);
                    return town != null ? CommandResult.Success : CommandResult.Fail("Nothing to demolish here.");
                }
                case ToolKind.ScoutFlag:
                    return World.IsRevealed(hex) ? CommandResult.Success : CommandResult.Fail("Pick a discovered hex near the fog.");
                default: return CommandResult.Success;
            }
        }

        void Apply(Hex hex, bool click)
        {
            bool keep = Keyboard.current != null && Keyboard.current.shiftKey.isPressed;
            switch (Tool)
            {
                case ToolKind.Town:
                {
                    var r = World.FoundTown(hex, out var town);
                    if (r.Ok)
                    {
                        SelectTown(town);
                        if (!keep) SelectTool(ToolKind.Inspect);
                        Hud?.Toast($"{town.Name} founded. Add Huts and producers next to it.");
                    }
                    else Hud?.Toast(r.Reason);
                    break;
                }
                case ToolKind.Building:
                {
                    var r = World.PlaceBuilding(ToolBuilding, hex, out var b);
                    if (r.Ok)
                    {
                        if (b != null) SelectTown(b.Town);
                        else SelectCastle();
                        if (!keep) SelectTool(ToolKind.Inspect);
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
                case ToolKind.Destroy:
                    if (click) AskDestroy(hex);
                    break;
                case ToolKind.ScoutFlag:
                    if (!click || SelectedScout == null) break;
                    var res = ScoutSim.Explore(World, SelectedScout, hex);
                    Hud?.Toast(res.Ok ? $"Scout {SelectedScout.Id} sets out." : res.Reason);
                    if (res.Ok) SelectTool(ToolKind.Inspect);
                    break;
                default:
                    if (!click) break;
                    if (World.Castle != null && World.Castle.Occupies(hex)) SelectCastle();
                    else
                    {
                        var town = World.TownAt(hex);
                        SelectTown(town, town?.BuildingAt(hex));
                    }
                    break;
            }
        }

        void AskDestroy(Hex hex)
        {
            var town = World.TownAt(hex);
            if (town == null) return;
            var building = town.BuildingAt(hex);
            if (building != null)
            {
                Hud.Confirm($"Demolish the {building.Def.Name}? Its gold ({building.Def.GoldCost:0}) is refunded; anything cut off from {town.Name}'s centre goes too. Materials are lost.",
                    () =>
                    {
                        World.DestroyBuilding(building, out int cascaded);
                        if (SelectedBuilding == building) SelectTown(town);
                        Hud.Toast(cascaded > 0 ? $"Demolished, plus {cascaded} cut-off building(s)." : "Demolished.");
                    });
            }
            else
            {
                Hud.Confirm($"Abandon {town.Name}? Its residents, Stock and purse are lost; founding and building gold come back minus what the Crown has taken.",
                    () =>
                    {
                        World.DestroyTown(town, out double refund);
                        ClearSelection();
                        Hud.Toast($"{town.Name} abandoned. Refund {refund:0} gold.");
                    });
            }
            SelectTool(ToolKind.Inspect);
        }

        string Describe(Hex hex)
        {
            if (!World.IsRevealed(hex)) return "Unexplored";
            string terrain = TerrainName(World.Board[hex]) + (World.Roads.Contains(hex) ? " + road" : "");
            if (World.Castle != null)
            {
                if (World.Castle.Center == hex) return "The Castle";
                foreach (var c in World.Castle.Compound)
                    if (c.Hex == hex) return c.Def.Name + (c.Level > 1 ? $" (level {c.Level})" : "");
            }
            var town = World.TownAt(hex);
            if (town == null) return terrain + BuildableHint(hex);
            if (town.Center == hex) return $"{town.Name} (centre)";
            var b = town.BuildingAt(hex);
            if (b == null) return terrain;
            string state = !b.Built ? "under construction"
                : b.IsUpgrading ? "upgrading"
                : b.IsHouse ? $"{b.Residents:0.0}/{TownSim.HouseCapacity(World, b):0.#} residents"
                : b.Workers > 0.01 ? $"{b.Workers:0.0} workers" : "no workers — build houses for its tier";
            return $"{b.Def.Name} of {town.Name}: {state}";
        }

        string BuildableHint(Hex hex)
        {
            var t = World.Board[hex];
            foreach (var def in World.Content.Buildings)
                if (def.Kind == BuildingKind.Extractor && def.AllowsTerrain(t))
                    return $"  ({def.Name})";
            return "";
        }

        public static string TerrainName(Core.Terrain t)
        {
            switch (t)
            {
                case Core.Terrain.Fish: return "Fish shoal";
                case Core.Terrain.Stone: return "Stone deposit";
                case Core.Terrain.Clay: return "Clay deposit";
                case Core.Terrain.Coal: return "Coal deposit";
                case Core.Terrain.Iron: return "Iron deposit";
                case Core.Terrain.Gold: return "Gold deposit";
                default: return t.ToString();
            }
        }
    }
}
