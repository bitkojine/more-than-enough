# Changelog

## [0.60.0] - 2026-10-14

### Added
- **A soundtrack.** Every kind of place has its own composed tune, taking
  RuneScape's lessons (see docs/music.md): *Meadowsong* on open land by day,
  *Under the Boughs* in the woods, *Rowing Song* on the water, *Starlit Hush*
  at night, *Seams of Light* in the first mine layers and *The Deep Dark*
  from the third layer down. The music follows you, fading into the next
  place's tune, and the band varies each time through so it doesn't wear
  thin. The first time you hear a track, the game tells you its name.
  Gathering now plays along in the music's key. It is synthesized in the
  browser, so it adds nothing to download. *Music* in Settings shows what is
  playing and turns it off. In English and Lithuanian.

### Removed
- The hum of your buildings, replaced by the music.

## [0.59.2] - 2026-10-14

### Changed
- **A proper pickaxe.** The pickaxe (its icon and the one your wanderer
  swings) is redrawn as a classic double-pointed steel head on an all-steel
  handle with a wrapped grip and a round pommel, so it reads clearly even
  small. No wood anywhere.

## [0.59.1] - 2026-10-14

### Changed
- **Friends have names.** Every player in a shared world gets a nature name
  (Moss, Fern, Fox, Firefly… or in Lithuanian Samana, Papartis, Lapė,
  Jonvabalis…), shown in the game's language on their chip, on their badge at
  the screen's edge and in messages such as "Fox joined". Never two alike in
  a world, and the same on every phone. No more "1" and "2".

## [0.59.0] - 2026-10-14

### Changed
- **Resources are scarcer and come in clusters, so you have to explore.**
  Forests grow in groves with open heath between them, and stone, ore and
  crystal only crop up in patches of mineral country with barren land in
  between. Home still has a little forest, stone and ore close by to get
  started; further out, deposits get much richer, ore gets commoner, and
  crystal only shows up at all from about 40 tiles out. Underground, seams
  now run in veins and beds instead of a speckle on every tile, ore and
  crystal grow commoner the deeper you go, and each area hides up to two
  finds instead of three. Saves from before this start a new world.

## [0.58.0] - 2026-10-14

### Changed
- **Characters act out what they do.** Mining rock, ore, crystal or dirt
  swings a pickaxe (pushing into a wall underground keeps chipping at it);
  foraging bends down to the ground with the basket; emptying a building
  reaches out for it; building or placing taps a hammer twice; milestones
  and upgrades get a happy hop. Going down a layer you drop in from above
  and land with a bounce; going up you climb out of the ground hand over
  hand. Walking leans into the step and sways, the boat rocks, and standing
  still you breathe, now and then look around and take a long look at your
  phone or laptop. Holding up the invite sign keeps you still, so it scans.
- Friends in a shared world play the same moves as they do them.

## [0.57.2] - 2026-10-14

