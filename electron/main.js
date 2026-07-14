// Trade Winds — Electron desktop shell.
//
// Goals:
//  1. Run the exact same single-file game (../index.html) as a native window.
//  2. Serve it from a custom "app://" standard scheme so the page AND its
//     blob-URL editor iframes (research / mission editors) share one real,
//     secure origin — that makes their localStorage autosave work, which a
//     bare file:// origin does not reliably allow.
//  3. Auto save/load ALL data to a single, human-editable JSON file on disk
//     (game save, research tree, missions, balance-lab scenario, settings) so
//     nothing is lost and the data is easy to back up / hand-edit.
"use strict";

const { app, BrowserWindow, protocol, ipcMain, Menu, shell, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const APP_ROOT = path.join(__dirname, "..");                 // repo root: holds index.html
const dataFile = () => path.join(app.getPath("userData"), "trade-winds-data.json");

// ---- disk persistence (the durable, editable store) -----------------------
function readData() {
  try { return JSON.parse(fs.readFileSync(dataFile(), "utf8")) || {}; }
  catch (e) { return {}; }
}
let writeTimer = null, pending = null;
function writeDataDebounced(obj) {
  pending = obj;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { fs.writeFileSync(dataFile(), JSON.stringify(pending, null, 2)); } catch (e) { /* disk full / locked */ }
  }, 400);
}
function flushNow() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  if (pending) { try { fs.writeFileSync(dataFile(), JSON.stringify(pending, null, 2)); } catch (e) {} }
}

// ---- register the privileged scheme BEFORE app is ready -------------------
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: "#1b140c",
    title: "Trade Winds",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,          // preload needs Node (fs-less; only ipc) — kept minimal
    },
  });
  win.loadURL("app://trade-winds/index.html");
  return win;
}

app.whenReady().then(() => {
  // Serve files from APP_ROOT over app://trade-winds/… (path-traversal guarded).
  protocol.handle("app", (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const abs = path.normalize(path.join(APP_ROOT, rel));
    if (!abs.startsWith(APP_ROOT)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(abs).toString());
  });

  ipcMain.on("tw-load-sync", (e) => { e.returnValue = readData(); });
  ipcMain.on("tw-save", (e, obj) => { if (obj && typeof obj === "object") writeDataDebounced(obj); });
  ipcMain.on("tw-open-folder", () => shell.showItemInFolder(dataFile()));

  const menu = Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Open data folder", click: () => shell.showItemInFolder(dataFile()) },
      { type: "separator" },
      { role: "quit" },
    ] },
    { label: "View", submenu: [
      { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
      { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "togglefullscreen" },
    ] },
  ]);
  Menu.setApplicationMenu(menu);

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", flushNow);
app.on("window-all-closed", () => { flushNow(); if (process.platform !== "darwin") app.quit(); });
