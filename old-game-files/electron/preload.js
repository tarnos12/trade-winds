// Trade Winds — Electron preload (runs in the renderer BEFORE the page's own
// scripts). It bridges the browser's localStorage to the on-disk JSON store:
//
//   • on startup: seed localStorage from disk so the game + all three editors
//     open with your saved data (the disk file is the source of truth);
//   • during play: mirror localStorage back to disk every few seconds and on
//     close, so game saves, research trees, missions and balance scenarios are
//     auto-saved without any manual Export.
//
// The editors run in blob:app://… iframes that share this window's origin, so
// their tradewinds.* keys live in this same localStorage — seeding/mirroring
// the main frame covers them too.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// ---- seed localStorage from disk (authoritative) --------------------------
try {
  const data = ipcRenderer.sendSync("tw-load-sync") || {};
  for (const k in data) {
    if (Object.prototype.hasOwnProperty.call(data, k) && typeof data[k] === "string") {
      try { window.localStorage.setItem(k, data[k]); } catch (e) { /* storage blocked */ }
    }
  }
} catch (e) { /* first run / ipc unavailable */ }

// ---- mirror localStorage -> disk ------------------------------------------
function snapshot() {
  const o = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      o[k] = window.localStorage.getItem(k);
    }
  } catch (e) {}
  return o;
}
function flush() { try { ipcRenderer.send("tw-save", snapshot()); } catch (e) {} }

const timer = setInterval(flush, 3000);
window.addEventListener("beforeunload", () => { clearInterval(timer); flush(); });
window.addEventListener("pagehide", flush);

// ---- small desktop API the page can feature-detect ------------------------
contextBridge.exposeInMainWorld("twDesktop", {
  isDesktop: true,
  saveNow: flush,
  openDataFolder: () => ipcRenderer.send("tw-open-folder"),
});
