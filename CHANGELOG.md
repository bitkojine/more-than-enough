# Changelog

## [0.135.0] - 2026-10-23

### Added
- A complete cultivation win: three visible physical machine repairs, followed
  by activation with viable crystal, closed shutters and active cooling.
- Persistent world completion, Beyond access and empty-handed next worlds;
  completed worlds remain archived. The final story reveal remains undecided.
- A bounded fresh-world playtest runner using observed terrain, shipped player
  movement/actions, normal crafting/construction and the canonical clock.
  It tests manual strategy, not the unadapted legacy AUTO brain.

### Fixed
- Underground metal/crystal discovery advances new-world milestones, so a
  completed world no longer tells the player to discover metal.
- Crystal weighted averages could exceed 100% by floating-point roundoff and
  make earned worlds unreadable. Transfers stay bounded; affected earlier saves
  recover their condition without accepting materially invalid values.
- Earlier first-section repairs and milestones retain their earned progress.
  Damaged final machine components can be rebuilt rather than blocking a world.


## [0.134.1] - 2026-10-23

### Changed
- Removed the retired depot entry point, runtime flags and obsolete experimental
  wording from the normal game, wiki and design documentation.
- Backup imports accept both earlier and cultivation worlds through the normal
  confirmation and outgoing-world backup flow. Earlier depot save keys remain
  readable for recovery; normal saves and per-seed archives are preserved.
- Historical release notes load with the release archive instead of startup.


## [0.134.0] - 2026-10-23

### Added
- Living-crystal cultivation inside the existing game client, art, endless world,
  character, movement, terrain and cave connections. New worlds keep mycelium
  and stone on the surface; metal is mined underground and wild colonies are deep.
- Physical cooled/shuttered chambers, protected vaults, sealed transfer conduits,
  crafted lanterns and carriers, colony tending and renewable wild starters.
- Carried and stored crystal quality, exposure damage, usable degraded crystal
  reinforcement, and one discoverable/restorable underground machine section.
  The first chapter is playable; the final restoration/ending remains unfinished.
- Solo-world archives and starting another world in the existing Nerds panel.
  Old worlds retain terrain/progress and earlier completion rules.

### Changed
- New-world Build/Upgrade sheets sell physical equipment and infrastructure,
  replacing abstract production upgrades in that progression. Normal main-game
  saves support local depots; the separate depot entry point is retired.
- Environmental queries use derived local heat/light indexes. The existing shared
  simulation clock runs facility deadlines independently of rendering.
- AUTO and multiplayer remain available for earlier worlds; they are not yet
  connected to the new cultivation progression. No new-model AUTO win is claimed.


## [0.133.1] - 2026-10-23

### Changed
- White chalk planning marks for construction previews, support/depot links,
  service coverage and Trail drawing; dashed previews and dark backing strokes
  preserve state distinction and contrast. Build adds chalk accents on slate.
- Static vector variation and a cached coverage path avoid animated grain or
  new font/texture downloads. Game rules and resource identities are preserved.

## [0.133.0] - 2026-10-23

### Added
- Experimental physical Collection Depot, opened from Nerds or `?depots`,
  in an isolated solo save slot with retained per-seed archives. Ordinary
  worlds and their global Logistics keep their rules.
- Depot coverage previews, same-owner/same-layer collection within eight
  tiles, non-duplicating overlap, and normal canonical AUTO placement.
- Mixed hauling and capped unserved buffers in the cumulative economy;
  advancing quiet game time does not scan every producer or collection area.

### Changed
- Experimental worlds build depots instead of buying global Logistics.
  This slice keeps other progression intact; it does not implement the
  proposed refinery, blueprint or physical endgame redesign.

## [0.132.0] - 2026-10-22

### Changed
- Prototype Stoneworks is a physical support building: it doubles nearby
  quarries within two tiles without stacking. The Build panel shows service
  links and the local production gain; it produces no stone itself.
- Newly created worlds start without crafted tools. Bare hands gather fungi
  and loose surface stone; the first paid basket improves gathering and the
  first paid pick opens ore. Excavation requires an owned pick.
- Tool rows distinguish uncrafted equipment. Character gathering poses show
  only owned tools, and empty-start characters no longer hold a supplied device.
  Optional ownership bits let updated clients show friends' equipment correctly;
  older clients can omit or ignore them.
- Embarking starts empty-handed with only knowledge and lifetime records.
  Equipment, inventory, perks, Insight and automatic Logistics do not carry over.
  Memory and Heirloom purchases are retired; existing ownership records stay.
  Legacy saves retain their earned tools and benefits in their existing worlds;
  missing legacy tool fields retain the old basic-equipment defaults.
- The new-world Beyond panel explains the start instead of offering carry-over
  perks. Existing legacy worlds retain their perk interface.

### Fixed
- Staged JavaScript uses UTF-8 text directly, keeping the normal startup
  download within the existing byte budget.
- AUTO recognizes that ordinary fungi and loose stone need no starter pick,
  and income recommendations use the real first crafting price for unowned tools.


## [0.131.8] - 2026-10-22

### Changed
- Benchmark timing regressions are checked only against matching canonical
  rules. Faster wins pass; changed rules retain hard completion and behavior
  checks while reporting timing as balance data.
- Recorded the intentionally faster four-seed regression baseline (17.84-hour
  median); the benchmark retains its existing regression and fairness checks.
- Final refinery levels cost 1.5 times the previous level while still doubling
  production, reducing the final funding wall. Earlier levels are unchanged.
- Single-player world mastery unlocks Embark immediately. The additional
  production-total gate is removed; lifetime earnings still determine Insight
  using the existing reward scale. Saved worlds, paid levels and balances remain intact.
- Mastery progress and English/Lithuanian rules describe upgrade completion
  consistently. Corrected the wiki's outdated Insight formula and examples.

## [0.131.7] - 2026-10-22

### Changed
- AUTO's observed terrain index tracks remaining deposits at the ordinary
  gathering and building-reserve boundaries, excluding exhausted chunks from
  searches without changing nearest-target ordering or reading through fog.
- Milestone checks settle production only for outstanding income predicates;
  purchase-only milestones retain their normal decision times without extra
  economy observations.
- Developer viewer styles and labels load only when the viewer opens, keeping normal
  first-load bytes within the existing budget.

## [0.131.6] - 2026-10-22

### Fixed
- AUTO no longer uses an unseen nearby charger to decide to wait when its
  selected known charger is farther away.
- Manual Gather and held-tile actions retain fractional cooldown time and
  use the same quarter-second boundary tolerance as AUTO.
- Blocked UI rejects pointer presses on AUTO and Gather. Opening blocked UI
  suspends an AUTO-owned walk; releasing AUTO preserves a replacement manual
  route instead of cancelling it.
- Core regression reporting counts boolean and null action refusals. Fresh
  evaluation retains but disqualifies source-changed runs and stops starting
  further worlds when its source fingerprint changes.

### Added
- Nerds offers a live super-speed AUTO viewer on fresh single-player seeds,
  with pause, speed selection and a separate retained-world archive. The
  viewer and evaluation runner share the same AUTO session and simulation.

### Changed
- Added bounded control, information-access, action-legality, host-parity and
  evaluation-integrity checks, plus a dedicated browser control-audit mode.

## [0.131.5] - 2026-10-22

### Changed
- Fog reveal updates only newly covered circle edges during movement instead
  of scanning the full sight area on every tick. Exact circle boundaries,
  within-tile movement, sight changes, discoveries and saved fog are preserved.
- Nearby charger candidates are cached by player tile and prop mutation epoch;
  exact range, tie order and sunrise/sunset rules remain unchanged. Props keep
  their Map-compatible saved representation.
- Continuous income streams settle together; manual earnings and spending
  materialize only affected resources, retaining deterministic stream ordering.
- Added bounded parity, invalidation and work-count checks for these paths.

## [0.131.4] - 2026-10-22

### Changed
- Default property checks use twelve seeds per family for interactive feedback;
  the full 1,500-seed sweep is an explicit command and separate background CI.
- First-load budget is now 215 KB gzipped (about 213 KB measured) to cover
  the shared engine and economy indexes, previously 210 KB.
- AUTO prefers surface gathering and production whenever these can fund its
  goal. Mining is a fallback for otherwise unavailable resources; changing
  goals no longer forces a recently started mine trip to continue.
- AUTO compares building investments including cross-resource repayment time,
  rather than repeatedly buying the cheapest extra building ahead of required
  upgrades. Mining estimates include passive income and the return trip;
  visible finds without resources needed by the current goal are skipped.
- Added bounded scaling checks for sparse explored-world searches, indexed
  collection and event-time production/accounting. Solo browser and AUTO
  hosts enable cumulative hauling after Logistics; direct variable-step and
  shared-world replay callers retain the legacy economy. Production
  queries skip empty ticks and reuse rate/count indexes between purchases;
  visible feedback queries nearby buildings only. Mastery prerequisites are
  cached until purchases. Kernel timings are not completed-world performance
  results. The runner coalesces quiet ticks before action/goal deadlines, with
  cumulative battery intervals preserving sunrise/sunset charging transitions.
- Browser and headless AUTO playtests share a fixed 60-tick gameplay engine.
  Browser drawing cadence no longer controls gameplay update sizes; headless
  runs advance ticks directly, with no FPS option or rendering wait.
- Legacy production groups repeated resource work while preserving each addition,
  building buffer and visual-event order exactly. Headless ticks omit visual
  events. Pathfinding uses integer-bucket A* to search toward its destination,
  retaining shortest weighted route cost with deterministic ties; original
  cheapest-first route choices remain available via `heuristic: false`.
  Surface searches prune unrevealed and distant explored branches while
  retaining the original nearest-target ordering.

### Fixed
- AUTO no longer reads unexplored underground rock when planning routes,
  targets unseen chargers or ladders, uses hidden shore tiles to choose solar
  placement, or lets unseen props suppress tunnel lighting. Remembered finds
  change only when their current state becomes observable. Glints visible in
  the normal game remain valid observations.
- Movement within a tile and increased sight range now refresh exploration,
  allowing normal observation to reveal obstacles before AUTO replans.
- Auto-play keeps a mine find it has seen while routing around rock, even
  when the route briefly leaves glint range. It forgets collected or blocked
  finds instead of oscillating between mining and exploration. Discovered
  shafts likewise remain targets through detours and nearer-shaft changes.
- Auto-play preserves its quarter-second action cadence across update rates,
  including tick remainders and floating-point boundaries, and finishes each
  walking step on arrival without spending another update standing still.
- A cached plan stops gathering a resource once its share of the price is
  covered. Better travel or digging gear clears outdated failed routes.
- Seeing only rare mushrooms no longer stops exploration for ordinary forage;
  rock that requires a better pickaxe still waits for the right tool.
- Searching for another building deposit can continue beyond the old radius
  around home after nearby land is exhausted.
- A failed look for a route to new land can fall back to useful gathering
  rather than waiting with no resource target.
- Returning from a deeper mine no longer replaces the remembered exit with
  a downward shaft. Auto-play searches already explored exits beyond the old
  60-tile limit instead of pacing between the shaft and exploration forever.

### Added
- Fresh-seed AUTO-only playtests use the shipped handler and controller,
  retain seed reservations and per-world results, and report blocked movement,
  charging, waiting, hourly progress and the slowest unproductive episodes.
  Five minutes without earning, finding, building, exploring or charging stops
  a stuck run with its save and recent actions preserved. A timeout, stall or
  refused action fails the command. Browser smoke tests exercise holding and
  releasing AUTO on a fresh world without other gameplay input.
- Movement loops are checked independently of passive income; buildings
  earning resources cannot hide five minutes pacing in the same small area.

## [0.131.3] - 2026-10-21

Freeze season: nothing is made while the game isn't the active screen, in
any world, and a player can turn their own away production back on.

### Changed
- Time away from the game now makes nothing. A game that isn't the active
  screen — closed, asleep, or in another app — is time away, and time away
  is worth nothing: your buildings and the Abundance Engine keep their
  rates but don't run, in a solo world and in a shared one alike. Before
  this, up to eight hours of away time was credited to your packs on your
  return (`AWAY_CAP`), which made walking away the cheapest way to play.
  The cap and the rest of the away rule stay in place for a player who
  turns it back on.
- The rule lives in one place, `FREEZE_AWAY` in `src/core/content.js`, and
  both paths go through it: a solo world's `awayProduce` and the room
  service's `Shadow.away`, so a shared world freezes the same way a solo
  one does. The setting is a player's own, not world state, so no save
  format moved and no world already played is touched.

### Added
- Settings has **Produce while away**, off by default: one choice for
  every world, on this device, remembered in the browser like the sound
  and language settings. Turn it on and time away counts again, up to
  eight hours, as before.
- The choice travels to the room service when a player joins a shared
  world (an extra field on `hello`) and when they change it while
  playing (`awayProduce`), so the room's own copy of their progress is
  worked out the same way their game would. A room that doesn't hear it
  (an older game, or a message without the field) freezes the player, so
  a room ahead of the game never hands out resources for time nobody
  asked for.

### Fixed
- Very big numbers fit where they stand. Past a thousand trillion the
  counts in the resource bar go scientific and keep one digit (`1e15`),
  so they are never cut short on a phone; the full form keeps two
  (`1.2e15`) where there is room for them, in the sheets.
- The Gather button's label is as wide as its words need and no wider:
  the number on it is the short form (`+4.7M`), and the plate grows into
  the free space between the buttons and shrinks to fit rather than
  running past the screen's edge or over the plate beside it — in
  Lithuanian, where the words are longer, most of all.

## [0.131.2] - 2026-10-20

