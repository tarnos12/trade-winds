#!/usr/bin/env node
// Builds the owner Hub: one self-contained HTML page from the repo's data, plan and questions.
// Usage: node tools/hub/build-hub.cjs [out.html]   (default tools/hub/out/index.html)
// Inputs:  tools/hub/data/content.json  (refresh with: dotnet run --project tools/ContentExport)
//          tools/hub/plan.json, tools/hub/questions.json, tools/hub/question-images/*
// Also writes docs/PLAN.md (readable plan). Checks script syntax and image references before writing.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const HUB = __dirname;
const ROOT = path.resolve(HUB, "..", "..");
const out = path.resolve(process.argv[2] || path.join(HUB, "out", "index.html"));
const outDir = path.dirname(out);

const read = f => fs.readFileSync(path.join(HUB, f), "utf8");
const content = JSON.parse(read("data/content.json"));
const plan = JSON.parse(read("plan.json"));
const questions = JSON.parse(read("questions.json"));

// --- validate plan and questions
const STATUSES = ["in-progress", "blocked", "waiting", "done"];
const problems = [];
for (const m of plan.milestones)
  for (const t of m.tasks) {
    if (!STATUSES.includes(t.status)) problems.push(`Task "${t.title}": unknown status ${t.status}`);
    if ((t.status === "blocked" || t.status === "waiting") && !t.blockedBy) problems.push(`Task "${t.title}": ${t.status} without blockedBy`);
    if (t.status === "in-progress" && !t.now) problems.push(`Task "${t.title}": in-progress without a "now" line`);
  }
const ids = new Set();
for (const q of questions) {
  if (q.g) continue;
  if (!q.id || !q.q || !Array.isArray(q.o) || !q.o.length) problems.push(`Question ${JSON.stringify(q).slice(0, 60)}: needs id, q and options`);
  if (ids.has(q.id)) problems.push(`Question id ${q.id} is duplicated`);
  ids.add(q.id);
  for (const im of q.imgs || [])
    if (!fs.existsSync(path.join(HUB, im.file))) problems.push(`Question ${q.id}: missing image ${im.file}`);
}
if (problems.length) {
  console.error("Hub build failed:\n  " + problems.join("\n  "));
  process.exit(1);
}

// --- copy question images beside the page as q/<name>
fs.mkdirSync(outDir, { recursive: true });
const imgOut = path.join(outDir, "q");
for (const q of questions)
  for (const im of q.imgs || []) {
    fs.mkdirSync(imgOut, { recursive: true });
    const name = path.basename(im.file);
    fs.copyFileSync(path.join(HUB, im.file), path.join(imgOut, name));
    im.file = "q/" + name;
  }

// --- inject data
const json = v => JSON.stringify(v).replace(/<\//g, "<\\/");
let html = read("template.html");
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error("Template is missing " + marker);
  html = html.replace(marker, value);
};
swap("/*DATA*/null", json(content));
swap("/*PLAN*/null", json(plan));
swap("/*QUESTIONS*/[]", json(questions));

// --- syntax-check every inline script
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((code, i) => {
  const tmp = path.join(os.tmpdir(), `hub-script-${process.pid}-${i}.js`);
  fs.writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  } catch (e) {
    console.error(`Hub build failed: script ${i} has a syntax error\n${e.stderr}`);
    process.exit(1);
  } finally {
    fs.unlinkSync(tmp);
  }
});

fs.writeFileSync(out, html);

// --- readable plan
const lines = [`# Plan`, ``, `Generated from \`tools/hub/plan.json\` (updated ${plan.updated}). Do not edit by hand.`, ``];
for (const m of plan.milestones) {
  const done = m.tasks.filter(t => t.status === "done").length;
  lines.push(`## ${m.id} · ${m.title} (${done}/${m.tasks.length} done)`, "");
  for (const t of m.tasks) {
    lines.push(`- **[${t.status}]** ${t.title} — ${t.detail}` +
      (t.blockedBy ? ` _Why: ${t.blockedBy}_` : "") + (t.now ? ` _Now: ${t.now}_` : "") + ` (${t.owner})`);
  }
  lines.push("");
}
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "PLAN.md"), lines.join("\n"));

const open = questions.filter(q => q.id).length;
console.log(`Hub built: ${path.relative(ROOT, out)} (${(html.length / 1024).toFixed(0)} KB, ${scripts.length} script(s) checked, ${open} open question(s)); docs/PLAN.md updated.`);
