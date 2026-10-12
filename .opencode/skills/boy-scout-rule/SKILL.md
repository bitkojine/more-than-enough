---
name: Boy Scout Rule
description: Use when you touch existing code to fix a bug or add a feature. Apply the Boy Scout Rule — leave the file a little cleaner than you found it with tiny, safe, test-backed micro-refactors. Also use when asked to "do a boy scout cleanup" or "leave it better than you found it".
---

# Boy Scout Rule

"The Boy Scout Rule in programming means you should always leave the code a
little better than you found it."

Popularized by Robert C. Martin (Uncle Bob) in *Clean Code*, the rule adapts the
outdoor scouting motto: **"Leave the campsite cleaner than you found it."**
Instead of planning massive, separate rewrites that rarely get approved, you
make small, continuous, and safe improvements every time you touch a file or
fix a bug.

## Core idea

Small, continuous, safe improvements — not big rewrites. Do a little better in
every file you already have open.

## Workflow

1. **Finish the primary task first.** The Boy Scout cleanup is a rider on
   already-planned work, never a substitute for it. Do not let it derail the
   actual goal.
2. **Scan only the code you touched** (the file, function, or nearby block you
   already opened). Do not go hunting across the whole codebase.
3. **Find one to three *tiny* improvements**, e.g.:
   - Rename variables or functions that are confusing, vague, or single-lettered.
   - Delete dead code, unused variables/imports, or old commented-out blocks.
   - Extract repeated logic into a shared function (DRY).
   - Split an over-long function into smaller single-responsibility helpers.
   - Add a missing test for critical logic you are already inspecting.
4. **Keep it small.** A few minutes of work per task. If a cleanup would touch
   many files or change behavior, stop — it is out of scope; note it instead.
5. **Avoid yak shaving.** Never spiral into rewriting half the application when
   you came in to fix a single-line bug.
6. **Verify with tests.** Only refactor where a reliable test suite exists to
   catch regressions. Run it. If there is no coverage for the area you are
   about to change, add a test first or skip the refactor.
7. **Isolate the change.** Keep refactors separate from behavioral feature
   changes so review stays easy:
   - Prefer a separate commit for the cleanup.
   - If you must ship together, keep the cleanup clearly isolated and say so.
   - Refactors must be **behavior-preserving**; say "no behavior change"
     explicitly when that is the intent.
8. **Report it.** Summarize exactly what you cleaned up and confirm the tests
   still pass.

## Guardrails

- Tiny: a few minutes per task.
- No behavior change in a cleanup.
- Tests must exist and pass; otherwise skip or add coverage first.
- No yak shaving; no sweeping rewrites.
- If something larger needs fixing, leave a note / TODO — don't do it here.
