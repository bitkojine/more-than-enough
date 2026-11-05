# Mica and Wiki

A mobile-first browser game. You play Mica, a hooded repairer, with Wiki, a
little mycelium sprite riding on Mica's hood. Start empty-handed on the
surface, gather mycelium and stone, mine metal below, grow living crystal in
dark, cool chambers deep underground, and bring a stolen heart home to wake a
sleeping machine. The game is in active development; older worlds keep the
rules they started with.

**Play it: https://play.robertasrudys.com**

The game was called More Than Enough until v0.149.0; the repository and the
save keys keep that name.

## What still needs work

Checked at v0.182.3 (2026-11-01) against the code, a fresh playthrough and
the live game. The first fifteen minutes are good. Most of what comes after
them isn't yet. When you fix something here, update this list in the same
commit. When you find something new, add it.

**The game**

- **The trip home is only partly a game yet.** The playtest bot
  (`node scripts/cultivation-playtest.mjs <dir>`) wins a fresh world in about
  30 to 45 game minutes, most of it walking about 2.5 km to the heart's hiding
  place and back. Since 0.183.0 the sun warms the sealed carrier, so the way
  home means ducking into water, shade or a shelter to cool it, and walking
  straight through the sun cracks the heart (`docs/game-design.md`, "The trip
  home"). Since 0.184.0 a carrier bench at the hiding place lines the
  carrier so it warms half as fast. The walk out still has little in it.
- **The ending is thin.** The last two repairs and the activation all happen
  in the same second. Since 0.185.0 waking the machine turns your heart
  shelters into teleport stops and marks where the thief went, but the
  thief's chapter isn't designed yet, so the mark leads nowhere.
- **There are two economies.** New solo worlds play the crystal chapter. Old
  solo worlds and every shared world still run the old economy. There, 26 of
  32 milestones arrive in the first 10 minutes, followed by about 17 hours of
  holding AUTO and buying refinery levels (gameplay review, v0.145.0). The
  old shared world has no win at all. Since 2026-11-02 the old economy is
  frozen as legacy: it keeps working and gets fixes, but new work targets
  the crystal economy only. Since 0.194.0 Watch can make a crystal shared
  world (server/README.md, "Crystal rooms"), where everyone plays their own
  crystal chapter; what players share there (machines side by side,
  shelters, crystal, teleport stops) is still to come (`docs/game-design.md`,
  "Bot players and crystal shared worlds").
- **Online only is half done.** Since 0.197.0 no new solo world is made: a
  device with no world shows an invite-only page and joins the one public
  crystal world through an invite link, and Embark is gone (`docs/game-design.md`,
  "Online only"). Solo worlds already on a device still run their own code
  path, frozen like the old economy, so two ways of playing remain until
  nobody plays solo. Invites are the only way in, so a stranger who finds
  the game can't play yet. One live session in the public world drifted
  from the room for a reason not yet found.
- **Core design questions are still open.** These include who stole the
  heart, what tending a colony actually does, how wild colonies regrow, and
  what a finished world leads to. See "Other design questions still open" in
  `docs/game-design.md`.
- **The first screen says what to do but not how.** A new player sees "Gather
  mycelium and loose stone. Craft your first pick." Nothing on screen says
  you drag to walk or hold the big button to gather.

**The code**

- **About 5,000 lines of browser code never run under the unit tests.** This
  includes `main.js`, `sheet.js`, `hud.js`, `renderer.js`, `overlay.js`,
  `audio.js` and `placing.js`. The 84.7% line coverage figure leaves them out.
  Only the browser suite exercises them.
- **The long browser journey still contains historical fixed delays.**
  These can confuse a slow renderer with a broken feature. World input and
  outline checks now have isolated, controlled fixtures; migrate remaining
  timing-sensitive checks the same way. The broad journey doesn't block
  deploys, so a red run there still needs investigation.
- **Every file is now under 600 lines, but the biggest functions are not.**
  The largest factory closures are still hundreds of lines each:
  `createRigModel` (510), the admin page's `client` (501), `createSheet`
  (486), `createController` (440) and `createTogether` (373).
- **The lint budget is mostly complexity debt.** All 221 warnings that the
  budget allows are real: 94 functions over complexity 15, 76 with more than
  five parameters, 36 over 120 lines, 12 nested too deep and 3 unused
  variables. The worst rule functions (the crystal commands and save
  loading, 0.193.1), the room's message handler (0.193.2), the 2D character
  drawing (0.193.3), the moderator's routes (0.193.4), the building
  card (0.193.5) and pathfinding (0.193.6) were split; the worst left are
  `buildSpot` (44), the device sync's message handler (43) and the
  controller's `steer` (40).
- **The first download is nearly at its budget:** 295 KB gzipped of 300 KB.
  Any new feature has to make room for itself.
- **The coverage run takes about 4 minutes,** which is slow for a gate
  that runs on every push.

Already in decent shape: the unit and property tests pass, and their code
comes to about 0.6 lines per line of source. The room's anti-cheat
(`server/src/shadow.js`) is 96% line-covered. There are no open GitHub
issues. The live game loads in about 1.7 seconds on a phone-sized browser
with no console errors.

## How to play

There is no tutorial. Drag anywhere on the map to walk (or use WASD / the arrow keys), hold
**Gather** to work what's around you, and use **Build** and **Upgrade** as
they unlock. To learn what something is, press and hold on it. Mica and Wiki never capture pointer input;
all gestures reach the world beneath them. Invite friends into a shared world with **Invite**.

Everything else is in the **[wiki](https://play.robertasrudys.com/wiki/)**
(`wiki/`), whose tables are read live from the game's rules. The game and the
wiki are in English and Lithuanian.

## Run it locally

Plain HTML, CSS and JavaScript modules that run as they are, with no build
step and no npm packages in the game. Two libraries are copied into
`src/vendor/` unchanged: Three.js r180 (the 3D character) and
qrcode-generator 2.0.4 (invite QR codes). Serve the folder with any static
server (browsers won't load modules from `file://`):

```sh
npm run serve      # python3 -m http.server 8000
```

Open http://localhost:8000. On a Mac, `./serve.sh` serves it on your Wi-Fi so
you can open it on your phone. Saves live in the browser's `localStorage`.

## Test

Node 24 or newer (`.nvmrc` tracks the latest LTS). Dev-only packages,
pinned in their lockfiles: esbuild (`package.json`), which the deploy uses to
bundle and minify the copy players download, wrangler
(`server/package.json`), which runs and deploys the room service on
Cloudflare, and Stryker, for the mutation sweep (below). Players download
none of them.

```sh
npm ci
npm run check         # unit + property tests, then stages the site as the deploy does
npm test              # unit and property tests only
npm run test:e2e      # real Chrome: plays the game (CHROME_PATH picks the browser)
npm run test:layout   # real Chrome: every screen at 12 sizes, both languages
npm run test:extended # the long 1,500-seed property sweep
```

The combined HUD gate is bounded and uses presentation fixtures rather than
long game runs:

```sh
CHROME_PATH=/path/to/chromium MTE_WEBGL=1 MTE_HUD_ONLY=1 npm run test:e2e
```

It checks nine viewport sizes in both languages, stable Messages and version
anchors, compact Equipment touch input, simultaneous desktop panels,
Settlement contents, overlapping groups, and cached layout work. The deploy
runs it alongside rendering checks. `test:layout` separately checks the wider
set of menus, placement, dialogs and shared-world crowds.

Rendering-performance checks use biome-boundary seed 33 as a reproducible
allocation workload. Set `MTE_RENDER_PERF_SEED` to investigate the world seed
from a copied performance report; failures include resize call sites:

```sh
CHROME_PATH=/path/to/chromium MTE_WEBGL=1 MTE_RENDER_PERF_ONLY=1 MTE_RENDER_PERF_SEED=23 npm run test:e2e
```

Fullscreen has a separate bounded real-browser check:

```sh
CHROME_PATH=/path/to/chromium MTE_FULLSCREEN_ONLY=1 npm run test:e2e
```

It enters/exits through Settings, rotates through all four orientations at
phone/tablet/desktop sizes, checks fallback help and preserves the serialized
world. Native tests run in Chromium; unit tests cover prefixed Safari APIs,
unsupported/installed modes, rejected requests and external exits. CI runs
this alongside the rendering and HUD gate.

Current-world end-to-end playtests use the manual-action strategy, not legacy
AUTO (which is disabled in cultivation worlds). Reserve fresh seeds in the same
archive as other playtests:

```sh
node scripts/cultivation-playtest.mjs ../.mte-playtests
CHROME_PATH=/path/to/chromium MTE_WEBGL=1 MTE_PLAYTHROUGH_RUN=../.mte-playtests/SEED.json npm run test:e2e
```

The browser replays the whole trace from the empty initial save through normal
controller commands and the UI cultivation handler. A localhost-only
`?playtestReplay` host pauses wall-clock advancement while fixed ticks run fast;
rendering samples the journey, and both uncaught errors and recorded client
faults fail it. Completion must survive an actual reload. Gameplay save parity
excludes only the browser's last-saved wall timestamp. `MTE_SITE=site` tests the
staged client; the source rules/strategy fingerprint must still match the run.
Add `MTE_GEODE_ONLY=1` to replay only as far as the first wild-colony interaction,
then click the actual map tile and inject resource failures. It verifies that
the Geode card loads and that missing artwork produces a detailed nonfatal
report. The fast unit gate also checks every card family's picture slots, the
shared empty-URL guard and startup resource-error routing.

No grants, teleports, hidden-terrain reads or near-win checkpoint starts count
as a fresh-world win.


Benchmarks and playtest runners are in `scripts/`; each explains itself at the
top of the file. `node scripts/perfect-bench.mjs --check` (the AUTO benchmark)
runs in CI after rule changes; record a reviewed new baseline with `--write`.

The deploy gate also runs the bounded lighting and foreground-compositing browser
fixtures against the staged site (`MTE_ILLUMINATION_ONLY=1` and
`MTE_LAYER_ONLY=1`). `MTE_RENDER_PERF_ONLY=1` checks dense phone/desktop scenes
through day, sunset, night and dawn, camera movement, and all 513 supported
depths with tiny fixtures. Image-submission limits catch offscreen scenery work;
canvas-allocation and cache-memory limits also gate deploy;
frame timings are recorded without claiming hardware-independent FPS. Their failure captures are retained as CI artifacts. The
broad browser suite and long property sweeps remain separate from quick iteration.
Subject-icon checks run inside the existing foreground-compositing browser host,
so they reuse that browser in CI. For a focused check of the real cargo caption,
cached heart/colony/crystal pictures and lantern, flare and daylight subjects:

```sh
CHROME_PATH=/path/to/chromium MTE_WEBGL=1 MTE_TIMER_ICONS_ONLY=1 npm run test:e2e
```

The fixture checks both languages at small portrait, landscape and desktop sizes,
and verifies that drawing the tags preserves the saved state. It is a presentation
fixture, not a fresh-world completion run.

World input and outline checks also reuse the foreground-compositing host.
For a quick standalone run:

```sh
CHROME_PATH=/path/to/chromium MTE_WORLD_INPUT_ONLY=1 npm run test:e2e
```

These use known terrain and equipment, real pointer input, and an isolated
canvas for outline geometry at multiple scales and pixel densities. Input
checks assert the selected tile and resulting action, not screenshot colors.
Condition checks stop as soon as the expected state arrives, never repeat the
action, propagate probe errors, and print the last observed state on timeout.
Rendering checks run synchronously with explicit alpha and include empty and
hidden negative controls. `MTE_TEST_CPU_RATE=4` exercises this focused fixture
under CPU throttling; it is optional, not another default CI browser process.
This separation tests correctness; performance budgets remain separate checks.

The layout sweep reports each viewport as it finishes, including elapsed time
and problems, so a long audit does not look like a silent hang.

## Rules for changes

- **Every word in two languages.** Code never writes player text: it calls
  `t('key')` (`src/i18n/i18n.js`), and each key lives in `src/i18n/en.js` and
  `src/i18n/lt.js` (`wiki/i18n/` for the wiki). Words that differ by device are
  written `{phone:tap|laptop:click}`. `npm test` fails on anything missing.
- **One look.** Everything visible is listed in `src/core/catalog.js` and drawn
  in `packs/default/`; drawing code asks for pictures by id. No emoji.
- **Rules are pure.** `src/core/` has no DOM, clock or randomness, so the
  browser and the room service run the same rules.
- **Versions.** `src/version.js` holds the version. Each release bumps it, adds
  a `CHANGELOG.md` entry, and adds its notes to `src/game/news.js` and
  `news.<version>` in both release-notes dictionaries (`src/i18n/news/`). Players always get the newest build:
  the game reloads itself when a deploy lands.
- **Worlds are kept forever.** Saves always load; `src/core/format.js` is frozen.

Contributors and agents start with [AGENTS.md](AGENTS.md).

## Where things are

| | |
| --- | --- |
| `src/core/` | game rules, pure functions |
| `src/game/` | the browser game: input, rendering, HUD, sound, saves |
| `src/net/`, `server/` | multiplayer: wire format and the Cloudflare room service ([server/README.md](server/README.md)) |
| `src/i18n/` | English and Lithuanian text |
| `packs/default/` | the game's pictures |
| `wiki/` | the player wiki |
| `test/` | unit, property and browser tests |
| `scripts/` | staging, benchmarks, playtests, live checks |
| [docs/game-design.md](docs/game-design.md) | confirmed design and open questions |
| [docs/ui.md](docs/ui.md), [docs/music.md](docs/music.md) | UI layout, soundtrack |
| [art/characters/README.md](art/characters/README.md) | how the 3D character is built |
| [structurizr/](structurizr/README.md) | architecture model and diagrams |
| [CHANGELOG.md](CHANGELOG.md) | what changed and why |

Every push to `main` deploys the game to GitHub Pages and, when it touches the
shared rules or the server, the room service.

## License

MIT, see [LICENSE](LICENSE). Fork it, change it, ship your own version.

### Static analysis

Run `npm run analyze -- --output /tmp/mte-analysis` for ESLint recommended
correctness checks, unused code, cyclomatic complexity (over 15), nesting
(over 4), parameters (over 5), and function size (over 120 code lines).
The text report ranks files and lists exact source locations; JSON supports
further investigation. Runtime globals are scoped by host; vendored libraries
and generated assets are excluded. CI uploads the same report on every run.
`npm run lint` is the gate (in `npm run check` and CI): any ESLint error
fails it, and so does a warning count above the budget in `package.json`
(`--max-warnings`). The budget is a ratchet: when you clear warnings, lower
it to the new count; never raise it. It also fails on JavaScript that
Prettier (`.prettierrc.json`: 100 columns, single quotes) would lay out
differently; `npm run format` fixes that. A comment that marks a line, like
`// i18n-ok: <why>`, may sit at the end of the line or alone on the line
above it, so the formatter can move code without losing the mark. The
one-time reformat is listed in `.git-blame-ignore-revs`; run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once so
`git blame` looks past it. Complexity counts are investigation
signals, not proof of bugs or performance.
This bounded analysis does not run simulations or ship dependencies to players.

Focused chapter availability is shared by menus and canonical actions in
`src/core/progression.js`. Unfinished crystal worlds keep the minimum manual
win route; activation unlocks later systems without losing earned state.
`CHROME_PATH=/path/to/chromium MTE_PROGRESSION_ONLY=1 npm run test:e2e` checks
locked catalogs, rejected bypasses, real card activation and reload preservation
in both languages. CI runs this bounded check with the rendering/HUD gate.

### Coverage and file size

`npm run test:coverage` runs the unit and property tests with Node's own
coverage (no extra tools) and fails under the line, branch and function
floors in `package.json`; CI runs it in place of `npm test`. Raise a floor
when coverage grows, never lower it. It counts only modules the tests load:
browser-only files such as `src/game/main.js` are not in the number yet.

### Mutation sweep

Coverage says a line ran; it doesn't say a test would notice if the line were
wrong. The mutation sweep does: Stryker (`stryker.config.mjs`) plants one
small bug at a time (`<` for `<=`, `||` for `&&`, a call deleted, a condition
always true) and runs the test files that reach it. A planted bug no test
catches has survived, and shows a behaviour nothing checks.
`.github/workflows/mutation.yml` runs it weekly and by hand in 240 small
parts. GitHub shuts a runner down now and then, and Stryker saves a part
only when it ends, so each part is about half an hour and a run that lost
parts starts the next one itself, which keeps the same plan, runs only the
lost parts and joins them with the parts earlier runs finished (up to four
runs in a row), so a lost machine costs one part, never the sweep. A part
lost because it is too slow for GitHub's 6 hours is cut smaller when the
sweep resumes, into spare slots (256 in all).
A planted bug costs the time of every test file that runs its line, so
`scripts/mutation-plan.mjs` first times each test file with Node's coverage
and cuts the code, between top-level statements, into parts that cost about
the same. Bugs in code that runs as a module loads (the big tables) would
each rerun the whole suite; Stryker leaves those out (`ignoreStatic`). It
then joins the parts (`scripts/mutation-report.mjs`) into a report: the score per
file, every survivor, and for each test file how many planted bugs it
catches, how many only it catches, and which test files catch nothing
(also printed in the run's log, with every survivor by file and line).
After the first full run only what changed is run again; a part that
failed is simply tested from scratch next time, and `from_run` starts a run
from another run's report (`join_run` only joins an earlier run's parts
again). A deep sweep (`deep`, by hand) tests every bug 10x harder: the
random-game property tests play 120 seeds per family instead of 12, the
build and check scripts in `scripts/` get bugs planted too, and nothing
earlier is reused. One file by hand:

```sh
npx stryker run --mutate src/core/paths.js
```

Three test files read or measure the source as text, which Stryker's
rewritten copy trips: `i18n`, `file-size` and `load-budget` are left out of
the sweep and were proven instead by planting a violation each. Three more
check a baked picture or the admin page against the source text; under the
sweep (`STRYKER_NAMESPACE` is set) they skip just that check. Some survivors can't be caught
because the change makes no difference (a shortcut that only saves time); mark
those in the code with `// Stryker disable next-line <mutator>: <why>`.

`test/unit/file-size.test.js` keeps source files at 600 lines or fewer.
Files already larger are listed with their size when the check arrived; they
may shrink but not grow, so new work splits them along their seams.