### Changed
- **You can tell who's over there.** A friend off screen (or on another
  layer) now shows at the screen's edge as their own badge: a circle in their
  colour with their wanderer's face and their number, as on their chip, with
  an arrow on its rim pointing their way (and a small up or down arrow when
  they're on another layer). Asleep friends' badges are faded grey.

## [0.57.1] - 2026-10-14

### Changed
- **A friendlier invite.** The Invite button and the sign are a sunny sky
  blue instead of red, and your wanderer now holds the sign up in both hands
  in front of them instead of hoisting it over their head on a stalk (friends
  hold theirs the same way). It still scans from a friend's phone.

## [0.57.0] - 2026-10-14

### Changed
- **Invite is a main button, and the QR lives in the world.** A big red
  *Invite* button sits in the bottom-left corner, as easy to reach as
  Gather. Tap it and your wanderer lifts a mushroom-cap sign with the real
  QR code on it and *Scan to join my world* along the bottom; the view pans
  so the sign is clear of the top bar, and it's drawn bright even at night
  so a friend's camera reads it any time. Tap *Lower* to put it down. The
  first tap puts your world online. The separate QR screen and the Settings
  entry are gone (Settings still has *Back to the shared world* and *Leave*).
  In English and Lithuanian.

## [0.56.1] - 2026-10-14

### Fixed
- **Everyone is the same size, whatever they're doing.** A friend asleep
  (offline) was drawn smaller than everyone else, and an away friend shrank
  to "sit down". Both are now full size: an away friend dozes on their feet,
  leaning forward and nodding, with the little z's.
- Friends on water ride a boat like you do, instead of standing on the water;
  a friend who falls asleep at sea sleeps on their boat's deck.
- Holding up the invite sign works on the boat too.

## [0.56.0] - 2026-10-14

### Changed
- **One sky for everyone in a shared world.** Day and night now follow the
  world's own clock, kept by the room service, so every player has the same
  time of day: when it's night for you, it's night for your friends. The
  clock starts at the time of day the world was put online and keeps going
  whether anyone is playing or not; a phone that slept or reconnects catches
  up at once.
- Which copy of your progress is newer when you come back to a shared world
  is now decided by how long you've played, not by the clock.

## [0.55.0] - 2026-10-14

### Changed
- **Your screen lights the way.** The lantern is gone: your character
  always holds the phone or laptop you play on (alone too, not only in shared
  worlds), and at night and underground its screen lights the pool around
  you. Texture packs drop `character.lantern`; the light's colour is now the
  `color` of `character.phone` and `character.laptop`. `Core.needsLantern`
  is now `Core.isDark`.

## [0.54.0] - 2026-10-14

### Added
- **You hold what you play on.** In a shared world every character holds a
  phone or a laptop, depending on what that player is playing on, so you can
  tell at a glance who is on what (asleep friends keep theirs by them too).
  A touch screen counts as a phone and a mouse or trackpad as a laptop
  (`src/game/device.js`). Positions sent to the room now carry `dev`, and the
  default texture pack has new `character.phone` and `character.laptop`
  pictures, drawn over the wanderer like the lantern.

## [0.53.0] - 2026-10-14

### Added
- **Always the newest version.** The game checks for a new deploy when it
  starts, every minute, when you come back to it, when you're back online,
  and when a friend joins your shared world. As soon as there is one it saves
  and reloads into it on its own, no asking, so nobody plays an old version
  (and friends in a shared world end up on the same one). Each deploy now
  publishes a `build.json` the game compares with its own build.

## [0.52.1] - 2026-10-14

### Changed
- Friend drawing tidied for anyone building on it: the marker diamond and
  the drifting z's (away) and Z's (asleep) are now small shared helpers in
  `src/game/render/sprites.js`. Looks the same.

## [0.52.0] - 2026-10-14

### Changed
- **Offline friends sleep in the world.** Like sleepers in Rust, a friend
  who goes offline stays right where they left, lying on the ground under a
  blanket in their colour that rises and falls, with big slow Z's. They're
  solid and always there (no more faint ghost), and their edge pin stays
  clear too. Their chip now reads "asleep (offline)".

## [0.51.1] - 2026-10-14

### Changed
- **Play together is switched on.** The room service is live on Cloudflare
  and the game talks to it; every deploy of it now ends with a smoke test
  against the live service (origin checks, room creation, invite-only joins).

## [0.51.0] - 2026-10-14

### Added
- **Play together.** Settings → *Play together* puts your world online;
  your wanderer lifts a sign with a QR code, a friend scans it with their
  phone's camera and lands next to you. Up to four players share one world
  (built for four, tested with two), each with their own packs, tools and
  upgrades; buildings work for whoever built them. You see each other move
  in real time, and how each friend is doing: online, away (sitting, with
  z's), connection lost (flickering under a spinning arc) or offline (a
  ghost where they left), with sparkles when they come back. Friends off
  screen or on another layer get a pin at the edge. The world never stops
  for anyone leaving, a lost connection comes back by itself, and you can
  return to a shared world any time from Settings. No Embark in a shared
  world. In English and Lithuanian.
- **The room service** (`server/`): a Cloudflare Worker with a Durable
  Object per shared world. It checks every message, limits how fast and how
  much anyone can send, lets new players in only with a QR code that works
  for 10 minutes, and lets the owner remove a player. See
  `server/README.md`.

### Security
- The page has a Content-Security-Policy and sends no referrer.

## [0.50.0] - 2026-10-14

### Changed
- **The game asks its own questions.** Stage 3 of the UI redesign
  (`docs/ui.md`). Embark and Reset world no longer use the browser's
  pop-up: a card in the middle of the dimmed map says what will happen,
  with Cancel first and the answer beside it (red for Reset world).
  Tapping outside the card or Escape cancels. The choice between two
  tabs' worlds and the texture-pack problem report use the same card.

## [0.49.0] - 2026-10-14

### Changed
- **Every sheet looks the same, like a game's panel.** Stage 2 of the UI
  redesign (`docs/ui.md`).
  - The tabs are one segmented control at the top of the sheet, beside a
    round **×** that closes it. The Done button at the bottom is gone, so
    the lists get the whole height. Settings and Collected show their
    title there instead of tabs.
  - Every row is a card: upgrades, buildings, awards and collected
    resources. A family's upgrades sit indented under its card.
  - The sheet keeps one height whichever tab you are on, so switching tabs
    no longer makes it jump. Settings takes only the room it needs.

## [0.48.0] - 2026-10-14

### Changed
- **A new heads-up display, laid out like a mobile game.** The first stage
  of a redesign of every screen (the plan is in `docs/ui.md`).
  - **Top bar**: the trophy (with its count on a badge) on the left, all
    four resources in one bar in the middle, and a **gear** on the right.
    Big numbers are kept short there (12.3k). On narrow phones each
    resource's picture sits over its count.
  - **Settings** has its own screen behind the gear: Sound, Drag,
    Language, Textures and the Wiki as rows with their current value, the
    version at the bottom, and **Reset world** set apart from the rest. The
    game's lists no longer carry nine buttons of settings under them.
  - **Thumb cluster**: the big action in the corner, Build and Upgrade to
    its left, and the climb button popping in above them only beside a way
    up or down, instead of an empty space held for it. Every button's
    name sits on a small plate across its bottom edge.
  - **Zoom** is a slim + / 1× / − column on the right edge.
  - **Underground**, the depth number and the column of layers are one
    meter on the left edge.
  - Messages appear under the top bar instead of over the middle of the map.

### Removed
- The studio and version badge from the top of the screen (it is in
  Settings now).

## [0.47.1] - 2026-10-14

### Fixed
- **Zooming out no longer turns blocky all at once.** Past a certain zoom
  the map used to drop straight from full detail to big flat squares two
  tiles wide. Now the zoomed-out view keeps every tile's own picture (trees,
  rocks, water, piles) and just gets smaller as you pinch out. To stay
  fast, it is drawn once into an off-screen map and kept up to date a
  little each frame, so a frame costs about the same however far out you
  are.

## [0.47.0] - 2026-10-14

### Removed
- **Tilting the view.** The tilt button, the two-finger up/down tilt, the
  T key and Shift + scroll are gone. The game keeps its one view, leaning
  slightly as it always started. Two fingers now only zoom. A tilt saved
  in your browser is ignored and dropped on the next save.

## [0.46.0] - 2026-10-14

### Added
- **English and Lithuanian, everywhere.** Every word the game shows is in
  both languages: the HUD, every sheet and card, toasts, goals, the share
  text, achievements, texture-pack errors, the crash screen and the whole
  wiki. Numbers follow the language too (1,5 tūkst. in Lithuanian).
- **Language button** in the sheet's utilities (and at the top of the wiki)
  switches between English and Lietuvių at any time. Your game is saved
  first and you stay right where you were. The choice is remembered; the
  first visit follows your browser's language.

### Changed
- **A missing translation fails loudly.** `npm test` fails if a string is
  missing in either language, if a placeholder or plural form differs, or
  if any player-facing text bypasses the translation layer. In the game, an
  unknown key throws instead of showing a blank.

## [0.45.0] - 2026-10-14

### Changed
- **The climb button shows only where it works, and says the right way.**
  It appears when a way between layers is within reach and is hidden
  everywhere else (it keeps its spot, so the other buttons never move).
  Underground beside an open shaft it now says CLIMB DOWN; it used to say
  CLIMB UP there, dimmed. Pressing it takes the way in reach, so you no
  longer have to stand right on it.
