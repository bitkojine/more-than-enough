# Character art production

## Current: one 3D rig

On 2026-10-24 the owner replaced the sprite-generation strategy with a 3D rig.
The active model and skeletal hierarchy live in `src/game/render/rigged-character.js`;
pure gait/IK is in `src/game/render/rig-motion.js`. Preserve the existing orange
hood, cream mask and outfit. Change shared geometry or motion constraints once,
then inspect every direction in the game. The displayed heading snaps to eight
world directions, with free movement and smooth internal joint motion. Pickaxes now have a shared model and a hand/back attachment;
actual crystal cargo has exposed/sealed carrying models; remaining equipment
coverage is still unfinished.
The 21-bone rig includes four weighted cloak panels, torso/head counterbalance,
elbow/wrist follow-through, idle breath and distinct work-action performances.
Keep cloak trim and repair patches on the same skin weights, and verify action
endpoints, loop continuity and sole clearance alongside visual motion review.

The character uses the 3D rig for spatial posing, not a realistic 3D finish.
Unlit flat-fill shaders use the default world art’s warm orange, ivory and
dark-brown palette, with bold silhouette contours matching trees and rocks.
No directional light bands, gradients, specular highlights or filmic tone mapping.
The shared world lighting overlay still applies after compositing. Contours
share the cloak skeleton; geometry and movement remain unchanged. References:
`packs/default/props/oak.svg`, `packs/default/props/birch.svg`,
`packs/default/characters/wanderer.svg` and the original ivory-mask turnaround.

The model is authored as procedural geometry, not a finished imported production
asset. Three.js r180 is vendored unchanged with its MIT license. One reused
WebGL surface is composited into the current client. Headless playtests never
create the 3D renderer. Use `MTE_RIG_ONLY=1 npm run test:e2e` for the browser
review and add `MTE_RECORD_MOTION=1` to capture a complete continuous loop.
Shared anatomy and continuous joint evaluation replace the old disconnected
poses. Frame counts alone are not a motion-quality measure. Numerical
checks complement, rather than replace, visual review.

## Shared pickaxe model and icon export

`src/game/render/pickaxe-model.js` owns all six tier silhouettes, materials
and a local grip at (0,0,0). It uses flat vertex colours and an ink shell,
merged into two draws for independent views. The unified character contour
hides that instance's ink shell to avoid a double outline. The character caches earned tiers and attaches the
model to its palm or back socket. No icon is pasted onto the character.

Regenerate the six default-pack icons from this same model with:

```
CHROME_PATH=/path/to/chromium MTE_PICKAXE_ONLY=1 MTE_EXPORT_PICKAXE_ICONS=1 npm run test:e2e
```

Run against the source tree (omit `MTE_SITE`). This renders transparent 192px
images into the existing SVG icon containers and records source/image hashes
in `art/characters/pickaxe-model.json`. Icons stay lightweight UI images; the
inventory never creates its own 3D contexts. Without the export flag the same
command reviews held tiers, eight facing directions and swing key poses.
Review native game scale and icon sizes, the hand grip, face clearance and
stowed tools; numerical attachment checks do not establish visual quality.

## Retired sprite workflow


The former approach was complete frame-by-frame painted sprites, including
separate drawings for all eight directions. A skeletal rig or separately
attached inventory pictures is not the production target.

`production.json` is the new production contract. `animation.json` and the
older packers reproduce the currently shipped east-facing art; they do not
provide eight-direction coverage. The initial turnaround remains as a draft for provenance. The first release
uses turnaround-v2.png and the bare eight-direction walks in directional/.
The owner explicitly approved this limited release without tools: eight
16-frame walk clips and eight static rest poses. It does not satisfy the full
216-clip production matrix or the animated-idle/action requirements.

Run `node scripts/pack-directional-character.mjs` to reproduce these assets.
`directional/clips.json` records sources, checksums and playback
metadata. Only the root anchor is used by this bare-character renderer; hand
anchor placeholders are not accepted equipment-contact authoring. Walk clips
use one scale per source sheet, never a different scale for each frame.

## Authoring order

1. Review the eight-view turnaround against the existing wanderer: hood and
   face proportions, cloak hem, gloves, leg wraps, shoes, palette, outline,
   camera and lighting. North must read as a back view; diagonals must be
   distinguishable from their neighbouring profiles. Freeze the model ID and
   source SHA after review. A model revision invalidates dependent clips.
2. Register the exact physical loadout and its valid actions. New earned tiers
   or equipment combinations get explicit variants, not a silent nearest
   substitute. The current 216-clip matrix is an initial tranche, not exhaustive
   coverage of every inventory state. Do not generate impossible combinations.
3. Generate one direction/action/loadout clip at a time using the canonical
   reference and shared prompt. Use the previous accepted clip as an additional
   continuity reference when useful. Review the first cycle before batching.
4. Extract complete figures, retain original masters and record explicit source
   anchors. Do not derive production anchors from orange-pixel heuristics or
   silently rescale every frame to the same bounding box. A crouch changes the
   bounding box, not the character's proportions. `bodyHeight` is the equivalent
   standing model height, checked visually against the reference, not the
   crouched frame's trimmed height.
