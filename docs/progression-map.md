# Spec: The Progression Screen (working title)

Status: **Approved** — decisions locked (§12). Phase 1+2 implemented; the map
replaces the flat Upgrades list and the Beyond tab is always visible.

## 1. Problem

Today, progression is a **flat, scrolling shopping list**. `renderUpgrades()`
stacks four sections (Tools, Abundance Engine, Refinery Chains, Unlocks &
Blueprints) of uniform rows. There is no sense of:

- **where you are** on a path,
- **what is coming next**,
- **how much is left** — the horizon is invisible.

Worse, the UI actively *hides* future content:

- The **Beyond** tab is `hidden` until `beyondUnlocked()` is true
  (`insight > 0 || prestiges > 0 || canEmbark`), so a new player never learns a
  prestige loop exists.
- Locked converters just read **"Locked — craft a blueprint"** with no hint of
  the shape of what's ahead.

The result reads as *overwhelming* (a wall of similar buttons) and
*un-exciting* (nothing visible to want). The player's own words:

> "mostly I just want to see a UI where we can see all the mystery stuff we can
> still unlock in the future, and where we are now — it would make the UI feel
> less overwhelming, and it would be exciting to unlock all the stuff."

## 2. Goal

A single **Progression** screen that turns the shop into a **map you fill in**:
you can always see your position *and* the not-yet-unlocked nodes beyond it,
without being flooded with 40 live buttons at once.

### Non-goals

- No new resource/economy mechanics (this is a presentation + light data-model
  change).
- No combat or ability verbs.
- Not a literal PoE spider-web — the surface is a bottom sheet on a phone and
  must stay touch-legible.

## 3. Design principles (from the design conversation)

1. **Starting a new world is the game.** The run is the unit of
   specialization; Embark is the reset/reload. The map must make the loop
   legible, and must never feel like a dead end at the moment of reset.
2. **Specialize fast, complete slowly.** Everything is *possible*; breadth is
   expensive. The map should show that specializing is the fast path without
   walling anything off.
3. **Show the horizon.** Distant nodes are visible but clearly "not yet",
   so the player always has a next thing to want.
4. **Don't overwhelm.** Default view is a compact overview; detail is on
   demand.
5. **Honesty.** A teased node is a promise. Only surface "coming soon" nodes
   that are plausibly shippable; never fake content to pad the map.

## 4. The two layers

The map is split by *lifetime*, because the game is about repeated worlds:

| Layer | Resets on Embark? | Contains |
|---|---|---|
| **This World** | yes | Tools (Axe, Pickaxe, Boots, Overclock), Abundance Engine, the four Refinery Chains, Unlocks & Blueprints |
| **Legacy** | no | Insight, Perks, Prestiges, Lifetime gathered |

This reframes **respec**: we do *not* add in-run point refunds. The reset is
the respec — each new world is a fresh loadout of World-layer choices, while the
Legacy layer is the permanent identity that accumulates. The map should make
that trade explicit ("Embark resets this side, keeps that side").

> **Decided (Q1):** no in-run refunds. **Embark is the respec.** The reset is
> the reload: each new world is a fresh loadout of World-layer choices, while
> the Legacy layer is the permanent identity that accumulates. Perks live in the
> **Beyond** tab (the Legacy surface); the Progression screen covers the World
> layer and links across to Beyond.

## 5. Screen concept

Add a **Progression** view to the sheet. Recommended: it *becomes* the
Upgrades tab's default face, with the current buy-rows available by expanding a
family (one tap). This replaces the overwhelming list rather than adding to it.

### 5.1 Overview (default, compact)

A vertical stack of **rails**, one per family:

```
THIS WORLD
  🪓 Tools              ●●●○ ○ ○ ○ ○ ○          3/8
  🧰 Refineries         ●●●●●●●●●●             10/10
     Silviculture  ●●●●○○○○○○   4/10
     Masonry       ●●●○○○○○○○   3/10
     Metallurgy    ●○○○○○○○○○   1/10   ▶ tap
     Crystallurgy  ○○○○○○○○○○   0/10
  📜 Unlocks            ●●○○○                   2/5
LEGACY
  ✨ Perks               ●○○○○  1/5  ·  12 Insight
  🌍 Prestiges           3
```