A deploy's own checks now run before the push, and a full stockpile is
never cut short on a phone.

### Fixed
- A full stockpile shows whole on a narrow phone: the resource bar's
  count ("987B") was clipped by 2px at 375×667 and, in Lithuanian, at
  430×932, because the picture and the gap left it too little room. The
  count now fits at every size the layout walk checks.

### Added
- `npm run check`: what CI will run, run here first, in seconds — `npm test`
  and the Perfect benchmark when the rules changed, then the deploy's own
  `stage-site.sh`. `npm run check -- quick` skips the benchmark. It exists
  because a deploy failed on a bug no local step covered; see Changed. The
  slow checks stay by hand, run when what they cover changes: `test:layout`
  (~4 min, after a layout or text change) and `test:e2e` (gameplay).
- `test/unit/smoke.test.js`: the deploy's smoke checks (`server/checks.mjs`)
  run in `npm test` against a real `Room` in this process, with no network
  and no admin token. The live `server/smoke.mjs` and this share one copy
  of the checks, so a wrong idea about the wire fails locally, not only in
  CI after a deploy.

### Changed
- The deploy's smoke test reads the wire's shapes from
  `src/net/protocol.js` (`ID_RE`, `ROOM_ID_RE`) instead of its own regular
  expressions. It checked a player's id against the room's 22-char shape
  and failed every deploy until fixed; the shared checks now can't drift
  from the wire again.

## [0.131.1] - 2026-10-20

Shared worlds have no owners any more: every world belongs to everyone
in it, and Watch looks after all of them through the admin routes. The
owner's powers move there or disappear.

### Added
- `test/property/`: random legal play, thousands of short games a run,
  checked after every step against the rules the game must never break
  (`test/property/invariants.js`) — resources never go negative or NaN,
  paying never overdraws, a save always round-trips, explored land never
  un-reveals, the world formats never move. A failure prints its seed
  (`PROP_SEEDS=<seed> npm test` replays it; `PROP_SEEDS=1500` searches
  wider). `npm test` runs a fixed set of seeds with the rest of the suite.

### Changed
- The room keeps no owner: the creator is simply the first player
  (`meta.owner` is no longer written; older saves with one load the
  same, the field is just ignored).
- The wire drops `remove {id}` (game→room) and `owner {id}`
  (room→game); `welcome` no longer carries `owner`, and the invite list
  and `revoke` act only on links you made. Clients are forced to
  update, so no old client is legal by design.
- The moderator can stop any link: `POST /admin/rooms/<id>/revoke`
  with `{"code"}` (in the admin page, *Stop a link…*), and a ban now
  takes everyone who came in through the banned player's links along —
  an owner's guests no longer stay, because there is no owner.
- Every player is subject to the same `LIMITS.invitesPerDay`; the
  owner's exemption is gone. A banned or frozen player's world passes
  to nobody (the `owner` audit event only appears in old logs).
- The Players screen has no owner tag and no *Remove*; tapping a
  friend's chip says how they're doing. The Worlds screen no longer
  says which shared world is yours (`mte.myWorlds` is dropped).

## [0.131.0] - 2026-10-20

Shared worlds are made by Watch now, by hand, as many as players need —
one multiplayer world to start with. Nothing else creates a world, so
there is no creation left for anyone to flood: the door is shut before
the body is even read.

### Changed
- `POST /rooms` answers only to the admin token (403 otherwise); the
  per-IP and shared creation rate limits and their Durable Object are
  gone (`Limiter` deleted in wrangler migration v3).
- The Invite sign only appears inside a shared world; the flow that
  started a new world from your own ("Play together? / Go online") is
  removed, with it keys only it used (`together.start.*`,
  `privacy.start`, `together.toast.busy`, `together.toast.tooBig`) in
  both languages.
- The deploy's smoke test now needs `ROOMS_ADMIN_TOKEN` — it is the only
  door to a world — and checks that a stranger's create is refused (403)
  before a malformed body under the token is a plain 400.

## [0.130.2] - 2026-10-20

Creating a world used to charge both rate-limit quotas (6/hour per address,
300/hour shared) the moment a create body arrived, before anything was
looked at — so junk bodies from an attacker could spend the shared hourly
ceiling and deny world-making to everyone. The body is now read and fully
validated first; only a create that could really make a room charges
anything, and junk is refused free of charge.

### Changed
- `POST /rooms` reads and validates the body (shared `cleanCreate`, used by
  `Room.init` too) before either quota is charged; junk no longer
  instantiates a room either.
- `scripts/mark-smoke.mjs` paces its marking requests and backs off on 429
  (the zone rate-limits bursts of admin posts).

## [0.130.1] - 2026-10-20

The deploy's smoke test always made its room with seed 12345, and the room
service used that seed to tell its throwaway test rooms from players'
worlds — but the seed came from the client, so a player's world that
happened to have it could have been deleted unvisited after 30 days (and
been hidden from the moderator and skipped by backups with it). The server
now marks its own test rooms itself and never classifies by seed.

### Changed
- The deploy's smoke test creates under the admin token, marking the room
  as a smoke test (`{"smoke": true}` under the token only); such rooms
  count against no creation quota.
- `expired()` and the moderator's smoke-test filters key off the server's
  mark (`meta.smk`), never the seed. `GET /admin/rooms`'s brief carries
  `smk`.
- New `POST /admin/rooms/<id>/smoke` with `{"smoke": bool}` marks or
  unmarks a room the moderator's way, logged in the audit log.
- `scripts/mark-smoke.mjs` marks the rooms made before this version (the
  smoke seed, no flag); runs dry without `--yes`.

### Fixed
- A players' world with seed 12345 could have been deleted after 30 days
  unvisited, breaking the frozen rule that every world is kept forever
  (`test/unit/worlds-kept.test.js` now asserts a world on that seed is
  kept, and that a create claiming `smoke` without the token marks nothing).

## [0.130.0] - 2026-10-19

Watch asked for a clear, detailed statement of how fast everything earns,
with ROI, spending and earnings, like a live financial statement, top level
and easy to find. Watch chose: it opens from the resource bar; ROI counts
everything in seconds of your own income; a chart of income is kept per
world.

### Added
- The earnings statement replaces the Collected sheet. Tapping a resource
  opens it at that resource; a small chart at the bar's end opens it at the
  top. One scrolling sheet: a /s, /min, /h switch (kept on the phone);
  Income per resource with a chart of it over your play, a line per kind of
  building (how many, what one makes, the share of the income, how soon
  they earn their price), the Abundance Engine, every multiplier behind
  the rate and what a gather brings; Best buys, quickest payback first, each
  with what it adds and a button to its sheet; This world (earned, spent and
  in packs per resource, and where it came from); Spending by kind; every
  kind of mushroom, as before.
- `src/core/ledger.js`: `incomeStatement`, `spendingStatement`,
  `totalSpent`, `worthRates`, `costSeconds`, `payback`, `bestBuys`,
  `ownedPayback`. Nothing new is recorded or saved: spending is the sum of
  the prices of what you own at today's prices (every price is fixed by
  level), so it works the same in solo and shared worlds; a shared world
  counts only your own buildings and leaves props out, since they're
  everyone's. A resource is worth the time your income takes to make it
  (or holding Gather, when that's faster), so a price in four resources and
  an output in one compare as seconds.
- `src/game/income.js` samples each resource's income a minute apart (and
  a few seconds after a jump, so a buy shows as a step) into localStorage
  per world, up to 480 samples, thinning its older half when full. Time
  away is squeezed to a step on the chart, which uses a log scale; touching
  or pointing at it shows what it earned then.
- `test/unit/ledger.test.js`; `npm run test:layout` has a statement state.

### Changed
- The first-load budget is 210 KB (was 200): the statement adds about 5 KB
  gzipped to the bundle.
- The mushroom cards moved from `src/game/sheet.js` to
  `src/game/statement.js` with the rest of what was Collected.

## [0.129.0] - 2026-10-19

Watch's report: the green dots over Build and Upgrade came and went for no
reason. The Build dot needed a free tile of the right ground within arm's
reach, so it flickered as you walked; all three dots (Build, Upgrade,
trophy) only meant "affordable now", so any spending put them all out.
Watch chose: a NEW tag that means new,
every new level counting, no dot on the trophy, Place left as it is.

### Changed
- BUILD and UPGRADE show a NEW tag (NAUJA) once something there becomes
  affordable that wasn't before (a building, the next one of a kind, an
  upgrade's next level; water power and mine lights once you've been on
  water or underground). It stays until that sheet is opened or the thing
  is bought; where you stand no longer matters. `src/game/fresh.js` keeps
  what was seen per world in localStorage; a world without a record starts
  with what it can afford as seen.
- Rows that were new, and their family on the Upgrades map, carry the same
  tag while the sheet is open.
- The trophy's green dot is gone (the purchase is on Upgrade, which says
  NEW); it still glows after a milestone until the Awards are opened.
  `nextGoalReady` is gone from `src/core/goals.js` with it.
- docs/ui.md rule 6: a badge means new and only looking clears it; what you
  can do right here shows where you do it.

## [0.128.0] - 2026-10-19

Watch's choice: Perfect plays the best game it can (v0.121.0 got it to
Embark in 24.7 h), and that best game should still last about 40 h.

### Changed
- Refinery levels 6-10 cost x1.22, x1.49, x1.82, x2.22 and x2.71 what they
  did (`REFINERIES` in content.js; two significant figures). Everything up to
  level 5 is unchanged, so the first hours play as before. Perfect, held from
  spawn, reaches Embark in a median 40.09 h on the benchmark's 4 worlds
  (39.9-41.2 h), from 24.65 h. Milestones keep widening: refined5 2.4 h,
  tools 4.0 h, Abundance IV 4.7 h, Abundance V 13.1 h, refined9 22.8 h,
  refined10 and Embark 40.1 h. `test/perfect-baseline.json` re-recorded.

## [0.127.2] - 2026-10-19

Watch's ask: show the hold hint after every short tap on AUTO, so players
who keep tapping keep getting it.

### Changed
- Every tap on AUTO shorter than 0.5 s shows the "Hold me down" bubble;
  holding it once no longer turns the hint off (`autoHeld` is gone from
  the view settings).

## [0.127.1] - 2026-10-19

Watch's report: auto-play tried to build on emptied resource tiles. Since
v0.126.0 a building needs some of its deposit left, but the brain's
`buildSpot` (`src/core/perfect.js`) still picked the nearest matching tile
whatever was left in it, so on land a player had gathered bare it walked to
an emptied tile and asked to build there again and again, refused each time.

### Fixed
- `buildSpot` only takes a deposit with richness left, and when none is
  near home, the nearest one to you.

### Tests
- `bot.test.js`: held on a world gathered mostly bare around home,
  auto-play builds, never on an emptied deposit, and nothing it tries is
  refused (fails before the fix: thousands of refused places).

## [0.127.0] - 2026-10-19

Watch's ask: Perfect needed a clearer name, it should be obvious it must be
held down, and the world could show that auto-play is running. Watch chose
on decision cards: AUTO on the button and Auto-play in longer text; a tip
after a quick tap plus a turning ring while held; an AUTO tag over the
character.

### Changed
- **AUTO**: the Perfect button's plate says AUTO in both languages; the
  wiki, its aria label and the badge descriptions call it Auto-play
  (Autožaidimas). The code keeps the name `perfect`.
- **Hold me down**: a tap shorter than 0.5 s pops a bubble over the button
  (`#autoTip`, `tip.auto`) for 4 s, until the player has once held it for
  2 s (`autoHeld` in the view settings, `src/game/storage.js`).
- **Turning ring**: while held (and not waiting on Embark) a dashed gold
  ring turns round the button; reduced motion keeps it still.
- **AUTO tag** (`drawAutoTag`, `src/game/render/sprites.js`): while auto-play
  is actually playing, a gold tag with a turning star floats over your
  character, above your name in a shared world.

## [0.125.0] - 2026-10-19

Watch's ask: resources no longer grow back. What you collect is gone for
good and stays shown as collected, so players explore further and the land
shows where they've been. Watch chose each part: buildings keep working
forever without using up their deposit; a building only goes on a deposit
with something left in it; the world map fades emptied deposits; shared
worlds remember far more changed tiles.

### Changed
- **Nothing regrows** (`src/core/sim.js`): the regrowth tick, `REGROW_*`
  and the tiles' `regrows` flag are gone. Forest and stone now stay worked
  down like ore, crystal and the mine always did. No world is touched:
  tiles already regrown keep what they have.
- **Buildings need some deposit left** (`buildableTile` in
  `src/core/actions.js`): a garden, quarry, mine or resonator can't go on
  a tile gathered to nothing.
- **The world map fades emptied deposits** (`src/game/worldmap.js`), and
  repaints a chunk whenever something in it is gathered, wherever you are.
- **Shared worlds**: a tile's richness only ever goes down, so the room
  refuses an edit that raises it (an old game regrowing, or a refill).
  `PLAYER_TILES` 10,000 -> 60,000 and `LIMITS.mods` 100,000 -> 1,000,000,
  stored in 512 pieces instead of 16 (`MOD_BUCKETS`); a world stored in
  16 loads whole and is spread over the 512 on its first write.
- **Perfect** walks past where it looks for building spots when there's
  nothing left to gather near home, keeps a trip down for at least
  `minDig` seconds (a shifting guess about the emptied surface popped it
  straight back up), and digs a new goal where it is soon after coming
  down. Embark median 24.65 h -> 25.40 h, nothing refused, no waiting, no
  quick pops down; baseline re-recorded.
- Tile cards and the wiki say deposits never grow back; the wiki's
  Regrowth section is now "Gathered for good".