- **Ways up and ways down are spread out.** On every layer, a ladder up and
  a way down are now always at least 5 tiles apart, so finding the next one
  takes exploring. Shafts and cave mouths moved to make room; anything
  already opened keeps working.
- **Steel ladders.** Ladders, and the climb button's icons, are steel now
  instead of wood.

## [0.44.0] - 2026-10-14

### Added
- **Fifteen kinds of mushroom to find.** Every forest patch grows its own
  kind at the trees' feet, by the kind of forest: fly agarics and penny buns
  under pines, chanterelles and honey fungus in birch groves, parasols,
  morels and oyster mushrooms in warm country, ink caps and puffballs where
  forests mix, and the uncommon indigo milk cap. Two **magic** mushrooms, the
  Liberty cap and the Moonlight cap, are rare in any forest. Spore beds in
  the mine hold glowcaps, ghost fungus and, deep down, the magic crystal cap.
  You see each kind growing on the map, and the first of each kind you ever
  pick is celebrated. The kinds you've found carry over when you embark.
- **Tap a resource counter to see what you've collected.** The counters at
  the top still show the totals; tapping one opens **Collected**: what you
  hold, what this world has given you and where it came from (by hand, from
  finds, from buildings, from the Abundance Engine), and for mycelium a card
  for every kind of mushroom, with how many you've picked. Kinds you haven't
  found yet show as shadows with a hint of where they grow.
## [0.43.0] - 2026-10-14

### Changed
- **Find your way down; you can't dig it.** There's no more digging down
  from the forest or up through the ceiling. Every way between layers is now
  part of the world, and you discover it by exploring: **cave mouths** in the
  forest (most stretches of open land have one, never in water, mountains or
  home ground) lead to the first layer, and the mine's shafts lead deeper, as
  before. Directly beneath every cave mouth and shaft is the foot of a
  **ladder up** back to it, so every layer connects to the next both ways,
  all over the map. Stand on one and the layer button says CLIMB DOWN or
  CLIMB UP, or tap one within reach. Anywhere else the button dims. Holes
  dug in older saves keep working both ways. DIG DOWN, DIG UP and the dig
  timer are gone.
- Torches, lamps and flags can't be placed on a way between layers.

## [0.42.0] - 2026-10-14

### Changed
- **No more cutting down trees.** Wood and logs are gone from the game.
  Forests still stand everywhere they did, but a tree is never cut: what you
  gather in a forest is the **mycelium** growing on its floor, the mushrooms
  at the trees' feet. Forage a patch bare and the trees keep standing; the
  mushrooms grow back near you. Mycelium takes wood's place everywhere, at the
  same amounts, so the progression plays the same:
  - the **Axe** is now the **Basket**, the **Lumber Camp** a **Mushroom
    Garden**, the **Sapling Grove** a **Compost Heap** and **Silviculture**
    **Mycology**;
  - **torches** are now **glowcaps**, glowing mushrooms you plant in a tunnel,
    and they pulse slowly instead of flickering;
  - **fossils** in the deep mine are now **spore beds** of cave mushrooms;
  - the stockpile piles up mushrooms, baskets and mycelium bricks, all the way
    to a mushroom house, instead of logs and a woodshed.
- Forest kinds are named Pine, Oak, Maple and Mixed *forest* rather than *wood*.
- Saves carry over: a world saved before this update loads with its wood,
  Axe, camps, groves and torches renamed one for one.

## [0.41.0] - 2026-10-13

### Added
- **Milestones are easy to see.** A trophy in the top-left corner counts the
  milestones you've reached and glows after a new one until you look; tap it
  for the new **Awards** tab, which lists every milestone reached, newest
  first, and how many are left (which ones stays for you to find). The
  milestone banner is bigger, has a trophy, says which one of how many it is
  ("Milestone 3 of 27"), pops in, and stays up for 6 seconds instead of 3.5.

## [0.40.0] - 2026-10-13

### Added
- **Gather by touching the map.** Players reach for the resources on the map,
  not the Gather button, so the map now does it all: tap a tree or rock out
  of reach and you walk over and gather it when you get there (a building
  with goods waiting is collected the same way), and hold a finger still on a
  tile to keep working it, like holding Gather.
- **A Drag setting for which way dragging moves you.** At the bottom of the
  sheet, Drag switches between *walk that way* (the joystick, as before) and
  *pull the map*, where the map follows your finger like scrolling and you
  walk the other way. It's remembered in this browser.

## [0.39.1] - 2026-10-13

### Fixed
- **The game draws again.** v0.39.0 went out with a merge left half-done in
  the renderer, so the page couldn't load its drawing code. A unit test now
  fails on any merge-conflict marker left in the code.

## [0.39.0] - 2026-10-13

### Added
- **More to place in the mine.** The Build sheet's torch row is now an
  **In the mine** section with three things, each placed on the tunnel floor
  where you stand: the **torch** (3 wood, lights 4.5 tiles), a **crystal
  lamp** (8 stone and 1 crystal, lights 8 tiles: a whole cavern) and a
  **marker flag** (2 wood), whose red pin shows through the dark over it and,
  when it's off screen, waits at the screen's edge pointing the way back.
  New `mark.lamp` and `mark.flag` looks; the wiki's Underground page lists
  them.

### Changed
- Torches are now one kind of placed thing (`PROPS` in content.js); saves
  keep their torches.

## [0.38.3] - 2026-10-13

### Changed
- **Holes show when zoomed out.** Pinched out, a hole was a dot too small to
  see, so you couldn't tell where you could go up or down. Now every hole on
  your layer keeps a mark of readable size, drawn over the dark: a dark pit
  with its ladder going down, light with its ladder reaching up, or both for
  a hole in a column.

## [0.38.2] - 2026-10-13

### Changed
- **Buttons you can press look like buttons.** Craft, Place, Refine and the
  rest were pale tints that didn't read as pressable. One you can press now is
  solid bright green and raised, and sinks when tapped; one you can't afford
  yet is flat with a dashed outline.
- **A dot says when a menu is worth opening.** BUILD and UPGRADE wear a green
  dot while there's something in them you can place or buy right now.