- Each **●** is a node: filled = owned, **ring** = the next purchasable node,
  hollow = later on the path, dashed/ghost = sealed/future.
- Collapsed families show a **count** (`4/10`) and stop rendering individual
  dots beyond a small budget (see §9).
- Tapping a family expands to its current per-node rows (the existing
  `Core.upgradeInfo` / `Core.resUpgradeInfo` data), each with its buy button.

### 5.2 Node states

Every node resolves to exactly one state:

| State | Look | Meaning |
|---|---|---|
| `owned` | filled dot / `OWNED` / `MAX` | already bought |
| `ready` | ringed dot, green | next node, affordable now |
| `saving` | ringed dot, dim + cost in red | next node, not yet affordable |
| `sealed` | hollow dot + lock | visible, but a requirement isn't met (e.g. blueprint) |
| `unknown` | dashed silhouette | future node, shows `???` / a hint, not a name |

### 5.3 Sealed & coming-soon rules

- **Sealed** nodes are real content gated by a stated requirement. Show the
  requirement ("needs Blueprint: Foundry").
- **Unknown** nodes are the "mystery stuff". Rules:
  - Only add `unknown` nodes behind an **implemented** family, at a cap
    (e.g. ≤ 2 per family) so the map never looks like a lie.
  - Show a faint hint ("something bigger…"), never a fake name or price.
  - When the node ships, it graduates from `unknown` to a real node with no
    save migration required (it becomes a normal entry in the source data).
- Add a single, clearly-labelled **"More to come"** capstone row rather than
  scattering misleading placeholders.

## 6. Data model (core.js)

Presentation must read from data, not hard-coded indices.

1. A declarative **family registry**, `PATHS` (shipped as `PATH_FAMILIES`), in
   `core.js`. Each family also carries its ordered `nodes` refs, which are the
   **single source of truth** for both the resolver and the renderer (so rails
   and rows can never drift apart):
   ```js
   var PATH_FAMILIES = [
     { id:'tools',     layer:'world',  name:'Tools',                icon:'🧰', nodes:['axe','pickaxe','boots','overclock'] },
     { id:'refining',  layer:'world',  name:'Refineries',           icon:'⛏️', nodes:RESOURCES.slice() },
     { id:'abundance', layer:'world',  name:'Abundance Engine',     icon:'✨', nodes:['abundance'] },
     { id:'unlocks',   layer:'world',  name:'Unlocks & Blueprints', icon:'📜', nodes:['logistics','sapling','brickyard','foundry','observatory'] },
     { id:'perks',     layer:'legacy', name:'Perks',                icon:'🎟️', nodes:Object.keys(PERKS) }
   ];
   ```
2. Resolvers: `pathNode(s, familyId, ref)` → a node record
   (`{kind, name, icon, level, max, canBuy, cost, state}`), `pathNodes(s,
   familyId)` → the family's nodes, and `pathProgress(s, familyId)` →
   `{owned, total, canBuy, allOwned, nodes}`. These reuse
   `upgradeInfo` / `resUpgradeInfo` / `resUpgradeMul` / `perkOwned` /
   `perkCost` / `canAfford` — no new economy logic.
3. Export `PATH_FAMILIES`, `pathNode`, `pathNodes`, `pathProgress` for `game.js`.
4. Keep `core.js` DOM-free (existing invariant).

## 7. Interaction & accessibility

- Whole family row and each node are **tap targets ≥ 44px** tall
  (matches existing `.row .buy` min-height).
- Tap a family → expand/collapse. Tap **ready/saving** node → the existing buy
  path (`data-kind`, `elSheetBody` delegated click handler). Tap **owned** →
  informational only. Tap **sealed/unknown** → toast with the requirement/hint.
- Keyboard: the sheet already supports `b` / `u` tabs; add `p` (or reuse `u`)
  and keep the first focusable node reachable.
