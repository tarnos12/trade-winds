#!/usr/bin/env node
// The code AI's side of the art pipeline (docs/art/README.md):
//   node tools/art/check-drive.cjs            status: new zips, handoff changes, request copies in sync?
//   node tools/art/check-drive.cjs sync       copy docs/art/ASSETS_NEEDED.md and art/reference/* to the Drive
//                                             (refuses if the Drive copy was edited since the last sync)
//   node tools/art/check-drive.cjs verify <zip-name>
//                                             unpack a delivery to tools/art/out/<name>/, check SHA256SUMS,
//                                             list every PNG's size
// The shared folder defaults to G:\Mój dysk\AI files\Trade Winds (set TW_ART_DRIVE to override).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const drive = process.env.TW_ART_DRIVE || "G:\\Mój dysk\\AI files\\Trade Winds";
const request = path.join(root, "docs", "art", "ASSETS_NEEDED.md");
const log = path.join(root, "docs", "art", "deliveries.md");
const refs = path.join(root, "art", "reference");
const stateFile = path.join(root, "docs", "art", "drive-sync.json");
const HANDOFF = "CLAUDE_HANDOFF_AND_BLOCKERS.md";

const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");

if (!fs.existsSync(drive)) {
  console.error(`Shared folder not found: ${drive} (is Google Drive running?)`);
  process.exit(1);
}

const cmd = process.argv[2] || "status";
if (cmd === "status") status();
else if (cmd === "sync") sync();
else if (cmd === "verify") verify(process.argv[3]);
else if (cmd === "seen") seen();
else {
  console.error("usage: check-drive.cjs [status|sync|seen|verify <zip>]");
  process.exit(1);
}

function status() {
  // Request copies
  const driveReq = path.join(drive, "ASSETS_NEEDED.md");
  const repoHash = sha(request);
  const driveHash = fs.existsSync(driveReq) ? sha(driveReq) : null;
  if (driveHash === repoHash) console.log("ASSETS_NEEDED.md: Drive and repo identical.");
  else if (!driveHash) console.log("ASSETS_NEEDED.md: not on the Drive yet (run sync).");
  else if (driveHash !== state.requestHash) console.log("ASSETS_NEEDED.md: the DRIVE copy was edited since the last sync. Merge it into the repo copy first.");
  else console.log("ASSETS_NEEDED.md: repo copy is newer (run sync).");

  // Handoff notes
  const handoff = path.join(drive, HANDOFF);
  if (fs.existsSync(handoff)) {
    const mtime = fs.statSync(handoff).mtime.toISOString();
    if (mtime !== state.handoffSeen) {
      console.log(`\n${HANDOFF} changed (${mtime}). Read it, then: node tools/art/check-drive.cjs seen`);
    } else console.log(`${HANDOFF}: no change since ${mtime}.`);
  } else console.log(`${HANDOFF}: none yet.`);

  // Deliveries not logged
  const logged = fs.readFileSync(log, "utf8");
  const zips = fs.readdirSync(drive).filter(f => /\.zip$/i.test(f));
  const fresh = zips.filter(z => !logged.includes(z));
  console.log(fresh.length ? `\nNew deliveries (not in docs/art/deliveries.md):\n  ${fresh.join("\n  ")}` : "\nNo new deliveries.");
}

function sync() {
  const driveReq = path.join(drive, "ASSETS_NEEDED.md");
  if (fs.existsSync(driveReq)) {
    const h = sha(driveReq);
    if (state.requestHash && h !== state.requestHash && h !== sha(request)) {
      console.error("Refused: the Drive copy of ASSETS_NEEDED.md was edited since the last sync. Merge it first.");
      process.exit(1);
    }
  }
  fs.copyFileSync(request, driveReq);
  if (sha(driveReq) !== sha(request)) throw new Error("copy check failed for ASSETS_NEEDED.md");
  state.requestHash = sha(request);

  const handoff = path.join(drive, HANDOFF);
  if (!fs.existsSync(handoff)) {
    fs.writeFileSync(handoff, `# Trade Winds — art AI handoff and blockers\n\nWritten by the art AI. Newest entry first: date, what was delivered (zip name, sizes), problems,\nblockers (missing source files, contradictions in ASSETS_NEEDED.md) and what comes next.\n`);
    console.log(`Created ${HANDOFF} (empty template for the art AI).`);
  }

  const out = path.join(drive, "From Claude");
  fs.mkdirSync(out, { recursive: true });
  let copied = 0;
  for (const f of fs.readdirSync(refs)) {
    const dst = path.join(out, f);
    if (fs.existsSync(dst) && sha(dst) === sha(path.join(refs, f))) continue;
    fs.copyFileSync(path.join(refs, f), dst);
    if (sha(dst) !== sha(path.join(refs, f))) throw new Error("copy check failed for " + f);
    copied++;
  }
  saveState();
  console.log(`Synced: ASSETS_NEEDED.md (sha256 ${state.requestHash.slice(0, 12)}…), ${copied} reference file(s) copied to From Claude/.`);
}

function verify(name) {
  if (!name) throw new Error("verify needs a zip name");
  const zip = path.join(drive, name);
  const out = path.join(__dirname, "out", name.replace(/\.zip$/i, ""));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  execFileSync("tar", ["-xf", zip, "-C", out]);
  console.log(`Unpacked to ${out}`);
  const files = walk(out);
  const sums = files.find(f => /SHA256SUMS/i.test(path.basename(f)));
  if (sums) {
    let bad = 0;
    for (const line of fs.readFileSync(sums, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
      if (!m) continue;
      const f = path.join(path.dirname(sums), m[2].trim());
      const ok = fs.existsSync(f) && sha(f) === m[1].toLowerCase();
      if (!ok) { bad++; console.log(`  CHECKSUM FAIL ${m[2]}`); }
    }
    console.log(bad ? `${bad} checksum failure(s).` : "Checksums OK.");
  } else console.log("No SHA256SUMS in the zip.");
  for (const f of files.filter(f => /\.png$/i.test(f))) {
    const b = fs.readFileSync(f);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    const iend = b.slice(-8, -4).toString("latin1") === "IEND";
    console.log(`  ${path.relative(out, f)}  ${w}×${h}  ${b.length} bytes${iend ? "" : "  (NO IEND: truncated?)"}`);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

/** Mark the current handoff file as read. */
function seen() {
  const handoff = path.join(drive, HANDOFF);
  state.handoffSeen = fs.statSync(handoff).mtime.toISOString();
  saveState();
  console.log("Handoff marked as read.");
}
