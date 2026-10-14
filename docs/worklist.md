# Worklist

The current list of changes, in the order they're being done. Tick an item
when it's shipped (committed, pushed, live), with the version it went out in.

## Repo

- [x] **License.** (shipped) Add an MIT LICENSE so people may fork and reuse the code.

## Bugs

- [x] **Sound must always work.** (0.25.1, silent by mistake; fixed and tested in 0.26.0) Sometimes sounds don't start until you touch
      the UI. They should play from the start, all the time.
- [x] **Two tabs, one save.** (0.26.0) Two tabs with the same save fork it. Make
      progress in one and close it, then go back to the older tab: does the old
      state overwrite the newer save? If so, warn before loading an older state
      and offer to keep the most advanced one.
- [x] **Flickering progress rings.** (0.26.1) The rings next to buildings flicker when
      you collect fast (auto-collect). Drop the "empty" visual state.
- [x] **Tap the world to close menus.** (0.26.2) Clicking past a menu onto the game
      world should close the menu.

- [ ] **No sound on Edge until the tab is muted and unmuted.** (playtest, 2026-10-14; to reproduce)
      A friend on Microsoft Edge heard nothing until they muted and unmuted the tab. Not reproduced yet
      (no Edge to test on). Suspect: `src/game/audio.js` makes its AudioContext at load, before any click,
      and Edge may leave that early context "running" but silent. If it reproduces, make a fresh context on
      the first click when the early one has never sounded (the output meter can tell).

## Wiki

- [x] **Find every mention.** (0.27.0) Searching a term (e.g. "overclock") should show
      everywhere the wiki mentions or uses it.
- [x] **Readable costs.** (0.27.1) It's unclear which icon belongs to which number.
      Group each amount with its resource visually.

## Upgrades

- [x] **Show what's still needed.** (0.28.0) Upgrade costs should show how much more of
      each resource you still need to collect, not the total price.
- [x] **Embark unlocks late.** (0.29.0) Starting a new world should take a very long
      time to unlock and stay hidden while you're still unlocking and
      upgrading. It should feel special.

## Stockpile

- [x] **A home zone.** (0.30.0) The stash needs its own zone, so it doesn't cover
      resources you can still gather from in the middle of the forest.
- [x] **A stable stash.** (0.31.0) Piles shouldn't jump around and merge so often as you
      gather. Reorder once in a while, so the stash looks settled.
- [x] **Gathered stuff flies to the stockpile.** (0.31.1) Collected resources should fly
      to the stockpile and settle there, not to the player.

## Underground

- [x] **Taller layers.** (0.31.2) Underground layers are shorter than the player
      character, and so are the cliff faces seen from the forest edge. Make
      every layer at least tall enough for the player.
- [x] **Drill as you walk.** (0.32.0) Walking into a wall should mine it, so you never
      have to take your thumb off the joystick to tap each block.
- [x] **No holes under buildings.** (0.32.1) You can't dig down or up through a tile
      that has a building. No entry or exit shares a tile with a building.
- [x] **No holes in water.** (0.32.1) Never dig down or up where there's water.
- [x] **Digging takes work.** (0.33.0) Making a hole should take more steps, at least
      time, so holes aren't everywhere.
- [x] **No digging between layers.** (0.43.0) You can never dig yourself up or down:
      every layer, the forest included, is connected only by generated ways up
      and down that you discover by exploring. (Replaces "Digging takes work".)
- [x] **Climb button and ladders.** (0.45.0) The climb button says up or down
      correctly, shows only within reach of a way, ways up and down never
      spawn close together, and ladders are steel, not wood.
- [x] **Dark tunnels.** (0.34.0) Tunnels are always dark unless you light them.

## The world and its look

- [x] **The lantern only when needed.** (0.34.0) The wanderer holds the lantern only at
      night or underground.
- [x] **No decoration you can't collect.** (0.34.2) Mushrooms, grass blades, flowers:
      everything shown must be collectible, or not shown at all.
- [x] **Many kinds of trees.** (0.36.0) Different forests, and different trees within a
      forest, like real nature. Not just biomes.
- [x] **A boat to scale.** (0.35.1) The sail sits too low. Size the boat and all its
      parts against the wanderer.
- [ ] **Mobs.** Add mobs to discover and learn from, drawn from the
      angels-and-demons tarot matrix (72 day angels of the Shem HaMephorash, 72
      night demons of the Ars Goetia, two of each on every minor-arcana card,
      36 decans). Tie them to the day/night cycle.

## UI

- [x] **Zoom reads as zoom.** (0.37.1) A magnifier and 1.25×, not a bare 125%; tap it for 1×.
- [x] **Timings out of play.** (0.37.1) The perf panel is F3 or `?perf` only.
- [x] **Pickups stay readable.** (0.37.2) Gains add up on one "+n" that lingers.
- [x] **Buttons look pressable.** (0.38.2) Raised green when you can, flat dashed when you can't;
      a dot on BUILD/UPGRADE when something in them is ready.
- [x] **Gather by touching the map.** (0.40.0) Tap a far resource to walk over and gather it;
      hold a finger still to keep gathering.
- [x] **Drag direction.** (0.40.0) A Drag setting: walk that way, or pull the map.
- [x] **Visible achievements.** (0.41.0) A trophy counter, an Awards tab, a bigger banner.
- [x] **Explain the trail.** (explained in chat, 2026-10-13; its short reach is the open question) Explain and visualise how dragging from Gather to
      draw a trail on the map works now.
- [ ] **Redesign the UI.** Take inventory of every UI page and redesign it all.
      Mobile-first and modern.

## Side quests

- [x] **Favicon and app icon.** (0.34.1)
- [x] **Home ground is sealed.** (0.34.3) No digging down from the stockpile area and
      no surfacing into it; deeper layers under it are fine.
- [x] **Milestones pop up.** (0.35.0) Earning a milestone shows a congratulations
      banner at the top of the screen, not just the sound.
- [x] **Play button in the wiki.** Easy to spot on mobile and desktop. (0.36.1)
- [x] **Forest milestone needs a forest.** Fossil wood underground no longer earns
      "Gather wood from the forest". (0.36.2)
- [x] **Right icon in Safari Favorites.** (0.36.3) It showed another bitkojine.github.io
      project's icon; icon URLs are now cache-busted per deploy.
- [x] **Share menu doesn't break the game.** (0.36.4) Safari's Share sheet runs its own
      scripts in the page; their hidden "Script error." is no longer taken for a crash, and
      a real crash report names the error, where it was thrown, the version and browser.