- Announce count changes via the existing `#toast` `aria-live` region; do not
  spam it on every render.

## 8. Visual style

Reuse the existing design language; add minimal classes:

- Reuse: `.row`, `.row .ic/.main/.nm/.sub/.tag`, `.section`, `.buy`,
  `.ok/.bad`, and the existing `.row.locked { opacity:.6 }`.
- New: `.rail`, `.node`, `.node.owned`, `.node.ready`, `.node.saving`,
  `.node.sealed`, `.node.unknown` — same palette (`--ink`, `--ink-dim`,
  `--green`, `#e08a7a`, `--panel-line`) so it looks native.
- No new fonts or images; dots are CSS circles (or reuse existing glyphs).

## 9. Progressive disclosure (anti-overwhelm)

- Default: compact overview + counts only.
- Per expanded family: render at most the **next 3** unowned nodes in full
  "live" detail; everything further collapses to a **"+N more"** row that
  expands on tap.
- `unknown`/`sealed` nodes never render a price or a working button.
- Cap the number of simultaneously expanded families (one at a time) so the
  sheet never returns to being a wall.

## 10. Beyond tab reveal

Recommendation: stop hiding the horizon. Instead of a `hidden` tab, show
**Beyond** from the start but in a *locked* state that states the requirement
("Gather 20,000 resources in one world, then Embark to start a New World").
This teaches the loop immediately without switching a tab out from under the
player.

> **Decided (Q2):** the Beyond tab is **always visible**. When the loop isn't
> available yet it renders a *locked preview* — the Embark goal plus the five
> perks shown as sealed (name + description, no buy button) — instead of being
> hidden. This teaches the loop from the first session without switching a tab
> out from under the player.

> **Embark threshold:** 20,000 resources must be gathered in the current world.
> Lifetime gathered resources still determine the Insight reward, but carried
> lifetime progress does not unlock another Embark immediately.

## 11. Phased plan

- **Phase 0 — spec sign-off.** ✅ Decisions locked (§12).
- **Phase 1 — read-only map.** ✅ `PATHS`/`pathNode`/`pathNodes`/`pathProgress`
  in `core.js`; overview rails render in `renderProgression()`.
- **Phase 2 — unify.** ✅ Progression is the Upgrades tab's content; expandable
  families expose the existing buy rows (default: Tools open).
- **Phase 3 — horizons.** ⏳ Capped `unknown` nodes + a "More to come" capstone.
  The Beyond locked preview (§10) shipped early with Phase 2.
- **Phase 4 — polish.** ⏳ Motion on unlock and the a11y pass remain; ✅
  `core.test.js` coverage for the resolvers landed, including the
  registry↔resolver invariant (declared `nodes` must match what `pathNodes()`
  returns, in order).

Each phase is independently shippable and save-compatible (no format change:
the map is derived from existing state).

## 12. Decisions (resolved)

1. **Respec:** **no in-run refunds; Embark is the respec** (§4). No "reallocate
   this world" convenience for now — the reset is the only path.
2. **Beyond reveal:** **always visible**, rendered **locked** until the loop is
   reachable (§10).
3. **Placement:** Progression **replaces** the Upgrades tab (same
   `data-tab="upgrades"`; the visible tab label stays "Upgrades").
4. **Naming:** kept as "Upgrades" for now; a themed name remains a later option.
5. **Horizon nodes:** deferred to Phase 3. This pass ships the full map of
   *implemented* nodes (each with its true state), which already makes the
   horizon — everything not yet bought — visible and countable. Capped
   `unknown` silhouettes can be layered on later.

## 13. Acceptance criteria

- A player can see, without buying anything, every currently-implemented node
  *and* their progress toward each.
- No more than N live buttons are visible at once in the default view
  (suggest N ≤ 8).
- The prestige loop is discoverable from the first session.
- `node core.test.js` still passes; `node test/browser.e2e.js` still passes
  (adjusted for the new default tab, if Phase 2 lands).
- Save files from v-previous load unchanged (map is a pure view).
