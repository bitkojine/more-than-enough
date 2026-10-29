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
8. **Every menu has its own entrance.** Dedicated buttons open a shared sheet with that menu's title, Close and a scrolling body. No cross-menu tabs. Swipe down or tap outside to close. A screen opened from Settings (Nerds, Worlds, Players, Invite links, Beyond) has ‹ before its title, back to Settings.
9. **Back always steps back.** The phone's own Back and Escape go back one level: a screen inside Settings to Settings, a question says no, a sheet closes (`src/game/back.js`). Only with nothing open does Back leave the game.

## The system

### Shared HUD groups (v0.180.0)

`src/game/hud-layout.js` defines stable regions from the viewport and permanent
controls. `src/game/hud-panels.js` handles disclosure policy independently of
geometry. Opening Equipment never changes the Messages or preview anchors. Resources and the horizontal
zoom/map row remain at the top. World status and optional metadata share a
secondary row. Gather, the contextual ladder action, Settlement and Equipment
keep fixed action slots. Equipment's compact charge badge remains visible while
its card is closed; battery details, lantern and flare controls live in the card.
The compact card has an Equipment heading, charge status and a quiet, labeled
Close control in its header. Dismissal never occupies an equipment slot. Actual
equipment actions sit below; Craft is a separate navigation row with a basket
and chevron. On short landscape screens Craft sits beside the equipment actions
so every control remains reachable without scrolling. Targets remain at least
44 pixels, including Close. The active Equipment button is highlighted and
toggles the card closed. Escape, phone/browser Back and outside input also
close it; on roomy screens, interacting with the left message log preserves
the right-side Equipment card. Opening it dismisses the selected building card. Focus returns to
Equipment on Close/Escape.

Collapse order is performance details → friend names → secondary world-status
details → expanded Messages. Compaction is based on available room, never on
warning urgency. Performance's compact line opens full details in the shared
sheet; folded friend chips retain the accurate player count and their Players
link; the layer label opens the map. Automatic message compaction preserves the
saved open/folded choice and still permits explicit opening. Compact screens
start with compact status, and Equipment and the expanded log share disclosure
space. Roomy screens (at least 1024px wide, more than 500px tall) let the left
log and right Equipment card or menu coexist. Menus become bounded right-side
panels there; small screens retain bottom sheets and the compact Equipment
card. Opening a panel never moves Messages, its preview anchor or essential
controls. Placement owns the disclosure area while active.

Previews stay above their fixed Messages button, with up to three lines and
the full text retained in the log. Queue and timing stay unchanged. Portrait
screens reserve an 80px preview band below the card; landscape screens reserve
a 64px left preview column, with Messages at the lower left and Invite beside
it. Layout bounds are established even when no preview or card is visible,
so arrivals and opening menus do not rearrange the HUD. Short landscape cards
share the upper area beside the layer label and clear the contextual action.

Settlement contains construction and current-layer building improvements in one
menu. Existing chambers/vaults offer reinforcement, and the machine offers its
next repair. Site actions close the sheet and approach the site before spending.
Legacy settlement progression remains available there; tools and crafted gear
are in Equipment. Internal `build`/`upgrades` keys identify these screens.

### Layout (portrait phone)
```
┌──────────────────────────────────────┐
│ [🏆 3]  [🍄40 │🪨40 │🟠40 │💎40]  [⚙] │  top bar (safe area)
│         [+] [1×] [−] [▤]             │  zoom and map: horizontal below resources
│                            0.180.5 ●│  fixed Settings column (● = news)
│                               ● in 0:18│  independent solar status when nearby
│ ▮▯ 62%                               │  compact charge on Equipment; details in its tray
│ LAYER 1                              │  depth meter (underground only), under it
│ ▮                                    │
│ ▮                                    │
│                                      │
│               map                    │
│ ┌─ message log ──────────────┐       │  the log: last 3 lines
│ │ Wiki: …                    │       │
│ │ Milestone reached 3 of 12: │       │
│ └────────────────── Hide ✕ ──┘       │
│                      [CLIMB] [AUTO]  │  layer button pops in; AUTO only if on in Nerds
│                              [FLARE] │  underground or while one burns; above LIGHT/AUTO
│                              [LIGHT] │  (crystal worlds: the lantern in AUTO's place)
│ ( QR )   [SETTLEMENT] [EQUIPMENT] ( GATHER )│  invite (left thumb) · thumb cluster
└──────────────────────────────────────┘
```

