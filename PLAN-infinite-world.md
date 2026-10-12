# Plan — Endless World (Minecraft-style infinite map)

Status: **implemented in 0.10.0** (core, game, tests, docs and diagrams updated)
Target version: **0.10.0** (MINOR — feature + intentional one-time save reset)

## Goal

Remove the hard world edge. The map should generate forever in every direction,
like Minecraft, and every world should be different.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Approach | Infinite procedural generation (not a wrapping torus) |
| Existing saves | **Wipe** — old/incompatible saves start a fresh world |
| Spawn origin | Re-centred at **0,0** |
| Fog of war | **Sparse per-tile fog, stored per chunk** |
| Terrain / resources | **Fully random** everywhere, different every seed |
| Spawn guarantees | **None** — fully random birth (no forced clearing, no starter resources) |
| Off-screen simulation | **Only near the player** |

### Consequence of "fully random birth"

We do **not** sculpt the terrain or guarantee resources near spawn. The only
spawn-time safety is choosing a **walkable starting tile** near `(0,0)` (scan
outward for a non-rock tile; water is swimmable, so any non-rock tile works).
Everything else — clearing, trails, starter wood/stone, distance gates — is
removed. Early game is driven by exploration; the existing compass hint arrow
becomes more important.

## Why the edge exists today

The edge is not a worldgen property; it is fixed-size storage plus bounds
clamps:

- `core.js:7` — `WORLD_SIZE = 96`; `type`/`rich`/`max` are flat `Uint8Array`s,
  `explored` is per-tile.
- `core.js:76` — `tileType()` returns `T.ROCK` out of bounds → invisible rock wall.
- `core.js:794-797` — `move()` clamps the player to `[0.5, WORLD_SIZE-0.5]`.
- `game.js:1197-1203` — `updateCamera()` clamps to the world rect.
- `game.js:1618-1624` — `render()` clips tile loops to `WORLD_SIZE`.
- `core.js:760` — `regrow()` scans every tile; `game.js:1184` — `updateHint()`
  scans all 9,216 tiles.

Terrain itself is already a pure function of `(x, y, seed)` via `fbm`/`hash2`
(`core.js:42-70`), so it can be evaluated anywhere. That is what makes this
tractable.

## Target architecture

**Deterministic infinite generation + sparse persisted deltas** (seed + edits):

- Terrain is generated lazily, chunk by chunk, on demand — a pure function of
  seed + chunk coordinates.
- Only *changes* are persisted: richness modified by gathering/regrowth, built
  extractors, and revealed fog. Never the whole world.
- Code asks the world "what is at `(x, y)`?" instead of indexing arrays, and
  negative / arbitrarily large coordinates are valid.

---

## Work breakdown

### 1. World model — `core.js`

**Replace** the flat `world.type/rich/max` arrays with a `World` object:

- `seed`, `chunkSize` (proposed **16**).
- `chunks: Map<key, Chunk>` with an LRU cap, plus `getChunk(cx, cy)` that
  generates and caches on demand. Key = packed `(cx, cy)`.
- `Chunk` holds baseline `type`, `max`, and `rich` bytes for that 16×16 block.
- Accessors at absolute coords: `getType(x,y)`, `getMax(x,y)`, `getRich(x,y)`,
  `setRich(x,y,v)`.
- `mods: Map<tileKey, rich>` — sparse overlay for every tile whose richness has
  diverged from the generated baseline (gathering depletion, regrowth). Reads
  prefer `mods`, then chunk baseline.

**Chunk generation** — refactor today's generator (`core.js:80-169`) into a pure
per-chunk function:

- Keep the `fbm`/`hash2` field math (`core.js:42-70`) and the biome thresholds
  for grass/forest/stone/ore/crystal/water/rock.
- **Remove** distance-from-spawn logic: the `dist <= 3` clearing
  (`core.js:100-101`), the ore/crystal distance gates (`core.js:106-109`), and
  the distance richness ramp (`core.js:132-148`). Layout becomes purely
  seed-driven and uniform across the plane; crystal keeps its high threshold so
  it stays rare.
- **Remove** guaranteed starters (`core.js:119-129`) and the trail carving /
  `floodFill` reachability pass (`core.js:150-166`).
- **Critical:** replace the sequential `mulberry32` richness jitter
  (`core.js:87,140-144`) with a **positional hash** so generation order cannot
  change results. Any per-tile value must be a pure function of `(x, y, seed)`.

**Unbounded movement:**

- `tileType(world, x, y)` generates on demand; drop the out-of-bounds `ROCK`
  fallback semantics (there is no "out of bounds").
- `move()` (`core.js:783-799`) — delete the clamp block (`794-797`). Keep the
  `canStand` collision sampling (`core.js:776-781`).

**Fog:**

- `updateExplored` (`core.js:473-491`) writes into a sparse per-chunk revealed
  bitmask (`markExplored` / `isExplored`); no global `explored` array.

**Simulation:**

- `regrow()` (`core.js:760-768`) only visits chunks near the player (bounded
  set) instead of all tiles.
- `gather`, `gatherTarget`, `buildTarget`, `occupied` (`core.js:495-593`) switch
  to the accessors; remove `inBounds` usages.

