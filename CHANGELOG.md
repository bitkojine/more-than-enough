# Changelog

All notable changes to MORE THAN ENOUGH, following [SemVer](https://semver.org/).

We are pre-1.0.0: **0.x** — the API/save-format may evolve between minor
versions (saves migrate forward automatically). Patch bumps (0.4.1) are
bug fixes only and never break saves.

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