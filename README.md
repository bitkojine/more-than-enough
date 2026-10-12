# DEEPER

A one-thumb expedition game about digging down until the mine pushes back. Each
dive builds a connected tunnel through endlessly generated layers. Find fuel,
open pressure pockets, flood passages, haul what you can, and decide when to
extract.

## Play

The game is deployed to GitHub Pages: **https://bitkojine.github.io/more-than-enough/**

Or run it locally with any static server:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in Safari or another modern browser. Progress saves
automatically in local storage for that browser and site.

## Controls

- Drag the bottom-right joystick to move through open tunnels.
- Press and hold any visible tile to preview and drill a connected route. Known
  resources and hazards are marked along the route; lifting your thumb stops it.
- Hard rock consumes fuel. Fuel also powers the extraction beacon.
- Hold **Charge** and drag to aim; release to blast and reshape terrain.
- Activate **Beacon** when you have fuel to extract. It keeps 20% of loose cargo.
- Pressure rises with depth and spikes around hazards. If the hull fails, the dive
  and unbanked haul are lost.

The first-visit guide covers these controls and the fuel tradeoff. Choose each
target yourself, explore the procedural layers, and watch the consequences.

## Surface progression

An extraction returns you to the surface station. Banked resources buy hull,
thruster, cargo, and salvage upgrades. Build station rooms as you discover more
of the mine, or craft basic charges from scrap and copper. Failed dives preserve
permanent upgrades and the bank, but lose loose cargo and discoveries from that
run.

Layer lengths and terrain combinations vary. Each layer contains a guaranteed
resource vein and a route deeper; milestone layers can reveal ruins. Procedural
pressure pockets and brine chambers let players reshape tunnels and uncover
habitats.

## Versioning and deploy

The version is in `version.js`; release notes live in `CHANGELOG.md`. This
gameplay-loop replacement is **0.17.0** and resets older local saves. Pushes to
`main` deploy through GitHub Pages. The workflow hashes asset URLs while staging
the site, so browsers receive cache-busted versions automatically.

## Development

- `core.js` — deterministic terrain, mine simulation, and save/load.
- `game.js` — rendering, thumb controls, hub UI, and persistence.
- `index.html`, `style.css` — page and mobile-first interface.
- `test/core.test.js` — simulation checks.
- `test/browser.e2e.js` — browser-driven gameplay checks.

```sh
node test/core.test.js
node test/browser.e2e.js
```
