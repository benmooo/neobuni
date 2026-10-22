---
title: "Workbench"
---

# Workbench

This directory is the project's short-horizon context layer.

Use it to answer:

- What am I actively building right now?
- Why does it matter?
- What was the last completed step?
- What is the next exact step when I come back?

## Files

- `now.md`
  - Single source of truth for the current focus.
- `features/_template.md`
  - Template for feature-specific context notes.
- `features/<feature-slug>.md`
  - One note per active or recently paused feature.
- `archive/<feature-slug>.md`
  - Archived completed feature notes after cleanup.

## Workflow

When you start a feature:

1. Run `bun run wb:start <feature-slug> "<goal>"`
2. Or, if you are already on a feature branch, run `bun run wb:start "<goal>"`
3. Let the command create or update the feature note
4. Start implementation

When you pause work:

1. Run `bun run wb:checkpoint "<what changed>" "<next exact step>"`
2. Or use flags: `bun run wb:checkpoint --note "<what changed>" --next "<next exact step>"`
3. Let the command update `now.md` and the active feature note
4. Add `TODO(resume): ...` near any half-finished code path

When you come back:

1. Run `bun run wb:list` to see recent feature notes and statuses
2. Run `bun run wb:open <feature-slug>` if you want to inspect a specific note
3. Or run `bun run wb:open` to open the active feature, or the latest updated one
4. Run `bun run wb:resume`
5. Read `docs/workbench/now.md`
6. Open the active feature note
7. Start from `Next Exact Step`
8. If needed, run the commands listed in the note

When you finish a feature:

1. Run `bun run wb:done "<what finished>" "<optional next thing>"`
2. Let the command mark the feature as done
3. Let the command clear `now.md` back to no active feature

When you want a fast timeline:

1. Run `bun run wb:recent`
2. Or `bun run wb:recent 20` for a larger window
3. Read recent checkpoints and completion events across current and archived notes

When workbench notes pile up:

1. Run `bun run wb:clean`
2. Let the command move completed notes from `features/` to `archive/`
3. Keep active or paused notes in `features/`

When you need an archived feature again:

1. Run `bun run wb:restore <feature-slug>`
2. Let the command move the note back into `features/`
3. Let the command reactivate it in `now.md`

## Rule

If a note does not contain `Why`, `Last Done`, and `Next Exact Step`, it is not useful enough to restore context quickly.

`Progress` is optional and should be task-specific.
Do not keep a generic default checklist in feature notes because it creates misleading resume context.