### Tests
- Nothing regrows beside you; a building needs something left and never
  uses it up; the room refuses a raised richness; a world stored in 16
  pieces loads and is rewritten into 512. Bot helpers skip unreachable and
  built-on tiles instead of zeroing them (regrowth used to hide that).
Watch: unexplored land should look like the fog of war in Civilization.
Watch picked clouds (Civ V) over an old-map parchment (Civ VI) and over
keeping the dark drop, chose to keep explored land fully bright (no greying
of land out of sight), and wanted the world map to match. Day and night and
the device's light are unchanged.

### Changed
- **Clouds over unexplored land** (`src/game/render/fog.js`): on the surface
  every unexplored tile is covered by one seamless cloud bank, and each tile
  on its edge by a billowing puff 1.75 tiles wide, so the edge rolls softly
  over the known land instead of following the grid. The pictures are made
  once from two new texture-pack colours, `color.cloud` and
  `color.cloudShade`, lit from the north-west. Clouds are drawn with the
  ground (and kept in the far map when zoomed out); the bank's picture is
  kept at its on-screen size in device pixels so filling with it is a copy,
  not a resample (about +2 ms a frame at 2x on a screen that is mostly
  cloud, in headless Chromium). The underground keeps its unseen rock.
- **The world map** shows the same clouds where it used to be dark.
- **Friends out in the clouds** are drawn over them (`scene().aloft`), so
  you can still find each other.
- **The stylesheet players download is minified** (`scripts/stage-speed.mjs`,
  esbuild, targeting Safari 12 so nothing is rewritten into newer CSS): the
  first load drops from 200.6 KB to 196.1 KB gzipped, back under the 200 KB
  budget the clouds had pushed it just over.

### Removed
- The cliffs at the edge of the known world (`strata.js`, `CLIFF_LAYERS`),
  the light lips on edges facing the dark, and the pack colours only they
  used (`color.visited`, `color.cavity`, `color.edge`): the clouds cover
  where they were. The wiki's Fog section now describes the clouds.
  A pack saved or exported with those colours still loads: they're listed in
  `RETIRED_LOOKS` (`src/core/catalog.js`) and ignored.

### Tests
- `scene.test.js`: a friend out in the clouds is drawn over them; on
  explored land, in their row.
- `looks.test.js`: a pack with retired colours still validates.

## [0.124.0] - 2026-10-19

Watch's ask: update notifications annoy players mid-game, so nothing should
need reading or dismissing; the version is always shown and animates when
it changes, and tapping it opens the full changelog with what's new. Watch
chose on decision cards: the version sits under the gear, it rolls and
glows and keeps a dot, and the changelog shows the player notes.

### Changed
- **No What's new dialog**: the game still updates itself at once, but
  nothing pops up. The `#news` dialog is gone, and Perfect no longer
  waits on it.
- **Version badge** (`#btnVersion`, `src/game/news.js`): always in view
  under the gear. After an update (in the tab, or coming back on a newer
  version: `mte.ranVersion` in localStorage) the old number rolls away,
  the new one rolls in and glows; a gold dot stays while there are notes
  newer than `mte.newsSeen`. Reduced motion: glow only.
- **What's new sheet** (`#newsPanel`, a sheet panel like Nerds): Share an
  idea, every release's notes newest first with the one being played
  labelled and the unseen ones marked New, and a link to `CHANGELOG.md` on
  GitHub. Opening it marks everything seen. A first ever start has
  nothing new.
- `--r-pill` (named in `docs/ui.md`) is now a real token in `style.css`.

### Tests
- `update.test.js`: where a start stands (first start, coming back newer,
  same or older version, junk in storage) and the badge's dot and roll.
- `test:layout`: the news state opens the sheet from the badge, and the
  badge is among the HUD targets checked for overlaps.

## [0.123.0] - 2026-10-19

