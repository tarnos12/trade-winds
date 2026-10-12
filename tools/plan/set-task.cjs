// Updates tasks in docs/design/plan.json by title match (case-insensitive regex), then rebuild with build-plan.cjs.
//   node tools/plan/set-task.cjs "<title regex>" <status|-> ["now text" | --not-now]
// status: done | in-progress | todo | blocked | waiting | - (keep). blocked = cannot start (art, an answer); waiting = could start, but not yet a good time (with the reason). A "now" text marks the task as being worked on right now
// (shown in the plan's "Being worked on now" box); with status blocked the text is the one-line reason it is blocked;
// --not-now clears it. Marking a task done clears "now".
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', '..', 'docs', 'design', 'plan.json');
const [re, status, now] = process.argv.slice(2);
if (!re || !status) { console.error('usage: set-task.cjs "<title regex>" <status|-> ["now text"|--not-now]'); process.exit(1); }
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const rx = new RegExp(re, 'i');
let n = 0;
for (const m of p.milestones) for (const t of m.tasks) {
  if (!rx.test(t.title)) continue;
  if (status !== '-') t.status = status;
  if (t.status !== 'blocked' && t.status !== 'waiting') delete t.blockedBy;
  if (now === '--not-now' || t.status === 'done') delete t.now;
  else if (now && (t.status === 'blocked' || t.status === 'waiting')) { t.blockedBy = now; delete t.now; }
  else if (now) t.now = now;
  n++;
  console.log(`${m.id} ${t.title}: ${t.status}${t.now ? ' (now: ' + t.now + ')' : ''}`);
}
if (!n) { console.error('no task matches ' + re); process.exit(1); }
p.updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
fs.writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
