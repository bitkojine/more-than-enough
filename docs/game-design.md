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

## Confirmed 3D character rig (2026-10-24)

The owner superseded the frame-by-frame sprite plan after reviewing incoherent
walk sequences and the cost of regenerating them. Use one 3D model and skeletal
rig, preserving the orange hood, cream mask, dark gloves, cream leg wraps and
shoes. Keep the existing world, renderer, controls and rules. Do not create a
separate playable prototype. Displayed facing snaps to eight world directions (N, NE, E, SE, S, SW, W, NW),
using the existing directional-art sectors. Movement/action vectors select the
nearest direction; zero input retains the last heading. No interpolation through
intermediate facing angles. Movement and targeting remain unrestricted; internal
skeletal articulation and the flat shading remain smooth and unchanged.

The character uses the 3D rig for spatial posing, not a realistic 3D finish.
Unlit flat-fill shaders use the default world art’s warm orange, ivory and
dark-brown palette, with bold silhouette contours matching trees and rocks.
No directional light bands, gradients, specular highlights or filmic tone mapping.
The shared world lighting overlay still applies after compositing. Contours
share the cloak skeleton; geometry and movement remain unchanged. References:
`packs/default/props/oak.svg`, `packs/default/props/birch.svg`,
`packs/default/characters/wanderer.svg` and the original ivory-mask turnaround.

The first integrated version is an empty-handed rig: twenty-one bones, a skinned
cloak, rounded hood and mask, jointed arms, and two-bone leg IK with alternating
stance/swing trajectories. A short real-time start/stop blend settles the last
pose without an idle flash between simulation ticks. Anatomy and proportions are shared across directions.
No generated frame ordering, silhouette crossfades or per-frame model creation.

The 0.140.0 motion pass adds torso roll/twist, counterbalancing hood motion,
flexing elbows and wrists, and four weighted cloak panels with delayed gait
curves. The skinned hem and outline share the cloth weights. Work actions have
separate anticipation/contact/recovery poses; leg IK compensates for crouching.
Idle breathing/head motion use explicit presentation time; steady sign/boat
poses suppress idle motion. All curves are deterministic, bounded and evaluated
from phase/action progress, without a cloth physics solver or simulation work.
Walk follow-through fades through the existing start/stop blend.
The model's source is `src/game/render/rigged-character.js`; the pure motion
functions are in `src/game/render/rig-motion.js`. Art guidance is in
`art/characters/README.md`. Model polish and further equipment/cargo attachments remain work; this first version is not a claim of finished
production character art or realistic cloth simulation.

Presentation observes the existing distance-based phase. The owner requested a tenfold cadence increase in 0.139.1:
a cycle now covers 2.4 world tiles, roughly 0.65 seconds at base speed.
Movement speed remains unchanged; the gait remains stylized rather than a
claim of world-space foot locking. IK preserves limb lengths and keeps soles above the
local ground plane. Animation never changes gameplay timing or simulation state.

A lazy Three.js module renders onto one reusable WebGL surface, composited at
the character's normal depth in the 2D world. WebGL failure/context loss uses
static facing art; custom texture packs retain their compatibility path. The
module does not enter headless simulations. Keep the initial-load budget, a
separate 180 KB compressed 3D-module budget, bounded geometry/draw calls, and
real-client review at native/close scales and across the full motion loop.

The former 216-clip sprite production matrix is retired, not a remaining
release requirement. Its sources and texture-pack compatibility tools remain
available as historical art, not as an active character-production strategy.

The 0.139.1 face follows the original turnaround: an arched dark opening,
pear-shaped warm ivory mask with broad lower cheeks, shallow depth and larger
flat black oval eyes. The eye artwork follows the curved 3D mask surface, so
profile and three-quarter views retain the same identity.


### Shared 3D source, deliberately 2D presentation (2026-10-24)

Confirmed direction: use shared 3D models for consistent proportions, spatial
relationships, attachments and views throughout visuals and icons. Preserve
the established universe through flat authored colours, strong outlines and
fixed views. Articulate parts that move; static icons do not require skeletons
or live WebGL rendering. Migrate assets incrementally inside the existing game.

The first equipment asset is the pickaxe. `src/game/render/pickaxe-model.js`
is the canonical source for six physical tiers and their baked icon images.
The renderer caches each earned tier, attaching its local grip at the right
palm. Walking carries the tool; swing/build actions use the existing
anticipation/contact/recovery arm curves. Picking, collecting, climbing,
landing, cheering and steady sign/boat poses stow it behind the torso.
Tier zero has no model. Legacy earned levels and custom texture packs retain
their compatibility behavior; recipes, yields, unlocks and saves are unchanged.
Early tiers use stone and mineral/fibre construction; later tiers add metal
sockets, bracing and ferrules. No timber or crystal components are introduced.
Icon export records source and image hashes in `art/characters/pickaxe-model.json`
so model changes cannot silently leave stale inventory art. Other equipment
and building/icon families still await migration to this workflow.


### Resource models and earlier art direction (2026-10-24)

The owner rejected the broad v0.135.1 refresh and prefers the earlier warmer
Lanternlight art. Existing building/terrain/mushroom/icon SVGs are restored from
v0.135.0 where later work has not replaced them. Dedicated newer facility states,
the current character rig and shared pickaxe model remain. White chalk stays
useful in construction/planning; it does not replace each material's identity.

`src/game/render/resource-models.js` owns four actual volumetric models:
mycelium (red mushroom caps and cream stems), stone (warm grey facets), metal
(orange mineral nodules and darker host rock; save key remains `ore`) and living
crystal (pink branching prisms). They use authored flat face colours and explicit
base/collection anchors. Static materials do not need moving skeletons.

The same vertices and 3D curve controls produce projected SVG art through
`scripts/resource-art.mjs`: four inventory icons, stone/metal/crystal deposit
and depleted views, and each resource's small stockpile tiers 0–3. Rounded
screen-space contours finish the 3D projection as a deliberately 2D drawing.
Fungal species keep the restored individual artwork; mycelium's model supplies
the shared material icon and stockpile views. Larger illustrated stockpile
landmarks remain a separate art family. Existing stockpile footprints are kept
in `art/resources/pile-sizes.json`; generated asset provenance is recorded in
`art/resources/models.json`.

All views are baked offline, with bounded instances for stockpiles. The normal
client still draws cached texture-pack images; simulations do no model work.
No generation, resource locations, collection/yield rules, saves, purchases,
crystal protection or colony recovery rules change. Crystal colour is not light:
the models have no emissive light sources and provide no environmental protection.

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
