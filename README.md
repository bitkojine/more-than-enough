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

- New players see a one-thumb controls tour on their first visit. Dismiss it
  with **Got it** and reopen it anytime from **Controls help** in the sheet.
- **One-thumb play:** drag anywhere to move (a virtual stick follows your thumb),
  or tap a spot to walk there. The bottom-right thumb dock keeps **GATHER / COLLECT**,
  **BUILD**, **UPGRADE**, and single-thumb zoom controls together within reach.
  On desktop, use **WASD / arrows** and the mouse wheel.
- Use the **− / + buttons in the thumb dock** to zoom out or in; optional
  two-finger pinch and desktop mouse wheel work too. The camera stays on you,
  and zoom is bounded so you can always see the world clearly.
- The big **GATHER** button is contextual: hold it to keep gathering, or tap a
  resource tile directly. It becomes **COLLECT** when an extractor nearby has
  output ready.
- **Trail gather:** keep holding GATHER as you drag off its button. Follow the
  glowing cyan trace over a nearby resource; it lights green when targeted.
  Release to sweep the resource.
- **Go below:** tap **MINE** in the same dock to drop into the rock directly
  beneath where you stand (back to the deepest layer you've reached). Movement
  keeps the same drag-anywhere joystick and Gather stays the same control: tap
  nearby rock to dig, or hold Gather and trace across nearby rock to preview and
  sweep it. Every 16×16 area of each layer hides one marked shaft: dig it open,
  then tap its hatch when you choose to go deeper, and you land directly below
  it. Digging any other tile never changes layers. Only open tunnels are
  walkable underground, so carve a route to the hatch; your tunnels stay where
  you dug them. Tap **SURFACE** to return to your forest position.
  Underground finds go into your usual inventory, so the forest gathering,
  building, and upgrade loop remains the center of the game.
- **BUILD** places extractors on matching deposits (Lumber Camp on forest,
  Quarry on stone, Mine on ore, Resonator on crystal) and, once you craft the
  blueprints, converter buildings on any land tile.
- **UPGRADE** opens the **Progression map**: families (Tools, Refineries,
  Abundance Engine, Unlocks & Blueprints) shown as a rail of node dots that
  expands to the buy rows. Spend resources there on better tools and boots,
  Overclock, the repeatable **Abundance Engine**, per-resource **refinery
  chains** (Silviculture/Masonry/Metallurgy/Crystallurgy), and unlocks
  including the converter blueprints.
- The **Beyond** tab always shows the prestige loop: gather 20,000 resources in
  one world to unlock **Embark** on a New World. The requirement resets after
  each Embark; the Insight reward still grows with your lifetime gathered total.
  Spend **Insight** on perks between worlds.
- Swipe the sheet's **grab handle down** to close it.
- The world follows a **day/night cycle** (240s). By day it's bright and calm;
  at night your **flashlight turns on automatically**, keeping a pool of light
  around you so you can always see — and keep working — after dark.
- **Logistics** (an Unlocks upgrade) auto-collects from extractors *near* you:
  while you're within ~3 tiles each camp's output flows straight into your
  packs, but walk away and it just accumulates until you come back. Gathered
  wood, stone, ore and crystal visibly **fly to you** as the count ticks up.
- A goal banner points you at the next milestone, and a faint compass arrow
  helps you find the next undiscovered resource.
- **Water is swimmable**: wade in and you'll ride a little raft across seas,
  and the world is beyond **endless** — no edge, no wall, no wrap. Keep walking
  and it generates ahead of you, differently every world.
- Past Abundance there's a whole late game: Blueprint-gated converter
  buildings (any land tile), per-resource refinery chains, repeatable
  Abundance Engine levels, and the **Beyond** tab — always visible, locked
  until your first Embark is within reach — where you spend Insight on perks
  and **Embark** on a New World that keeps your lifetime score.

## Versioning

The HUD badge in the top-right shows the studio and exact version you're
playing — `byrforr · vX.Y.Z` (SemVer). The single source of truth is
`src/version.js`; see `CHANGELOG.md` for the history.

- **0.x dev line** — pre-1.0.0. Reaching 1.0.0 is intentionally a long
  road; there is no rush to get there.
- PATCH bumps = bug fixes, never break saves.
- MINOR bumps = new features. They may change the save format, with a
  migration in `src/core/save.js` (0.19.0 migrates `v3` saves to `v4`).
  **0.10.0 (the endless world) discarded pre-0.10.0 saves.**
- After each minor (or any notable) change, bump `VERSION` in
  `src/version.js`, update `CHANGELOG.md`, and commit.

Deploys cache-bust automatically: `scripts/stage-site.sh` (run by the Pages
workflow, or `npm run stage` locally) appends a hash of the source tree as
`?v=` to the stylesheet, the entry module and every module import, so GitHub
Pages' 10-minute cache can't serve a stale mix of modules to returning players.
You don't need to change asset URLs by hand — just push.

The project is under git — commit early, commit often:

## Core loop

Explore → gather → craft → explore farther → automate → scale → chase the next
bottleneck. The map is infinite and fully random — wood, stone, ore and crystal
are spread evenly with no distance ramp, so every direction is worth walking.
Wood and stone regrow near where you stand; **ore and crystal never regrow**, so
automation handles what you've mastered and exploration reveals what you haven't.

## Files

- `src/core/` — the game rules: pure, deterministic, no DOM (runs in Node too)
  - `coords.js` — the `(x, y, z)` coordinate system: the forest is `z = 0`, mine layers are below
  - `tiles.js` — tile types and their rules as data (`TILE_INFO`)
  - `terrain.js`, `noise.js`, `world.js` — chunked, endless, layered world generation and edits
  - `content.js` — every tuning number and content table (tools, extractors, refineries, perks)
  - `economy.js`, `upgrades.js` — costs, multipliers, and the single registry of everything you can buy
  - `actions.js`, `underground.js`, `sim.js` — gathering/digging/building, moving between layers, the per-tick simulation
  - `state.js`, `goals.js`, `save.js` — the state object, prestige, milestones, save format and migration
- `src/game/` — the browser layer
  - `main.js` — entry point and frame loop; `controller.js` applies player intents to the core
  - `input.js`, `camera.js` — touch/keyboard to intents; world ↔ screen (the seam for a tilted view)
  - `render/`, `effects.js`, `hud.js`, `sheet.js`, `audio.js`, `storage.js`
- `index.html`, `style.css` — shell and mobile-first styling
- `docs/progression-map.md` — design spec for the Progression map
- `test/unit/` — Node `node:test` suites for the core
- `test/browser.e2e.js` — headless-Chrome end-to-end test (serves the real
  page, drives touch/keyboard/DOM, checks persistence)
- `scripts/stage-site.sh` — stages the deployable site with cache-busted URLs
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

CI runs `npm test` on every push and pull request, and only deploys `main`
when it passes. The browser test looks for Chrome at the standard macOS path
or `google-chrome` elsewhere; set `CHROME_PATH` to point it at another browser.

On macOS, run the browser E2E command from Terminal or approve unsandboxed
execution when prompted. Chrome aborts during macOS app registration when
launched inside the Codex seatbelt sandbox; the test detects that case and
stops before opening Chrome.

The browser test launches its own local server and headless Chrome and cleans up
after itself.
