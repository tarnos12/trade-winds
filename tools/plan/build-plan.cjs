// The plan by milestone, from its single source docs/design/plan.json:
//   node tools/plan/build-plan.cjs [out.pdf]
// writes docs/design/PLAN.md, a printable A4 page (out.pdf with .html) and, when Microsoft Edge is installed, prints that
// page to out.pdf with headless Edge. Default out: tools/plan/out/Trade-Winds-Plan.pdf. The Hub's Plan tab reads the same
// plan.json (tools/hub/build-hub.cjs).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..', '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'design', 'plan.json'), 'utf8'));
const outPdf = path.resolve(process.argv[2] || path.join(root, 'tools', 'plan', 'out', 'Trade-Winds-Plan.pdf'));
const outHtml = outPdf.replace(/\.pdf$/i, '') + '.html';

const ST = { 'done': 'Done', 'in-progress': 'In progress', 'next': 'Next', 'later': 'Later', 'todo': 'To do', 'blocked': 'Blocked', 'waiting': 'Waiting' };
const all = plan.milestones.flatMap((m) => m.tasks);
const count = (ts, s) => ts.filter((t) => t.status === s).length;

// ---- Markdown ----
const md = [];
md.push(`# ${plan.title}`, '', `Updated ${plan.updated}. ${plan.source} Do not edit PLAN.md by hand: edit plan.json and run \`node tools/plan/build-plan.cjs\`.`, '');
md.push(`**${count(all, 'done')} of ${all.length} tasks done**, ${count(all, 'in-progress')} in progress, ${count(all, 'todo')} to do, ${count(all, 'blocked')} blocked, ${count(all, 'waiting')} waiting.`, '');
{ const n = plan.milestones.flatMap((m) => m.tasks.filter((t) => t.now).map((t) => `- **${m.id}** ${t.title}: ${t.now}`)); if (n.length) md.push('## Being worked on now', '', ...n, ''); }
md.push('| # | Milestone | Gate | Status | Tasks done |', '|---|---|---|---|---|');
for (const m of plan.milestones) md.push(`| ${m.id} | ${m.name} | ${m.gate || ''} | ${ST[m.status]} | ${count(m.tasks, 'done')} / ${m.tasks.length} |`);
md.push('', '**Task status:** ' + Object.entries(plan.statusMeaning.task).map(([k, v]) => `${ST[k]}: ${v.replace(/^[^:]*: /, '')}`).join(' '), '');
md.push('**Owners:** ' + Object.entries(plan.owners).map(([k, v]) => `${k}: ${v}`).join(' '), '');
for (const m of plan.milestones) {
  md.push(`## ${m.id}: ${m.name}${m.gate ? ` (gate ${m.gate})` : ''}. ${ST[m.status]}`, '');
  md.push(m.goal, '', `**Exit:** ${m.exit}`, '');
  md.push('| Status | Task | Detail | Owner |', '|---|---|---|---|');
  for (const t of m.tasks) md.push(`| ${ST[t.status]} | ${t.title}${t.now ? ' **(NOW)**' : ''} | ${t.detail.replace(/\|/g, '/')} | ${t.owner} |`);
  md.push('');
}
fs.writeFileSync(path.join(root, 'docs', 'design', 'PLAN.md'), md.join('\n'));

