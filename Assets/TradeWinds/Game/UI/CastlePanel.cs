using TradeWinds.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace TradeWinds.Game
{
    /// <summary>The Castle: Tariff, Research Center, provisions and Scouts, and the royal market (Castle Stock, buy/sell/limit).</summary>
    public sealed class CastlePanel
    {
        readonly Hud _hud;
        public readonly VisualElement Root;

        public CastlePanel(Hud hud)
        {
            _hud = hud;
            Root = Ui.Card();
            Root.style.width = 400;
        }

        public void Rebuild(GameController game)
        {
            Root.Clear();
            var w = game.World;
            var castle = w.Castle;
            var content = w.Content;
            var bal = content.Balance;

            Root.Add(Ui.Row(Ui.Heading("The Castle"), Ui.Button("X", game.ClearSelection)));
            Root.Add(Ui.Text($"Treasury {w.Treasury:N0}   ·   Tariff {w.EffectiveTariff * 100:0}% of every trade between Towns", 13));
            if (w.HasModifier(Modifier.TariffSlider))
            {
                Root.Add(Ui.Row(
                    Ui.Text($"Set Tariff {w.TariffSetting * 100:0}%", 13),
                    Ui.Button("-5%", () => { w.SetTariff(w.TariffSetting - 0.05); _hud.MarkDirty(); }),
                    Ui.Button("+5%", () => { w.SetTariff(w.TariffSetting + 0.05); _hud.MarkDirty(); })));
            }

            // Research Center
            Root.Add(Ui.Spacer());
            var rc = castle.Find("research_center");
            if (rc == null)
            {
                var def = content.Building("research_center");
                var place = Ui.Button("Place Research Center", () => game.SelectTool(ToolKind.Building, def));
                _hud.Hint(place, $"{def.GoldCost:0} gold + 20 stone + 10 wood from the Castle Stock. Research is paused until it stands next to the Castle.");
                Root.Add(Ui.Row(Ui.Text("No Research Center — research is paused.", 13, false, Palette.Warn), place));
            }
            else
            {
                var upgrade = w.CanUpgradeCastleBuilding(rc);
                var next = rc.Def.UpgradeTo(rc.Level + 1);
                var row = Ui.Row(Ui.Text($"Research Center level {rc.Level}: {ResearchSim.Speed(w):0} materials/s", 13));
                if (next != null)
                {
                    var btn = Ui.Button($"Upgrade ({next.GoldCost:0}g)", () => { _hud.Report(w.UpgradeCastleBuilding(rc)); _hud.MarkDirty(); }, upgrade.Ok);
                    _hud.Hint(btn, upgrade.Ok ? "Faster research." : upgrade.Reason);
                    row.Add(btn);
                }
                row.Add(Ui.Button("Research (R)", _hud.ToggleResearch));
                Root.Add(row);
            }

            // Provisions & Scouts
            Root.Add(Ui.Spacer());
            Root.Add(Ui.Text($"Provisions {castle.Provisions:0}/{bal.ProvisionsCap:0}", 13, true, Palette.Castle));
            foreach (var id in new[] { "provisioner", "advanced_provisioner" })
            {
                var def = content.Building(id);
                if (castle.Find(id) != null || !w.IsUnlocked(def)) continue;
                var btn = Ui.Button($"Place {def.Name} ({def.GoldCost:0}g)", () => game.SelectTool(ToolKind.Building, def));
                _hud.Hint(btn, id == "provisioner" ? "Turns 2 potato into 1 provision; the King starts buying potato." : "Turns fish + potato into 2 provisions.");
                Root.Add(btn);
            }
            foreach (var s in w.Scouts)
            {
                var scout = s;
                string state = s.State == ScoutState.Exploring ? "exploring" : s.State == ScoutState.Returning ? "returning" : s.State == ScoutState.Refilling ? "refilling" : "at the Castle";
                var row = Ui.Row(Ui.Text($"Scout {s.Id}: {state}, carries {s.Carry:0}", 13));
                var explore = Ui.Button("Explore...", () => { game.BeginScoutFlag(scout); _hud.Toast("Click a discovered hex near the fog to send the Scout."); });
                row.Add(explore);
                if (s.State == ScoutState.Exploring) row.Add(Ui.Button("Recall", () => { ScoutSim.Recall(w, scout); _hud.MarkDirty(); }));
                Root.Add(row);
            }

            // Royal market
            Root.Add(Ui.Spacer());
            Root.Add(Ui.Text("Royal market — King buys up to the limit from Town surplus; King sells as the last resort (base price, no Tariff).", 12, false, Palette.Muted));
            var list = Ui.Scroll(260);
            for (int g = 0; g < content.GoodCount; g++)
            {
                if (!Known(w, g)) continue;
                int good = g;
                var o = castle.Orders[g];
                double need = ResearchSim.RemainingNeed(w, g);
                var row = Ui.Row();
                var name = Ui.Text($"{content.Goods[g].Name}: {castle.Stock[g]:0}" + (castle.Inbound[g] > 0.5 ? $" (+{castle.Inbound[g]:0})" : "") + (need > 0 ? $"  research needs {need:0}" : ""), 12);
                name.style.width = 190;
                row.Add(name);
                var buy = Ui.Button(o.Buy ? "Buy *" : "Buy", () => { w.SetCastleOrder(good, !o.Buy, o.Sell, o.Limit); _hud.MarkDirty(); });
                Ui.Highlight(buy, o.Buy);
                var sell = Ui.Button(o.Sell ? "Sell *" : "Sell", () => { w.SetCastleOrder(good, o.Buy, !o.Sell, o.Limit); _hud.MarkDirty(); });
                Ui.Highlight(sell, o.Sell);
                row.Add(buy);
                row.Add(sell);
                row.Add(Ui.Button("-", () => { w.SetCastleOrder(good, o.Buy, o.Sell, o.Limit - 10); _hud.MarkDirty(); }));
                row.Add(Ui.Text($"{o.Limit:0}", 12));
                row.Add(Ui.Button("+", () => { w.SetCastleOrder(good, o.Buy, o.Sell, o.Limit + 10); _hud.MarkDirty(); }));
                list.Add(row);
            }
            Root.Add(list);
        }

        static bool Known(World w, int g)
        {
            var c = w.Castle;
            if (c.Stock[g] > 0.5 || c.Orders[g].Buy || c.Orders[g].Sell || ResearchSim.RemainingNeed(w, g) > 0) return true;
            foreach (var t in w.Towns)
                if (t.Stock[g] > 0.5) return true;
            return false;
        }
    }
}
