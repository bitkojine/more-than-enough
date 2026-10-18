# The game's UI system

How the HUD, the thumb cluster, the sheets and dialogs are laid out, and
why. Follow it when adding anything the player sees or presses: find the
place it belongs here rather than adding a button where there is room.

## Principles (from the best mobile games)
1. **Map first.** HUD hugs the edges; the centre of the screen is the game. (Hay Day, Stardew mobile, Clash.)
2. **Thumb zone.** Everything you press often sits in the bottom-right arc of a right thumb; the big action is biggest and closest. Contextual actions pop up *beside* the main button, they don't hold an empty slot. (Brawl Stars, PUBG Mobile, Genshin.)
3. **Status top, actions bottom.** Read-only info (currencies, depth, trophies) lives in a top bar; things you press live at the bottom.
4. **One currency bar.** All resources in one capsule, tap to see details. (Every F2P game.)
5. **Settings behind a gear.** Sound, music, controls, language, textures, wiki, version: one Settings screen from a gear in the top-right. Irreversible actions ask first, in-game.
6. **Badges, not prose.** A badge on a button says "something here for you".
7. **One visual language.** Shared tokens: surfaces, borders, radii, shadows, type scale; one round-button style, one pill style, one primary button style.
8. **Every sheet looks the same.** Header (title + close ×), tabs, scrolling body. Swipe down or tap outside to close.

## The system

### Layout (portrait phone)
```
┌──────────────────────────────────────┐
│ [🏆 3]  [🍄40 │🪨40 │🟠40 │💎40]  [⚙] │  top bar (safe area)
│ ▮▯ 62%                               │  battery (once it isn't full), left edge
│ ▼1                                   │  depth meter (underground only), under it
│ ▮                                    │
│ ▮          (milestone banner)        │
│                                      │
│               map                    │
│                                   [+]│  zoom: slim vertical pill, right edge
│                                   1× │
│                                   [−]│
│                                   [▤]│  world map, at the foot of the zoom pill
│                   [CLIMB] [PERFECT]  │  layer button pops in beside Perfect
│ ( QR )   [BUILD] [UPGRADE] ( GATHER )│  invite (left thumb) · thumb cluster
└──────────────────────────────────────┘
```

### Gather, the main action, and Perfect above it
- **Gather** is the big round button. It shows what holding it does right where you stand: *COLLECT n* beside a building with goods, *GATHER +n* among a deposit (its picture is the resource), *EXPLORE* with nothing in reach (one press walks to the nearest resource), dimmed with nothing around. Holding it repeats about four times a second; sliding off it draws a Trail.
- **Perfect** is a smaller round button (the size of Build) centred right above Gather, there from the first spawn. Holding it plays the game for you (`src/core/perfect.js` decides, `src/game/perfect.js` carries it out through the same calls a tap makes); letting go stops it. Manual play is untouched: steering, Gather, a tap, a finger held on a tile or a Trail take over while you do them, and Perfect picks up again after. On a keyboard it's <kbd>P</kbd>; Space is Gather.
- **Its badge** (top-right of the button, a small circle) shows the picture of what it's doing or would do: a resource, Explore, Collect, Build, Upgrade, Wait, a layer arrow. No words: the badge is the status. Held, the button lights up.
- **Embark is yours**: when the world is ready, Perfect stops, its badge turns to Embark and the button pulses gold, with a toast once per world. It never presses Embark, nor anything that asks first, and waits while any sheet or dialog is up.

### Tokens
- Surfaces: `--surface` (glass panel), `--surface-raised`, `--line`.
- Ink: `--ink`, `--ink-dim`; accents: `--accent` (green, action), `--gold` (awards), `--earth` (depth), `--danger`.
- Radii: `--r-sm 10px`, `--r-md 14px`, `--r-lg 20px`, `--r-pill 999px`.
- Shadows: `--shadow-1` (HUD), `--shadow-2` (sheets/dialogs).
- Touch targets ≥ 44px (the slim zoom pill 40px); the main action 84px (76px under 375px wide, 72px on short landscape screens).

