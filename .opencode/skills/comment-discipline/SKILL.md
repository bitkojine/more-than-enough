---
name: Comment Discipline
description: Use when writing, editing, reviewing, or deleting comments in code. Keep comments only where they carry information that code, naming, types, tests or structure cannot; keep invariant and workaround-why comments; never strip comments indiscriminately. Also use when a cleanup might remove a comment, when asked "should this comment stay?", or when comment style comes up in review.
---

# Comment discipline

> "Write comments only when they communicate information that cannot be
> expressed clearly through code, naming, types, tests, or structure. Prefer no
> comment over a redundant one. Every comment must justify its ongoing
> maintenance cost. Keep essential explanations of non-obvious constraints and
> invariants.
>
> One important qualification: removing comments indiscriminately is not the
> goal. A comment explaining why a workaround exists may be more valuable than
> the code itself, particularly when a future agent is likely to remove that
> workaround without understanding its purpose. The objective is not fewer
> comments at any cost. It is less duplicated information and less knowledge
> lost during future changes."

## Core idea

Less duplicated information and less lost knowledge — **not** fewer comments.
There are two real failure modes: comments that rot and lie, and deleted
comments whose absence costs a future change hours of archaeology. Aim at the
first without causing the second.

## A comment earns its place when it says

- **Why a workaround exists** — the quirk being worked around, the bug being
  avoided, the constraint that forced the odd shape. These are the most
  valuable comments in a codebase: a future agent (or future you) is most
  likely to rewrite the code around them without knowing why it looks like
  that.
- **An invariant the code can't state** — what must stay true across functions
  or services, what a frozen format or protocol rule forbids, what a test
  elsewhere guarantees, who the source of truth is.
- **A pointer to the single source** — where the same fact lives in a doc,
  test, or table elsewhere: name the source, don't re-copy the content.

## A comment doesn't earn its place when it

- Restates the line it sits above — naming, types, or structure already say it.
- Duplicates a doc, table, or test that is the real source: keep one copy,
  prefer the pointer.
- Narrates what the next few statements plainly do.
- Describes a situation the code no longer has (stale): fix it or delete it.

## Workflow

1. **Writing new code**: default to no comment. Ask "could a better name, a
   type, or a test say this?" — if yes, do that instead; those can't rot.
2. **Editing existing code**: keep every why / invariant / workaround comment,
   updating it when your change touches what it explains. Shrink or remove
   comments your change has made redundant (the code now says it clearly).
3. **Never delete a workaround comment without moving its knowledge** — into
   the shape of the code, a test, or the doc updated in the same change.
   Keeping a "redundant-looking" comment is far cheaper than losing the
   invariant it guards.
4. **Comment and code disagree**: code plus tests are the truth — fix the
   comment, or delete it if it no longer tells a why.
5. **When judging one in review**: does it answer something the code can't?
   "Why is this here / why not the obvious way / what must never change here"
   → keep. "What this does" → the code should say it.

## Guardrails

- Every comment must justify its ongoing maintenance cost; if you can't name
  the knowledge it carries, it is a candidate for rewriting or pointing at a
  source — not automatically for deletion.
- Prefer no comment over a redundant one, but prefer a kept why over a tidy
  void.
- Never a blind comment purge: removals are as considered as additions.
- Success is a file where every comment is true, single-sourced, and
  load-bearing — not a file with the fewest comments.
