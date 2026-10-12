# Changelog

All notable changes to MORE THAN ENOUGH, following [SemVer](https://semver.org/).

We are pre-1.0.0: **0.x** — the API/save-format may evolve between minor
versions (saves migrate forward automatically). Patch bumps (0.4.1) are
bug fixes only and never break saves.

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