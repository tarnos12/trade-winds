"use strict";
// DESIGN PASS (plan item #1): Save/Continue safety — headless BROWSER regression net.
// Drives the real index.html in Chromium (playwright-core, resolved like
// test/editor.test.js) because the defects live in the impure shell (save.js,
// CityCards, the ☰ menu), not in PURE_CORE:
//   ux-1  Continue must restore lifetime stats + mission progress (it used to
//         restart m1 and zero the lifetime tariff that m5/m7 read).
//   ux-2  City cards must act on the LIVE town after Continue (a stale closure let
//         Shift+Take mint 1000 g with no penalty, and a card click closed the panel).
//   ux-3  The ☰ menu's Generate/🎲/Reveal-fog/Debug controls render only with
//         ?debug=1, and even then regenerate goes through the confirm overlay.
//   node test/save_roundtrip.test.js
const path = require("path");

function findPlaywrightCore() {
  if (process.env.PW_CORE) return process.env.PW_CORE;
  const cands = ["playwright-core"];
  try {
    const globalRoot = require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim();
    cands.push(path.join(globalRoot, "playwright-core"),
               path.join(globalRoot, "playwright", "node_modules", "playwright-core"));
  } catch (e) { /* npm not on PATH */ }
  for (const c of cands) { try { require.resolve(c); return c; } catch (e) { /* next */ } }
  return cands[0];
}
const { chromium } = require(findPlaywrightCore());
const CHROME_PATH = process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const GAME_URL = "file://" + path.join(__dirname, "..", "index.html");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  -- " + JSON.stringify(detail) : "")); }
}

