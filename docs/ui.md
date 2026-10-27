# The game's UI system

How the HUD, the thumb cluster, the sheets and dialogs are laid out, and
why. Follow it when adding anything the player sees or presses: find the
place it belongs here rather than adding a button where there is room.

## Principles (from the best mobile games)
1. **Map first.** HUD hugs the edges; the centre of the screen is the game. (Hay Day, Stardew mobile, Clash.)
2. **Thumb zone.** Everything you press often sits in the bottom-right arc of a right thumb; the big action is biggest and closest. Contextual actions pop up *beside* the main button, they don't hold an empty slot. (Brawl Stars, PUBG Mobile, Genshin.)
3. **Status top, actions bottom.** Read-only info (currencies, depth, trophies) lives in a top bar; things you press live at the bottom.
4. **One currency bar.** All resources in one capsule, tap to see details. (Every F2P game.)
5. **Settings behind a gear.** Sound, music, controls, language, wiki: one Settings screen from a gear in the top-right. Irreversible actions ask first, in-game.
5a. **Technical things under Nerds.** Most players never need backups or the performance panel, so they sit on the *Nerds* screen, the last row of Settings, not on Settings itself. Anything new that only a tinkerer would touch (backups, diagnostics) goes there too.
6. **Badges, not prose, and only looking clears them.** A badge on a button says "something new here for you" and stays until you open what it points to; walking, spending or waiting never hide it. What you can do *right now, right here* shows where you do it (lit buttons in a sheet, Gather's label, Climb popping in), not as a badge. Green is something to do, gold is something reached or to read.
7. **One visual language.** Shared tokens: surfaces, borders, radii, shadows, type scale; one round-button style, one pill style, one primary button style.
8. **Every sheet looks the same.** Header (title + close ×), tabs, scrolling body. Swipe down or tap outside to close. A screen opened from Settings (Nerds, Worlds, Players, Invite links) has ‹ before its title, back to Settings.
9. **Back always steps back.** The phone's own Back and Escape go back one level: a screen inside Settings to Settings, a question says no, a sheet closes (`src/game/back.js`). Only with nothing open does Back leave the game.

## The system

### Layout (portrait phone)
```
┌──────────────────────────────────────┐
│ [🏆 3]  [🍄40 │🪨40 │🟠40 │💎40]  [⚙] │  top bar (safe area)
│                            v0.124.0 ●│  version, under the gear (● = news); by a
│                               ● in 0:18│  solar panel, the sun countdown in its place
│ ▮▯ 62%                               │  battery (once it isn't full), left edge
│ LAYER 1                              │  depth meter (underground only), under it
│ ▮                                    │
│ ▮                                    │
│                                      │
│               map                    │
│ ┌─ message log ──────────────┐   [+]│  the log: last 3 lines, left of the zoom pill
│ │ Wiki: …                    │   1× │  zoom: slim vertical pill, right edge
│ │ Milestone reached 3 of 12: │   [−]│
│ └────────────────── Hide ✕ ──┘   [▤]│  map button: out to the world map and back
│                      [CLIMB] [AUTO]  │  layer button pops in; AUTO only if on in Nerds
│                              [FLARE] │  underground or while one burns; above LIGHT/AUTO
│                              [LIGHT] │  (crystal worlds: the lantern in AUTO's place)
│ ( QR )   [BUILD] [UPGRADE] ( GATHER )│  invite (left thumb) · thumb cluster
└──────────────────────────────────────┘
```

### Gather, the main action, and AUTO above it
- **Gather** is the big round button. It shows what holding it does right where you stand: *COLLECT n* beside a building with goods, *GATHER +n* among a deposit (its picture is the resource), plain *GATHER* underground beside rock that pays nothing, *EXPLORE* with nothing in reach (one press walks to the nearest resource), dimmed with nothing around. Holding it repeats four times a second, and that is the fastest any control works a tile: pressing it again and again, tapping tiles or drawing Trails all take turns on the same clock (`src/core/pace.js`; Watch, 2026-10-26). Sliding off it draws a Trail.
- **The number on its plate is the short one** (9999, 4.7M, 1e15): a button has little room, and the earnings statement has the exact figures. The plate grows into the free space between the buttons and shrinks to fit when it has to — it never reaches past the screen's edge or over the plate beside it (`--cap-scale`, measured by the HUD).
- **AUTO** (Auto-play in longer text; *Perfect* in the code) is a smaller round button (the size of Build) centred right above Gather. It's hidden unless the player turns on *AUTO button* on Nerds (off by default, kept on the device; Watch, 2026-10-25), and never shows in a crystal world, whose rules its planner doesn't know. Its plate says AUTO in both languages. Holding it plays the game for you (`src/core/perfect.js` decides, `src/game/perfect.js` carries it out through the same calls a tap makes); letting go stops it. Manual play is untouched: steering, Gather, a tap, a finger held on a tile or a Trail take over while you do them, and it picks up again after. On a keyboard it's <kbd>P</kbd>; Space is Gather.
- **Its badge** (top-right of the button, a small circle) shows the picture of what it's doing or would do: a resource, Explore, Collect, Build, Upgrade, Wait, a layer arrow. No words: the badge is the status. Held, the button lights up and a dashed gold ring turns round it (still under reduced motion).
- **Holding is taught on every tap**: each quick tap (under 0.5 s) pops a bubble over the button, *Hold me down to auto-play* (phone or laptop wording, `tip.auto`), for 4 s (Watch: keep tapping, keep getting the hint).
- **In the world**: while it's actually playing (held, not paused by your own play, a sheet or Embark) a gold **AUTO tag** with a turning star floats over your character, above your name tag in a shared world (`drawAutoTag`).
- **Embark is yours**: when the world is ready, AUTO stops, its badge turns to Embark and the button pulses gold, with a line in the log once per world. It never presses Embark, nor anything that asks first, and waits while any sheet or dialog is up.

### Tokens
- Surfaces: `--surface` (glass panel), `--surface-raised`, `--line`.
- Ink: `--ink`, `--ink-dim`; accents: `--accent` (green, action), `--gold` (awards), `--earth` (depth), `--danger`.
- Radii: `--r-sm 10px`, `--r-md 14px`, `--r-lg 20px`, `--r-pill 999px`.
- Shadows: `--shadow-1` (HUD), `--shadow-2` (sheets/dialogs).
- Touch targets ≥ 44px (the slim zoom pill 40px); the main action 84px (76px under 375px wide, 72px on short landscape screens).

### Other screens
- **Zoom** (pinch, wheel, the pill's + and −; tap the readout for 1×) reaches in until a tile is 62% of the screen's height (at least 3×), so Mica fills over half of it, close enough to see face, grips and stitching. From 2× the view eases from Mica's feet to their middle (in full by 5×), so all of them stays on screen, and the 3D rig renders at up to 4× its usual pixels so it stays sharp.
- **Landscape phones** (height under 500px): the thumb cluster shrinks and the zoom pill lies down as a row above it, since a column would reach the top bar. The message log moves to the left of the screen, beside your character. Dialogs shrink their big pictures (the FBI badge) and never grow taller than the screen.
- **Narrow phones** (under 375px): resource chips stack picture over count without rates, and the cluster is a little smaller so Invite keeps clear of Build.
- **Tabs** size to their words (Lithuanian's are long), a little smaller on phones.
- **Checking it**: `npm run test:layout` opens the real game at 12 screen sizes in both languages, through the HUD, underground, every sheet and every dialog, a shared world full to its 100 players (chips and the Players screen) and a world with absurd numbers (the counts in scientific form, the Gather plate at its widest), and fails on overlapping or off-screen buttons, small targets, cut-off words, squashed rows, a plate shrunk to a smudge and dialog buttons out of view. Run it after any change to the layout.

### Upgrades and Beyond
- **Upgrades is a progression map**, not a shop list: one row per family (`PATH_FAMILIES` in `src/core/upgrades.js`) with its count (`3/8`); tapping a family opens its buy rows, and families with something to buy start open. Rows and the map read the same upgrade registry, so they can't disagree.
- **Beyond** (perks and Embark) stays hidden until the world is mastered, and never shows in a shared world. There are no in-world refunds: Embark is the respec.

### What's new on Build and Upgrade
- **NEW** (a small green tag, *NAUJA* in Lithuanian) on BUILD or UPGRADE: something there has become affordable that you couldn't get before. Every new level counts: a building, the next one of a kind, an upgrade's next level; water power once you've been on water. It counts only what goes on the layer you're on, as Build shows only that (Watch, 2026-10-26); where on the layer you stand doesn't matter (Watch, 2026-10-19).
- It stays until you open that sheet, where the rows that were new (and their family on the Upgrades map) carry the same tag while the sheet is open. Buying the thing, yourself or by AUTO, clears it too. What's been seen is kept per world on the phone (`src/game/fresh.js`); a world opened for the first time since this shipped starts with what it can afford as seen.
- The trophy has no such tag: it glows gold after a milestone until the Awards are opened.

### Messages
- **The message log** (Watch, 2026-10-26, like Old School RuneScape's chat box; `src/game/messages.js`): everything the game says goes in one log, a dark panel at the bottom left. In portrait it sits above the thumb cluster and left of the zoom pill; on short (landscape) and wide screens it keeps to the left of the screen, beside your character, above Invite when that's there. Each line has its colour: Wiki's in teal (*Wiki:* the thing, its line, *More in the wiki ›*), milestones in gold with a trophy (*Milestone reached 3 of 12:* what you did, then what's next; early on *Next milestone:*), and the game's own notices in plain ink (a low lantern, something you can't do yet, a save that failed, a friend arriving). There are no toasts or banners on top of the map any more.
- **Nothing goes by itself.** The open log shows the last three lines, newest at the bottom, never taller than the room under your character's feet (or under the depth meter and the top bar); dragging or scrolling inside it goes back through older ones (a new line then keeps your place; reopening the log shows the newest), and older lines are dimmer. The same line again stacks as ×2 rather than filling the log, and a long press sliding over the map keeps rewriting its one line. A press that simply worked says nothing (no "Done.").
- **Hide ✕** folds it into a small **Messages** pill in the same corner; while folded, new lines only raise the count on the pill, in Wiki's teal, and nothing opens it but a tap (Watch's choice). A new player starts with it open; open or folded is kept on the device, and so are the last 50 lines of each world. It hides while you place a building, hold up your sign or look at the world map.
- **Keep this world** (Watch, 2026-10-27): in Safari on an iPhone or iPad, not opened from the Home Screen, Wiki says once per device, as a milestone is reached (or a minute into a game already past one), to add Mica to the Home Screen, because Safari forgets a site left unopened for a week (`src/game/home-hint.js`). It is a line in the log like any other, never a dialog.
- Sheets and dialogs are solid: nothing on the map shows through a list.

### The lantern's charge
- The charge of the lantern you carry sits at the top of the left edge, above the depth meter, as a small tile as narrow as the depth pill: a battery that empties, its percent under it. It shows only once it isn't full: green, amber below the level where your light starts to shrink, red when nearly flat, sky blue while a charger fills it. It's status, not a button.
- The first time it gets low (and again after each charge back above that), one line in the log says the light is shrinking and where to charge it. Solar panels and water wheels are in the Build sheet's own *On the water* section on the surface, saying where they go while you aren't on water; mine lights are in *In the mine*, underground.

### The sun clock
- The Settings gear wears the day as a ring (Watch, 2026-10-26): noon at the top, gold for the part of the day the sun works, blue for the rest, and the sun (in the gold) or the moon (in the blue) riding it clockwise where the day is now. In older and shared worlds the gold is when a solar panel charges (and the lantern doesn't drain); in a crystal world it's the sun that cracks crystal and the heart in the open, which lasts longer. It shows always, on the surface and underground. The gear stays the same size and still opens Settings.
- Within charging reach of a solar panel, and no water wheel (which charges at every hour), a pill takes the version's place under the gear: a small sun and *in 0:18* until the sun starts charging, then *1:12 left* until it stops. It's status, not a button; the version comes back once you walk off. Early morning is the reason: it already looks light, but the panel isn't charging yet.

### Depth
- Underground, the depth meter sits on the left edge under the battery: a pill saying which layer you're on (*Layer 3*: a small capital label over a big number), and under it the layers as a column. The forest is on top in green (grass over earth), then every layer you've been down to in brown, a dashed one for deeper still; yours is lit gold with a small marker pointing at it. Over 12 layers, the column keeps the ones around you. On the surface the whole meter hides.
- Arriving on another layer names it briefly where region names go: *Underground* over *Layer 3*, or *Forest* over the region's name when you come up.

### Resource bar
- Tapping a chip opens the **earnings statement** at that resource; a small green chart at the bar's end (narrower than a chip) opens it at the top. The bar is the way in: no button of its own (Watch, 2026-10-19).
- One chip per resource: a 32px icon and count on one row on desktop, the per-second rate centred under the whole chip. At widths up to 600px, a 28px icon sits above the count in a 64px bar, keeping both legible without squeezing counts. Counts and rates are abbreviated to at most three digits (`fmtShort` / `fmtRate` in `src/game/format.js`: 9999, 45k, 4.7M, 12T, the same letters in every language), so the bar fits from 320px up in both languages. Past a thousand trillion a number goes scientific and keeps one digit (1e15), so it never grows past four characters either. Short landscape screens (up to 400px high) use a 50px bar and leave the rate out; icon size is preserved. Text that still doesn't fit is cut with an ellipsis, never spilled into the next chip.

### The earnings statement
- A sheet titled *Earnings* with no tabs (`src/game/statement.js`, numbers from `src/core/ledger.js`), live while open. On top a three-way switch, per second, minute or hour, kept on the phone.
- **Income**, a section per resource: its total rate, a chart of it over your play (log scale, time away squeezed to a step; touch or point at it for what it earned then and when), a row per kind of building you own (count, what one makes, the total, a share bar in the resource's colour, how soon they earn their price), the Abundance Engine, and a dashed note with every multiplier above ×1 and what a gather brings. A resource nothing makes yet is one row.
- **Best buys**: the six quickest to pay back (buildings, refinery levels, Overclock, the engine), each with what it adds, its payback, its price as in Build, and a button to the sheet where you buy it.
- **This world**: earned, spent and in packs per resource, with where it came from (hand, finds, buildings, engine) as one stacked bar.
- **Spending** by kind (buildings, tools, refineries, the engine, unlocks, lights and water power), at today's prices, then every kind of mushroom.
- Payback counts every price in seconds of your own income (Watch's choice): what you make little of is worth more. Spent amounts are plain ink, not green: green is still something to do.

### Places
- **Region names**: walking into a region (see `src/core/regions.js`) shows its kind of land in small gold capitals over its name in a large serif, across the upper middle of the map, for a few seconds. It fades on its own, lets taps through, and sits under sheets.
- **The world map** is the game zoomed out under 0.37× on the zoom pill (`MAP_ZOOM` in `src/game/camera.js`, drawn by `src/game/render/atlas.js`, driven by `src/game/mapview.js`); there is no map screen. It shows the layer you look at as far as you've explored it (deposits you've emptied faded, since nothing grows back), and on the surface region names in the same style as on arrival (never over each other or the HUD), home, the hiding place (or an arrow to it at the edge, with its distance), and you as a beating red dot; friends on that layer are dots with their names, the rest get their edge badges. Drag pans it and you stay where you are; pinch and scroll zoom about the finger, from a few kilometres across in to tiles you can pick out one by one (Watch, 2026-10-27); taps and long presses do nothing there. The zoom pill steps twice as far out there. The map button at the foot of the zoom pill glides all the way out in one go (Watch, 2026-10-25); out there it reads as pressed, brings the map back to you when you've panned or changed layer (its face turns to a crosshair), and then glides back to the zoom you had. Zooming back in past the map glides the view back to you. What you haven't explored looks as in the game: the same cloud bank and edge puffs on the surface (`src/game/render/fog.js`), unseen rock underground. Once you've explored any layer underground, a layer pill takes the depth pill's place (its look: *Forest* in green, then *Layer N*) and steps up and down through the layers you've explored; it opens on yours. The ways between layers (cave mouths, ladders, shafts) aren't marked: they show as the ground beside them (`src/game/worldmap-layers.js`).

### Playing together
- **Invite** is a main action, as big as Gather, in the bottom-left corner (the left thumb), in the sign's friendly sky blue, and only inside a shared world: worlds are made by Watch now, so outside one there is no sign to hold up. Tapping it holds up your sign. While the sign is up the button turns white and reads *Lower*; tap it again to put the sign down. It's never in a menu.
- **The QR lives in the world**: your wanderer holds a sign up in both hands in front of them with the real, scannable code on it and *Scan to join my world* along the bottom, as big as fits (about 60% of the screen's width). The view pans so you stand low on the screen and the sign is clear of the top bar and messages. It's drawn over the night's darkness so it scans at any hour. Tapping the sign copies its link (the log says so), for a friend who isn't there to scan it. Nothing covers it: it's drawn over names and edge badges, and the zoom buttons hide while it's up. Friends see you holding a small one, with their name above it.
- **Invite links** (Settings, in a shared world) is a sheet screen like Discord's: the links you made, newest first, with how many joined with each and how long it still works, and *Show* (holds it up on your sign) and *Stop* (asks first). At the top, like Discord's invite settings, two pickers for new links: how many people they let in (1, 2, 3, 5, 10, 25; never unlimited) and how long they work (30 min, 1 h, 6 h, 1 day or 7 days; 7 days unless picked). A link is used up, expired or stopped; lowering the sign doesn't stop it.
- **Worlds** (Settings, top row, showing the world you're in by name) is a sheet screen listing every world of your own on this device, last played first, then every shared world you've been in, newest first: its name, a line about it (*Just you · 2 h 5 min played · Complete*, or how many play there now), and *Play* (or a green *You're here*). No world is ever lost (Watch, 2026-10-26): a world left by Embark or *Start a fresh world* (Nerds) stays here as it was, and has no *Remove*. *Remove* takes a shared world off the list (asks first; you'd need a new link to go back); the list has no cap. Switching never asks: each world keeps its own character and progress. Shared worlds aren't listed from a crystal world. The row shows once there's more than one world to pick from.
- **World names**: every world gets a two-word name, a shared one from its id and your own from its seed (Fern Valley, Glowcap Lake…; in Lithuanian Paparčių slėnis, Švytukių ežeras…), the same on every phone. Nobody types or renames it. The join question and the arrival line in the log say it; a link to a world you're already in takes you straight there.
- **Players** (Settings, in a shared world, with how many there are) is a sheet screen listing everyone in the world: you first, then those awake, then those asleep, nearest first, each with their colour, name, how they're doing and how far away they are (and how many layers up or down). The friends' "+N" chip opens it too.
- **Settings** keeps the rest: *Worlds*, *Players*, *Invite links* and *Another device*. *Privacy policy* is a link row beside the wiki, opening `privacy/` in the player's language. *Produce while away* (with Sound and Music) is a switch row, on or off, and it's a choice for this device: off, time away makes nothing; on, your buildings and the Abundance Engine keep working while the game isn't the active screen, up to eight hours, in every world, yours and shared alike.
- **Super-speed AUTO** (Nerds) opens a separate developer viewer tab (`?autoplay`). It runs a fresh single-player world with the shipped AUTO held, shows the normal map and resource HUD, and offers Pause/Resume, 1×/100×/1000×/10000×/Maximum, New fresh world and downloads from the retained-world archive. Maximum uses bounded simulation work between draws; displayed speed is measured, not guaranteed. Hidden tabs pause without catch-up. The viewer stops when Embark becomes available, never confirms it, never connects to rooms, and keeps its worlds in a separate IndexedDB archive without changing normal saves. It shows state samples, not every skipped animation. Its styles (`autoplay-lab.css`) load only in the viewer.
- **Problems the game got past** (Nerds, below the performance panel, only when there are any): an error the game skipped over (a part of the picture, a frame, a tap) says so once in the log and is listed here, one line each with **Copy**, which copies a full report to send to whoever fixes the game (`src/game/problems.js`). Reports are in English, for developers, and stay on the device. The crash screen, shown only when frames keep failing, has **Copy report** too.
- **Another device** (Settings, in your own world only, below Worlds) is a sheet screen that brings your own world to your other phone or computer (Watch, 2026-10-26), every solo world on it included (the ones Embark left behind): a QR to scan with the other device's camera, *Copy link* for the same link, a line saying whether the world is kept in the cloud now, and a word that the code is a secret (anyone with it can play your world). Opening the link asks once, *Play it here*, then plays the same world; the world that device had stays on it (Worlds lists it). From then on the world played last carries on, without asking (`src/game/sync.js`); only when both devices played it since they last agreed does the same which-world question as for two tabs come up, worded for devices, and the copy not picked is kept on that device. It is also how a phone whose browser forgot the world gets it back: scan it again. Your character in the shared world comes along: a device that never played there plays as the same one, and one with a character of its own asks once (*Play as that one*); the one it leaves isn't deleted.
- **Save a backup** and **Load a backup** (Nerds, in your own world only) save your world as a file on your device and play one from a file (`src/game/backup.js`). Loading asks first and saves the world you're in as a file before it, so neither is lost. A shared world has neither: its progress is the room's, and the moderator backs it up (server/README.md).
- **The privacy policy** is accepted in the same question that starts or joins a shared world: one line says so, a link under it opens the policy, and Cancel keeps you playing alone. No separate consent screen.
- **Names**: every player gets a nature name (Moss, Fern, Fox…; in Lithuanian Samana, Papartis, Lapė…) picked from their id, never two alike in a world and the same on every phone. Names, never numbers or ids, label friends everywhere.
- **Friends** are chips under the top bar on the right, one per friend in their colour with their name, showing their state: online, away (z), connection lost (blinking), offline (hollow). Tapping one says how they're doing there. At most five chips show, awake friends first, and only as many as fit beside the depth meter; the rest fold into a "+N" chip that opens *Players*.
- **In the world** everyone in a shared world (you too) has their name over their head on a tag in their colour, the same size at every zoom and drawn over the night; yours hides while your sign is up. A friend also has a ring of their colour at their feet. In a crowd, a name that would cover another waits until its player steps clear: yours always shows, then the nearest. Away: smaller, with drifting z's. Connection lost: flickering under a spinning arc. Offline: asleep on the ground where they left, like a sleeper in Rust, under a blanket of their colour that rises and falls, with slow big Z's; always solid, never hidden. Back: a burst of sparkles. Off screen or on another layer: their badge at the screen's edge (a circle in their colour with their wanderer's face, and their name on a tag), an arrow on its rim pointing their way, a small up or down arrow for another layer, and under the name a dark pill with how far they are (a tile is 1 m: "240 m", "1.2 km") plus, on another layer, an up or down triangle and how many layers; faded grey while they sleep. Only the six nearest get a badge, those on your layer first; a badge that would cover another, a name or you gives way to the next nearest.

- **Admin copies** (the moderator's copy of a shared world, played as one player): an amber frame round the whole screen and a small label along its foot, under the thumb cluster, saying whose copy it is and that nothing is kept. Always on top, taps go through. When the copy is deleted, the log says it ended and the game goes back to a world of its own (`src/game/copy.js`).
- **Frozen characters** (progress clearly hacked; the moderator freezes them instead of banning): whenever the player tries to play that character, all they get is the "FBI" notice, centre stage over a police-blue map, above everything: a joke badge of the *Fair-play Bureau of Investigation* (a glowcap in a gold ring, flashing red and blue, never a real seal), *We know you cheated*, a line saying to play fair with a new character, and one button back to their own world (`src/game/fbi.js`). Friends see a tombstone where it stood.
- **Tombstones**: a frozen character (or one banned before v0.155.0) leaves a grey headstone on a little mound where it last stood, with a cross, a band in its colour and its name tag over it, so everyone knows where it was. A frozen one is sealed in a block of ice that catches the light. Its name stays taken. Tombstones go only when a frozen character is thawed.
- **A save it can't read** (damaged, or from a newer version than the page open): the log says it's kept safe to one side and a new world starts meanwhile. There is no nuke and no screen to press through: worlds are never started over (`src/game/storage.js`).

### What's new
- **Never a dialog.** Updates never stop play: the game updates itself at once (`src/game/update.js`) and nothing pops up (Watch, 2026-10-19).
- **The version is always in view**: a small, quiet pill under the gear, so players and developers always know which version is running. After an update (in the tab, or coming back on a newer version) the old number rolls up and away, the new one rolls in and glows gold for a moment, then a gold dot stays on it until the player looks. Reduced motion gets the glow only.
- **Tapping it opens What's new**, a sheet like Settings: *Share an idea* (the repo's GitHub issues) on top, then every release's player notes, newest first, the one being played labelled, the ones not yet seen marked *New* and outlined in gold; at the bottom a link to the technical `CHANGELOG.md` on GitHub. Opening it counts as seen. A first ever start has nothing new. The version also stays on Nerds. Every release adds its version to `NEWS` in `src/game/news.js` and its notes as `news.<version>` in both dictionaries: what a player will notice, one line each, in plain words.

### Empty-handed starts and equipment
New worlds begin with uncrafted tools. Upgrade rows say Not crafted until the
first paid craft; the existing Craft action makes the first basket/pick from
fungi and loose surface stone. Bare-handed surface gathering uses a picking
pose; a basket or pick appears only when owned. No character holds a phone or
laptop (Watch, 2026-10-24): older worlds carry a lantern instead. Legacy saves retain their existing equipment.
The new-world Beyond panel shows lifetime records and an empty-handed Embark
action, without legacy Insight/perk purchases. Legacy worlds keep their perk UI.

### Physical identity of purchases
Every purchased item, building and individual upgrade level must have a unique
physical visual identity. Equipment changes must appear on the character when
used; building upgrades must visibly change the placed structure or machinery.
A number, renamed buff or menu icon alone does not satisfy this rule. Resource
output/service stays recognizable at every tier, including empty states and
reduced motion. This is the redesign target; legacy abstract purchases and
generic later-tier artwork remain to be replaced in subsequent slices.

- **Stoneworks:** Build separates support buildings from producers.
  Its row explains the two-tile, non-stacking quarry service and previews the
  local incremental stone rate. Placing or moving one, or with its card up,
  its reach and a ×2 badge on each quarry it doubles show (Planning marks);
  hidden buildings stay hidden.
  Stoneworks has its own crusher picture and no output-buffer dial.
- Historical release-note translations load when What’s new opens; current
  notes remain in the startup dictionaries. The archive uses the same
  versioned asset URLs as the rest of the deploy.

### What Build offers
Build lists only what can stand on the layer you're on (`buildsOnLayer` in
`src/core/actions.js`; Watch, 2026-10-26), and a section with nothing in it
has no heading. In older worlds every building and water power are surface
things and mine lights underground ones. In a crystal world the garden and
quarry are on the surface, the mine below it, crystal rooms from layer 2 down,
and the stoneworks, depot and heart shelter anywhere.

### Physical collection
Build lists Collection Depot under support buildings, with its material recipe
and additional producer count. Placing it, or with its card up, its eight-tile
reach shows, with a crate badge on each producer it collects from. Permanent material bins identify collection even when
no output is waiting. No carts or journey times are implied. Unserved producers
keep output for normal collection. All solo worlds use the normal save/import
and archive flow; older depot save keys remain readable for recovery.

### Placing a building
Watch, 2026-10-26, as Clash of Clans, Stardew and Factorio do (`src/game/placing.js`):
- **Place** in Build closes the sheet. The building stands on the map as a
  see-through ghost, on a soft green pool, on the best free tile beside you.
  Every tile in view it fits on is lit pale blue (no outline); tap one, or
  drag the ghost, and it goes there. The map stays fully in view.
- **The placement card** docks at the bottom, in the thumbs' reach (Build,
  Upgrade and Gather step aside, the zoom pill moves up clear of it): the
  building's picture and name, what it would do on that tile (its rate, how
  many quarries it would double, how many producers it would collect from),
  its price, a one-line hint, then **Cancel** and a green **Place here**.
- On a short landscape screen the card keeps to the bottom left, without
  the hint line, and the zoom pill stays where it is.
- A tile out of reach: Place here walks Mica there (the hint says so) and it
  is built on arrival. Back, Cancel or changing layer ends placing.
- **Move** is on every building's card (yours, in a shared world too): the
  same view, titled *Move: name*, free, and what it holds goes with it.
  Once a building stands, its card opens over it.
- Props (glowcaps, lamps, solar panels, water wheels) still go where you stand.

### Planning marks
Only the one building in focus shows what it reaches: the ghost being placed
or moved, or the building whose card is up. Never every building near you.
- **Reach**: a pale blue area, one thin solid edge: a circle for a Stoneworks
  (2 tiles) or a depot (8), a diamond along the grid for a cooling tower (3
  steps) or a conduit (4).
- **What it helps**: a small round badge (dark, green ring) over each
  building: ×2 on the quarries a Stoneworks doubles, a crate on the producers
  a depot collects from, a snowflake on what a cooling tower cools, a link on
  the chamber and vault a conduit joins.
- No lines between buildings, no dashed boxes round tiles (Watch, 2026-10-26:
  "a mess"), and no white chalk (reverted in v0.152.1 at Watch's request).

The live Trail is a glowing stroke, blue until it crosses tiles the sweep will
take, then green on the surface or amber underground, with those tiles filled.


## Living-crystal chapter in the existing client
The existing canvas, terrain art, the pack's pictures, character, movement, cave
transitions, HUD, music and sheets stay in use. New-world Build keeps gardens,
quarries, underground mines, Stoneworks and physical depots. It adds chambers,
cooling towers, vaults, conduits and heart shelters, and nothing else: Build
only places things, Upgrade only crafts and upgrades (Watch, 2026-10-25).
Equipment lives in Upgrade, including crafted lanterns and sealed carriers.
No separate map or client is used.

### The lantern button and building cards
- **The lantern** has its own round button above Gather (Build-sized, where
  AUTO sits in an older world; AUTO never shows in a crystal world), there
  once the lantern is crafted. Dark grey with *LIGHT OFF*, lit gold with
  *LIGHT ON*; tapping it, or <kbd>L</kbd>, switches the light. Nothing in the log.
- **The ore flare** (Watch, 2026-10-26) has its own Build-sized round
  button in the same column: in the LIGHT/AUTO slot above Gather when that
  is free, one step above it when not. It shows underground, and anywhere
  while a flare burns, never in a shared world (not there yet). *FLARE*
  makes one from metal and lights it, <kbd>F</kbd> too; lit, it glows
  orange, a gold ring round it and the m:ss on its plate burn down, and
  tapping it puts the flare out. A line in the log teaches it the first time, says
  when there's no metal and when it burnt out.
- **A building's card**: tapping one of your buildings, a chamber, vault,
  machine, heart shelter, the hiding place, a placed light or a wild colony
  beside you (in reach, 1.65 m) pops a small card over it: its picture and
  name, how it is, and its buttons, the main one green
  (`src/game/building-card.js`). Tapping your building also collects what
  it holds, as before; its card says what it makes and what it helps or
  what helps it, with **Move**. One out of
  reach: the tap walks you there and the card opens on arrival. It sits
  between the top bar and the thumb buttons, never over them, above the
  building if there's room and below it if not, and scrolls on a small
  screen. Walking away, tapping elsewhere, tapping the building again or
  Back closes it.
- **What you carry** (a starter, harvested crystal, the heart) shows its
  health only on the bar over Mica: wider than a tile's half, green, amber
  under 65%, red under 35%. A line in the log warns when it's at risk. No HUD tile.

A chamber's card shows temperature, shutter state, tolerance, stored
output and quality. Sprite shutters/fans/cracks/warning triangles distinguish
new machinery while retaining existing building art. Carried crystal/specimens
show a tolerance bar beside the character; sound and warnings in the log supplement
visual cues. With the lantern off the mine is as dark as with it on, and only
the rock right beside Mica shows, dimly; a light only ever shows more (Watch,
2026-10-26). That glimmer does not count as simulated exposure. Crafted lanterns,
placed lights and surface daylight do count. Placed lights can be covered with
an owned mycelium hood and uncovered again from the light's own card.

New-world milestones lead through the first restoration chapter. Earlier worlds
retain earlier milestones and rules. AUTO is hidden for cultivation worlds,
even with *AUTO button* on in Nerds; keyboard AUTO also cannot run the
incompatible old planner. Room entry is blocked
until the new progression is supported by multiplayer. Nerds provides normal
solo-world creation and retained solo archives, not experimental game modes.

### Machine completion
The machine's card shows its restored section count, the next physical
repair recipe and, once restored, the clue its repair revealed. Three visible casing panels fill with each repair;
activation lights all three. After repairs, Activate appears only on the machine.
The core requires viable crystal, closed shutters and current cooling. Completion
is announced as a milestone and stays saved; Beyond offers the normal confirmed
empty-handed next world while preserving the completed world’s archive.

### Restoration-route artwork
The Lanternlight pack uses slate/steel surfaces with one dark outer ink line,
pale mycelium bindings, pink branching living crystal and cool blue-green fins.
Each cultivation facility has a dedicated catalog identity: ribbed shuttered
chambers with a crystal emblem, broad-fan cooling towers, narrow insulated vaults,
paired sealed transport pipes and the socketed ancient machine. The carrier is
a clasped specimen capsule; the lantern has a hood and crossed protective bars.
The machine’s five sprite states show zero/one/two/three restored modules and
activation. Chamber states show empty, occupied/closed and open; vaults/conduits
show empty and holding crystal. Material emblems remain readable when sealed.
Early picks use stone and mycelium bindings, early boots use woven fibre with
later stone reinforcement; metal appears only at tiers whose recipes include it.
Baskets retain fibre/stone construction throughout their current recipe chain.
Every basket/pick/boot purchase tier has distinct inventory artwork; Upgrade
previews the next tier.

### Character presentation

The default player uses a 3D skeletal orange wanderer, composited into the
existing row-sorted 2D world. It snaps movement/action facing to the nearest of eight world directions,
retains heading when stopped and stands on the existing boat deck. Its hood,
mask, gloves, leg wraps and shoes retain the established identity. Bones share
one anatomical model across every direction. Do not add the old procedural
walking bob or discrete sprite frames on top of skeletal walking.

The character uses the 3D rig for spatial posing, not a realistic 3D finish.
Unlit flat-fill shaders use the default world art’s warm orange, ivory and
dark-brown palette, with bold silhouette contours matching trees and rocks.
No directional light bands, gradients, specular highlights or filmic tone mapping.
The shared world lighting overlay still applies after compositing. Contours
share the cloak skeleton; geometry and movement remain unchanged. References:
`packs/default/props/oak.svg`, `packs/default/props/birch.svg`,
`packs/default/characters/wanderer.svg` and the original ivory-mask turnaround.

Earned pickaxes now use the shared 3D tool model: carried in the palm, moved
by swing/build actions and stowed behind the torso for free-hand actions.
Tier zero remains empty-handed. Inventory and upgrade icons are baked from
the same six tier models. Other equipment and cargo models remain future work.
Inventory, earned equipment and interactions retain their state. Legacy friend poses keep their
established alignment and artwork.

`createActor().view(moving, position)` still supplies one real-time clock and
travelled-distance phase per actor. A full cycle covers 2.4 world tiles, ten times the previous
walking cadence at the owner's request. Stopping, boats and blocked movement plant the
feet. Layer changes, jumps over 1.5 tiles and gaps over 250 ms reset the phase.
The rig layers torso sway/twist, hood counterbalance, flexing elbows/wrists and
four skinned cloak panels over continuous leg IK. Idle breath uses presentation
time; steady sign and boat poses suppress it. Work actions have distinct
anticipation/contact/recovery, sharing existing action durations. Rendering must
never advance game ticks. Existing `ACT_TIME` controls action feedback.

The WebGL renderer reuses one 320×384 surface. The 3D module loads separately
from the initial game bundle; static eight-direction facing art covers loading,
missing WebGL or a lost context. No new player-facing setup is required.
Review the real client at native and close scales, all directions, start/stop,
complete loops, boat and terrain occlusion. Use numerical joint/ground tests
alongside visible review; pixel counts cannot prove animation quality.


Resource pictures use four shared 3D source models finished as flat vector art.
Their icons, deposits/depleted views and small stockpiles share silhouettes and
material colours. Mycelium remains distinct from stone/metal/living crystal;
individual fungal species retain their restored artwork. Resource art is baked
into the existing pack, including ordinary inventory icons and gathering
feedback; it creates no per-object 3D renderer. Warm pre-v0.135.1 scenery and
building art supplies the reference palette/contours. Larger stockpile landmarks
and all physical inventory quantities/footprints retain their existing meaning.

Inventory readability uses a compact detail form from the same canonical 3D
resource source, with per-resource camera, padding and offset profiles. Essential
crystal branches are thicker and fewer; mushrooms show caps and stems without
roots; stone is less boxy and metal has a dominant nodule. Facet values follow a fixed baked light direction and three material
tones. Inventory views suppress internal facet lines; the outer silhouette stays
outlined. Review actual 24/32/48px icons on both light and dark backgrounds.
Enlargements diagnose construction, rather than establish small-size readability.
These are offline art choices, with no per-frame lights or simulation work.

The owner selected mushroom caps and stems without exposed root/hypha shapes
for the mycelium material model, including inventory and small stockpile views.


### Optional inspection
Shared tooltips in `src/game/tooltips.js` appear after 400ms hovering over
icons, controls or explored terrain/buildings; keyboard focus shows control
information immediately. In the world they speak only when there is something
to say: buildings, deposits with some left, finds and ways between layers, each
with its name and one short line (plus the tool it needs while the player lacks
it). Plain ground, dug tunnels, rock, walls and water show nothing. Names and descriptions come from the localized core
catalog, with resource-specific uses. This owner-requested on-demand learning
layer supersedes the earlier rule that explanations belong only in the wiki;
the normal HUD remains concise. Escape, interaction, scrolling and leaving the
window dismiss the tooltip. Its noninteractive surface cannot intercept input.
On touchscreens, holding a resource chip or passive shop illustration for 550ms
shows its information and consumes that gesture's click; movement cancels it.
Action-button holds retain their gameplay behavior; a hold on the world asks
Wiki (below). World lookup rejects
unexplored cells first, then uses indexed facility/building lookups. It never
reveals hidden terrain, spends resources, advances time or changes a save.

### Wiki
Wiki (`src/game/wiki.js`) answers for the world itself, so the hover box above
only covers icons and controls while Wiki talks (Settings → Wiki talks: off
brings the world box back). Wiki rides on Mica's hood and turns toward what the
player asks about. Hovering asks nothing (Watch, 2026-10-25): the mouse
pointer resting on the map neither outlines nor answers. What Wiki says goes in
the message log (above, Messages), one teal line each: the thing's name, one
short line and a "More in the wiki" link, kept there to read. A long press (a finger or the mouse
held still 0.5 s on the map) asks Wiki about what is under it; sliding on asks
about the next thing, and the answer stays 3 s after letting go. The long press
is Wiki's (Watch, 2026-10-25): it never walks or gathers, and keeping on
gathering is holding Gather. Touch can also tap Wiki, then tap a thing (the
log asks for it), or drag from Wiki onto a thing along a dotted pointer line.
Those taps belong to Wiki and never walk or gather. Firsts that Mica walks up to
are said at most once a minute.
Whatever Wiki is talking about is outlined in the world (`render/focus.js`):
one ring in Wiki's teal over a dark ink line around the whole thing (what
stands on the tile, else its square of ground; Mica gets a ring around Mica and
Wiki), drawn over everything so it shows behind trees and at night, gone a few
seconds after Wiki finishes talking. Dragging from Wiki draws a dotted line in
Wiki's teal (never white chalk).



Mica's character inspection uses his visible on-screen body region above the
known player position, before the existing explored-terrain inspection. It shows
a localized name and short character description without adding permanent HUD
text or exposing unknown tiles. The existing rig retains eight headings and
flat world colors; caring gestures and cargo views are presentation only.


Work feedback now keeps one active and at most one coalesced pending animation,
with its captured observed facing and work type. It does not delay input or
resource receipts. Mining grips, basket gathering, free-hand assembly and actual
lantern controls use the shared rig and earned gear. No additional UI controls
or inventory currencies are introduced.
