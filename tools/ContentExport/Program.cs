using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using TradeWinds.Core;

// Writes the game's content catalogue as plain JSON for the owner Hub (tools/hub/build-hub.cjs).
// Usage: dotnet run --project tools/ContentExport -- <out.json>
public static class Program
{
    public static int Main(string[] args)
    {
        string outPath = args.Length > 0 ? args[0] : Path.Combine("tools", "hub", "data", "content.json");
        var c = GameContent.Create();
        string G(int i) => c.Goods[i].Id;
        object Amounts(IEnumerable<GoodAmount> list) => list.Select(a => new { good = G(a.Good), amount = a.Amount }).ToArray();

        var producers = new Dictionary<string, List<string>>();
        var usedBy = new Dictionary<string, List<string>>();
        foreach (var b in c.Buildings)
        {
            if (b.OutputGood >= 0) Add(producers, G(b.OutputGood), b.Id);
            foreach (var i in b.InputsPerOutput) Add(usedBy, G(i.Good), b.Id);
        }

        var needs = new List<object>();
        foreach (var t in c.Tiers)
        {
            foreach (var n in t.Basic) needs.Add(new { tier = t.Tier.ToString(), good = G(n.Good), kind = "basic", perPersonPerMin = n.Amount });
            foreach (var n in t.Luxury) needs.Add(new { tier = t.Tier.ToString(), good = G(n.Good), kind = "luxury", perPersonPerMin = n.Amount });
        }

        var data = new
        {
            generated = DateTime.Now.ToString("yyyy-MM-dd HH:mm"),
            goods = c.Goods.Select(g => new
            {
                id = g.Id, name = g.Name, basePrice = g.BasePrice,
                producedBy = producers.TryGetValue(g.Id, out var p) ? p : new List<string>(),
                inputFor = usedBy.TryGetValue(g.Id, out var u) ? u : new List<string>(),
            }).ToArray(),
            buildings = c.Buildings.Select(b => new
            {
                id = b.Id, name = b.Name, kind = b.Kind.ToString(), tier = b.Kind == BuildingKind.Castle ? "Castle" : b.Tier.ToString(),
                terrain = b.Kind == BuildingKind.Extractor ? b.Terrains[0].ToString() : null,
                output = b.OutputGood >= 0 ? G(b.OutputGood) : null,
                perWorkerPerMin = b.OutputPerWorkerPerMin,
                inputs = Amounts(b.InputsPerOutput),
                workerSlots = b.IsWorkplaceKind() ? b.WorkerSlots : 0,
                houseCapacity = b.HouseCapacity,
                goldCost = b.GoldCost,
                materials = Amounts(b.MaterialCost),
                buildSec = b.BuildSec,
                unlockedBy = b.UnlockedBy,
                unlockName = b.UnlockedBy != null ? c.ResearchNode(b.UnlockedBy)?.Name : null,
                upgrades = b.Upgrades.Select(u => new
                {
                    level = u.Level, gold = u.GoldCost, materials = Amounts(u.MaterialCost),
                    effect = u.Effect.ToString(), value = u.Value, extraSlots = u.ExtraWorkerSlots, unlockedBy = u.UnlockedBy,
                }).ToArray(),
            }).ToArray(),
            tiers = c.Tiers.Select(t => new { tier = t.Tier.ToString(), taxPerPersonPerMin = t.TaxPerPersonPerMin }).ToArray(),
            needs,
            research = c.Research.Select(r => new
            {
                id = r.Id, name = r.Name, band = r.Band.ToString(), requires = r.Requires,
                materials = Amounts(r.Materials), modifier = r.Modifier.ToString(), value = r.Value, description = r.Description,
                unlocks = c.Buildings.Where(b => b.UnlockedBy == r.Id).Select(b => b.Name).ToArray(),
            }).ToArray(),
            missions = c.Missions.Select(m => new
            {
                id = m.Id, name = m.Name, reward = m.RewardGold, tip = m.Tip,
                objectives = m.Objectives.Select(o => o.Label).ToArray(),
            }).ToArray(),
        };

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath)));
        File.WriteAllText(outPath, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"Wrote {outPath}: {c.Goods.Length} goods, {c.Buildings.Length} buildings, {c.Research.Length} research, {c.Missions.Length} missions");
        return 0;
    }

    static bool IsWorkplaceKind(this BuildingDef b) => b.Kind == BuildingKind.Extractor || b.Kind == BuildingKind.Processor;

    static void Add(Dictionary<string, List<string>> map, string key, string value)
    {
        if (!map.TryGetValue(key, out var list)) map[key] = list = new List<string>();
        list.Add(value);
    }
}
