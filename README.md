# MORE THAN ENOUGH

A small, complete, mobile-first browser game about turning a hostile wilderness
into an absurd surplus. Explore an endless, ever-different world, gather wood /
stone / ore / crystal, craft better tools, automate with extractors, and chase
the Abundance Engine.

## How to launch

**Play it live:** the game is deployed to GitHub Pages — every push to `main`
rebuilds it automatically:

**https://bitkojine.github.io/more-than-enough/**

Or serve the folder yourself — the game is plain HTML/CSS/JS with zero
dependencies, so `index.html` just needs a static host:

```sh
cd newgame-2026-10-12
python3 -m http.server 8000
```

Then open **http://localhost:8000** (or your machine's LAN IP) in Mobile Safari
or any browser. Progress saves automatically to `localStorage` (per browser —
on the Pages site, saves live in that browser for that origin).

> Safari may restrict `localStorage` on `file://` pages, so use the local
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
- **Go below:** tap **MINE** in the same dock to enter the underground layers.
  Movement keeps the same drag-anywhere joystick and Gather stays the same
  control: tap nearby rock to dig, or hold Gather and trace across nearby rock
  to preview and sweep it. Each layer has a marked shaft: dig it open, then
  tap its hatch when you choose to go deeper. Digging any other tile never
  changes layers. Only open tunnels are walkable underground, so carve a route
  to the hatch. Tap **SURFACE** to return to your forest position.
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
`version.js`; see `CHANGELOG.md` for the history.

- **0.x dev line** — pre-1.0.0. Reaching 1.0.0 is intentionally a long
  road; there is no rush to get there.
- PATCH bumps = bug fixes, never break saves.
- MINOR bumps = new features. They may change the save format; **0.10.0 (the
  endless world) discards pre-0.10.0 saves** and starts a fresh world. Earlier
  minor bumps migrated saves forward automatically (e.g. `v1` → `v2`).
- After each minor (or any notable) change, bump `MTE_VERSION` in
  `version.js`, update `CHANGELOG.md`, and commit.

Deploys cache-bust automatically: the Pages workflow appends a content-hash
`?v=` to `style.css`, `version.js`, `core.js` and `game.js` while staging the
site, so GitHub Pages' 10-minute cache can't serve a stale build to returning
players. You don't need to change asset URLs by hand — just push.

The project is under git — commit early, commit often:

## Core loop

Explore → gather → craft → explore farther → automate → scale → chase the next
bottleneck. The map is infinite and fully random — wood, stone, ore and crystal
are spread evenly with no distance ramp, so every direction is worth walking.
Wood and stone regrow near where you stand; **ore and crystal never regrow**, so
automation handles what you've mastered and exploration reveals what you haven't.

## Files

- `core.js` — endless chunked world generation, economy, simulation, save/load (no DOM)
- `game.js` — rendering, input (touch + keyboard), UI, persistence
- `index.html`, `style.css` — shell and mobile-first styling
- `docs/progression-map.md` — design spec for the Progression map
- `test/core.test.js` — Node simulation tests
- `test/browser.e2e.js` — headless-Chrome end-to-end test (serves the real
  page, drives touch/keyboard/DOM, checks persistence)
- `structurizr/` — architecture as code: the C4 model
  ([`workspace.dsl`](structurizr/workspace.dsl)) is the single source of truth,
  with committed [Mermaid diagrams](structurizr/diagrams/) rendered straight
  from it. See [`structurizr/README.md`](structurizr/README.md) for the model,
  the production-split invariant (`core.js` = pure simulation, `game.js` =
  presentation), and the validate/re-export workflow for agents.

## Tests

```sh
node test/core.test.js      # infinite worldgen, gathering, crafting, automation, movement, persistence, bot playthroughs
node test/browser.e2e.js    # real Chrome: boot, render, keyboard+touch movement, gather, upgrade, build, reload-save
```

On macOS, run the browser E2E command from Terminal or approve unsandboxed
execution when prompted. Chrome aborts during macOS app registration when
launched inside the Codex seatbelt sandbox; the test detects that case and
stops before opening Chrome.

The browser test launches its own local server and headless Chrome and cleans up
after itself.
