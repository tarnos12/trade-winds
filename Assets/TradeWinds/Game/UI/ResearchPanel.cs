using System.Linq;
using TradeWinds.Core;
using UnityEngine;
using UnityEngine.UIElements;

namespace TradeWinds.Game
{
    /// <summary>Full-screen research tree: five bands (Peasant > Aristocrat, plus Kingdom). Click to start or queue; click again to cancel.</summary>
    public sealed class ResearchPanel
    {
        readonly Hud _hud;
        public readonly VisualElement Root;

        public ResearchPanel(Hud hud)
        {
            _hud = hud;
            Root = Ui.Card();
            Root.style.position = Position.Absolute;
            Root.style.left = 40;
            Root.style.right = 40;
            Root.style.top = 60;
            Root.style.bottom = 110;
            Root.style.backgroundColor = new Color(0.1f, 0.08f, 0.055f, 0.98f);
        }

        public void Rebuild(GameController game)
        {
            Root.Clear();
            var w = game.World;
            var content = w.Content;

            var header = Ui.Row(Ui.Heading("Research"), Ui.Button("Close (R)", _hud.ToggleResearch));
            Root.Add(header);
            double speed = ResearchSim.Speed(w);
            if (speed <= 0) Root.Add(Ui.Text("Build a Research Center next to the Castle — research is paused without one.", 13, false, Palette.Warn));
            if (w.ActiveResearch != null)
            {
                var node = content.ResearchNode(w.ActiveResearch);
                double p = ResearchSim.Progress(w);
                Root.Add(Ui.Text($"Researching {node.Name}: {p * 100:0}%  ·  {speed:0} materials/s from the Castle Stock", 13, true));
                Root.Add(Ui.Bar(p, Palette.Accent, 500));
                string waiting = string.Join(", ", node.Materials
                    .Where(m => w.Castle.Stock[m.Good] < 0.5 && w.ResearchConsumed[m.Good] + 1e-6 < m.Amount)
                    .Select(m => content.Goods[m.Good].Name));
                if (waiting.Length > 0) Root.Add(Ui.Text($"Waiting for {waiting} — royal Traders buy it from Towns with a surplus. No Town makes it? Build its producer.", 12, false, Palette.Warn));
            }
            if (w.ResearchQueue.Count > 0)
                Root.Add(Ui.Text("Queue: " + string.Join(" > ", w.ResearchQueue.Select(q => content.ResearchNode(q).Name)), 12, false, Palette.Muted));

            var columns = new VisualElement();
            columns.style.flexDirection = FlexDirection.Row;
            columns.style.flexGrow = 1;
            foreach (ResearchBand band in System.Enum.GetValues(typeof(ResearchBand)))
            {
                var col = new ScrollView(ScrollViewMode.Vertical);
                col.style.flexGrow = 1;
                col.style.flexBasis = 0;
                col.style.marginRight = 6;
                col.Add(Ui.Text(band.ToString(), 15, true, band == ResearchBand.Kingdom ? Palette.Castle : Palette.ForTier((Tier)(int)band)));
                foreach (var node in content.Research.Where(n => n.Band == band))
                    col.Add(NodeButton(w, node));
                columns.Add(col);
            }
            Root.Add(columns);
        }

        VisualElement NodeButton(World w, ResearchNode node)
        {
            var content = w.Content;
            bool done = w.ResearchDone.Contains(node.Id);
            bool active = w.ActiveResearch == node.Id;
            int queued = w.ResearchQueue.IndexOf(node.Id);
            bool available = ResearchSim.IsAvailable(w, node);
            string mats = string.Join(", ", node.Materials.Select(m => $"{m.Amount:0} {content.Goods[m.Good].Name.ToLower()}"));
            string label = node.Name + (done ? "  (done)" : active ? $"  {ResearchSim.Progress(w) * 100:0}%" : queued >= 0 ? $"  #{queued + 1}" : "");

            var b = Ui.Button(label, () =>
            {
                if (done) return;
                if (active || queued >= 0) ResearchSim.Cancel(w, node.Id);
                else _hud.Report(ResearchSim.Start(w, node.Id));
                _hud.MarkDirty();
            });
            b.style.whiteSpace = WhiteSpace.Normal;
            b.style.unityTextAlign = TextAnchor.MiddleLeft;
            b.style.backgroundColor = done ? new Color(0.2f, 0.35f, 0.18f, 1f) : active ? Palette.Accent : available ? Ui.ButtonBg : Ui.ButtonDisabled;
            b.style.color = done || available || active ? Palette.Paper : Palette.Muted;
            string req = node.Requires.Length > 0 ? " Requires: " + string.Join(", ", node.Requires.Select(r => content.ResearchNode(r)?.Name ?? r)) + "." : "";
            string what = node.Description ?? UnlockText(content, node.Id);
            _hud.Hint(b, $"{node.Name}: {what} Costs {mats}.{req}" + (done ? "" : active || queued >= 0 ? " Click to cancel (nothing is refunded)." : available ? " Click to start." : " Click to queue."));
            return b;
        }

        static string UnlockText(Content content, string id)
        {
            var unlocks = content.Buildings.Where(d => d.UnlockedBy == id).Select(d => d.Name).ToArray();
            return unlocks.Length > 0 ? "Unlocks " + string.Join(", ", unlocks) + "." : "";
        }
    }
}
