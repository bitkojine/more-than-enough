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

### Resource bar
- One chip per resource: icon and count on one row, the per-second rate centred under the whole chip. Counts and rates are abbreviated to at most three digits (`fmtShort` / `fmtRate` in `src/game/format.js`: 9999, 45k, 4.7M), so the bar fits from 320px up in both languages. Below 375px each chip stacks icon over count and leaves the rate out. Text that still doesn't fit is cut with an ellipsis, never spilled into the next chip.

### Places
- **Region names**: walking into a region (see `src/core/regions.js`) shows its kind of land in small gold capitals over its name in a large serif, across the upper middle of the map, for a few seconds. It fades on its own, lets taps through, and sits under sheets.
- **The world map** opens from the map button at the foot of the zoom pill (zooming out all the way's next step), as a tall sheet titled *World map*. It shows the surface you've explored, region names in the same style as on arrival, home and you; drag to pan, pinch or scroll to zoom, and its own small pill in the corner zooms and brings you back to where you are.

### Playing together
- **Invite** is a main action, as big as Gather, in the bottom-left corner (the left thumb), in the sign's friendly sky blue. Tapping it holds up your sign; the first time it asks to put the world online. While the sign is up the button turns white and reads *Lower*; tap it again to put the sign down. It's never in a menu.
- **The QR lives in the world**: your wanderer holds a sign up in both hands in front of them with the real, scannable code on it and *Scan to join my world* along the bottom, as big as fits (about 60% of the screen's width). The view pans so you stand low on the screen and the sign is clear of the top bar and messages. It's drawn over the night's darkness so it scans at any hour. Tapping the sign copies its link (a toast says so), for a friend who isn't there to scan it. Nothing covers it: it's drawn over names and edge badges, and the zoom buttons hide while it's up. Friends see you holding a small one, with their name above it.
- **Invite links** (Settings, in a shared world) is a sheet screen like Discord's: every link you may see (all of them for the world's owner), newest first, with who made it, how many joined with it and how long it still works, and *Show* (holds it up on your sign) and *Stop* (asks first). At the top, like Discord's invite settings, two pickers for new links: how many people they let in (1, 2, 3, 5, 10, 25; never unlimited) and how long they work (30 min, 1 h, 6 h, 1 day or 7 days; 7 days unless picked). A link is used up, expired or stopped; lowering the sign doesn't stop it.
- **Settings** keeps the rest: *Invite links*, *Back to the shared world* and *Leave the shared world*. *Privacy policy* is a link row beside the wiki, opening `privacy/` in the player's language.
- **The privacy policy** is accepted in the same question that starts or joins a shared world: one line says so, a link under it opens the policy, and Cancel keeps you playing alone. No separate consent screen.
- **Names**: every player gets a nature name (Moss, Fern, Fox…; in Lithuanian Samana, Papartis, Lapė…) picked from their id, never two alike in a world and the same on every phone. Names, never numbers or ids, label friends everywhere.
- **Friends** are chips under the top bar on the right, one per friend in their colour with their name, showing their state: online, away (z), connection lost (blinking), offline (hollow). The owner taps one to remove that friend (through `ask()`). At most five chips show, awake friends first; the rest fold into a "+N" chip.
- **In the world** everyone in a shared world (you too) has their name over their head on a tag in their colour, the same size at every zoom and drawn over the night; yours hides while your sign is up. A friend also has a ring of their colour at their feet. Away: smaller, with drifting z's. Connection lost: flickering under a spinning arc. Offline: asleep on the ground where they left, like a sleeper in Rust, under a blanket of their colour that rises and falls, with slow big Z's; always solid, never hidden. Back: a burst of sparkles. Off screen or on another layer: their badge at the screen's edge (a circle in their colour with their wanderer's face, and their name on a tag), an arrow on its rim pointing their way, a small up or down arrow for another layer, and under the name a dark pill with how far they are (a tile is 1 m: "240 m", "1.2 km") plus, on another layer, an up or down triangle and how many layers; faded grey while they sleep. Only the six nearest get a badge, those on your layer first.

- **Frozen characters** (progress clearly hacked; the moderator freezes them instead of banning): whenever the player tries to play that character, all they get is the "FBI" notice, centre stage over a police-blue map, above everything: a joke badge of the *Fair-play Bureau of Investigation* (a glowcap in a gold ring, flashing red and blue, never a real seal), *We know you cheated*, a line saying to play fair with a new character, and one button back to their own world (`src/game/fbi.js`). Friends see a tombstone where it stood.
- **Tombstones**: a banned or frozen character leaves a grey headstone on a little mound where it last stood, with a cross, a band in its colour and its name tag over it, so everyone knows where it was. A frozen one is sealed in a block of ice that catches the light. Its name stays taken. Tombstones go only when the world is made again (the nuke) or a frozen character is thawed.

### The nuke
- When an update changes how worlds are made (`WORLD_FORMAT` in `src/core/format.js`, which is the save format), a world made before it can't have what's new. The nuke takes the screen, centre stage over a red-dark map, above everything: a title, why, one huge round pulsing red button, and a status line. There's no closing it, no Cancel, nothing in Settings: the only way on is the button (`src/game/nuke.js`).
- **Alone**: an old world can't be loaded, so the new one is already there; pressing the button is how you get to it.
- **Together**: once the room service has the update, the next player in calls it (no player can set it off any other way), and it goes up on everyone's screen. A press can't be taken back. The status says how many of how many have pressed it, who it waits for (six names, then *and N more*) and when it's pressed for the rest. It's pressed for anyone away, offline or with the connection lost, and for everyone left a minute after it went up. Then the room makes the world again (new seed, nothing built, everyone's progress gone; the same players, names and invite links) and everyone reconnects to it together. Someone who was away finds themselves in the new world when they come back. In a world of up to eight, each press gets a toast.

### What's new
- After the game updates itself (it always does, at once: `src/game/update.js`), a dialog thanks the player, says it just updated, lists each release's notes since the version they were on (newest first, scrolling), and asks for ideas: *Share an idea* opens the repo's GitHub issues, *Play* closes it. Every release adds its version to `NEWS` in `src/game/news.js` and its notes as `news.<version>` in both dictionaries: what a player will notice, one line each, in plain words.

### Stages
1. **HUD and main actions** (shipped in 0.48.0): top bar (awards, one resource bar, gear), version moved into Settings, Settings split out of the sheet footer into its own panel, thumb cluster without the empty slot, slim zoom, one depth meter, toast moved to the top.
2. **Sheets** (shipped in 0.49.0): tabs as a segmented control at the top beside a × (a title instead of tabs for Settings and Collected), cleaner rows and buy buttons, Collected and Awards restyled.
3. **Dialogs** (shipped in 0.50.0): in-game confirm for Embark and Reset world instead of the browser's, fork chooser and texture report in the same dialog style.
