# MORE THAN ENOUGH

A mobile-first browser game about turning a wilderness into a settlement.
The familiar artwork, character, endless layered world and controls now support
an underground restoration chapter: start empty-handed, gather surface mycelium
and stone, mine metal below, and cultivate living crystal in dark cooled chambers.
Build protected storage/transport and restore the first section of a dormant
machine. The full restoration and ending are still in development.

The normal URL opens the game. Existing saved
worlds keep their terrain, earned progress and earlier economy. Settings → Nerds
can start another archived solo world. AUTO and multiplayer have not yet been
adapted to new-world cultivation. See [the GDD](docs/game-design.md) for confirmed
choices and the current implementation boundary.

## How to launch

**Play it live:** the game is deployed to GitHub Pages at its own domain —
every push to `main` rebuilds it automatically:

**https://play.robertasrudys.com/**

(The old address, bitkojine.github.io/more-than-enough/, redirects there. The
game has an origin of its own, so nothing else on bitkojine.github.io can read
players' keys or saves; the room service accepts only this origin.)

Or serve the folder yourself. The game is plain HTML/CSS and JavaScript
modules with no runtime dependencies and no build step, so `index.html` just
needs a static host. (The deploy bundles and minifies a copy for players with
esbuild, the one dev dependency: `npm ci` before `npm test` or `npm run stage`.)

```sh
cd more-than-enough
npm run serve        # same as: python3 -m http.server 8000
```

Then open **http://localhost:8000** (or your machine's LAN IP) in Mobile Safari
or any browser. Progress saves automatically to `localStorage` (per browser —
on the Pages site, saves live in that browser for that origin).

> Browsers don't load JavaScript modules from `file://` pages, so use the local
> server (or any static host) rather than double-clicking the file.

## How to play

Figure it out by playing. The game never explains itself: there's no tutorial,
no prompts and no instructions on screen.

Everything is documented in the **[wiki](https://play.robertasrudys.com/wiki/)**
(`wiki/` in this repo, linked from the sheet in-game): controls, the world, the
mine, buildings, every upgrade table, the prestige loop and the milestones. Its
tables and figures are read live from `src/core/`, so they always match the
game they ship with.

**Design rule:** almost nothing to read in-game. Labels, names, numbers and
prices are fine, and so is a one-line hint where playtests showed players get
stuck (why a building can't go here, that holding Gather keeps going);
sentences that teach belong in the wiki. When you add or
change a mechanic, update the wiki article that covers it.

**Scale rule:** every tile (block) is 1 m × 1 m × 1 m. Any distance shown
to the player is tiles counted as metres, kilometres from 1 km
(`distance()` in `src/i18n/i18n.js`).

The wiki's **Ideas** page (`wiki/ideas.js`) is a sketchbook of directions the
game could take: looks, mechanics, big swings. Add ideas freely; when one
ships, move it out of Ideas and into the article that documents it.

## Languages

The game and the wiki speak **English and Lithuanian**, every word of both,
and the player can switch at any time (**Language** at the bottom of the
sheet, or in the wiki's sidebar). The choice is kept in the browser; until one
is made, the browser's own language decides, else English. `?lang=lt` in the
address picks one too.

**Rule: code never writes player-facing text.** It asks for it by key with
`t('key')` from `src/i18n/i18n.js`, and every key lives in both dictionaries:
`src/i18n/en.js` and `src/i18n/lt.js` for the game, `wiki/i18n/en.js` and
`wiki/i18n/lt.js` for the wiki (its articles are HTML strings there). When
you add or change any text, write it in both languages in the same commit.

**Text also fits what you play on.** The game knows whether you're on a phone
(a touch screen) or a laptop (a mouse or trackpad; `DEVICE` in
`src/i18n/i18n.js`, `?device=phone` or `?device=laptop` in the address to
try the other). Anything that differs is written as a choice,
`{phone:tap|laptop:click}` or `on this {phone:phone|laptop:computer}`, and
`t()` keeps only the part for this device. Your character holds the same
device.

Nothing can go untranslated quietly:

- `npm test` (`test/unit/i18n.test.js`) fails if a key is missing from either
  language, if placeholders or plural forms differ, if the code asks for a key
  no dictionary has, if a string literal in `src/` or `wiki/` reads like words
  instead of going through `t()`, or if a page's markup holds words of its own
  (static text uses `data-i18n="key"` and `data-i18n-<attribute>="key"`), or
  if a word that fits only one device ("tap", "click", "phone", "keyboard",
  "bakstelk", "telefone") stands outside a `{phone:…|laptop:…}` choice. A
  line holding text no player reads (a developer error, a CSS value) opts out
  with a trailing `// i18n-ok: <why>`.
- At runtime, `t()` throws on a missing key or a missing placeholder value,
  so the crash screen names it.

Switching language saves the game and reloads the page in the new language,
so names built into the content tables at load are always in one language.

## Texture packs

The game defines what exists and what it does; a **texture pack** defines what
it looks like. `src/core/catalog.js` lists every thing in the game (tiles,
resources, buildings, the wanderer, buttons, upgrades, colours) with the
slots a pack can fill, and `packs/default/` (Lanternlight) draws all of it as
hand-written SVG. Players load their own pack from the sheet (Textures); the
format is documented in the wiki's **Texture packs** article, and **Everything
in the game** lists the catalog with its default pictures.

Drawing code never names a file or a colour: it asks the look
(`src/game/look/`) for a thing's picture by id. When you add something that
can be seen, add it to the catalog and draw it in the default pack; the unit
tests fail until the default pack is complete, and flag pictures nothing uses.
No emoji: every icon comes from the pack.

## Versioning

Settings (the gear, top-right), then Nerds, shows the studio and exact
version you're playing — `byrforr · vX.Y.Z` (SemVer). The single source of truth is
`src/version.js`; see `CHANGELOG.md` for the history.

- **0.x dev line** — pre-1.0.0. Reaching 1.0.0 is intentionally a long
  road; there is no rush to get there.
- PATCH bumps = bug fixes, MINOR bumps = new features. Neither ever loses a
  world: **every solo and shared world is kept**. `WORLD_FORMAT` in
  `src/core/format.js` is frozen and there is no nuke any more (since
  v0.117.0); a change must fit the worlds already played.
- After each minor (or any notable) change, bump `VERSION` in
  `src/version.js`, update `CHANGELOG.md`, add the player's notes for it (see
  below), and commit.

Deploys cache-bust automatically: `scripts/stage-site.sh` (run by the Pages
workflow, or `npm run stage` locally) appends a hash of the source tree as
`?v=` to the stylesheet, the entry module, every module import, the icons and
the manifest, so GitHub Pages' 10-minute cache can't serve a stale mix of
modules to returning players, and Safari (which caches icons per host)
fetches this game's icon afresh.
You don't need to change asset URLs by hand — just push.

Players never run an old version: the staged site also has a `build.json`
naming that hash, and the game (`src/game/update.js`) checks it on start, every
minute, when it comes back into view or online, and when a friend joins a
shared world. When it differs from the hash on the game's own modules, the
game saves and reloads at once, without asking. Nothing pops up: the version
number, always on screen under the gear, rolls over to the new one and keeps a
dot until the player taps it to read what's new since the version they were on. So each release also adds its version to `NEWS`
in `src/game/news.js` and its player-facing notes as `news.<version>` in
`src/i18n/en.js` and `lt.js` (`npm test` fails otherwise).

## Files

- `src/core/` — the game rules: pure, deterministic, no DOM (runs in Node too)
  - `coords.js` — the `(x, y, z)` coordinate system: the forest is `z = 0`, mine layers are below
  - `tiles.js` — tile types and their rules as data (`TILE_INFO`)
  - `terrain.js`, `noise.js`, `world.js` — chunked, endless, layered world generation and edits
  - `regions.js` — the big named regions the surface is split into, their kinds of land and borders
  - `content.js` — every tuning number and content table (tools, extractors, refineries, perks)
  - `economy.js`, `upgrades.js` — costs, multipliers, and the single registry of everything you can buy
  - `actions.js`, `underground.js`, `sim.js` — gathering/digging/building, moving between layers, the per-tick simulation
  - `perfect.js`, `paths.js` — Auto-play's brain (the AUTO button, `perfect` in the code): the next thing to do (walk, gather, collect, buy, build, go down or up, wait), from what you've explored, and routes across a layer
  - `state.js`, `goals.js`, `save.js` — the state object, prestige, milestones, save format and validation
  - `catalog.js` — everything that exists, by the id a texture pack uses for it
  - `stockpile.js` — what you own as piles on home ground, on a log scale (one pile per unit of the two leading digits, a fixed block of slots per resource)
  - `mushrooms.js` — the kinds of mushroom, where each grows, and which one a tile holds
  - `shared.js` — a shared world: splitting a state into the world and your own progress, applying friends' edits and the room's corrections
  - `acts.js`, `replay.js` — in a shared world, what the player did, written down, and the room doing the same with the same rules (`server/src/shadow.js`), so the room knows what everyone really has
- `src/i18n/` — every word the player reads: `i18n.js` (`t()`, language choice, `data-i18n` markup) and the `en.js` / `lt.js` dictionaries
- `src/game/` — the browser layer
  - `main.js` — entry point and frame loop; `controller.js` applies player intents to the core; `perfect.js` — the AUTO button (Auto-play), carrying out the brain's intents while held
  - `input.js`, `camera.js` — touch/keyboard to intents; world (x, y, height) ↔ screen, with zoom and a fixed slight lean; picking hits the block you see
  - `render/`, `effects.js`, `hud.js`, `sheet.js` (`fresh.js`: when Build and Upgrade say NEW), `audio.js`, `storage.js`, `fork.js`, `ask.js`
  - `look/` — loading, checking and drawing texture packs; `textures.js` — picking, remembering and reporting packs in the game
  - `music/` — the soundtrack: composed tracks (`score.js`), the synthesized band, and the player that follows you from place to place (see [docs/music.md](docs/music.md))
  - `yard.js` — keeps the stockpile's piles in step with the inventory: they grow, slide, merge 2048-style and puff as it changes
  - `together.js` — playing together: the room connection, friends and their states, the QR sign; `worlds.js` — the worlds you've been in and switching between them; `players.js` — the friend chips and the Players screen
  - `update.js`, `news.js` — the self-update on every deploy, the version badge and the What's new changelog
- `src/net/` — the multiplayer wire format and its checks (`protocol.js`, shared with the room service) and where the service runs (`config.js`)
- `src/vendor/` — other people's code, copied unchanged (the QR code generator)
- `server/` — the room service for playing together: a Cloudflare Worker with a Durable Object per shared world (see [`server/README.md`](server/README.md))
- `index.html`, `style.css` — shell and mobile-first styling
- `packs/default/` — Lanternlight, the default texture pack (`pack.json` + SVG pictures)
- `wiki/` — the player wiki (`index.html` is the shell, the articles are in `i18n/en.js` and `i18n/lt.js`, `wiki.js` fills them in and renders tables from the core, `ideas.js` holds the Ideas sketchbook, `textures.js` the catalog page and pack download)
- `docs/ui.md` — the UI system: where the HUD, thumb cluster, sheets and dialogs go, and why; `docs/music.md` — the soundtrack
- `test/unit/` — Node `node:test` suites for the core, the wire format and the room service's rules
- `test/property/` — property tests: random legal play, checked against the
  rules the game must never break (`invariants.js`), 12 seeds per family by
  default and 1,500 in the explicit extended sweep; a failure prints the seed it replays from (`PROP_SEEDS=<seed> npm test`)
- `test/browser.e2e.js` — headless-Chrome end-to-end test (serves the real
  page, drives touch/keyboard/DOM, checks persistence)
- `scripts/stage-site.sh` — stages the deployable site (game + wiki) with cache-busted URLs
- `structurizr/` — architecture as code: the C4 model
  ([`workspace.dsl`](structurizr/workspace.dsl)) is the single source of truth,
  with committed [Mermaid diagrams](structurizr/diagrams/) rendered straight
  from it. See [`structurizr/README.md`](structurizr/README.md) for the model,
  the production split (`src/core/` = pure simulation, `src/game/` =
  presentation), and the validate/re-export workflow for agents.

## Tests

```sh
npm test            # node:test over test/unit/ and test/property/ — world layers, actions, economy, saves, bot playthroughs, translations, and the game's invariants under random play
npm run test:extended # explicit 1,500-seed property sweep; also runs in background CI
npm run test:scaling # bounded engine correctness and operation-count checks; no long-world runs
npm run test:e2e    # real Chrome: boot, render, touch/keyboard, gather, dig, upgrade, build, reload-save
npm run test:layout # real Chrome: every screen at 12 sizes in both languages (see docs/ui.md)
node scripts/perfect-bench.mjs --check  # the Perfect button, held to Embark on 4 worlds, against its baseline
```

`node scripts/scaling-bench.mjs` measures bounded algorithm kernels with up to
10,000 buildings and reports operation counts. Its forty-hour time horizon is
an arithmetic query, not a completed game. The event-time solo hauling economy
uses cumulative production and cached rates/counts instead of building updates
on every tick. The shared browser/AUTO engine enables it after Logistics,
normalizing saved output first. It settles income at commands and observations;
visual feedback queries nearby buildings only. Direct variable-step core and
shared-world replay callers retain the legacy economy. Production uses
cumulative arithmetic rather than repeated frame-sized floating additions.
The scheduler coalesces stationary ticks ending at AUTO and goal deadlines,
keeping individual ticks for movement, external callbacks, feedback and first
Embark eligibility. Battery accounting preserves daylight transitions when
batching. `node scripts/engine-bench.mjs --save <fixture.json> --ticks 3600`
compares actual AUTO command times and complete state with and without
coalescing; it stops at a one-second per-sample budget rather than running an
unexpectedly slow workload. No end-to-end speedup is established by kernel or
short-fixture benchmarks.
Existing saves and world formats are retained. A bounded real-browser check is
available with `MTE_ENGINE_ONLY=1 npm run test:e2e`; its constructed Logistics
fixture is separate from fresh-world AUTO evaluations.

The Perfect button's score is the median hours of play, held from spawn, until
Embark opens. `scripts/perfect-bench.mjs` measures it (and how the brain
behaves: refused acts, stuck steps, waiting, quick pops down a ladder);
`--check` fails when a seed does not finish or breaks a behavior rule. Completion
hours are balance data. A slowdown over 2% also fails when the canonical rules
match the baseline fingerprint; faster wins pass. When rules change, the old
completion-time target is informational, while completion and behavior remain
mandatory. After reviewing a rules change, record its reference with
`perfect-bench.mjs --write`. Do not tune away intended balance changes merely
to match an old duration. The current goal is meaningful, well-paced gameplay;
forty hours is a future content goal, never a reason to inflate prices or wait times.

For evaluation on fresh worlds, run `node scripts/playtest.mjs`. Each batch
plays four cryptographically random, nonzero 32-bit seeds with the shipped
AUTO strategy frozen, starting with no carried perks or progress. Winning
means first Embark eligibility. `--worlds 8 --jobs 4 --hours 60` controls the
batch size, parallelism and per-world simulation limit; `--batches 0` keeps
playing new batches until stopped. The default is one batch.

The runner presses AUTO once and holds it, driving the actual
`src/game/perfect.js` handler and `src/game/controller.js` through the same
`src/engine/simulation.js` used by the browser. Gameplay advances at 60 fixed
simulation ticks per game second, independently of drawing. Headless runs
advance ticks directly without waiting for a display or wall clock; there is
no bot FPS setting. The runner never chooses custom actions or grants progress.
AUTO plans from explored terrain, remembered observations, visible mine glints,
its own resources and public rules. Unknown underground rock has a uniform
assumed digging cost; it is not inspected to choose a route. Unseen chargers,
shore terrain, ladders and tunnel props cannot steer decisions. The fairness
checks change hidden world information while preserving observations and
require unchanged decisions or plans.
Rendering, sound and persistence are stubbed; `npm run test:e2e` separately
verifies real button input in Chrome. The older fixed-seed benchmark uses its
original core-action helper for regression comparisons; its timings are not
interchangeable with these AUTO/controller runs.

For a repeatable production-component CPU benchmark, run
`node scripts/simulation-bench.mjs` (optionally `--save <playtest-result.json>`).
It compares against the scalar reference and requires exact saved-state and
unrounded building-buffer parity. Its speedup is for production alone, not
an end-to-end world win.
Timeouts and refused AUTO actions are saved and make the command exit with
a failure status; later batches still run so one failure does not hide others.
The saved diagnostics separate movement, blocked movement, charging, waiting
and other work. Hourly checkpoints and the longest slow episodes show where
time went. Five minutes with no resources earned, finds, buildings, new
exploration or charging ends a stalled run with the failure save and recent
actions retained. Movement through already explored land alone is not progress.
Stalls also fail the command. Short exploratory runs with a deliberately small
`--hours` limit produce expected timeouts, not completed-world validation.
The separate movement-loop check ignores passive income, so pacing around a
small area for five minutes without gathering, exploring, buying, building
or changing layers fails even when the Abundance Engine keeps paying. Hourly
checkpoints are also saved while a world is running, for live diagnosis.
For an isolated browser smoke that only holds AUTO on a fresh world, run
`MTE_AUTO_ONLY=1 npm run test:e2e`. It checks real pointer input, automatic
walking and gathering, and stopping on release without editing game state;
it does not wait 40 real hours for a browser win.

Seeds are reserved before play in ../.mte-playtests/seeds/, outside the
checkout. Keep this directory across runs (or use `--state <shared-directory>`)
to prevent reuse, including after interrupted games. The known benchmark and
tuning seeds are excluded. Earlier unrecorded random worlds cannot be ruled
out; sharing the ledger is required across machines. Each completed world
saves its seed, result, source fingerprint, commit and frozen knobs immediately.
Results show fastest, median and slowest winning times, timeouts, and wins
under 40 hours. These are simulated foreground hours, including walking and
waiting; offline production is never called. They do not measure human input
hours or prove an optimal strategy. Keep evaluation separate from tuning:
do not feed these worlds into `perfect-tune.mjs` or select knobs on their scores;
evaluate any revised strategy on another fresh batch. The fixed-seed CI
benchmark remains a regression check.

Node: always the latest LTS, locally and in CI. `.nvmrc` says `lts/*`; CI
reads it with `check-latest`, and locally `fnm` (or `nvm`) picks it up from the
same file.

CI runs `npm test` on every push and pull request, and the Perfect benchmark
when `src/core/` changed, and only deploys `main` when both pass. Both deploy workflows (`pages.yml` for the game, `rooms.yml` for
the room service) set up through one shared step, `.github/actions/setup`, so
they can't drift apart. `live-check.yml` runs after every deploy and hourly:
`scripts/live-check.mjs` fails if any workflow's latest run on `main` failed,
the site's `build.json` isn't main's build, or the room service isn't running
main's newest room commit (it names its commit at `/`), each after a 30-minute
grace. While it fails, one open issue labelled `live-check` says what; it
closes itself once all is well. The browser test looks for Chrome at the standard macOS path
or `google-chrome` elsewhere; set `CHROME_PATH` to point it at another browser.

The browser tests launch their own local server and headless Chrome. On
macOS, run them from Terminal: Chrome aborts inside a sandboxed agent shell
(the test detects that and stops).

## Icons

The logo is two glowcaps (the game grows mushrooms and never cuts trees).
`icons/icon.svg` is the favicon and the app icon; `icons/icon-full.svg` is the
same art edge to edge for iOS and Android, which crop icons to their own
shape; `icons/social.svg` is the picture a shared link shows. `sh scripts/icons.sh` renders the PNGs from them (needs `rsvg-convert`).
`manifest.webmanifest` lets the game be added to a home screen and open
full screen.

## License

MIT, see [LICENSE](LICENSE). Fork it, change it, ship your own version.

AUTO goal selection compares required upgrades with building acquisition plus
repayment time, valuing each input using current production and accessible
hand gathering. Mining estimates include income earned during travel and digging
and the return to the surface. Find selection uses visible or remembered glints
that supply a resource still needed by the current goal. These are estimates,
not a guarantee of the optimal strategy.

AUTO defaults to minimum mining: if surface gathering or production provides
a finite route to its current price, it stays above ground (or returns there).
Known caves remain a fallback when a needed resource is otherwise unavailable.

For interactive feedback use `npm run check`; it skips the long AUTO
baseline benchmark. `npm run check -- full` includes that benchmark explicitly. Extended property checks run separately in CI and with
`npm run test:extended`, without holding up deployment. The first-load budget
is 215 KB gzipped for the shared clock, indexed searches and cumulative economy
(previously 210 KB); the release currently measures about 213 KB.

Visibility updates compare exact per-row circle intervals with the previous
observation, visiting only newly covered edges during movement: O(radius +
newly covered tiles) instead of O(radius²) per movement tick. Fog replacement,
layer changes and reset discoveries invalidate this derived cache. Charger
candidates are cached per player tile and prop mutation epoch, then checked
against exact distance and current daylight. Plain Map fixtures retain a full
query fallback; saves still contain ordinary prop entries. Resource settlement
batches continuous streams and publishes manual changes only for the affected
resource while retaining the same accounting order.

Fair play uses camera-independent player knowledge: explored terrain (including
what the player can inspect on the map), remembered observations, glints within
the normal game range, the player's own progress and public rules. It does not
mean recognizing pixels only in the current viewport. AUTO may calculate and
remember precisely; hidden terrain or unseen world objects must not steer it.
Charger physics still applies normally, including an unseen wheel charging the
battery; AUTO must base its decision to wait on its selected known charger.
Manual Gather and held tiles use the same quarter-second cadence as AUTO.
Blocked pointer input is rejected, and modal UI stops an AUTO-owned walk without
cancelling a later manual destination. `MTE_FAIR_ONLY=1 npm run test:e2e` checks
those controls in the real browser separately from AUTO-only evaluation.

Fresh evaluation fingerprints the browser input/host, controller, AUTO, engine,
core and runner sources. It checks that fingerprint before starting each world
and when each world finishes. Source-changed runs keep their full world and
result but are excluded from wins and speed statistics; no further worlds start
once a change is detected. This is a development integrity guard, not an
attestation against malicious changes that are reverted between checks.

For live visual inspection, open Settings → Nerds → Super-speed AUTO, or open
`?autoplay`. The developer viewer uses `src/game/autoplay-session.js`, the same
shipped AUTO/controller/shared-engine session as fresh evaluation. It renders
the game client between bounded work slices, offers speed and pause controls,
and stops at first Embark eligibility. Worlds are retained in a separate
IndexedDB archive and can be downloaded as ordinary world backups; normal
player saves and shared rooms are untouched. Seeds are reserved uniquely in
that browser archive, not globally across machines or the CLI ledger. No
offline income is used. Run `MTE_LAB_ONLY=1 npm run test:e2e` for the focused
viewer test, including a complete fresh AUTO-only win.

Observed surface indexes also retain masks for one or two remaining resource
units. Known depletion updates only the affected cell when a reserve boundary
is crossed; exhausted chunks disappear from the corresponding query index.
This preserves nearest-target ordering while avoiding repeated predicate work
over depleted areas. Milestone predicates explicitly mark income dependencies,
so purchase-only checks do not force production observations. The developer
viewer's `autoplay-lab.css` is loaded lazily with the same build identity as its
module; developer-only labels also load lazily, leaving the normal first-load
budget unchanged.

Fresh-world cultivation playtest (bounded, manual strategy through canonical
player actions; legacy AUTO is not adapted to cultivation):

```sh
node scripts/cultivation-playtest.mjs ../.mte-cultivation-playtests
```

The runner reserves a new seed, starts empty-handed and records its commands,
clock advances, milestones, pre-activation checkpoint and completed save outside
the repository. It uses observed terrain and never grants resources or teleports.