5. Review the loop at game scale, enlarged, at 30/60/144 FPS, against bright and
   dark world backgrounds. Check all transitions, frame order, contact/hand
   grips, tool reach, feet, equipment occlusion, body scale, seams and clipping.
   Check phase alignment across directions at the same stride phase. No
   mirrored substitute for another direction, no duplicate-frame padding and
   no dissolves between whole silhouettes.
6. Store the playback review and reviewer identity with the clip's fingerprint.
   Any change to source drawings, anchors, timing or contact metadata makes
   that review stale. Automated checks cannot determine whether the art looks
   good; visual playback review remains necessary.

## Commands

- `npm run art:check` checks the production manifest and reports real coverage.
  A valid unfinished manifest can pass while still reporting missing clips.
- `npm run art:check -- --coverage` lists missing variant/action/direction keys.
- `npm run art:check -- --complete` fails until the required matrix is accepted.
- `npm run art:prompt -- bare walk ne` emits the shared generation prompt and
  reference paths. `ready: false` means the turnaround remains a draft, not a
  production-ready reference. Attach the actual reference to image generation.

## Clip record

Each clip declares `variant`, `action`, `direction`, `model`, `modelSha`,
`canvas`, `frames` and `review`. Each frame declares its source `file`, `sha256`,
positive duration `ms`, equivalent standing `bodyHeight`, and explicit `anchors`
(`root`, `leftHand`, `rightHand`, `head`) in source canvas pixels. The root is
fixed to the ground support point. Actions with physical contact also declare
`contactFrame`. A playback review declares `status: accepted`, reviewer `by`,
`playback` path and `sourceDigest` from `clipFingerprint`. Paths are repository
relative; source and review media belong with the art, outside the shipped
startup pack. Keep hands in the same anatomical roles in every direction.

## Client integration boundary

Walk facing comes from actual movement. Actions face the actual resource or
structure target. Stopping preserves facing. A zero-length target vector keeps
the previous direction. Batch collection needs an explicit representative
actual source, not the nearest hidden object. Animation never changes rules,
resource amounts, timing, position or visibility.

Directional playback uses a constant-time indexed clip lookup and
load/cache bounded direction/loadout chunks. Never embed all thousands of
frames into the startup pack or decode them per tick. The side-facing renderer remains for custom packs and legacy device
compatibility. Missing coverage must remain visible to developers;
it must never be labelled complete by counting mirrored east artwork as north.


## Mica identity pass

The integrated rig is the working character Mica, the Mender (v0.143.0). The GDD
records the replaceable identity and backstory. The live visual pass uses a soft
asymmetric hood, rounded shallow face with mesh eyes, compact proportions,
broad mittens/boots, split hem and skinned repair patch. Three skinned meshes
share the same skeleton; a later whole-figure pass supplies the silhouette outline. Blink and idle attention use explicit presentation time;
there is no per-frame face texture upload. Actual carried crystal selects a
cached exposed specimen or sealed container and a protective two-hand pose.

Review records and the current walk clip live in `art/characters/rig-review/`.
These are evidence of bounded rendering and reviewed poses, not a claim of final
art quality or world-space foot locking. Other equipment coverage is unfinished.

The v0.143.1 foot correction uses rounded, ring-built work-boot geometry with
a narrower heel and curved instep. Thin brown soles replace the earlier square
cream platforms. Existing ankle pivots and the gait clearance envelope remain.
The retained walk review is regenerated from this geometry.

The v0.143.2 outline follows the completed character image, replacing individual
expanded mesh hulls. A cached 320×384 multisampled color target feeds one alpha
contour shader, covering every visible part and carried object with the same
source-image ink width. The sRGB target preserves exact material colors. No CPU
pixel readback or per-frame model construction is used in normal rendering.
Three skinned meshes remain (coat, hem and patch); GPU statistics include both
the source and contour pass. `MTE_OUTLINE_ONLY=1 MTE_RIG_ONLY=1 npm run test:e2e`
runs the bounded pixel-edge regression, including poses with tools and cargo.


## Tool-use constraints

`src/game/render/work-motion.js` owns the pure arm solver and work trajectories;
`src/game/render/work-equipment.js` owns the cached earned basket/lantern props.
Driving/guide grips follow the existing pickaxe shaft. Baskets stay palm-bound
and upright, and lantern controls reach the actual belt prop. Reset every arm
axis before solving so frame order cannot change the pose. A single pending
actor cycle prevents repeated receipts from rewinding the current stroke.

`MTE_WORK_ONLY=1 npm run test:e2e` checks grips, stowing, missing gear, actual
contacts, frame-order independence and GPU budgets. `MTE_RECORD_WORK=1` exports
optional bounded work-clip captures; native/enlarged playback belongs in
`art/characters/rig-review/`. Keep the shared eight headings and silhouette
contour. Review image quality as well as kinematic constraints. Gameplay reach
remains the canonical abstract reach, not an animation collision check.
