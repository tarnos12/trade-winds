// === SCOUTS START ===  (v0.45 — Scout units)
// STUB — the full implementation is written by ScoutAgent. This placeholder keeps
// the build + the (guarded) hooks in mainloop/input working until it lands.
// The module lives in the browser IIFE, so the real version may use the shared
// closure globals directly: `state`, `ctx`, `SIZE`, `reveal`, `isVisible`,
// `HexMath`, `Pathing`, `hexAtScreen`, `setMode`, etc.
var Scouts = (typeof Scouts !== "undefined" && Scouts) || {};
Scouts.ensure = Scouts.ensure || function () {};
Scouts.frame = Scouts.frame || function () {};
Scouts.handleClick = Scouts.handleClick || function () { return false; };
if (typeof window !== "undefined") window.Scouts = Scouts;
// === SCOUTS END ===
