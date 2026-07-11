"use strict";
// Headless BROWSER regression harness for the standalone research-tree editor
// (tools/research-editor.html). UNLIKE test/*.test.js — which vm-eval
// index.html's PURE_CORE in plain Node, no browser involved — this file drives
// the editor's actual DOM/canvas UI inside headless Chromium via
// playwright-core, because the editor has no non-browser "pure core": its
// state machine (click-to-connect, delete-cascade, effect editor, sidebar
// forms) lives entirely in DOM event handlers and canvas hit-testing. Treat
// this the way tools/playthrough.js treats the economy sim: a diagnostic /
// regression harness that is NOT part of the plain-node `test/*.test.js`
// suite (nothing wires it into a "run everything" script), not a unit test
// with mocks. It is the FIRST automated regression net for the editor.
//
// Run:
//   PW_CORE=/path/to/playwright-core node test/editor.test.js
// playwright-core is not vendored in this repo (no npm deps checked in) — set
// PW_CORE to wherever it's installed. Falls back to the path used to author
// this harness if the env var is unset.
//
// Every UI action that a real user would perform with a mouse (clicking
// cards, connection circles, and sidebar buttons) uses genuine Playwright
// mouse/click input (page.mouse.click / locator.click) — never
// `element.evaluate(el => el.click())`, which dispatches a synthetic event
// that bypasses the app's real mousedown/mouseup handlers (the editor's own
// code comments call out a past bug that this exact distinction would have
// caught). `<select>` dropdowns are driven with locator.selectOption(),
// Playwright's standard trusted-event equivalent for native selects.
//
// Some assertions below (particularly delete-cascade for a laddered
// anchor/starter card, coverage item 2) may currently FAIL against
// tools/research-editor.html until the delete-cascade bug this harness exists
// to catch is fixed. That is expected and is the point: this is the
// regression net, written to the CORRECT behavior, not to whatever the code
// currently does. The pass/fail tally below is the source of truth for what
// is fixed vs. still broken.

const PW = process.env.PW_CORE ||
  "/tmp/claude-0/-home-user-trade-winds/ca920791-6b12-5d41-8459-6b2bac7e3bdb/scratchpad/node_modules/playwright-core";
const CHROME_PATH = process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const { chromium } = require(PW);
const path = require("path");

const FILE_URL = "file://" + path.join(__dirname, "..", "tools", "research-editor.html");

// ---------------------------------------------------------------------------
// tiny pass/fail tally, mirrors the style of test/*.test.js's ok()
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else {
    fail++;
    failures.push(name + (detail !== undefined ? "  (" + detail + ")" : ""));
    console.log("  ✗ " + name + (detail !== undefined ? "  -- " + detail : ""));
  }
}
// A group that isn't a boolean — wraps a block in try/catch so one exploding
// scenario doesn't take down the whole suite; on throw, records a single
// failed assertion carrying the error.
async function group(name, fn) {
  console.log("\n-- " + name + " --");
  try {
    await fn();
  } catch (e) {
    fail++;
    failures.push(name + " (threw)");
    console.log("  ✗ " + name + " threw: " + (e && e.stack || e));
  }
}

// ---------------------------------------------------------------------------
// browser / page plumbing
// ---------------------------------------------------------------------------
let browser;

// Fresh isolated context + page per scenario: clean localStorage (the editor
// autosaves to it and reloads from it — loadLocal() — so a shared context
// across scenarios would leak state between them), fresh confirm()/alert()
// auto-accept, and pageerror capture so an uncaught JS exception anywhere in
// the scenario fails it loudly instead of silently.
async function withPage(fn) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.stack || e)));
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof doc !== "undefined" && Array.isArray(doc.research));
  await fn(page);
  if (pageErrors.length) throw new Error("page error(s): " + pageErrors.join(" | "));
  await context.close();
}

