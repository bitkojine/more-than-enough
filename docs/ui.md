# The game's UI system

How the HUD, the thumb cluster, the sheets and dialogs are laid out, and
why. Follow it when adding anything the player sees or presses: find the
place it belongs here rather than adding a button where there is room.

## Principles (from the best mobile games)
1. **Map first.** HUD hugs the edges; the centre of the screen is the game. (Hay Day, Stardew mobile, Clash.)
2. **Thumb zone.** Everything you press often sits in the bottom-right arc of a right thumb; the big action is biggest and closest. Contextual actions pop up *beside* the main button, they don't hold an empty slot. (Brawl Stars, PUBG Mobile, Genshin.)
3. **Status top, actions bottom.** Read-only info (currencies, depth, trophies) lives in a top bar; things you press live at the bottom.
4. **One currency bar.** All resources in one capsule, tap to see details. (Every F2P game.)
5. **Settings behind a gear.** Sound, music, controls, language, textures, wiki, version, the nuke: one Settings screen from a gear in the top-right. Destructive actions in a separated danger zone with an in-game confirm.
6. **Badges, not prose.** A badge on a button says "something here for you".
7. **One visual language.** Shared tokens: surfaces, borders, radii, shadows, type scale; one round-button style, one pill style, one primary button style.
8. **Every sheet looks the same.** Header (title + close ×), tabs, scrolling body. Swipe down or tap outside to close.

## The system

### Layout (portrait phone)
```
┌──────────────────────────────────────┐
│ [🏆 3]  [🍄40 │🪨40 │🟠40 │💎40]  [⚙] │  top bar (safe area)
│ ▼1                                   │  depth meter (underground only), left edge
│ ▮                                    │
│ ▮          (milestone banner)        │
│                                      │
│               map                    │
│                                   [+]│  zoom: slim vertical pill, right edge
│                                   1× │
│                                   [−]│
│                                   [▤]│  world map, at the foot of the zoom pill
│                        [CLIMB]       │  pops in above-left of the action
│ ( QR )   [BUILD] [UPGRADE] ( GATHER )│  invite (left thumb) · thumb cluster
└──────────────────────────────────────┘
```

### Tokens
- Surfaces: `--surface` (glass panel), `--surface-raised`, `--line`.
- Ink: `--ink`, `--ink-dim`; accents: `--accent` (green, action), `--gold` (awards), `--earth` (depth), `--danger`.
- Radii: `--r-sm 10px`, `--r-md 14px`, `--r-lg 20px`, `--r-pill 999px`.
- Shadows: `--shadow-1` (HUD), `--shadow-2` (sheets/dialogs).
- Touch targets ≥ 44px; the main action 84px.

### Places
- **Region names**: walking into a region (see `src/core/regions.js`) shows its kind of land in small gold capitals over its name in a large serif, across the upper middle of the map, for a few seconds. It fades on its own, lets taps through, and sits under sheets.
- **The world map** opens from the map button at the foot of the zoom pill (zooming out all the way's next step), as a tall sheet titled *World map*. It shows the surface you've explored, region names in the same style as on arrival, home and you; drag to pan, pinch or scroll to zoom, and its own small pill in the corner zooms and brings you back to where you are.

### Playing together
- **Invite** is a main action, as big as Gather, in the bottom-left corner (the left thumb), in the sign's friendly sky blue. Tapping it holds up your sign; the first time it asks to put the world online. While the sign is up the button turns white and reads *Lower*; tap it again to put the sign down. It's never in a menu.
- **The QR lives in the world**: your wanderer holds a sign up in both hands in front of them with the real, scannable code on it and *Scan to join my world* along the bottom, as big as fits (about 60% of the screen's width). The view pans so you stand low on the screen and the sign is clear of the top bar and messages. It's drawn over the night's darkness so it scans at any hour. Tapping the sign copies its link (a toast says so), for a friend who isn't there to scan it. Friends see you holding a small one.
- **Invite links** (Settings, in a shared world) is a sheet screen like Discord's: every link you may see (all of them for the world's owner), newest first, with who made it, how many joined with it and how long it still works, and *Show* (holds it up on your sign) and *Stop* (asks first). A link works for a day; lowering the sign doesn't stop it.
- **Settings** keeps the rest: *Invite links*, *Back to the shared world* and *Leave the shared world*. At the bottom, set apart, is the big red **Nuke world** button: alone it makes the world again at once (after `ask()`); in a shared world it's a vote. Pressing it (after `ask()`) puts your vote in and the button turns dark and reads *Take back my nuke vote*; under it, how many of how many have pressed it, then who has and who it's waiting for (six names each, then *and N more*; offline players count as not yet). In a world of up to eight everyone gets a toast as votes come and go; in a bigger one only your own vote does. When everyone has pressed it, the room makes the world again with a new seed, keeps the players and invite links, and everyone reconnects to it and starts fresh.
- **Names**: every player gets a nature name (Moss, Fern, Fox…; in Lithuanian Samana, Papartis, Lapė…) picked from their id, never two alike in a world and the same on every phone. Names, never numbers or ids, label friends everywhere.
- **Friends** are chips under the top bar on the right, one per friend in their colour with their name, showing their state: online, away (z), connection lost (blinking), offline (hollow). The owner taps one to remove that friend (through `ask()`). At most five chips show, awake friends first; the rest fold into a "+N" chip.
- **In the world** everyone in a shared world (you too) has their name over their head on a tag in their colour, the same size at every zoom and drawn over the night; yours hides while your sign is up. A friend also has a ring of their colour at their feet. Away: smaller, with drifting z's. Connection lost: flickering under a spinning arc. Offline: asleep on the ground where they left, like a sleeper in Rust, under a blanket of their colour that rises and falls, with slow big Z's; always solid, never hidden. Back: a burst of sparkles. Off screen or on another layer: their badge at the screen's edge (a circle in their colour with their wanderer's face, and their name on a tag), an arrow on its rim pointing their way, and a small up or down arrow for another layer; faded grey while they sleep. Only the six nearest get a badge, those on your layer first.

### What's new
- After the game updates itself (it always does, at once: `src/game/update.js`), a dialog thanks the player, says it just updated, lists each release's notes since the version they were on (newest first, scrolling), and asks for ideas: *Share an idea* opens the repo's GitHub issues, *Play* closes it. Every release adds its version to `NEWS` in `src/game/news.js` and its notes as `news.<version>` in both dictionaries: what a player will notice, one line each, in plain words.

### Stages
1. **HUD and main actions** (shipped in 0.48.0): top bar (awards, one resource bar, gear), version moved into Settings, Settings split out of the sheet footer into its own panel, thumb cluster without the empty slot, slim zoom, one depth meter, toast moved to the top.
2. **Sheets** (shipped in 0.49.0): tabs as a segmented control at the top beside a × (a title instead of tabs for Settings and Collected), cleaner rows and buy buttons, Collected and Awards restyled.
3. **Dialogs** (shipped in 0.50.0): in-game confirm for Embark and Reset world instead of the browser's, fork chooser and texture report in the same dialog style.