- **Upgrade families open by themselves** while they have something to buy
  (unless you've opened or closed one yourself), and their open/close arrow
  is a clear round button.

## [0.38.1] - 2026-10-13

### Changed
- **Gems no longer look like water.** Crystal was icy cyan on blue-grey
  ground, the same colours as the lakes. Crystals, their seams, piles, icon
  and the Resonator are now rose-pink gems on dusky mauve rock.
- **Rocks look mined.** A boulder, ore rock or crystal cluster looked the
  same from its first swing to its last. Every swing now shakes what it hits
  (trees too) and knocks chips off it, and stone, ore and crystal shrink as
  the deposit runs down, to half size before it's worked out.
- **What you see is what you get.** The stone icon was a cut block while
  stone in the world was round boulders, and ore rocks only had a thin
  orange vein. Boulders, pebbles and stone seams are now the same faceted
  grey rock as the stone icon; ore rocks are studded with the ore icon's
  nuggets; crystal clusters are made of the crystal icon's gem.
- **Digging dirt says it holds nothing.** Digging plain soil underground used
  to give no sign why nothing came of it. Its clods are now tossed aside with
  a dim +0, and the wiki says soil only clears the way.

## [0.38.0] - 2026-10-13

### Added
- **Finds to dig toward.** Every 16×16 area of each mine layer now hides up
  to three finds in the rock: **buried caches** (wood, stone and ore) on every
  layer, and **geodes** (stone and crystal) from layer 2 down. They glint in
  the dark from up to 9 tiles away, even through rock you haven't uncovered,
  so there's always something close to head for. One dig breaks a find open
  and pays it all at once, scaled by the layer and your tools, with a burst of
  sparks and the haul held on screen long enough to read. New `tile.cache`
  and `tile.geode` looks; the wiki's Underground page has a Finds section.

## [0.37.3] - 2026-10-13

### Changed
- **Digging carves; it never builds walls.** The mine used to float over the
  dark like the forest, so every tile you dug revealed new rock standing up
  around you, as if you were putting up walls. Now the mine is drawn as one
  mass of rock: rock you haven't seen is a dark block, rock you have seen is
  a shade darker than the floors you dug, and no cliffs fall away at the edge
  of what you know. Tunnels read as cut down into the rock.

## [0.37.2] - 2026-10-13

### Changed
- **What you pick up stays up long enough to read.** The "+1" over a gathered
  tile vanished in under a second, and quick swings stacked into a blur of
  "+1"s. Gains of the same resource in quick succession now add up on one
  label (+1, +2, +3...), which pops as it grows, hangs above the tile for a
  couple of seconds after the last gain, and is bigger with a darker outline.
  Collecting and Trails count up the same way, one label per resource.

## [0.37.1] - 2026-10-13

### Changed
- **The zoom readout reads as zoom.** It showed a bare "100%" that players
  didn't recognise. It now shows a magnifier and the magnification (1×,
  1.25×, 0.64×), and tapping it goes back to 1×.
- **The performance panel is out of play.** Tapping the version badge used to
  open a panel of frame timings ("logic", "draw", milliseconds) that players
  opened by accident, and it stayed open. The badge is just a label now: press
  F3, or open the game with `?perf` in the address on a phone, and the panel
  is no longer remembered between visits.

## [0.37.0] - 2026-10-13

### Added
- **You see yourself go deeper.** Going between layers used to cut straight
  to the new one, like walking into another room. Now the layer you left
  slides away, the rock you pass goes by (one slab per layer, with the shaft
  and its ladder down the middle) and the new layer slides in: up past you
  going down, down past you climbing up.
- **A depth gauge.** Once you've been down, a column on the left edge shows
  the layers as a stack: the forest on top, every layer you've reached, a
  dashed one for deeper still, and yours lit.
## [0.36.7] - 2026-10-13

### Changed
- **The mine is really dark now, so torches matter.** Your lantern used to
  light everything you could see underground, so a torch added nothing. The
  lantern now lights only a small pool at your feet (about two tiles across,
  down from six) and tunnels a few steps behind you sink back into the dark.
  Torches reach further than before (4.5 tiles, up from 3.5) and flicker, so
  a lit stretch of tunnel reads as somewhere you've made your own. The night
  forest is unchanged.

## [0.36.6] - 2026-10-13

### Changed
- **Holes stacked in a column read clearly.** A hole with another hole above
  it used to show only its dark pit, hiding the light from the ceiling, so in
  a column dug straight up or down you couldn't tell a way down from a way
  up. Every hole now has a ladder in it (a new `mark.ladder` picture): a
  plain pit shows it going down, a skylight shows it standing in the light up
  to the opening, and a hole in a column shows both: the pit ringed with light
  pouring into it and the ladder running on up into the beam.

## [0.36.5] - 2026-10-13

### Changed
- **The layer button says what it will do.** It used to read MINE in the
  forest and UP underground, whatever was there. Now it reads DIG DOWN on
  open ground, CLIMB DOWN when you stand on a hole that's already there, and
  underground CLIMB UP under a hole in the ceiling or DIG UP where it will dig
  a new one, each with its own icon. The wiki describes the four.

## [0.36.4] - 2026-10-13

