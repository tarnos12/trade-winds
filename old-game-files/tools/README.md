# Balance playthrough harness (BAL2)

Scripted headless "player" that plays a full progression against the pure `Sim`/
`Trade`/`Research` core to surface economy stalls, dead content, and pacing.

Run: `TW_HTML=./index.html node tools/playthrough.js [ticks]`  (default preset `fertile`)

- `lib.js` — loads the PURE_CORE region into a Node VM, exports every module.
- `player.js` — builds a controlled 4-city map (resources seated so every chain is
  locally buildable — isolates ECONOMY balance from map RNG) + `step()` (full
  accumulator order). `TW_HTML` env var overrides the index.html path.
- `playthrough.js` — greedy build/research/level policy + instrumented report
  (milestones, per-1000-tick snapshots, stalls, dead content, pacing).

Not part of the test suite; a diagnostic tool. Known limitation: the greedy policy
is chaos-sensitive (small map/plan changes can flip a deterministic run), so treat
its numbers as directional, and confirm findings with focused sim-level tests.

## Research-tree editor regression harness

`research-editor.html` is a standalone, zero-deps browser app with no automated
tests of its own — `test/editor.test.js` (at the repo root's `test/`, alongside
the plain-node PURE_CORE suites) is its first regression net. Unlike those
suites, it drives the real DOM/canvas UI in headless Chromium via
playwright-core (same spirit as `playthrough.js`: a diagnostic/regression
harness, not part of the plain-node `test/*.test.js` run). Covers: add
card/kingdom card, real-mouse delete (including upgrade-ladder cascade for
anchor cards) driven through the in-DOM `#uiConfirm` overlay that replaced
native `confirm()`, keyboard-Delete and edge deletion, click-to-connect
(arm/connect/self-drop/kingdom-reject/Esc/outside-click), the effect editor
(kingdom-only visibility, add/remove, bool controls), and export→import
round-tripping. A final group runs the delete flow inside a **sandboxed
iframe** (`sandbox="allow-scripts allow-same-origin"`, no `allow-modals` — the
published-Artifact environment) to lock in the fix for the "Delete button does
nothing in the Artifact" regression: native `confirm()` is blocked there, so
the overlay path must complete with zero native dialogs. The suite fails if any
native `confirm()`/`alert()`/`prompt()` ever fires.

Run: `PW_CORE=/path/to/playwright-core node test/editor.test.js`
(optionally `SANDBOX_HOST=file:///path/to/sandbox_host.html` for the iframe group)