### Gather, the main action, and AUTO above it
- **Gather** is the big round button. It shows what holding it does right where you stand: *COLLECT n* beside a building with goods, *GATHER +n* among a deposit (its picture is the resource), plain *GATHER* underground beside rock that pays nothing, *EXPLORE* with nothing in reach (one press walks to the nearest resource), dimmed with nothing around. Holding it repeats four times a second, and that is the fastest any control works a tile: pressing it again and again, tapping tiles or drawing Trails all take turns on the same clock (`src/core/pace.js`; Watch, 2026-10-26). Sliding off it draws a Trail.
- **The number on its plate is the short one** (9999, 4.7M, 1e15): a button has little room, and the earnings statement has the exact figures. The plate grows into the free space between the buttons and shrinks to fit when it has to — it never reaches past the screen's edge or over the plate beside it (`--cap-scale`, measured by the HUD).
- **AUTO** (Auto-play in longer text; *Perfect* in the code) is a smaller round button (the size of Build) in its fixed developer-control slot above Equipment. It's hidden unless the player turns on *AUTO button* on Nerds (off by default, kept on the device; Watch, 2026-10-25), and never shows in a crystal world, whose rules its planner doesn't know. Its plate says AUTO in both languages. Holding it plays the game for you (`src/core/perfect.js` decides, `src/game/perfect.js` carries it out through the same calls a tap makes); letting go stops it. Manual play is untouched: steering, Gather, a tap, a finger held on a tile or a Trail take over while you do them, and it picks up again after. On a keyboard it's <kbd>P</kbd>; Space is Gather.
- **Its badge** (top-right of the button, a small circle) shows the picture of what it's doing or would do: a resource, Explore, Collect, Build, Upgrade, Wait, a layer arrow. No words: the badge is the status. Held, the button lights up and a dashed gold ring turns round it (still under reduced motion).
- **Holding is taught on every tap**: each quick tap (under 0.5 s) pops a bubble over the button, *Hold me down to auto-play* (phone or laptop wording, `tip.auto`), for 4 s (Watch: keep tapping, keep getting the hint).
- **In the world**: while it's actually playing (held, not paused by your own play, a sheet or Embark) a gold **AUTO tag** with a turning star floats over your character, above your name tag in a shared world (`drawAutoTag`).
- **Embark is yours**: when the world is ready, AUTO stops, its badge turns to Embark and the button pulses gold, with a line in the log once per world. It never presses Embark, nor anything that asks first, and waits while any sheet or dialog is up.

### Tokens
- Surfaces: `--surface` (glass panel), `--surface-raised`, `--line`.
- Ink: `--ink`, `--ink-dim`; accents: `--accent` (green, action), `--gold` (awards), `--earth` (depth), `--danger`.
- Radii: `--r-sm 10px`, `--r-md 14px`, `--r-lg 20px`, `--r-pill 999px`.
- Shadows: `--shadow-1` (HUD), `--shadow-2` (sheets/dialogs).
- Touch targets ≥ 44px (the horizontal zoom row 40px); the main action 84px (76px under 375px wide, 72px on short landscape screens).