// ---- Printable HTML ----
const nowList = () => plan.milestones.flatMap((m) => m.tasks.filter((t) => t.now).map((t) => ({ m, t })));
function nowBox() { const n = nowList(); return n.length ? `<div class="nowbox" id="now"><h2>Being worked on now</h2><ul>${n.map(({ m, t }) => `<li><b>${m.id}</b> ${esc(t.title)}: <span style="color:var(--muted)">${esc(t.now)}</span></li>`).join('')}</ul></div>` : ''; }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chip = (s) => `<span class="st st-${s}">${ST[s]}</span>`;
const bar = (n, d) => `<span class="prog"><i style="width:${Math.round((100 * n) / Math.max(1, d))}%"></i></span>`;
let h = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(plan.title)}</title>
<style>
@page { size: A4; margin: 14mm 13mm 16mm; }
:root { --ink: #2f2a22; --muted: #6f6656; --line: #ddd2ba; --head: #efe6d0; --accent: #3f6b3a; --soft: #e0ead3; --amber: #c67b2f; --red: #b5452f; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); font: 10pt/1.42 "Segoe UI", "Nunito", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font: 700 21pt/1.15 Georgia, "Alegreya", serif; margin: 0 0 3pt; color: var(--accent); }
.sub { color: var(--muted); margin: 0 0 10pt; font-size: 9pt; }
.summary { margin: 0 0 10pt; }
h2 { font: 700 13pt/1.2 Georgia, serif; margin: 0; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; background: var(--head); font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; padding: 4pt 6pt; border-bottom: 1px solid var(--line); }
td { padding: 4pt 6pt; border-bottom: 1px solid var(--line); vertical-align: top; }
tr { break-inside: avoid; }
.over td.n { white-space: nowrap; }
.st { display: inline-block; font-weight: 700; font-size: 7.5pt; border-radius: 9pt; padding: 1pt 6pt; white-space: nowrap; border: 1px solid transparent; }
.st-done { background: var(--accent); color: #fff; }
.st-in-progress { background: var(--amber); color: #fff; }
.st-next { background: var(--soft); color: var(--accent); border-color: var(--accent); }
.st-later, .st-todo { background: #f1ead9; color: var(--muted); border-color: var(--line); }
.st-blocked { color: var(--red); border-color: var(--red); }
.st-waiting { color: var(--muted); border-color: var(--muted); border-style: dashed; }
.prog { display: inline-block; width: 60pt; height: 5pt; background: var(--line); border-radius: 3pt; overflow: hidden; vertical-align: middle; margin-right: 4pt; }
.prog i { display: block; height: 100%; background: var(--accent); }
.legend { font-size: 8.5pt; color: var(--muted); margin: 8pt 0 0; }
.ms { margin-top: 14pt; }
.ms-head { display: flex; align-items: baseline; gap: 8pt; border-bottom: 2px solid var(--accent); padding-bottom: 3pt; margin-bottom: 5pt; break-after: avoid; }
.ms-head .id { font: 700 13pt "Segoe UI", Arial, sans-serif; color: var(--accent); }
.ms-head .gate { font-size: 8pt; color: var(--muted); border: 1px solid var(--line); border-radius: 3pt; padding: 0 4pt; }
.ms-head .cnt { margin-left: auto; font-size: 8.5pt; color: var(--muted); white-space: nowrap; }
.goal { margin: 0 0 3pt; break-after: avoid; }
.exit { margin: 0 0 6pt; color: var(--muted); break-after: avoid; }
.tasks td.s { width: 62pt; } .tasks td.o { width: 76pt; color: var(--muted); font-size: 8.5pt; }
.tasks td.t span.why { display: block; color: var(--red); font-weight: 700; }
.tasks td.t b { display: block; } .tasks td.t span { color: var(--muted); font-size: 8.8pt; }
.now { display: inline-block; font-weight: 800; font-size: 7pt; letter-spacing: .06em; color: #fff; background: var(--red); border-radius: 3pt; padding: 0 4pt; margin-left: 5pt; vertical-align: middle; }
.nav { display: none; }
@media screen { .nav { display: flex; flex-wrap: wrap; gap: 4px; position: sticky; top: 0; z-index: 5; background: var(--page); padding: 8px 0; margin-bottom: 10px; border-bottom: 1px solid var(--line); } .nav a { text-decoration: none; color: var(--ink); font-weight: 700; font-size: 13px; padding: 4px 9px; border-radius: 8px; border: 1px solid var(--line); background: var(--head); } .nav a:hover { border-color: var(--accent); } .nav a.nv-done { color: var(--accent); } .nav a.nv-in-progress { border-color: var(--amber); } html { scroll-padding-top: 56px; scroll-behavior: smooth; } }
.nowbox { border: 2px solid var(--amber); border-radius: 6pt; padding: 6pt 8pt; margin: 0 0 10pt; }
.nowbox h2 { color: var(--amber); margin-bottom: 4pt; }
.nowbox li { margin: 2pt 0; }
@media screen { :root { --page: #f3efe3; } body { background: var(--page); padding: 24px 16px 48px; } body > * { max-width: 900px; margin-left: auto; margin-right: auto; } table { display: block; overflow-x: auto; } }
@media screen and (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --page: #1c1f18; --ink: #ece5d3; --muted: #a79e8a; --line: #3b4033; --head: #2e3328; --accent: #9cc88f; --soft: #2f3b29; color-scheme: dark; } }
:root[data-theme="dark"] { --page: #1c1f18; --ink: #ece5d3; --muted: #a79e8a; --line: #3b4033; --head: #2e3328; --accent: #9cc88f; --soft: #2f3b29; color-scheme: dark; }
</style></head><body>
<nav class="nav"><a href="#top"><b>Plan</b></a>${nowList().length ? '<a href="#now">Now</a>' : ''}${plan.milestones.map((m) => `<a href="#${m.id}" title="${esc(m.name)}" class="nv-${m.status}">${m.id}</a>`).join('')}</nav>
<h1 id="top">${esc(plan.title)}</h1>
<p class="sub">Updated ${esc(plan.updated)} · ${count(all, 'done')} of ${all.length} tasks done · ${count(all, 'in-progress')} in progress · ${count(all, 'todo')} to do · ${count(all, 'blocked')} blocked, ${count(all, 'waiting')} waiting</p>
${nowBox()}
<table class="over"><thead><tr><th>#</th><th>Milestone</th><th>Gate</th><th>Status</th><th>Tasks done</th></tr></thead><tbody>
${plan.milestones.map((m) => `<tr><td class="n"><b>${m.id}</b></td><td>${esc(m.name)}</td><td>${m.gate || ''}</td><td>${chip(m.status)}</td><td class="n">${bar(count(m.tasks, 'done'), m.tasks.length)}${count(m.tasks, 'done')} / ${m.tasks.length}</td></tr>`).join('\n')}
</tbody></table>
`;
for (const m of plan.milestones) {
  h += `<section class="ms" id="${m.id}"><div class="ms-head"><span class="id">${m.id}</span><h2>${esc(m.name)}</h2>${m.gate ? `<span class="gate">Gate ${m.gate}</span>` : ''}${chip(m.status)}<span class="cnt">${bar(count(m.tasks, 'done'), m.tasks.length)}${count(m.tasks, 'done')} / ${m.tasks.length} done</span></div>
<p class="goal">${esc(m.goal)}</p><p class="exit"><b>Exit:</b> ${esc(m.exit)}</p>
<table class="tasks"><tbody>
${m.tasks.map((t) => `<tr><td class="s">${chip(t.status)}</td><td class="t"><b>${esc(t.title)}${t.now ? '<span class="now">NOW</span>' : ''}</b><span>${esc(t.detail)}</span>${t.blockedBy ? `<span class="why">${t.status === 'waiting' ? 'Waiting' : 'Blocked'}: ${esc(t.blockedBy)}</span>` : ''}</td><td class="o">${esc(t.owner)}</td></tr>`).join('\n')}
</tbody></table></section>
`;
}
h += `</body></html>`;
fs.mkdirSync(path.dirname(outPdf), { recursive: true });
fs.writeFileSync(outHtml, h);

// ---- PDF with headless Edge ----
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (edge) {
  if (fs.existsSync(outPdf)) fs.unlinkSync(outPdf);
  execFileSync(edge, ['--headless', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + outPdf, pathToFileURL(outHtml).href], { stdio: 'ignore', timeout: 120000 });
}
const pdf = fs.existsSync(outPdf) ? fs.readFileSync(outPdf) : null;
const pages = pdf ? (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length : 0;
console.log(`PLAN.md, ${outHtml}` + (pdf ? `, ${outPdf} (${Math.round(pdf.length / 1024)} KB, ${pages} pages)` : ' (no PDF: Edge not found)'));
console.log(`${plan.milestones.length} milestones, ${all.length} tasks: ${count(all, 'done')} done, ${count(all, 'in-progress')} in progress, ${count(all, 'todo')} to do, ${count(all, 'blocked')} blocked, ${count(all, 'waiting')} waiting`);
