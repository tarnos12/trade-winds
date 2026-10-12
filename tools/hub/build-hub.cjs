#!/usr/bin/env node
// Builds the owner Hub (Data, Charts, Plan, Questions): one self-contained HTML page from the repo's files.
//   node tools/hub/build-hub.cjs [out.html]      (default tools/hub/out/index.html)
// Reads tools/hub/data/content.json (refresh: dotnet run --project tools/ContentExport), docs/design/plan.json,
// docs/design/questions.json and docs/design/question-images/*. Runs tools/plan/build-plan.cjs first (PLAN.md + PDF),
// copies question pictures beside the page as q/<name>, and syntax-checks the page script before writing.
// Re-run after any change to content, plan or questions, then republish the page to the same Hub URL.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const design = path.join(root, "docs", "design");
const out = path.resolve(process.argv[2] || path.join(__dirname, "out", "index.html"));
const outDir = path.dirname(out);

execFileSync(process.execPath, [path.join(root, "tools", "plan", "build-plan.cjs")], { stdio: "inherit" });

const content = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "content.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(design, "plan.json"), "utf8"));
const qFile = path.join(design, "questions.json");
const questions = fs.existsSync(qFile) ? JSON.parse(fs.readFileSync(qFile, "utf8")) : [];

// --- check the plan and the questions
const STATUSES = ["done", "in-progress", "todo", "blocked", "waiting"];
const problems = [];
for (const m of plan.milestones) {
  for (const k of ["id", "name", "goal", "exit"]) if (!m[k]) problems.push(`Milestone ${m.id || "?"}: missing ${k}`);
  for (const t of m.tasks) {
    if (!STATUSES.includes(t.status)) problems.push(`Task "${t.title}": unknown status ${t.status}`);
    if ((t.status === "blocked" || t.status === "waiting") && !t.blockedBy) problems.push(`Task "${t.title}": ${t.status} needs a reason (blockedBy)`);
    if (t.status === "in-progress" && !t.now) problems.push(`Task "${t.title}": in progress needs a "now" line`);
    if (!plan.owners[t.owner]) problems.push(`Task "${t.title}": owner ${t.owner} is not in plan.owners`);
  }
}
const ids = new Set();
for (const q of questions) {
  if (q.g) continue;
  if (!q.id || !q.q || !Array.isArray(q.o) || !q.o.length) problems.push(`Question ${JSON.stringify(q).slice(0, 60)}: needs id, q and options`);
  if (ids.has(q.id)) problems.push(`Question id ${q.id} is used twice`);
  ids.add(q.id);
  for (const im of q.imgs || []) if (!fs.existsSync(path.join(design, im.file))) problems.push(`Question ${q.id}: missing picture ${im.file}`);
}
if (problems.length) {
  console.error("Hub not built:\n  " + problems.join("\n  "));
  process.exit(1);
}

// --- pictures for questions, beside the page as q/<name>
fs.mkdirSync(outDir, { recursive: true });
for (const q of questions)
  for (const im of q.imgs || []) {
    fs.mkdirSync(path.join(outDir, "q"), { recursive: true });
    fs.copyFileSync(path.join(design, im.file), path.join(outDir, "q", path.basename(im.file)));
    im.src = "q/" + path.basename(im.file);
  }

// --- inject the data
const json = v => JSON.stringify(v).replace(/<\//g, "<\\/");
let html = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
for (const [marker, value] of [["/*DATA*/null", content], ["/*PLAN_DATA*/null", plan], ["/*QUESTIONS_DATA*/[]", questions]]) {
  if (!html.includes(marker)) throw new Error("template.html is missing " + marker);
  html = html.replace(marker, () => json(value));
}

// --- syntax-check every inline script
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((code, i) => {
  const tmp = path.join(os.tmpdir(), `hub-script-${process.pid}-${i}.js`);
  fs.writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  } catch (e) {
    console.error(`Hub not built: script ${i} has a syntax error\n${e.stderr}`);
    process.exit(1);
  } finally {
    fs.unlinkSync(tmp);
  }
});

fs.writeFileSync(out, html);
const open = questions.filter(q => q.id).length;
console.log(`Hub built: ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB, ${scripts.length} script(s) checked, ${open} open question(s)).`);
