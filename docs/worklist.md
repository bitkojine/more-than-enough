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

## Wiki

- [x] **Find every mention.** (0.27.0) Searching a term (e.g. "overclock") should show
      everywhere the wiki mentions or uses it.
- [x] **Readable costs.** (0.27.1) It's unclear which icon belongs to which number.
      Group each amount with its resource visually.

## Upgrades

- [ ] **Show what's still needed.** Upgrade costs should show how much more of
      each resource you still need to collect, not the total price.
- [ ] **Embark unlocks late.** Starting a new world should take a very long
      time to unlock and stay hidden while you're still unlocking and
      upgrading. It should feel special.

## Stockpile

- [ ] **A home zone.** The stash needs its own zone, so it doesn't cover
      resources you can still gather from in the middle of the forest.
- [ ] **A stable stash.** Piles shouldn't jump around and merge so often as you
      gather. Reorder once in a while, so the stash looks settled.
- [ ] **Gathered stuff flies to the stockpile.** Collected resources should fly
      to the stockpile and settle there, not to the player.

## Underground

- [ ] **Taller layers.** Underground layers are shorter than the player
      character, and so are the cliff faces seen from the forest edge. Make
      every layer at least tall enough for the player.
- [ ] **Drill as you walk.** Walking into a wall should mine it, so you never
      have to take your thumb off the joystick to tap each block.
- [ ] **No holes under buildings.** You can't dig down or up through a tile
      that has a building. No entry or exit shares a tile with a building.
- [ ] **No holes in water.** Never dig down or up where there's water.
- [ ] **Digging takes work.** Making a hole should take more steps, at least
      time, so holes aren't everywhere.
- [ ] **Dark tunnels.** Tunnels are always dark unless you light them.

## The world and its look

- [ ] **The lantern only when needed.** The wanderer holds the lantern only at
      night or underground.
- [ ] **No decoration you can't collect.** Mushrooms, grass blades, flowers:
      everything shown must be collectible, or not shown at all.
- [ ] **Many kinds of trees.** Different forests, and different trees within a
      forest, like real nature. Not just biomes.
- [ ] **A boat to scale.** The sail sits too low. Size the boat and all its
      parts against the wanderer.
- [ ] **Mobs.** Add mobs to discover and learn from, drawn from the
      angels-and-demons tarot matrix (72 day angels of the Shem HaMephorash, 72
      night demons of the Ars Goetia, two of each on every minor-arcana card,
      36 decans). Tie them to the day/night cycle.

## UI

- [ ] **Explain the trail.** Explain and visualise how dragging from Gather to
      draw a trail on the map works now.
- [ ] **Redesign the UI.** Take inventory of every UI page and redesign it all.
      Mobile-first and modern.
