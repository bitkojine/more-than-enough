# Character art production

The chosen approach is complete frame-by-frame painted sprites, including
separate drawings for all eight directions. A skeletal rig or separately
attached inventory pictures is not the production target.

`production.json` is the new production contract. `animation.json` and the
older packers reproduce the currently shipped east-facing art; they do not
provide eight-direction coverage. The first turnaround is deliberately a draft.
No new directional clips have been accepted yet.

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

Future directional playback must use a constant-time indexed clip lookup and
load/cache bounded direction/loadout chunks. Never embed all thousands of
frames into the startup pack or decode them per tick. The existing side-facing
renderer remains in use until accepted directional clips and their runtime
adapter are integrated. Missing coverage must remain visible to developers;
it must never be labelled complete by counting mirrored east artwork as north.
