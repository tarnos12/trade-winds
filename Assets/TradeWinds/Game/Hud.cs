using System;
using System.Collections.Generic;
using System.Linq;
using TradeWinds.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace TradeWinds.Game
{
    /// <summary>The game's UI Toolkit HUD, built in code: Crown bar, speeds, Missions, build bar by tier, hints,
    /// Town/Castle panels, research tree, Event Log, toasts, confirm dialog, start screen and victory card.</summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class Hud : MonoBehaviour
    {
        GameController _game;
        VisualElement _root;
        Label _treasury, _tariff, _towns, _research, _clock, _hint, _toast;
        VisualElement _missionCard, _logCard, _rightDock, _barTabs, _barItems, _confirm, _start, _victory;
        readonly Dictionary<int, Button> _speedButtons = new Dictionary<int, Button>();
        TownPanel _townPanel;
        CastlePanel _castlePanel;
        ResearchPanel _researchPanel;
        int _tab;
        float _toastUntil, _nextRefresh;
        bool _dirty = true;
        string _hoverHint = "";
        Action _confirmAction;
        TextField _seedField;
        MapSize _startSize = MapSize.Normal;

        public bool ModalOpen => _confirm != null && _confirm.style.display == DisplayStyle.Flex;
        public bool ResearchOpen => _researchPanel != null && _researchPanel.Root.parent != null;
        public bool TextFieldFocused => _root?.panel?.focusController?.focusedElement is TextField || _root?.panel?.focusController?.focusedElement is TextElement te && te.parent is TextField;

        void OnEnable()
        {
            var doc = GetComponent<UIDocument>();
            _root = doc.rootVisualElement;
            _root.Clear();
            _root.pickingMode = PickingMode.Ignore;
            _root.style.flexGrow = 1;
            _townPanel = new TownPanel(this);
            _castlePanel = new CastlePanel(this);
            _researchPanel = new ResearchPanel(this);
            Build();
        }

        public void OnNewGame(GameController game)
        {
            _game = game;
            _tab = 0;
            _dirty = true;
            if (_researchPanel.Root.parent != null) _researchPanel.Root.RemoveFromHierarchy();
            RebuildBar();
        }

        // ------------------------------------------------------------------ public API

        public bool IsPointerOverUi()
        {
            if (_root?.panel == null || Mouse.current == null) return false;
            var screen = Mouse.current.position.ReadValue();
            var panelPos = RuntimePanelUtils.ScreenToPanel(_root.panel, new Vector2(screen.x, Screen.height - screen.y));
            var picked = _root.panel.Pick(panelPos);
            return picked != null && picked != _root;
        }

        public void Toast(string message)
        {
            if (_toast == null || string.IsNullOrEmpty(message)) return;
            _toast.text = message;
            _toast.style.display = DisplayStyle.Flex;
            _toastUntil = Time.unscaledTime + 4.5f;
        }

        public void Report(CommandResult r)
        {
            if (!r.Ok) Toast(r.Reason);
        }

        public void MarkDirty() => _dirty = true;

        /// <summary>Show <paramref name="text"/> in the hint line while the pointer is over <paramref name="e"/>.</summary>
        public void Hint(VisualElement e, string text)
        {
            e.RegisterCallback<PointerEnterEvent>(_ => _hoverHint = text);
            e.RegisterCallback<PointerLeaveEvent>(_ => { if (_hoverHint == text) _hoverHint = ""; });
        }

        public void Confirm(string message, Action onYes)
        {
            _confirmAction = onYes;
            _confirm.Q<Label>("ConfirmText").text = message;
            _confirm.style.display = DisplayStyle.Flex;
        }

        public void ToggleResearch()
        {
            if (_researchPanel.Root.parent != null) _researchPanel.Root.RemoveFromHierarchy();
            else
            {
                _root.Add(_researchPanel.Root);
                _researchPanel.Root.SendToBack();
                _researchPanel.Root.BringToFront();
            }
            _dirty = true;
        }

        /// <summary>Esc: close the topmost overlay. Returns true if something closed.</summary>
        public bool CloseTopmost()
        {
            if (ModalOpen) { _confirm.style.display = DisplayStyle.None; return true; }
            if (ResearchOpen) { ToggleResearch(); return true; }
            return false;
        }

        // ------------------------------------------------------------------ layout

        void Build()
        {
            // Top-left: the Crown.
            var top = Ui.Card();
            top.style.position = Position.Absolute;
            top.style.left = 12;
            top.style.top = 12;
            top.style.flexDirection = FlexDirection.Row;
            top.style.alignItems = Align.Center;
            _treasury = Ui.Text("", 17, true, Palette.Castle);
            _tariff = Ui.Text("", 14);
            _towns = Ui.Text("", 14);
            _research = Ui.Text("", 14);
            foreach (var l in new[] { _treasury, _tariff, _towns, _research }) { l.style.marginRight = 16; top.Add(l); }
            top.Add(Ui.Button("Castle (K)", () => _game.SelectCastle()));
            top.Add(Ui.Button("Research (R)", ToggleResearch));
            _root.Add(top);

            // Top-right: clock, speeds, menu.
            var speeds = Ui.Card();
            speeds.style.position = Position.Absolute;
            speeds.style.right = 12;
            speeds.style.top = 12;
            speeds.style.flexDirection = FlexDirection.Row;
            speeds.style.alignItems = Align.Center;
            _clock = Ui.Text("0:00", 14);
            _clock.style.marginRight = 8;
            speeds.Add(_clock);
            foreach (var s in new[] { 0, 1, 2, 4 })
            {
                int speed = s;
                var b = Ui.Button(s == 0 ? "||" : s + "x", () => _game.SetSpeed(speed));
                _speedButtons[s] = b;
                speeds.Add(b);
            }
            var menu = Ui.Button("Menu", () => _game.OpenMenu());
            menu.style.marginLeft = 8;
            speeds.Add(menu);
            _root.Add(speeds);

            // Left: Missions.
            _missionCard = Ui.Card();
            _missionCard.style.position = Position.Absolute;
            _missionCard.style.left = 12;
            _missionCard.style.top = 64;
            _missionCard.style.width = 330;
            _root.Add(_missionCard);

            // Right dock: Town or Castle panel.
            _rightDock = new VisualElement();
            _rightDock.style.position = Position.Absolute;
            _rightDock.style.right = 12;
            _rightDock.style.top = 64;
            _rightDock.style.maxHeight = new Length(80, LengthUnit.Percent);
            _root.Add(_rightDock);

            // Bottom-left: Event Log.
            _logCard = Ui.Card();
            _logCard.style.position = Position.Absolute;
            _logCard.style.left = 12;
            _logCard.style.bottom = 110;
            _logCard.style.width = 330;
            _root.Add(_logCard);

            // Bottom: hint + build bar.
            var bottom = new VisualElement();
            bottom.pickingMode = PickingMode.Ignore;
            bottom.style.position = Position.Absolute;
            bottom.style.left = 0;
            bottom.style.right = 0;
            bottom.style.bottom = 10;
            bottom.style.alignItems = Align.Center;
            _hint = Ui.Text("", 13);
            _hint.pickingMode = PickingMode.Ignore;
            _hint.style.marginBottom = 6;
            _hint.style.maxWidth = 900;
            _hint.style.backgroundColor = Palette.Panel;
            _hint.style.paddingLeft = _hint.style.paddingRight = 8;
            _hint.style.paddingTop = _hint.style.paddingBottom = 3;
            bottom.Add(_hint);
            var bar = Ui.Card();
            bar.style.alignItems = Align.Center;
            bar.style.maxWidth = new Length(96, LengthUnit.Percent);
            _barTabs = Ui.Row();
            _barItems = Ui.Row();
            _barItems.style.justifyContent = Justify.Center;
            bar.Add(_barTabs);
            bar.Add(_barItems);
            bottom.Add(bar);
            _root.Add(bottom);

            // Toast.
            _toast = Ui.Text("", 15, true);
            _toast.pickingMode = PickingMode.Ignore;
            _toast.style.position = Position.Absolute;
            _toast.style.top = 64;
            _toast.style.left = new Length(50, LengthUnit.Percent);
            _toast.style.translate = new Translate(new Length(-50, LengthUnit.Percent), 0);
            _toast.style.maxWidth = 560;
            _toast.style.backgroundColor = Palette.Panel;
            _toast.style.paddingLeft = _toast.style.paddingRight = 12;
            _toast.style.paddingTop = _toast.style.paddingBottom = 6;
            _toast.style.unityTextAlign = TextAnchor.MiddleCenter;
            _toast.style.display = DisplayStyle.None;
            _root.Add(_toast);

            BuildConfirm();
            BuildStart();
            BuildVictory();
        }

        VisualElement Overlay()
        {
            var o = new VisualElement();
            o.style.position = Position.Absolute;
            o.style.left = o.style.right = o.style.top = o.style.bottom = 0;
            o.style.backgroundColor = new Color(0, 0, 0, 0.55f);
            o.style.alignItems = Align.Center;
            o.style.justifyContent = Justify.Center;
            o.style.display = DisplayStyle.None;
            return o;
        }

        void BuildConfirm()
        {
            _confirm = Overlay();
            var card = Ui.Card();
            card.style.maxWidth = 520;
            var text = Ui.Text("", 15);
            text.name = "ConfirmText";
            card.Add(text);
            card.Add(Ui.Row(
                Ui.Button("Yes", () => { _confirm.style.display = DisplayStyle.None; _confirmAction?.Invoke(); _dirty = true; }),
                Ui.Button("Cancel", () => _confirm.style.display = DisplayStyle.None)));
            _confirm.Add(card);
            _root.Add(_confirm);
        }

        void BuildStart()
        {
            _start = Overlay();
            _start.style.backgroundColor = new Color(0.05f, 0.04f, 0.03f, 0.7f);
            var card = Ui.Card();
            card.style.width = 560;
            card.style.paddingTop = card.style.paddingBottom = 18;
            card.style.paddingLeft = card.style.paddingRight = 24;
            card.Add(Ui.Text("Trade Winds", 40, true, Palette.Castle));
            card.Add(Ui.Text("Found Towns, let them trade, and the Crown takes its Tariff.", 16));
            card.Add(Ui.Spacer(8));
            card.Add(Ui.Text("Towns produce, consume and trade on their own. Specialise them so they need each other, " +
                             "research new chains for higher classes, and complete the King's Missions. " +
                             "The final Mission: an Aristocrats Home at 100% happiness.", 13, false, Palette.Muted));
            card.Add(Ui.Spacer(10));
            _seedField = new TextField("Seed") { value = NewSeedWord() };
            _seedField.style.color = Palette.Ink;
            _seedField.labelElement.style.color = Palette.Paper;
            _seedField.style.minWidth = 300;
            var dice = Ui.Button("Random", () => _seedField.value = NewSeedWord());
            card.Add(Ui.Row(_seedField, dice));
            var sizeRow = Ui.Row(Ui.Text("Map size", 13));
            foreach (MapSize s in Enum.GetValues(typeof(MapSize)))
            {
                var size = s;
                var b = Ui.Button(s.ToString(), () => { _startSize = size; RefreshStart(); });
                b.name = "size-" + s;
                sizeRow.Add(b);
            }
            card.Add(sizeRow);
            card.Add(Ui.Spacer(10));
            var buttons = Ui.Row(
                Ui.Button("New realm", () => _game.NewGame(SeedFromText(_seedField.value), _startSize)),
                Ui.Button("Continue", () => { if (!_game.Continue()) Toast("No saved realm to continue."); }));
            buttons.name = "StartButtons";
            card.Add(buttons);
            card.Add(Ui.Spacer(10));
            card.Add(Ui.Text("Controls: left-click build/select · right-drag or WASD pan · wheel zoom · Space pause · 1/2/4 speed · " +
                             "R research · K Castle · Shift keeps a building tool · Esc cancel. The realm saves automatically.", 12, false, Palette.Muted));
            _start.Add(card);
            _root.Add(_start);
            RefreshStart();
        }

        void RefreshStart()
        {
            foreach (MapSize s in Enum.GetValues(typeof(MapSize)))
            {
                var b = _start.Q<Button>("size-" + s);
                if (b != null) Ui.Highlight(b, s == _startSize);
            }
        }

        static string NewSeedWord()
        {
            string[] words = { "amber", "harbor", "willow", "copper", "meadow", "falcon", "ember", "saffron", "thistle", "granite" };
            var r = new System.Random();
            return words[r.Next(words.Length)] + "-" + r.Next(100, 999);
        }

        static uint SeedFromText(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return (uint)Environment.TickCount;
            uint h = 2166136261;
            foreach (char c in text.Trim().ToLowerInvariant()) h = (h ^ c) * 16777619;
            return h;
        }

        void BuildVictory()
        {
            _victory = Overlay();
            _root.Add(_victory);
        }

        void ShowVictory()
        {
            var w = _game.World;
            _victory.Clear();
            var card = Ui.Card();
            card.style.width = 480;
            card.style.paddingTop = card.style.paddingBottom = 18;
            card.Add(Ui.Text("Victory!", 36, true, Palette.Castle));
            card.Add(Ui.Text("Every Mission is complete — the Aristocrats live in perfect contentment.", 15));
            long secs = w.VictoryTick / 2;
            card.Add(Ui.Text($"Time: {secs / 3600}:{secs / 60 % 60:00}:{secs % 60:00}   ·   Towns: {w.Towns.Count}   ·   Peak population: {w.Stats.PeakPopulation:0}", 13));
            card.Add(Ui.Text($"Lifetime Tariff: {w.LifetimeTariff:N0}   ·   Goods traded: {w.Stats.GoodsTraded.Sum():N0}   ·   Research: {w.ResearchDone.Count}", 13));
            card.Add(Ui.Row(
                Ui.Button("Keep ruling", () => { _victory.style.display = DisplayStyle.None; }),
                Ui.Button("New realm", () => { _victory.style.display = DisplayStyle.None; _game.OpenMenu(); })));
            _victory.Add(card);
            _victory.style.display = DisplayStyle.Flex;
        }

        // ------------------------------------------------------------------ build bar

        static readonly string[] Tabs = { "Build", "Peasant", "Worker", "Burgher", "Aristocrat", "Castle" };

        void RebuildBar()
        {
            if (_game?.World == null) return;
            _barTabs.Clear();
            for (int i = 0; i < Tabs.Length; i++)
            {
                int tab = i;
                if (!TabVisible(i)) continue;
                var b = Ui.Button(Tabs[i], () => { _tab = tab; RebuildBar(); });
                Ui.Highlight(b, _tab == i);
                _barTabs.Add(b);
            }

            _barItems.Clear();
            var w = _game.World;
            var bal = w.Content.Balance;
            if (_tab == 0)
            {
                AddTool($"Town ({bal.TownFoundCost:0}g)", ToolKind.Town, null, $"Found a Town on open ground (cap {w.TownCap}). It starts with 1000 gold, 60 wood and 40 potato.");
                AddTool($"Road ({bal.RoadCostPerHex:0}g/hex)", ToolKind.Road, null, "Optional: Traders travel twice as fast on roads. Click or drag.");
                AddTool("Remove road", ToolKind.RemoveRoad, null, "Click or drag over roads.");
                AddTool("Demolish", ToolKind.Destroy, null, "Click a building (gold refunded) or a Town centre (abandon the Town).");
                return;
            }

            foreach (var def in w.Content.Buildings)
            {
                bool castle = def.Kind == BuildingKind.Castle;
                if (_tab == 5 ? !castle : castle || (int)def.Tier != _tab - 1) continue;
                bool unlocked = w.IsUnlocked(def);
                string cost = (def.GoldCost > 0 ? $"{def.GoldCost:0}g" : "") +
                              string.Concat(def.MaterialCost.Select(m => $" {m.Amount:0} {w.Content.Goods[m.Good].Name.ToLower()}"));
                string where = def.Kind == BuildingKind.Extractor ? $"On {GameController.TerrainName(def.Terrains[0])}." :
                               def.Kind == BuildingKind.Castle ? "Next to the Castle." : "Next to a Town.";
                string what = def.Kind == BuildingKind.House ? $"Home for {def.HouseCapacity} {def.Tier}s." :
                              def.OutputGood >= 0 ? $"Makes {w.Content.Goods[def.OutputGood].Name}" +
                                  (def.InputsPerOutput.Length > 0 ? " from " + string.Join(" + ", def.InputsPerOutput.Select(i => w.Content.Goods[i.Good].Name)) : "") + $" ({def.Tier}s work here)." : "";
                string hint = unlocked ? $"{def.Name}: {what} {where} Cost {cost.Trim()}."
                                       : $"{def.Name}: research {w.Content.ResearchNode(def.UnlockedBy)?.Name} first. {what}";
                if (castle && w.Castle?.Find(def.Id) != null) hint = def.Name + " is already built.";
                AddTool(def.Name, ToolKind.Building, def, hint, unlocked && !(castle && w.Castle?.Find(def.Id) != null));
            }
        }

        bool TabVisible(int tab)
        {
            if (tab == 0 || tab == 5 || tab == 1) return true;
            var w = _game.World;
            foreach (var def in w.Content.Buildings)
                if (def.Kind != BuildingKind.Castle && (int)def.Tier == tab - 1 && w.IsUnlocked(def)) return true;
            return false;
        }

        void AddTool(string label, ToolKind tool, BuildingDef def, string hint, bool enabled = true)
        {
            var b = Ui.Button(label, () =>
            {
                bool same = _game.Tool == tool && _game.ToolBuilding == def;
                _game.SelectTool(same ? ToolKind.Inspect : tool, same ? null : def);
            }, enabled);
            b.userData = new ToolTag { Tool = tool, Def = def, Enabled = enabled };
            Hint(b, hint);
            _barItems.Add(b);
        }

        sealed class ToolTag
        {
            public ToolKind Tool;
            public BuildingDef Def;
            public bool Enabled;
        }

        // ------------------------------------------------------------------ refresh

        int _lastResearchCount = -1;

        void Update()
        {
            if (_game == null || _game.World == null) return;
            var w = _game.World;

            _start.style.display = _game.MenuOpen ? DisplayStyle.Flex : DisplayStyle.None;
            var cont = _start.Q<VisualElement>("StartButtons")?.ElementAt(1) as Button;
            if (cont != null) cont.SetEnabled(GameController.HasSave);
            if (_game.MenuOpen) return;

            if (_toast.style.display == DisplayStyle.Flex && Time.unscaledTime > _toastUntil) _toast.style.display = DisplayStyle.None;
            _hint.text = HintText();
            _hint.style.display = string.IsNullOrEmpty(_hint.text) ? DisplayStyle.None : DisplayStyle.Flex;
            foreach (var child in _barItems.Children())
                if (child is Button b && b.userData is ToolTag t && t.Enabled)
                    Ui.Highlight(b, _game.Tool == t.Tool && _game.ToolBuilding == t.Def);
            foreach (var kv in _speedButtons) Ui.Highlight(kv.Value, _game.Speed == kv.Key);

            if (w.ResearchDone.Count != _lastResearchCount)
            {
                _lastResearchCount = w.ResearchDone.Count;
                RebuildBar();
            }

            if (w.Victory && !_game.VictorySeen)
            {
                _game.VictorySeen = true;
                ShowVictory();
            }

            if (!_dirty && Time.unscaledTime < _nextRefresh) return;
            _nextRefresh = Time.unscaledTime + 0.4f;
            Refresh();
        }

        string HintText()
        {
            string tool = _game.Tool switch
            {
                ToolKind.Town => "Placing: Town — click open ground, not touching another Town or the Castle.",
                ToolKind.Building => $"Placing: {_game.ToolBuilding.Name} — {(_game.ToolBuilding.Kind == BuildingKind.Castle ? "next to the Castle" : "next to a Town")}. Shift keeps the tool. Esc cancels.",
                ToolKind.Road => "Placing: Road — click or drag. Roads double Trader speed; they're optional.",
                ToolKind.RemoveRoad => "Removing roads — click or drag.",
                ToolKind.Destroy => "Demolish — click a building or a Town centre.",
                ToolKind.ScoutFlag => "Scout — click a discovered hex near the fog.",
                _ => "",
            };
            var parts = new List<string>();
            if (!string.IsNullOrEmpty(_hoverHint)) parts.Add(_hoverHint);
            else
            {
                if (tool.Length > 0) parts.Add(tool);
                if (!string.IsNullOrEmpty(_game.HoverHint)) parts.Add(_game.HoverHint);
            }
            return string.Join("\n", parts);
        }

        void Refresh()
        {
            var w = _game.World;
            _treasury.text = $"Treasury {w.Treasury:N0}";
            _tariff.text = $"Tariff +{_game.TariffPerMinute():0}/min";
            _towns.text = $"Towns {w.Towns.Count}/{w.TownCap}";
            _research.text = w.ActiveResearch != null
                ? $"Researching {w.Content.ResearchNode(w.ActiveResearch).Name} {ResearchSim.Progress(w) * 100:0}%"
                : ResearchSim.Speed(w) > 0 ? "Research idle" : "No Research Center";
            long seconds = w.Tick / 2;
            _clock.text = $"{seconds / 3600}:{seconds / 60 % 60:00}:{seconds % 60:00}" + (_game.IsFocusPaused ? " (paused)" : "");

            RefreshMissions(w);
            RefreshLog(w);

            bool overDock = IsPointerOver(_rightDock);
            bool overResearch = ResearchOpen && IsPointerOver(_researchPanel.Root);
            if (_dirty || !overDock)
            {
                _rightDock.Clear();
                if (_game.SelectedTown != null && w.Towns.Contains(_game.SelectedTown))
                {
                    _townPanel.Rebuild(_game);
                    _rightDock.Add(_townPanel.Root);
                }
                else if (_game.CastleSelected)
                {
                    _castlePanel.Rebuild(_game);
                    _rightDock.Add(_castlePanel.Root);
                }
            }
            if (ResearchOpen && (_dirty || !overResearch)) _researchPanel.Rebuild(_game);
            _dirty = false;
        }

        bool IsPointerOver(VisualElement e)
        {
            if (e?.panel == null || Mouse.current == null) return false;
            var screen = Mouse.current.position.ReadValue();
            var p = RuntimePanelUtils.ScreenToPanel(e.panel, new Vector2(screen.x, Screen.height - screen.y));
            return e.worldBound.Contains(p);
        }

        void RefreshMissions(World w)
        {
            _missionCard.Clear();
            var m = MissionSim.Current(w);
            if (m == null)
            {
                _missionCard.Add(Ui.Heading("Victory"));
                _missionCard.Add(Ui.Text("Every Mission is complete. Keep ruling as long as you like.", 13));
                return;
            }
            _missionCard.Add(Ui.Heading($"Mission {w.MissionIndex + 1}/{w.Content.Missions.Length}: {m.Name}"));
            foreach (var o in m.Objectives)
            {
                double p = MissionSim.Progress(w, o);
                bool done = p + 1e-9 >= o.Count;
                string amount = o.Kind == ObjectiveKind.EstateHappiness ? $"{p:0}%" : $"{Math.Min(p, o.Count):0}/{o.Count:0}";
                _missionCard.Add(Ui.Text((done ? "[x] " : "[ ] ") + o.Label + "  " + amount, 13, false, done ? Palette.Good : Palette.Paper));
            }
            if (m.RewardGold > 0) _missionCard.Add(Ui.Text($"Reward: {m.RewardGold:0} gold", 12, false, Palette.Castle));
            _missionCard.Add(Ui.Text(m.Tip, 12, false, Palette.Muted));
        }

        void RefreshLog(World w)
        {
            _logCard.Clear();
            _logCard.Add(Ui.Text("Event Log", 13, true, Palette.Castle));
            int start = Math.Max(0, w.Events.Count - 6);
            for (int i = w.Events.Count - 1; i >= start; i--) _logCard.Add(Ui.Text(w.Events[i], 12, false, Palette.Muted));
            _logCard.style.display = w.Events.Count > 0 ? DisplayStyle.Flex : DisplayStyle.None;
        }
    }
}
