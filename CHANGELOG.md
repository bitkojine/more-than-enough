# Changelog

All notable changes to MORE THAN ENOUGH, following [SemVer](https://semver.org/).

We are pre-1.0.0: **0.x** — the API/save-format may evolve between minor
versions. Patch bumps (0.4.1) are bug fixes only and never break saves; minor
bumps may change the save format (0.10.0 discards pre-0.10.0 saves — see below).

## [0.15.0] - 2026-10-12

### Changed
- **Trail gesture feedback.** The thumb-drawn route now appears on the map;
  nearby gatherable resources glow green when the route targets them, with a
  clear release-to-sweep prompt.

## [0.14.0] - 2026-10-12

### Added
- **New-player controls tutorial.** First-time players get a one-thumb tour
  covering movement, Gather/Collect, Trail, Build, Upgrade, and zoom. It can be
  dismissed and reopened from Controls help in the sheet.

## [0.13.8] - 2026-10-12

### Changed
- **Boy Scout cleanup.** Removed unused Trail gesture state and a dead pointer
  movement branch; simplified Trail coordinate conversion. No behavior change.

## [0.13.7] - 2026-10-12

### Changed
- **One-thumb mobile controls.** Gather, Build, Upgrade, and one-thumb zoom
  now sit together in a bottom-right dock. Sheet tabs, Done, Reset, and Sound
  are grouped at the bottom of the sheet for easier reach.
- **Trail gather prototype.** Hold Gather and trace across nearby resource
  tiles to gather the patch in one deliberate thumb gesture.

## [0.13.6] - 2026-10-12

### Fixed
- **Embark requires progress in each world.** Players must gather 20,000
  resources in the current world before embarking again. Insight rewards still
  scale with lifetime gathered resources.

## [0.13.5] - 2026-10-12

### Fixed
- **New deploys go live immediately.** GitHub Pages caches every file for 10
  minutes and won't let us set response headers, so returning players could
  keep an old game build after a push. The Pages workflow now appends a
  content-hash `?v=` to each asset reference while staging, so changed files
  get new URLs that browsers must refetch. The repository's `index.html` stays
  clean; stamping happens only in the deployed copy.

## [0.13.4] - 2026-10-12

### Changed
- **Ships read as ships.** The water vessel is now drawn much larger — a proper
  hull with a pointed bow, deck planks, mast and a broad sail — while the
  character shrinks to a tiny figure on the deck. The scale contrast makes it
  obvious you're sailing a ship, not paddling a raft.

### Changed (internal — Boy Scout cleanup, no behavior change)
- Single-sourced the extractor display/build order as `EXTRACTOR_ORDER` in
  `game.js`. The list `['lumber','quarry','mine','resonator']` was duplicated
  between `renderBuild()` and `drawHighlights()`, where it could silently drift.

## [0.13.3] - 2026-10-12

### Docs
- **Structurizr model verified current.** Re-validated `workspace.dsl`, checked
  that every `ref`/`files` pointer resolves to a live symbol in `core.js` /
  `game.js`, and re-exported the Mermaid + PlantUML diagrams and the on-demand
  `workspace.json` from the DSL (the tracked diagrams were already in sync).
- Updated `docs/progression-map.md` to match the shipped code: the
  `PATH_FAMILIES` snippet now shows the `icon` + `nodes` fields (the single
  source of truth shared by the resolver and the renderer), and Phase 4 now
  records that resolver coverage has landed.

## [0.13.2] - 2026-10-12

### Changed (internal — Boy Scout cleanup, no behavior change)
- **One definition of "lifetime resources."** `totalEver + sumStats(s)` was
  recomputed inline in three places (the embark gain, the goal banner, and the
  Beyond screen). Extracted `Core.lifetimeTotal(s)` and routed all three
  through it, so they can't diverge.
- `renderBeyond()` now reads `state.insight` once into a local and reuses it for
  the Insight row and both perk button states (was read three times).

### Testing
- `core.test.js` +2 checks (187 total): lifetime total starts at 0, and equals
  the carried total plus current-world tallies.

## [0.13.1] - 2026-10-12

### Changed (internal — Boy Scout cleanup, no behavior change)
- The progression map's node lists (tools, refineries, unlocks) and its perk
  order were duplicated between `core.js` and `game.js`. They now live once on
  `PATH_FAMILIES[].nodes`, and both `pathNodes()` and the renderer read from
  that — so a family's rails and its rows can never disagree.
- `renderBeyond()` no longer computes the embark gain on the locked branch,
  where it was unused.

### Testing
- `core.test.js` +13 checks (185 total): the registry's declared refs must match
  what `pathNodes()` returns for every family (length + order), the
  `RESOURCES`/`PERKS` mirrors, and the unknown-family case.

## [0.13.0] - 2026-10-12

### Fixed
- **Sound now starts on the first gesture.** Audio was only unlocked by the
  handlers that happened to call `initAudio()`, so a first drag on the world
  could leave the `AudioContext` suspended until a menu was opened (the menu's
  click resumed it). Every real gesture (pointer/touch/mouse/key/click, capture
  phase) now unlocks and resumes it, a one-frame silent buffer satisfies mobile
  Safari's unlock rule, and the context is nudged back to `running` when the tab
  regains focus/visibility.

### Added
- **Each material has its own gathering voice.** Wood knocks warmly (round body
  + muffled thud), stone cracks dryly (gritty noise + low clack), ore rings
  metallic (inharmonic partials), and crystal pings glassy (high octave shimmer
  with a long tail). The pentatonic pitch walk and tool-level thickening remain,
  so it stays melodic and progresses. Adds a filtered-noise `impact()`
  transient and an optional brightness control on `note()`.

### Testing
- Browser e2e +1 check (82 total): the audio context is created by the early
  gestures.

## [0.12.0] - 2026-10-12

### Added
- **Progression map.** The Upgrades tab is now a map of everything there is to
  unlock, not a flat list. Each family (Tools, Refineries, Abundance Engine,
  Unlocks & Blueprints, plus a Legacy link) renders a header with a rail of node
  dots and a count, and expands to the existing buy rows. Tapping a header
  toggles it; the Legacy row jumps across to the Beyond tab.
  - New `core.js` API: `PATH_FAMILIES`, `pathNode`, `pathNodes`, `pathProgress`
    — a pure lens over state the game already keeps, so **no save-format
    change**. Node states: `owned` / `ready` / `partial` / `saving`.
- **`docs/progression-map.md`** — the design spec, including the decision log
  (Embark is the respec; Beyond always visible; the map replaces Upgrades).

### Changed
- **The Beyond tab is always visible.** It used to stay `hidden` until the
  prestige loop was within reach; now it shows a **locked preview** — the Embark
  goal plus the five perks, sealed (name + description, no buy button) — from the
  first session, so the horizon is legible immediately. It switches to the full
  Embark/perk view the moment the loop becomes reachable.

### Testing
- `core.test.js` +21 checks (172 total): family registry, node states
  (`saving`/`ready`/`partial`/`owned`), repeatable `Infinity` max, and progress
  counts.
- Browser e2e +3 checks (81 total): the Beyond tab is visible from boot, the map
  renders five family headers, and Beyond shows its locked preview before the
  loop is reachable.

## [0.11.2] - 2026-10-12

### Docs
- **Structurizr model updated for 0.11.x.** The Canvas Renderer now documents the
  LOD block rendering and the clamped tile-highlight geometry added in 0.11.0/0.11.1
  (with its `strokeTileHighlight()` ref), Input names `setZoom()` (pinch + wheel),
  and the Browser E2E Harness records its current 78 checks, including the
  max-zoom robustness regression. All `.mmd`/`.puml` diagrams regenerated from the
  DSL (which remains the single source of truth).
- **Removed `PLAN-infinite-world.md`.** The 0.10.0 implementation plan is fully
  done and referenced pre-infinite code (`WORLD_SIZE`, `idx`, `inBounds`,
  `generateWorld`, `floodFill`) that no longer exists. The architecture it designed
  lives on in `structurizr/workspace.dsl` and the 0.10.0 changelog entry.

## [0.11.1] - 2026-10-12

### Fixed
- **Zooming all the way out could freeze the game.** The gather/build tile
  highlight was outlined with a fixed inset (`roundRect(sx + 2, sy + 2, tilePx - 4,
  tilePx - 4, 6)`), which goes negative once tiles are smaller than 4px. Canvas
  then received a negative `arcTo` radius and threw `IndexSizeError` **from inside
  the render loop**, which permanently killed `requestAnimationFrame` — the
  character vanished and neither movement nor zoom responded. The highlight now
  clamps its inset/size (and skips when a tile is sub-pixel), and the shared
  `roundRect` bails out on non-positive dimensions, so no caller can crash the
  loop this way again.

### Changed
- Extracted the duplicated gather/build highlight outlines into one
  `strokeTileHighlight()` helper (DRY).

### Testing
- Browser e2e +3 checks (78 total, up from 75): with a gatherable tile underfoot at
  maximum zoom-out, no page errors are raised **and** the game clock keeps ticking
  (proving the render loop is still alive).

## [0.11.0] - 2026-10-12

### Added
- **Pinch to zoom**. Squeeze or spread two fingers on the map to zoom out and
  back in — far enough out to take in a whole explored region at once — with
  the camera staying centred on the player. Mouse-wheel zoom works on desktop,
  and the zoom level survives window resizes.
- **Level-of-detail far rendering**: once tiles shrink below `LOD_PX` (10px),
  the renderer draws downsampled blocks (sampled at each block's centre)
  instead of every tile, so the per-frame draw count stays bounded however far
  out you pinch. Zoom is clamped to `ZOOM_MAX` (3x) in
  and a `MIN_TILE_PX` (3px) floor out, and the night flashlight pool and the
  player sprite get matching floors so they stay visible when zoomed far out.

### Testing
- Browser e2e +9 checks (75 total, up from 66): a two-finger pinch zooms in then
  out, a pinch never moves the player, far zoom still renders *varied* terrain
  (not one flat fill), and both zoom clamps hold.

## [0.10.1] - 2026-10-12

### Fixed
- **Floating resource sprites no longer linger or pile up**. A gathered item's
  flyer had no lifetime and a very small arrival radius, so a fast one could
  overshoot the player and orbit forever — under heavy gathering the sprites (and
  the pop-particles they spawn) accumulated unbounded, covering the screen and
  tanking the framerate. Flyers now force-land after `FLYER_LIFE` (0.8s) and land
  as soon as the player is within one frame's travel, so each one always resolves.
- **A fresh world no longer drags the old world's effects across the screen**.
  Embarking and the "Reset world" button cleared particles and floats but not
  flyers, so leftover resource sprites homed in from the previous world's
  coordinates. Both paths now call a shared `clearEffects()` that empties every
  transient effect (particles, floats, flyers) and clears `moveTarget`/`hintDir`.

### Changed
- **Bounded effect budgets** (`MAX_PARTICLES`, `MAX_FLYERS`): every particle/flyer
  now spawns through `addParticle()`/`addFlyer()`, and gather/pop particles were
  trimmed (fewer, shorter-lived) so a resource burst stays cheap.

### Testing
- Browser e2e +5 checks: a leftover flyer is injected, then the suite asserts both
  **embark** and **reset** clear it, and that reset yields a fresh world (66 checks
  total, up from 61).

## [0.10.0] - 2026-10-12

### Added
- **The world never ends**: the map is now procedurally generated in 16×16
  chunks, streamed in lazily and cached as you walk, so there is no
  edge, no wall and no wrapping — walk in any direction forever. Terrain is a
  pure function of `(x, y, seed)` (positional hashing, no shared RNG stream), so
  any tile can be read in any order and always matches. New helpers:
  `createWorld`, `getChunk`, `tileType`, `tileRich`, `snapshot`.

### Changed
- **Every world is different and fully random**. Birth is now a random walkable
  tile near the origin. The starter clearing, guaranteed starter resources, the
  distance-from-spawn richness ramp and the ore/crystal distance gates are all
  gone — wood, stone, ore and crystal are uniformly distributed everywhere.
- **Fog of war is sparse and persisted per chunk** as a bitmask; a chunk's
  explored bits survive even when its terrain is evicted from the cache.
- **Regrowth is local**: only forest/stone tiles near the player (within 20
  tiles) regrow, instead of scanning the whole map every 0.5s.
- **Renderer, camera, input and the compass hint are unbounded**: tiles are
  drawn for whatever the camera sees (including negative coordinates), the
  camera always centres the player, and the hint does a bounded ring search.

### Changed (save format v3)
- Saves now store the seed plus **sparse per-tile richness deltas** and
  **per-chunk fog bitmasks** (JSON), instead of whole-world base64 blobs.
  **Existing saves (v1/v2) are intentionally discarded** on load and the game
  starts a fresh world. The localStorage key is bumped to
  `more-than-enough-v3`.

### Testing
- Core suite reworked for the infinite model (151 checks): determinism and
  order-independence, seam-free chunk reads, arbitrary/negative coordinates,
  sparse save round-trips (including far-from-origin edits), and bot
  playthroughs with bounded pathfinding. Browser e2e updated to read through the
  new accessors, assert fog reveal in the endless world, and use
  player-relative coordinates.

## [0.9.4] - 2026-10-12

### Fixed
- **Holding SPACE/Enter no longer turbo-collects**: OS keyboard auto-repeat was
  firing the action on every repeated `keydown`, bypassing the 0.25s `GATHER_CD`
  hold gate (the touch button was unaffected), and the first press could act
  twice. The keyboard path now matches the touch path: one action per physical
  press, then repeats only via the cooldown-gated loop — one press = one action.
  Regression-covered by the browser e2e suite (+3 SPACE-hold checks).

## [0.9.3] - 2026-10-12

### Refactor
- **DRY the collect float text**: the gather/collect reward floats now reuse the
  existing `floatText()` helper instead of duplicating its object literal —
  identical output, one less copy of the same code. No behavior change (both
  suites green).

## [0.9.2] - 2026-10-12

### Deployment
- **Live on GitHub Pages**: the game is deployed automatically on every push to
  `main` (`.github/workflows/pages.yml`) at
  https://bitkojine.github.io/more-than-enough/. The deploy is build-free — the
  site is the five static files (`index.html`, `style.css`, `version.js`,
  `core.js`, `game.js`) — and saves keep working because they live in the
  browser's `localStorage` for that origin. Tests, scripts and `structurizr/`
  are not published.

## [0.9.1] - 2026-10-12

### Docs
- **Architecture as code**: the repo now ships a Structurizr C4 model in
  `structurizr/workspace.dsl` — the single source of truth for how the game is
  built, with committed [Mermaid diagrams](structurizr/diagrams/) (plus
  PlantUML) generated from it, file/function references on every component so
  agents can jump straight to the code, and the core invariant documented
  (`core.js` = pure deterministic simulation, `game.js` = presentation only).
- **Local-first tooling**: `structurizr/scripts/structurizr.mjs` validates and
  exports the workspace using the official Structurizr CLI via Docker (no
  network, no Java), falling back to the public Structurizr MCP server only
  when Docker is unavailable. See `structurizr/README.md`.

## [0.9.0] - 2026-10-12

### Added
- **Items fly into your packs**: every gather and every collect now sends a
  handful of little resource sprites zipping across the screen to the player —
  log bars for wood, diamonds for crystal, round pebbles for stone/ore — with
  an accelerating ease-in, a gentle wobble, and a small particle pop on
  arrival. The rendering layer reads transient core events every frame, so the
  same animation follows auto-collect (not just tap-to-collect).

### Changed
- **Logistics is range-limited**: it no longer vacuums every extractor on the
  map. Auto-collect now draws from camps within 3 tiles of the player
  (`AUTO_COLLECT_RANGE`, exposed on the core), so a base with a few spread-out
  camps still feeds you — but walk away and output simply accumulates in the
  buffers until you come back. Manual collection (standing next to a camp) is
  unchanged. The core surfaces each auto-collect as a transient `state.events`
  entry `{res, amt, x, y}` so the UI can react without polluting saves.

### Tests
- Core: rewrote the logistics test to assert far = no collect + no events,
  adjacent = instant collect of the buffered whole units + one event carrying
  resource/amount/position, and walk-away = immediate shield (`inv` frozen,
  buffer refills). Asserts `AUTO_COLLECT_RANGE === 3`. The full-progression bot
  now camps each extractor in turn so range-limited auto-collect keeps the
  Abundance Engine funded, and still reaches it comfortably (~1226s on seed
  12345).
- Browser e2e: holding GATHER spawns flyers that arrive and clear within ~1s;
  after embark, standing by an injected extractor auto-collects its buffer,
  teleporting to a world corner stops it (inventory static while the buffer
  grows), and walking back re-enables it.
- Core now at **150 checks**; browser e2e at **57 checks**.

## [0.8.2] - 2026-10-12

### Fixed
- **Flashlight is tighter so night actually feels dark**: the light pool
  around the player was ~6 tiles wide with a long falloff — half the screen
  stayed bright. The pool is now ~3 tiles (6 across) with a quick falloff and
  deeper edge darkness, so everything beyond arm's reach dissolves into the
  night while you can still comfortably gather at the player's feet. The
  flashlight tuning moved out of the rendering code into named constants
  (`FLASHLIGHT_RADIUS`, `FLASHLIGHT_FALLOFF`, `NIGHT_DARK_MID/EDGE`).

## [0.8.1] - 2026-10-12

### Fixed
- **Version badge no longer covers the HUD**: the `byrforr · vX.Y.Z` pill was an
  absolutely-positioned layer above the resource chips and goal banner, so on
  narrow screens it painted right on top of them. It now lives inside the HUD
  column (still top-right), and the chips/goal stack cleanly underneath.
- **BUILD actually opens the Build tab**: the bottom buttons left the tab
  header highlight stale (Build content but "Upgrades" lit), and pressing
  BUILD while the sheet was open on another tab closed it instead of switching.
  Both buttons now open the sheet, switch to their tab if another is showing,
  and close only when their own tab is already active (keyboard `B` / `U` / `C`
  behave the same). The active tab highlight is now always correct.

### Tests
- Browser e2e: verifies the version badge doesn't intersect the goal banner or
  resource chips; drives the BUILD button with a real touch tap (not just
  `.click()`) and asserts the Build tab is highlighted; keyboard `B` switches
  an open sheet to Build and closes it only when Build is already active.
- Browser e2e now at 49 checks.

## [0.8.0] - 2026-10-12

### Added
- **Day/night cycle**: the world slowly cycles a 240s day-night loop (starting
  at noon). Daytime gets a gentle warm lift, dusk fades through twilight, and
  midnight falls deep and dark — the palette stays moody but no longer reads
  "too dark" all day.
- **Flashlight**: after dusk the player's light switches on automatically,
  keeping a warm pool of visibility around them (about 6 tiles), so you can
  always see, move and gather at night. The cycle is driven by game time, so
  it persists across reloads exactly like your resources.

### Tests
- Core: new "Day/night cycle" section checks the daylight curve (noon,
  midnight, dawn/dusk halflight, cycle repeat).
- Browser e2e: forces midnight and verifies the flashlight pool renders — the
  area around the player stays lit while the screen edges fall dark, and
  returns to normal at noon.

## [0.7.0] - 2026-10-12

### Added
- **Late-game UI is now wired up** (the economy existed since 0.4.0 but had no
  screen): the Upgrades tab shows the Abundance Engine as a repeatable,
  levelable row plus the four refinery chains (Silviculture / Masonry /
  Metallurgy / Crystallurgy); the Build tab lists the converter buildings
  (Sapling Grove / Brickyard / Foundry / Observatory) with blueprint-locked
  states; and a new **Beyond** tab exposes Insight, the five perks, and the
  Embark (prestige) flow. The Beyond tab reveals itself once an embark is in
  reach, so new players aren't overwhelmed.
- HUD production rates now reflect real multipliers (refinery chains,
  Overclock, Abundance, Legacy) instead of a fixed +2/s.

### Changed — mobile-first UX pass
- Bottom sheet gains a grab handle you can **swipe down to dismiss**.
- Respects **prefers-reduced-motion**; visible **focus rings** for keyboard
  users; `format-detection` and text-size-adjust hardening.
- Larger touch targets (tabs/close/footer ≥44px), `touch-action: manipulation`
  to remove tap delay, bigger chip labels, tabular numerals, and a gentle pulse
  on the ready action button.
- Landscape-phone layout tweaks; cost labels use compact k/M/B notation.

### Tests
- Browser e2e grew to 38 checks, now covering refinery purchases, converter
  blueprint gating + placement, the Beyond tab, perk purchase, and embark.

## [0.6.0] - 2026-10-12

### Added
- **Studio branding**: the HUD badge now reads `byrforr · v0.6.0` — the
  byrforr game studio mark sits next to the SemVer version.

## [0.5.0] - 2026-10-12

### Added
- **Swimming & boats**: water tiles are now traversable. The player rides a
  bobbing raft (hull, planks, sail) with wake ripples, and swims slightly
  slower than walking (WATER_SPEED 0.75x). Reach islands and new lands that
  were previously cut off; you can no longer build anything at sea.
- **Version badge**: the HUD always shows the current SemVer (`v0.5.0`,
  top-right corner). Single source of truth: `version.js`.
- **Git / versioning discipline**: repository is now under git for the first
  time — every change is committed so progress is never lost.
- Early-example content landed in 0.4.x (see below) is included here for the
  record.

### Changed
- `walkableType` now treats water as passable; rock (mountains) remains the
  only impassable terrain.

## [0.4.0] - 2026-10-12

### Added
- **Abundance Engine levels** (infinite): each level grants +1/s of every
  resource and multiplies all extractors by an extra ×1.5. Level-1 cost
  raised to {wood:1500, stone:1500, ore:750, crystal:80}; costs grow ×2.4.
- **Converter buildings** on any land tile: Sapling Grove (wood), Brickyard
  (stone), Foundry (ore), Observatory (crystal). Gated by Blueprint unlocks,
  1.65^n cost growth — removes the geological caps on ore/crystal.
- **Refinery chains** (RES_UPGRADES): 10 levels each for wood/stone/ore/
  crystal with compounding multipliers (2,2,2,3,3,3,4,4,5,6) and escalating
  mixed costs.
- **Prestige loop** ("Beyond"): embark on a New World from 20k lifetime
  resources, gaining Insight `floor(sqrt(totalEver/2000))`. Perks: Legacy
  (repeatable ×1.25), Memory (start with Logistics), Heirloom (Axe II +
  Pickaxe II), Cartographer (+2 fog radius), Nomad (repeatable +20% move).
- **Goals** extended after Abundance (Abundance II/IV, refinery chains,
  blueprints, "The Long Road" 20k lifetime).
- **Save format v2** (v1 auto-migrates: `unlocks.abundance` → level 1).
- **Melodic audio**: pentatonic random-walk ladder, 4 scales, octave
  re-keying, humanized dynamics/detune, randomized collect/upgrade/build/
  fanfare, breathing drone LFO — much less monotonous.

### Changed
- First upgrade ~1 min, small automation ~5 min (unchanged from 0.3.x).