### Fixed
- **Opening Safari's Share menu no longer shows "The game broke".** On iPhone,
  Safari runs its own and share extensions' scripts inside the page when the
  Share sheet opens. When one of those threw, the browser reported it to the
  game only as "Script error." (it hides other sites' errors), and the game
  took it for its own crash. Errors from scripts that aren't the game are now
  logged to the console and play goes on.
- **The crash report says what broke.** It now gives the error's kind and
  message (Safari's stack trace leaves both out), the file, line and column,
  the stack, and the game version, time and browser at the top, so a report
  can be acted on.

## [0.36.3] - 2026-10-13

### Fixed
- **The right icon in Safari Favorites.** Every project on bitkojine.github.io
  shares one host, and Safari caches icons per host, so a favorite could show
  another project's icon. Deploys now stamp the build hash onto the icon and
  manifest URLs (and the manifest's icon URLs), so Safari fetches this game's
  icon afresh, and the home-screen icon declares its 180×180 size.

## [0.36.2] - 2026-10-13

### Fixed
- **"Gather wood from the forest" waits for a forest.** Wood dug out of a
  fossil deep underground no longer earns the first milestone; it completes
  the first time you gather wood from a forest tile.

## [0.36.1] - 2026-10-13

### Changed
- **Easy to get from the wiki into the game.** A big green "Play the game"
  button sits at the top of the wiki's sidebar on desktop and floats in the
  corner on phones, on every page, and the wiki's home page has its own
  "Play now" button. The wiki shows the game's icon by its name.
- The key-repeat browser test measures the time that actually passed instead
  of assuming it, so a busy machine doesn't fail it.

## [0.36.0] - 2026-10-13

### Added
- **Many kinds of forest.** Forests now differ by region: pinewood (pines and
  spruce, on a dark needle floor) in cold country, birch groves in wet mild
  country, oak woods with the odd apple tree in warm wet country, maple woods
  in red and gold in warm dry country, and mixed wood where they meet. Each
  mixes its own trees, so trees vary within a forest as well. New trees:
  spruce, birch, oak, maple (red and gold); the old fruit tree is now the
  apple tree. All forests still yield wood the same way.
- Texture packs: each kind is its own thing (`forest.pinewood`,
  `forest.birchwood`, `forest.oakwood`, `forest.maplewood`,
  `forest.mixedwood`) with its trees (`stand`) and optionally its own ground
  (`top`) and stumps (`cut`); anything left out comes from `tile.forest`.

## [0.35.1] - 2026-10-13

### Changed
- **A boat to scale.** The wanderer now stands in the boat at full size (they
  were shrunk to 80%), and the boat is redrawn around them: a hull about a
  body and a half long, and a mast and sail reaching well above their head
  (the old mast barely cleared it). A test checks the mast against the
  wanderer picture's height. Packs: the deck is now 16% up the boat picture.

## [0.35.0] - 2026-10-13

### Added
- **Milestone banners.** Reaching a milestone now also shows a banner under
  the counters ("Milestone" and its name) for a few seconds, alongside the
  sparks and fanfare. Several at once take turns. It only celebrates what
  you've done; it never says what's next.

## [0.34.3] - 2026-10-13

### Changed
- **Home ground is sealed.** You can't dig down from the stockpile's clearing
  or come up onto it from below, so the stash's ground stays whole. Deeper
  layers under it connect like anywhere else. Tiles say so with a new
  `sealed` rule; home ground no longer has `dig`.

## [0.34.2] - 2026-10-13

### Changed
- **Nothing shown that you can't collect.** Grass tufts and flowers, reeds in
  the water and mushrooms in the tunnels are gone, and grass no longer has
  blades or flowers painted on it. The rule is enforced for every texture
  pack: only tiles you can gather (forest, stone, ore, crystal) may have a
  `stand` picture; a pack that puts one on any other ground is rejected,
  naming it.

## [0.34.1] - 2026-10-13

### Added
- **An icon.** A stacked log pile topped with a crystal, in lantern light:
  the favicon (SVG, with a PNG fallback) for the game and the wiki, the
  home-screen icon on iPhone, and a web app manifest with regular and
  maskable icons, so the game can be added to a home screen and opens full
  screen as "Enough". `scripts/icons.sh` renders the PNGs from the SVGs.

## [0.34.0] - 2026-10-13

### Added
- **Dark tunnels.** Underground it's always dark, at any time of day, except
  for your lantern's pool, light falling through holes in the ceiling (from
  the forest, it fades at night) and torches.
- **Torches.** Place one where you stand in a tunnel from the Build sheet's
  new Light section (3 wood). It lights the tunnel around it for good and is
  saved with the world. Texture packs draw it as `mark.torch` (picture and
  light colour).
- **The lantern only when it's needed.** The wanderer carries the lantern at
  night and underground, and puts it away by day. It's its own picture now
  (`character.lantern`, with a light colour), drawn over the wanderer.

### Changed
- Light and dark are drawn as one low-resolution mask with every light cut
  out of it, so any number of lights cost about the same.

## [0.33.0] - 2026-10-13

### Changed
- **A new hole takes work.** MINE (and UP through solid ceiling) no longer
  opens a hole at once: you dig for 2.5 seconds with the first Pickaxe
  (divided by the square root of its level, about 1 s at level 6), with a
  shovelful of dust and a thud every 0.4 s, a ring filling around the button
  and the pit opening at your feet. Step off the spot and you stop. Going
  through a hole that's already there is still instant.

## [0.32.2] - 2026-10-13

### Fixed
- **Choosing the other tab's world takes one tap.** If the other tab was
  still open, it kept saving while this one asked, and picking its world
  adopted the save from when the question appeared, which the next save then
  found out of date, so it asked again. The choice now takes the newest save
  at the moment you pick, and the figures refresh while it asks.

## [0.32.1] - 2026-10-13

### Fixed
- **No holes under buildings.** You can't dig down under a building or up
  into one, and you can't build under a hole in the ceiling (building on a
  hole was already ruled out), so a way between layers never shares a tile
  with a building.
- **No holes in water.** Digging up from below can no longer come out in
  water (digging down from water was already impossible).

## [0.32.0] - 2026-10-13

### Added
- **Drill as you walk.** Underground, keep pushing the stick (or a direction
  key) against a wall for 0.3 s and the tile in front of you is dug out, so
  you can tunnel without taking your thumb off the stick. Bedrock never
  gives, and a shaft still opens only to a deliberate tap.

## [0.31.2] - 2026-10-13

### Changed
- **Layers to scale.** A layer was 0.6 tiles high, shorter than the wanderer
  standing in it. It's now 1.5 tiles, so at full tilt a tunnel wall shows
  1.17 tiles: the wanderer (0.94) plus headroom. Cliffs seen from the forest
  edge grow with it. A test checks the layer against the wanderer picture's
  real height.

## [0.31.1] - 2026-10-13

### Changed
- **Gathered goods fly to the stockpile.** What you gather (and what
  buildings hand over) now arcs from where it came from to its pile in the
  yard (the smallest pile of that resource, where single units land), and
  lands there, instead of flying to you. From far away they head off screen
  toward home.

## [0.31.0] - 2026-10-13

### Changed
- **A stable stash.** The stockpile no longer re-lays itself whenever an
  amount changes. Piles that are still needed stay exactly where they are,
  new ones take the best free spot, and only piles that go (spent, or ten
  merged into one) disappear. About every 90 seconds the yard tidies itself,
  biggest piles back in the middle.

### Fixed
- **Sound after a reload on iPhone, for real this time.** Tested in iOS
  Safari (simulator): after a reload, tapping the map didn't start the sound,
  because Safari only sends a click (its proof of a gesture) to elements it
  considers clickable, and the map wasn't one. The map now is, so the first
  tap anywhere starts the sound. A drag alone still doesn't (Safari's rule).
