# The game's UI system

How the HUD, the thumb cluster, the sheets and dialogs are laid out, and
why. Follow it when adding anything the player sees or presses: find the
place it belongs here rather than adding a button where there is room.

## Principles (from the best mobile games)
1. **Map first.** HUD hugs the edges; the centre of the screen is the game. (Hay Day, Stardew mobile, Clash.)
2. **Thumb zone.** Everything you press often sits in the bottom-right arc of a right thumb; the big action is biggest and closest. Contextual actions pop up *beside* the main button, they don't hold an empty slot. (Brawl Stars, PUBG Mobile, Genshin.)
3. **Status top, actions bottom.** Read-only info (currencies, depth, trophies) lives in a top bar; things you press live at the bottom.
4. **One currency bar.** All resources in one capsule, tap to see details. (Every F2P game.)
5. **Settings behind a gear.** Sound, controls, language, textures, wiki, version, reset: one Settings screen from a gear in the top-right. Destructive actions in a separated danger zone with an in-game confirm.
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
│                        [CLIMB]       │  pops in above-left of the action
│   [BUILD] [UPGRADE]      ( GATHER )  │  thumb cluster
└──────────────────────────────────────┘
```

### Tokens
- Surfaces: `--surface` (glass panel), `--surface-raised`, `--line`.
- Ink: `--ink`, `--ink-dim`; accents: `--accent` (green, action), `--gold` (awards), `--earth` (depth), `--danger`.
- Radii: `--r-sm 10px`, `--r-md 14px`, `--r-lg 20px`, `--r-pill 999px`.
- Shadows: `--shadow-1` (HUD), `--shadow-2` (sheets/dialogs).
- Touch targets ≥ 44px; the main action 84px.

### Stages
1. **HUD and main actions** (shipped in 0.48.0): top bar (awards, one resource bar, gear), version moved into Settings, Settings split out of the sheet footer into its own panel, thumb cluster without the empty slot, slim zoom, one depth meter, toast moved to the top.
2. **Sheets** (shipped in 0.49.0): tabs as a segmented control at the top beside a × (a title instead of tabs for Settings and Collected), cleaner rows and buy buttons, Collected and Awards restyled.
3. **Dialogs**: in-game confirm for Embark and Reset world instead of the browser's, fork chooser and texture report in the same dialog style.
