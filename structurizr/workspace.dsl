workspace "MORE THAN ENOUGH" "C4 model for the MTE idle/survival browser game. This file is the single source of truth for the system architecture: update it whenever you change how the game is built, then re-export the diagrams (node structurizr/scripts/structurizr.mjs mermaid). File references are kept on every element so agents can jump straight to the code (see structurizr/README.md)." {

    !identifiers hierarchical

    model {

        // ------------------------------------------------ people
        player = person "Player" "Plays the game on a phone or desktop browser."
        dev = person "Developer" "Builds and maintains the game and its test suites."

        // -------------------------------------------- the game (system)
        mte = softwareSystem "MORE THAN ENOUGH" "An idle/incremental browser game: explore an endless seeded world in layers (the forest at z = 0, mine layers below), gather mycelium/stone/ore/crystal, craft tools, automate production with extractors, and chase the Abundance Engine. Pre-1.0 (0.x line); zero dependencies, plain HTML/CSS/JavaScript modules, no build step." {
            tags "Game"

            app = container "Web Application" "The presentation layer (index.html, style.css, src/game/). Owns the DOM, the canvas, input, audio, HUD and sheets, and localStorage. Reads state from the Simulation Core every frame and changes it only through the Core's exports." "HTML/CSS/JavaScript modules" {
                tags "Presentation"
                properties {
                    "files" "index.html, style.css, src/game/"
                }

                main = component "Main Loop" "Wires the modules together and owns the current state (game.state, replaced on embark/reset). Each frame: steer the player, Core step(), turn logistics events into flyers, reveal fog on tile change, work a held tile and tick Perfect, update effects, run the save/milestone/HUD timers, then render. Exposes window.MTE_GAME for the browser tests." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/main.js"
                    }
                }

                input = component "Input" "Raw touch/mouse/keyboard to intents: drag-anywhere joystick, tap, hold Gather (button or Space), hold Perfect (button or P), the Trail stroke (hold Gather and draw), pinch/wheel/button zoom, and sheet shortcuts. Holds no game state; calls the handlers it is given." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/input.js"
                    }
                }

                controller = component "Controller" "Applies intents to the game: tap (descend, harvest, collect, or walk there), Gather (collect, else harvest, else Explore walks to the nearest resource) and its hold, a finger held on a tile, Perfect's intents (perform), Trail sweeps, going down and up between layers, buying, building, embarking, resetting. Each calls the Core, then triggers effects, sound, HUD and a save." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/controller.js"
                    }
                }

                perfect = component "Perfect" "The Perfect button: while held (and no sheet or dialog is up, and the player isn't steering, gathering or working a tile) it asks the brain for the next intent about four times a second and has the Controller carry it out, the same calls a tap makes. Keeps the badge (what it's doing), waits at Embark with a toast, and keeps the screen awake while held." "JavaScript" {
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

                render = component "Renderer" "Draws one frame back to front: terrain for the camera's layer row by row (tops and south faces; zoomed out, the same tiles drawn once into an off-screen map shown scaled) with highlights, extractors and the player drawn in their row; unexplored tiles are left dark and explored edges drop as layered cliffs (strata); then the Trail, particles, floating text, flyers, day/night lighting and the joystick. Changing layers, it slides the old frame away past the rock in between (descent). Never text to read." "JavaScript" {
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

                ui = component "HUD and Sheet" "Resource chips and rates, the depth marker, the contextual thumb buttons, and the bottom sheet: the Progression map (family rails over the upgrade registry), Build, and Beyond. Shows names, levels, numbers and prices only; no instructions (those live in the wiki)." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/hud.js, src/game/sheet.js"
                    }
                }

                audio = component "Audio" "A small WebAudio synth unlocked by the first gesture: per-material gather voices, collect/build/upgrade/fanfare cues and an extractor hum. Takes parameters, never reads game state." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/audio.js"
                    }
                }

                look = component "Look and Texture Packs" "What everything looks like: the default pack (packs/default/) with the player's pack laid over it slot by slot. Validates packs against the Catalog and refuses any with a problem (listing each by thing and slot), loads and rasterises pictures per size, picks variants and animation frames, and remembers the player's pack in IndexedDB. Drawing code and the HUD ask it for colours and pictures by thing id." "JavaScript + IndexedDB" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/look/, src/game/textures.js"
                    }
                }

                yard = component "Yard" "Keeps the stockpile's layout in step with the inventory (at most five times a second), tracks which tiles big piles cover, and makes changes visible like 2048: ten piles slide together into the bigger one they became, moved piles slide, new piles grow in, spent piles puff." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/yard.js"
                    }
                }

                sav = component "Storage" "Guarded localStorage: load, save (reporting failures, never over another tab's save) and setting aside a save it can't read rather than writing over it, plus per-browser view settings." "JavaScript + localStorage" {
                    tags "Presentation"
                    properties {
                        "ref" "src/game/storage.js"
                    }
                }
                together = component "Together" "Playing together (src/game/together.js): makes a room from your world, joins one from a QR link (#join=room.invite) or opens a moderator's copy of one (#copy=room.key; src/game/copy.js keeps the browser's storage in memory then), relays your position, world edits and progress to the room and applies what it sends after checking it (src/net/protocol.js). Keeps friends and their states (online, away, connection lost, offline) for the renderer and the HUD chips, and makes the QR code for the sign your wanderer holds up in the world (src/vendor/qrcode.js). The worlds you've been in, their generated names and the Worlds screen that switches between them are in src/game/worlds.js; the friend chips and the Players screen (everyone in the world, Remove for its owner) are drawn by src/game/players.js." "JavaScript + WebSocket" {
                    tags "Presentation"
                    properties {
                        "files" "src/game/together.js, src/game/worlds.js, src/game/players.js, src/net/, src/vendor/qrcode.js"
                    }
                }
            }

            packs = container "Default Texture Pack" "Lanternlight (packs/default/): pack.json mapping every thing in the Catalog to its SVG pictures and colours. Required before the game draws anything; players' packs override any part of it." "JSON + SVG" {
                tags "Presentation"
                properties {
                    "files" "packs/default/"
                }
            }

            wiki = container "Wiki" "The player documentation (wiki/), served next to the game. The game teaches nothing in-game, so every mechanic is written up here; tables and figures are rendered at load time from the Simulation Core's content and tuning, so they can never drift from the game. An Ideas page (ideas.js) collects possible directions for the game, clearly marked as not in it. Everything in the game is listed from the Catalog with its default pictures, and the texture pack format is documented." "HTML/CSS/JavaScript modules" {
                tags "Presentation"
                properties {
                    "files" "wiki/"
                }
            }

            i18n = container "Translations" "Every word the player reads, in English and Lithuanian (src/i18n/, plus the wiki's own in wiki/i18n/). Code asks for text by key with t(); the language is picked once at load (the player's choice, else the browser's) and switching reloads the page. A missing key or placeholder throws, and the unit tests fail if either language lacks a key or any text bypasses t()." "JavaScript modules (browser + Node)" {
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

                world = component "Layered World" "Coordinates and key packing (x, y, z), tile rules as data (TILE_INFO), and chunked terrain: the forest surface at z = 0 from noise octaves, solid geology below with one shaft per chunk. Chunks are generated lazily and LRU-cached; player edits (richness mods), per-layer fog and the holes between layers live outside the cache." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/coords.js, noise.js, tiles.js, terrain.js, world.js"
                    }
                }

                state = component "State and Saves" "createState() builds the state; serialize/deserialize write and validate a JSON save (its format is WORLD_FORMAT in format.js; a save from another version is rejected, and the browser sets it aside). state.events is transient and never saved." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/state.js, save.js"
                    }
                }

                step = component "Simulation Step" "step(s, dt): extractor production, logistics hauling from all your buildings, the abundance trickle, and hash-seeded regrowth near the player. Also movement, fog reveal and the day/night curve." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/sim.js"
                    }
                }

                actions = component "Actions" "Harvest (gather deposits on the surface, dig rock underground), Trail sweep targets, collect, and build; plus travel between layers through holes (dig down from the forest, climb up through the ceiling, drop through holes and shafts). All work on the player's own layer." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/actions.js, underground.js"
                    }
                }

                brain = component "Perfect Brain" "nextIntent(s, mind): the next thing a careful player would do (walk, gather, collect, buy, place, go down or up, or wait), from what has been explored only. Picks whatever can be had soonest, plans routes (findPath, through dug rock underground), mines when finds pay better, waits for the player at Embark, and never in a shared world spends Insight. Pure: the mind is a cache it keeps between calls." "JavaScript" {
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

                catalog = component "Catalog" "Everything that exists in the game, by the id a texture pack knows it by: tiles, resources, buildings, the wanderer, marks, buttons, upgrades, perks and colours, each with what it does and the slots a pack can fill. Built from the other content tables, so a new tile or upgrade can't go undocumented." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/catalog.js"
                    }
                }

                economy = component "Economy and Upgrades" "Content tables, costs and multipliers, and one registry of every purchase (tools, refineries, the Abundance Engine, unlocks, perks) that buying, the progression map and the sheet all share. Also embark/prestige and the goal track." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "src/core/content.js, economy.js, upgrades.js, goals.js, state.js"
                    }
                }
            }
        }

        // ------------------------------------- playing together (system)
        rooms = softwareSystem "Room Service" "Lets friends play one world together (server/): a Cloudflare Worker that makes rooms and a Durable Object per shared world that keeps the world and each player's progress, checks every message, and relays positions and edits between up to 100 players. The moderator can make a copy of a world to play as one of its players (server/src/copy.js), apart from the real one, and has a page listing every world's players, sortable by progress (server/src/admin.js). See server/README.md for the rules and security limits." {
            tags "Server"
            properties {
                "files" "server/, src/net/protocol.js"
            }
        }

        // ------------------------------------------ dev tooling (system)
        tools = softwareSystem "Development Tooling" "Test harnesses and the deploy pipeline. Zero dependencies." {
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
        mte.app.together -> mte.core.state "Splits and joins shared worlds (shared.js)"
        mte.app.main -> mte.app.together "Ticks it every frame"
        mte.app.render -> mte.app.together "Draws friends where they are shown"
        mte.core -> mte.app "Returns state; emits transient events on auto-collect"
        tools.coreTests -> mte.core "Imports src/core/index.js and steps it directly"
        tools.e2e -> mte.app "Loads index.html; asserts through window.MTE_GAME"

        mte.app.input -> mte.app.controller "Taps, held tiles, Trail strokes"
        mte.app.input -> mte.app.perfect "Perfect pressed and let go"
        mte.app.input -> mte.app.camera "Unprojects pointers; zooms"
        mte.app.main -> mte.app.controller "Steers and works a held tile each frame"
        mte.app.main -> mte.app.perfect "Ticks it every frame while held"
        mte.app.perfect -> mte.core.brain "nextIntent"
        mte.app.perfect -> mte.app.controller "Carries out each intent"
        mte.core.brain -> mte.core.world "Reads explored tiles; finds routes"
        mte.core.brain -> mte.core.economy "Reads costs, rates and the registry"
        mte.app.main -> mte.core.step "Calls step(state, dt) every frame"
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
        mte.app.look -> mte.core.catalog "Validates packs against"
        mte.app.look -> mte.packs "Loads at boot"
        mte.wiki -> mte.packs "Shows its pictures"
        mte.core.catalog -> mte.core.economy "Lists what the content tables define"

        mte.core.step -> mte.core.world "Regrows tiles; reveals fog"
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

            deploymentNode "GitHub Pages" "Static hosting. CI runs the unit tests, then scripts/stage-site.sh copies the game (index.html, style.css, src/), the default texture pack (packs/) and the wiki (wiki/) and stamps a content hash onto every asset URL and module import." {
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
            title "Game Loop (one frame)"
            mte.app.main -> mte.app.controller "Steers and works a held tile each frame"
            mte.app.main -> mte.app.perfect "Ticks it every frame while held"
            mte.app.perfect -> mte.core.brain "nextIntent"
            mte.app.perfect -> mte.app.controller "Carries out each intent"
            mte.app.controller -> mte.core.actions "harvest, collect, place, go down/up, descend"
            mte.app.main -> mte.core.step "Calls step(state, dt) every frame"
            mte.core.step -> mte.core.world "Regrows tiles; reveals fog"
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
