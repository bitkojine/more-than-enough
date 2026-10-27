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

## Facing and the 2D fallback

Walk facing comes from actual movement. Actions face the actual resource or
structure target. Stopping preserves facing. A zero-length target vector keeps
the previous direction. Animation never changes rules, resource amounts,
timing, position or visibility.

The painted sprite workflow that came before the rig (frame-by-frame poses,
eight-direction walk sheets and their packers) was retired in v0.145.0; it is
in git history before that release. `turnaround-v2.png` stays as the look
reference. While the rig loads Mica is not drawn; without WebGL, with a
player's own pack, and for friends, the pack's 2D `character.wanderer` stands
in.

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


## World compositing regression

`MTE_LAYER_ONLY=1 npm run test:e2e` checks the current rig in the real world
renderer against a complete-floor reference across north/south row crossings
at three zoom levels. It also checks higher walls and unseen underground rock.
Use `MTE_SITE=site` for the deployable build. The default quick gate includes
bounded floor-order and canvas-state tests; no long simulation is needed.
