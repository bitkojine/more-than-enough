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

Node 24 or newer (`.nvmrc` tracks the latest LTS). Two dev-only packages,
pinned in their lockfiles: esbuild (`package.json`), which the deploy uses to
bundle and minify the copy players download, and wrangler
(`server/package.json`), which runs and deploys the room service on
Cloudflare.

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
  `news.<version>` in both dictionaries. Players always get the newest build:
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

`test/unit/file-size.test.js` keeps source files at 600 lines or fewer.
Files already larger are listed with their size when the check arrived; they
may shrink but not grow, so new work splits them along their seams.
