# Resource model workflow

`src/game/render/resource-models.js` is the canonical 3D source. Its authored
polygon vertices and cubic curve controls build real Three.js geometry and the
flat vector finish. No independently redrawn icon variants exist for these views.
The normal client uses the SVGs as ordinary cached images, with no live 3D cost.

Regenerate the 28 shipped views:

```
node scripts/resource-art.mjs
```

The export is deterministic and needs neither a browser nor a GPU. The source
and image hashes are recorded in `models.json` and verified by the quick suite.
`pile-sizes.json` preserves the established footprint of stockpiles. Tiers 0–3
use shared material instances; larger illustrated landmarks are retained.

Inspect the real models, vector finish, native icons and world sprites:

```
CHROME_PATH=/path/to/chromium MTE_RESOURCE_ONLY=1 npm run test:e2e
```

The model keys are mycelium, stone, ore (metal) and crystal (living crystal).
Colours are authored material facets, not dynamic light. Crystal is not emissive.
Individual mushroom species remain separate restored artwork. Review line joins,
small-scale recognition, depletion and material identity on the actual ground.