### Other screens
- **Zoom** (Watch, 2026-10-28): the +, magnification/reset, −, and map buttons always form one horizontal row directly beneath the four resource counters, in portrait, landscape, desktop, and building placement. The row is anchored to the resource bar rather than the thumb controls. Zoom (pinch, wheel, the pill's + and −; tap the readout for 1×) reaches in until a tile is 62% of the screen's height (at least 3×), so Mica fills over half of it, close enough to see face, grips and stitching. From 2× the view eases from Mica's feet to their middle (in full by 5×), so all of them stays on screen, and the 3D rig renders at up to 4× its usual pixels so it stays sharp.
- **Landscape phones** (height up to 500px): the thumb cluster shrinks; zoom stays horizontally beneath the resources. Status stays compact, Messages anchors at the lower left and Invite sits beside it. Previews have a reserved left column; the Equipment card sits to its right. The expanded log uses the card region, clearing Invite and the action dock. Dialogs shrink their big pictures (the FBI badge) and never grow taller than the screen.
- **Narrow phones** (under 375px): resource chips stack picture over count without rates, and the cluster is a little smaller so Invite keeps clear of Build.
- **Checking it**: `npm run test:layout` opens the real game at 12 screen sizes in both languages, through the HUD, underground, every sheet and every dialog, a shared world full to its 100 players (chips and the Players screen) and a world with absurd numbers (the counts in scientific form, the Gather plate at its widest), and fails on overlapping or off-screen buttons, small targets, cut-off words, squashed rows, a plate shrunk to a smudge and dialog buttons out of view. Run it after any change to the layout.

### Fullscreen

Settings → Full screen (`src/game/fullscreen.js`) toggles the whole document,
including the HUD and menus. It uses the standard API or prefixed Safari API
from the original gesture. The button reads actual browser state and updates
on browser exits; pending requests cannot be duplicated. Errors remain inline
and recoverable, with diagnostic breadcrumbs. No fullscreen preference is
saved and no orientation is locked. Fullscreen/display-mode events refresh the
existing viewport layout; safe-area insets stay in force.

Where webpage fullscreen is unavailable, the same entry opens localized help.
For iPhone Safari it explains Share → Add to Home Screen and launching the saved
icon. Installed and system-managed views explain their platform controls
instead of presenting a fake native on/off toggle. Help wraps and scrolls inside
Settings on small portrait and landscape screens.

### Equipment, Settlement and Beyond
Equipment remains accessible while viewing the world map: its compact card
and Craft menu open over the map without changing zoom or moving Mica. Map
view is a camera mode, not an exclusive HUD interaction. Placement, signing
and opening a full sheet still close the compact Equipment card.

- **Dedicated entrances, no tab bar** (Watch, 2026-10-28): Equipment → Craft opens the Equipment list; Settlement opens construction and improvements; the trophy opens Awards. Each sheet always displays its own localized title.
- **Beyond** has a dedicated Settings row only once unlocked in a solo world. Back returns to Settings. The legacy progression family's existing shortcut remains available and returns to the menu it came from.
- **Upgrades is a progression map**, not a shop list: one row per family (`PATH_FAMILIES` in `src/core/upgrades.js`) with its count (`3/8`); tapping a family opens its buy rows, and families with something to buy start open. Rows and the map read the same upgrade registry, so they can't disagree.
- **Beyond** (perks and Embark) stays hidden until the world is mastered, and never shows in a shared world. There are no in-world refunds: Embark is the respec.

### What's new on Build and Upgrade
- The trophy has no such tag: it glows gold after a milestone until the Awards are opened.

### Messages
- **The message log** (Watch, 2026-10-26, like Old School RuneScape's chat box; `src/game/messages.js`): everything the game says goes in one log, a dark panel at the bottom left. In portrait it sits above the thumb cluster ; on short (landscape) and wide screens it keeps to the left of the screen, beside your character, above Invite when that's there. Each line has its colour: Wiki's in teal (*Wiki:* the thing, its line, *More in the wiki ›*), milestones in gold with a trophy (*Milestone reached 3 of 12:* what you did, then what's next; early on *Next milestone:*), and the game's own notices in plain ink (a low lantern, something you can't do yet, a save that failed, a friend arriving). The collapsed log previews new lines above Messages.
- **Nothing goes by itself.** The open log shows the last three lines, newest at the bottom, bounded by its assigned viewport region; character movement never resizes it; dragging or scrolling inside it goes back through older ones (a new line then keeps your place; reopening the log shows the newest), and older lines are dimmer. Repeated game notices are suppressed for ten seconds before any saving, rendering or unread update; later reminders may stack as ×2 rather than filling the log, and a long press sliding over the map keeps rewriting its one line. A press that simply worked says nothing (no "Done.").
- **Hide ✕** folds it into a small **Messages** pill in the same corner; while folded, new lines raise the count and appear in a small rounded bubble just above the pill (Watch, 2026-10-28). Each stays readable for about 2–4 seconds (up to six for long text), then shrinks down into Messages. At most four previews wait behind the current one; overflowing bursts retain the newest pending previews, and every line stays available in the log. The bubble never intercepts world gestures. Reduced motion removes the movement. Opening the log or switching worlds clears previews; saved history never replays. Nothing opens the full log but a tap. A new player starts with it open; open or folded is kept on the device, and so are the last 50 lines of each world. It hides while you place a building, hold up your sign or look at the world map.
- **Keep this world** (Watch, 2026-10-27): in Safari on an iPhone or iPad, not opened from the Home Screen, Wiki says once per device, as a milestone is reached (or a minute into a game already past one), to add Mica to the Home Screen, because Safari forgets a site left unopened for a week (`src/game/home-hint.js`). It is a line in the log like any other, never a dialog.
- Sheets and dialogs are solid: nothing on the map shows through a list.

