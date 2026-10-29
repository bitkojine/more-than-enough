workspace "MORE THAN ENOUGH" "C4 model for the MTE idle/survival browser game. This file is the single source of truth for the system architecture: update it whenever you change how the game is built, then re-export the diagrams (node structurizr/scripts/structurizr.mjs mermaid). File references are kept on every element so agents can jump straight to the code (see structurizr/README.md)." {

    !identifiers hierarchical

    model {

        // ------------------------------------------------ people
        player = person "Player" "Plays the game on a phone or desktop browser."
        dev = person "Developer" "Builds and maintains the game and its test suites."

        // -------------------------------------------- the game (system)
        mte = softwareSystem "MORE THAN ENOUGH" "A mobile-first browser game: explore seeded layers, gather resources, grow living crystal and restore an underground teleporter. The first chapter focuses on manual gathering and the minimum win kit; machine activation unlocks later automation. Legacy worlds retain their earlier rules. Plain HTML/CSS/JavaScript with a bundled static client and development-only tooling." {
            tags "Game"

            app = container "Web Application" "The presentation layer (index.html, style.css, src/game/). Owns the DOM, the canvas, input, audio, HUD and sheets, and localStorage. Reads state from the Simulation Core every frame and changes it only through the Core's exports." "HTML/CSS/JavaScript modules" {
                tags "Presentation"
                properties {
                    "files" "index.html, style.css, src/game/"
                }

                main = component "Main Loop" "Wires the modules together and owns the current state (game.state, replaced on embark/reset). Schedules the shared fixed-tick engine independently of drawing. Each simulation tick steers, steps the Core, reveals fog, works held input and ticks AUTO; presentation separately updates effects, save/HUD timers and rendering. A frame, a drawing layer or a tap that throws is skipped and kept as a problem report (faults.js, problems.js); only frames failing in a row stop the game. Exposes window.MTE_GAME for the browser tests." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/main.js"
                    }
                }

                engine = component "Tick and Deadline Engine" "Shared 60 Hz logical clock. Browser catch-up is bounded; the headless runner coalesces stationary ticks ending at AUTO/goal deadlines, retaining fine motion and first Embark eligibility. Cumulative battery intervals preserve daylight transitions. Injected controller, AUTO and input interfaces keep scheduling independent of presentation. Blocked UI suspends AUTO-owned movement." "JavaScript" {
                    properties {
                        "files" "src/engine/clock.js, src/engine/simulation.js"
                    }
                }

                autoplayLab = component "AUTO Developer Viewer" "Lazy single-player viewer booted before normal world loading. Lazily loads viewer-only styles and labels. Runs the shipped AUTO session in bounded real-time work slices at selectable speed, renders the normal client view, and retains separate IndexedDB worlds. The evaluation runner imports the same session." "JavaScript" {
                    properties {
                        "files" "src/game/autoplay-lab.js, src/game/autoplay-session.js, src/game/autoplay-store.js, autoplay-seeds.js, autoplay-text.js, ./autoplay-lab.css, src/i18n/autoplay/en.js, lt.js"
                    }
                }

                input = component "Input" "Raw touch/mouse/keyboard to intents: drag-anywhere joystick, tap, hold Gather (button or Space), hold AUTO (button or P), the Trail stroke (hold Gather and draw), pinch/wheel/button zoom, and sheet shortcuts. Holds no game state; calls the handlers it is given." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/input.js"
                    }
                }

                controller = component "Controller" "Applies intents to the game: tap (descend, harvest, collect, or walk there round obstacles: planWalk/walkAim in core paths.js, replanned when a hoped-open route through fog turns out blocked), Gather (collect, else harvest, else Explore walks to the nearest resource) and its hold, AUTO's intents (perform), Trail sweeps (every way of working a tile takes turns on one hand clock, core pace.js), going down and up between layers, buying, building, embarking, resetting. One queued approach/action routes observed cardinal contact sites once per order, faces the object, then calls the Core. New movement, orders or layer/world changes cancel it. Crafting and carried equipment need no destination. Each calls the Core, then triggers effects, sound, HUD and a save." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/controller.js"
                    }
                }

                perfect = component "AUTO" "The AUTO button (formerly Perfect): while held (and no sheet or dialog is up, and the player isn't steering, gathering or working a tile) it asks the brain for the next intent about four times a second and has the Controller carry it out, the same calls a tap makes. Keeps the badge (what it's doing), waits at Embark with a toast, and keeps the screen awake while held." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/perfect.js"
                    }
                }

                camera = component "Camera" "Maps world (x, y, height) to screen pixels and back (project/unproject) with zoom and a fixed slight lean; picking hits the top or face you see. Also the visible tile range." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/camera.js"
                    }
                }

                render = component "Renderer" "Paints all floor tiles before standing objects in north-to-south row order. Physical light shades each device-pixel-aligned terrain face in painter order. Static standing art shares an 8M-pixel/128-entry LRU of source-picture and 64 opacity buckets; animated and vector-only objects use a capacity-reused viewport-clipped transparent patch; no flat darkness mask slices raised art. Gameplay terrain stays live; the atlas owns distant map zoom. Local viewport-bounded masks preserve higher foreground terrain occlusion without clipping feet against equal-height floor. The faint visibility pass omits character and boat shadows; placement ghosts share the masks, Wiki focus and map mode retain their independent paths, and renderer fault recovery restores canvas clipping. The default player is Mica, a compact flat orange-hooded repairer with skinned split coat/patch, explicit-time mesh-eye blinks and curious idle/recovery poses, actual-cargo protective carrying and world inspection, with eight snapped world headings: twenty-one bone hierarchy with four weighted cloak panels, one-handed mining from the shaft's end and fixed-length arm IK to the WORK_HANDS targets in work-motion.js, earned palm-bound baskets and belt lanterns from work-equipment.js, free-hand assembly and a one-cycle coalescing actor queue with captured work facing, torso and head counterbalance, articulated elbows and wrists, and pure two-bone leg IK plus layered action curves from rig-motion.js. rig-model.js builds the rig without a renderer and names its solids and their joints and grips; rig-clips.js finds crossing triangles between them, which the unit sweep and the local dev build treat as a fault. rigged-character.js lazily bundles vendored Three.js and reuses one 320x448 WebGL surface composited into the 2D canvas. Wiki, a four-bone mycelium sprite with a skinned folding cap (wiki-model.js, pure pose in wiki-motion.js), rides the hood bone in the same pass and outline; src/game/wiki.js decides what it looks at and says (a long press on the map asks it), Mica and Wiki have no pointer hit targets; gestures pass to the world, and focus.js rings what it talks about in Wiki teal around the whole object. pickaxe-model.js supplies cached six-tier palm/back equipment and offline-baked matching icons, one flat fill mesh per tier with no ink shell; the character contour outlines it while equipped and a 2D silhouette stamp outlines the icons. Action/boat feedback shares canonical timing; presentation never runs simulation ticks. Mica is not drawn while the rig loads; without WebGL and for friends, the 2D wanderer stands in. A cached multisampled color target and one alpha-derived screen-space ink pass outline the complete figure, replacing per-piece hulls. Exact sRGB fills are preserved, with no CPU readback in normal rendering. Geometry, combined-pass draw calls and compressed module size are bounded. resource-models.js builds four canonical 3D materials and offline vector views through scripts/resource-art.mjs; icons/deposits/small piles remain cached texture-pack SVGs at runtime, flat value planes over one whole-object ink silhouette with no face or part edges. No player text." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/render/"
                    }
                }

                fx = component "Effects" "Particles, floating text and flyers (resources homing into the pack), with budgets and a flyer lifetime so bursts stay cheap." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/effects.js"
                    }
                }

                ui = component "HUD and Sheet" "Semantic HUD groups share a bounded space policy: resources and horizontal navigation at the top, a fixed version slot below Settings, world status and metadata in one row, and fixed essential action slots. Optional detail collapses in order: performance, friend names, status, Messages. Viewport-defined communication and action regions keep Messages and preview anchors stable when panels open. A separate panel policy lets roomy desktop left logs coexist with right-side Equipment cards or menu sheets; compact screens share expanded disclosure space. Explicit Equipment disclosure opens a compact lights card with a separate crafting view; Settlement combines construction and current-layer site improvements through approach-before-action controller commands. Automatic compaction preserves message preferences and never reveals controls because of warnings. Whole-client fullscreen uses explicit gestures and actual browser state, handles prefixed APIs and unsupported/installed-view help, refreshes the viewport without locking orientation, and never changes game saves. Localized inspection, persistent per-world messages, earnings and the shared sheet remain integrated." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/hud.js, src/game/hud-layout.js, src/game/hud-panels.js, src/game/fullscreen.js, src/game/messages.js, src/game/home-hint.js, src/game/sheet.js, src/game/building-card.js, src/game/placing.js, src/game/reach.js, src/game/statement.js, src/game/income.js, src/game/back.js, src/game/tooltips.js"
                    }
                }

                audio = component "Audio" "A small WebAudio synth unlocked by the first gesture: per-material gather voices, collect/build/upgrade/fanfare cues and an extractor hum. Takes parameters, never reads game state." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/audio.js"
                    }
                }

                look = component "Look" "What everything looks like: the game's one pack (packs/default/). Loads and rasterises its pictures per size, picks variants and animation frames. An unavailable essential startup pack fails with picture/URL details. HTML pictures never emit empty URLs: missing IDs/slots keep labels/layout with a placeholder and a structured fault. Optional DOM resource errors remain nonfatal, with bounded pre-boot queuing and element/request/catalog/build/HTTP diagnostics carried into Problems with world context and map-tap breadcrumbs. Card picture-slot and actual Geode mouse-click tests guard the path. Drawing code and the HUD ask it for colours and pictures by thing id; players cannot load their own." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/look/"
                    }
                }

                yard = component "Yard" "Keeps the stockpile's layout in step with the inventory (at most five times a second), tracks which tiles big piles cover, and makes changes visible like 2048: ten piles slide together into the bigger one they became, moved piles slide, new piles grow in, spent piles puff." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/yard.js"
                    }
                }

                sav = component "Storage" "Guarded localStorage: load, save (reporting failures, never over another tab's save) and setting aside a save it can't read rather than writing over it, plus per-browser view settings. All solo collection models share normal saves, backup imports and per-seed archives. Earlier depot keys remain read-only recovery sources; incompatible local-collection worlds do not connect to rooms." "JavaScript + localStorage" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/storage.js"
                    }
                }
                together = component "Together" "Playing together (src/game/together.js): joins a shared world from a QR link (#join=room.invite) or opens a moderator's copy of one (#copy=room.key; src/game/copy.js keeps the browser's storage in memory then), relays your position, world edits and progress to the room and applies what it sends after checking it (src/net/protocol.js). Keeps friends and their states (online, away, connection lost, offline) for the renderer and the HUD chips, and makes the QR code for the sign your wanderer holds up in the world (src/vendor/qrcode.js). The worlds you've been in, their generated names and the Worlds screen that switches between them are in src/game/worlds.js; the friend chips and the Players screen (everyone in the world) are drawn by src/game/players.js." "JavaScript + WebSocket" {
                    tags "Presentation"
                    properties {
                        "files" "src/game/together.js, src/game/outbox.js, src/game/worlds.js, src/game/players.js, src/game/qr.js, src/net/, src/vendor/qrcode.js"
                    }
                }
                sync = component "Sync" "Your own world on every device you link (src/game/sync.js): the device that shows the QR on the Another device screen (src/game/devices.js) makes a secret sync key, the one that opens its link (#link=key) takes it. Each keeps the world it plays in the room service's vault while it's played and takes the newest when it comes to the front; the world played last carries on, and only when both played the same world does the which-world question come up (src/game/fork.js). Brings a world back to a browser that forgot it." "JavaScript + HTTPS" {
                    tags "Presentation"
                    properties {
                        "files" "src/game/sync.js, src/game/devices.js, src/game/sync-lazy.js, src/i18n/sync/"
                    }
                }
            }

            packs = container "Pictures" "Lanternlight (packs/default/): pack.json mapping every thing in the Catalog to its SVG pictures and colours. Required before the game draws anything; unit tests check it against the Catalog." "JSON + SVG" {
                tags "Presentation"
                properties {
                    "files" "packs/default/"
                }
            }

            wiki = container "Wiki" "The player documentation (wiki/), served next to the game. The game teaches nothing in-game, so every mechanic is written up here; tables and figures are rendered at load time from the Simulation Core's content and tuning, so they can never drift from the game. An Ideas page (ideas.js) collects possible directions for the game, clearly marked as not in it. Everything in the game is listed from the Catalog with its pictures." "HTML/CSS/JavaScript modules" {
                tags "Presentation"
                properties {
                    "files" "wiki/"
                }
            }

            i18n = container "Translations" "Every word the player reads, in English and Lithuanian (src/i18n/, plus the wiki's own in wiki/i18n/). Historical release notes load on demand through news-text.js; startup retains current release prose. Code asks for text by key with t(); the language is picked once at load (the player's choice, else the browser's) and switching reloads the page. A missing key or placeholder throws, and the unit tests fail if either language lacks a key or any text bypasses t()." "JavaScript modules (browser + Node)" {
                tags "Presentation"
                properties {
                    "files" "src/i18n/, wiki/i18n/"
                }
            }

            core = container "Simulation Core" "The game rules (src/core/). Pure and deterministic: no DOM, no clock, no Math.random. Terrain is a pure function of (x, y, z, seed), state is a plain object, and the same modules run in the browser and in Node tests." "JavaScript modules (browser + Node)" {
                tags "Core Engine"
                properties {
                    "files" "src/core/"
                    "invariant" "no DOM, no Date.now, no Math.random; every position is (x, y, z) and every range check is per layer"
                }

                cultivation = component "Living Crystal" "Extends the existing endless world, inventory, clock and commands. New-world geography, local indexed heat and shared propagated physical light, proportional exposure damage, tending, renewable wild colonies, a pure chapter-availability policy with effective tool caps and canonical action locks until activation, paused optional automation with preserved earned state, intrinsically lightproof facility interiors without shutter controls/state, heat-sensitive contents and exposed-cargo light damage, protected material condition/storage/transfer, and three physical dormant-machine repairs plus safe activation, permanent completion and empty-handed next worlds. Dedicated catalog identities provide bespoke chamber/cooler/vault/conduit/machine/equipment sprites and five machine restoration states in the existing row renderer. Legacy terrain/rules and saves are retained." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/cultivation.js, src/core/progression.js, src/game/render/cultivation.js"
                    }
                }

                world = component "Layered World" "Coordinates and key packing (x, y, z), tile rules as data (TILE_INFO), and chunked terrain: the forest surface at z = 0 from noise octaves, solid geology below with one shaft per chunk. Chunks are generated lazily and LRU-cached; player edits (richness mods), per-layer fog and the holes between layers live outside the cache. Explored chunks and observed resource types have derived spatial indexes, including one/two-unit reserve masks that remove exhausted deposits from searches; Map/Set-compatible geometry and prop notifications invalidate dependent light fields and charger candidates." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/coords.js, noise.js, tiles.js, terrain.js, world.js, explored-index.js, observed-types.js, versioned-map.js, versioned-set.js"
                    }
                }

                state = component "State and Saves" "createState() builds the state; serialize/deserialize write and validate a JSON save (its format is WORLD_FORMAT in format.js, frozen so every world is kept; saves from format 10 on load, and the browser sets aside, never overwrites, one it can't read). state.events is transient and never saved." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/state.js, save.js"
                    }
                }

                step = component "Simulation Step" "step(s, dt): production, logistics, abundance income, battery and the burning flare; movement and fog reveal as far as your light reaches (sightRadius). Browser and AUTO hosts enable cumulative solo production after Logistics: grouped rates, cached counts/mastery, command/query settlements, and buffer snapshots at saves or rate changes. Visual events query nearby tile buckets. Cultivation runs local environment deadlines at 250ms in the same canonical step. Chunk-cached sky/artificial illumination follows rock and open ladder connections; direct sky columns retain strength, diffuse paths attenuate, and local dependency invalidation rebuilds fields from surviving sources. Carried fields change only at source tile/strength changes. Sun phases reuse sky access; rendering and proportional crystal exposure consume the same field, with player awareness and remembered exploration separate. Battery intervals support quiet-tick batching and reuse nearby charger candidates with exact range and daylight checks. Reveal compares exact circle row intervals and visits newly covered edges. Resource streams settle together with targeted manual balance updates. Variable-step/shared callers and extreme arithmetic retain the legacy economy." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/sim.js, light.js, illumination.js, flare.js, event-economy.js, economy-context.js, production-ledger.js, resource-ledger.js"
                    }
                }

                actions = component "Actions" "Harvest (gather deposits on the surface, dig rock underground), Trail sweep targets, collect, and build; plus travel between layers through holes (dig down from the forest, climb up through the ceiling, drop through holes and shafts). All personal world actions share interaction.js: walkable same-layer contact on the object's tile or a cardinal side; no diagonal or distant reach. Collection empties one contacted building. Infrastructure remains independent of player contact." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/actions.js, src/core/interaction.js, underground.js"
                    }
                }

                brain = component "AUTO Brain" "nextIntent(s, mind): legal player actions from explored terrain, remembered observations, visible mine glints, own resources and public rules. Integer A* treats unseen underground rock as an assumption and replans after normal revelation, without inspecting hidden geology. Unseen chargers, ladders, shores and tunnel props cannot steer decisions. Prices building repayment against required upgrades; mining is a fallback only when surface acquisition is unavailable, includes passive income and return travel and targets useful observed finds. Waits at Embark, and never spends Insight in shared worlds. Selected known chargers alone authorize charging decisions. Manual holds share AUTO cadence. Pure: mind caches observations and routes." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/perfect.js, paths.js"
                    }
                }

                stockpile = component "Stockpile" "What you own as piles around home, on a logarithmic scale: one pile per unit of the two leading digits (at most 18 per resource), each power of ten its own kind; from 10^7 a pile covers a square of tiles one wider per power, as far as its slot allows. Home ground is a square laid out like a town: roads cross in the middle and each resource owns a block with fixed slots (the leading digit in the corner by the crossroads, the second along the outer edges), so nothing stands outside home ground or on another pile. Pure: only a picture of the inventory." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/stockpile.js"
                    }
                }

                catalog = component "Catalog" "Everything that exists in the game, by the id its pictures are kept under: tiles, resources, buildings, the wanderer, marks, buttons, upgrades, perks and colours, each with what it does and its picture slots. Built from the other content tables, so a new tile or upgrade can't go undocumented." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/catalog.js"
                    }
                }

                economy = component "Economy and Upgrades" "Content tables, costs and multipliers, and one registry of every purchase (tools, refineries, the Abundance Engine, unlocks, perks) that buying, the progression map and the sheet all share; the ledger (income lines, spending at today's prices, payback in seconds of your own income). Stoneworks supplies a non-stacking same-owner quarry bonus within two tiles. A derived tile index caches service links per layout; both scalar and event economies use instance rates. Physical solo depots use an eight-tile same-owner/layer collection index; overlapping depots never duplicate transfers. Also embark/prestige and the goal track." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/content.js, economy.js, logistics.js, ledger.js, upgrades.js, goals.js, state.js"
                    }
                }
            }
        }

        // ------------------------------------- playing together (system)
        rooms = softwareSystem "Room Service" "Lets friends play one world together (server/): a Cloudflare Worker that makes rooms and a Durable Object per shared world that keeps the world and each player's progress, checks every message, and relays positions and edits between up to 100 players. The moderator can make a copy of a world to play as one of its players (server/src/copy.js), apart from the real one, download a whole world as a backup file and put a world that's gone back from one (server/src/backup.js), and has a page listing every world's players, sortable by progress (server/src/admin.js). It also keeps each player's own world for every device they link, by a secret sync key (server/src/vault.js, src/game/sync.js). See server/README.md for the rules and security limits." {
            tags "Server"
            properties {
                "files" "server/, src/net/protocol.js"
            }
        }

        // ------------------------------------------ dev tooling (system)
        tools = softwareSystem "Development Tooling" "ESLint static diagnostics with host-scoped globals, vendor exclusions and CI reports for correctness and complexity debt; test harnesses, deploy pipeline, benchmarks and art tools (3D-baked resource icons, rig and pickaxe reviews in art/). scripts/cultivation-playtest.mjs drives current-rule fresh worlds through controller commands and records the empty save and exact action/tick trace. A localhost-only playtestReplay host in src/game/main.js pauses the wall-clock adapter, replays the full journey through normal controller/UI handlers and validates state parity, caught faults and actual reload in test/browser.e2e.js. Legacy AUTO remains separate." {
            tags "Tooling"

            coreTests = container "Unit Tests" "node:test suites driving the Simulation Core directly: world generation and layers, actions, economy and the progression map, prestige, underground travel and cross-layer regressions, saves and validation, and bot playthroughs with real pathfinding." "Node.js LTS" {
                tags "Tooling, Test"
                properties {
                    "file" "test/unit/"
                }
            }

            e2e = container "Browser E2E Harness" "Spawns a local static server and headless Chrome and drives the real game through the DevTools Protocol (touch, keys, DOM clicks, screenshots)." "Node.js + Headless Chrome + CDP" {
                tags "Tooling, Test"
                properties {
                    "file" "test/browser.e2e.js"
                }
            }
        }

        // ------------------------------------------ relationships
        player -> mte.app "Plays in a mobile/desktop browser"
        player -> mte.wiki "Looks things up"
        mte.app -> mte.wiki "Links to"
        mte.wiki -> mte.core "Renders tables from content and tuning"
        dev -> tools.coreTests "Runs and extends"
        dev -> tools.e2e "Runs and extends"

        mte.app -> mte.i18n "Asks for every word by key"
        mte.core -> mte.i18n "Names things (tiles, buildings, milestones) by key"
        mte.wiki -> mte.i18n "Asks for every word by key; its articles live there"
        mte.app -> mte.core "Drives actions and step(); reads state every frame"
        mte.app.together -> rooms "Makes and joins rooms; relays positions, edits and progress" "HTTPS + WebSocket"
        mte.app.sync -> rooms "Keeps your own world and takes the newest (POST /solo)" "HTTPS"
        mte.app.together -> mte.core.state "Splits and joins shared worlds (shared.js)"
        mte.app.main -> mte.app.autoplayLab "Lazily opens developer-only spectator"
        mte.app.autoplayLab -> mte.app.engine "Advances canonical AUTO ticks without wall-time waiting"
        mte.app.autoplayLab -> mte.app.controller "Uses shipped AUTO session"
        mte.app.autoplayLab -> mte.app.perfect "Holds shipped AUTO only"
        mte.app.engine -> mte.app.together "Ticks it every simulation tick"
        mte.app.render -> mte.app.together "Draws friends where they are shown"
        mte.core -> mte.app "Returns state; emits transient events on auto-collect"
        tools.coreTests -> mte.core "Imports src/core/index.js and steps it directly"
        tools.e2e -> mte.app "Loads index.html; asserts through window.MTE_GAME"

        mte.app.input -> mte.app.controller "Taps, held tiles, Trail strokes"
        mte.app.input -> mte.app.perfect "AUTO pressed and let go"
        mte.app.input -> mte.app.camera "Unprojects pointers; zooms"
        mte.app.main -> mte.app.engine "Schedules fixed ticks independently of drawing"
        mte.app.engine -> mte.app.controller "Steers and works held input each simulation tick"
        mte.app.engine -> mte.app.perfect "Ticks AUTO every simulation tick while held"
        mte.app.perfect -> mte.core.brain "nextIntent"
        mte.app.perfect -> mte.app.controller "Carries out each intent"
        mte.core.brain -> mte.core.world "Reads explored tiles; finds routes"
        mte.core.brain -> mte.core.economy "Reads costs, rates and the registry"
        mte.app.engine -> mte.core.step "Calls step(state, 1/60) every simulation tick"
        mte.app.main -> mte.app.render "Renders each frame"
        mte.app.controller -> mte.core.actions "harvest, collect, place, go down/up, descend"
        mte.app.controller -> mte.core.economy "buy, embark"
        mte.app.controller -> mte.app.fx "Spawns effects"
        mte.app.controller -> mte.app.audio "Plays cues"
        mte.app.controller -> mte.app.ui "Updates the HUD"
        mte.app.controller -> mte.app.sav "Schedules saves"
        mte.app.render -> mte.app.camera "Projects every draw"
        mte.app.render -> mte.core.world "Reads tiles of the camera's layer"
        mte.app.ui -> mte.core.economy "Reads the upgrade registry and costs"
        mte.app.sav -> mte.core.state "serialize/deserialize"
        mte.app.render -> mte.app.look "Colours and pictures by thing id"
        mte.app.render -> mte.app.yard "Draws the piles"
        mte.app.yard -> mte.core.stockpile "Lays out the yard"
        mte.app.yard -> mte.app.fx "Puffs for vanished and merged piles"
        mte.core.stockpile -> mte.core.world "Reads the size of home ground"
        mte.app.ui -> mte.app.look "Icons by thing id"
        mte.app.look -> mte.core.catalog "Reads picture slots from"
        mte.app.look -> mte.packs "Loads at boot"
        mte.wiki -> mte.packs "Shows its pictures"
        mte.core.catalog -> mte.core.economy "Lists what the content tables define"

        mte.core.step -> mte.core.world "Reveals explored tiles"
        mte.core.actions -> mte.core.world "Edits richness (gathering, digging)"
        mte.core.actions -> mte.core.economy "Yields and costs"
        mte.core.state -> mte.core.world "Creates the world; saves its edits"

        // ------------------------------------------ deployment
        deploymentEnvironment "Production" {

            deploymentNode "Browser" "Mobile Safari or desktop Chrome." {
                deploymentNode "Browser tab" "Runs the single-page game." {
                    containerInstance mte.app
                    containerInstance mte.wiki
                    containerInstance mte.packs
                    containerInstance mte.core
                }
            }

            deploymentNode "GitHub Pages" "Static hosting. CI runs the unit tests, then scripts/stage-site.sh copies the game (index.html, style.css, src/), the game's pictures (packs/) and the wiki (wiki/) and stamps a content hash onto every asset URL and module import." {
                infrastructureNode "Static Files" "Serves the staged site over HTTPS."
            }

            deploymentNode "Cloudflare Workers" "Deployed by .github/workflows/rooms.yml with wrangler. Free plan: SQLite-backed Durable Objects." {
                softwareSystemInstance rooms
            }

            deploymentNode "Node.js LTS" "Developer machine / CI runner." {
                containerInstance tools.coreTests
                deploymentNode "Headless Chrome" "Launched by the e2e harness via CDP." {
                    containerInstance tools.e2e
                }
            }
        }
    }

    views {

        systemContext mte "SystemContext" {
            title "System Context"
            include *
            autoLayout
        }

        container mte "Containers" {
            title "Container Diagram"
            include *
            autoLayout
        }

        component mte.core "CoreComponents" {
            title "Simulation Core - Components"
            include *
            include mte.app
            autoLayout
        }

        component mte.app "AppComponents" {
            title "Web Application - Components"
            include *
            include mte.core
            autoLayout
        }

        dynamic mte.app "GameLoop" {
            mte.app.main -> mte.app.engine "Schedules fixed ticks independently of drawing"
            title "Game Loop (fixed ticks and independent drawing)"
            mte.app.engine -> mte.app.controller "Steers and works held input each simulation tick"
            mte.app.engine -> mte.app.perfect "Ticks AUTO every simulation tick while held"
            mte.app.perfect -> mte.core.brain "nextIntent"
            mte.app.perfect -> mte.app.controller "Carries out each intent"
            mte.app.controller -> mte.core.actions "harvest, collect, place, go down/up, descend"
            mte.app.engine -> mte.core.step "Calls step(state, 1/60) every simulation tick"
            mte.core.step -> mte.core.world "Reveals explored tiles"
            mte.app.main -> mte.app.render "Renders each frame"
            mte.app.render -> mte.app.camera "Projects every draw"
            autoLayout
        }

        dynamic mte.app "CollectFlow" {
            title "Tap to gather or dig"
            mte.app.input -> mte.app.controller "Taps, held tiles, Trail strokes"
            mte.app.controller -> mte.core.actions "harvest, collect, place, go down/up, descend"
            mte.core.actions -> mte.core.world "Edits richness (gathering, digging)"
            mte.app.controller -> mte.app.fx "Spawns effects"
            mte.app.controller -> mte.app.sav "Schedules saves"
            autoLayout
        }

        deployment * "Production" "Deployment" {
            title "Deployment"
            include *
            autoLayout
        }

        styles {
            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Deployment Node" {
                shape Box
                background #7d7d7d
                color #ffffff
            }

            element "Game" {
                background #1168bd
                color #ffffff
            }
            element "Core Engine" {
                background #3f7d3a
                color #ffffff
            }
            element "Presentation" {
                background #b0761f
                color #ffffff
            }
            element "Tooling" {
                background #6f4f9e
                color #ffffff
            }
            element "Test" {
                background #8a4f2b
                color #ffffff
            }

            relationship "Relationship" {
                color #707070
            }
        }
    }
}
