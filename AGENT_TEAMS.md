# Agent Teams — Operating Reference

**The Claude Code agent-teams *feature* reference** — how enabling, inter-agent
messaging, and the shared task list actually work. It is the companion to
[`CLAUDE.md`](CLAUDE.md): CLAUDE.md is the **methodology** (how *we* run a team),
this file is the **mechanics** (how the *tool* works). When a task benefits from
parallelism, we organize it as an **agent team**: multiple Claude Code instances
collaborating with a shared task list, direct inter-agent messaging, and one
coordinating lead.

Distilled from the official docs (<https://code.claude.com/docs/en/agent-teams>,
Claude Code v2.1.178+) and annotated for this repo. Several behaviors below
carry explicit minimum-version notes — verify against the live docs when a
detail looks version-dependent.

> **Experimental, disabled by default.** Nothing here works unless
> `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` was set **at session start**. Without
> it, no team is created, no team directories are written, and Claude neither
> spawns nor proposes teammates. See [§10](#10-enabling-teams-durably) — a
> git-ignored local setting will *not* survive a fresh remote clone.

---

## 1. The model

One session is the **team lead** — it spawns teammates, coordinates work,
creates/assigns tasks, and synthesizes results. **Teammates** are *separate,
full Claude Code sessions*, each with its own context window, that work
independently and **message each other directly** — not only the lead. You can
also talk to any teammate yourself, by name, without going through the lead.

An agent team consists of:

| Component | Role |
|---|---|
| **Team lead** | The main session; spawns teammates and coordinates |
| **Teammates** | Separate Claude Code instances, each on assigned tasks |
| **Task list** | Shared work items teammates claim and complete |
| **Mailbox** | Messaging system between agents |

---

## 2. Teams vs. subagents — pick the right tool

Both parallelize work; they differ in whether the workers **talk to each other**.

| | **Subagents** (`Agent` tool) | **Agent teams** |
|---|---|---|
| Context | Own window; result returns to caller | Own window; fully independent |
| Communication | Report back to the caller **only** | Teammates **message each other** directly |
| Coordination | Caller manages all work | **Shared task list**, self-coordination |
| You can talk to a worker mid-flight? | No | **Yes** — by name |
| Best for | A clean deliverable handed back | Work needing discussion, challenge, cross-talk |
| Token cost | Lower (result summarized back) | **Higher** (each teammate is a full instance) |

**Use a team** when workers need to share findings, challenge each other, and
converge — parallel review, competing-hypothesis debugging, a feature split
across disjoint files whose owners benefit from talking mid-flight.

**Use a subagent** (or a single session) when only the *result* matters and
there's no cross-talk — a focused build/verify hand-back — or when the work is
**sequential, dependency-heavy, or edits the same files** (teams can't help
there and cost more). Choosing the cheaper tool when it fits is part of running
teams well, not a fallback.

---

## 3. When a team earns its cost

**Strong fits:**
- **Research & review** — teammates investigate different aspects at once, then
  share and challenge findings (e.g. security / performance / test-coverage
  reviewers on one PR).
- **Debugging with competing hypotheses** — teammates test rival theories in
  parallel and *actively try to disprove each other*, then converge on the
  survivor. Beats sequential investigation, which anchors on the first theory.
- **New modules/features with disjoint file ownership** — each teammate owns a
  separate file set, coordinating through the task list and messages.
- **Cross-layer changes** — sim / render / UI / tests, one owner each.

**Not worth it** (single session or subagents instead): sequential chains,
same-file edits, routine/mechanical work where coordination overhead exceeds
the benefit. Teams cost **significantly more tokens** and add coordination
overhead; reach for one when parallel *exploration or discussion* adds real
value, not just to fan work out.

---

## 4. Enabling

Set the env var to `1`, in the shell **or** `settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Read at session startup** → only a **new session** picks it up; a running
session won't hot-reload it. Once enabled, spawning a teammate needs **no setup
step** and cleanup is **automatic** on session exit. (Pre-v2.1.178 required
`TeamCreate`/`TeamDelete` and a named team first — both tools are gone; any
`team_name` input is now accepted but ignored, and the team name is derived
from the session ID.)

---

## 5. Running a team

**Spawn** — describe the task and the teammates in natural language; the lead
spawns and coordinates. Claude may also *propose* a team for parallel-friendly
work — you always confirm first; it never spawns without approval.

```
Spawn three teammates to review PR #142: one on security, one on performance,
one on test coverage. Have them review, message each other to challenge
findings, and report. Call them sec, perf, and tests.
```

- **Name teammates** — the lead names them at spawn; *tell it what to call
  them* if you want to reference them later.
- **Models** — teammates **don't** inherit the lead's `/model` by default. Set
  **Default teammate model** in `/config` (or *Default (leader's model)*), or
  say it in the prompt (*"Use Sonnet for each teammate"*). A teammate's model &
  fast mode are **fixed at spawn** (`/model`, `/fast` only affect the lead).
- **Effort** — teammates **inherit the lead's effort level**; `/effort` applies
  to a viewed teammate's later turns.
- **Plan approval** (risky work) — *"Require plan approval before they make any
  changes."* The teammate plans in read-only mode; the **lead approves or
  rejects with feedback** (autonomously — steer it via your prompt, e.g. *"only
  approve plans with test coverage"*). Rejected → revise & resubmit.
- **Talk to a teammate directly** — in-process: agent panel below the prompt,
  ↑/↓ select, **Enter** open & message, **x** stop, **Ctrl+T** task list,
  **Esc** interrupt its turn. Split-pane: click its pane. (Plain text + skills
  go to the viewed teammate; built-in `/commands` still run in the lead.)
- **Shut down** — *"Ask the researcher teammate to shut down."* It approves
  (exits) or rejects with a reason; shared dirs clean up on session end.

**Display modes** (`teammateMode` in `~/.claude/settings.json` or
`--teammate-mode`): `"in-process"` (**default**, works anywhere) · `"auto"`
(split panes if already in tmux/iTerm2) · `"tmux"`/`"iterm2"` (force split
panes; needs tmux, or iTerm2 + the `it2` CLI with the Python API enabled).

---

## 6. Coordination mechanics

**Shared task list** — tasks are **pending → in progress → completed** and may
**depend** on others (a task with unmet deps can't be claimed; completing a
dependency auto-unblocks its dependents). The **lead assigns** to a named
teammate, or a teammate **self-claims** the next unblocked task after finishing
one. Claiming uses **file locking** to avoid races.

**Communication** — messages **deliver automatically** (no polling); a teammate
that finishes **notifies the lead**, and one that dies on an API error reports
the failure + error text (v2.1.198+). Message one teammate by name; to reach
everyone, send one message per recipient.

**Reusable roles via subagent definitions** — reference a subagent type from
any scope (*"Spawn a teammate using the `security-reviewer` agent type..."*).
The teammate honors that definition's `tools` allowlist and `model`, and its
body is **appended** to the teammate's system prompt. Team tools (`SendMessage`,
task management) are **always available** even if `tools` restricts others.
Caveat: a definition's `skills`/`mcpServers` frontmatter is **not** applied to a
teammate — teammates load skills/MCP from project & user settings.

**Permissions** — teammates **start with the lead's mode** (incl.
`--dangerously-skip-permissions`). Change an individual teammate's mode *after*
spawn (not per-teammate at spawn). A teammate **cannot approve prompts or relay
consent** — cross-agent `SendMessage` is treated as untrusted input, and
teammate permission prompts **bubble up to the lead**; approve them there.

**Context & tokens** — each teammate loads the same project context as a fresh
session (**CLAUDE.md**, MCP servers, skills) + the lead's spawn prompt, but
**not** the lead's chat history. Token usage scales with the number of active
teammates.

**Quality-gate hooks** — `TeammateIdle`, `TaskCreated`, `TaskCompleted`: exit
code **2** sends feedback and blocks the transition (keeps a teammate working /
prevents a bad task create/complete).

---

## 7. On-disk layout

Auto-generated at startup under a session-derived name (`session-` + first 8
chars of the session ID):

- **Team config:** `~/.claude/teams/{team-name}/config.json` — runtime state
  (session IDs, tmux pane IDs, a `members` array of name/agent-id/agent-type).
  **Removed when the session ends. Never hand-edit or pre-author** — overwritten
  on the next state update. Teammates may *read* it to discover peers.
- **Task list:** `~/.claude/tasks/{team-name}/` — **persists** locally (never
  uploaded); resumed sessions keep their tasks. Retention follows
  `cleanupPeriodDays`.

There is **no project-level team config**; a `.claude/teams/*.json` in the repo
is treated as an ordinary file, not configuration.

---

## 8. Best practices

- **Team size: start with 3–5.** Three focused teammates often beat five
  scattered ones; scale up only when work genuinely parallelizes.
- **~5–6 tasks per teammate** keeps everyone busy and lets the lead reassign if
  someone stalls (15 independent tasks → ~3 teammates).
- **Self-contained tasks** — a function, a test file, a review. Too small →
  coordination overhead wins; too large → long unchecked runs risk wasted work.
- **Give enough context in the spawn prompt** — teammates don't inherit chat
  history; include paths, constraints, stack facts, and the exact deliverable.
- **Disjoint file ownership** — two teammates editing one file overwrite each
  other. (In this repo, prefer additive modules per GDD §8.1 — same principle.)
- **Wait for teammates** — if the lead starts doing the work itself: *"Wait for
  your teammates to complete their tasks before proceeding."*
- **Monitor and steer** — read transcripts, redirect bad approaches, synthesize
  as findings arrive; don't let a team run unattended for long.
- **Start with research/review** before parallel *implementation* to learn the
  model.

---

## 9. Limitations (know these before relying on a team)

- **No session resumption with in-process teammates** — `/resume` and `/rewind`
  don't restore them; after resuming, the lead may message teammates that no
  longer exist (tell it to spawn new ones).
- **Task status can lag** — teammates sometimes don't mark tasks complete,
  blocking dependents; nudge or fix manually.
- **Shutdown can be slow** — a teammate finishes its current request/tool call
  first.
- **One team per session**, **no nested teams** (teammates can't spawn
  teammates), **lead is fixed** (no promotion/transfer of leadership).
- **No background subagents from in-process teammates** — their subagents run
  foreground; `run_in_background`/`background: true` errors.
- **Permissions set at spawn** (change individually after).
- **Split panes need tmux or iTerm2** — unsupported in VS Code's integrated
  terminal, Windows Terminal, and Ghostty; in-process works everywhere.

**Troubleshooting:** a vanished teammate row is *hidden after idle*, not stopped
(message it by name to restore it); too many permission prompts → pre-approve
common ops before spawning; a teammate stopped on an error → view it and give
instructions or spawn a replacement; lead quit early → tell it to keep going;
orphaned tmux → `tmux ls` then `tmux kill-session -t <name>`.

---

## 10. Enabling teams durably

Env vars in `settings.json` apply at **session start**, so you need a **new
session** — and *where* you put the setting decides whether a new session sees
it:

| Location | Tracked in git? | Survives a fresh remote clone / new session? |
|---|---|---|
| `.claude/settings.local.json` (project-local) | **No** (git-ignored) | **No** — a fresh clone won't contain it |
| `.claude/settings.json` (project, committed) | Yes | **Yes** — present in every clone |
| `~/.claude/settings.json` (user-level) | n/a | Only if that home dir persists across sessions |
| Environment / setup script (remote env config) | n/a | **Yes** — the durable option for cloud sessions |

- **Local CLI:** put it in `settings.local.json` (or your shell), then **exit
  and relaunch `claude`** — the running session won't hot-reload it.
- **Claude Code on the web / a remote execution environment** (each session
  clones the repo fresh): a git-ignored `settings.local.json` **won't be in the
  next clone**. Make it durable by **committing `.claude/settings.json`** with
  the `env` block, or setting the variable in the **environment configuration /
  setup script**. Then any new session in that environment starts with teams
  enabled.

---

## 11. Applying teams to *this* repo

We build a browser sim in additive modules (`world/`, `entities/`, `systems/`,
`render/`, `ui/`) with deterministic sim rules and two test suites
(`tools/run-tests.sh`, `tools/run-e2e.sh`). Natural team shapes:

- **Parallel PR / code review before a merge** — `correctness`, `perf`, and
  `sim-determinism` reviewers on the diff, challenging each other, lead
  synthesizes. (Beats one reviewer that fixates on a single issue class.)
- **Competing-hypothesis debugging** of a sim / pathfinding / water bug —
  several teammates test rival theories and try to disprove each other, updating
  a shared findings doc until a consensus root cause survives.
- **A cross-cutting feature** split by disjoint file ownership (data / sim /
  render / UI, one teammate each) where owners benefit from talking mid-flight.

Regardless of how work is parallelized, the project invariants still hold:
`config.js` owns all balance constants, the sim stays deterministic (one seeded
PRNG; no `Math.random` / wall-clock in sim code), prefer additive
self-contained modules, run **both** `tools/run-tests.sh` and
`tools/run-e2e.sh` before claiming a UI-touching change done, and always smoke
the packaged artifact before publishing.

---

## 12. This project's build-team protocol (in practice)

Learned running the Phase 4 wave-survival build team; follow it so a fresh
session coordinates the same way.

**Communication is a mesh, not a hub.** Per §1/§2, teammates are full sessions
that **message each other directly** — that cross-talk is the whole reason to
use a team over subagents. So do **not** route every message through the lead:

- **QA talks to devs directly.** When QA finds a defect it messages the owning
  teammate (by name — `SendMessage` resumes that teammate with its full
  context), they discuss/challenge it, and QA also notifies the lead. The lead
  does not have to be a relay.
- **Devs surface cross-team findings.** A teammate that spots a bug in another's
  file (e.g. Design diagnosing a guard gap in Systems' `spawn.js`) reports it;
  the **lead routes the fix to the owner** and **adjudicates disagreements**
  (owners sometimes push back — the lead makes the call against the contract).

**The lead is the integrator + gatekeeper, not a message bus:**

- **Owns `main.js` wiring and the merge.** No teammate edits `main.js`.
- **File-ownership = file boundaries.** No two teammates edit one file; the only
  shared surfaces are read interfaces (`world.js`) and `config.js` (Design-only,
  everyone else reads the contracted keys).
- **Teammates leave changes uncommitted.** The lead verifies each teammate's
  files (`node --check`, `run-tests.sh`, determinism), then **commits per
  verified slice** and pushes — converging the tree to clean commit-by-commit
  rather than one risky bulk commit. (This means the working tree is
  transiently dirty while teammates run — expected under the team model.)
- **Holds phase go/no-go.** Nothing is "phase done" until **QA signs off against
  the GDD exit criterion**.

**Interface contracts up front.** Before spawning, the lead freezes the
interfaces (public fields, new config keys, cross-boundary fields like
`game.priority`) in a contract doc so teammates build in parallel against the
same shape. Interface changes route through the lead for ratification.

**Spawn hygiene.** Name teammates `[Role]-[Model]-[Task]`; set each teammate's
model explicitly (they don't inherit the lead's); give each spawn prompt the
three things a fresh session needs — *what already exists in your module, the
interface contract, and exactly what's left to do* — plus the standing rule:
read the existing code before writing; extend and fix, don't rewrite working
systems; raise interface changes with the lead before touching a shared seam.

---

*Source: <https://code.claude.com/docs/en/agent-teams> (v2.1.178+) and its
linked settings, hooks, sub-agents, and costs pages.*
