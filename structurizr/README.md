# Architecture documentation — Structurizr "models as code"

The system architecture of MORE THAN ENOUGH lives in
[`workspace.dsl`](./workspace.dsl), written in [Structurizr's C4
DSL](https://docs.structurizr.com/dsl). Every diagram in this repo is *derived*
from that single file, so the diagrams can never drift from each other — and both
the model and the diagrams point back at the code, so an agent can jump from "the
Simulation Step component" straight to `src/core/sim.js`.

**This file is the single source of truth for how the game is built.**
Update it whenever you change how the game is put together, then re-export the
diagrams (see [Tools](#tools)) and commit the regenerated files together.

---

## The one fact that matters: the production split

MORE THAN ENOUGH is a plain static web app with **zero dependencies** — there is
no server, no build step, no framework. The browser loads native JavaScript
modules from `src/`, and the interesting architecture is the split between two
folders:

- **`src/core/` — Simulation Core.** The game rules, *pure, DOM-free and
  deterministic*: no DOM, no `Date.now()`, no `Math.random()`. Every position is
  `(x, y, z)` — the forest is `z = 0`, mine layers are below — and every range
  check is per layer. State is a plain object that `serialize()`/`deserialize()`
  turn into a JSON save. The same modules run in the browser **and** under Node,
  which is why `test/unit/` can step the whole game without a browser.
- **`src/game/` — Web Application.** Presentation and input: DOM, canvas
  renderer, camera, touch/keyboard input, audio, HUD and sheets, localStorage.
  It reads state every frame and **only changes it through the Core's exports**
  (`harvestAt()`, `collect()`, `place()`, `buy()`, `step()`, …).

If you are about to put a rule (world generation, economy, unlocks, layers,
day/night) in `src/game/` or `index.html`, stop: **rules live in `src/core/`**.
Tests never reimplement rules; they drive the Core (`test/unit/`) or the real
game via `window.MTE_GAME` (`test/browser.e2e.js`).

## What's modeled

- **People** — Player, Developer.
- **Software systems** — **MORE THAN ENOUGH** (the game) and **Development
  Tooling** (the two test harnesses).
- **Containers** — Web Application (`app`), Wiki (`wiki`), Simulation Core
  (`core`), Unit Tests (`coreTests`), Browser E2E Harness (`e2e`).
- **Components** — 5 in the Core (layered world, state/saves, simulation step,
  actions, economy/upgrades) and 9 in the app (main loop, input, controller,
  camera, renderer, effects, HUD/sheet, audio, storage). Every component
  carries a `ref` (or `files`) property pointing at its modules, and the Core
  carries an `invariant` property restating the pure-deterministic rule.
- **Relationships** — defined at model level with full hierarchical paths
  (`mte.app.input -> mte.core.step`); container-level relationships plus the
  component-level reads/drives/mutations that make the component and dynamic
  views legible.
- **Deployment** — one environment, "Production": the game in a browser tab,
  the staged static files on GitHub Pages, and the test suites on Node and
  headless Chrome (CDP).

### Diagram index (`structurizr/diagrams/`)

| View | File (.mmd / .puml) | Shows |
| --- | --- | --- |
| System Context | `SystemContext` | Player & Developer vs the two software systems |
| Containers | `Containers` | Web Application, Wiki and Simulation Core, plus the two test harnesses |
| Core components | `CoreComponents` | The 5 Core components |
| App components | `AppComponents` | The 9 browser-side components |
| Game Loop | `GameLoop` | One frame: steer, act, `step()`, render |
| Collect Flow | `CollectFlow` | A tap that gathers or digs → effects → save |
| Deployment | `Deployment` | Browser tab (app+core), GitHub Pages, Node + headless Chrome |

Mermaid diagrams render natively on GitHub; the `.puml` files are for
PlantUML-based tooling. Both are regenerated from the same DSL — re-export both
together so they stay in sync.

## Tools

Everything is run through one zero-dependency Node script (Node 18+, global
`fetch` is only used by the MCP fallback). No Java installation is required.

```sh
node structurizr/scripts/structurizr.mjs <command> [viewKey] [dsl]
```

| Command | What it does |
| --- | --- |
| `validate` | Parses and validates the DSL, prints `OK` or the parser errors (exit code 0/1) |
| `list` | Prints the full model inventory (people → systems → containers → components → deployment) |
| `mermaid [viewKey]` | Exports **all** views to `structurizr/diagrams/*.mmd` (regenerates every view; `viewKey` restricts which one is reported) |
| `plantuml [viewKey]` | Same, as `*.puml` |
| `json` | Writes the equivalent `structurizr/workspace.json` (gitignored — regenerate on demand) |

### Engine: local by default

The script is **local-first** — the architecture toolchain must work offline and
in CI without phoning home:

- **Primary: the official Structurizr CLI via Docker**
  (`docker run --rm -v "$PWD":/usr/local/structurizr structurizr/structurizr`).
  One-time setup: `docker pull structurizr/structurizr`. The CLI validates and
  exports the workspace with the same structurizr-export library that powers
  the public MCP server, so the output is byte-identical.
- **Fallback: the official public Structurizr MCP server**
  (`https://mcp.structurizr.com/mcp`), used only when the Docker daemon is not
  reachable. The script prints a note when it falls back.

Force an engine with `STRUCTURIZR_ENGINE=docker|mcp` (e.g. `STRUCTURIZR_ENGINE=mcp
node structurizr/scripts/structurizr.mjs validate`).

## Agent / human workflow

1. **Edit `structurizr/workspace.dsl`** — add/rename components, update
   `ref`/`files`/`invariant` properties, adjust relationships, add views.
2. **Validate**: `node structurizr/scripts/structurizr.mjs validate` — must print
   `OK`.
3. **Re-export**: `node structurizr/scripts/structurizr.mjs mermaid` (and
   `plantuml`). Files are rewritten with a generation header; views removed from
   the model are deleted from `diagrams/`.
4. **Commit the DSL and the regenerated diagrams together** — if the diff shows
   diagram churn you didn't expect, the model and the code disagreed; fix the
   model (or the code) before committing.

## Conventions & parser quirks to respect

- **SPICE**: the DSL is the **S**ingle source of truth, **P**ointers
  (`ref`/`files`) must stay accurate — update them when code moves — and the
  **I**nvariant that `src/core/` is pure/deterministic is stated in the model.
- **Component relationships live at model level** with full hierarchical paths
  (`mte.app.input -> mte.core.step`). `->` inside a component body only resolves
  same-scope elements on the DSL parser, so don't put cross-container arrows there.
- **View keys are positional and must match `[a-zA-Z0-9_-]`** — there is no
  `key` statement in the DSL; the key is the second argument
  (`dynamic mte.app "GameLoop"`), and the human title comes from `title "..."`.
- **Dynamic views must be scoped to a container** (to reference its components)
  and **every dynamic entry needs a matching static model relationship** — the
  parser does not inline new relationships into dynamic views.
- **Styles are newline-sensitive**: one property per line, tags quoted, and
  `relationship "<tag>"` — collapsing them onto one line breaks parsing.
- **Deployment view quirks**: the Browser subtree is defined first in the model;
  a `softwareSystemInstance` would compete with the `containerInstance` pair and
  drop the Browser subtree (first-in-model-order wins), so the static host uses
  an `infrastructureNode` instead. The positional strings on deployment nodes are
  *deployment groups*, not descriptions.
- The generated `workspace.json` is deliberately **not committed** — the DSL is
  the source of truth.