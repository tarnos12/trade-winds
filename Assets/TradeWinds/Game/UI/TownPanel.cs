using System.Linq;
using TradeWinds.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace TradeWinds.Game
{
    /// <summary>Town details: purse, level, Crown Give/Take, people per tier, selected building, Stock and buildings.</summary>
    public sealed class TownPanel
    {
        readonly Hud _hud;
        public readonly VisualElement Root;

        public TownPanel(Hud hud)
        {
            _hud = hud;
            Root = Ui.Card();
            Root.style.width = 380;
        }

        public void Rebuild(GameController game)
        {
            Root.Clear();
            var w = game.World;
            var t = game.SelectedTown;
            var content = w.Content;
            var bal = content.Balance;

            Root.Add(Ui.Row(Ui.Heading($"{t.Name}  · level {t.Level}"), Ui.Button("X", game.ClearSelection)));
            if (!t.Built)
            {
                Root.Add(Ui.Text("Being founded..."));
                return;
            }

            Root.Add(Ui.Text($"Purse {t.Gold:N0} gold   ·   Slots {w.SlotsUsed(t)}/{w.SlotCap(t)}   ·   Tax {t.TaxEarned:N0}   ·   Tariff paid {t.TariffGenerated:N0}", 13));

            var level = w.CanLevelUp(t);
            string levelText = t.Level < bal.SlotsByLevel.Length ? $"Level up ({bal.TownLevelCost[t.Level - 1]:0}g)" : "Max level";
            var lvlBtn = Ui.Button(levelText, () => { _hud.Report(w.LevelUp(t)); _hud.MarkDirty(); }, level.Ok);
            _hud.Hint(lvlBtn, level.Ok ? "More building slots, Traders and Porters." : level.Reason);
            var give = w.CanGive(t);
            var giveBtn = Ui.Button("Give 1000", () => { _hud.Report(w.Give(t)); _hud.MarkDirty(); }, give.Ok);
            _hud.Hint(giveBtn, give.Ok ? "Treasury > Town: +10 happiness for a minute." : give.Reason);
            var take = w.CanTake(t);
            var takeBtn = Ui.Button("Take 1000", () => { _hud.Report(w.Take(t)); _hud.MarkDirty(); }, take.Ok);
            _hud.Hint(takeBtn, take.Ok ? "Town > Treasury: −30 happiness for a minute (mood and Tax, not housing)." : take.Reason);
            Root.Add(Ui.Row(lvlBtn, giveBtn, takeBtn));
            double crown = t.CrownEffect(w.Tick);
            if (crown != 0) Root.Add(Ui.Text($"Crown effect {crown:+0;-0} happiness for {(t.CrownModifierUntil - w.Tick) / 2}s", 12, false, crown > 0 ? Palette.Good : Palette.Bad));

            // People
            for (int tier = 0; tier < 4; tier++)
            {
                double cap = TownSim.TierCapacity(w, t, tier);
                if (cap <= 0) continue;
                double h = t.EffectiveHappiness(tier, w.Tick);
                var needs = content.Tiers[tier];
                string unmet = string.Join(", ", needs.Basic.Where(n => t.Satisfaction[tier][n.Good] < 0.8).Select(n => content.Goods[n.Good].Name));
                string lux = string.Join(", ", needs.Luxury.Where(n => t.Satisfaction[tier][n.Good] < 0.8).Select(n => content.Goods[n.Good].Name));
                Root.Add(Ui.Text($"{(Tier)tier}s {t.Population[tier]:0.0}/{cap:0.#}   happiness {h:0}%", 14, true, Palette.ForTier((Tier)tier)));
                Root.Add(Ui.Bar(h / 100.0, Ui.HappinessColor(h), 340, 6));
                if (unmet.Length > 0) Root.Add(Ui.Text("Missing needs: " + unmet, 12, false, Palette.Bad));
                if (lux.Length > 0) Root.Add(Ui.Text("Would enjoy: " + lux, 12, false, Palette.Muted));
            }

            if (game.SelectedBuilding != null && t.Buildings.Contains(game.SelectedBuilding))
                BuildingSection(game, game.SelectedBuilding);

            // Stock
            Root.Add(Ui.Spacer(4));
            Root.Add(Ui.Text("Stock  ·  price  ·  use/min", 13, true, Palette.Castle));
            var stock = Ui.Scroll(170);
            for (int g = 0; g < content.GoodCount; g++)
            {
                if (t.Stock[g] < 0.5 && t.ConsumptionPerMin[g] < 0.05 && t.Inbound[g] < 0.5) continue;
                string row = $"{content.Goods[g].Name}: {t.Stock[g]:0}  ·  {t.Price[g]:0.0}g  ·  {t.ConsumptionPerMin[g]:0.0}";
                if (t.Inbound[g] >= 0.5) row += $"  (+{t.Inbound[g]:0} coming)";
                double cover = t.ConsumptionPerMin[g] > 0.05 ? t.Stock[g] / t.ConsumptionPerMin[g] : 99;
                stock.Add(Ui.Text(row, 12, false, cover < 0.5 ? Palette.Bad : cover < 2 ? Palette.Warn : Palette.Paper));
            }
            Root.Add(stock);

            int traders = t.Traders.Count(x => x.State != TraderState.Idle);
            int porters = t.Porters.Count(x => x.Job != PorterJob.Idle);
            Root.Add(Ui.Text($"Traders out {traders}/{t.Traders.Count}   ·   Porters busy {porters}/{t.Porters.Count}   ·   bought {t.GoodsBought:0} · sold {t.GoodsSold:0}", 12, false, Palette.Muted));

            // Buildings
            Root.Add(Ui.Text("Buildings (click to inspect)", 13, true, Palette.Castle));
            var list = new VisualElement();
            list.style.flexDirection = FlexDirection.Row;
            list.style.flexWrap = Wrap.Wrap;
            foreach (var b in t.Buildings)
            {
                var bb = b;
                string tag = !b.Built ? "..." : b.IsUpgrading ? "^" : b.IsWorkplace && b.Workers < 0.01 ? "!" : "";
                var btn = Ui.Button(Palette.Letter(b.Def) + (b.Level > 1 ? b.Level.ToString() : "") + tag, () => { game.SelectTown(t, bb); _hud.MarkDirty(); });
                btn.style.minWidth = 34;
                if (b == game.SelectedBuilding) Ui.Highlight(btn, true);
                _hud.Hint(btn, b.Def.Name);
                list.Add(btn);
            }
            Root.Add(list);
        }

        void BuildingSection(GameController game, Building b)
        {
            var w = game.World;
            var content = w.Content;
            Root.Add(Ui.Spacer(4));
            var box = Ui.Card();
            box.style.backgroundColor = new Color(0.2f, 0.16f, 0.1f, 0.9f);
            box.Add(Ui.Text($"{b.Def.Name}  · level {b.Level}" + (b.Priority ? "  * priority" : ""), 15, true, Palette.ForBuilding(b.Def)));

            if (b.NeedsMaterials)
            {
                double p = TownSim.ConstructionProgress(w, b);
                box.Add(Ui.Text(b.Built ? $"Upgrading to level {b.UpgradingTo}: {p * 100:0}%" : $"Under construction: {p * 100:0}%", 13));
                box.Add(Ui.Bar(p, Palette.Accent, 320));
                foreach (var m in b.ActiveBill)
                {
                    double have = b.Delivered[m.Good];
                    if (have + 1e-6 >= m.Amount) continue;
                    string why = b.Town.Stock[m.Good] < 1 ? " — none in Stock; Traders will buy it" : " — Porters are carrying it";
                    box.Add(Ui.Text($"Needs {content.Goods[m.Good].Name} {have:0}/{m.Amount:0}{why}", 12, false, Palette.Warn));
                }
            }
            else if (b.IsHouse)
            {
                box.Add(Ui.Text($"{b.Residents:0.0}/{TownSim.HouseCapacity(w, b):0.#} residents", 13));
                var needs = content.Tiers[(int)b.Def.Tier];
                string inHouse = string.Join(", ", needs.Basic.Concat(needs.Luxury).Select(n => $"{content.Goods[n.Good].Name} {b.Buffer[n.Good]:0.#}"));
                box.Add(Ui.Text("In the house: " + inHouse, 12, false, Palette.Muted));
            }
            else if (b.IsWorkplace)
            {
                double perMin = TownSim.OutputRate(w, b) * 60 * content.Balance.TicksPerSecond;
                string output = b.Def.OutputGood >= 0 ? content.Goods[b.Def.OutputGood].Name : "-";
                box.Add(Ui.Text($"Workers {b.Workers:0.0}/{b.WorkerSlots()} ({b.Def.Tier}s) > {output} {perMin * b.WorkerSlots():0.0}/min at full crew", 13));
                foreach (var i in b.Def.InputsPerOutput)
                    box.Add(Ui.Text($"Input {content.Goods[i.Good].Name}: {b.Buffer[i.Good]:0.0} on hand", 12, false, b.Buffer[i.Good] < 0.5 ? Palette.Bad : Palette.Muted));
                string stop = b.Workers < 0.01 ? $"Stopped: no {b.Def.Tier}s free — build more {HouseFor(content, b.Def.Tier)}."
                    : b.OutputStore >= content.Balance.ProducerStoreCap - 0.5 ? "Stopped: store full — Porters can't keep up or Stock is full."
                    : b.Def.InputsPerOutput.Any(i => b.Buffer[i.Good] < 0.01) ? "Stopped: waiting for inputs." : "";
                if (stop.Length > 0) box.Add(Ui.Text(stop, 12, false, Palette.Warn));
                box.Add(Ui.Text($"Output store {b.OutputStore:0}/{content.Balance.ProducerStoreCap:0}", 12, false, Palette.Muted));
            }

            var row = Ui.Row();
            var next = b.Def.UpgradeTo(b.Level + 1);
            if (b.IsUpgrading)
            {
                row.Add(Ui.Button("Cancel upgrade", () => { _hud.Report(w.CancelUpgrade(b)); _hud.MarkDirty(); }));
            }
            else if (next != null)
            {
                var can = w.CanUpgrade(b);
                string cost = $"{next.GoldCost:0}g + " + string.Join(", ", next.MaterialCost.Select(m => $"{m.Amount:0} {content.Goods[m.Good].Name.ToLower()}"));
                var up = Ui.Button($"Upgrade > {next.Level}", () => { _hud.Report(w.StartUpgrade(b)); _hud.MarkDirty(); }, can.Ok);
                _hud.Hint(up, (can.Ok ? "" : can.Reason + "  ") + $"Cost {cost}. Effect: {Describe(next)}");
                row.Add(up);
            }
            if (b.IsWorkplace)
                row.Add(Ui.Button(b.Priority ? "Unstar" : "* Priority", () => { w.TogglePriority(b); _hud.MarkDirty(); }));
            var demolish = Ui.Button("Demolish", () => _hud.Confirm($"Demolish the {b.Def.Name}? Gold is refunded; materials are lost.", () =>
            {
                w.DestroyBuilding(b, out _);
                game.SelectTown(b.Town);
            }));
            row.Add(demolish);
            box.Add(row);
            Root.Add(box);
        }

        static string HouseFor(Content content, Tier tier)
        {
            foreach (var d in content.Buildings)
                if (d.Kind == BuildingKind.House && d.Tier == tier) return d.Name + "s";
            return "houses";
        }

        static string Describe(UpgradeLevel u)
        {
            switch (u.Effect)
            {
                case UpgradeEffect.HouseCapacity: return $"+{u.Value:0} resident";
                case UpgradeEffect.BasicUse: return $"Basic Needs use ×{u.Value:0.##}";
                case UpgradeEffect.LuxuryUse: return $"Luxury use ×{u.Value:0.##}";
                default: return $"output ×{u.Value:0.##}" + (u.ExtraWorkerSlots > 0 ? $", +{u.ExtraWorkerSlots} worker slot" : "");
            }
        }
    }
}