### The lantern's charge
- Equipment offers carried light controls on every layer. Lantern and flare are mutually exclusive: lighting one switches off the other, and returning to the lantern spends the remaining flare. Controls and the character use the same canonical active-source query.
- The charge of the lantern you carry sits at the top of the left edge, above the depth meter, as a small tile as narrow as the depth pill: a battery that empties, its percent under it. It shows only once it isn't full: green, amber below the level where your light starts to shrink, red when nearly flat, sky blue while a charger fills it. It's status, not a button.
- The first time it gets low (and again after each charge back above that), one line in the log says the light is shrinking and where to charge it. Solar panels and water wheels are available before machine activation, in the Build sheet's own *On the water* section on the surface, saying where they go while you aren't on water; mine lights are in *In the mine*, underground.

### The sun clock
- The Settings gear wears the day as a ring (Watch, 2026-10-26): noon at the top, gold for the part of the day the sun works, blue for the rest, and the sun (in the gold) or the moon (in the blue) riding it clockwise where the day is now. In older and shared worlds the gold is when a solar panel charges (and the lantern doesn't drain); in a crystal world it's the sun that cracks crystal and the heart in the open, which lasts longer. It shows always, on the surface and underground. The gear stays the same size and still opens Settings.
- Within charging reach of a solar panel, and no water wheel (which charges at every hour), a world-status pill shows a small sun and *in 0:18* until the sun starts charging, then *1:12 left* until it stops. It is status, not a button, and never replaces the version. Early morning is the reason: it already looks light, but the panel isn't charging yet.

### Depth
- Underground, the depth meter sits on the left edge under the battery: a pill saying which layer you're on (*Layer 3*: a small capital label over a big number), and under it the layers as a column. The forest is on top in green (grass over earth), then every layer you've been down to in brown, a dashed one for deeper still; yours is lit gold with a small marker pointing at it. Over 12 layers, the column keeps the ones around you. On the surface the whole meter hides.
- Arriving on another layer names it briefly where region names go: *Underground* over *Layer 3*, or *Forest* over the region's name when you come up.

### Resource bar
- Tapping a chip opens the **earnings statement** at that resource; a small green chart at the bar's end (narrower than a chip) opens it at the top. The bar is the way in: no button of its own (Watch, 2026-10-19).
- One chip per resource: a 32px icon and count on one row on desktop, the per-second rate centred under the whole chip. At widths up to 600px, a 28px icon sits above the count in a 64px bar, keeping both legible without squeezing counts. Counts and rates are abbreviated to at most three digits (`fmtShort` / `fmtRate` in `src/game/format.js`: 9999, 45k, 4.7M, 12T, the same letters in every language), so the bar fits from 320px up in both languages. Past a thousand trillion a number goes scientific and keeps one digit (1e15), so it never grows past four characters either. Short landscape screens (up to 400px high) use a 50px bar and leave the rate out; icon size is preserved. Text that still doesn't fit is cut with an ellipsis, never spilled into the next chip.

### The earnings statement
- A sheet titled *Earnings* with no tabs (`src/game/statement.js`, numbers from `src/core/ledger.js`), loaded on demand with its own translations and live while open. A failed download leaves play working, records the exact module URL and game context in Problems, and offers a retry by reopening. All production rates and chart values are per second; there is no unit selector or saved unit preference.
- **Production**, a section per resource: current output rate, Mica’s packs and stock waiting in buildings separately. Extractors explain locks/full buffers and potential rate; individual crystal chambers and vaults show layer, coordinates, temperature and crystal quality, with growth, injury, heat, empty/dead and storage status. Wild crystal gathering supplies starters, never a fictitious pickaxe yield of construction crystal.
- Charts include zero output, leave gaps where observations are absent, use linear rate and real elapsed-time axes, and explain that samples are not a continuous measurement or a forecast. Touch or point for rate and wall-clock time. Production history is sampled at most once every three seconds, including chamber growth, without repeated per-frame building scans.
- **Production investments**: up to six available income-producing menu entries on the current layer, ordered by estimated resource payback. No legacy refiners, Overclock or Abundance suggestions in crystal worlds. Buttons lead to the menu containing the item. Estimates assume continuous production and collection, exclude travel/access/environment changes, and are not fastest-win advice.
- **This world** shows resources received in packs, recorded payments, and current packs. Receipts include collections; these activity totals are not presented as a balance equation. Stock waiting in facilities appears separately above.
- **Spending** records actual successful resource payments by category, including crystal care and machine restoration; storage transfers are excluded. New worlds have a complete payment record. Existing saves start a partial record, never fabricated historical spending. Their separate current-holdings estimates use current prices, omit unreconstructable costs, and must not be added to recorded spending.
- The mushroom catalogue remains here in a collapsed disclosure while its long-term home is undecided; locked basket requirements are explained. Revisit that placement with the owner later.
- Payback values prices in seconds of resource acquisition; it is an estimate. Prices and payments use plain ink, not actionable green.

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
- **The version has a permanent slot** (Watch, 2026-10-28): the top-bar Settings column owns the gear and its changelog label as one unit, the label a few pixels beneath the gear. The label fits the gear's 44px width inside a full 44px touch target, using the shared `--hud-icon-size` token. The compact label shows the full version number without a redundant prefix, leaving room for wider system fonts. A gold dot is overlaid, never added to the label's width, and painted above the pill so its rounded corner cannot cut into it. Solar status, optional metadata, menu opening and compaction cannot move or hide it. Players and developers always know which version is running. After an update (in the tab, or coming back on a newer version) the old number rolls up and away, the new one rolls in and glows gold for a moment, then its digits, dot and contour stay gold until the player looks. The update glow animates only the shadow so it cannot override unread text color. The contour overlays the rolling labels inside the visible pill, below the dot; the larger touch target stays unchanged. Reduced motion gets the glow only.
- **Tapping it opens What's new**, a sheet like Settings: *Share an idea* (the repo's GitHub issues) on top, then every release's player notes, newest first, the one being played labelled, the ones not yet seen outlined in gold; at the bottom a link to the technical `CHANGELOG.md` on GitHub. Opening it counts as seen. A first ever start has nothing new. The version also stays on Nerds. Every release adds its version to `NEWS` in `src/game/news.js` and its notes as `news.<version>` in both dictionaries: what a player will notice, one line each, in plain words.

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
  is built on arrival beside the site. Mica faces the site before building.
  New movement cancels the queued build; Back, Cancel or changing layer ends placing.
