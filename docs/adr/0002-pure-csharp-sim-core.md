# Simulation is a pure C# core; Unity only renders it

The economy simulation lives in its own C# assembly with no `UnityEngine` reference: plain classes, a seeded RNG, a fixed 500 ms tick (2 ticks = 1 game-second), and Edit Mode tests that run it headless. MonoBehaviours only feed player input in and draw the sim's state (interpolating between ticks); GameObjects never own sim state. Balance data is authored as ScriptableObject assets and converted into plain C# data that the core reads, so tests can build their own data in code. This keeps the property that made the web version tunable — a deterministic, fast, testable economy that can run at 4× or in a headless balance runner — at the cost of a translation layer between the core and the scene.

## Considered Options

- **State on MonoBehaviours/GameObjects** — the Unity default, but it ties the economy to scenes and frame timing and makes headless balance runs and determinism impractical.
- **Single static C# config class** (a direct port of the old `CONFIG`) — simpler, but every tuning change becomes a code change.