### Other screens
- **Landscape phones** (height under 500px): the thumb cluster shrinks and the zoom pill lies down as a row above it, since a column would reach the top bar. The milestone banner drops its trophy and becomes a thin strip, so it stays above your character. Dialogs shrink their big pictures (the FBI badge) and never grow taller than the screen; What's new's list gives way first, so the buttons stay in view.
- **Narrow phones** (under 375px): resource chips stack picture over count without rates, and the cluster is a little smaller so Invite keeps clear of Build.
- **Tabs** size to their words (Lithuanian's are long), a little smaller on phones.
- **Checking it**: `npm run test:layout` opens the real game at 12 screen sizes in both languages, through the HUD, underground, every sheet and every dialog, and a shared world full to its 100 players (chips and the Players screen), and fails on overlapping or off-screen buttons, small targets, cut-off words, squashed rows and dialog buttons out of view. Run it after any change to the layout.

### Upgrades and Beyond
- **Upgrades is a progression map**, not a shop list: one row per family (`PATH_FAMILIES` in `src/core/upgrades.js`) with its count (`3/8`); tapping a family opens its buy rows, and families with something to buy start open. Rows and the map read the same upgrade registry, so they can't disagree.
- **Beyond** (perks and Embark) stays hidden until the world is mastered, and never shows in a shared world. There are no in-world refunds: Embark is the respec.

### Messages
- A toast (one line of status) sits under the top bar, and under the milestone banner while one is up, never on top of it. Sheets and dialogs are solid: nothing on the map shows through a list.

### The battery
- The battery of the device in your hands sits at the top of the left edge, above the depth meter, as a small tile as narrow as the depth pill: a battery that empties, its percent under it. It shows only once it isn't full: green, amber below the level where your light starts to shrink, red when nearly flat, sky blue while a charger fills it. It's status, not a button.
- The first time it gets low (and again after each charge back above that), one toast says the light is shrinking and where to charge it. Solar panels and water wheels are in the Build sheet's own *On the water* section, above *In the mine*, saying where they go while you aren't there.

### Resource bar
- One chip per resource: icon and count on one row, the per-second rate centred under the whole chip. Counts and rates are abbreviated to at most three digits (`fmtShort` / `fmtRate` in `src/game/format.js`: 9999, 45k, 4.7M, 12T; Lithuanian K, M, G, T), so the bar fits from 320px up in both languages. Below 375px each chip stacks icon over count and leaves the rate out. Text that still doesn't fit is cut with an ellipsis, never spilled into the next chip.

### Places
- **Region names**: walking into a region (see `src/core/regions.js`) shows its kind of land in small gold capitals over its name in a large serif, across the upper middle of the map, for a few seconds. It fades on its own, lets taps through, and sits under sheets.
- **The world map** opens from the map button at the foot of the zoom pill (zooming out all the way's next step), as a tall sheet titled *World map*. It shows the surface you've explored, region names in the same style as on arrival, home and you; drag to pan, pinch or scroll to zoom, and its own small pill in the corner zooms and brings you back to where you are.

### Playing together
- **Invite** is a main action, as big as Gather, in the bottom-left corner (the left thumb), in the sign's friendly sky blue. Tapping it holds up your sign; the first time it asks to put the world online. While the sign is up the button turns white and reads *Lower*; tap it again to put the sign down. It's never in a menu.
- **The QR lives in the world**: your wanderer holds a sign up in both hands in front of them with the real, scannable code on it and *Scan to join my world* along the bottom, as big as fits (about 60% of the screen's width). The view pans so you stand low on the screen and the sign is clear of the top bar and messages. It's drawn over the night's darkness so it scans at any hour. Tapping the sign copies its link (a toast says so), for a friend who isn't there to scan it. Nothing covers it: it's drawn over names and edge badges, and the zoom buttons hide while it's up. Friends see you holding a small one, with their name above it.
- **Invite links** (Settings, in a shared world) is a sheet screen like Discord's: every link you may see (all of them for the world's owner), newest first, with who made it, how many joined with it and how long it still works, and *Show* (holds it up on your sign) and *Stop* (asks first). At the top, like Discord's invite settings, two pickers for new links: how many people they let in (1, 2, 3, 5, 10, 25; never unlimited) and how long they work (30 min, 1 h, 6 h, 1 day or 7 days; 7 days unless picked). A link is used up, expired or stopped; lowering the sign doesn't stop it.
- **Worlds** (Settings, top row, showing the world you're in by name) is a sheet screen listing your own world and every shared world you've been in, newest first: its name, whether it's yours or a friend's, how many play there now, and *Play* (or a green *You're here*). *Remove* takes a shared world off the list (asks first; you'd need a new link to go back). Switching never asks: each world keeps its own character and progress.
- **World names**: every shared world gets a two-word name from its id (Fern Valley, Glowcap Lake…; in Lithuanian Paparčių slėnis, Švytukių ežeras…), the same on every phone. Nobody types or renames it. The join question and the arrival toast say it; a link to a world you're already in takes you straight there.
- **Players** (Settings, in a shared world, with how many there are) is a sheet screen listing everyone in the world: you first, then those awake, then those asleep, nearest first, each with their colour, name, how they're doing and how far away they are (and how many layers up or down). The world's owner gets *Remove* on everyone else (asks first). The friends' "+N" chip opens it too.
- **Settings** keeps the rest: *Worlds*, *Players* and *Invite links*. *Privacy policy* is a link row beside the wiki, opening `privacy/` in the player's language.
- **The privacy policy** is accepted in the same question that starts or joins a shared world: one line says so, a link under it opens the policy, and Cancel keeps you playing alone. No separate consent screen.
- **Names**: every player gets a nature name (Moss, Fern, Fox…; in Lithuanian Samana, Papartis, Lapė…) picked from their id, never two alike in a world and the same on every phone. Names, never numbers or ids, label friends everywhere.
- **Friends** are chips under the top bar on the right, one per friend in their colour with their name, showing their state: online, away (z), connection lost (blinking), offline (hollow). The owner taps one to remove that friend (through `ask()`). At most five chips show, awake friends first, and only as many as fit beside the depth meter; the rest fold into a "+N" chip that opens *Players*.
- **In the world** everyone in a shared world (you too) has their name over their head on a tag in their colour, the same size at every zoom and drawn over the night; yours hides while your sign is up. A friend also has a ring of their colour at their feet. In a crowd, a name that would cover another waits until its player steps clear: yours always shows, then the nearest. Away: smaller, with drifting z's. Connection lost: flickering under a spinning arc. Offline: asleep on the ground where they left, like a sleeper in Rust, under a blanket of their colour that rises and falls, with slow big Z's; always solid, never hidden. Back: a burst of sparkles. Off screen or on another layer: their badge at the screen's edge (a circle in their colour with their wanderer's face, and their name on a tag), an arrow on its rim pointing their way, a small up or down arrow for another layer, and under the name a dark pill with how far they are (a tile is 1 m: "240 m", "1.2 km") plus, on another layer, an up or down triangle and how many layers; faded grey while they sleep. Only the six nearest get a badge, those on your layer first; a badge that would cover another, a name or you gives way to the next nearest.

- **Admin copies** (the moderator's copy of a shared world, played as one player): an amber frame round the whole screen and a small label along its foot, under the thumb cluster, saying whose copy it is and that nothing is kept. Always on top, taps go through. When the copy is deleted, a toast says it ended and the game goes back to a world of its own (`src/game/copy.js`).
- **Frozen characters** (progress clearly hacked; the moderator freezes them instead of banning): whenever the player tries to play that character, all they get is the "FBI" notice, centre stage over a police-blue map, above everything: a joke badge of the *Fair-play Bureau of Investigation* (a glowcap in a gold ring, flashing red and blue, never a real seal), *We know you cheated*, a line saying to play fair with a new character, and one button back to their own world (`src/game/fbi.js`). Friends see a tombstone where it stood.
- **Tombstones**: a banned or frozen character leaves a grey headstone on a little mound where it last stood, with a cross, a band in its colour and its name tag over it, so everyone knows where it was. A frozen one is sealed in a block of ice that catches the light. Its name stays taken. Tombstones go only when a frozen character is thawed.
- **A save it can't read** (damaged, or from a newer version than the page open): a toast says it's kept safe to one side and a new world starts meanwhile. There is no nuke and no screen to press through: worlds are never started over (`src/game/storage.js`).

### What's new
- After the game updates itself (it always does, at once: `src/game/update.js`), a dialog thanks the player, says it just updated, lists each release's notes since the version they were on (newest first, scrolling), and asks for ideas: *Share an idea* opens the repo's GitHub issues, *Play* closes it. Every release adds its version to `NEWS` in `src/game/news.js` and its notes as `news.<version>` in both dictionaries: what a player will notice, one line each, in plain words.