- **Move** is on every building's card (yours, in a shared world too): the
  same view, titled *Move: name*, free, and what it holds goes with it.
  Completing placement or a move closes the placement view and returns to play.
  The information card stays closed until the player selects the building.
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

A chamber's card shows temperature, tolerance, stored
output and quality. Sprite fans/cracks/warning triangles distinguish
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
The core requires viable crystal and current cooling. Completion
is announced as a milestone and stays saved; Beyond offers the normal confirmed
empty-handed next world while preserving the completed world’s archive.

### Restoration-route artwork
The Lanternlight pack uses slate/steel surfaces with one dark outer ink line,
pale mycelium bindings, pink branching living crystal and cool blue-green fins.
Each cultivation facility has a dedicated catalog identity: ribbed lightproof
chambers with a crystal emblem, broad-fan cooling towers, narrow insulated vaults,
paired sealed transport pipes and the socketed ancient machine. The carrier is
a clasped specimen capsule; the lantern has a hood and crossed protective bars.
The machine’s five sprite states show zero/one/two/three restored modules and
activation. Chamber states show empty and occupied; vaults/conduits
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
gathering is holding Gather. Mica and Wiki have no pointer targets (Watch,
2026-10-27): short and long clicks/taps, hover and drags all reach the underlying
world. There is no character inspection, tap-to-ask mode or character drag line.
Firsts that Mica walks up to are said at most once a minute.
Whatever Wiki is talking about is outlined in the world (`render/focus.js`):
one ring in Wiki's teal over a dark ink line around what stands on the tile,
else its square of ground. It is drawn over everything so it shows behind
obstacles and at night, gone a few seconds after Wiki finishes talking.
The existing rig retains eight headings and flat world colors; caring gestures
and cargo views are presentation only.

