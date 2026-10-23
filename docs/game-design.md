# MORE THAN ENOUGH — Game Design Document

Updated 2026-10-23 (Europe/Vilnius). The confirmed redesign below is the current design direction, not a description of shipped mechanics. The implementation boundary at the end distinguishes the playable first chapter from the remaining design work.

## Evolve the existing game — confirmed implementation constraint

Keep the existing universe, artwork, character, terrain presentation, movement,
exploration, controls and recognizable game client. The resource, cultivation,
logistics and restoration redesign must evolve those systems. Do not replace
them with a newly built map, character, interface or separate playable prototype.
Use one main game and ship accepted changes to main. Earlier worlds remain
preserved.

## Current redesign — confirmed decisions, 2026-10-23

### Player promise and core activity
Start empty-handed on the surface and build a settlement capable of restoring a dormant machine deep underground. Most player time should go into exploration, designing production sites, and building transport and support infrastructure. Manual gathering bootstraps development and remains a fallback; it is not the primary late-game activity.

### Exactly four economic resources

| Resource | Main location | Intended role | Visual direction |
|---|---|---|---|
| Mycelium | Surface | Baskets, bindings, cultivation beds and flexible components | Pale woven fibres and branching growth |
| Stone | Mainly surface; also present underground | Foundations, workshops, chamber walls and shutters | Heavy blocks and slabs |
| Metal | Underground, accessible before deep crystal | Picks, lifts, collection machinery and structural equipment | Frames, gears, rails and cables |
| Living crystal | Deep underground | Advanced devices and restoration of the machine | Distinct branching crystalline forms |

The player accepted this four-resource direction. Metal is the economic resource; ore deposits can be its natural source without introducing a fifth refined-metal currency. Starter colony/specimen mechanics remain unresolved: do not silently add a fifth economic resource or an inventory micromanagement system.

Surface mycelium/stone bootstrap the settlement. Descending for metal enables underground infrastructure, followed by deep crystal cultivation. Surface ore/crystal deposits and surface buildings that generate these materials without underground dependencies conflict with this direction and need redesign in the new model. Exact depth thresholds, scarcity, recipes and geological distribution remain unbalanced. This does not authorize rewriting previously explored legacy terrain or stripping earned stockpiles.

### Living-crystal cultivation
- Darkness is required for production.
- Cultivation requires deep underground chambers, not just an opaque box on the surface.
- Players also manage temperature: separate growing spaces from hot machinery and build cooling infrastructure.
- Environmental management remains relevant during operation; the exact degree of automation and intervention is undecided.
- Colonies can die when conditions are unsuitable. Backup chambers and recovery matter.
- Any light exposure causes colony damage, making sealed handling essential. Damage rates and lethal exposure duration remain to be designed; this decision does not imply instant death.
- Renewable wild colonies underground supply starter specimens, allowing recovery even after all cultivated colonies are lost. Regeneration timing and specimen collection/transport rules remain open.
- Dangerous heat is communicated primarily through visible changes and sound cues. Inspecting a chamber reveals its exact temperature. Specific cues and accessible alternatives remain to be designed.
- Thermal thresholds, heating/cooling behavior, damage accumulation and recovery rates are not specified yet.

### Machine restoration and completion
Restoring the dormant underground machine is the world-completion objective. The settlement supplies its restoration. Discoveries progressively reveal the machine's purpose, with its main effect reserved for the ending.

The earlier alternative of intermediate repairs primarily activating useful lifts, pumps and passages was not selected; nor was landscape restoration selected as the main repair payoff. The machine’s purpose and final story delivery remain open. The approved playable completion is now three physical repairs followed by safe activation; the recipes are provisional. Completing all legacy upgrade tracks is not the intended new-model victory condition.

### Retained requirements
No wood or tree cutting. Each purchased equipment or building tier needs a distinct physical visual identity.

Every new world starts empty-handed; only knowledge and records carry over. Every purchase and upgrade needs a physical identity. Building functions and outputs must be visually understandable. White chalk accents suit planning and construction where readable. Avoid filler, forced waiting and maintenance click taxes; forty meaningful hours is a future content goal, not a reason to stretch prices or timers. AUTO remains a fair development tool subject to human rules and information. Preserve all existing worlds and earned progress; multiplayer hardening remains deferred.