- "Default textures" switched the look before forgetting the saved pack, so
  a quick reload could bring the old pack back. It now forgets first.

## [0.30.0] - 2026-10-13

### Added
- **Home ground.** Every world starts you in a round clearing of packed earth
  where nothing grows and nothing can be gathered: it's where your stockpile
  is kept. The stockpile fills it first, then spills onto open grass around
  it, and it never stands on anything you can gather, so a pile never hides
  a resource you could still work. Converters can't be built on it (it's
  kept for the stockpile); you can still dig down through it.
- Surface tiles say explicitly whether you can dig down through them (the
  `dig` rule), instead of borrowing the converters' `land` rule.

## [0.29.0] - 2026-10-13

### Changed
- **Embark is the end of a world.** The Beyond tab (and the Legacy family in
  Upgrades) stays hidden until the world is mastered: every tool, refinery
  level and unlock bought, and the Abundance Engine at 5. Embarking then
  also needs 1,000,000 resources gathered in the world (was 20,000). Until
  then the Embark row shows how far along you are. After the first Embark,
  Beyond stays for the perks.
- The last milestone is now "Master the world".

## [0.28.0] - 2026-10-13

### Changed
- **Prices show what you still need.** Every price in the sheet is a row of
  pills, one per resource, picture first. While you're short, each pill
  shows how much more of that resource to gather, and resources you already
  have enough of show a tick. Once you have it all, the pills turn green and
  show the cost. The sheet updates live as you gather (changed rows are
  patched in place, so a tap never lands on a button being replaced).
- The performance panel's sound line also shows how many touches tried to
  start the sound, the last kind, and the browser's last refusal.

## [0.27.1] - 2026-10-13

### Changed
- **Readable prices in the wiki.** Every amount sits in its own pill with its
  resource's picture first and is tinted in that resource's colour, so it's
  clear which number belongs to which resource.

## [0.27.0] - 2026-10-13

### Added
- **Wiki search finds every mention.** Typing in the search box lists each
  passage that mentions the words (paragraphs, list items, table rows,
  catalog cards), grouped by article with its section, the words marked.
  A result opens the article at that spot, with the words marked
  throughout. Searches have their own address (`#search/overclock`), so
  Back returns to the results. Pictures count by name, so "wood" finds a
  cost shown as a log.
- The wiki explains Overclock properly: it doubles what every building
  makes, per level, wherever the buildings are.

## [0.26.3] - 2026-10-13

### Fixed
- **Sound on iPhone without opening a menu first.** Safari only lets a page
  start sound from a touch that ends in a click, and the map and the Gather
  button cancelled their presses, so after every reload the game stayed
  silent until you tapped a menu button. They no longer cancel presses
  (scrolling and zooming stay off by other means), so the first quick tap
  on the map or Gather starts the sound. A drag or a long hold still
  doesn't count in Safari; that's the browser's rule.
- The performance panel shows the sound's state (`running`, `suspended`).
- The browser tests now enforce the gesture rule (headless Chrome otherwise
  lets any page play) and check that dragging, tapping the map, tapping or
  holding Gather and the keyboard each start the sound on a fresh page.

## [0.26.2] - 2026-10-13

### Changed
- **Tap the world to close the sheet.** Touching the map past an open sheet
  closes it, and that touch does nothing else (no walking, no gathering).

## [0.26.1] - 2026-10-13

### Fixed
- **No more flickering dials.** The dial over a building showed at half a
  unit of output and vanished when Logistics hauled it in, so with
  auto-collect it blinked many times a second. It now shows only output
  that waits for you (a whole unit or more, with nothing hauling it in).
- The dial's colours come from the texture pack (`color.dial`,
  `color.dialFull`), like everything else.

## [0.26.0] - 2026-10-13

### Fixed
- **Sound plays again.** 0.25.1 made the game silent: setting up the sound
  shared a name with the build sound, so the output was never connected.
  The browser tests now listen to what actually comes out (every sound must
  register on an output meter, mute must silence it), instead of only
  checking that audio was switched on.

### Added
- **Two tabs can't roll your progress back.** All tabs share one save. If
  another tab saved since this one did, this tab no longer overwrites it: it
  pauses and asks which world to keep, the other tab's or its own, showing
  time played and amount gathered and marking the one further along. Closing
  a tab while it asks saves nothing. If the other tab ran a newer version of
  the game, the choice is to reload into it.

## [0.25.1] - 2026-10-13

### Fixed
- **Sound starts as soon as the browser allows it.** The audio used to be
  set up only on certain presses, so a session that began with dragging could
  stay silent until you touched a button. Now it's made at load (playing at
  once where the browser permits), every kind of press wakes it, and it is
  nudged back by itself after the tab was hidden or the system took the
  audio. Notes are no longer queued while it's stalled, so nothing bursts
  out at once when it wakes.

## [0.25.0] - 2026-10-13

### Added
- **The stockpile.** Everything you own stands on the ground around home
  (where the world started you), on a logarithmic scale read like an abacus:
  each power of ten is its own kind of pile and each digit is how many of
  that kind there are, so 3,452 wood is 3 carts, 4 log piles, 5 bundles and
  2 logs. Biggest piles in the middle; new piles grow out of the ground and
  spent ones vanish in a puff. From ten million up a pile covers a square of
  ground one tile wider per power of ten, so a big enough surplus covers the
  map. It only shows what you have: nothing is hauled, nothing is blocked.
- The yard spreads over explored ground: open grass first, then forest,
  stone, ore or crystal (covering their trees and boulders) when grass is
  much further; never water, mountains, holes or buildings. Zoomed far out,
  piles are dots of their resource's colour.
