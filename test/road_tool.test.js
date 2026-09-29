"use strict";
// Headless BROWSER regression for the road tool + tool copy (design pass #14).
// Drives the real game (index.html) in Chromium with genuine mouse input:
//   - flyout copy: City shows its 1,000🪙 cost, Road shows "5🪙/hex" and the
//     click-start/click-end instruction (not "drag");
//   - press A → drag → release B lays the whole A→B route (a drag used to lay only
//     the anchor hex and leave it armed for a surprise route on the next click);
//   - click jitter across a hex edge (< roadDragMinPx) does NOT complete a route;
//   - the armed hint, the cached preview (N new hexes · cost) and Esc-cancel;
//   - click A, click B (the original tool) still works; Shift chains;
//   - GOOD_LABEL turns "iron_tool" into "Iron tool"; city-card happiness bar has width.
// playwright-core is resolved like test/editor.test.js (PW_CORE, plain module, or
// the global playwright install).

function findPlaywrightCore() {
  if (process.env.PW_CORE) return process.env.PW_CORE;
  const cands = ["playwright-core"];
  try {
    const globalRoot = require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim();
    const P = require("path");
    cands.push(P.join(globalRoot, "playwright-core"),
               P.join(globalRoot, "playwright", "node_modules", "playwright-core"));
  } catch (e) { /* npm not on PATH */ }
  for (const c of cands) { try { require.resolve(c); return c; } catch (e) { /* next */ } }
  return cands[0];
}
const { chromium } = require(findPlaywrightCore());
const path = require("path");
const CHROME_PATH = process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FILE_URL = "file://" + path.join(__dirname, "..", "index.html");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "  → " + extra : "")); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  try {
    await page.goto(FILE_URL, { waitUntil: "load" });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      try { localStorage.clear(); } catch (e) { /* ignore */ }
      window.StartScreen.startNew(1, "fertile");
      const st = window.__cre.state;
      st.gameSpeed = 0; st.treasury = 100000;
      if (window.Tutorial && Tutorial.dismiss) Tutorial.dismiss();
    });
    await page.waitForTimeout(400);

    // world → screen (renderer transform); hex size read from the live CONFIG-free SIZE (24)
    const hexScreen = (q, r) => page.evaluate(([q, r]) => {
      const st = window.__cre.state, S = 24;
      const p = HexMath.hexToPixel(q, r, S);
      const c = document.getElementById("game");
      return { x: (p.x - st.cam.x) * st.zoom + c.clientWidth / 2, y: (p.y - st.cam.y) * st.zoom + c.clientHeight / 2 };
    }, [q, r]);

    // Find a straight row of 5 revealed, road-eligible, road-free hexes plus a second,
    // disjoint row for the jitter / click-click checks.
    const rows = await page.evaluate(() => {
      const st = window.__cre.state;
      const elig = (q, r) => {
        const k = HexMath.key(q, r), hex = st.map.hexes.get(k);
        if (!hex || !st.revealed.has(k) || st.roads.has(k)) return false;
        if (q === 0 && r === 0) return false;
        if (st.researchCenter && st.researchCenter.q === q && st.researchCenter.r === r) return false;
        return !!CONFIG.terrain[hex.terrain].road;
      };
      const out = [];
      const used = new Set();
      for (let r = -6; r <= 6 && out.length < 3; r++) {
        for (let q = -8; q <= 4 && out.length < 3; q++) {
          let good = true;
          for (let i = 0; i < 5; i++) if (!elig(q + i, r) || used.has((q + i) + "," + r) || used.has((q + i) + "," + (r - 1)) || used.has((q + i) + "," + (r + 1))) { good = false; break; }
          if (good) { out.push({ q, r }); for (let i = 0; i < 5; i++) used.add((q + i) + "," + r); q += 5; }
        }
      }
      return out;
    });
    ok("found 3 test rows of road-eligible land", rows.length === 3, JSON.stringify(rows));
    if (rows.length < 3) throw new Error("no test rows");
    const [R1, R2, R3] = rows;
    await page.evaluate(([q, r]) => {
      const st = window.__cre.state, p = HexMath.hexToPixel(q, r, 24);
      st.cam.x = p.x; st.cam.y = p.y; st.zoom = 1.4;
      if (st.camTarget) { st.camTarget.x = p.x; st.camTarget.y = p.y; }
      if ("zoomTarget" in st) st.zoomTarget = 1.4;
    }, [R2.q + 2, R2.r]);
    await page.waitForTimeout(500);

    // --- flyout copy ---------------------------------------------------------
    const cats = await page.$$(".bb-cat");
    for (const c of cats) { if ((await c.innerText()).toLowerCase().includes("build")) { await c.click(); break; } }
    await page.waitForTimeout(200);
    const fly = await page.evaluate(() => Array.from(document.querySelectorAll("#buildBarFlyout .bb-btn"))
      .map(b => ({ t: b.innerText.replace(/\s+/g, " ").trim(), tip: b.title || "", a: b.dataset.action })));
    const cityBtn = fly.find(b => b.a === "town"), roadBtn = fly.find(b => b.a === "road"), eraseB = fly.find(b => b.a === "eraseBuilding");
    ok("City item shows the 1,000🪙 founding cost", cityBtn && /Found a city · 1,000🪙 · \d+\/\d+/.test(cityBtn.t), cityBtn && cityBtn.t);
    ok("Road item shows 'Lay a road · 5🪙/hex'", roadBtn && roadBtn.t.includes("Lay a road · 5🪙/hex"), roadBtn && roadBtn.t);
    ok("Road tooltip says click start, click end", roadBtn && roadBtn.tip === "Click a start hex, then an end hex (Shift chains)", roadBtn && roadBtn.tip);
    ok("Road copy never says 'drag'", roadBtn && !/drag/i.test(roadBtn.t + roadBtn.tip));
    ok("Destroy-building tooltip promises the gold refund", eraseB && eraseB.tip.includes("refunds the gold spent (not resources)"), eraseB && eraseB.tip);
    await page.click('#buildBarFlyout .bb-btn[data-action="road"]');
    await page.waitForTimeout(150);
    const hint = () => page.evaluate(() => document.getElementById("buildBarHint").textContent);
    ok("armed hint: 'Click where the road starts.'", (await hint()) === "Click where the road starts.", await hint());

    // --- press A, drag, release B lays the whole route -------------------------
    const roadsIn = (row) => page.evaluate(([q, r]) => {
      const st = window.__cre.state; let n = 0;
      for (let i = 0; i < 5; i++) if (st.roads.has(HexMath.key(q + i, r))) n++;
      return n;
    }, [row.q, row.r]);
    const tre0 = await page.evaluate(() => window.__cre.state.treasury);
    const a1 = await hexScreen(R2.q, R2.r), b1 = await hexScreen(R2.q + 4, R2.r);
    await page.mouse.move(a1.x, a1.y);
    await page.mouse.down();
    await page.mouse.move((a1.x + b1.x) / 2, (a1.y + b1.y) / 2, { steps: 4 });
    await page.mouse.move(b1.x, b1.y, { steps: 4 });
    // mid-drag: the anchor is exposed and the preview is cached per hovered hex
    const mid = await page.evaluate(([q, r]) => {
      const api = window.InputRoad, p1 = api.preview(q, r), p2 = api.preview(q, r);
      return { anchor: !!api.anchor, newHexes: p1 && p1.newHexes, cost: p1 && p1.cost, cached: p1 === p2, straight: p1 && p1.straight };
    }, [R2.q + 4, R2.r]);
    ok("mid-drag: InputRoad.anchor is set", mid.anchor);
    ok("preview counts the 4 new hexes after the anchor (4×5🪙)", mid.newHexes === 4 && mid.cost === 20 && !mid.straight, JSON.stringify(mid));
    ok("preview is cached for the same hovered hex", mid.cached);
    ok("armed hint switches to the end-hex instruction", (await hint()) === "Now click where the road should end — Esc cancels.", await hint());
    await page.mouse.up();
    await page.waitForTimeout(150);
    ok("drag A→B laid all 5 hexes", (await roadsIn(R2)) === 5, await roadsIn(R2));
    const st1 = await page.evaluate(() => ({ mode: window.__cre.state.mode, anchor: window.InputRoad.anchor, t: window.__cre.state.treasury }));
    ok("drag charged 5×5🪙", tre0 - st1.t === 25, tre0 - st1.t);
    ok("after the drag: no forgotten anchor, tool deselected", st1.anchor === null && st1.mode === "pan", JSON.stringify(st1));
    ok("hint cleared after the route", (await hint()) === "", await hint());

    // --- jitter across a hex edge does NOT complete a route --------------------
    const pickTool = async (action) => {
      if (!(await page.$(`#buildBarFlyout .bb-btn[data-action="${action}"]`)) || !(await page.isVisible("#buildBarFlyout"))) {
        for (const c of await page.$$(".bb-cat")) { if ((await c.innerText()).toLowerCase().includes("build")) { await c.click(); break; } }
        await page.waitForTimeout(200);
      }
      await page.click(`#buildBarFlyout .bb-btn[data-action="${action}"]`);
      await page.waitForTimeout(150);
    };
    await pickTool("road");
    const cA = await hexScreen(R3.q, R3.r), cB = await hexScreen(R3.q + 1, R3.r);
    const ex = (cA.x + cB.x) / 2, ey = (cA.y + cB.y) / 2;   // shared edge midpoint
    await page.mouse.move(ex - 2, ey);
    await page.mouse.down();
    await page.mouse.move(ex + 2, ey, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const j = await page.evaluate(() => ({ mode: window.__cre.state.mode, anchor: window.InputRoad.anchor }));
    ok("jitter (4px across an edge) lays only the anchor", (await roadsIn(R3)) === 1, await roadsIn(R3));
    ok("jitter leaves the anchor armed in road mode", j.mode === "road" && j.anchor && j.anchor.q === R3.q && j.anchor.r === R3.r, JSON.stringify(j));

    // --- Esc cancels the anchor (tool stays armed) ----------------------------
    await page.mouse.move(cA.x, cA.y + 60);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const esc = await page.evaluate(() => ({ mode: window.__cre.state.mode, anchor: window.InputRoad.anchor }));
    ok("Esc drops the anchor", esc.anchor === null && esc.mode === "road", JSON.stringify(esc));
    ok("hint back to the start instruction after Esc", (await hint()) === "Click where the road starts.", await hint());

    // --- classic click A, Shift-click B (chain), click C ----------------------
    const r1a = await hexScreen(R1.q, R1.r), r1b = await hexScreen(R1.q + 2, R1.r), r1c = await hexScreen(R1.q + 4, R1.r);
    await page.mouse.click(r1a.x, r1a.y);
    await page.waitForTimeout(100);
    await page.keyboard.down("Shift");
    await page.mouse.click(r1b.x, r1b.y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(100);
    const ch = await page.evaluate(() => ({ mode: window.__cre.state.mode, anchor: window.InputRoad.anchor }));
    ok("Shift-click B chains (B is the new anchor)", ch.mode === "road" && ch.anchor && ch.anchor.q === R1.q + 2, JSON.stringify(ch));
    await page.mouse.click(r1c.x, r1c.y);
    await page.waitForTimeout(100);
    ok("click A → Shift B → C laid the 5-hex row", (await roadsIn(R1)) === 5, await roadsIn(R1));
    ok("plain click on the end deselects", await page.evaluate(() => window.__cre.state.mode === "pan" && window.InputRoad.anchor === null));

    // --- GOOD_LABEL + tech-tree V + city-card happiness bar --------------------
    await page.evaluate(() => { window.CastleUI.openCastlePanel(); document.querySelector('[data-cwtab="warehouse"]').click(); });
    await page.waitForTimeout(300);
    const wh = await page.evaluate(() => document.getElementById("castlePanel") ? document.getElementById("castlePanel").innerText : document.body.innerText);
    ok("castle tables label iron_tool as 'Iron tool' (no raw underscore id)", /Iron tool/.test(wh) && !/Iron_tool/.test(wh));
    ok("Royal Stores no longer mentions King's-quest deliveries", !/King's-quest/.test(wh));
    await page.evaluate(() => { const c = document.getElementById("cwClose"); if (c) c.click(); });
    // found a city through the City tool so a city card (with its happiness bar) exists
    const site = await page.evaluate(() => {
      const st = window.__cre.state;
      for (let rad = 2; rad <= 6; rad++) for (let q = -rad; q <= rad; q++) for (let r = -rad; r <= rad; r++) {
        const k = HexMath.key(q, r);
        if (st.revealed.has(k) && Buildings.canPlaceTown(st, q, r).ok) return { q, r };
      }
      return null;
    });
    ok("found a valid city site", !!site);
    if (site) {
      await page.evaluate(([q, r]) => {
        const st = window.__cre.state, p = HexMath.hexToPixel(q, r, 24);
        st.cam.x = p.x; st.cam.y = p.y; if (st.camTarget) { st.camTarget.x = p.x; st.camTarget.y = p.y; }
      }, [site.q, site.r]);
      await page.waitForTimeout(300);
      await pickTool("town");
      const sp = await hexScreen(site.q, site.r);
      await page.mouse.move(sp.x, sp.y + 1);
      await page.mouse.move(sp.x, sp.y);
      ok("city hover hint appends the 1,000🪙 cost", /found a city · 1,000🪙$/.test(await hint()), await hint());
      await page.mouse.click(sp.x, sp.y);
      await page.waitForTimeout(1500);
      const fill = await page.evaluate(() => {
        const el = document.querySelector(".cc-happy-fill");
        return el ? { d: getComputedStyle(el).display, w: el.getBoundingClientRect().width, sw: el.style.width } : null;
      });
      ok("city-card happiness fill is a block with real width", fill && fill.d === "block" && (fill.w > 0 || fill.sw === "0%"), JSON.stringify(fill));
    }
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) {
    fail++; console.log("  ✗ harness error: " + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\nroad_tool: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
