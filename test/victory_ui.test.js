"use strict";
// v0.52.1 (QA item #1): the victory card must not re-open on every Continue of an
// already-won save, nor pop (with its fanfare) behind the start screen at boot.
// Headless BROWSER test — the defect lives in the impure shell (progress-ui poll +
// save.js), so it drives the real index.html in Chromium:
//   1. a fresh win (victory true, victorySeen false) shows the card in play;
//   2. "Keep ruling" marks state.victorySeen and the save carries it;
//   3. reload → boot loads the save as the start-screen backdrop: no card, no fanfare;
//   4. Continue on that won+seen save: still no card;
//   5. a won save whose card was never dismissed (victorySeen false): no card behind
//      the start screen, but it shows once the player Continues;
//   6. a pre-v0.52.1 won save (no victorySeen field) loads as seen (no card).
//   node test/victory_ui.test.js
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
const SAVE_KEY = "tradewinds.save";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  -- " + JSON.stringify(detail) : "")); }
}

// Count victory fanfares: wrap SFX.play before the page's own scripts can call it.
const SPY = () => {
  window.__fanfares = 0;
  const hook = () => {
    if (!window.SFX || window.SFX.__spied) return !!window.SFX;
    const orig = window.SFX.play;
    window.SFX.play = function (name, tag) { if (tag === "victory") window.__fanfares++; return orig.apply(this, arguments); };
    window.SFX.__spied = true;
    return true;
  };
  const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 5);
};
const cardUp = (page) => page.evaluate(() => !document.getElementById("winNotice").classList.contains("hidden"));
const fanfares = (page) => page.evaluate(() => window.__fanfares || 0);
const startOpen = (page) => page.evaluate(() => window.StartScreen.isOpen());

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(SPY);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(GAME_URL, { waitUntil: "load" });
    await page.waitForTimeout(500);

    console.log("1: a fresh win shows the card in play");
    await page.evaluate(() => {
      window.StartScreen.startNew("victory-ui-seed", "fertile");
      const st = window.__cre.state;
      st.gameSpeed = 0;
      st.victory = true; st.victoryTick = 1200; st.victorySeen = false;
    });
    await page.waitForTimeout(900);
    ok("card opens for an undismissed win", await cardUp(page));
    ok("…with one fanfare", (await fanfares(page)) === 1, await fanfares(page));

    console.log("2: Keep ruling marks the win seen, and the save carries it");
    await page.click("#wnClose");
    await page.waitForTimeout(700);
    const s2 = await page.evaluate(() => ({ seen: window.__cre.state.victorySeen, up: !document.getElementById("winNotice").classList.contains("hidden") }));
    ok("Keep ruling closes the card", !s2.up);
    ok("Keep ruling sets state.victorySeen", s2.seen === true);
    await page.waitForTimeout(700);
    ok("card stays closed in play (no re-open by the poll)", !(await cardUp(page)));
    await page.click("#hudMenuBtn");
    await page.waitForTimeout(150);
    await page.click("#btnMainMenu");                 // saveGame() + start overlay
    await page.waitForTimeout(200);
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), SAVE_KEY);
    ok("save has victory + victorySeen", saved.victory === true && saved.victorySeen === true, { v: saved.victory, s: saved.victorySeen });

    console.log("3: reload — boot loads the won save behind the start screen");
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    ok("start screen is up", await startOpen(page));
    ok("the backdrop save is the won realm", await page.evaluate(() => window.__cre.state.victory === true));
    ok("no victory card behind the start screen", !(await cardUp(page)));
    ok("no fanfare at boot", (await fanfares(page)) === 0, await fanfares(page));

    console.log("4: Continue on a won + dismissed save");
    await page.click("#ssContinue");
    await page.waitForTimeout(1500);
    ok("Continue resumes play", !(await startOpen(page)));
    ok("no victory card on Continue", !(await cardUp(page)));
    ok("no fanfare on Continue", (await fanfares(page)) === 0);

    console.log("5: a won save whose card was never dismissed");
    await page.click("#hudMenuBtn");
    await page.waitForTimeout(150);
    await page.click("#btnMainMenu");                 // back to the start screen
    await page.waitForTimeout(200);
    // un-dismiss the win; the page's own beforeunload saveGame() persists it
    await page.evaluate(() => { window.__cre.state.victorySeen = false; });
    await page.waitForTimeout(700);
    ok("no card while the start screen is up (live state)", !(await cardUp(page)));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    const p2 = page;
    const pre = await p2.evaluate(() => ({ v: window.__cre.state.victory, s: window.__cre.state.victorySeen }));
    ok("backdrop is a won, undismissed save", pre.v === true && pre.s === false, pre);
    ok("…still no card while the start screen is up", !(await cardUp(p2)));
    ok("…and no fanfare", (await fanfares(p2)) === 0);
    await p2.click("#ssContinue");
    await p2.waitForTimeout(1200);
    ok("the card shows once the player Continues", await cardUp(p2));
    ok("…with its fanfare", (await fanfares(p2)) === 1, await fanfares(p2));
    await p2.click("#wnNew");                         // New realm: dismiss + fresh map
    await p2.waitForTimeout(900);
    const nr = await p2.evaluate(() => ({ v: window.__cre.state.victory, s: window.__cre.state.victorySeen,
      up: !document.getElementById("winNotice").classList.contains("hidden") }));
    ok("New realm starts an unwon map with victorySeen reset", nr.v === false && nr.s === false && !nr.up, nr);

    console.log("6: a pre-v0.52.1 won save (no victorySeen) loads as seen");
    const legacy = await p2.evaluate(() => {
      const d = JSON.parse(localStorage.getItem("tradewinds.save"));
      d.victory = true; d.victoryTick = 900; delete d.victorySeen;
      localStorage.setItem("tradewinds.save", JSON.stringify(d));
      window.StartScreen.continueSave();
      return window.__cre.state.victorySeen;
    });
    await p2.waitForTimeout(1200);
    ok("legacy won save → victorySeen true", legacy === true, legacy);
    ok("legacy won save → no card on Continue", !(await cardUp(p2)));

    ok("no page errors", errs.length === 0, errs);
  } finally {
    await browser.close();
  }
  console.log(`\nvictory_ui: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