- Lanternlight draws seven kinds of pile per resource (a log up to a lumber
  hall, a block up to a stone keep, a nugget up to a copper-domed vault, a
  shard up to a crystal spire). Texture packs set them with the new `tiers`
  slot of `pile.<resource>`.
- Wiki: **The stockpile**, with every kind of pile pictured.

## [0.24.0] - 2026-10-13

### Added
- **Texture packs.** The game defines what exists and what it does; a pack
  defines what it looks like. Every visible thing (69 of them: tiles,
  resources, buildings, the wanderer and boat, holes, buttons, upgrades,
  perks, colours) has an id and slots (`color`, `top`, `face`, `stand`,
  `cut`, `image`, `icon`) in a new catalog (`src/core/catalog.js`).
  Pictures can be SVG/PNG/WebP/JPEG/GIF files, inline SVG, data: or https:
  URLs, lists of variants (with `null` for nothing) or animations.
- **Lanternlight**, the default pack: hand-drawn SVG for everything. Real
  trees (pines, fruit trees), boulders, copper-veined ore rocks, crystal
  clusters, grass tufts, flowers, reeds and cave mushrooms standing on the
  ground; stumps and pebbles once worked out; textured ground, animated
  water, rock and earth cliff faces; a sealed shaft hatch; eight distinct
  buildings; a hooded wanderer with a lantern who walks; a sailing boat; and
  a full set of icons in one style.
- **Textures** in the sheet: load your own pack (a pack.json alone or with its
  pictures). It's checked first; any problem means it isn't used and a panel
  lists every problem by thing and slot. A good pack applies at once and is
  remembered (IndexedDB); **Default textures** goes back.
- Wiki: **Everything in the game** (every thing, what it does, its slots and
  default pictures) and **Texture packs** (the format, slots, pictures, and a
  download of the default pack as one self-contained file). Wiki tables show
  pack pictures instead of emoji.

### Changed
- No emoji anywhere: counters, buttons, the sheet, floating numbers and
  flyers all use pack icons. Milestone names lost their emoji.
- Buildings stand on the map as pictures with a small fill dial over them,
  instead of an emoji on a tile; trees and boulders under a building are
  cleared.
- Things standing on the ground are drawn after their whole row, so they can
  lean over neighbours without being cut off.

### Fixed
- The intermittent browser test for tapping a wall while tilted: it measured
  where the wall was on screen before the camera had drawn the new layer (so
  the tap sometimes landed a row off), and expected one tap to clear a wall
  that can take several. It now waits a frame and checks the tap dug in.

## [0.23.0] - 2026-10-13

### Added
- A wiki **Ideas** page: a sketchbook of where the game could go next (how
  things look, height and depth, mechanics, economy, and big swings), each
  with a rough size and what it builds on. Clearly marked as not in the game.

### Changed
- The known world is a plateau over the dark: unexplored tiles on every
  layer are empty darkness instead of flat fog or solid-looking rock.
  Explored ground with darkness in front of it drops as a cliff showing the
  layers beneath, fading out `CLIFF_LAYERS` down; the cliff shows what
  you've found (seen rock lit, visited layers dim, the rest dark bands, holes
  as bright gaps). Edges facing away catch a pale lip. Exploring covers old
  cliffs with new ground.
- The view always leans a little (`MIN_TILT`), so edges always read as
  cliffs; the tilt button swings between that and full tilt.
- Removed the cutaway slice in front of the player; cliffs replace it.
- Unexplored tiles read as flat for picking on every layer.

## [0.22.0] - 2026-10-13

### Added
- Holes between layers. MINE digs a hole at your feet and drops you into
  the layer below; underground the button becomes UP and climbs through the
  hole you came down, or digs a new one through the ceiling. From above a
  hole is a dark pit (tap it to drop through); from below it's a pool of
  light, and a beam when tilted. Stacked holes form a column you fall all
  the way down. Holes can't be gathered from or built on.
- Fog underground: every layer starts unexplored and is revealed within
  `MINE_EXPLORE_RADIUS` tiles of you; unseen rock reads as solid.
- Cutaway: tilted, the world is cut open a few rows in front of you and every
  layer shows as a band on the cut, lit where explored, dim where visited,
  dark where unreached, all the way down; underground the layers above show
  faintly up to the forest floor. Holes show as bright gaps between bands.

### Changed
- No more teleporting between the forest and the mine: the old "ride to the
  deepest layer" and "return to where you entered" are gone.
- Save format v5. No migrations during active development: older saves are
  rejected (the game says so) and a new world starts. Removed the v3/v4
  migrations and the legacy save key.

## [0.21.0] - 2026-10-13

### Added
- Tilt: the view swings from straight down to an angled 2.5D view. Use the
  tilt button beside zoom, a two-finger vertical drag, `T`, or Shift + scroll.
  Zoom and tilt are remembered per browser.
- Tiles have height (`TILE_INFO.height`, `tileHeight()`): undug rock stands a
  full layer tall around tunnels, mountains rise as uneven cliffs, and water
  sits below the bank. Tilted, south faces show, with rim light and contact
  shade.
- Tilted, taps and Trails pick the block you actually see (its top or its
  face), and the player shows faintly through walls in front.
- A performance panel on every device: tap the version badge (or press F3)
  for FPS, frame time and worst frame, logic and draw time, tiles drawn,
  screen and canvas size, and cores, memory and heap where the browser
  reports them.
- Fail loud: an error in the game stops it and shows what broke on screen
  (also for modules that fail to load), and a save that fails says so
  instead of losing progress silently. An old save is only removed after it
  was moved successfully.
- Browser tests fail loud too: every DevTools call times out naming what it
  waited for, a watchdog names the section a stalled run is stuck in, Chrome
  is cleaned up when the run is interrupted, and a boot check reports when
  the machine is too starved for the timing checks.

### Fixed
- Browser tests froze under Chrome 155 headless: the test tab is now kept
  focused so it keeps producing frames. The keyboard walk test now starts on
  a clear stretch of ground.

### Changed
- The camera projects `(x, y, height)` with a pitch; terrain draws row by row,
  back to front, with buildings and the player drawn in their row so nearer
  blocks cover them. The flat view looks the same as before.

## [0.20.0] - 2026-10-13

