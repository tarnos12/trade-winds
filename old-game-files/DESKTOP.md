# Trade Winds — Desktop app (Windows)

Runs the exact same game (`index.html`) in a native Electron window, with **all
data auto-saved to a single editable JSON file on disk** — the game save, the
research tree, the missions, the Balance-Lab scenario, and settings. No manual
Export/Import; the three editors autosave too.

## Run it (development)

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install        # first time only — downloads Electron
npm start          # rebuilds index.html from src/, then launches the app
```

## Build a Windows installer / portable .exe

```bash
npm run dist            # NSIS installer + portable .exe in dist-desktop/
npm run dist:portable   # portable .exe only
```

Output lands in `dist-desktop/`. Run `dist` **on Windows** (or a Windows CI
runner) to produce Windows binaries — cross-building from Linux/macOS needs Wine
and is not covered here.

## Where your data lives

Everything is auto-saved to one JSON file:

```
%APPDATA%\Trade Winds\trade-winds-data.json
```

- Loaded on launch (the file is the source of truth), saved every few seconds
  and on close.
- Open the folder from the app menu: **File → Open data folder**.
- It's plain JSON keyed by `tradewinds.*` (research / missions / balance) plus
  the game save — safe to back up, hand-edit, or copy between machines.

## How the auto-save works (and why it needed a desktop shell)

The research and mission editors run inside sandboxed `blob:` iframes. Under a
bare `file://` page their opaque origin blocks `localStorage`, so they can only
Export/Import by hand. The desktop app serves the page from a custom, secure
`app://trade-winds` origin, so the main window and its editor iframes share one
real origin where `localStorage` works. A preload script then mirrors that
`localStorage` to the JSON file above and seeds it back on startup.

- `electron/main.js` — window, the `app://` file server, and the disk read/write.
- `electron/preload.js` — seeds `localStorage` from disk, mirrors it back.

Nothing in the game itself is desktop-specific; the same `index.html` still runs
in any browser (data just persists via `localStorage` there instead of a file).
