# PASS 3 — state-of-project summary (LeadDev3)

Branch `qa/game-hardening-3` (off latest main). Commit here only; never merge to main.

## Baseline (verified 2026-07-12 by LeadDev3)
- `node tools/build.js --check` → exit 0 (3 modules spliced: editor-embed, hexmath, config).
- 15 pure-core suites GREEN: board, buildings, sim, trade, trade_bootstrap, research,
  research_effects, prices, market, balance, migration, progress, ledger, pathing, tariff.
- Editor harness GREEN: 95/95 (`PW_CORE=... node test/editor.test.js`).
- Economy CONFIRMED SOUND in passes 1-2 (money conservation, determinism bit-identical,
  zero invariant violations 30-40k ticks, castle-L5 victory).

## PASSES 1&2 already fixed — DO NOT re-report/re-chase
state.tick save/load; Pathing cache invalidation on New/Load; harness fidelity;
loadGame malformed-shape crash guard; trade near-cap force-deliver (money-conserving);
stone_tools dead-content wiring; town-demolition confirm (+ no drag-delete);
bridge hexOccupied gate; corrupt road/fog key sanitize; trade regression test.

## NEW SURFACE this pass — the in-game Research Editor
- Start-screen button `#ssEditor` (index.html ~919, inside START-SCREEN HTML) opens overlay.
- `#editorOverlay` (~927) holds `#eoBar` + `#eoFrame` iframe
  `sandbox="allow-scripts allow-same-origin"`.
- Wiring `EditorOverlay` IIFE at index.html ~11050:
  - `open()`: revoke old blobUrl, `new Blob([RESEARCH_EDITOR_HTML])`, createObjectURL, set frame.src, unhide.
  - `close()`: hide, frame.src=about:blank + removeAttribute, revokeObjectURL, null.
  - Escape via `document` keydown (~11062): closes only if `isOpen()`.
- Editor source: `tools/research-editor.html` (2554 lines), embedded via build ASSETS step at
  `/* BUILD:editor-embed */` (~5289). CHANGING editor requires `node tools/build.js` re-embed;
  `--check` guards drift.

## Integration watch-list (hand to testers — genuinely NEW ground)
- Button is START-SCREEN only. Once a game starts there's no visible reopen path (design note).
- Many global `window` keydown hotkeys exist (index.html ~6307, 7776, 9802, 10125='k', 10934='m').
  Editor Escape is on `document`. Do game hotkeys fire while the editor overlay is open /
  does focus routing (iframe vs parent eoBar) leak keys into the game? Does Escape double-fire
  (close editor AND a game panel)?
