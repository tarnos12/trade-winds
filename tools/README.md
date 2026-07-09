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
