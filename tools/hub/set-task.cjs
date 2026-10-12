#!/usr/bin/env node
// Change a plan task's status. Matches exactly one task by title regex (anchor it to be safe).
// Usage: node tools/hub/set-task.cjs "<title regex>" <in-progress|blocked|waiting|done> ["now line" | "reason"]
//   in-progress → the third argument is the "now" line (who/what is working on it)
//   blocked / waiting → the third argument is the reason (blockedBy)
// Then rebuild: node tools/hub/build-hub.cjs
"use strict";
const fs = require("fs");
const path = require("path");

const [, , pattern, status, extra] = process.argv;
const STATUSES = ["in-progress", "blocked", "waiting", "done"];
if (!pattern || !STATUSES.includes(status)) {
  console.error('Usage: set-task "<title regex>" <in-progress|blocked|waiting|done> ["now" | "reason"]');
  process.exit(1);
}
if ((status !== "done") && !extra) {
  console.error(`${status} needs a ${status === "in-progress" ? '"now" line' : "reason"}.`);
  process.exit(1);
}

const file = path.join(__dirname, "plan.json");
const plan = JSON.parse(fs.readFileSync(file, "utf8"));
const re = new RegExp(pattern, "i");
const hits = plan.milestones.flatMap(m => m.tasks.filter(t => re.test(t.title)).map(t => ({ m, t })));
if (hits.length !== 1) {
  console.error(`"${pattern}" matched ${hits.length} tasks${hits.length ? ": " + hits.map(h => h.t.title).join(" | ") : ""}. Use a more precise regex.`);
  process.exit(1);
}

const { m, t } = hits[0];
t.status = status;
delete t.now;
delete t.blockedBy;
if (status === "in-progress") t.now = extra;
if (status === "blocked" || status === "waiting") t.blockedBy = extra;
const d = new Date();
const pad = n => String(n).padStart(2, "0");
plan.updated = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
fs.writeFileSync(file, JSON.stringify(plan, null, 2) + "\n");
console.log(`${m.id} · ${t.title} → ${status}${extra ? " (" + extra + ")" : ""}`);