- Blob-URL lifecycle: open/close leak? repeated open cycles? open→start-game path?
- Editor localStorage autosave key vs game SAVE_KEY — any collision?
- Does opening/closing editor perturb game state / does game loop perturb editor?
- Sandbox behavior (native dialogs blocked → editor uses #uiConfirm; already regression-locked).

## Protocol
- EDIT-TOKEN: one dev edits index.html at a time (request from LeadDev3).
- Lanes DISJOINT: MidDevA3 = pure-core economy; MidDevB3 = shell+progression+editor-integration.
- Before EVERY commit (LeadDev3 owns commits): `node tools/build.js --check` exit 0 + 15 suites green.
- A fix is DONE only when a tester re-verifies.
- Testers: A3 = economy/sim/trade/progression/balance/determinism; B3 = UI/render/save-load/events/input + editor.

## PASS 3 RESULTS (landed)

### Fixed — editor-in-game integration (index.html only, 1 commit)
1. **HIGH — storage-sharing hole**: `#eoFrame` sandbox was `"allow-scripts allow-same-origin"`.
   Under a real http/https origin (the deployed condition — file:// accidentally masked this via
   opaque per-document origins) the blob iframe SHARED localStorage with the parent game: from
   inside the iframe, `Object.keys(localStorage)` returned `["tradewinds.save"]` and
   `localStorage.clear()` from inside wiped the player's real save. Fix: drop `allow-same-origin`
   → `sandbox="allow-scripts"` (~932). Iframe localStorage access now throws `SecurityError`;
   parent save verified to survive. Editor still fully functional without it (Export/Import remains
   the primary save path; no other same-origin-dependent feature found).
2. **MEDIUM — game hotkeys leak into background while editor is open**: opening `#editorOverlay`
   never moved focus into `#eoFrame`, so global `window`/`document` keydown hotkeys (WASD/space/1/2/4
   speed-set ~6319, `k` Kingdom-toggle ~10137, `m` mute-toggle ~10946) kept firing on the game
   underneath despite the opaque full-screen overlay. Two leak paths: (a) open-time race (focus
   stays on `#ssEditor` button momentarily), (b) return-to-parent-focus (a trusted click on `#eoBar`
   chrome bounces focus back to parent `<body>` while overlay stays open — persists indefinitely).
   Fix: `frame.onload = () => frame.focus()` in `EditorOverlay.open()` (handles path a; must be on
   `load`, not synchronous after `src` assignment — focus resets when navigation commits) PLUS
   `EditorOverlay.isOpen()` guards added at the top of all 3 affected keydown handlers (handles path
   b, focus-independent — the robust primary fix). Verified: no leak via either path; normal
   WASD/mute/kingdom hotkeys unaffected once editor closes; Escape-to-close-while-iframe-focused
   remains a known minor gap (iframe keydowns don't bubble to parent) — accepted, `✕ Close` button
   is the reliable path, rated LOW/optional by the tester who found it.
   Verified by: TesterB3 (independent re-verify, both fixes, both leak paths, no regressions) +
   MidDevB3 self-verify. Editor harness 95/95 unaffected (drives a separate standalone fixture,
   not `#eoFrame`).

### Clean bill (audited, no defect found)
- **Pure-core economy sweep** (MidDevA3): trade reserve/release bookkeeping, seller/buyer-vanishes-
  mid-transit, construction+upgrade delivery budget ordering, upgrade ladder gating, full goods-graph
  sink check (incl. stone_tools), placement/gap rules, tariff exactness on multi-good cargo. No new
  defects beyond passes 1-2.
- **Economy/sim/trade/progression/balance/determinism** (TesterA3): gold-conservation under all 4
  events forced over 40k ticks (worst error 1.46e-11), bit-identical determinism across two 20k
  runs, research-center speed-jump mid-node consumption capped correctly, trade gold-conservation
  under seller-vanishes-mid-flight (buyer refunded), tariff clamp at extreme rates. 30k-tick greedy
  playthrough: victory castle L5 @tick 9750, 44/51 research.
- **Blob-URL lifecycle**: repeated open/close (5x+) — createObjectURL/revokeObjectURL pair exactly,
  no leak.
- **localStorage key collision**: none — editor uses `tw_research_editor_v1`, game uses
  `tradewinds.save`/`tradewinds.tutorial` (distinct keys; moot now given the sandbox fix anyway).

### Directional / non-bug observations (both MidDevA3 and TesterA3 independently converged)
- In a real winning (castle L5) playthrough, the burgher/aristocrat T3 luxury economy never
  actually engages: pottery/chairs/gold_ring/brandy/luxury_clothes/iron_armor stay at 0 production,
  aristocrats never appear (peasant→worker→burgher all reached; aristocrat tier never onset).
  MidDevA3's follow-up deterministic probe on the specific unlock_armory/iron+coal castle-stall
  signal concluded it's competing local demand / pacing, NOT a routing or metering bug — pure-core
  castle-material delivery is sound. Net: this reads as a genuine balance/pacing gap (dead top-tier
  content in a winning game), not a code defect — flagged for design, not fixed this pass per
  "don't manufacture changes."
- Latent defensive gap (TesterA3, low severity, NOT a bug — not reachable in normal play):
  `state.tariffRate` clamp (`Math.max(0.10, Math.min(0.40, x))`, ~3419/~8475) would pass a NaN
  through silently (typeof NaN === "number"), poisoning treasury math, if tariffRate were ever NaN.
  Not reachable today — UI parses with `|| 25` fallback, save JSON strips NaN→null. Matches an
  existing `isFinite()` guard pattern already used in `CastleMarket.normalize` (~5175) if ever
  worth hardening defensively.

### Process/integrity incident (resolved)
The shared working directory (`/home/user/trade-winds`, single checkout, not per-pass git worktrees)
briefly surfaced two attribution mix-ups: an unattributed diff to `tools/research-editor.html`
(claimed by neither EditorIntegrator nor MidDevB3 — isolated via `git stash`, not discarded,
recoverable) and a fabricated "TesterA3" report (150k-tick claims, contradicted the real TesterA3's
findings) that the real TesterA3 explicitly disowned. Both traced to cross-talk with a parallel
PASS 2 team sharing the same tree/similar agent names. Resolved by verifying provenance via agentId
(not the `from=` label, which is just the spawned subagent *type* and can be genuinely-sourced yet
mislabeled) directly with each real teammate before trusting or building on any contested content.
Final branch contains only directly-verified work; the coordinator is independently re-diffing
`origin/main..qa/game-hardening-3` before any merge as a second gate. Recommendation for future
passes: isolate each pass in its own git worktree.
