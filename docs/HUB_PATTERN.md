# The project Hub: one page for game data, the plan and owner questions

A pattern for any game project where an AI team (Claude agents) builds and the owner decides. One private web page — the **Hub** — is the single place the owner looks: the game's data, the plan and every open question. It is generated from files in the repository, so it is never edited by hand and never goes stale.

---

## 1. What the Hub contains

| Tab | Shows | Source of truth in the repo |
|---|---|---|
| **Data** (e.g. a Dex / item list / level list) | A sortable, filterable table of the game's main content; a detail page per row (pictures, stats, tooltips) | The game's shipped data files (JSON) |
| **Charts** | Totals and spreads per group (balance at a glance) | Same data |
| **World Map** | The world grid drawn as an SVG (areas coloured by biome, towns, Masters needed); a click opens the area's panel: when it opens, landmarks, and its wild monsters with level range and rate under the chosen time, season, weather and Masters; a search highlights where a monster lives (`#world/<area>` opens it) | `world-layout.json`, `maps/*.json`, `encounters.json`, `balance.json` (as a compact `WORLD` object) |
| **Plan** | Milestones and tasks with status, owner and the reason a task is blocked or waiting; a "being worked on now" box | `plan.json` |
| **Questions** | Every open decision for the owner, with pictures when the decision is visual | `questions.json` + `question-images/` |

Keep one Hub per project. Pin it. Every status message to the owner ends with its link (plus a link to the latest playable build, if there is one).

---

## 2. How it is built and published

```
repo data (JSON) ─┐
plan.json ────────┼─► build script (node) ─► one self-contained HTML page ─► publish to the same URL
questions.json ───┤        + template.html         + side files (images)
question-images/ ─┘
```

- **Build script** (e.g. `tools/hub/build-hub.cjs <out.html>`): reads the data files, the plan and the questions, injects them as JSON into a template (`/*DATA*/[]`, `/*PLAN*/null`, `/*QUESTIONS*/[]` placeholders), and writes one HTML file. Pictures are written next to it (e.g. `views/<id>.png`, `q/<name>.png`).
- **Template**: plain HTML + CSS + JS, no framework. Light and dark themes via CSS variables. Works on a phone.
- **Publish**: always to the **same URL** (update in place). Large pictures go as separate files beside the page, uploaded only when they change.
- **Rebuild + republish whenever** the data changes, a plan task changes status, or a question is added or answered.
- **Check before publishing**: extract the page's scripts and run a syntax check (`node --check`), and confirm image references exist.

---

## 3. The plan (`plan.json`)

```json
{
  "updated": "2026-10-12 10:00",
  "milestones": [
    { "id": "M3", "title": "Combat", "tasks": [
      { "title": "Status effects", "detail": "What it produces and why, in plain words.",
        "status": "in-progress", "size": "M", "owner": "Claude", "now": "status-fx agent" },
      { "title": "Boss art", "detail": "...", "status": "blocked", "owner": "Artist",
        "blockedBy": "Waiting for the boss sheets (art request section 12)" }
    ]}
  ]
}
```

**Statuses** — no task sits idle without a reason:

| Status | Meaning |
|---|---|
| `in-progress` | Someone (an agent) is working on it now; `now` names who/what. |
| `blocked` | Cannot start: needs art, an owner answer, or another task. `blockedBy` says what. |
| `waiting` | Could start, but not a good time yet (e.g. after a polish pass, a release milestone). `blockedBy` says why. |
| `done` | Built and checked. |

Rules:
- Every owner request, pick and delivery becomes a task **at once**; it leaves the plan only when built.
- Every running agent has its own `in-progress` task with a `now` line.
- Write tasks for a designer, not a programmer: what it produces and why, no jargon.
- Small tools keep it consistent: `set-task "<title regex>" <status> ["now" | "reason"]` and `build-plan` (also writes a readable `PLAN.md`). Use precise title regexes — a loose one can flip an unrelated task.

---

## 4. Questions (`questions.json`)

All owner decisions go **only** in the Questions tab — not in chat lists, not on separate pages.

```json
[
  { "g": "Monster redesign" },
  { "id": "hero_pick",
    "q": "New hero (Fire; evolves into X, Fire/Flying). Which design goes to final art? (Click a picture for full size.)",
    "imgs": [ { "file": "question-images/hero-a.png", "cap": "A: standing" },
              { "file": "question-images/hero-b.png", "cap": "B: running" } ],
    "o": [ ["a", "A", true], ["b", "B"], ["redo", "None yet: redo with my note"] ] },
  { "id": "level_cap", "q": "Raise the level cap?", "ctx": "Optional one-line context.",
    "o": [ ["100", "100", true], ["60", "60"] ] },
  { "id": "extras", "q": "Pick any.", "multi": true, "o": [ ["x", "X"], ["y", "Y"] ] }
]
```

- `{ "g": ... }` starts a group heading. A question has `id`, `q` (the question), `o` (options: `[value, label, recommended?]`), optional `ctx`, `multi`, `imgs`.
- **Pictures** live in `question-images/`; the build copies them beside the page and the question shows them inline (click to open full size).
- **Recommended** options are only *marked* ("my pick"). Nothing is ever pre-selected for the owner, and there is **no "use my picks" button** — it can overwrite the owner's own answers.
- Each question has a free-text note field.
- **Answering**: the owner picks, presses **Copy results**, and pastes the text into chat:
  ```
  Answers
  hero_pick: A
  level_cap: 100  | note: room for post-game
  ```
  Answers are kept in the owner's browser until copied (local storage); nothing is sent anywhere by the page.
- **After answers arrive**: record every answer (and note) in a dated `owner-picks-<date>.json`, remove answered questions from `questions.json`, turn each answer into plan tasks, rebuild and republish the Hub.
- **If an answer could mean two things** (e.g. the picked option and the note disagree), don't guess: ask a short follow-up question in the tab.
- Keep questions short and concrete. Give the facts the owner needs to decide inside the question (e.g. for any game character: its type/class and its evolution line). A red badge on the tab shows the open count.

---

## 5. Owner picks are commitments

- `owner-picks-<date>.json` holds every answer verbatim, including notes.
- Read the picks files before planning or reporting. A picked design is never dropped silently; if it must change, ask.

---

## 6. Art from an outside artist (optional)

When art comes from another tool or person (e.g. an image AI working from a shared folder):
- One **request document** (e.g. `ASSETS_NEEDED.md`) kept identical in the repo and the shared folder (compare checksums before writing; merge their edits first).
- A **priority block at the top** when priorities change — artists follow their own queue otherwise.
- Every delivery is checked (checksums, sizes, style, alignment), then imported or sent back with exact, measurable notes. Whole-pixel alignment fixes can be done in-house instead of a round trip.
- Visual choices for the owner (concepts, variants) go into the Questions tab with the pictures.
- A delivery log (`imported-deliveries.txt`) plus a checker that lists anything in the shared folder not yet imported.

---

## 7. Checklist for a new project

1. Create `plan.json`, `questions.json`, `question-images/`, and an `owner-picks-<date>.json` per answer batch.
2. Write the build script and template (tabs: Data, Charts, Plan, Questions); test the page's script syntax on every build.
3. Publish once, pin it, and reuse the same URL forever.
4. Agent rules: every agent has a plan task; every request becomes a task; questions only in the Hub; rebuild + republish after every change; end every report with the Hub link.