// Re-point the camera (zoom=1) so world point (wx,wy) lands exactly on the
// canvas's own center, then returns that center in PAGE (viewport) coordinates
// — i.e. exactly what page.mouse.click() needs. This sidesteps the fact that
// after the editor's focusPeasant() the tree may be panned/zoomed such that a
// given card's screen position falls outside (or awkwardly near the edge of)
// the visible canvas.
async function screenPointForWorld(page, wx, wy) {
  return page.evaluate(({ wx, wy }) => {
    camera.zoom = 1;
    const r = document.getElementById("board").getBoundingClientRect();
    camera.x = r.width / 2 - wx;
    camera.y = r.height / 2 - wy;
    draw();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { wx, wy });
}

// World-space center of a card's rect.
async function cardCenterWorld(page, id) {
  return page.evaluate((id) => {
    const n = findNode(id);
    const r = cardRectFor(n);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }, id);
}

// World-space point of one of a card's 8 connection-handle circles.
async function handleWorld(page, id, side) {
  return page.evaluate(({ id, side }) => {
    const n = findNode(id);
    return sidePoint(cardRectFor(n), side);
  }, { id, side });
}

// Real mouse click (move+down+up) at a WORLD coordinate on the board canvas.
async function clickWorld(page, wx, wy) {
  const p = await screenPointForWorld(page, wx, wy);
  await page.mouse.click(p.x, p.y);
}
async function clickCard(page, id) {
  const c = await cardCenterWorld(page, id);
  await clickWorld(page, c.x, c.y);
}
async function clickHandle(page, id, side) {
  const h = await handleWorld(page, id, side);
  await clickWorld(page, h.x, h.y);
}

const edgeKey = (parentId, childId) => parentId + "→" + childId; // matches editor's edgeSideKey()

// ===========================================================================
// 1. add card / add kingdom card
// ===========================================================================
async function testAddCards() {
  await withPage(async (page) => {
    const before = await page.evaluate(() => doc.research.length);
    await page.locator("#btnAdd").click();
    const afterUnlock = await page.evaluate(() => doc.research[doc.research.length - 1]);
    ok("add card: research array grew by 1", afterUnlock && (await page.evaluate(() => doc.research.length)) === before + 1);
    ok("add card: new node is kind=unlock", afterUnlock.kind === "unlock", afterUnlock.kind);
    ok("add card: new node lands in the peasant band", afterUnlock.band === "peasant", afterUnlock.band);
    ok("add card: new node is a primary card (selectable, appears in primaryCards())",
      await page.evaluate((id) => primaryCards().some((n) => n.id === id), afterUnlock.id));

    await page.locator("#btnAddKingdom").click();
    const afterKingdom = await page.evaluate(() => doc.research[doc.research.length - 1]);
    ok("add kingdom card: new node is kind=kingdom", afterKingdom.kind === "kingdom", afterKingdom.kind);
    ok("add kingdom card: new node lands in the kingdom band", afterKingdom.band === "kingdom", afterKingdom.band);
    ok("add kingdom card: prereqs start empty (kingdom is prereq-free)",
      Array.isArray(afterKingdom.prereqs) && afterKingdom.prereqs.length === 0);
  });
}

// ===========================================================================
// 2. delete via a REAL mouse click on the sidebar "Delete this card" Actions
//    button — for an unlock card, a kingdom card, and an anchor card that has
//    an upgrade ladder (the reported bug area: ladder pips must cascade too).
// ===========================================================================
async function deleteSelectedCardViaUI(page) {
  // Selecting the card (a real canvas click) re-renders #tab-inspector with a
  // fresh "Delete this card" button; click THAT button for real, exactly like
  // a user would, then let the auto-accepted confirm() dialog through.
  const btn = page.locator('#tab-inspector button.danger:has-text("Delete this card")');
  await btn.waitFor({ state: "visible" });
  await btn.click();
}

async function testDeleteUnlockCard() {
  await withPage(async (page) => {
    const id = "unlock_quarry";
    ok("precondition: unlock_quarry exists", await page.evaluate((id) => !!findNode(id), id));
    await clickCard(page, id);
    ok("card got selected by the canvas click", await page.evaluate((id) => selectedId === id, id));
    await deleteSelectedCardViaUI(page);
    ok("delete unlock card: removed from doc.research", await page.evaluate((id) => !findNode(id), id));
    ok("delete unlock card: materials entry removed", await page.evaluate((id) => !(id in doc.materials), id));
    ok("delete unlock card: purged from every other card's prereqs",
      await page.evaluate((id) => doc.research.every((n) => !(n.prereqs || []).includes(id)), id));
  });
}

async function testDeleteKingdomCard() {
  await withPage(async (page) => {
    const id = "crop_rotation";
    ok("precondition: crop_rotation exists and is kind=kingdom",
      await page.evaluate((id) => { const n = findNode(id); return !!n && n.kind === "kingdom"; }, id));
    await clickCard(page, id);
    ok("kingdom card got selected", await page.evaluate((id) => selectedId === id, id));
    await deleteSelectedCardViaUI(page);
    ok("delete kingdom card: removed from doc.research", await page.evaluate((id) => !findNode(id), id));
    ok("delete kingdom card: materials entry removed", await page.evaluate((id) => !(id in doc.materials), id));
  });
}

async function testDeleteAnchorWithLadder() {
  await withPage(async (page) => {
    const id = "anchor_hut";
    const buildingId = "hut";
    const pre = await page.evaluate(({ id, buildingId }) => {
      const n = findNode(id);
      const ladder = (doc.upgrades[buildingId] || []).map((e) => e.unlockedBy);
      return { hasNode: !!n, kind: n && n.kind, ladder };
    }, { id, buildingId });
    ok("precondition: anchor_hut exists with kind=anchor", pre.hasNode && pre.kind === "anchor", pre.kind);
    ok("precondition: hut has an upgrade ladder with >=2 pips (shipped default: l2,l3,l4)",
      pre.ladder.length >= 2, JSON.stringify(pre.ladder));

    await clickCard(page, id);
    ok("anchor card got selected", await page.evaluate((id) => selectedId === id, id));
    await deleteSelectedCardViaUI(page);

    const post = await page.evaluate(({ id, buildingId, ladderIds }) => {
      return {
        cardGone: !findNode(id),
        matGone: !(id in doc.materials),
        ladderGone: !(buildingId in doc.upgrades),
        pipsGone: ladderIds.every((pid) => !findNode(pid)),
        pipMatsGone: ladderIds.every((pid) => !(pid in doc.materials)),
      };
    }, { id, buildingId, ladderIds: pre.ladder });

    ok("delete anchor card: the primary card itself is removed", post.cardGone);
    ok("delete anchor card: materials entry for the card removed", post.matGone);
    ok("delete anchor card (STRICT, bug area): doc.upgrades[buildingId] ladder is gone entirely", post.ladderGone);
    ok("delete anchor card (STRICT, bug area): every ladder pip card is cascade-removed from doc.research",
      post.pipsGone, JSON.stringify(pre.ladder));
    ok("delete anchor card (STRICT, bug area): every ladder pip's materials entry is cascade-removed",
      post.pipMatsGone);
  });
}

// ===========================================================================
// 3. click-to-connect
// ===========================================================================
async function testClickToConnect() {
  await withPage(async (page) => {
    // Two fresh, prereq-free unlock cards so this scenario doesn't depend on
    // (or disturb assertions about) the shipped default tree's existing edges.
    await page.locator("#btnAdd").click();
    const aId = await page.evaluate(() => doc.research[doc.research.length - 1].id);
    await page.locator("#btnAdd").click();
    const bId = await page.evaluate(() => doc.research[doc.research.length - 1].id);

    // --- real connect: arm a source circle, click a destination circle on
    //     the OTHER card -> prereq added + edgeSides anchored to the two
    //     exact sides clicked.
    await clickHandle(page, aId, "right");
    const armedAfterArm = await page.evaluate(() => armed && armed.nodeId);
    ok("connect: clicking a circle arms it as the source", armedAfterArm === aId, armedAfterArm);

    await clickHandle(page, bId, "left");
    const state1 = await page.evaluate(({ aId, bId }) => {
      const b = findNode(bId);
      return { prereqs: b.prereqs.slice(), edge: doc.edgeSides[aId + "→" + bId], armed };
    }, { aId, bId });
    ok("connect: destination card gained the source as a prerequisite",
      state1.prereqs.includes(aId), JSON.stringify(state1.prereqs));
    ok("connect: doc.edgeSides anchored to the exact two clicked sides",
      state1.edge && state1.edge.parentSide === "right" && state1.edge.childSide === "left",
      JSON.stringify(state1.edge));
    ok("connect: arming state cleared after a successful connect", state1.armed === null);

    // --- self-drop: arm A, click A's own (different) circle again -> no
    //     self-prerequisite, connection stays armed (just re-points the
    //     source), and B's prereqs (from the real connect above) are untouched.
    await clickHandle(page, aId, "top");
    await clickHandle(page, aId, "bottom");
    const state2 = await page.evaluate(({ aId, bId }) => {
      const a = findNode(aId), b = findNode(bId);
      return {
        aSelfPrereq: (a.prereqs || []).includes(aId),
        bPrereqsUnchanged: b.prereqs.slice(),
        armed,
      };
    }, { aId, bId });
    ok("self-drop: does not add a self-prerequisite", !state2.aSelfPrereq);
    ok("self-drop: does not disturb the earlier real connection", state2.bPrereqsUnchanged.includes(aId));
    ok("self-drop: re-points the armed source rather than clearing it",
      state2.armed && state2.armed.nodeId === aId && state2.armed.side === "bottom",
      JSON.stringify(state2.armed));

    // --- kingdom-as-target rejected: still armed on A from above; click a
    //     kingdom card's circle -> rejected, armed cleared, kingdom card's
    //     prereqs remain empty.
    await clickHandle(page, "crop_rotation", "left");
    const state3 = await page.evaluate(() => ({
      kingdomPrereqs: findNode("crop_rotation").prereqs.slice(),
      armed,
    }));
    ok("kingdom-as-target: rejected — kingdom card gained no prerequisite",
      state3.kingdomPrereqs.length === 0, JSON.stringify(state3.kingdomPrereqs));
    ok("kingdom-as-target: armed state cleared after rejection", state3.armed === null);

    // --- Esc cancels the armed state.
    await clickHandle(page, aId, "top");
    ok("Esc test precondition: source armed", await page.evaluate((aId) => armed && armed.nodeId === aId, aId));
    await page.keyboard.press("Escape");
    ok("Esc cancels the armed state", await page.evaluate(() => armed === null));

    // --- outside-click (a non-handle click, e.g. far empty board space)
    //     cancels the armed state.
    await clickHandle(page, aId, "top");
    ok("outside-click test precondition: source armed", await page.evaluate((aId) => armed && armed.nodeId === aId, aId));
    await clickWorld(page, 100000, 100000); // far from any card/handle
    ok("outside-click cancels the armed state", await page.evaluate(() => armed === null));
  });
}

// ===========================================================================
// 3b. keyboard-Delete on a selected card — a SEPARATE code path from the
//     sidebar "Delete this card" button (the window keydown handler, not the
//     button's onclick). Covers a plain card and the laddered-anchor cascade
//     via this alternate trigger. (Added to complement group 2's button path;
//     QA's adversarial suite owns the move-vs-arm / band-kind-select checks.)
// ===========================================================================
async function testKeyboardDelete() {
  await withPage(async (page) => {
    // plain unlock card
    await clickCard(page, "unlock_fishery");
    ok("kbd-delete precondition: unlock_fishery selected", await page.evaluate(() => selectedId === "unlock_fishery"));
    await page.keyboard.press("Delete");
    ok("kbd-delete: Delete key removes the selected unlock card",
      await page.evaluate(() => !findNode("unlock_fishery")));
    ok("kbd-delete: its materials entry removed", await page.evaluate(() => !("unlock_fishery" in doc.materials)));

    // laddered anchor via the keyboard path — cascade must still fire.
    const buildingId = "lumberjack";
    const ladderIds = await page.evaluate((b) => (doc.upgrades[b] || []).map((e) => e.unlockedBy), buildingId);
    ok("kbd-delete precondition: anchor_lumberjack has an upgrade ladder", ladderIds.length >= 2, JSON.stringify(ladderIds));
    await clickCard(page, "anchor_lumberjack");
    ok("kbd-delete precondition: anchor_lumberjack selected", await page.evaluate(() => selectedId === "anchor_lumberjack"));
    await page.keyboard.press("Delete");
    const post = await page.evaluate(({ b, ids }) => ({
      cardGone: !findNode("anchor_lumberjack"),
      ladderGone: !(b in doc.upgrades),
      pipsGone: ids.every((pid) => !findNode(pid)),
    }), { b: buildingId, ids: ladderIds });
    ok("kbd-delete: laddered anchor card removed via Delete key", post.cardGone);
    ok("kbd-delete: its upgrade ladder cascade-removed via Delete key", post.ladderGone);
    ok("kbd-delete: its ladder pip cards cascade-removed via Delete key", post.pipsGone, JSON.stringify(ladderIds));
  });
}

// ===========================================================================
// 3c. edge deletion — after selecting a prereq edge, both triggers remove it:
//     the Delete key AND the inspector's "Delete edge" button. Both must strip
//     the prereq from the child and drop the doc.edgeSides hint. (Complements
//     the click-to-connect group's edge CREATION coverage.)
// ===========================================================================
async function makeEdge(page) {
  // Two fresh unlock cards + a real click-to-connect between them; returns ids.
  await page.locator("#btnAdd").click();
  const aId = await page.evaluate(() => doc.research[doc.research.length - 1].id);
  await page.locator("#btnAdd").click();
  const bId = await page.evaluate(() => doc.research[doc.research.length - 1].id);
  await clickHandle(page, aId, "right");
  await clickHandle(page, bId, "left");
  return { aId, bId };
}
// Click the midpoint of the edge between a and b so edgeAtWorld() selects it.
async function clickEdgeMidpoint(page, aId, bId) {
  const mid = await page.evaluate(({ aId, bId }) => {
    const p = findNode(aId), c = findNode(bId);
    const s = resolvedSides(p, c);
    const a = sideCenterFor(p, s.parentSide), b = sideCenterFor(c, s.childSide);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }, { aId, bId });
  await clickWorld(page, mid.x, mid.y);
}
async function testEdgeDeletion() {
  // (i) via the Delete key
  await withPage(async (page) => {
    const { aId, bId } = await makeEdge(page);
    ok("edge-delete precondition: prereq + edgeSides exist",
      await page.evaluate(({ aId, bId }) => findNode(bId).prereqs.includes(aId) && !!doc.edgeSides[aId + "→" + bId], { aId, bId }));
    await clickEdgeMidpoint(page, aId, bId);
    ok("edge-delete: clicking the edge line selects it",
      await page.evaluate(({ aId, bId }) => selectedEdge && selectedEdge.parentId === aId && selectedEdge.childId === bId, { aId, bId }));
    await page.keyboard.press("Delete");
    const post = await page.evaluate(({ aId, bId }) => ({
      prereqGone: !findNode(bId).prereqs.includes(aId),
      hintGone: !doc.edgeSides[aId + "→" + bId],
      sel: selectedEdge,
    }), { aId, bId });
    ok("edge-delete (Delete key): prereq stripped from the child", post.prereqGone);
    ok("edge-delete (Delete key): doc.edgeSides hint dropped", post.hintGone);
    ok("edge-delete (Delete key): edge selection cleared", post.sel === null);
  });
  // (ii) via the inspector's "Delete edge" button
  await withPage(async (page) => {
    const { aId, bId } = await makeEdge(page);
    await clickEdgeMidpoint(page, aId, bId);
    const btn = page.locator('#tab-inspector button.danger:has-text("Delete edge")');
    await btn.waitFor({ state: "visible" });
    await btn.click();
    const post = await page.evaluate(({ aId, bId }) => ({
      prereqGone: !findNode(bId).prereqs.includes(aId),
      hintGone: !doc.edgeSides[aId + "→" + bId],
    }), { aId, bId });
    ok('edge-delete ("Delete edge" button): prereq stripped from the child', post.prereqGone);
    ok('edge-delete ("Delete edge" button): doc.edgeSides hint dropped', post.hintGone);
  });
}

// ===========================================================================
// 4. effect editor
// ===========================================================================
async function testEffectEditor() {
  await withPage(async (page) => {
    const effLegend = 'fieldset:has(legend:has-text("effect (what this node does)"))';

    // unlock card hides the effect editor entirely.
    await clickCard(page, "unlock_quarry");
    ok("unlock card: effect editor fieldset is absent", (await page.locator("#tab-inspector " + effLegend).count()) === 0);

    // kingdom card shows it. Use a FRESH kingdom card (effect:{}) so "+ add
    // appends the next key" starts from a known, empty, non-default state.
    await page.locator("#btnAddKingdom").click();
    const kId = await page.evaluate(() => doc.research[doc.research.length - 1].id);
    ok("kingdom card: effect editor fieldset is present", (await page.locator("#tab-inspector " + effLegend).count()) === 1);
    ok("precondition: fresh kingdom card has no effect keys yet",
      await page.evaluate((id) => Object.keys(findNode(id).effect || {}).length === 0, kId));

    const fs = page.locator("#tab-inspector " + effLegend);
    const addBtn = fs.locator('button:has-text("+ add effect")');

    // + add appends the next key (NODE_EFFECT_KEY_LIST order: globalOutput,
    // then extractorOutput), each at its documented default value.
    await addBtn.click();
    let eff = await page.evaluate((id) => findNode(id).effect, kId);
    ok('"+ add effect" (1st click) appends globalOutput at its default 1.25',
      eff.globalOutput === 1.25, JSON.stringify(eff));

    await addBtn.click();
    eff = await page.evaluate((id) => findNode(id).effect, kId);
    ok('"+ add effect" (2nd click) appends extractorOutput at its default 1.2',
      eff.extractorOutput === 1.2, JSON.stringify(eff));
    ok('"+ add effect" appended (not replaced) — 2 keys now present', Object.keys(eff).length === 2, JSON.stringify(eff));

    // - remove (with confirm, auto-accepted) deletes exactly that row.
    const firstRow = fs.locator(".matRow").first();
    const removeBtn = firstRow.locator('button[title="Remove this effect"]');
    await removeBtn.click();
    eff = await page.evaluate((id) => findNode(id).effect, kId);
    ok('"− remove" deletes the row\'s key (globalOutput gone)', !("globalOutput" in eff), JSON.stringify(eff));
    ok('"− remove" leaves the other row intact (extractorOutput remains)', eff.extractorOutput === 1.2, JSON.stringify(eff));

    // A bool key (paved_roads / tariff_slider) renders a true/false control
    // instead of a numeric input. Retarget the remaining row's key select to
    // paved_roads (a real <select> interaction) and check the row now has a
    // SECOND <select> (the bool value control) instead of a number input.
    const row = fs.locator(".matRow").first();
    const keySelect = row.locator("select").first();
    await keySelect.selectOption("paved_roads");
    eff = await page.evaluate((id) => findNode(id).effect, kId);
    ok("switching a row's key to paved_roads sets a boolean true default", eff.paved_roads === true, JSON.stringify(eff));
    const selectCount = await row.locator("select").count();
    const numberInputCount = await row.locator('input[type="number"]').count();
    ok("bool key (paved_roads) renders a true/false <select> control, not a numeric input",
      selectCount === 2 && numberInputCount === 0, "selects=" + selectCount + " numberInputs=" + numberInputCount);
    const valueOptions = await row.locator("select").nth(1).locator("option").allTextContents();
    ok('bool control offers exactly "true"/"false" options', JSON.stringify(valueOptions) === JSON.stringify(["true", "false"]),
      JSON.stringify(valueOptions));
  });
}

// ===========================================================================
// 5. export -> import round trip
// ===========================================================================
async function testExportImportRoundTrip() {
  await withPage(async (page) => {
    // Build up some state worth round-tripping: a new unlock card, a new
    // kingdom card, a real click-to-connect edge (with a non-default side
    // anchor so _editorMeta.edgeSides has something to preserve), and a
    // material tweak.
    await page.locator("#btnAdd").click();
    const aId = await page.evaluate(() => doc.research[doc.research.length - 1].id);
    await page.locator("#btnAdd").click();
    const bId = await page.evaluate(() => doc.research[doc.research.length - 1].id);
    await clickHandle(page, aId, "bottom-right");
    await clickHandle(page, bId, "top-left");

    await page.evaluate((aId) => { doc.materials[aId] = { wood: 42, stone: 7 }; }, aId);

    const before = await page.evaluate(() => buildExport());
    const key = edgeKey(aId, bId);
    ok("setup: pre-export edgeSides has the expected key with the two clicked sides",
      before._editorMeta.edgeSides[key] &&
      before._editorMeta.edgeSides[key].parentSide === "bottom-right" &&
      before._editorMeta.edgeSides[key].childSide === "top-left",
      JSON.stringify(before._editorMeta.edgeSides[key]));

    const exportedJson = JSON.stringify(before);

    // Reset to default via the real UI button (also clears localStorage),
    // THEN import the captured export back in via the real Import flow:
    // click "Import JSON…" -> fill the textarea -> click "Load JSON below".
    await page.locator("#btnReloadDefault").click();
    ok("reset: the new cards are gone after Reset to Default", await page.evaluate((aId) => !findNode(aId), aId));

    await page.locator("#btnImport").click();
    await page.locator("#importArea").fill(exportedJson);
    await page.locator('#tab-io button:has-text("Load JSON below")').click();

    const after = await page.evaluate(() => ({
      research: doc.research,
      materials: doc.materials,
      upgrades: doc.upgrades,
      edgeSides: doc.edgeSides,
    }));

    const aNode = after.research.find((n) => n.id === aId);
    const bNode = after.research.find((n) => n.id === bId);
    ok("round-trip: added unlock card A survived import", !!aNode, aId);
    ok("round-trip: added unlock card B survived import", !!bNode, bId);
    ok("round-trip: B's prereqs still include A", bNode && bNode.prereqs.includes(aId), bNode && JSON.stringify(bNode.prereqs));
    ok("round-trip: materials for A preserved exactly", after.materials[aId] && after.materials[aId].wood === 42 &&
      after.materials[aId].stone === 7, JSON.stringify(after.materials[aId]));
    ok("round-trip: _editorMeta.edgeSides preserved with the exact anchored sides",
      after.edgeSides[key] && after.edgeSides[key].parentSide === "bottom-right" && after.edgeSides[key].childSide === "top-left",
      JSON.stringify(after.edgeSides[key]));

    // Spot-check the untouched shipped default content also round-tripped
    // (research/materials/upgrades, not just what we added).
    const hut = after.research.find((n) => n.id === "anchor_hut");
    ok("round-trip: shipped default anchor_hut card preserved", !!hut && hut.kind === "anchor");
    ok("round-trip: shipped default hut upgrade ladder preserved (3 levels)",
      Array.isArray(after.upgrades.hut) && after.upgrades.hut.length === 3, JSON.stringify(after.upgrades.hut));
    ok("round-trip: shipped default crop_rotation kingdom effect preserved",
      after.research.find((n) => n.id === "crop_rotation").effect.extractorOutput === 1.2);
  });
}
// ===========================================================================
// main
// ===========================================================================
async function main() {
  browser = await chromium.launch({ executablePath: CHROME_PATH, args: ["--no-sandbox"] });
  try {
    await group("1. add card / add kingdom card", testAddCards);
    await group("2a. delete unlock card via real mouse click", testDeleteUnlockCard);
    await group("2b. delete kingdom card via real mouse click", testDeleteKingdomCard);
    await group("2c. delete anchor card WITH upgrade ladder (bug area, strict)", testDeleteAnchorWithLadder);
    await group("3. click-to-connect (arm/connect/self-drop/kingdom-reject/Esc/outside-click)", testClickToConnect);
    await group("3b. keyboard-Delete on a selected card (plain + laddered-anchor cascade)", testKeyboardDelete);
    await group("3c. edge deletion (Delete key + 'Delete edge' button)", testEdgeDeletion);
    await group("4. effect editor (kingdom shows/unlock hides, add/remove, bool control)", testEffectEditor);
    await group("5. export -> import round trip", testExportImportRoundTrip);
  } finally {
    await browser.close();
  }

  console.log("\n========================================");
  console.log("EDITOR HARNESS: " + pass + " passed, " + fail + " failed (of " + (pass + fail) + ")");
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("========================================");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("HARNESS CRASHED:", e && e.stack || e);
  process.exit(1);
});
