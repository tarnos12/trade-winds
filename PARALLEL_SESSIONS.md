# Parallel Sessions — Coordination Protocol (Trade Winds)

Adapted from the central-dispatch protocol in
<https://raw.githubusercontent.com/tarnos12/claude-rules/master/templates/PARALLEL_SESSIONS.md>.
Include/keep this only while several Claude Code sessions run at once. Author is
Mariusz (GitHub `tarnos12`).

## Core principle

**Each session writes exactly ONE coordination file.** No two sessions ever
write the same file, so their pushes never collide. Task-tracking files live in
the repo alongside code; PRs are the integration mechanism and the manager is
the single integration point.

## Roles

### Manager — Session #1 (the coordinator)
- **Owns the board (`TASKS.md`).** No other session edits it.
- Assigns tasks, picks branch names, and writes each worker's assignment file
  (`TASK_<n>.md`).
- **Merges PRs one at a time** (rebase + resolve conflicts) into the default
  branch. Serial merging is the intentional bottleneck that keeps integration
  clean.
- Keeps the board current in the same commit as each merge.
- Resolves all cross-session conflicts.

### Workers — Sessions #2, #3, …
- Each reads/writes **only its own `TASK_<n>.md`** (never `TASKS.md`, never
  another worker's file).
- Builds the assigned task **on the branch #1 named**, opens a PR, updates its
  own `TASK_<n>.md` status, then waits for the next assignment.
- Never edits the shared board or another worker's files.

## Files

| File | Owner | Purpose |
|---|---|---|
| `TASKS.md` | Manager (#1) | The board: task list, status, assignments, branch names. |
| `TASK_2.md`, `TASK_3.md`, … | The matching worker | Per-worker assignment + status + message outbox. Manager writes the assignment; the worker updates status. |
| `PARALLEL_SESSIONS.md` | Manager (#1) | This protocol doc. |

## Assignment / message flow

Each `TASK_<n>.md` has two message areas so questions route through the manager
without shared-file conflicts:
- **Assignment / Inbox (manager writes):** the current task, branch name, notes.
- **Status / Outbox (worker writes):** progress, PR link, questions, blockers.

## Merge workflow (manager)

1. Worker opens a PR from its assigned branch.
2. Manager reviews, rebases onto the current default branch, resolves any
   conflicts, merges **one PR at a time**.
3. Manager updates `TASKS.md` (mark done, assign next) and the project
   `CLAUDE.md` "Current status" in the same commit as the merge.

## Current session assignments

- **Session #1 (this session):** Manager — task management, PR merging, conflict
  resolution. Working branch: `claude/markdown-task-management-docs-jytqr2`.
- **Sessions #2+:** unassigned. When one comes online, #1 creates its
  `TASK_<n>.md` and names its branch.