### Recommendations awaiting confirmation
These are design recommendations, not approved rules:
- Clear warning signs and enough time to respond before a colony dies.
- A recoverable path after losing all cultivated colonies, so the world cannot become unwinnable.
- Simulated darkness that does not require an unreadably dark screen.
- Infrastructure that solves recurring problems without constant switch toggling.

### Latest confirmed choices, 2026-10-23
1. Light: any exposure damages colonies; sealed handling is essential.
2. Total-colony-loss recovery: find renewable wild colonies underground and collect starter specimens.
3. Heat warnings: visual and sound cues first; inspect a chamber for exact temperature.

### Crystal handling and repair — confirmed decisions, 2026-10-23
- First starter: players carefully carry a specimen with a short exposure budget before sealed transport is built. A protective carrier is not a prerequisite for the first specimen. Exact exposure limits, light sources, temperature effects and handling controls remain unspecified.
- All crystal stays sensitive, including harvested construction material. Protected storage and transport are required; harvested crystal must not be treated as a stable, globally available inventory balance that bypasses exposure.
- A surviving damaged colony needs a physical repair/tending action before it can heal. Safe conditions alone do not automatically initiate recovery. Repair equipment/materials, healing duration and possible automation remain open.
- Dead colonies still require replacement starters from renewable wild colonies. Tending a surviving colony is distinct from reviving a dead one.

### Implications to resolve — not additional approved mechanics
- Plan a feasible early collection route within the specimen's exposure budget; later sealed infrastructure should remove repeated hazardous hand-carrying. Exact route guarantees and infrastructure behavior need design.
- Define protection at every material handoff: harvesting, storage, transport, delivery and installation in the final machine. Installed crystal has a confirmed continuing cooling/darkness requirement; its delivery and installation procedures remain open.
- Decide how carried light, inspection and the player's view interact with actual light exposure. Seeing the game should not implicitly be assigned an exposure rule.
- Damaged harvested crystal has a confirmed lower-effectiveness construction use. Exact quality handling, possible repair/reseeding and eligible uses remain open. Colony healing rules do not automatically apply to harvested material.
- Define physical tending as a meaningful action with observable results; avoid assuming a recurring click quota or abstract repair payment.

### Crystal condition and installed operation — confirmed decisions, 2026-10-23
- Exposed carried crystal communicates damage through visible cracks and sound cues, plus a clear remaining-tolerance meter. This is a tolerance/condition indicator, not a promised fixed countdown. Its response to changing light and temperature remains to be specified.
- Harvested crystal damaged by light or heat loses effectiveness but remains usable for less demanding construction. It is not automatically destroyed or assigned a restoration-facility loop. Exact quality requirements, degradation limits and eligible construction uses remain open.
- Installed crystal in equipment and the underground machine still needs ongoing cooling and darkness supplied by settlement infrastructure. Installation does not permanently stabilize crystal or end the protection requirement.

### Consequences requiring further design
- Represent crystal condition within the existing four-resource economy; quality is not permission to add a fifth resource. Storage, selection and delivery rules must preserve condition without burdensome per-piece micromanagement.
- Specify how construction selects suitable crystal, how degraded material is used, and whether installed quality affects capability or efficiency. No recipe thresholds or numerical penalties are agreed yet.
- Explain environmental dependency visibly at the consuming structure. Design infrastructure that can support reliable operation; ongoing requirements do not themselves imply manual maintenance clicks or unavoidable periodic failures.
- Define failure and recovery of installed crystal, particularly in the final machine, without conflating material degradation with death of a cultivated colony. After activation, completion remains an earned record even if later environmental failure damages the installed material.