### Added
- A player wiki at `/wiki/`, linked from the sheet: controls, the screen, the
  world, gathering, the mine, buildings, upgrades, Beyond, milestones and
  saving. Its tables and figures are read live from the game's core, so they
  always match the version that ships with them.

### Changed
- No hand-holding: the game no longer explains itself. Removed the controls
  tutorial, the goal banner, on-map prompts, the Trail hint, the compass arrow,
  instructional toasts and descriptive text in the sheet. The sheet shows
  names, levels, numbers and prices only. Milestones are celebrated with a
  burst of sparks and a fanfare instead of being announced.
- Underground, a small `▼ n` marker shows the current layer.
- Underground rock shares now live in one exported table (`GEOLOGY`); the
  generated layers are unchanged.

## [0.19.0] - 2026-10-13

### Changed
- The world is now layered in one `(x, y, z)` coordinate system: the forest is
  `z = 0` and each mine layer sits directly beneath it. Entering the mine drops
  you into the rock under where you stand; each 16×16 area of a layer hides one
  shaft, and descending lands you directly below it. Tunnels you dig stay put.
- Tapping any reachable resource tile gathers it (previously only the nearest
  one did), and tapping elsewhere underground walks there.
- Rebuilt the code as ES modules: game rules in `src/core/` (pure,
  deterministic, Node-testable) and the browser layer in `src/game/`. Every
  purchase goes through one upgrade registry, and all drawing goes through a
  single camera projection.
- Unit tests moved to `node:test` (`npm test`); CI runs them before deploying.

### Fixed
- Holding Gather underground with nothing to dig no longer freezes autosave,
  effects, toasts and goal checks for as long as the button is held.
- While underground, the forest no longer reacts to your mine position:
  Logistics stopped collecting from surface camps near the world origin, fog and
  ore/crystal discovery stopped being revealed there, and regrowth no longer
  happens around it.
- Descending now requires standing within reach of the open shaft.
- Regrowth is deterministic (no `Math.random` in the simulation).
- An unreadable save now shows a notice instead of silently starting over.

### Saves
- Save format v4. v3 saves migrate automatically; a game saved inside the old
  mine resumes at its forest entrance, at the same depth.

## [0.18.2] - 2026-10-12

### Fixed
- Use underground tunnels for movement collision, so carved passages become
  walkable while solid mine tiles block movement. Underground travel no longer
  depends on the forest terrain beneath the player.
- Keep the surface water speed modifier from affecting movement underground.
- Explain tunnel movement in the mine tutorial and depth goal.

## [0.18.1] - 2026-10-12

### Changed
- Ordinary digging no longer drops into the next layer. Each layer now has a
  marked shaft that must be dug open and tapped separately to descend.
- Added distinct closed and open shaft visuals and clarified the tutorial.

### Fixed
- Preserve the player's time to explore and gather within each layer before
  choosing to go deeper.

## [0.18.0] - 2026-10-12

### Added
- Added an underground expedition to the existing forest world. The forest
  gathering, building, upgrades, and progression remain the main game loop.
- Reused the surface movement and Gather controls underground: tap nearby rock
  to dig, or hold Gather and trace to preview and sweep nearby rock. Underground
  finds join the shared inventory, and Surface returns to the saved forest spot.
- Updated the first-run controls tour and gameplay guide to explain the mine.

### Fixed
- Keep the Gather hold active underground until a tile is targeted, so the
  existing one-thumb trace gesture can start from the Gather button.
- Removed a duplicate underground trail highlight pass.

## [0.17.3] - 2026-10-12

### Fixed
- Prevent Safari and other touch browsers from selecting joystick labels or
  game UI text while dragging the controls or map.

## [0.17.2] - 2026-10-12

### Changed
- Removed unused depth metadata from the water-flow queue and asserted that
  opened water pockets become wet. No gameplay behavior change.

## [0.17.1] - 2026-10-12

### Fixed
- Autosave expedition movement and pressure every two seconds, and count the
  guided first dive as a started expedition.

## [0.17.0] - 2026-10-12

### Added
- **Endless deep-mine expedition.** Replaced the surface gathering loop with
  procedurally composed layers, connected tile-by-tile drilling, a surface hub,
  pressure risk, cargo weight, shared fuel, extraction, and permanent upgrades.
- **One-thumb mine controls.** Drag the bottom-right joystick to navigate; hold a
  visible tile to preview and drill a route; drag a packed charge to aim a blast.
- **Terrain reactions.** Pressure pockets can chain; water floods connected
  tunnels, enables swimming routes, and can reveal lost creature habitats.
- **Surface progression.** Successful extraction banks a small share of cargo;
  the hub offers permanent ship upgrades, station rooms, and charge crafting.

### Changed
- Replaced the prior save schema; existing saves start a fresh dive.
- Bumped the minor version for this new gameplay loop. Pages deploy continues to
  hash asset URLs automatically for cache busting.

## [0.16.1] - 2026-10-12

### Changed
- **Trail sweep radius named.** Replaced the inline hit-radius value with a
  descriptive constant. No behavior change.


## [0.16.0] - 2026-10-12

### Added
- **Freeform Trail sweep.** Hold Gather and draw anywhere across the world.
  Gatherable tiles within reach that the stroke crosses are highlighted green;
  releasing gathers those exact tiles. The controls tutorial explains the preview.
- **Safe browser-test startup on macOS.** The E2E runner now refuses to launch
  Chrome inside the Codex seatbelt sandbox, where macOS aborts during app
  registration and opens a crash dialog. Outside the sandbox, failed Chrome
  startup reports its exit status and captured diagnostic output.


## [0.15.2] - 2026-10-12

### Changed
- **Trail input cleanup.** Centralized the Gather button boundary check used by
  the Trail gesture handler. No behavior change.


All notable changes to MORE THAN ENOUGH, following [SemVer](https://semver.org/).

We are pre-1.0.0: **0.x** — the API/save-format may evolve between minor
versions. Patch bumps (0.4.1) are bug fixes only and never break saves; minor
bumps may change the save format (0.10.0 discards pre-0.10.0 saves — see below).

## [0.15.1] - 2026-10-12

### Fixed
- **Trail touch tracking.** Track pointer movement at the window so mobile
  browsers that keep a touch captured by Gather still draw and recognize Trail.

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