Watch: a milestone reached should congratulate in the past tense ("mes tai
padarėm"), never read like the objective it was.

### Changed
- **Milestones reached say they're done**: each goal in `src/core/goals.js`
  has `reached` beside `text`, from new `goal.<id>.reached` strings in
  English and Lithuanian ("Built a Mushroom Garden", "Pastatei Grybų
  daržą"). The banner (now labelled "Milestone reached" / "Etapas
  pasiektas") and the Awards list of milestones reached use it; the next
  milestone and "Next: …" keep the objective's words.

### Tests
- `prestige.test.js`: every reachable milestone has past-tense words that
  differ from its objective, in every language.

## [0.122.0] - 2026-10-19

Watch's ask: review the navigation of every menu; Nerds had no way back.
Checked every sheet and dialog in the running game on a phone and a laptop
in both languages. Screens one row inside Settings (Nerds, Worlds, Players,
Invite links) could only be closed with ×, so getting back to Settings
meant the gear; and a phone's own Back (Android's button or gesture, the
browser's Back) left the game with a sheet open.

### Added
- **‹ back** in the sheet header on a screen opened from Settings
  (`sheet.back()` in `src/game/sheet.js`); a screen opened elsewhere (the
  friends' "+N" chip opens Players) has none, × closes it as before.
- **The phone's Back steps back** (`src/game/back.js`): while a sheet or a
  question is up, one history entry of the game's own sits on top; Back
  takes it off and steps back one level (a screen inside Settings to
  Settings, a question says no, What's new or a sheet closes). With nothing
  open, Back leaves the game as before.

### Changed
- **Escape** steps back one level the same way, rather than closing the
  whole sheet from Nerds. The texture-pack report closes on Escape and a
  tap outside, like every other dialog.
- The sheet marks screens with a title instead of tabs with one class
  (`titled`), replacing a seven-screen CSS selector list.

### Tests
- `back.test.js`: Back steps out one screen at a time, then leaves; no
  entries pile up. `browser.e2e.js`: ‹, Escape and `history.back()` each
  take Nerds back to Settings.

## [0.121.2] - 2026-10-19

Watch's choices on the decision cards for v0.121.1: the bundle farthest
from you makes way (the off-screen rule shipped there), and the number in
the air follows the phone's quality level.

### Changed
- **Floating budget follows quality**: `LEVELS` in `src/game/quality.js`
  carry `flyers`: 80 at full quality, 60, 40, and 20 at the lowest.
  `createEffects` reads it through a `budget()` callback; when quality
  steps down, the next gain sheds the extra, off-screen ones first.

### Tests
- `effects.test.js`: the budget follows a callback and a shrunk one sheds
  only what's off screen. `quality.test.js`: each lower level floats fewer.

## [0.121.1] - 2026-10-19

Watch's ask: some floating resources go undrawn to keep old phones fast,
but the ones near the player must always show; a building just placed could
float nothing for a while. Reproduced 78 m from spawn with 40 buildings
around: within 2 s all 40 slots held bundles on a 26 s trip home, all off
screen within 6 s, so nothing showed by the player and a new quarry's stone
was dropped (it had no bundle of its kind to ride on). Watch is choosing
on decision cards; this ships the recommended one.

### Fixed
- **Off screen makes way first**: over budget, a flyer off screen (with a
  40 px margin, `ON_SCREEN_PX`) gives up its slot to the new gain. With
  all of them on screen they still keep going (v0.113.1); the first of a
  new resource takes the oldest one's place, so a new building always
  shows. In the same test 20-28 of the 40 now stay on screen.
- `createEffects` takes a `seen(x, y)` check from the camera.

### Tests
- `test/unit/effects.test.js`: far from spawn, fresh bundles by you replace
  ones off screen and a new building shows at once; at a full spawn, the
  first of a new resource still shows (both failed on v0.121.0).

## [0.121.0] - 2026-10-19

Watch's ask: Perfect always plays the best game it can, and re-learns when
the rules change (scored by hours held from spawn to Embark, Watch's pick).

### Changed
- Perfect re-learned (`scripts/perfect-tune.mjs` on v0.120 rules): it now
  reckons hand-gathering at half the pace it did (`walkLoss` 0.4), goes down
  the mine while that's reckoned under 1.2x the surface's time (`mineEdge`,
  was 0.8) and a shaft at 22.5 s (was 45). Since finds scale with your
  buildings (v0.111.0) digging pays, so it mines far more: Embark in a median
  24.65 h on the benchmark's 4 worlds, from 35.83 h, and 24.6-24.7 h on 2
  worlds it wasn't tuned on. No refused acts and no quick pops down.
  `test/perfect-baseline.json` re-recorded.

### Performance
- `nearestTile` (world.js) visits only the ring it is on instead of the
  whole square around it each ring: the same answers, far fewer tiles.
- Underground, Perfect looks for the way up afresh every 2 s instead of every
  step, and checks fog before generating tiles. A tick's production works out
  each resource's multiplier once instead of twice per building. Together the
  brain is about 5x cheaper underground, which matters on old phones too: the
  benchmark's 4 worlds now run in under 2 minutes.

## [0.120.1] - 2026-10-18

### Fixed
- The Nerds screen (v0.119.0) showed the Upgrades/Build/Awards tabs as its
  header instead of its title: style.css lists the screens that hide the
  tabs, and Nerds wasn't on it. It also sizes to its rows like Settings.

### Tests
- Browser e2e checks Nerds shows its title and no tabs.

## [0.120.0] - 2026-10-18

Watch's ask: back up any world and save it to disk. Watch chose that only
the moderator backs up a shared world (it holds everyone's progress), and
that a restore never touches a live world.

### Added
- *Save a backup* and *Load a backup* on the Nerds screen, in your own world
  only (`src/game/backup.js`): your world as a JSON file on your device, and
  playing one from such a file. Loading asks first and saves the world
  you're in as a file before it, so neither is lost. A shared world has
  neither: putting back an old copy of your progress there would be cheating.
- `GET /admin/rooms/<id>/backup` (`server/src/backup.js`): a whole shared
  world as one file, every entry the room keeps and each player's progress
  as the room has it now, without the invite links. The admin page has a
  *Download backup* button per row; `scripts/backup-worlds.mjs` saves every
  world's at once.
- `POST /admin/rooms/<id>/restore` and the admin page's *Restore a backup…*:
  puts a world that's gone back from its file, at its own address (a
  player's id comes from the address and their key, so only there do they
  get back in with their own phones). A world that's still there is refused
  (409 `exists`), never written over.

### Tests
- `test/unit/backup.test.js`: a backup reads back into the same world, both
  players' keys play their own characters in it, no invite links come
  along, the room is left as it was, and a restore takes only that world's
  own file and never brings back an admin's copy.
- `test/unit/storage.test.js`: a solo backup loads back exactly, a browser
  save reads too, and other files don't.
- `test/browser.e2e.js`: your own world has both backup rows.

## [0.119.0] - 2026-10-18

Watch: "All this techy stuff needs to be in a nerds menu, don't make it top
level for most players."

### Added
- A *Nerds* screen, the last row of Settings: Textures (and Default
  textures), a Performance panel switch (so a phone can open it without
  `?perf`) and the version line.

### Changed
- Settings keeps only everyday things: worlds and players, sound, music,
  drag, language, wiki and privacy policy.
- docs/ui.md (rule 5a: technical things go under Nerds), README, the wiki's
  Settings, texture pack and performance panel pages say where things are.

### Tests
- Browser e2e checks Nerds holds Textures and the version and that its
  switch opens the performance panel; the layout check gains a `nerds` state.

## [0.118.0] - 2026-10-18

Watch's ask: the underground depth indicator wasn't clear. It said "▼ 3"
over a column of unlabelled bars, so nothing said 3 of what or which end was
up, and on phones the milestone banner covered the column. Watch picked the
layer number over meters or named layers, the forest green on top, and a
short title on arrival.

### Changed
- **Depth meter**: the pill reads *Layer 3* (*Sluoksnis 3*), a small label
  over a big number. The column under it has the forest on top as a green
  bar (grass over earth), and yours lit with a marker beside it. It shows
  only underground now; on the surface it used to linger once you'd been
  down.
- **Arriving on a layer** names it briefly where region names go:
  *Underground / Layer 3*, or *Forest* over the region's name on the way
  up (which then counts as that region's name shown).

### Fixed
- On narrow screens underground, the milestone banner moves right to clear
  the depth meter and toasts narrow, instead of covering the column; a
  region or layer title goes under the banner while one is up.
## [0.117.1] - 2026-10-18

The rest of Watch's "disable all nukes": the game's side of the nuke goes
too, now that the room service never calls it (v0.117.0).

### Removed
- The nuke screen (`src/game/nuke.js`, its dialog and styles) and
  together.js's nuke handling: votes, countdown, the 'nuke' message and the
  4004 'renewed' reconnect.

### Changed
- A solo save the game can't read (damaged, or from a newer version) no
  longer brings up a red button to press: a toast says it's kept safe to one
  side, and a new world starts meanwhile.
- Wiki (*Saves*, Perfect's list) and docs/ui.md say worlds are never started
  over and describe the note instead of the nuke.

### Tests
- `test/browser.e2e.js`: an unreadable or damaged save shows the note, is
  kept to one side, and there is no nuke screen; a format 10 world set aside
  and played further comes back on load.
- `test/layout.e2e.js` drops the nuke screen from the states it checks.

## [0.117.0] - 2026-10-18

Watch's ask: every solo and multiplayer world must be kept; nukes are never
allowed any more. v0.109.0's `WORLD_FORMAT` bump to 11 had left 70 shared
worlds made at format 10 (the busiest one with 8 players among them), each
one join away from the nuke, and had set aside format 10 solo saves for new
worlds.

### Changed
- **No nuke**: the room service no longer calls, counts or sets off the
  nuke and never remakes a world (`renew`, `callNuke`, `nukeDue` and the
  Durable Object's `nukeIfDue` are gone). A world stored with an older
  `fmt`/`ef`, or with a nuke already called, plays on under the current
  formats with its seed, edits, buildings and players, logged once as
  `kept`. An old game's `nuke` message changes nothing; the welcome's
  `nuke` is always null, so games of either version join as before.
- **Formats frozen**: `WORLD_FORMAT` (11) and `ECON_FORMAT` (1) never change
  again. Saves from format 10 on load.
- **Solo worlds come back**: a world set aside that was played further (more
  Embarks, else more play time) than the one in use is taken back on load,
  and the other set aside in its place, so format 10 worlds set aside by
  v0.109.0 return to players who played them longer.
- **No deletion**: a players' world is no longer deleted after 30 days
  unvisited; only the deploy's smoke-test rooms (seed 12345) and admin
  copies still go.
- AGENTS.md, README, server/README.md and the architecture model say every
  world is kept and the formats are frozen.

### Tests
- `test/unit/worlds-kept.test.js`: the formats are pinned; format 10 and 11
  saves load; an old-format room with a called nuke restores as the same
  world with no nuke; pressing the nuke does nothing; the room has no
  remake path left; unvisited worlds stay; a longer-played solo world set
  aside comes back, an Embarked one is never swapped out.

## [0.116.0] - 2026-10-18

Watch's ask: water was boring, so design what players do in it, eco
friendly and with no fishing, tied to the idea that characters need to
recharge. Watch chose the device battery: the phone or laptop in your hands
lights the dark, that runs it down, and water power charges it. Watch also
ruled that every world is kept from now on, so nothing here touches world
generation or the save format.

### Added
- **The battery** (`src/core/light.js`, new home of `daylight` and
  `isDark`): `s.battery` (0..1, saved; a save without it loads full) drains
  over `BATTERY_LIFE` (900 s) of dark, at night or in the mine, and never by
  day or while you're away. Below `BATTERY_LOW` your light shrinks, down to
  `BATTERY_DIM` of its reach when flat: the fog lifts over less
  (`revealAround`) and the screen's pool of light is smaller. It never blocks
  an act.
- **Water power**, the first things that go on water: a floating solar
  panel (any surface water, charges while the sun is up) and a steel water
  wheel (rivers between regions only, charges day and night), new `PROPS`
  with `on` and `charge`. Standing within `CHARGE_RANGE` of a working one
  fills the battery in `CHARGE_TIME` seconds; anyone's charges anyone.
  Placed where you stand, like the mine's props; Build has an *On the water*
  section.
- **The battery on screen**: a small tile at the top of the left edge once
  it isn't full (green, amber when the light shrinks, red when nearly flat,
  blue while charging), and one hint when it first gets low.
- **Perfect** puts a solar panel by the shore near home once the battery
  starts to run down, and goes back to charge when it's under half, staying
  till it's full (`charge` intent).
- Art: `props/solar.svg`, `props/wheel-1.svg` and `wheel-2.svg` (it turns).

### Changed
- AGENTS.md: worlds are kept; no `WORLD_FORMAT` bumps or resets.
- Wiki: *Water* and *Your battery* in The world, water power table; the
  Ideas page drops "A battery that runs low" (built) and "Fish" (Watch: no
  fishing).
- The Perfect button's badge shows a prop's picture when it has no icon.

### Saves and shared worlds
- `WORLD_FORMAT` unchanged: every solo and shared world loads as it was.
  Surface props are accepted only for water power; the room replays the new
  props with the same rules (a room still on the old code refuses them as a
  plain refusal, not a cheat).

### Tests
- `test/unit/light.test.js`: drain only in the dark, never away; light
  shrinking; solar and wheel placement, day/night charging, range; saves
  with and without a battery; Perfect builds a panel and charges.
- e2e: the battery tile shows and turns amber; layout check covers it on
  every screen. Perfect benchmark unchanged (Embark 35.9 h).

## [0.115.0] - 2026-10-18

Watch's ask: don't let players gather by hand from a resource tile that has a
building on it. The building works the tile; hands working it too took from
the same deposit twice.

### Changed
- **A built-on tile is the building's**: `harvestable` (src/core/actions.js)
  is false where any building stands, anyone's in a shared world, so taps,
  Gather, Trails and the Perfect button's deposit search all pass it by, and
  a tap on it goes to the building. The room refuses such a gather ('spot')
  because it replays the same rule.
- `extractorAt` looks buildings up by tile through an index rebuilt when the
  list is swapped or grows, so the extra check stays cheap in the brain's
  wide searches.

### Tests
- `test/unit/actions.test.js`: tap, Gather and Trail skip a built-on tile,
  someone else's building too, and it frees up once the building is gone.
- `test/unit/shadow.test.js`: the room refuses a game's gather on a
  built-on tile and pays nothing for it.
- `test/browser.e2e.js`: the hand-gathering checks clear what Perfect built
  around their forest tile first, and the far tree is one with no building.
- Perfect benchmark unchanged within the gate (Embark 35.7-36.2 h).

## [0.114.0] - 2026-10-18

Watch asked for Gather back as the main button, so players can hold it and
gather where they stand without tapping a lot, and for Perfect to stay but
be more secondary.

### Changed
- **Gather is the big button again**, as before v0.110.0: it shows COLLECT n,
  GATHER +n or EXPLORE, holding repeats it every 0.25 s, one press of
  Explore walks to the nearest resource (`nearestWork`, `SEEK_RADIUS` are
  back in `src/core/actions.js`), and sliding off it draws a Trail. Space
  and Enter hold Gather.
- **Perfect is a smaller button** (`#btnPerfect`, the size of Build)
  centred right above Gather, with its badge, gold Embark pulse and lit
  state as before. `P` holds it on a keyboard. It waits while Gather is
  held, as it does while you steer or work a tile. The layer button sits
  to its left.
- The green outline shows Gather's tile, or Perfect's while it is held.
- Wiki (Controls, Perfect, Screen, Mine, Buildings, Upgrades), `docs/ui.md`
  and the architecture model describe the two buttons.

### Tests
- Browser tests hold Gather again (collects, COLLECT label, Space gathers
  exactly once, Explore walks to the first resource) and hold Perfect on
  its own button; the HUD overlap check includes it.

## [0.113.1] - 2026-10-18

Watch's bug: near spawn, with buildings near spawn too, floating resources
flickered by the buildings and never floated to the stockpile. Reproduced
with 60 Logistics buildings in view: they launch more bundles than the 40
in the air allow, and v0.112.0 made room by dropping the oldest, so all 40
were replaced every 2 s, each restarting at its building, and none got
home.

### Fixed
- **Flyers on their way always land**: over budget, a new gain rides on the
  newest flyer of its resource instead of evicting the oldest.
- Gains within a tile of a fresh launch (`FLYER_NEAR`) share its bundle, so
  a row of buildings sends one trail, not one each.

### Tests
- `test/unit/effects.test.js`: with 100 busy sources, every flyer launched
  first reaches the stockpile (failed on v0.112.0).

## [0.113.0] - 2026-10-18

Watch's ask: everything you collect from must change as you collect from it,
so nothing still shows goods it no longer has. Rocks already wore down and
forest mushrooms shrank as you gathered, and underground seams and finds turn
to tunnel in one dig, but a building always showed its full picture: an
emptied Mushroom Garden still had its five mushrooms.

### Added
- **Buildings show what waits in them**: a new `stages` slot for buildings in
  texture packs, a list of pictures from empty to full. The default pack has
  four per building (empty, a little, most, full): the garden's and compost
  heap's mushrooms, the quarry's blocks, the mine cart's ore, the brickyard's
  bricks, the foundry's ingots, and pink shards at the foot of the
  Resonator and Observatory (their full pictures, also used in the sheet,
  gained the ingots and shards, and the mine's heap of ore grew). Nothing waiting shows the first; one unit
  already shows the second; full shows the last. `look.stage()` picks it.
- With Logistics a building always looks empty (Watch chose this): nothing
  waits in it, and the flying hauls show it's working.
- A player's pack that draws a building's `image` but not its `stages` keeps
  showing that one picture.

## [0.112.0] - 2026-10-18

Watch's ask: what you gather flew to the stockpile so fast it looked like
flickering artifacts. Each gain threw up to 7 icons at 12 tiles a second,
landing within 1.6 s however far, and every building Logistics hauled from
within 12 tiles sent a fresh burst each second. Watch wants a new player to
get curious and follow them back to spawn, and picked the pace and the
Logistics behaviour on decision cards.

### Changed
- **Flyers float home at 3 tiles a second** (`FLYER_SPEED`, just under the
  3.7 walking speed), with no cap on the flight time, so you can follow one
  home and still overtake it. They lift off, drift with a gentle bob and
  settle onto their pile.
- **One bundle, not a burst**: a gain launches one flyer, and later gains of
  the same resource from the same tile ride along on it for 2 s
  (`FLYER_MERGE`), so a run of swings or a hauling building leaves a calm
  trail of bundles. At most 40 are in the air; the oldest makes way.
- Flyers off screen are skipped when drawing; icons are a little bigger.

### Tests
- `test/unit/effects.test.js`: flyers move slower than walking and land,
  gains bundle per tile and resource, the budget keeps the newest. The
  browser test checks real gathers drift slower than walking in one or two
  bundles instead of clearing within 2 s.

## [0.111.0] - 2026-10-18

Watch's ask: waiting and doing nothing must never be the best option. Held
from spawn, Perfect spent 2-16% of its play standing still (median 9%), and
from the first hour on a gather was worth nothing next to the buildings
(32 a swing against millions a second), so between purchases, hours apart
late on, the best play was to wait. And with Logistics only reaching 3
tiles, walking off to explore lost what the buildings made, while closing
the game lost nothing (away time runs at full rate).

### Changed
- **Hands keep up with buildings**: every gather also brings in `HAND_SHARE`
  (0.1) seconds of what your buildings make of that resource
  (`gatherYield` adds `HAND_SHARE * buildingRate`), and each find's loot
  scales with it too. Holding Gather on a resource adds about a third to it,
  at any stage; a friend's buildings don't count.
- **Logistics hauls from all your buildings, wherever you are**, any layer
  included. `AUTO_COLLECT_RANGE` is gone; hauls within 12 tiles still fly
  in. A shared world's game no longer reports coming within reach of a
  building (`noteWhere`), since the room needs no position to haul.
- **Buildings make 25% less on their own** (every rate and buffer in
  `EXTRACTORS` times 0.75), so a focused player takes about as long as
  before: Perfect reaches Embark in 35.7 h median on 4 worlds (35.7 h
  before, in game time), now with no waiting at all. Away time still runs at
  full rate, of the smaller output.
- **Perfect never stands waiting**: with nothing to fetch, it gathers by
  hand what its goal will take longest to get; hand time counts the
  buildings working alongside; no more camping among buildings (`camp`
  removed, converters go up near home). A bot test fails if it waits more
  than 5 times in its first 45 minutes.

### Fixed
- `holdPerfect` (tests and the benchmark) counted a second of waiting as
  play while the game moved on only a quarter second, so the old baseline
  (37.33 h) overstated play time; the new one is recorded with this rule.

## [0.110.1] - 2026-10-18

Watch's report: holding Perfect looped up and down the mine ladder.

### Fixed
- **Perfect bobbed between layers** near a cave mouth: each small early
  purchase looked quickest to dig for, so it went down for a find or two
  and straight back up for the next. A trip down now counts the way there
  and back, and must be worth at least a minute of digging (`MIN_DIG`);
  once down, the surface's price includes the climb back up (`climbBack`).
  Three seeds that did it from spawn are now bot tests (12 layer changes and
  1.8 s trips before the fix).

## [0.110.0] - 2026-10-18

Watch's ask: replace Explore/Gather with one Perfect button that plays the
game while held, from the first spawn to the edge of Embark, while manual
play stays as it was. Watch picked "Explored only": it never sees through
the fog.

### Added
- **Perfect** is the big button (`src/game/perfect.js`). Held, it asks the
  brain for the next intent every 0.25 s and has the controller carry it out
  through the same calls a tap or press makes (`controller.perform`), so a
  shared world's room sees only a player's acts. It waits while a sheet or
  dialog is up and while you steer, tap, hold a tile or draw a Trail. Its
  badge shows what it's doing or would do (new `ui.perfect`, `ui.explore`
  and `ui.wait` pictures); held, the button lights up. The screen is kept
  awake while held (Wake Lock, where allowed).
- **The brain** (`src/core/perfect.js`, pure): `nextIntent(s, mind)` returns
  walk, harvestAt, collect, buy, place, descend, climb, prop or wait. It
  picks whatever it can have soonest (the pacing simulator's rule), gathers
  by hand at first, fetches from buildings that are filling and camps among
  them under Logistics, mines when finds pay better than the surface (cave
  mouths, shafts, flags, lamps, digging toward finds it can sense, back up
  the way it came), searches for a building's tile it hasn't seen (less
  eagerly after each empty search), leaves the last of a deposit a building
  could use, and keeps Abundance at the Embark level until the rest is done.
  In a world of your own it buys perks: Memory, Heirloom and Cartographer
  first, then Legacy over Nomad. Only explored tiles count. At Embark it
  waits (`why: 'embark'`): the badge turns to Embark, the button pulses
  gold and a toast says so once per world. It never presses Embark or
  anything behind `ask()`. Held from spawn it reaches Embark in 36 h of play
  on seed 12345 and 45 h on 777 (the pacing simulator: 36.4 h).
- **Routes** (`src/core/paths.js`): `findPath` is a cheapest-first search in
  a box, through explored tiles on the surface and through rock you can dig
  underground; the bot tests use it too.
- The wiki has a Perfect article with everything it leaves to you; Controls,
  The screen, The mine, Buildings and Upgrades say Perfect where they said
  Gather.

### Changed
- Gather and Explore are gone from the thumb cluster; their work is
  Perfect's bootstrap. Tapping a building in reach collects it before
  gathering the tile under it, so collecting by hand still works. The green
  outline shows the tile Perfect will work next. `nearestWork` and
  `SEEK_RADIUS` are gone.
- In a shared world, walking within Logistics' reach of one of your
  buildings is written down at once (`noteWhere`), so the room hauls from it
  when your game does instead of refusing what you build with it.
- `walkSpeed(s)` in `sim.js` is the one walking speed.
- The layer button sits 4 px higher so its label no longer touches the big
  button, and on landscape phones the zoom row moves up to stay clear of it.
- The Structurizr model has the Perfect and Perfect Brain components; the
  exported diagrams were not regenerated (the export service is out of this
  environment's reach).

## [0.109.0] - 2026-10-18

Watch's ask: every pile must fit in the spawn zone and never be drawn over
resource tiles outside it; Watch picked "Bigger fixed spawn" (solo worlds
restart, shared worlds get the nuke).

### Changed
- **Home ground is a square, 23 tiles a side** (`HOME_HALF` 11, was a
  circle of radius 5.5). `WORLD_FORMAT` 11.
- **The stockpile has fixed slots** (`yardLayout`): home is laid out like a
  town, roads crossing in the middle and one 10 x 10 block per resource
  (mycelium NW, stone NE, ore SE, crystal SW). The leading digit's piles
  share the corner by the crossroads (one pile gets 8 x 8, up to four 3 x 3,
  up to nine 2 x 2), the second digit's stand along the outer edges, and a
  tile of home ground is left to the wild. No pile ever stands outside home
  ground, so there's no more reading the ground, fog, holes or buildings,
  no settling, and no tidy-up every 90 s: the same amounts always give the
  same yard, and piles slide when the amounts move them. `yardSettle`,
  `yardGround`, `yardCost`, `YARD_RADIUS` and the tiles' `yard` field are
  gone.
- **You start on the edge of home ground, by the nearest forest**
  (`findSpawn`), and home ground plus 6 tiles around it is in view from the
  start, so the first screen shows something to gather rather than bare
  earth.

## [0.108.0] - 2026-10-18

Watch picked "Kingdom ladder": from 10^7 up every pile size reused one
picture per resource, so a rich stash was rows of identical houses.

### Added
- **Six new pile pictures per resource, 10^7 to 10^12**: hamlet, village,
  town, walled city, citadel, crowned capital, each in its resource's
  style (mushroom houses and towers up to a glowing teal capital; stone
  keeps up to a domed palace; copper forges up to a golden-domed foundry;
  crystal spires up to a haloed crystal palace). Each picture's frame is
  fitted to what's drawn, so it fills its square. Past 10^12 the capital
  just grows. The wiki's pile table shows the whole ladder. First load
  grows by about 8 KB gzipped (175 to 183 KB, budget 200).

## [0.107.0] - 2026-10-18

Watch's ask: the stockpile at spawn turns into a crowd of buildings drawn
on top of each other once you're rich; design it better with 2048 in mind.
A save with 458B mycelium, 32B stone, 7.8B ore and 1.2B crystal drew 209
piles spilling into the forest; it now draws 32.

### Changed
- **Only the two leading digits stand as piles** (`PILE_DIGITS`): 3,452 is 3
  carts and 4 baskets, not 3+4+5+2 piles, so a resource never stands as
  more than 18 piles. The biggest piles still say how rich you are.
- **Each resource has its own district**: mycelium north of home, stone
  east, ore south, crystal west (`offDistrict` adds a detour for tiles
  outside a resource's quarter, so it spills over only when its side is
  full). The middle of home (`PLAZA`) stays open.
- **Piles keep a tile apart** (`PILE_GAP`), so big ones no longer stand on
  each other's pictures.

### Added
- **2048-style merges.** When ten piles become one bigger pile, they slide
  together and the bigger pile pops up where they meet, with a little
  overshoot; piles that move (the yard tidying itself every 90 s) slide to
  their new spot instead of jumping. Drawing gets cheaper, not costlier:
  fewer piles, and the sliding ones are only drawn for 0.8 s.

## [0.106.0] - 2026-10-18

Watch's ask: when a shared world undoes something you did (a building put
up, then gone a second later), say why.

### Fixed
- **Your buildings no longer vanish from your screen after a correction.**
  The room's copy of your progress (`progressOf`) listed your buildings by
  place without their kind, and `correctProgress` dropped every one it
  couldn't read, so each `econ` answer took all your buildings off your
  screen while they still stood in the world. Your next progress then
  showed none, which was off again (the live log had `buildings 0` against
  the room's 21), and so on. Saves now name each building's kind, and a
  correction from a room before this version takes the kind from the one
  standing there in the game.
- **What you built or bought while the room was answering stays.** A
  correction keeps buildings and levels that changed since the progress it
  answers was sent (`sentOf`), as it already did for resources; the room
  answers those on their own.

### Added
- **Being told what was taken back, and why.** The room's `econ` answer
  carries `why`: what it refused since the last check (`spot`: someone else
  built or worked there first; `cost`: its count couldn't pay for it;
  `pace`: out of time order or further than anyone can go; `full`: no room
  for more buildings). The game says what it took back (buildings, upgrades,
  resources: `takenBack`) and why, calmly, at most every 20 seconds, and
  nothing for the small differences that are only timing. Being moved back
  to where the world last saw you (`place`) is said too.

## [0.105.1] - 2026-10-18

### Fixed
- **Play a copy opens again from the moderator's page.** The page opens
  only the game's own `#copy=` address, and v0.103.2 added `&of=<room>` to
  it, so the page refused every link. It now takes extra `&name=value`
  parts made only of safe characters; `test/unit/admin.test.js` checks the
  link the room service makes.

## [0.105.0] - 2026-10-18

### Changed
- **Calmer frame rate, less heat** (Watch: the game warmed their phone). The
  map was redrawn on every screen refresh, idle or not (120 times a second
  on a 120 Hz phone). Now it is drawn at most 60 times a second
  (`FULL_FPS`), and 30 (`CALM_FPS`) once nothing has been touched for 3 s and
  neither you nor the trip between layers is moving (`src/game/quality.js`,
  `frameDue`; `src/game/main.js`). Idle main-thread time in a phone-sized
  headless Chrome: 98% to ~60%.
- **Quality steps back up** when the device can keep up again (cooled down,
  plugged in): after 20 s of smooth frames (52 fps or better) it tries one
  level better; a try that is too slow steps straight back and doubles the
  wait, up to 10 minutes, so it never flickers. Where the browser reports
  charging (not Safari), plugging in tries again within seconds. Calm frames
  are never judged.
- Checked a 3-minute walk for leaks: JS heap, DOM nodes and listeners stay flat.

## [0.104.1] - 2026-10-18

### Fixed
- **A busy world shows on the moderator's page right after a deploy.** A
  room with players connected kept running the code from before v0.104.0
  and answered `/admin/players` with an error, so its players were missing
  (Clover Woods, live). Such a room is now asked the older way (brief,
  players, tombstones).

## [0.104.0] - 2026-10-18

Watch's ask: one view of every shared world and everyone in it, the most
progress on top, sortable by anything.

### Added
- **The moderator's page** at `https://rooms.robertasrudys.com/admin`
  (`server/src/admin.js`): every player of every shared world in one table,
  named as the game names them (English / Lithuanian), ranked by milestones
  (ties: resources, then play time) and sortable by any column: status,
  resources, play time, deepest layer, buildings, tool levels, cheat count,
  how often the room's own copy disagreed, when the world was last active.
  A world filter, a name search, smoke-test worlds hidden unless asked, and
  a refresh every 30 s while the page is open. A player's row opens their
  details and three actions: play a copy, freeze or thaw (with a reason),
  and their log for the last 24 hours. Banning stays off the page.
- `GET /admin/players`: every world with its players, names and tombstones
  in one call (one call per room, like `/admin/rooms`).

### Security
- The page itself holds nothing and is the only thing under `/admin` that
  answers without the token. It asks for the token and keeps it in the
  tab (or the browser, if "remember" is ticked); it goes only as a bearer
  to the `/admin/` routes, which still answer 404 without it. Rooms' data
  is written as text, never HTML; the CSP lets the page run only its own
  script and style (by hash), talk only to the service, and never be
  framed; a copy link opens only if it is the game's own `#copy=` address,
  in a tab that can't reach back. `test/unit/admin.test.js` checks the
  hashes, the policy and that nothing in the page writes HTML.

### Changed
- How worlds and players are named moved to `src/net/naming.js`, shared by
  the game and the room service (it was in `worlds.js` and `together.js`).

## [0.103.2] - 2026-10-18

Watch's ask: see everything Willow will see coming back, the greeting on
their own phone included.

### Added
- **A copy can play the player's phone too.** The copy link takes
  `&was=<version>` (the version their open tab last ran: the game updates
  from it and shows What's new since) and `&shown=mycelium:1.4e14,...` (the
  numbers their phone last showed: the arrival then says those weren't real
  when they're far over the room's). `src/game/copy.js` writes them into the
  page's in-memory storage, `sessionStorage` now included.

### Fixed
- **A copy goes by the real world's name.** It was named from its own id, so
  Willow's copy of Clover Woods said "You're in Thunder Woods". The link
  now carries the real world's id (`&of=`) for its name.
- **A copy link opened over a game tab** (only the address's `#` part
  changing) now loads the page again, so the copy starts with storage in
  memory; before, that tab stayed in the admin's own game.

## [0.103.1] - 2026-10-18

From the persistence review, bugs 5 and 7 of 9. Both were confirmed by
tests first: the room's copy came out behind the game, the game was set
back, and the room logged it as `drift` in the security trail, which reads
like an edited save to the moderator.

### Fixed
- **Acts a dying connection swallowed count after all.** Acts carry no
  number or answer, so the ones sent on a connection that had already died
  were lost. The game now keeps the last minute of acts it sent and, after
  a reconnect, sends again every one after the play time of the room's copy
  in the welcome (`together.js` `resync`).
- **A room restart (a deploy) no longer takes back recent progress.** The
  room's copy of each player lived in memory and reached storage only with
  their progress every 10 s, while the world's edits went every 2 s; after
  a restart the world was ahead of the copy, so the gathers sent again were
  refused. Now each player's stored record carries the copy as it is
  whenever the room writes it (`room.js` `takeWrites`), which is with the
  edits they made.
- Tests in `test/unit/together-client.test.js` play a world through a
  swallowed connection and through a room rebuilt from what it stored.
## [0.103.0] - 2026-10-18

Watch's ask: as the game's admin, see exactly what a player would see coming
back to a shared world, in a copy, without changing anything about their
character or the world. First use: Willow in Clover Woods.

### Added
- **Admin copies of a shared world.** `POST /admin/rooms/<id>/copy` with a
  player's id (token only, like every `/admin/` route) copies the room's every
  entry into a room of its own (`server/src/copy.js`) and answers with a link,
  `#copy=<room>.<key>`. The copy lets in only that new key, played as the
  copied player: their progress (the room's own copy of it), buildings,
  colour, place and time away, so their return plays out as it would now
  (away credit, the room's numbers, the nuke if one is due). The player's
  own key is never needed: the room only has its hash. Nobody else gets in,
  there are no invite links in it, it keeps no audit log, it's not in the
  room list, and it deletes itself, sockets and all, after 2 hours.
- **The game opens a copy link** (`src/game/copy.js`, imported first) with
  this browser's storage swapped for one in memory, so the admin's own worlds
  and key are left as they were, and an amber frame and a label say whose
  copy it is. What only the player's phone knew (the numbers it last showed,
  the version it ran) the copy can't show: it plays as their character coming
  back on a phone with nothing on it.

## [0.102.2] - 2026-10-18

From the persistence review, bugs 4 and 9 of 9.

### Fixed
- The 0.79.0 player note said the game moves you to your place in a shared
  world "if you come back from another device", but your key never leaves
  the browser that made it. It now says "after playing offline, or from
  another tab".
- `structurizr/workspace.dsl` still said the save is "format v5": it names
  `WORLD_FORMAT` and says the browser sets a rejected save aside.

## [0.102.1] - 2026-10-18

From the persistence review, bug 3 of 9.

### Fixed
- **Copies kept for shared worlds go with the world.** The progress copy,
  explored map and generation number the game keeps for each shared world
  (`mte.room.`, `mte.fog.`, `mte.gen.`) stayed in the browser forever after
  the world dropped off the Worlds list (12 at most) or was removed. Now
  `src/game/worlds.js` clears every copy whose world isn't on the list
  whenever the list changes, including ones older versions left behind.
  The prefixes moved there from `together.js`. Tests:
  `test/unit/storage.test.js`.
## [0.102.0] - 2026-10-18

For players coming back to a shared world from before the fixes of v0.91.1
and v0.100.0 (Watch's call, after a review of an early player whose game had
shown 139 trillion mycelium against the room's 177 million).

### Added
- **Coming back to smaller numbers says why.** Games before v0.91.1 could run
  away from the room's count; arriving, the game now takes the room's real
  numbers silently, so a player's packs and buildings seemed to vanish. When
  this phone's copy showed far more than the room counts (`overCounted` in
  `src/core/shared.js`: resources more than twice over, or more buildings),
  the arrival toast, and the away toast if one follows, say these are your
  real numbers and an older version showed more than you had.

### Fixed
- **Away time for players who left before v0.100.0.** The room only noted
  when someone left from v0.100.0 on, so a player who left earlier got
  nothing for their time away on coming back. Joining with no note of
  leaving now counts them away since their last progress (`savedAt`),
  capped at 8 hours as always (`server/src/room.js` join).

## [0.101.2] - 2026-10-18

From the persistence review, bug 2 of 9.

### Fixed
- **A damaged save says it's damaged.** The new-world screen told players
  "A big update needs a new world" whenever a save couldn't be read, even
  when it was simply broken. `loadGame` now says why (`lost`: `'format'`
  or `'broken'`) and a broken save gets its own heading and text, which
  also says the old save is kept to one side (since 0.101.1).

## [0.101.1] - 2026-10-18

From the persistence review, bug 1 of 9.

### Fixed
- **A save the game can't read is set aside, not written over.** Before,
  an unreadable save (another format, or broken) was replaced by the new
  world the moment the game opened, so nothing could bring it back. Now it
  is kept under `more-than-enough-save-aside` (`src/game/storage.js`
  `loadGame`), and a save set aside that this version *can* read is taken
  back instead of starting a new world. That also covers an old page the
  CDN serves for a minute after an update: it sets the new game's save
  aside, and the next load of the new game brings it back. Tests:
  `test/unit/storage.test.js`.

## [0.101.0] - 2026-10-18

Watch asked that the game stay good to use when a shared world's player
list is long. Played with 99 simulated players on a local room service.

### Added
- **Players** in Settings (and from the friends' "+N" chip, which did
  nothing before): everyone in the world, you first, then awake before
  asleep, nearest first, with how they're doing, how far away and how many
  layers up or down. The owner gets Remove on each, so anyone can be
  removed, not only the five with a chip. `src/game/players.js`, which now
  also draws the chips, out of `together.js`.
- `npm run test:layout` has a `crowd` state (a fake room service welcomes
  the game into a world of 100) and `players`; the Remove buttons and names
  are checked like other rows.

### Fixed
- Friend chips ran off the left of small phones and under the depth meter:
  only as many as fit show, the rest fold into "+N".
- In a crowd, names over heads covered each other: yours shows first, then
  the nearest, and a name that would cover one already shown waits.
- Edge badges of friends a layer down stacked on each other and on you
  (landscape especially): a badge that would cover another, a name or you
  gives way to the next nearest.

## [0.100.1] - 2026-10-18

### Fixed
- **Nothing floats in the dark any more.** Watch saw other players'
  buildings standing in the void over land they hadn't explored yet. The
  renderer drew every building, prop and tombstone on the layer, explored or
  not. What stands on a layer is now gathered in `src/game/render/scene.js`,
  which leaves out anything on an unexplored tile (lamps then cast no light
  and flags no beacon from the dark); it shows once you explore it. Friends
  still always show, so you can find each other. Tested in
  `test/unit/scene.test.js`.

## [0.100.0] - 2026-10-18

### Added
- **Buildings in shared worlds work while you're away** (stage 3 of the
  server economy). The room works it out, not the game: when a player
  leaves, it notes when and their play time (`gone` on the player); with
  the first progress their game sends after coming back, the wall time that
  their play time doesn't account for is away time (a game that played on
  through a lost connection wasn't away). Their buildings make what they
  would have in up to `AWAY_CAP`, into the room's copy (`Shadow.away`,
  using `produceAway` from `src/core/sim.js`, which solo's `awayProduce`
  now wraps), and the game hears `{t: 'away', secs, made}`, adds it and
  shows the same toast as solo. If the game was off anyway, the `econ`
  correction already carries it and only says so. Logged as `away`.

## [0.99.0] - 2026-10-18

Watch found it unclear which shared world a link joins, and a second
invite seemed not to work once already in a world (it did, but nothing
said where you were, and the world you left dropped out of reach).

### Added
- **World names.** Every shared world has a two-word name made from its id
  (Fern Valley; Paparčių slėnis), the same on every phone and never typed
  by anyone (Watch's call). The join question and the arrival toast say it.
- **Worlds** in Settings: your own world and every shared world you've
  been in (up to 12), with whose it is, how many play there now and Play
  to switch. Remove takes one off the list. `src/game/worlds.js`, split
  out of `together.js` with the list of worlds it kept.
- `GET /rooms/<id>` also says how many play there now (`online`).

### Changed
- A link to a shared world you're already in takes you straight there,
  without the join question (and says so if you're there already).
- *Back to the shared world* and *Leave the shared world* are gone from
  Settings: the Worlds list does both.

## [0.98.0] - 2026-10-18

Fixes from a play test in real browsers (phone, landscape phone, desktop;
several players in one shared world).

### Fixed
- **Sheets were see-through.** `--panel` was 96% opaque, so the map, the
  region name and the HUD buttons showed through every list and Settings.
  Sheets and the milestone banner are solid now.
- **The milestone banner covered your character on a landscape phone.**
  Under 500px tall it drops its trophy and shrinks to a strip above you.
- **Toasts landed on top of the milestone banner** ("You're in the shared
  world" over it, for one): a toast goes under the banner while one is up
  (`placeToast` in `src/game/hud.js`).
- **A milestone from your solo world showed in the shared world** you had
  just gone into: swapping worlds clears the banner queue (`hud.newWorld`).
- **Reconnecting after a dropped connection waited up to 15 s** after the
  network was back. The game now tries at once when the browser goes
  `online` or the game comes back on screen (`together.online`).
- **Friends joining one after another arrived on the same tile.** `beside`
  in `src/core/shared.js` now skips spots where someone already stands.

## [0.97.0] - 2026-10-18

### Added
- Milestone **every refinery at level 9** (`refined9`, Watch's call). After
  Abundance Engine V (about 12 h for the pacing bot) the next milestone was
  every refinery at level 10, about 24 h later; level 9 lands at about 24 h,
  halfway. (Level 8 would land at about 15 h, too soon to split the gap.)

## [0.96.0] - 2026-10-17

### Added
- **Buildings work while you're away** (Watch's choice: full rate, up to 8
  hours). Time away from a solo world, closed or hidden or asleep, is made up
  at once when you come back: every building of yours and the Abundance
  Engine make what they would have in up to `AWAY_CAP` (8 h), straight into
  your packs, and a toast says how much (`awayProduce` in `src/core/sim.js`;
  `catchUp` in `src/game/main.js`). Gaps under `AWAY_MIN` (10 s) are play
  time. The save keeps `seen`, when the world was last open (the game sets it:
  core has no clock). Shared worlds are left to their room for now.
- `fmtDuration` in `src/game/format.js` (was the fork dialog's own helper).

## [0.95.0] - 2026-10-17

### Changed
- **Explore always does something.** Pressed with nothing in reach on the
  surface, it walks to the nearest resource your tools can work (within
  `SEEK_RADIUS`, 14 tiles: `nearestWork` in `src/core/actions.js`) and
  gathers it on arrival; with nothing around, a one-line hint says how to
  walk. The button is lit whenever there is somewhere to go. A brand-new
  player's first press used to do nothing in the bare clearing at home.
- **The next milestone is shown.** Opening the game (while fewer than three
  milestones are reached) or arriving in a friend's world names the next
  milestone in the banner, and every milestone banner adds what's next. A
  region's name waits until the banner is gone instead of overlapping it.
- **Joining a friend puts you a step beside them** (`beside` in
  `src/core/shared.js`), not drawn over them.

### Tests
- Browser test: a new player's first Explore press gathers something,
  leaving at once keeps it, and with storage blocked the game still plays
  and says it isn't saving.

## [0.94.0] - 2026-10-17

### Changed
- **A world takes about 40 hours to master instead of about 16 minutes.**
  Measured with a headless player on real worlds
  (`game-direction/pacing/simulate.mjs` in the project files): v0.88.0
  mastered a world in a median 16 minutes, with most upgrades bought in
  one-second bursts at the end. Prices were refitted so purchases land on a
  widening curve (Watch's choice): something new every minute or two in the
  first hour, then one big upgrade every few hours by the end. Now 34 to 36
  hours for a focused bot on three seeds, so longer for people.
  - Tool, refinery, unlock and Abundance Engine prices in `content.js`;
    every refinery level is now x2 (was x2 up to x6); Abundance growth 27;
    each extra building of a kind costs x2.2 (was x1.65).
  - `EMBARK_MIN_TOTAL` 500 billion (was 1 million); Insight for embarking
    scales with it (`embarkGain`: 22 for one world's worth, as before).
- Four new milestones for the long game: every refinery at level 5, every
  tool at its top level, Abundance Engine V, every refinery at level 10.
- Milestone texts no longer carry prices (the Awards sheet shows what each
  still takes, since v0.84.0). Tests read prices from `content.js`.

## [0.93.0] - 2026-10-17

### Fixed
- Landscape phones: the zoom pill ran into the Settings gear (568x320). On
  short screens it now lies down as a row above the thumb cluster.
- Settings squashed its groups on short screens, hiding Language, Wiki and
  the privacy policy behind the next group; groups keep their height and
  the panel scrolls.
- 320px phones: Invite overlapped Build. The thumb cluster is a little
  smaller there.
- Lithuanian sheet tabs were cut to "Patobul…" / "Apdov…" on phones. Tabs
  now size to their words, slightly smaller on phones.
- Lithuanian counters showed "987…" in the resource bar ("mlrd" didn't fit);
  the bar now uses G for billions, like K and M. Both languages go on to
  trillions (T) and then 1.2e15, instead of thousands of billions.
- Dialogs (nuke, FBI notice, What's new, questions) ran off landscape phones.
  They fit the height now, their buttons always in view, and keep the title
  in view when they open.
- The privacy link in questions used an undefined colour (`--accent`).

### Added
- `npm run test:layout` (`test/layout.e2e.js`): the real game in headless
  Chrome at 12 screen sizes, both languages, 12 states (HUD, underground,
  every sheet, every dialog, huge numbers). Fails on overlapping or
  off-screen buttons, targets under 44px, words cut short, squashed rows and
  dialog buttons below the fold.
## [0.92.0] - 2026-10-17

### Changed
- **The deployed game is one bundled, minified file** (Watch's call).
  `scripts/stage-speed.mjs` bundles `src/game/main.js` and its ~70 modules
  with esbuild (names kept for crash reports, linked source map for DevTools)
  in place of `main.js` in the staged site. The source still runs as it is.
  esbuild is the repo's one dev dependency (`npm ci`; the Pages workflow runs
  it). First load: 263 KB and 72 requests to 160 KB and 4. Slow 3G at 4x CPU
  throttle: 5.3 s to 4.5 s; 4G 2.8 s to 2.5 s.
- `test/unit/load-budget.test.js` budget lowered to 200 KB and 6 requests.
- `MTE_SITE=<staged dir> node test/browser.e2e.js` tests the bundled site.

### Fixed
- The wiki's pictures, broken on the live site since 0.91.0 put the default
  pack's pictures inside `pack.json`: `wiki/textures.js` now shows inline
  pictures as well as files.

## [0.91.1] - 2026-10-17

### Fixed
- **A shared world's corrections (`econ`) now stick.** The game matched the
  room's answer to the progress it sent by play time alone, and two saves
  often go at the same play time (say while the game is hidden), so it took
  the older one's numbers as the base and kept most of what the room had
  just taken away. Live, one player's game ran to 10^14 mycelium while the
  room counted 10^8. Saves are now numbered (`n`) and the room echoes the
  number; against an older room the newest save at that play time is used.

## [0.91.0] - 2026-10-17

### Changed
- **The game opens faster on slow connections and old phones.** The staged
  site (`scripts/stage-speed.mjs`, run by `scripts/stage-site.sh`) puts every
  picture of the default pack inside `pack.json` (one request instead of
  ~150) and names every module and the pack in the page with
  `<link rel="modulepreload">`/`preload`, so they download together instead of
  one import level at a time. The source pack keeps its files. The player's
  own pack is read from IndexedDB while the default one loads. Measured on a
  fresh browser at a phone viewport with 4x CPU throttle: slow 3G 8.7 s to
  5.4 s, 4G 4.5 s to 3.0 s; 243 requests and 300 KB to 74 requests and 259 KB.
- `test/unit/load-budget.test.js` stages the site and fails if the first load
  goes over 300 KB gzipped or 80 requests, a module is not preloaded, or the
  default pack's pictures are separate files again.

## [0.90.0] - 2026-10-17

### Changed
- **Invite links can work for up to a week** (Watch: links expired too
  quickly). `INVITE_LIVES` in `src/net/protocol.js` gains 7 days, like
  Discord's longest timed invite, and new links default to it; 12 hours
  goes, so five choices still fit a small phone. Uses stay capped, never
  unlimited. The room service keeps refusing anything longer.
  Link times over two days read in days.

## [0.89.0] - 2026-10-15

### Changed
- **The room's count of each player's progress is the truth** (server
  economy, stage 2; `server/src/shadow.js`). The progress a game sends is
  only compared: the room keeps its own copy, logs a difference as `drift`
  and sends the game its numbers (`econ`), which the game takes while keeping
  what it got since (`correctProgress` in `src/core/shared.js`). Buildings
  and props go up in the world from the room's copy, not from the game's
  edits. An act counts only in play-time order, within the room's clock,
  within `MAX_SPEED` of the last one, and gathering within a budget (40 at
  once, 24 a second).
- **Shared worlds start from nothing, the owner too** (Watch's call). Going
  online makes a new world from a new seed; the solo world stays for playing
  alone, instead of moving online (0.83.0). The room takes no save or edits
  when it's made.
- Every shared world gets the nuke once (`ECON_FORMAT` in
  `src/core/format.js`, new: like `WORLD_FORMAT`, but leaves solo worlds).

### Fixed
- The room's copy followed only where the player acted, so Logistics hauled
  for it at the wrong times (live drift in 0.87.0). The game now notes where
  it walks (`'w'` acts, every half tile).
- A long backlog of acts goes four messages a frame, and progress waits for
  it, so the room never runs ahead of what's still to come.

## [0.88.0] - 2026-10-15

### Changed
- **Building storage grows with production** (`extractorCapacity` in
  `src/core/economy.js`). A building used to hold its base `buffer` (30–60
  units) at any level, so with big multipliers it filled within a frame and
  sat full: the bar showed +7.7M/s while Logistics could haul at most about
  buffer × frame rate (~3,600/s per building). It now holds `buffer ×
  productionMult`, the same ~100 seconds of output at any level, so the
  shown rate is what you get. The building dial fills against the new
  capacity, and the wiki says so.

## [0.87.0] - 2026-10-15

### Added
- **The room keeps its own copy of everyone's progress** (server economy,
  stage 1 of /mnt/project-files/multiplayer/server-economy-plan.md). In a
  shared world the game records what the player does (`src/core/acts.js`:
  gather, collect, build, place, buy) and sends it as `acts`; the room replays
  each act with the same core rules (`src/core/replay.js`) on its own copy
  (`server/src/shadow.js`), with play time capped by its own clock. Whenever
  the game sends a save, the room compares and logs any difference as a
  `drift` security event (at most once a minute per player), then starts its
  copy again from the save. Nothing is enforced yet; `/admin` player lists
  show `shadow: {checks, off, refused}`.

### Fixed
- `upgrades.buy` looks ids up with `Object.hasOwn`, so `buy(s, 'constructor')`
  is refused like any unknown upgrade.

## [0.86.1] - 2026-10-15

### Fixed
- **Resource bar counters ran into each other on phones.** Rates were shown
  in full (`+7 726 237,6/s`) beside the count and spilled into the next chip.
  Rates now abbreviate like the counts (`fmtRate` in `src/game/format.js`:
  one decimal under 100, then `fmtShort`), counts never use more than three
  digits (`4.7M`, `45k`, `459M`), and each chip puts its icon and count on
  one row with the rate centred under the whole chip. Below 414 px the count
  is a little smaller; below 375 px rates are left out as before. Anything
  that still doesn't fit is cut with an ellipsis instead of overlapping. The
  Build and Collected sheets abbreviate big rates too.

## [0.86.0] - 2026-10-15

### Added
- **Tools open doors, not only bigger numbers** (`GEAR` in
  `src/core/content.js`, `gearFor` / `gearNeeded` / `toolOpens` in
  `actions.js`, `canWade` / `waterAhead` in `sim.js`). Ore and ore seams need
  Pickaxe 2; crystal, crystal seams and geodes Pickaxe 3; the shafts down out
  of layer 3, 6 and 9 and below Pickaxe 4, 5 and 6. Boots 2 take you onto
  water (rivers between regions too); without them the shore stops you, and
  anyone already in the water can always get out. Basket 4 picks rare
  (magic) mushrooms, which pay three times over (`RARE_PAYS`).
- Holding Gather passes by what your tools can't work yet; tapping it, or
  walking into water, says which level it takes. The Upgrades tab shows what
  a tool's next level opens, the wiki's tool tables have an Opens column, and
  the rare mushrooms' cards say they need Basket 4.

## [0.85.0] - 2026-10-15

A pass for races and stale async results (thread "Race conditions"). Each
fix has a test that forces the bad ordering: test/unit/together-client.test.js
drives src/game/together.js against the real room with a fake network.

### Fixed
- **A connection that dies without closing is noticed.** The game pings the
  room every 5 s of play (`ping`/`pong`, answered by the Durable Object's
  auto-response without waking it) and after 15 s of silence drops the
  connection and reconnects, instead of playing on into a dead socket.
- **Edits swallowed by a dead connection aren't lost.** Edits carry a number
  and the room acknowledges each batch (`ack`); after a reconnect the game
  re-sends unanswered ones, except where the room already has something on
  that tile. Before, buildings placed into a dead connection vanished on
  reconnect and mined tiles grew back. Rooms say `pong`/`ack` in the
  welcome, so games and rooms one version apart keep working.
- **One connection at a time.** Every new connection closes the previous
  one; a second tap on Back to the shared world or Invite while connecting
  says so instead of opening another (which could even take the first one's
  place and say "open on another screen").
- **Stale results.** Going online no longer pulls you out of a friend's world
  you joined while the room was being made, arrives with the progress made
  meanwhile, and a failed attempt no longer holds up the sign in the next
  world you enter.
- **Opening the game through a link** you decline, or that no longer works,
  takes you back into the shared world you were in.
- **Two tabs:** a tab in a shared world no longer pops up the "which world to
  keep" choice about the solo save (picking one there swapped worlds under a
  live connection).
- **Room storage writes land whole.** Deletes and puts are issued together
  (one commit), so a ban can't half-land; a write that fails is retried with
  the next one instead of being forgotten.

## [0.84.0] - 2026-10-15

### Added
- **The next milestone, with what it still takes.** The Awards tab (the
  trophy) opens on the next milestone and its price as "Still need" pills,
  or a count (25 structures, Master the world), plus the last milestone far
  off. The trophy gets a green dot when you can pay for the next one
  (`nextGoal`, `goalNeeds`, `nextGoalReady` in `src/core/goals.js`). A player
  in the shared world sat on "Pickaxe II" for 12 hours, one stone short.

### Changed
- **Milestones count in any order** (`goalsDone` in the save; `goalIndex` is
  now how many). Before, a garden built while stuck on the Pickaxe didn't
  count until the Pickaxe did. Old saves keep their count.

## [0.83.0] - 2026-10-15

### Changed
Watch's answers to the state machine review:
- **Going online moves your world, not copies it.** Once the new room
  welcomes you, the solo save is replaced with a fresh world: your world and
  your character (resources, Insight, perks) live on in the shared world
  only, so Leave no longer brings back a stale copy from the moment you went
  online. The owner keeps that progress there; people who join still start
  from nothing.
- **Shared worlds hide Embark.** The Beyond tab doesn't show there (perks you
  already have still work), and milestones end before "Master the world"
  (`goalsTotal`), which needs Embark.

## [0.82.2] - 2026-10-15

### Fixed
- **No different land during a deploy.** The welcome carries the world's
  format (`fmt`: the one it's made with, or the nuke's new one). A game on
  another format doesn't play it: an older game checks for the update and
  reloads into it, a newer one (the site went live before the room service)
  tries again a minute later. Rooms from before this don't send `fmt`, and
  games from before it ignore it.
- **Back to the shared world** forgets a world that's gone (new
  `GET /rooms/<id>` → `{"exists"}`, asked only when a world can't be
  reached), and moves a world that froze your character behind your others.

## [0.82.1] - 2026-10-15

### Fixed
From a review of every state the game can be in
(`multiplayer/state-machine-review.md` in the project files):
- A newer tab taking over a shared world, or the room service being
  unreachable as the game starts, no longer clears the stored shared world,
  so the game opens into it again next time. Leaving on purpose, being
  removed or frozen still forget it.
- Opening an invite link while in a shared world keeps you there until the
  new world lets you in; a link that doesn't work brings you back.
- Away/back changes the room would ignore (one per `STATUS_MS`) now wait
  their turn on the game, so a quick look away and back can't leave friends
  seeing "connection lost" or the nuke waiting on someone who is away.
- The solo nuke (an unreadable or older save at start-up) waits while you're
  in a shared world and shows when you're back in your own; the new solo
  world is saved at once, so it's the one you come back to.
- A banned player trying to come back (the room now says `why: "banned"`)
  sees "You were removed from the shared world", not "ask for a new link",
  and a world that removed you leaves the list Back to the shared world
  tries, so it goes to the next one.
- The "25 structures" milestone counts only your own buildings.
- The What's new card blocks keyboard and pointer input like the other
  dialogs.

## [0.82.0] - 2026-10-15

### Added
- **Tombstones** (Watch's rule). A banned or frozen character no longer
  sleeps in the world: a headstone with a band in their colour and their
  name marks where they last stood, so everyone knows where they were. A
  frozen one sits in a block of ice. The room keeps them (`graves`, in the
  welcome and as a `graves` message, at most 300) until the world is made
  again; thawing a character takes its tombstone away. Frozen friends get a
  `frozen` message (their buildings stay), not `removed`.

## [0.81.0] - 2026-10-15

### Security
- **Hacked characters are frozen, not banned** (Watch's rule). The moderator
  freezes a shared-world character whose progress was clearly edited (the
  anti-cheat sees steps and edits, not saves): `POST /admin/rooms/<id>/freeze`
  with `{"id", "why"}`, undone by `/thaw`. The character stays in the world
  asleep, with what it built; its key can't play it again, the links its
  player made stop, and a frozen owner's world passes on as for a ban. Every
  try to play it shows a joke "FBI" notice (the Fair-play Bureau of
  Investigation, a glowcap on the badge, no real seal) and sends the player
  back to their own world, to start fairly with a new character.

## [0.80.2] - 2026-10-15

### Security
- **The old workers.dev address is off** (`workers_dev = false`). Every game
  has updated to rooms.robertasrudys.com, so the room service is now only
  reachable through the domain, behind Cloudflare's firewall and the
  rate-limiting rule.

## [0.80.1] - 2026-10-15

From the second security audit (finding 4).

### Security
- **The room service moves to rooms.robertasrudys.com**, a Custom Domain on
  the Cloudflare zone, so the zone's firewall and a free rate-limiting rule
  stop floods before they use up the free plan's daily requests (a
  workers.dev address can't have either). The game and its CSP point
  there; the deploy smoke-tests it. Preview addresses are off. The old
  workers.dev address keeps working until every game has updated, then
  goes off.

## [0.80.0] - 2026-10-15

Watch's rule: in a shared world nobody cheats, owners included.

### Changed
- **Owners follow the anti-cheat.** Speed and reach cheats count for a
  world's owner as for anyone, and enough of them ban the owner; the
  moderator can ban owners too. The world then passes to whoever joined it
  first among those left (`owner {id}`, a new message; the game says who
  owns it now). The banned owner's guests stay.
- **Owners have the same caps** (400 buildings, 2,000 props, 10,000 new
  tiles), counted from what they add: what their world held when it was
  made doesn't count. Buildings are now counted per player as they go up.

## [0.79.1] - 2026-10-15

From the second security audit (finding 5).

### Security
- **Away/back can't flood a world.** Each change went to every player and
  into the audit log, so flicking it at the message rate sent thousands of
  messages a second to everyone's phone and about 170 MB of log a day. A
  player's status now changes at most every 2 seconds (`STATUS_MS`); a
  step still brings them back online at once.

## [0.79.0] - 2026-10-15

From the second security audit (finding 3). Reconnecting started a player
afresh: the first step was unchecked (a free teleport) and the edit budget
was the connection's, so one player could use up a world's 100,000 tile
edits in minutes with no cheat recorded.

### Security
- **Reconnecting is no teleport.** The first step after connecting may
  cover the player's budget or the distance they could have walked since
  the room last saw them. Further than that isn't a cheat: the room sends
  `place {p}` and quietly refuses steps and edits until one starts there.
  The game moves the player to `p` (back from another device, or after
  playing offline).
- **Edit budget per player**, kept across reconnects (`Room.watchOf`).
- **A share of the world per player.** A player who isn't the owner changes
  at most 10,000 tiles nobody had changed before (`PLAYER_TILES`); changing
  a changed tile again is free. The nuke resets everyone's shares.

## [0.78.0] - 2026-10-15

From the second security audit (finding 2). One invite could bring in
any number of people: any player could make links, and a ban only stopped
the link the player came in with.

### Security
- **A daily invite limit.** A player who isn't the owner brings in at most
  5 people a day through their own links (`LIMITS.invitesPerDay`, counted
  per joiner); the sixth is turned away with a message saying why. The
  owner has no limit.
- **Bans clean up after themselves.** A ban (by the owner, the anti-cheat
  or the moderator) stops every link the player made, and removes everyone
  who came in through their links, and whoever those brought in. The
  owner's own guests are never taken along.

## [0.77.1] - 2026-10-15

From the second security audit (finding 1).

### Security
- **No player-written text in the audit log.** The log is read by an AI
  reviewer, and the keys of a player's save (unlocks, tools, perks, items)
  went into it as written, so a player could put sentences there. The room
  service now logs only names the game has (`src/net/names.js`, kept equal
  to the game's tables by a test) and drops the rest; a building of a kind
  the game doesn't have is logged as `?`, and an invite code is logged only
  if it looks like a real one.

## [0.77.0] - 2026-10-14

### Added
- **How far your friends are.** Every friend's badge at the screen's edge
  has a pill under their name with the distance in metres, kilometres from
  1 km ("240 m", "1.2 km"; "1,2 km" in Lithuanian). The game's scale is
  now a rule: every tile is 1 m × 1 m × 1 m (README, wiki **Scale**,
  `distance()` in `src/i18n/i18n.js`). On another layer the pill also shows
  an up or down triangle and how many layers.

### Fixed
- Friends' badges on the right edge no longer hide under the zoom pill.

## [0.76.0] - 2026-10-14

From a playtest with a friend.

### Added
- **Build rows say where a building goes** ("Goes on stone within your
  reach") and, when there's nowhere in reach, why Place is greyed out
  ("Can't place here: walk up to stone with nothing built on it").
- **Prices you can't pay yet start with "Still need"**, so the pills read as
  what's left to gather, not the whole price.
- **A one-time hint to hold Gather**, after eight single taps or presses for
  players who haven't found out that holding (the button, Space, or a finger
  on a resource) keeps gathering. Remembered per browser.
- **Invite links say why they turned you away**: expired, used up or
  stopped. The room service adds `why` to its `invite` refusal; older
  clients ignore it.
- Wiki ideas: fish, a shared bank, playtester bots. Worklist: Edge staying
  silent until the tab is muted and unmuted, to reproduce.

### Changed
- **Quality settles faster and stays put**: each visit starts at the level
  the last one settled on (not one better), and frames are judged after
  1.5 s for 1 s at a time (was 3 s and 2 s), so old phones stop lagging on
  every load. The map is never drawn with more than 3 million device pixels
  (a Retina laptop window had several times a phone's), never below 1x for
  that alone.
- README design rule: a one-line hint is fine where playtests show players
  get stuck.

## [0.75.1] - 2026-10-14

### Changed
- **A mushroom logo.** The favicon, app icons (iOS, Android, manifest) and
  wiki brand mark show two glowcaps instead of a pile of logs, since the
  game never cuts trees. `icons/social.svg` adds a link preview
  (`og:image`); `scripts/icons.sh` renders it with the rest.

## [0.75.0] - 2026-10-14

### Added
- **A privacy policy** (`privacy/index.html`, English and Lithuanian):
  what stays on your device, what a shared world keeps and why, the
  automatic anti-cheat and the hourly AI review, how long things are kept,
  who else handles them, children, and your rights. Settings links to it
  (in your language), next to the wiki.
- **Playing together accepts it, with no extra step**: the question before
  going online or joining a friend's world says so and links to the policy;
  Cancel keeps you playing alone. Someone already in a shared world from
  before gets a toast once. A test checks the policy's numbers (days kept,
  how often positions are logged) against the room service's own.

### Removed
- The play-log note in Settings and its first-visit toast (v0.74.0): the
  policy and the join question replace them.

## [0.74.1] - 2026-10-14

### Changed
- **The audit log's security trail is kept 90 days** (`SECURITY_DAYS`):
  `cheat`, `ban`, `deny` and `cut` events outlive the rest of the log,
  which still goes after 14 days. A log chunk with any of them keeps just
  those once it is 14 days old. The Settings note says so.

## [0.74.0] - 2026-10-14

### Added
- **An audit log of every shared world**, to catch cheaters quickly and to
  learn how people play. The room service logs each player's joins and
  leaves, where they are every 15 seconds while they move (and how far they
  walked, what they dug and built since), their progress when it changes,
  every cheat the anti-cheat refuses, bans, and connections cut for breaking
  the limits (`server/src/audit.js`; the events are listed in
  `server/README.md`). Players are known only by their id in that world; no
  address, name or key is kept, and logs are deleted after 14 days.
  Players are told the first time they enter a shared world, and in
  Settings.
- **Moderator routes** on the room service, behind a token (the
  `ROOMS_ADMIN_TOKEN` repository secret, set as the Worker's `ADMIN_TOKEN`
  on deploy): list every world, see its players, export its log as JSON
  lines, and ban a player. Without the token they answer 404. A new
  `Registry` Durable Object keeps the list of rooms (Durable Objects can't
  be listed); older rooms add themselves when next visited.

## [0.73.0] - 2026-10-14

### Changed
- **Smoother on old phones.** A friend on an old Android phone in Firefox
  found a shared world laggy. Profiling on a throttled low-end phone showed
  the cost is pixels, not game logic (under 1 ms of a frame): the map was
  drawn at up to 2 device pixels per CSS pixel, four times the pixels of 1,
  and frosted glass (`backdrop-filter`) on the HUD re-blurred the moving map
  under it every frame, about doubling the compositor's work. Players,
  name tags, the network and the music were small next to these. The game
  now watches its own frame rate (`src/game/quality.js`): while frames
  average under 40 fps it steps down a level at a time, first dropping the
  blur and drawing at 1.5x, then 1x, then 0.75x (softer, never blocky). It
  never steps back up within a visit, and the next visit starts one level
  better than the last settled on. On a 6x-throttled phone this took a
  night scene from about 8 to 25 fps and the zoomed-out view from 9 to 54.
  The perf panel shows the level (`quality`).
- The bottom sheet's blur is gone: its panel is 96% opaque, so it never showed.

## [0.72.2] - 2026-10-14

### Fixed
- **Invite links stuck on "Loading".** v0.72.0 added how many people a link
  lets in as a seventh field of each entry in the room's list. The room
  service went live with it about 20 minutes before the game did (GitHub
  Pages was slow to deploy while the custom domain was being set up), and
  the game still running required exactly six fields, so it dropped the
  whole list without a word. The game now ignores fields it doesn't know
  and gives a list without the limit the default, so either side can be a
  version ahead. If the list doesn't come within 8 seconds, or comes
  malformed, Invite links says so instead of loading for ever.

## [0.72.1] - 2026-10-14

### Security
- **The game lives at https://play.robertasrudys.com**, its own origin.
  On bitkojine.github.io it shared an origin with every other project
  there, which could read players' secret keys and saves and call the room
  service. The old address redirects, and the room service now accepts only
  the new origin. Saves and keys don't carry over (browsers keep them per
  origin), so everyone starts fresh there.

## [0.72.0] - 2026-10-14

### Security
- **Invite links let in a few people, never unlimited.** Like Discord's,
  each link has a most people it lets in (1, 2, 3, 5, 10 or 25; 3 unless
  you pick) and a life (30 minutes, 1, 6 or 12 hours, or a day; a day
  unless you pick), chosen at the top of Invite links. The list shows how
  many of how many joined.
- **Removed means removed.** A player the owner removes is banned from the
  world (their key can't come back), the link they joined with stops, and
  their buildings are taken down for everyone.
- **Basic anti-cheat with auto-ban.** The room refuses steps faster than
  anyone can walk and counts them, and edits far from where a player
  stands, as cheats; ten of them (one a second at most, slowly forgiven)
  ban the player. The owner is never banned from their own world. One
  player (not the owner) can put up at most 400 buildings and 2,000 props.
- **A room can't be locked shut from outside.** One visitor (an IPv4
  address or an IPv6 /48) holds at most 8 sockets in a room, at most 3 of
  them before saying who they are, and a socket has 5 seconds to say so.
- **Room-making limits that hold.** IPv6 visitors are counted by /48, not
  /64, and at most 300 rooms an hour are made in all.
- Rate-limit strikes are forgiven over time, so an honest connection isn't
  cut after hours of play.
- The game won't run inside another site's frame (it offers its own tab),
  the live page's CSP no longer allows localhost, and the wiki got a CSP.
- The room service also accepts https://play.robertasrudys.com, the
  game's coming home of its own.

## [0.71.1] - 2026-10-14

### Fixed
- **Nobody can set off the nuke on their own.** A player could claim a
  newer world format when joining a shared world and so call the nuke,
  which a minute later wiped the world for everyone. Now only the room
  service decides: it knows the current world format (`WORLD_FORMAT`, in
  the new `src/core/format.js`, which the save format is too) and calls the
  nuke only for a world made before it. Players no longer send a format at
  all.

## [0.71.0] - 2026-10-14

### Changed
- **The nuke takes the screen, and everyone presses it.** It's no longer an
  option in Settings. When an update changes how worlds are made (the save
  format), a world from before it gets the nuke: a huge red button in the
  middle of the screen over everything, with no way past it but pressing.
  Alone, that's how you get to the new world. In a shared world the first
  player in with the newer game calls it and it goes up on every screen; a
  press can't be taken back, and it shows how many have pressed it and who
  it waits for. It's pressed for anyone away, offline or with the
  connection lost, and for everyone left a minute after it went up. Then
  the room makes the world again and everyone reconnects to it together;
  anyone away finds themselves in the new world when they come back. Rooms
  now remember which world format they were made with. Shared worlds made
  before this version are from before it, so they get the nuke once.

## [0.70.1] - 2026-10-14

### Fixed
- **Nothing covers your QR sign any more.** Your sign is drawn over other
  players' names and the edge badges, and the zoom buttons hide while it's
  up, so it always scans. Friends' names sit above the small sign they hold
  instead of on it.

## [0.70.0] - 2026-10-14

### Added
- **The nuke.** A big red *Nuke world* button at the bottom of Settings
  makes the world again from scratch, with a new seed and everything new in
  the game, and your progress starts from the very beginning: the fix for
  old worlds missing what an update brings. It replaces *Reset world*. In a
  shared world it's a vote: pressing it (after asking) puts your vote in,
  Settings shows how many have pressed it, who has and who it's still
  waiting for (offline players count as not yet; in a big world the first
  few names and how many more), and you can take your vote back. Once everyone
  has pressed it, the room makes the world again with a new seed, keeps the
  players, their colours and invite links, and everyone reconnects to it
  and starts fresh together. A phone that was away when it happened finds
  out on its way back in and drops its copy of the old world's progress.

## [0.69.0] - 2026-10-14

### Changed
- **Bigger regions.** Each region is now about 500 tiles across instead of
  300, so it takes over two minutes to walk straight through and much
  longer to explore, and names and music change less often. Saves from
  before this start a new world.

## [0.68.0] - 2026-10-14

### Added
- **Tap your invite sign to copy its link.** Tapping (or clicking) the QR
  sign your wanderer holds up copies the invite link, ready to send to a
  friend who isn't there to scan it. In English and Lithuanian.

## [0.67.0] - 2026-10-14

### Changed
- **Up to 100 players in one world** (was 4). Each player gets their own
  colour and name (names repeat with a number past the first 24). The top
  bar shows five friends, awake ones first, and a "+N" chip for the rest;
  only the six nearest friends off screen get an edge badge. To keep a full
  world light, a player's every step goes only to players within 48 tiles on
  their layer; everyone else hears where they are every 2 seconds.

## [0.66.0] - 2026-10-14

### Added
- **Three new tracks.** Heaths, highlands and fens now have music of their
  own instead of borrowing another region's: *Heather and Stone* (a lone
  flute over held strings, wide and windswept), *The High Road* (a march on
  pipes over a drone and a drum) and *Mistwater* (a low flute over rippling
  harp, still and misty). In English and Lithuanian.

## [0.65.0] - 2026-10-14

### Added
- **Walls and hedges between regions.** Besides rivers and rocky ridges,
  regions are now set apart by dry stone walls and flowering hedges, each
  with gaps to walk through. Which borders a region gets depends on its
  land: meadows like hedges, heaths and highlands walls and ridges, lakes
  and fens rivers. Saves from before this start a new world.

## [0.64.0] - 2026-10-14

### Added
- **Invite links you can manage, like Discord's.** An invite link now works
  for a whole day, and putting your sign down no longer stops it; holding
  it up again shows the same link. Settings → *Invite links* lists every
  link you made (the world's owner sees everyone's), newest first: who made
  it, how many friends joined with it, and how long it still works, with
  *Show* to hold it up again and *Stop* to turn it off at once. In English
  and Lithuanian.

## [0.63.0] - 2026-10-14

### Added
- **What's new.** When the game updates itself, a card now thanks you for
  playing, says the game just updated (your progress was saved first), lists
  everything new since the version you were on, and invites you to share
  ideas with the developers (*Share an idea* opens the game's GitHub issues).
  In English and Lithuanian. Every release now adds its player-facing notes
  (`NEWS` in `src/game/news.js`, `news.<version>` in the dictionaries), and
  `npm test` fails if the current version has none.

## [0.62.0] - 2026-10-14

### Added
- **A world map.** A map button at the foot of the zoom opens the world map:
  all the land you've explored, with the names of the regions you've seen,
  home and you. Drag to move around, pinch or scroll to zoom, and tap the
  target to come back to where you are.

### Fixed
- A region's name no longer shows over an open sheet.

## [0.61.0] - 2026-10-14

### Added
- **Big named regions.** The land is now a patchwork of large regions, each
  a few minutes' walk across, like the areas of RuneScape. Every region has
  a name (*Buttercup Downs*, *Owlwood*, *Swan Waters*, *Stormcrags*...) and a
  kind of land of its own: meadowland, woodland thick with forest, lake
  country, rocky highlands rich in minerals, wet fens, or bare heath.
  Between two regions runs a border you can see, a river to swim across or
  a rocky ridge with passes through it. Walking into a region shows its name
  across the screen. Every world starts in a meadow.

### Changed
- **The music changes only between regions.** Each kind of land plays its
  own track, so the tune holds the whole time you're in a region instead of
  switching as you pass a wood or a pond. Night and the mines still have
  their own. Saves from before this start a new world.

## [0.60.2] - 2026-10-14

### Changed
- **Names over heads.** In a shared world everyone's name now floats over
  their head on a tag in their colour, yours included: awake, dozing, asleep
  on the ground or on a boat. The tags stay the same size at any zoom and
  are drawn over the night, so they always read. Yours steps aside while
  your invite sign is up. They replace the little diamonds.

## [0.60.1] - 2026-10-14

### Fixed
- **Text fits what you play on.** On a computer the game no longer says
  "phone" or "tap": the Play together dialogs say your world stays saved on
  this computer, the zoom readout says click, and the wiki's Controls,
  Screen, World, Mine, Buildings and Textures pages talk about the mouse,
  clicking and the keyboard (on a phone: tapping, fingers, no keyboard table).
  Text that differs is written as `{phone:tap|laptop:click}` and `t()` keeps
  the part for this device (`DEVICE` in `src/i18n/i18n.js`, which now also
  decides what your character holds). `npm test` fails on a word like "tap",
  "phone" or "bakstelk" outside such a choice.

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
