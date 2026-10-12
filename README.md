# MORE THAN ENOUGH

A small, complete, mobile-first browser game about turning a hostile wilderness
into an absurd surplus. Explore a seeded world, gather wood / stone / ore /
crystal, craft better tools, automate with extractors, and chase the
Abundance Engine.

## How to launch

The game is plain HTML/CSS/JS with zero dependencies. Serve the folder and open
`index.html`:

```sh
cd newgame-2026-10-12
python3 -m http.server 8000
```

Then open **http://localhost:8000** (or your machine's LAN IP) in Mobile Safari
or any browser. Progress saves automatically to `localStorage`.

> Safari may restrict `localStorage` on `file://` pages, so use the local
> server (or any static host) rather than double-clicking the file.

## How to play

- **DRAG anywhere** on the map to move (a virtual stick follows your thumb),
  or use **WASD / arrows** on desktop. Tapping a spot walks you there.
- The big **GATHER** button is contextual: hold it to keep gathering, or tap a
  resource tile directly. It becomes **COLLECT** when an extractor nearby has
  output ready.
- **BUILD** places extractors on matching deposits (Lumber Camp on forest,
  Quarry on stone, Mine on ore, Resonator on crystal) and, once you craft the
  blueprints, converter buildings on any land tile.
- **UPGRADE** spends resources on better tools and boots, Overclock, the
  repeatable **Abundance Engine**, per-resource **refinery chains**
  (Silviculture/Masonry/Metallurgy/Crystallurgy), and unlocks including the
  converter blueprints.
- The **Beyond** tab (once you're near your first embark) holds the prestige
  loop: spend **Insight** on perks and **Embark** on a New World.
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
- **Water is swimable**: wade in and you'll ride a little raft to reach far
  islands — ore and crystal-rich lands were never closer.
- Past Abundance there's a whole late game: Blueprint-gated converter
  buildings (any land tile), per-resource refinery chains, repeatable
  Abundance Engine levels, and the **Beyond** tab — spend Insight on perks
  and **Embark** on a New World that keeps your lifetime score.

## Versioning

The HUD badge in the top-right shows the studio and exact version you're
playing — `byrforr · vX.Y.Z` (SemVer). The single source of truth is
`version.js`; see `CHANGELOG.md` for the history.

- **0.x dev line** — pre-1.0.0. Reaching 1.0.0 is intentionally a long
  road; there is no rush to get there.
- PATCH bumps = bug fixes, never break saves.
- MINOR bumps = new features; saves migrate forward automatically
  (save format `v1` → `v2` already happens).
- After each minor (or any notable) change, bump `MTE_VERSION` in
  `version.js`, update `CHANGELOG.md`, and commit.

The project is under git — commit early, commit often:

## Core loop

Explore → gather → craft → explore farther → automate → scale → chase the next
bottleneck. Wood and stone regrow near base; **ore and crystal are finite**, so
automation handles what you've mastered and exploration reveals what you
haven't.

## Files

- `core.js` — seeded world generation, economy, simulation, save/load (no DOM)
- `game.js` — rendering, input (touch + keyboard), UI, persistence
- `index.html`, `style.css` — shell and mobile-first styling
- `test/core.test.js` — Node simulation tests
- `test/browser.e2e.js` — headless-Chrome end-to-end test (serves the real
  page, drives touch/keyboard/DOM, checks persistence)

## Tests

```sh
node test/core.test.js      # worldgen, gathering, crafting, automation, movement, persistence, bot playthroughs
node test/browser.e2e.js    # real Chrome: boot, render, keyboard+touch movement, gather, upgrade, build, reload-save
```

The browser test launches its own local server and headless Chrome and cleans up
after itself.