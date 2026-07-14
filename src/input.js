  // In-DOM confirm dialog. Mirrors the research-editor's sandbox-safe uiConfirm
  // (pass-1 commit 1fa3698): native confirm()/alert() are BLOCKED inside the
  // sandboxed Artifact iframe (no allow-modals), so a real dialog element is the
  // only reliable gate. Non-blocking — runs `onConfirm` only when the user
  // accepts. Stable ids (#uiConfirm / #uiConfirmOk / #uiConfirmCancel) let
  // headless/browser tests drive it. Esc / backdrop-click = cancel, Enter = OK.
  function uiConfirm(message, onConfirm) {
    const prev = document.getElementById("uiConfirm");
    if (prev) prev.remove();
    const overlay = document.createElement("div");
    overlay.id = "uiConfirm";
    overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;" +
      "justify-content:center;background:rgba(0,0,0,0.55);";
    const box = document.createElement("div");
    box.style.cssText = "background:#2a2118;border:1px solid #c9a24a;border-radius:8px;" +
      "padding:16px 18px;max-width:340px;box-shadow:0 8px 30px rgba(0,0,0,.5);color:#f4ecdd;" +
      "font:13px system-ui,sans-serif;";
    const msg = document.createElement("div");
    msg.textContent = message;
    msg.style.cssText = "line-height:1.5;margin-bottom:14px;";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
    const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
    const confirmNow = () => { close(); onConfirm(); };
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); }
      else if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); confirmNow(); }
    }
    const cancel = document.createElement("button");
    cancel.id = "uiConfirmCancel"; cancel.textContent = "Cancel"; cancel.onclick = close;
    cancel.style.cssText = "background:#443b2e;color:#f4ecdd;border:0;border-radius:5px;padding:6px 12px;cursor:pointer;font:inherit;";
    const ok = document.createElement("button");
    ok.id = "uiConfirmOk"; ok.textContent = "Demolish"; ok.onclick = confirmNow;
    ok.style.cssText = "background:#a33;color:#fff;border:0;border-radius:5px;padding:6px 12px;cursor:pointer;font:inherit;";
    row.appendChild(cancel); row.appendChild(ok);
    box.appendChild(msg); box.appendChild(row); overlay.appendChild(box);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
    ok.focus();
  }

  // ---------------------------------------------------------------
  // Build actions
  // ---------------------------------------------------------------
  function canPlace(q, r) {
    const k = HexMath.key(q, r);
    const hex = state.map.hexes.get(k);
    if (!hex || !isVisible(k)) return false;
    // Nothing (road/town/building) may overwrite the Research Center's hex.
    if (state.researchCenter && state.researchCenter.q === q && state.researchCenter.r === r) return false;
    if (state.mode === "road") {
      if (!CONFIG.terrain[hex.terrain].road) return false;
      if (state.roads.has(k)) return false;
      // EC-A: roads are paid from the Kingdom treasury.
      if ((state.treasury || 0) < Buildings.roadCost()) return false;
      return true;
    }
    if (state.mode === "town") {
      // PV2-B: gap-enforced town-center placement (not adjacent to any city
      // footprint or the castle). Owned by the pure Buildings.canPlaceTown.
      return Buildings.canPlaceTown(state, q, r).ok;
    }
    if (state.mode === "erase") {
      return state.roads.has(k) || state.towns.some(t => t.q === q && t.r === r);
    }
    // === J === destroy-road / destroy-building modes (bottom Build bar's 🏗
    // flyout). Separate from "erase" above (which mixes roads + town-center
    // demolish) so each has a single, predictable click behaviour.
    if (state.mode === "eraseRoad") {
      return state.roads.has(k);
    }
    if (state.mode === "eraseBuilding") {
      // A regular placed building (house/producer) — never a town center,
      // which has no entry in any town.buildings[] and is handled by "erase".
      return !!(typeof buildingAtHex === "function" && buildingAtHex(q, r));
    }
    return false;
  }

  function place(q, r, isPaint) {
    const k = HexMath.key(q, r);
    if (state.mode === "road") {
      if (canPlace(q, r)) {
        state.roads.add(k);
        state.treasury = (state.treasury || 0) - Buildings.roadCost();   // EC-A: treasury pays for roads
        Pathing.invalidate(); scheduleSave(); SFX.playThrottled("place", 90);
        if (typeof updateTreasuryHud === "function") updateTreasuryHud();
      }
    } else if (state.mode === "town") {
      if (canPlace(q, r)) {
        Buildings.chargeFounding(state);   // EC-A: treasury pays 1000 to found the city
        state.towns.push(makeTown(q, r));   // TOWN-UI: full Town entity (was { q, r })
        reveal(q, r, CONFIG.fog.townReveal);
        scheduleSave();
        SFX.play("place");
        if (typeof updateTreasuryHud === "function") updateTreasuryHud();
      }
    } else if (state.mode === "erase") {
      let changed = false;
      if (state.roads.delete(k)) { Pathing.invalidate(); changed = true; }
      // P0: a town center is removed ONLY by a deliberate single click — never
      // swept by drag-paint erase (isPaint) — and a DEVELOPED city (buildings,
      // population, or gold) first requires an explicit confirm, so a mis-aimed
      // click near a road terminus can't silently wipe a whole city. Roads above
      // still erase on both click and drag (intended paint-erase). Removing a
      // town invalidates the route cache — a town center is a Pathing endpoint.
      if (!isPaint) {
        const ti = state.towns.findIndex(t => t.q === q && t.r === r);
        if (ti >= 0) {
          const t = state.towns[ti];
          const developed = (Array.isArray(t.buildings) && t.buildings.length > 0)
            || ((typeof Town !== "undefined" && Town.popTotal) ? Town.popTotal(t) > 0 : false)
            || (t.gold || 0) > 0;
          const removeTown = () => {
            const idx = state.towns.indexOf(t);   // re-find: indices may have shifted since the click
            if (idx >= 0) { state.towns.splice(idx, 1); Pathing.invalidate(); scheduleSave(); }
          };
          if (developed) {
            uiConfirm("Demolish this city? Its buildings, population, and gold will be lost. This cannot be undone.", removeTown);
          } else {
            state.towns.splice(ti, 1); Pathing.invalidate(); changed = true;
          }
        }
      }
      if (changed) scheduleSave();
    } else if (state.mode === "eraseRoad") {
      // === J === Destroy road — NO confirmation (mirrors the road-erase half
      // of "erase" above); works on click and drag-paint alike.
      if (state.roads.delete(k)) {
        Pathing.invalidate(); scheduleSave(); SFX.playThrottled("place", 90);
      }
    } else if (state.mode === "eraseBuilding") {
      // === J === Destroy building — ALWAYS confirms via the in-DOM uiConfirm
      // modal (never native confirm()), single-click only (drag-paint would
      // stack confirm dialogs, so it's ignored here like the town-erase case
      // above). Removing the building just splices it out of town.buildings —
      // that alone frees its build slot (Buildings.usedSlots is buildings.length)
      // — no refund, matching the existing erase behaviour.
      if (isPaint) return;
      const hit = (typeof buildingAtHex === "function") ? buildingAtHex(q, r) : null;
      if (!hit) return;
      const { town, b } = hit;
      const def = CONFIG.buildings[b.typeId];
      const name = (def && def.name) || b.typeId;
      uiConfirm("Destroy this " + name + "? This cannot be undone (no refund).", () => {
        const list = Array.isArray(town.buildings) ? town.buildings : [];
        const idx = list.indexOf(b);
        if (idx < 0) return;   // already gone (e.g. town itself was erased meanwhile)
        list.splice(idx, 1);
        // Close/refresh any panel currently showing the destroyed building.
        if (typeof window !== "undefined" && window.BuildingUI && window.BuildingUI.openBuilding === b) {
          window.BuildingUI.closeBuildingPanel();
        }
        scheduleSave();
        SFX.play("place");
      });
    }
  }

  // === N === A→B road tool. In road mode, the FIRST click sets an anchor (A) and
  // lays a road there; the SECOND click (B) auto-fills a road along the hex line
  // A→B on every road-eligible hex (paid per hex from the treasury). After B the
  // road tool DESELECTS (back to pan) unless Shift is held, in which case B
  // becomes the new A so you can keep chaining segments. Esc / mode-change cancels.
  let roadAnchor = null;
  function roadEligible(q, r) {
    const k = HexMath.key(q, r);
    const hex = state.map.hexes.get(k);
    if (!hex || !isVisible(k)) return false;
    if (state.researchCenter && state.researchCenter.q === q && state.researchCenter.r === r) return false;
    return !!CONFIG.terrain[hex.terrain].road;
  }
  function layRoad(q, r) {
    const k = HexMath.key(q, r);
    if (state.roads.has(k) || !roadEligible(q, r)) return false;
    if ((state.treasury || 0) < Buildings.roadCost()) return false;
    state.roads.add(k);
    state.treasury = (state.treasury || 0) - Buildings.roadCost();
    return true;
  }
  function placeRoadPath(a, b) {
    const N = HexMath.dist(a.q, a.r, b.q, b.r);
    let laid = 0;
    for (let i = 0; i <= N; i++) {
      const t = N === 0 ? 0 : i / N;
      const h = HexMath.hexRound(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t);
      if ((state.treasury || 0) < Buildings.roadCost()) break;   // out of gold — stop
      if (layRoad(h.q, h.r)) laid++;   // ineligible/water hexes are skipped, not blocking
    }
    if (laid) { Pathing.invalidate(); if (typeof updateTreasuryHud === "function") updateTreasuryHud(); SFX.playThrottled("place", 90); }
    return laid;
  }
  function handleRoadClick(q, r, shift) {
    if (!roadAnchor) {
      if (!roadEligible(q, r)) return;   // A must be a road-eligible hex
      layRoad(q, r);                     // lay the anchor hex itself
      roadAnchor = { q, r };
      Pathing.invalidate();
      if (typeof updateTreasuryHud === "function") updateTreasuryHud();
      SFX.playThrottled("place", 90);
    } else {
      placeRoadPath(roadAnchor, { q, r });
      if (shift) roadAnchor = { q, r };          // chain: B is the next A
      else { roadAnchor = null; if (typeof setMode === "function") setMode("pan"); }  // deselect after B
    }
    scheduleSave();
  }
  function cancelRoadAnchor() { roadAnchor = null; }

  // ---------------------------------------------------------------
  // Input: pan (drag / WASD), zoom (wheel), build (click / paint)
  // ---------------------------------------------------------------
  const keys = new Set();
  let dragging = false, dragPanned = false, panButton = false;
  let last = { x: 0, y: 0 };
  let lastPaintKey = null;

  function isPanGesture(e) {
    // right / middle button, or left button in pan mode
    return e.button === 1 || e.button === 2 || (e.button === 0 && state.mode === "pan");
  }

  canvas.addEventListener("mousedown", (e) => {
    canvas.focus();
    dragging = true; dragPanned = false;
    panButton = isPanGesture(e);
    last = { x: e.clientX, y: e.clientY };
    if (!panButton && e.button === 0) {
      const h = hexAtScreen(e.clientX, e.clientY);
      lastPaintKey = HexMath.key(h.q, h.r);
      if (state.mode === "road") handleRoadClick(h.q, h.r, e.shiftKey);   // N: A→B road tool
      else place(h.q, h.r);
    }
    if (panButton) canvas.classList.add("panning");
  });

  window.addEventListener("mousemove", (e) => {
    const h = hexAtScreen(e.clientX, e.clientY);
    hoverHex = h;
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragPanned = true;
    last = { x: e.clientX, y: e.clientY };
    if (panButton) {
      state.cam.x -= dx / state.zoom;
      state.cam.y -= dy / state.zoom;
    } else if (state.mode === "erase" || state.mode === "eraseRoad") {
      // N: road mode no longer drag-paints — it's the click A→B tool. erase/
      // === J === eraseRoad drag-paints like "erase" (roads are safe to
      // sweep-delete — no confirmation either way); eraseBuilding is click-only
      // (see place()'s isPaint guard) so a drag can't stack confirm dialogs.
      const k = HexMath.key(h.q, h.r);
      if (k !== lastPaintKey) { lastPaintKey = k; place(h.q, h.r, true); }  // P0: isPaint — drag never deletes a town center
    }
  });

  window.addEventListener("mouseup", () => {
    dragging = false; panButton = false; lastPaintKey = null;
    canvas.classList.remove("panning");
    scheduleSave();
  });

  canvas.addEventListener("contextmenu", e => e.preventDefault());

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? CONFIG.camera.wheelStep : 1 / CONFIG.camera.wheelStep;
    state.zoom = Math.min(CONFIG.camera.maxZoom, Math.max(CONFIG.camera.minZoom, state.zoom * factor));
    const after = screenToWorld(e.clientX, e.clientY);
    // keep the point under the cursor fixed while zooming
    state.cam.x += before.x - after.x;
    state.cam.y += before.y - after.y;
    scheduleSave();
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    // Editor overlay open: don't let WASD/space/speed hotkeys leak into the
    // game underneath. frame.onload->focus() (EDITOR-OVERLAY, ~11057) covers
    // the open-time race, but focus can bounce back to the parent document
    // (e.g. a trusted click on #eoBar chrome) while the overlay stays open —
    // this guard is focus-independent so it holds regardless.
    if ((window.EditorOverlay && window.EditorOverlay.isOpen()) || (window.MissionEditorOverlay && window.MissionEditorOverlay.isOpen()) || (window.BalanceLab && window.BalanceLab.isOpen())) return;
    const k = e.key.toLowerCase();
    if (k === "escape") cancelRoadAnchor();   // N: cancel a pending A→B road anchor
    if (["w", "a", "s", "d"].includes(k)) keys.add(k);
    if (e.target && e.target.id === "seed") return;
    // === SPEED-UI === Space toggles pause <-> last non-zero speed; 1/2/4 set
    // speed (P5D-A). These number keys previously selected build tools
    // (1=pan 2=road 3=town 4=erase); tools remain available via the toolbar
    // buttons. NOTE for merge reconciliation: this reassigned the 1-4 hotkeys.
    if (k === " " || e.code === "Space") {
      e.preventDefault();   // stop the page from scrolling on Space
      setSpeed(state.gameSpeed > 0 ? 0 : lastSpeed);
      return;
    }
    if (k === "1") setSpeed(1);
    else if (k === "2") setSpeed(2);
    else if (k === "4") setSpeed(4);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  function applyKeyPan(dt) {
    // RT-B: don't drift the map while the full-screen tech tree is open
    // (WASD keydowns still land in `keys` since the overlay doesn't eat them).
    const tt = document.getElementById("techTree");
    if (tt && !tt.classList.contains("hidden")) return;
    const v = CONFIG.camera.panSpeed / state.zoom * (dt / 1000);
    if (keys.has("w")) state.cam.y -= v;
    if (keys.has("s")) state.cam.y += v;
    if (keys.has("a")) state.cam.x -= v;
    if (keys.has("d")) state.cam.x += v;
  }

  // ---------------------------------------------------------------
  // Toolbar / UI wiring
  // ---------------------------------------------------------------
  const toolButtons = Array.from(document.querySelectorAll("button.tool"));
  function setMode(mode) {
    state.mode = mode;
    if (mode !== "road") roadAnchor = null;   // N: leaving road mode drops a pending A→B anchor
    toolButtons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    canvas.classList.toggle("building", mode !== "pan");
  }
  toolButtons.forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // === SPEED-UI === speed & pause controls (P5D-A).
  // Buttons set state.gameSpeed to 0/1/2/4; the economy accumulator already
  // halts at 0, so gameSpeed 0 = paused. `lastSpeed` remembers the last
  // non-zero speed so Space can toggle back to it after a pause.
  const speedButtons = Array.from(document.querySelectorAll("button.speed"));
  let lastSpeed = 1;
  function setSpeed(sp) {
    sp = Number(sp) || 0;
    if (![0, 1, 2, 4].includes(sp)) sp = 1;
    state.gameSpeed = sp;
    if (sp > 0) lastSpeed = sp;
    speedButtons.forEach(b => b.classList.toggle("active", Number(b.dataset.speed) === sp));
    scheduleSave();
  }
  speedButtons.forEach(b => b.addEventListener("click", () => setSpeed(b.dataset.speed)));

  document.getElementById("btnGen").addEventListener("click", () => {
    newGame(document.getElementById("seed").value.trim() || randomSeed(), state.mapPreset);  // === TV2: keep preset ===
    if (typeof Tutorial !== "undefined") Tutorial.startFresh();  // P5D-C: fresh game → coach
  });
  document.getElementById("btnRandom").addEventListener("click", () => {
    const s = randomSeed();
    document.getElementById("seed").value = s;
    newGame(s, state.mapPreset);  // === TV2: keep preset ===
    if (typeof Tutorial !== "undefined") Tutorial.startFresh();  // P5D-C: fresh game → coach
  });
  document.getElementById("btnReveal").addEventListener("click", () => {
    state.revealAll = !state.revealAll;
    terrainDirty = true;
  });
  document.getElementById("btnCenter").addEventListener("click", () => {
    state.cam.x = 0; state.cam.y = 0;
  });
