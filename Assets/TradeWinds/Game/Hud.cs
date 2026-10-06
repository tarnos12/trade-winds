using System.Collections.Generic;
using System.Text;
using TradeWinds.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace TradeWinds.Game
{
    /// <summary>Placeholder HUD (UI Toolkit, built in code): treasury + Tariff, speed, goal, build bar,
    /// hover hint, Town panel and toasts. "Only what's needed on screen" (GDD §12).</summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class Hud : MonoBehaviour
    {
        GameController _game;
        VisualElement _root;
        Label _treasury, _tariff, _towns, _clock, _hint, _toast, _goal;
        readonly Dictionary<int, Button> _speedButtons = new Dictionary<int, Button>();
        readonly List<(Button button, ToolKind tool, BuildingDef def)> _toolButtons = new List<(Button, ToolKind, BuildingDef)>();
        VisualElement _townPanel;
        Label _townTitle, _townBody;
        float _toastUntil;
        float _nextRefresh;

        void OnEnable()
        {
            var doc = GetComponent<UIDocument>();
            _root = doc.rootVisualElement;
            _root.Clear();
            _root.pickingMode = PickingMode.Ignore;
            _root.style.flexGrow = 1;
            Build();
        }

        public void OnNewGame(GameController game)
        {
            _game = game;
            BuildToolButtons();
        }

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
            if (_toast == null) return;
            _toast.text = message;
            _toast.style.display = DisplayStyle.Flex;
            _toastUntil = Time.unscaledTime + 4.5f;
        }

        // ------------------------------------------------------------------ layout

        static VisualElement Card()
        {
            var v = new VisualElement();
            v.style.backgroundColor = Palette.Panel;
            v.style.borderTopColor = v.style.borderBottomColor = v.style.borderLeftColor = v.style.borderRightColor = Palette.PanelEdge;
            v.style.borderTopWidth = v.style.borderBottomWidth = v.style.borderLeftWidth = v.style.borderRightWidth = 1;
            v.style.borderTopLeftRadius = v.style.borderTopRightRadius = v.style.borderBottomLeftRadius = v.style.borderBottomRightRadius = 6;
            v.style.paddingTop = v.style.paddingBottom = 6;
            v.style.paddingLeft = v.style.paddingRight = 10;
            return v;
        }

        static Label Text(string s, int size = 15, bool bold = false)
        {
            var l = new Label(s);
            l.style.color = Palette.Paper;
            l.style.fontSize = size;
            if (bold) l.style.unityFontStyleAndWeight = FontStyle.Bold;
            l.style.whiteSpace = WhiteSpace.Normal;
            return l;
        }

        static Button MakeButton(string text, System.Action onClick)
        {
            var b = new Button(onClick) { text = text };
            b.style.backgroundColor = new Color(0.25f, 0.2f, 0.14f, 1f);
            b.style.color = Palette.Paper;
            b.style.fontSize = 14;
            b.style.borderTopColor = b.style.borderBottomColor = b.style.borderLeftColor = b.style.borderRightColor = Palette.PanelEdge;
            b.style.marginLeft = b.style.marginRight = 2;
            b.style.paddingLeft = b.style.paddingRight = 8;
            b.style.paddingTop = b.style.paddingBottom = 4;
            return b;
        }

        static void Highlight(Button b, bool on) =>
            b.style.backgroundColor = on ? Palette.Accent : new Color(0.25f, 0.2f, 0.14f, 1f);

        void Build()
        {
            // Top-left: Crown status.
            var top = Card();
            top.style.position = Position.Absolute;
            top.style.left = 12;
            top.style.top = 12;
            top.style.flexDirection = FlexDirection.Row;
            _treasury = Text("", 17, true);
            _tariff = Text("", 15);
            _towns = Text("", 15);
            foreach (var l in new[] { _treasury, _tariff, _towns }) { l.style.marginRight = 18; top.Add(l); }
            _root.Add(top);

            // Top-right: clock, speeds, new game.
            var speeds = Card();
            speeds.style.position = Position.Absolute;
            speeds.style.right = 12;
            speeds.style.top = 12;
            speeds.style.flexDirection = FlexDirection.Row;
            speeds.style.alignItems = Align.Center;
            _clock = Text("0:00", 15);
            _clock.style.marginRight = 10;
            speeds.Add(_clock);
            foreach (var s in new[] { 0, 1, 2, 4 })
            {
                int speed = s;
                var b = MakeButton(s == 0 ? "||" : s + "x", () => _game.SetSpeed(speed));
                _speedButtons[s] = b;
                speeds.Add(b);
            }
            var newGame = MakeButton("New realm", () => _game.NewGame((uint)System.Environment.TickCount));
            newGame.style.marginLeft = 10;
            speeds.Add(newGame);
            _root.Add(speeds);

            // Left: goal card.
            var goalCard = Card();
            goalCard.style.position = Position.Absolute;
            goalCard.style.left = 12;
            goalCard.style.top = 64;
            goalCard.style.width = 330;
            goalCard.Add(Text("Goal", 16, true));
            _goal = Text("", 14);
            goalCard.Add(_goal);
            _root.Add(goalCard);

            // Right: Town panel.
            _townPanel = Card();
            _townPanel.style.position = Position.Absolute;
            _townPanel.style.right = 12;
            _townPanel.style.top = 64;
            _townPanel.style.width = 330;
            _townTitle = Text("", 17, true);
            _townBody = Text("", 14);
            _townPanel.Add(_townTitle);
            _townPanel.Add(_townBody);
            _townPanel.style.display = DisplayStyle.None;
            _root.Add(_townPanel);

            // Bottom: hint + build bar.
            var bottom = new VisualElement();
            bottom.pickingMode = PickingMode.Ignore;
            bottom.style.position = Position.Absolute;
            bottom.style.left = 0;
            bottom.style.right = 0;
            bottom.style.bottom = 12;
            bottom.style.alignItems = Align.Center;
            _hint = Text("", 14);
            _hint.pickingMode = PickingMode.Ignore;
            _hint.style.marginBottom = 6;
            _hint.style.backgroundColor = Palette.Panel;
            _hint.style.paddingLeft = _hint.style.paddingRight = 8;
            _hint.style.paddingTop = _hint.style.paddingBottom = 3;
            bottom.Add(_hint);
            var bar = Card();
            bar.name = "BuildBar";
            bar.style.flexDirection = FlexDirection.Row;
            bottom.Add(bar);
            _root.Add(bottom);

            // Toast.
            _toast = Text("", 16, true);
            _toast.pickingMode = PickingMode.Ignore;
            _toast.style.position = Position.Absolute;
            _toast.style.top = 64;
            _toast.style.left = new Length(50, LengthUnit.Percent);
            _toast.style.translate = new Translate(new Length(-50, LengthUnit.Percent), 0);
            _toast.style.maxWidth = 520;
            _toast.style.backgroundColor = Palette.Panel;
            _toast.style.paddingLeft = _toast.style.paddingRight = 12;
            _toast.style.paddingTop = _toast.style.paddingBottom = 6;
            _toast.style.unityTextAlign = TextAnchor.MiddleCenter;
            _toast.style.display = DisplayStyle.None;
            _root.Add(_toast);
        }

        void BuildToolButtons()
        {
            var bar = _root.Q<VisualElement>("BuildBar");
            bar.Clear();
            _toolButtons.Clear();
            var bal = _game.World.Content.Balance;

            AddTool(bar, $"Town ({bal.TownFoundCost:0}g)", ToolKind.Town, null);
            foreach (var def in _game.World.Content.Buildings)
            {
                string cost = def.GoldCost > 0 ? $"{def.GoldCost:0}g + " : "";
                foreach (var m in def.MaterialCost) cost += $"{m.Amount:0} {_game.World.Content.Goods[m.Good].Name.ToLower()}";
                AddTool(bar, $"{def.Name} ({cost})", ToolKind.Building, def);
            }
            AddTool(bar, $"Road ({bal.RoadCostPerHex:0}g/hex)", ToolKind.Road, null);
            AddTool(bar, "Remove road", ToolKind.RemoveRoad, null);
        }

        void AddTool(VisualElement bar, string label, ToolKind tool, BuildingDef def)
        {
            var b = MakeButton(label, () =>
            {
                bool same = _game.Tool == tool && _game.ToolBuilding == def;
                _game.SelectTool(same ? ToolKind.Inspect : tool, same ? null : def);
            });
            bar.Add(b);
            _toolButtons.Add((b, tool, def));
        }

        // ------------------------------------------------------------------ refresh

        void Update()
        {
            if (_game == null || _game.World == null) return;
            if (_toast.style.display == DisplayStyle.Flex && Time.unscaledTime > _toastUntil) _toast.style.display = DisplayStyle.None;
            _hint.text = HintText();
            _hint.style.display = string.IsNullOrEmpty(_hint.text) ? DisplayStyle.None : DisplayStyle.Flex;
            foreach (var (button, tool, def) in _toolButtons) Highlight(button, _game.Tool == tool && _game.ToolBuilding == def);
            foreach (var kv in _speedButtons) Highlight(kv.Value, _game.Speed == kv.Key);

            if (Time.unscaledTime < _nextRefresh) return;
            _nextRefresh = Time.unscaledTime + 0.2f;
            Refresh();
        }

        string HintText()
        {
            string tool = _game.Tool switch
            {
                ToolKind.Town => "Placing: Town — click open ground (not touching another Town). Esc cancels.",
                ToolKind.Building => $"Placing: {_game.ToolBuilding.Name} — click next to a Town. Shift keeps the tool. Esc cancels.",
                ToolKind.Road => "Placing: Road — click or drag. Roads double Trader speed; they're optional.",
                ToolKind.RemoveRoad => "Removing roads — click or drag.",
                _ => "",
            };
            if (string.IsNullOrEmpty(_game.HoverHint)) return tool;
            return string.IsNullOrEmpty(tool) ? _game.HoverHint : tool + "\n" + _game.HoverHint;
        }

        void Refresh()
        {
            var w = _game.World;
            _treasury.text = $"Treasury {w.Treasury:N0}";
            _tariff.text = $"Tariff +{_game.TariffPerMinute():0.0}/min  (total {w.LifetimeTariff:0})";
            _towns.text = $"Towns {w.Towns.Count}/{w.Content.Balance.TownCap}";
            long seconds = w.Tick / 2;
            _clock.text = $"{seconds / 3600}:{seconds / 60 % 60:00}:{seconds % 60:00}" + (_game.IsFocusPaused ? " (paused)" : "");
            _goal.text = GoalText(w);
            RefreshTown(w);
        }

        static string Check(bool done) => done ? "[x] " : "[ ] ";

        static string GoalText(World w)
        {
            int towns = 0, fullTowns = 0;
            bool traded = false;
            foreach (var t in w.Towns)
            {
                if (t.Built) towns++;
                double cap = 0;
                foreach (var b in t.Buildings) if (b.Built && b.IsHouse) cap += b.Def.HouseCapacity;
                if (cap > 0 && t.Population[0] >= cap - 0.05) fullTowns++;
                if (t.GoodsSold > 0) traded = true;
            }
            var sb = new StringBuilder();
            sb.AppendLine("Grow a Kingdom that trades on its own.");
            sb.AppendLine(Check(towns >= 2) + $"Found 2 Towns ({towns}/2)");
            sb.AppendLine(Check(fullTowns >= 2) + $"Fill every house in 2 Towns ({fullTowns}/2)");
            sb.AppendLine(Check(traded) + "Towns trade with each other");
            sb.AppendLine(Check(w.LifetimeTariff >= 100) + $"Earn 100 Tariff ({w.LifetimeTariff:0}/100)");
            sb.AppendLine();
            sb.Append("Peasants need Potato + Wood (Fish + Wool make them happier). " +
                      "Give one Town potato fields and another forest — they'll trade the rest. " +
                      "Every Town needs Huts for workers.");
            return sb.ToString();
        }

        void RefreshTown(World w)
        {
            var t = _game.SelectedTown;
            if (t == null || !w.Towns.Contains(t))
            {
                _townPanel.style.display = DisplayStyle.None;
                return;
            }
            _townPanel.style.display = DisplayStyle.Flex;
            var c = w.Content;
            _townTitle.text = t.Name + (t.Built ? "" : "  (founding…)");
            var sb = new StringBuilder();
            double cap = 0;
            foreach (var b in t.Buildings) if (b.Built && b.IsHouse) cap += b.Def.HouseCapacity;
            sb.AppendLine($"Gold {t.Gold:N0}   Peasants {t.Population[0]:0.0}/{cap:0}   Happiness {t.Happiness[0]:0}%");
            sb.AppendLine($"Slots {w.SlotsUsed(t)}/{w.SlotCap(t)}   Tax earned {t.TaxEarned:0}   Tariff generated {t.TariffGenerated:0}");
            sb.AppendLine();
            sb.AppendLine("Good       Stock  Price   Use/min  Mood");
            for (int g = 0; g < c.GoodCount; g++)
            {
                string mood = cap > 0 ? $"{t.Satisfaction[0][g] * 100:0}%" : "-";
                sb.AppendLine($"{c.Goods[g].Name,-10} {t.Stock[g],5:0} {t.Price[g],6:0.0} {t.ConsumptionPerMin[g],8:0.0}  {mood}" +
                              (t.Inbound[g] > 0 ? $"  (+{t.Inbound[g]:0} coming)" : ""));
            }
            sb.AppendLine();
            int tradersOut = 0, portersBusy = 0;
            foreach (var tr in t.Traders) if (tr.State != TraderState.Idle) tradersOut++;
            foreach (var p in t.Porters) if (p.Job != PorterJob.Idle) portersBusy++;
            sb.AppendLine($"Traders out {tradersOut}/{t.Traders.Count}   Porters busy {portersBusy}/{t.Porters.Count}");
            sb.AppendLine($"Bought {t.GoodsBought:0}  Sold {t.GoodsSold:0}");
            sb.AppendLine();
            foreach (var b in t.Buildings)
            {
                string state = !b.Built ? $"building {TownSim.ConstructionProgress(w, b) * 100:0}%"
                    : b.IsHouse ? $"{b.Residents:0.0}/{b.Def.HouseCapacity} home"
                    : b.Workers > 0.01 ? $"{b.Workers:0.0} workers" : "no workers";
                sb.AppendLine($"• {b.Def.Name}: {state}");
            }
            _townBody.text = sb.ToString();
        }
    }
}
