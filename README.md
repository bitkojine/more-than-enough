# MORE THAN ENOUGH

A small, complete, mobile-first browser game about turning a hostile wilderness
into an absurd surplus. Explore an endless, ever-different world, gather wood /
stone / ore / crystal, craft better tools, automate with extractors, and chase
the Abundance Engine.

## How to launch

**Play it live:** the game is deployed to GitHub Pages — every push to `main`
rebuilds it automatically:

**https://bitkojine.github.io/more-than-enough/**

Or serve the folder yourself. The game is plain HTML/CSS and JavaScript
modules with zero dependencies and no build step, so `index.html` just needs a
static host:

```sh
cd newgame-2026-10-12
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

Everything is documented in the **[wiki](https://bitkojine.github.io/more-than-enough/wiki/)**
(`wiki/` in this repo, linked from the sheet in-game): controls, the world, the
mine, buildings, every upgrade table, the prestige loop and the milestones. Its
tables and figures are read live from `src/core/`, so they always match the
game they ship with.

**Design rule:** nothing to read in-game, ever. Labels, names, numbers and
prices are fine; sentences that teach belong in the wiki. When you add or
change a mechanic, update the wiki article that covers it.

The wiki's **Ideas** page (`wiki/ideas.js`) is a sketchbook of directions the
game could take: looks, mechanics, big swings. Add ideas freely; when one
ships, move it out of Ideas and into the article that documents it.

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

The HUD badge in the top-right shows the studio and exact version you're
playing — `byrforr · vX.Y.Z` (SemVer). The single source of truth is
`src/version.js`; see `CHANGELOG.md` for the history.

- **0.x dev line** — pre-1.0.0. Reaching 1.0.0 is intentionally a long
  road; there is no rush to get there.
- PATCH bumps = bug fixes, never break saves.
- MINOR bumps = new features. They may change the save format. During
  active development there are **no save migrations**: bump `SAVE_VERSION`
  in `src/core/save.js` and older saves are rejected (the player is told)
  and a new world starts.
- After each minor (or any notable) change, bump `VERSION` in
  `src/version.js`, update `CHANGELOG.md`, and commit.

Deploys cache-bust automatically: `scripts/stage-site.sh` (run by the Pages
workflow, or `npm run stage` locally) appends a hash of the source tree as
`?v=` to the stylesheet, the entry module and every module import, so GitHub
Pages' 10-minute cache can't serve a stale mix of modules to returning players.
You don't need to change asset URLs by hand — just push.

The project is under git — commit early, commit often:

## Files

- `src/core/` — the game rules: pure, deterministic, no DOM (runs in Node too)
  - `coords.js` — the `(x, y, z)` coordinate system: the forest is `z = 0`, mine layers are below
  - `tiles.js` — tile types and their rules as data (`TILE_INFO`)
  - `terrain.js`, `noise.js`, `world.js` — chunked, endless, layered world generation and edits
  - `content.js` — every tuning number and content table (tools, extractors, refineries, perks)
  - `economy.js`, `upgrades.js` — costs, multipliers, and the single registry of everything you can buy
  - `actions.js`, `underground.js`, `sim.js` — gathering/digging/building, moving between layers, the per-tick simulation
  - `state.js`, `goals.js`, `save.js` — the state object, prestige, milestones, save format and validation
  - `catalog.js` — everything that exists, by the id a texture pack uses for it
  - `stockpile.js` — what you own as piles around home, on a log scale (one pile per unit of each digit)
- `src/game/` — the browser layer
  - `main.js` — entry point and frame loop; `controller.js` applies player intents to the core
  - `input.js`, `camera.js` — touch/keyboard to intents; world (x, y, height) ↔ screen, with zoom and tilt; tilted picking hits the block you see
  - `render/`, `effects.js`, `hud.js`, `sheet.js`, `audio.js`, `storage.js`, `fork.js`
  - `look/` — loading, checking and drawing texture packs; `textures.js` — picking, remembering and reporting packs in the game
  - `yard.js` — keeps the stockpile's piles in step with the inventory, growing and puffing as they change
- `index.html`, `style.css` — shell and mobile-first styling
- `packs/default/` — Lanternlight, the default texture pack (`pack.json` + SVG pictures)
- `wiki/` — the player wiki (`index.html` articles, `wiki.js` renders tables from the core, `ideas.js` holds the Ideas sketchbook, `textures.js` the catalog page and pack download)
- `docs/progression-map.md` — design spec for the Progression map
- `test/unit/` — Node `node:test` suites for the core
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
npm test            # node:test over test/unit/ — world layers, actions, economy, saves, bot playthroughs
npm run test:e2e    # real Chrome: boot, render, touch/keyboard, gather, dig, upgrade, build, reload-save
```

Node: always the latest LTS, locally and in CI. `.nvmrc` says `lts/*`; CI
reads it with `check-latest`, and locally `fnm` (or `nvm`) picks it up from the
same file.

CI runs `npm test` on every push and pull request, and only deploys `main`
when it passes. The browser test looks for Chrome at the standard macOS path
or `google-chrome` elsewhere; set `CHROME_PATH` to point it at another browser.

On macOS, run the browser E2E command from Terminal or approve unsandboxed
execution when prompted. Chrome aborts during macOS app registration when
launched inside the Codex seatbelt sandbox; the test detects that case and
stops before opening Chrome.

The browser test launches its own local server and headless Chrome and cleans up
after itself.

## License

MIT, see [LICENSE](LICENSE). Fork it, change it, ship your own version.
