# Working on MORE THAN ENOUGH

Rules every contributor (human or agent) follows. The README explains the
project and its own rules (languages, device text, texture packs, versioning,
tests); this file adds what isn't written anywhere else and says where each
kind of knowledge lives.

## Shipping

- Work lands straight on `main`: every push deploys the game (`pages.yml`)
  and, when it touches `server/`, `src/net/`, `src/core/` or `src/i18n/`, the
  room service (`rooms.yml`). Rebase on `origin/main` first; other people push
  at the same time.
- Each release bumps `VERSION` in `src/version.js`, adds a `CHANGELOG.md`
  entry, and adds its version to `NEWS` in `src/game/news.js` with player
  notes as `news.<version>` in `src/i18n/en.js` and `lt.js`. On a version
  clash after a rebase take the next free number and keep both entries.
- Before pushing: `npm run check`. It runs what CI will (so a red deploy is
  caught here instead of after a push): `npm test` and the Perfect benchmark
  when the rules or the brain changed, then stages the site the way the
  deploy does. `npm run check -- quick` skips the benchmark. Two checks are
  run by hand, not in the gate, because each takes minutes and is not what
  usually breaks a push: `npm run test:layout` after a layout or text-length
  change, and `npm run test:e2e` after a change under `src/game/` (unit tests
  don't load browser code). The e2e suite plays in a randomly seeded world, so
  a failure there means "re-run and look", not "CI would have caught it".
- `test/property/` searches for rule breaks that the example tests in
  `test/unit/` didn't happen to try: it plays thousands of random legal games
  and holds every invariant in `test/property/invariants.js` after each step.
  Add an invariant when you add a rule the code must never break, and use `npm run test:extended` (or a specific seed it prints) for the
  explicit long sweep of arithmetic, saves or shared-world round-trips.
  Local feedback uses 12 seeds per family; the 1,500-seed sweep runs separately
  in CI and manually, never as a prerequisite for interactive iteration.
- CI runs `node scripts/perfect-bench.mjs --check` after core changes and
  will not deploy if it fails. Run it locally explicitly when needed. Completion
  and behavior checks always apply; timing regression checks apply only when
  canonical rules match the baseline fingerprint. Faster wins pass. Review
  intentional balance changes before recording a new reference with `--write`
  (README, Tests). Never stretch duration merely to hit the future forty-hour goal.
- After pushing, check that every workflow for your commit passed, not only
  Pages. `live-check.yml` opens a `live-check` issue when something didn't
  deploy.

## Design rules

- Evolve the existing game's universe, artwork, character, renderer, movement
  and controls. Integrate the resource/cultivation redesign into that game;
  do not replace it with a new client/world or separate playable prototypes.
- Confirmed design decisions and open questions live in `docs/game-design.md`.


- Use white chalk drawing accents where useful, especially construction and
  planning overlays. Preserve resource identity, readable text, non-color status
  cues and contrast on bright terrain. Prefer stable, inexpensive vector marks.

- New worlds start empty-handed; only knowledge and records carry over.
  Existing worlds retain their earned equipment and progress.
- Every purchase and every upgrade level needs a distinct physical identity:
  equipment the character uses or a real structure/visible structural upgrade.
  No new abstract buffs or paid menu permissions. Legacy systems are being
  replaced incrementally; do not strip earned legacy progress.

- Rules live in `src/core/` as pure functions: no DOM, no clocks, no
  randomness. The browser and the room service both run them.
- No tree cutting and no wood anywhere (ladders are steel). Mycelium takes
  wood's place.
- Nobody digs between layers. The surface and every mine layer connect only
  through generated ways up and down that players discover.
- Nobody cheats in a shared world, world owners included. The room's own copy
  of each player's progress is the truth (`server/src/shadow.js`).
- **Time away makes nothing** (Watch, 2026-10-21, "freeze season"): a game
  that isn't the active screen is time away, and time away is worth nothing,
  in solo and shared worlds alike. It lives in one place, `FREEZE_AWAY` in
  `src/core/content.js`, and a player may turn their own back on
  (`src/game/storage.js` keeps the choice; the room is told of it when they
  join). Temporary: it may be lifted, and then `FREEZE_AWAY` goes false.
- **Every world is kept, forever** (Watch, 2026-10-18): never reset, nuke or
  delete a solo or shared world. `WORLD_FORMAT` and `ECON_FORMAT` in
  `src/core/format.js` are frozen; never bump them (`test/unit/worlds-kept.test.js`
  fails if they move, and never loosen that test). A change to world
  generation must fit worlds already played: touch only land nobody has
  generated yet, or keep the new thing in saved edits. Saves always load;
  anything that could lose a world needs Watch's word first.
- The game and the room service go live minutes apart. A wire change in
  `src/net/protocol.js` must work with the other side one version behind:
  add fields, tolerate missing or extra ones, and time out rather than wait
  forever.
- New things the player sees or presses go where `docs/ui.md` puts them.

## Where knowledge lives

| Kind | Place |
| --- | --- |
| Confirmed design and open questions | `docs/game-design.md` |
| What the game does | the code and its tests |
| Rules for players, every table and number | the wiki (`wiki/`), read live from `src/core/` |
| How it's built | `structurizr/workspace.dsl` |
| UI layout, the soundtrack | `docs/ui.md`, `docs/music.md` |
| Room service: protocol, security limits, audit log, admin routes | `server/README.md` |
| What changed and why | `CHANGELOG.md` and commit messages |
| Ideas nobody has committed to | the wiki's Ideas page (`wiki/ideas.js`) |
| Bugs and ideas to pick up | GitHub issues |

The owner-requested Game Design Document lives in the repo. Other plans, reports and progress notes do not. When you change
behavior, update the doc that describes it in the same commit; when a doc
turns out wrong or dead, fix or delete it. `npm test` fails when a doc or the
architecture model names a file that doesn't exist.