// Seed a 3-city kingdom with known lifetime stats + mission progress, then save it
// through the real Main Menu button (saveGame()).
async function makeThreeCitySave(page) {
  await page.evaluate(() => {
    window.StartScreen.startNew("roundtrip-seed", "fertile");
    const st = window.__cre.state;
    st.gameSpeed = 0;   // freeze the economy so gold/happiness assertions are exact
    const spots = [[3, 0], [-3, 0], [0, 3]];
    for (const [q, r] of spots) {
      const t = window.TownUI.makeTown(q, r);
      t.built = true; t.gold = 3000; t.happyMods = [];
      st.towns.push(t);
    }
    const stats = Sim.ensureStats(st);
    stats.taxEarned = 162.9;
    stats.constructed.total = 14;
    stats.founded = 3;
    stats.traded.byGood.wood = 67;
    st.missions = {
      done: false, skipped: false,
      activated: { m1: true, m2: true, m3: true },
      completed: { m1: true, m2: true },
      baselines: { m5: [5, 40], m7: [1, 0, 120] },
    };
    document.getElementById("btnMainMenu").click();   // saveGame() + back to the start overlay
    // Prove the restore comes from the SAVE, not the per-browser tutorial mirror.
    localStorage.removeItem("tradewinds.tutorial");
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, args: ["--no-sandbox"] });
  try {
    // ------------------------------------------------------------------ player build
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(GAME_URL, { waitUntil: "load" });
    await page.waitForTimeout(600);

    console.log("ux-3: debug controls hidden without ?debug=1");
    await page.evaluate(() => window.StartScreen.startNew("menu-seed", "fertile"));
    await page.click("#hudMenuBtn");
    await page.waitForTimeout(150);
    const vis = {};
    for (const id of ["btnGen", "btnRandom", "seed", "btnReveal", "fps", "sfxDebug"]) vis[id] = await page.isVisible("#" + id);
    ok("Seed/Generate/🎲/Reveal/fps/sounds are not rendered in the player menu",
      Object.values(vis).every(v => v === false), vis);
    ok("Pan/Erase/Center stay in the player menu", await page.isVisible("#btnCenter"));
    // Even a scripted click on the hidden 🎲 cannot silently wipe the kingdom.
    const wiped = await page.evaluate(() => {
      const st = window.__cre.state;
      st.towns.push(window.TownUI.makeTown(3, 0));
      const before = st.seedInput;
      document.getElementById("btnRandom").click();
      return { seedSame: st.seedInput === before, towns: st.towns.length, confirm: !!document.getElementById("uiConfirm") };
    });
    ok("hidden 🎲 click does not regenerate without confirmation", wiped.seedSame && wiped.towns === 1 && wiped.confirm, wiped);
    await page.evaluate(() => { const c = document.getElementById("uiConfirmCancel"); if (c) c.click(); });
    if (await page.isVisible("#hudMenuClose")) await page.click("#hudMenuClose");

    console.log("ux-1: Continue restores stats + missions");
    await makeThreeCitySave(page);
    await page.reload({ waitUntil: "load" });           // boot loadGame() builds cards for the backdrop
    await page.waitForTimeout(800);
    await page.click("#ssContinue");                    // real Continue → loadGame() again
    await page.waitForTimeout(300);
    const r1 = await page.evaluate(() => {
      const st = window.__cre.state;
      st.gameSpeed = 0;
      return {
        towns: st.towns.length,
        taxEarned: st.stats && st.stats.taxEarned,
        constructed: st.stats && st.stats.constructed && st.stats.constructed.total,
        wood: st.stats && st.stats.traded && st.stats.traded.byGood.wood,
        completed: st.missions && st.missions.completed,
        activated: st.missions && st.missions.activated,
        baselines: st.missions && st.missions.baselines,
        tut: (document.getElementById("tutorial") || {}).textContent || "",
      };
    });
    ok("3 cities restored", r1.towns === 3, r1.towns);
    ok("stats.taxEarned survives (162.9)", r1.taxEarned === 162.9, r1.taxEarned);
    ok("stats.constructed.total survives (14)", r1.constructed === 14, r1.constructed);
    ok("stats.traded.byGood survives", r1.wood === 67, r1.wood);
    ok("missions.completed {m1,m2} survives", !!(r1.completed && r1.completed.m1 && r1.completed.m2), r1.completed);
    ok("missions.activated m3 survives", !!(r1.activated && r1.activated.m3), r1.activated);
    ok("m5 baseline survives", JSON.stringify(r1.baselines && r1.baselines.m5) === "[5,40]", r1.baselines);
    ok("m7 baseline survives", JSON.stringify(r1.baselines && r1.baselines.m7) === "[1,0,120]", r1.baselines);
    ok("coach no longer restarts at 'Found Your Realm'", !/Found Your Realm/.test(r1.tut), r1.tut.slice(0, 120));

    console.log("ux-2: city cards act on the live towns after Continue");
    await page.click("#cityCards .city-card:nth-child(1) .cc-name");
    await page.waitForTimeout(200);
    const panel = await page.evaluate(() => {
      const el = document.getElementById("townPanel");
      return { hidden: el.classList.contains("hidden"), text: (el.textContent || "").slice(0, 60) };
    });
    ok("card #1 click opens #townPanel", !panel.hidden, panel);
    await page.keyboard.press("Escape");
    await page.evaluate(() => { if (window.TownUI) window.TownUI.closeTownPanel(); });

    const before = await page.evaluate(() => {
      const st = window.__cre.state; const t = st.towns.find(x => x.id === 1);
      return { gold: t.gold, mods: (t.happyMods || []).length, treasury: st.treasury };
    });
    await page.keyboard.down("Shift");
    await page.waitForTimeout(100);
    await page.click("#cityCards .city-card:nth-child(1) .cc-take");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => {
      const st = window.__cre.state; const t = st.towns.find(x => x.id === 1);
      const last = (t.happyMods || [])[t.happyMods.length - 1];
      return { gold: t.gold, mods: (t.happyMods || []).length, lastDelta: last && last.delta, treasury: st.treasury };
    });
    ok("Shift+Take moves 1000 g out of the LIVE town", after.gold === before.gold - 1000, { before, after });
    ok("Shift+Take adds a happyMod (−30) to the live town", after.mods === before.mods + 1 && after.lastDelta === -30, after);
    ok("treasury gains exactly the 1000 g taken", after.treasury === before.treasury + 1000, { before, after });
    const stale = await page.evaluate(() => ({
      take: window.CityCards.take({ id: 2, gold: 5000, happyMods: [] }),
      give: window.CityCards.give({ id: 2, gold: 0, happyMods: [] }),
    }));
    ok("give/take refuse a town object that is not in state.towns", stale.take === false && stale.give === false, stale);

    console.log("New Game after Continue starts clean");
    const fresh = await page.evaluate(() => {
      window.StartScreen.startNew("fresh-after-continue", "fertile");
      const st = window.__cre.state;
      return {
        tax: st.stats.taxEarned, built: st.stats.constructed.total,
        completed: Object.keys((st.missions && st.missions.completed) || {}).length,
        cards: document.querySelectorAll("#cityCards .city-card").length,
      };
    });
    ok("New Game resets lifetime stats", fresh.tax === 0 && fresh.built === 0, fresh);
    ok("New Game resets mission progress", fresh.completed === 0, fresh);
    ok("New Game clears the city cards", fresh.cards === 0, fresh);
    ok("no page errors (player build)", errs.length === 0, errs);
    await ctx.close();

    // ------------------------------------------------------------------ ?debug=1 build
    console.log("ux-3: ?debug=1 shows the controls, regenerate asks first");
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const dp = await dctx.newPage();
    const derrs = [];
    dp.on("pageerror", (e) => derrs.push(e.message));
    await dp.goto(GAME_URL + "?debug=1", { waitUntil: "load" });
    await dp.waitForTimeout(600);
    await dp.evaluate(() => {
      window.StartScreen.startNew("debug-seed", "fertile");
      window.__cre.state.towns.push(window.TownUI.makeTown(3, 0));
    });
    await dp.click("#hudMenuBtn");
    await dp.waitForTimeout(150);
    ok("debug menu shows 🎲 / Generate / Reveal fog / fps",
      (await dp.isVisible("#btnRandom")) && (await dp.isVisible("#btnGen")) && (await dp.isVisible("#btnReveal")) && (await dp.isVisible("#fps")));
    await dp.click("#btnRandom");
    await dp.waitForTimeout(100);
    const conf = await dp.evaluate(() => {
      const el = document.getElementById("uiConfirm");
      return { shown: !!el, text: el ? el.textContent : "", towns: window.__cre.state.towns.length };
    });
    ok("🎲 opens the confirm overlay with the abandon warning",
      conf.shown && /Abandon this kingdom\? Your save will be overwritten\./.test(conf.text) && conf.towns === 1, conf);
    await dp.click("#uiConfirmCancel");
    ok("Cancel keeps the kingdom", await dp.evaluate(() => window.__cre.state.towns.length === 1 && window.__cre.state.seedInput === "debug-seed"));
    if (!(await dp.isVisible("#btnGen"))) { await dp.click("#hudMenuBtn"); await dp.waitForTimeout(150); }   // the overlay click closes the ☰ menu
    await dp.click("#btnGen");
    await dp.waitForTimeout(100);
    await dp.click("#uiConfirmOk");
    await dp.waitForTimeout(100);
    ok("confirming Generate starts a new map", await dp.evaluate(() => window.__cre.state.towns.length === 0));
    ok("no page errors (debug build)", derrs.length === 0, derrs);
    await dctx.close();
  } finally {
    await browser.close();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
