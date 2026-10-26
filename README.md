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
they unlock. To learn what something is, press and hold on it, or tap Wiki and
then the thing. Invite friends into a shared world with **Invite**.

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

Benchmarks and playtest runners are in `scripts/`; each explains itself at the
top of the file. `node scripts/perfect-bench.mjs --check` (the AUTO benchmark)
runs in CI after rule changes; record a reviewed new baseline with `--write`.

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