Work feedback now keeps one active and at most one coalesced pending animation,
with its captured observed facing and work type. It does not delay input or
resource receipts. Mining grips, basket gathering, free-hand assembly and actual
lantern controls use the shared rig and earned gear. No additional UI controls
or inventory currencies are introduced.


Resource failure handling: a wild-colony card uses the Geode's `top` picture;
other cards request their declared picture slot. Missing IDs/slots leave a
sized, tooltip-capable placeholder and the card's text/actions. A failed optional
image download stays nonfatal and is listed under Problems. Reports identify
asset tag, raw request, resolved URL, picture ID/slot, element/container, entry
module/build, HTTP status when available, world seed, player position and recent
world-coordinate map taps. Before the world reporter exists, optional errors
queue a bounded list; required startup scripts/styles and an unavailable
essential pack still fail loudly with asset/page/build details. Invite fragments
and unbounded inline-image contents never enter these resource diagnostics.

### Approach and act
Every personal world action uses the shared contact predicate in
`src/core/interaction.js`. Selecting a distant object queues travel to observed
cardinal-side floor, then the action. Mica faces it before acting. The controller
routes a constant number of contact candidates once per order, not every tick.
New steering, a replacement order, changing layer/world, or an unreachable path
cancels the action. Cards open only after arrival; they do not open after builds
or moves. Manual collection targets one contacted building. Trails approach each
observed target and retain the hand clock. Crafting and carried equipment need
no destination; infrastructure keeps its own service ranges and keeps running.

Physical light inspection (2026-10-28): chamber/vault/machine cards show outside
light level (0–15), whether it comes from sunlight or artificial sources, and
the automatic light protection of the interior. Wild-colony cards and meaningful
world tooltips share this information. Use existing cards/tooltips; no separate
lighting panel. Unknown terrain remains unknown; no character hit targets.

Terrain lighting correction (2026-10-28): darkness is composited immediately
after each terrain top or south face, using the same device-pixel-aligned
bounds as its artwork. Standing objects receive one tint at their physical
location on a viewport-clipped transparent patch; foreground terrain clipping
still applies. No final floor-grid mask slices through raised blocks or tall
objects. Wall contact shade is a short fading gradient, proportional to the
height difference and capped at 8% of tile depth, rather than a hard 20% strip.
Gameplay terrain is live at every gameplay zoom; the atlas owns map zoom.

Shaded static artwork (2026-10-28): terrain resources, piles, placed props and
buildings reuse transparent shaded bitmaps by source picture/size and one of
64 display-opacity buckets. These are visual buckets, not physical light
levels. The shared LRU retains at most 8M pixels and 128 pictures. Mica still
uses whole-object compositing; its patch grows in capacity rather than resizing
for every object. Ground, foreground clipping and discovery keep their rules.

Affordability notifications are removed (2026-10-29): no NEW labels on buttons,
rows, progression families or release notes. No per-world offer tracking runs.
Existing unused seen-offer storage is left untouched; game saves are unchanged.
A replacement readiness system is deferred.

Facility protection (2026-10-29): no shutter buttons, open/closed label or open
sprite state. Chambers, vaults and the machine always show protected interiors.
Plant, tend, collect, store, reinforce, repair and activate retain their normal
contact rules. Cooling and cargo protection remain separate. Existing open or
closed saves resume with their buildings and progress intact.

Focused chapter (2026-10-29): unfinished crystal worlds show optional catalog
entries with a shared monochrome lock and “Activate the machine to unlock.”
Required underground construction comes first; later rows retain their artwork
and purpose but show no actionable price or working purchase control. Equipment
keeps picks, boots, lantern and carrier first; basket and flare entries stay
visible but locked. Further tool upgrades are distinguished from usable earned
starter tools. Disabled flare controls show a lock; the real core rejects its
shortcut too. Locked existing producer/storage cards expose their retained
contents and unlock condition without work or Move actions. Chamber
reinforcement remains visible but locked. Shelters remain usable for recovery.
Machine activation unlocks these systems without discarding any saved property.
