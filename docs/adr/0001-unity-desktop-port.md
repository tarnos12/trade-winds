# Port to Unity, desktop-first; web build frozen

Trade Winds moves from a single-file, zero-dependency browser game to a Unity (2D URP) project targeting Windows desktop first, with Steam in mind. This drops the old "single-file, offline-first, hostable anywhere" pillar in exchange for a real asset pipeline (author-supplied sprite art), engine tooling and a commercial desktop target. The web build in `old-game-files/` is frozen as a behavioural reference only: no further changes, its last gh-pages release stands, and the port is not a strict parity rewrite — systems that weren't working (e.g. the peasant-tier stall, partly-wired research effects) are redesigned rather than copied. Old localStorage/JSON saves are not migrated; the Unity save format starts at version 1.

## Considered Options

- **WebGL as the primary target** — keeps "hostable anywhere", but constrains performance and storage for a simulation-heavy game; left possible, not required.
- **Faithful port first, redesign later** — rejected because parity would re-import known balance faults.
