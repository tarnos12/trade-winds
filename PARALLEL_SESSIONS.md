# Parallel Work — In-Session Agent Team (Trade Winds)

How this project runs multi-part work: a single **manager session** (Session #1)
works on `main` and executes tasks through a team of **worktree-isolated
subagents it spawns** — not separate human-launched sessions. Author is Mariusz
(GitHub `tarnos12`). Canonical protocol:
<https://raw.githubusercontent.com/tarnos12/claude-rules/master/templates/PARALLEL_SESSIONS.md>.

## Model

- **Manager — Session #1 (this session):** works on `main` directly; is the sole
  committer to `main`. Owns the board ([TASKS.md](TASKS.md)) and the shared data
  contract. Splits a phase into non-overlapping slices, **spawns one subagent per
  slice**, integrates each result into `main` in a defined order, and resolves
  conflicts.
- **Workers = subagents:** spawned by the manager via the Agent tool with
  **`isolation: "worktree"`**, so each works on its own checkout and parallel
  edits to the single `index.html` don't collide. Each gets one task, builds it,
  runs its headless test / smoke check, and returns its diff + how-to-verify to
  the manager. Subagents are **ephemeral** — they live only for their task. There
  are no durable #2/#3/#4 sessions; "#2/#3/#4" now just label task slots.

## Why this model (vs separate real sessions)

One filesystem and one integrator means we can drop all the cross-session
machinery: **no `coordination` branch, no per-worker `TASK_<n>.md` files, no
one-file-per-session push-race rule.** Worktree isolation gives each parallel
subagent a clean separate working copy, and the manager drives the whole loop
end-to-end with no manual per-session prompting.

## Workflow

1. **Split & contract.** Manager breaks the phase into non-overlapping slices and
   writes a shared data contract in `TASKS.md` so the slices compose in the
   single file.
2. **Fan out.** Manager spawns one worktree-isolated subagent per slice, handing
   it its task spec (from `TASKS.md`) and the contract.
3. **Build & verify.** Each subagent builds in its worktree, runs the headless
   test / smoke check, and returns its diff + verification notes.
4. **Integrate.** Manager applies results to `main` in the stated **merge order**,
   runs the test suite after each, resolves `index.html` conflicts, and updates
   `TASKS.md` + the `CLAUDE.md` "Current status" in the same commit.

Serial integration into `main` is the one intentional bottleneck — the single
clean integration point.
