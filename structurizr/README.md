# Architecture documentation — Structurizr "models as code"

The system architecture of MORE THAN ENOUGH lives in
[`workspace.dsl`](./workspace.dsl), written in [Structurizr's C4
DSL](https://docs.structurizr.com/dsl). Every diagram in this repo is *derived*
from that single file, so the diagrams can never drift from each other — and both
the model and the diagrams point back at the code, so an agent can jump from "the
Simulation Step component" straight to `src/core/sim.js`.

**`workspace.dsl` is the single source of truth for how the game is built.**
Update it whenever you change how the game is put together, then re-export the
diagrams (see [Tools](#tools)) and commit the regenerated files together.

## The one fact that matters: the production split

The game is plain JavaScript modules with no runtime dependencies, served as
static files; the only server is the room service for shared worlds
(`server/`, a Cloudflare Worker). The runtime separates three responsibilities:

- **`src/core/` — Simulation Core.** The game rules, *pure, DOM-free and
  deterministic*: no DOM, no clocks, no `Math.random()`. The same modules run
  in the browser, under Node in `test/unit/`, and in the room service, which
  replays each player's actions with them (`server/src/shadow.js`).
- **`src/engine/` — Shared tick orchestration.** Fixed 60 Hz gameplay updates
  drive injected input, controller and AUTO interfaces. Browser elapsed time
  schedules bounded catch-up; headless evaluation advances ticks directly.
- **`src/game/` — Web Application.** Presentation and input: DOM, canvas
  renderer, camera, touch/keyboard input, audio, HUD and sheets, localStorage.
  It **only changes state through the Core's exports** (`harvestAt()`,
  `collect()`, `place()`, `buy()`, `step()`, …).

If you are about to put a rule (world generation, economy, unlocks, layers,
day/night) in `src/game/`, `server/` or `index.html`, stop: **rules live in
`src/core/`**. Tests never reimplement rules; they drive the Core
(`test/unit/`) or the real game via `window.MTE_GAME` (`test/browser.e2e.js`).

The model itself (people, systems, containers, components, deployment) is the
DSL; read it there. Every element carries a `ref` or `files` property naming
its code, and `npm test` fails if one names a file that doesn't exist. The
views are exported to `diagrams/` as `.mmd` (renders on GitHub) and `.puml`.

## Tools

Everything is run through one zero-dependency Node script. No Java installation is required.

```sh
node structurizr/scripts/structurizr.mjs <command> [viewKey] [dsl]
```

| Command | What it does |
| --- | --- |
| `validate` | Parses and validates the DSL, prints `OK` or the parser errors (exit code 0/1) |
| `list` | Prints the full model inventory (people → systems → containers → components → deployment) |
| `mermaid [viewKey]` | Exports **all** views to `structurizr/diagrams/*.mmd` (regenerates every view; `viewKey` restricts which one is reported) |
| `plantuml [viewKey]` | Same, as `*.puml` |
| `json` | Writes the equivalent `workspace.json` (gitignored — regenerate on demand) |

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

- The DSL is the single source of truth; `ref`/`files` pointers must follow
  the code when it moves.
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