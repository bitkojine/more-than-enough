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
- Before pushing: `npm ci && npm test`. After a change under `src/game/`, run
  `npm run test:e2e` too (unit tests don't load browser code); after a layout
  or text-length change, `npm run test:layout`.
- After a change under `src/core/`, run `node scripts/perfect-bench.mjs
  --check` (CI runs it and won't deploy if it fails). If Perfect got slower,
  re-learn with `scripts/perfect-tune.mjs` and record the score with
  `--write` (README, Tests).
- After pushing, check that every workflow for your commit passed, not only
  Pages. `live-check.yml` opens a `live-check` issue when something didn't
  deploy.

## Design rules

- Rules live in `src/core/` as pure functions: no DOM, no clocks, no
  randomness. The browser and the room service both run them.
- No tree cutting and no wood anywhere (ladders are steel). Mycelium takes
  wood's place.
- Nobody digs between layers. The surface and every mine layer connect only
  through generated ways up and down that players discover.
- Nobody cheats in a shared world, world owners included. The room's own copy
  of each player's progress is the truth (`server/src/shadow.js`).
- Worlds are kept (Watch, 2026-10-18): no change may reset or nuke anyone's
  world. Don't change world generation or bump `WORLD_FORMAT` in
  `src/core/format.js`; build new things on top of the land that's there
  (placing on existing tiles, player edits), and new save fields default when
  missing. Anything that would need a reset goes to Watch first.
- The game and the room service go live minutes apart. A wire change in
  `src/net/protocol.js` must work with the other side one version behind:
  add fields, tolerate missing or extra ones, and time out rather than wait
  forever.
- New things the player sees or presses go where `docs/ui.md` puts them.

## Where knowledge lives

| Kind | Place |
| --- | --- |
| What the game does | the code and its tests |
| Rules for players, every table and number | the wiki (`wiki/`), read live from `src/core/` |
| How it's built | `structurizr/workspace.dsl` |
| UI layout, the soundtrack | `docs/ui.md`, `docs/music.md` |
| Room service: protocol, security limits, audit log, admin routes | `server/README.md` |
| What changed and why | `CHANGELOG.md` and commit messages |
| Ideas nobody has committed to | the wiki's Ideas page (`wiki/ideas.js`) |
| Bugs and ideas to pick up | GitHub issues |

Plans, reports and progress notes don't go in the repo. When you change
behavior, update the doc that describes it in the same commit; when a doc
turns out wrong or dead, fix or delete it. `npm test` fails when a doc or the
architecture model names a file that doesn't exist.