### Other design questions still open
- What is the machine, why did it stop, and what does activating it do?
- How do players discover its parts and reveal its purpose while retaining agency?
- Which temperature conditions and machinery interactions create interesting layouts?
- How are chambers enclosed, cooled and serviced without exposing colonies to damaging light?
- How long can the first carried specimen tolerate exposure, and how does the player judge and plan a safe route?
- What light sources cause damage, how quickly does it accumulate, and what physical tending enables surviving-colony healing?
- How do wild colonies regenerate, and how do players locate a recovery source without hidden-information shortcuts?
- Which visual and sound cues distinguish safe, stressed and critically endangered colonies, including for players who cannot hear the cues?
- How do material transport and collection work between layers?
- What does each physical equipment/support upgrade let players do?
- What happens in a completed world and what knowledge/records motivate the next?

### Implementation boundary — 0.135.0
The first cultivation chapter is integrated into the existing client, artwork,
character, endless terrain, movement, generated cave connections, music and sheets.
New solo worlds use the four-resource geography and physical progression. Earlier
worlds preserve their terrain, possessions and completion path; they are archived
rather than converted or erased. The normal game has no separate prototype entry.

Implemented: cooling/dark growing chambers, renewable observed wild colonies,
short-lived exposed starters, lightproof carriers, condition-sensitive crystal,
protected storage and sealed chamber-to-vault transfer, physical tending,
degraded-crystal storage reinforcement, and three visible machine-section repairs followed by safe activation.
Installed crystal still needs cooling/darkness. Recipes, 22°C growth limit,
12°C local cooling, rates and tolerance thresholds are provisional playtest values.
Each repair reveals a clue. Activating all three restored sections with viable crystal, cooling and closed shutters completes the playable world. The user approved this restoration/activation win on 2026-10-23; it does not decide the final story reveal or machine purpose. Completion remains a permanent record if infrastructure later fails. Earlier first-section repairs count toward the three stages.

Existing global refinery/Overclock/Abundance purchases are absent from new-world
progression but remain preserved in old worlds. The existing basket/pick/footwear
chains have distinct inventory artwork at every purchased tier. Generated
whole-character raster poses now cover the current stone-tool win route; later
equipment-specific body variations remain to be expanded. Cultivation
facilities and all five machine repair/activation states also have dedicated
chalk-and-slate sprites. AUTO
and multiplayer are not yet adapted to cultivation; no fair new-model AUTO win
or final-game duration is claimed. Fresh-world manual-strategy playtests reach activation in minutes of game time; this is an early playable chapter, far below the eventual meaningful-content goal. Transfers are currently direct sealed links
of bounded reach/throughput, not a finished multi-layer transport network.

Environment work runs at 250ms deadlines using derived local spatial indexes;
rendering is independent. The full simulation still has tick-based scheduling,
so seconds-per-full-world performance is unproven and remains an explicit goal.


## Visual quality and animation direction

The owner wants the polish of high-quality shipped games while preserving this
universe and the orange wanderer. Generated raster artwork is welcome; SVG is
not a quality goal. Quality means the whole moving scene holds together, rather
than detailed individual pictures alone. White chalk remains appropriate for
plans and construction overlays.