**Spawn:**

- `createState()` (`core.js:444-471`) starves at `(0,0)`; place the player on the
  nearest walkable tile via a small outward search. No terrain modification.

### 2. Persistence — `core.js` (`serialize`/`deserialize`, `core.js:836-910`)

- New save format **v3**: `seed`, `player`, `inv`, `tools`, `unlocks`, `resUp`,
  `abundanceLv`, `insight`, `prestiges`, `totalEver`, `perks`, `extractors`,
  `stats`, `discovered`, `goalIndex`, `time` — as today — plus sparse `mods`
  and sparse per-chunk `explored`.
- **No full `rich`/`explored` blobs.**
- **No migration branch:** reject old formats (`v1`/`v2`) → `deserialize`
  returns `null` → fresh world. Bump `SAVE_KEY` in `game.js:13` so the old key
  is simply ignored.
- Document the intentional one-time reset in `README.md` + `CHANGELOG.md`.

### 3. Rendering & input — `game.js`

- `updateCamera()` (`game.js:1197-1203`) — delete clamp-to-world; always follow
  the player. The world is never smaller than the screen.
- `render()` (`game.js:1613-1636`) — remove the `WORLD_SIZE` clip; iterate the
  visible (possibly negative) tile range.
- `drawTile()` (`game.js:1205-1230`) — read via `Core.getType/getRich` and
  `Core.isExplored`; drop `Core.idx`.
- `tapAt()` (`game.js:408-425`) — drop the `Core.inBounds` guard.
- `updateHint()` (`game.js:1177-1193`) — replace the full-map scan with a
  capped expanding-ring search around the player (e.g. outward until a match or
  a max radius), so cost is independent of distance travelled.

### 4. Tests

- `test/core.test.js` — heavily tied to the old model: `WORLD_SIZE`
  (`:16`), raw `world.type/rich/max` (`:24-58`, `:96-104`, `:147-149`,
  `:388-405`), `C.idx`/`C.inBounds` throughout, whole-world `floodFill`
  (`:42-46`), the "starter forest/stone near spawn" checks (`:57-58`), the v1
  migration section (`:308-330`), and grid pathfinding (`:426-452`).
  Rework to accessors + a new `Core.snapshot(world, x0, y0, w, h)` test helper
  that materialises a finite rectangle to inspect.
- Remove/replace: starter-resource assertions and the migration test (saves are
  wiped). Bot tests (`:412-703`) search a bounded region — widen the search
  window and, because worlds are now fully random, either relax timing
  assertions or pick known-good seeds; verify against several seeds.
- Add infinite-specific checks: negative coordinates generate; chunk-seam
  determinism (same tile from any generation order); save round-trip with edits
  far from origin; walking past the old `±48` boundary hits no wall; different
  seeds differ.
- `test/browser.e2e.js` — replace `y*96+x` / 48 / 96 constants
  (`:242,259,272,306,361`) with accessors; add a "walk/scroll past the old edge,
  no wall" assertion.

### 5. Docs & version

- `structurizr/workspace.dsl` (single source of truth) — update the World
  Generation and State-and-Saves component descriptions; regenerate
  `structurizr/diagrams/*` (`.mmd`/`.puml`) via the documented workflow.
- `CHANGELOG.md` — new `0.10.0` entry; note the endless world and the
  intentional save reset.
- `version.js` → `0.10.0`.
- `README.md` — update "Core loop"/"world" wording (no longer a seeded 96×96
  map), and the save note.

---

## Public API changes (call out for tests/tools)

Removed or repurposed from `Core` (`core.js:914-943`):

- `WORLD_SIZE`, `idx`, `inBounds` — no longer meaningful globally.
- `generateWorld`, `floodFill` — replaced by `getChunk`/`snapshot`.

Added:

- `World` accessors (`getType`/`getRich`/`getMax`/`setRich`/`isExplored`),
  `getChunk`, and `snapshot` (test/tool helper).

## Risks & mitigations

- **Determinism** — must eliminate the sequential RNG for any per-chunk value;
  add a seam-order test.
- **Unplayable births** — user accepted this. Mitigate only with spawn-tile
  search; the compass hint helps. Consider revisiting a minimal starter later.
- **Chunk cache / perf** — LRU cache; generate a margin beyond the viewport;
  cap generation work per frame if needed.
- **Save growth** — `mods` + `explored` grow with play (same as visiting more
  of a Minecraft world). Acceptable; optional run-length/compression later.
- **Float precision** — only matters absurdly far out (~8M tiles); same as
  Minecraft; out of scope.

## Rollout order (checklist)

1. World object + chunk generator + accessors (with positional hash).
2. Convert gather/build/move/explored/regrow to accessors; unbounded coords.
3. New save format v3 + wipe; bump `SAVE_KEY`.
4. Renderer/camera/input/hint unbounded.
5. Rework core + browser tests; add infinite-specific checks.
6. Structurizr DSL + regenerate diagrams; `CHANGELOG` + `version.js` → 0.10.0;
   README wording.

## Out of scope

- Wrapping/torus world.
- Biome variety, distance-based progression, infinite landmarks.
- Save compression and any migration of existing saves.