Useful design references are Ori's readable silhouette and separation from the
background, Hades' clear anticipation/contact/recovery and restrained impact
hierarchy, and Factorio's visually legible production and physical flow. These
are principles to adapt to this game's camera and quiet exploration, not a
request to copy their assets or add their engine complexity. These game references are design direction, not a claim of a completed
comparative study. Reviewed engine references:
[Godot AnimationTree](https://github.com/godotengine/godot-docs/blob/master/tutorials/animation/animation_tree.rst)
and [2D sprite animation](https://github.com/godotengine/godot-docs/blob/master/tutorials/2d/2d_sprite_animation.rst).
The applicable principles are separate animation assets from the transition
controller, use one-shot actions that return to locomotion, synchronize phase
across related clips, and use discrete/carry transitions for frame-by-frame
sprites instead of dissolving complete figures. These principles do not
require adopting Godot or adding a general-purpose animation graph now.

Production rules:
- Gameplay owns position, inventory, actions, visibility and environmental
  conditions. Presentation consumes those facts; animation never delays or
  grants an action. Headless simulations do not create presentation actors.
- Each actor owns a real-time visual clock and distance-based locomotion phase.
  Simulation acceleration, repeated render passes and device FPS must not
  change cadence for the same movement. Stop and boat poses plant the feet.
- Poses have consistent body proportions, sole registration, grip and facing.
  Action anticipation, contact and recovery use one shared duration definition.
  Complete painted silhouettes use authored keys, not ghosting crossfades.
- Resources and structures must read at normal gameplay scale. Material shapes,
  output locations and moving machinery explain function before decorative
  detail. Equipment shown must be earned; environmental cues must remain fair.
- Review in the real client: small/large scale, both facings, movement, stopping,
  work, carrying, boat, occlusion, bright terrain and dark caves. Review motion
  at 30/60/144 FPS. Keep startup size bounded and reuse cached raster assets;
  no per-frame asset decoding or work proportional to the whole explored world.

Implemented: complete generated key poses, registered soles, distance-based
strides, a presentation clock, blocked/boat foot planting, discontinuity resets,
eight distinct drawings for each of the eight walk/work contexts, full authored
work recovery and two construction taps. This is an incremental foundation,
not a claim that the graphics now equal AAA games.

Next production work, in order:
1. Expand authored movement/action coverage: more intermediate walk/stop keys,
   separate climbing/collection/construction poses and earned equipment tiers.
   The eight-frame loops improve the initial two-stride poses; transitions between
   separate contexts can still snap and need authored coverage.
2. Add reviewed per-clip contact/hand/head anchors and a clip metadata pipeline
   before adding more outfit variants; avoid hardcoded per-outfit exceptions.
3. Unify terrain/building/character material rendering, light direction and
   contact shadows. Preserve darkness gameplay and legibility; atmospheric
   effects must not reveal hidden resources or obscure thermal warnings.
4. Couple impact audio, dust and machinery motion to presentation events with
   budgets and reduced-motion controls. Keep simulation and rendering separate.
5. Establish representative scene captures and motion recordings, with explicit
   visual review and frame-time measurements on a modest phone. Passing tests
   alone does not establish animation or art quality.

The fuller 64-drawing animation set intentionally expands startup to about
1.02 MB compressed within a 1150 KB budget. This is a measured art-quality
tradeoff; additional clips should use asset streaming before continuing to
expand the initial pack. Frame decoding remains cached, outside the tick loop.

## Confirmed eight-direction frame-by-frame character production

The owner chose complete frame-by-frame sprites, explicitly accepting the
large amount of artwork. Keep the existing painted wanderer; do not switch to
a skeletal puppet, 3D character or icon attachments. Eight directions are
required: N, NE, E, SE, S, SW, W, NW. Walking faces movement; collecting,
mining and building face their actual target; stopping retains the last facing.

Consistency is a production requirement: a versioned eight-view model sheet,
shared camera/palette/proportions/handedness, explicit source-space anchors,
matched stride phases, named physical loadout variants, sequential drawings,
recorded timings/contact frames and playback review. Source or metadata changes
invalidate the review. A master prompt is helpful, but cannot guarantee visual
consistency without review.

The production contract is `art/characters/production.json`; the workflow and
acceptance rules are in `art/characters/README.md`. The CLI validates coverage
and produces reference-bound prompts. The initial matrix contains 216 clips
across five loadout contexts; further earned equipment tiers and combinations
must be registered explicitly. Idle/action targets start at 12 drawings and
walking/construction at 16; these are minimum authoring targets, not proof of
smoothness. Existing eight-frame side-view artwork remains legacy coverage.

Current boundary (0.138.0): the owner approved shipping the bare character
first, deferring tools and carrying artwork. All eight views have sixteen
walking drawings and a separate static rest pose, using turnaround-v2.png.
Actions turn toward actual targets but full directional work animations and
animated idles remain unfinished. Earned equipment and all game rules remain
intact. Custom packs and legacy device presentation retain their compatibility
renderer. This is the existing game, with no separate playable prototype.

Atlases load only when needed, through a bounded decoder queue and 64 MiB
cache. Walking uses actual travelled distance; presentation never advances
simulation time. The full 216-clip production goal is still incomplete.
