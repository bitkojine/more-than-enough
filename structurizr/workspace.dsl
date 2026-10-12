workspace "MORE THAN ENOUGH" "C4 model for the MTE idle/survival browser game. This file is the single source of truth for the system architecture: update it whenever you change how the game is built, then re-export the diagrams (node structurizr/scripts/structurizr.mjs mermaid). File/function references are kept on every element so agents can jump straight to the code (see structurizr/README.md)." {

    !identifiers hierarchical

    model {

        // ------------------------------------------------ people
        player = person "Player" "Plays the game on a phone or desktop browser."
        dev = person "Developer" "Builds and maintains the game and its test suites."

        // -------------------------------------------- the game (system)
        mte = softwareSystem "MORE THAN ENOUGH" "An idle/incremental browser game: explore a seeded world, gather wood/stone/ore/crystal, craft tools, automate production with extractors, and chase the Abundance Engine. Pre-1.0 (0.x line); zero dependencies, plain HTML/CSS/JS." {
            tags "Game"

            app = container "Web Application" "The presentation layer (index.html + style.css + game.js). Owns the DOM, the canvas renderer, input (keyboard + touch joystick), audio, HUD/sheets, and localStorage save glue. Reads state from the Simulation Core every frame and only touches rules through the public Core API." "HTML/CSS/JavaScript" {
                tags "Presentation"
                properties {
                    "files" "index.html, style.css, game.js"
                }

                input = component "Input and Actions" "Keyboard (WASD/arrows + Space/B/U/C), touch joystick, tap-to-walk, and the contextual action button. doAction() picks COLLECT when an extractor is in manual range, otherwise GATHER; holding repeats every GATHER_CD (0.25s)." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "game.js: doAction, doGather, doCollect, the actDown loop in update()"
                    }
                }

                render = component "Canvas Renderer" "drawTile/highlights/extractors/player, particles, floats, and flyers; camera follow; then the day/night lighting pass (applyLighting + auto flashlight pool) so the glow covers the flyers. Tiles are drawn only for the visible viewport." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "game.js: render(), draw*, applyLighting(), FLASHLIGHT_* constants"
                    }
                }

                fx = component "Visual Effects" "particles/floats/flyers arrays; spawnGatherFX / spawnBuildFX / spawnFlyers (homing ease-in resource sprites, 1-7 capped, staggered launch) and popFlyer. Drains core state.events into flyers each frame so logistics auto-collect animates too." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "game.js: spawnFlyers, popFlyer, drawFlyers, update() events drain"
                    }
                }

                ui = component "HUD, Sheets and Goals" "Resource chips, goal banner + compass hint arrow, upgrade/build/beyond tabs, action button, toasts. checkGoals() advances the goal index with a fanfare flash; updateHud refreshes DOM chips." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "game.js: updateHud, renderSheet, checkGoals, updateHint"
                    }
                }

                audio = component "Audio" "Tiny WebAudio synth (unlocked on first pointer/key): gather/collect/build/fanfare sounds with per-resource pitches." "JavaScript" {
                    tags "Presentation"
                    properties {
                        "ref" "game.js: initAudio, gatherSound, collectSound, fanfare"
                    }
                }

                sav = component "Save Glue and Test Hook" "save()/load() to localStorage through Core serialize/deserialize (save on world change and every ~3s); version badge; window.MTE_GAME hook exposing state reads/mutations that the browser e2e suite drives." "JavaScript + localStorage" {
                    tags "Presentation"
                    properties {
                        "ref" "game.js: save, load, boot(), MTE_GAME"
                    }
                }
            }

            core = container "Simulation Core" "Pure, DOM-free game engine (core.js). All rules are deterministic (terrain is a pure positional hash of (x, y, seed) — no shared RNG stream — so chunk generation is order-independent), state is a plain serializable object, and there is no date/random/draw code: the module runs identically in the browser and under Node (module.exports) so tests can step it directly." "JavaScript (ES5, browser + Node)" {
                tags "Core Engine"
                properties {
                    "files" "core.js"
                    "invariant" "no DOM, no Date.now, no Math.random in step(); serializable state; dt clamped to 0.25s"
                }

                world = component "World Generation (infinite)" "Endless, chunked world: terrain is a pure function of (x, y, seed) via valueNoise/fbm octaves, streamed in lazily in 16x16 chunks and LRU-cached, so there are no bounds, edges or wrapping. Tile types (T) and resource richness (rich/max, uniformly random with no distance ramp) are generated per chunk; sparse per-tile edits (mods) and per-chunk fog bitmasks (explored) live outside the cache so they persist. FindSpawn picks a random walkable birth tile near (0,0); nothing is sculpted." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: createWorld, getChunk, generateChunk, valueNoise, fbm, tileType, tileRich, findSpawn, snapshot, T"
                    }
                }

                state = component "State and Saves" "createState() builds the canonical state object; serialize/deserialize convert it to a JSON save (format v3: sparse richness deltas + per-chunk fog bitmasks; older v1/v2 saves are intentionally discarded and the world starts fresh). state.events is transient and NEVER serialized." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: createState, serialize, deserialize, bytesToB64/b64ToBytes"
                    }
                }

                step = component "Simulation Step" "step(s, dt) - the heart of the tick: extractor production into buffers, range-limited logistics auto-collect, abundance trickle, world regrowth (REGROW_INTERVAL 0.5s, only tiles near the player), time + stats. Called once per frame by the app and by every test." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: step(), REGROW_INTERVAL, resProdMult"
                    }
                }

                gather = component "Gathering and Collection" "Manual actions: gather() from a tile within GATHER_RANGE (1.65) using axe/pickaxe multipliers; collect() drains extractor buffers within COLLECT_RANGE (1.7). gatherTarget/collectTarget report what is actionable for the UI." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: gather, gatherYield, gatherTarget, collect, collectTarget"
                    }
                }

                build = component "Extractors and Building" "place()/buildTarget()/occupied(); EXTRACTORS catalog (rates, buffer caps, base costs, required deposit tile or any-land blueprint-gated converters); extractor cost scaling; blueprint unlocks gate foundry/brickyard/sapling/observatory." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: place, buildTarget, EXTRACTORS, extractorCost, hasExtractor"
                    }
                }

                logistics = component "Logistics and Auto-Collect" "When unlocked, step() drains whole units from any extractor within AUTO_COLLECT_RANGE (3.0 tiles) of the player and pushes a transient {res, amt, x, y} event so the UI can animate the flow. Walking away stops collection: buffers just fill and cap until you return." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: step() logistics branch, AUTO_COLLECT_RANGE, state.events"
                    }
                }

                tech = component "Tools, Upgrades and Unlocks" "TOOLS level table (axe/pickaxe/boots/overclock), UNLOCKS (logistics, blueprints, abundance engine), buyUpgrade/upgradeInfo, canAfford/pay/costText. overclockMult multiplies ALL extractor production." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: TOOLS, UNLOCKS, buyUpgrade, overclockMult, moveMult"
                    }
                }

                refinery = component "Refineries and Abundance" "Per-resource chains (RES_UPGRADES: Silviculture/Masonry/Metallurgy/Crystallurgy), repeatable Abundance Engine levels + trickle, EXTRACTOR_GROWTH 1.65; resProdMult folds overclock + refinery + abundance + legacy multipliers together." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: RES_UPGRADES, buyResUpgrade, resProdMult, abundanceMult/abundanceTrickle"
                    }
                }

                prestige = component "Prestige and Perks" "Embark resets the world and banks Insight (gated by EMBARK_MIN_TOTAL 20000 lifetime resources); perks legacy/nomad/memory/heirloom/cartographer; legacyMult (x1.25/level) and nomadMult scale production and movement." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: embark, canEmbark, PERKS, legacyMult, nomadMult"
                    }
                }

                goals = component "Goals, Stats and Clock" "GOALS list + goalIndex progression; stats counters (wood/stone/ore/crystal/gathers/collected/playedMs); the day/night clock (pure daylight() over DAY_LENGTH 240s); exploration radius (EXPLORE_RADIUS 6) and movement physics (BASE_SPEED 3.7, move, canStand, onWater, boots speed)." "JavaScript" {
                    tags "Core Engine"
                    properties {
                        "ref" "core.js: GOALS, stats, daylight, move, updateExplored"
                    }
                }
            }
        }

        // ------------------------------------------ dev tooling (system)
        tools = softwareSystem "Development Tooling" "Test harnesses that verify the game locally and in CI. Both suites are plain Node scripts with zero dependencies." {
            tags "Tooling"

            coreTests = container "Core Test Suite" "Node checks (test/core.test.js) driving the Simulation Core directly: 151 checks covering infinite world gen, economy, logistics range, save/load/wipe, day/night, and full bot playthroughs (runBot/runFullBot with real pathfinding + gathering)." "Node.js 18+" {
                tags "Tooling, Test"
                properties {
                    "file" "test/core.test.js"
                }
            }

            e2e = container "Browser E2E Harness" "Spawns a local static server + headless Chrome and drives the REAL game through the DevTools Protocol (touch input, DOM clicks, screenshots): covers flyer visuals, fog reveal in the endless world, persistence across reload, the day/night flashlight, and range-limited logistics." "Node.js + Headless Chrome + CDP" {
                tags "Tooling, Test"
                properties {
                    "file" "test/browser.e2e.js"
                }
            }
        }

        // ------------------------------------------ relationships
        // people <-> systems
        player -> mte.app "Plays in a mobile/desktop browser"
        dev -> tools.coreTests "Runs and extends"
        dev -> tools.e2e "Runs and extends"

        // containers
        mte.app -> mte.core "Drives moves/gathers/builds/upgrades and reads state every frame"
        mte.core -> mte.app "Returns state; emits transient events on auto-collect"
        tools.coreTests -> mte.core "Requires core.js via module.exports and steps it directly"
        tools.e2e -> mte.app "Loads index.html; asserts through window.MTE_GAME"

        // app components -> core (reads/drives)
        mte.app.input -> mte.core.state "Reads gatherTarget/collectTarget each frame"
        mte.app.input -> mte.core.step "Calls step(state, dt) every frame"
        mte.app.input -> mte.core.gather "gather()/collect() for the manual action button"
        mte.app.render -> mte.core.state "Reads the world/player each frame for drawing"
        mte.app.ui -> mte.core.state "Reads economy/goals for display"

        // core components -> state (mutations)
        mte.core.step -> mte.core.logistics "Drives the range-limited auto-collect branch"
        mte.core.step -> mte.core.state "Mutates buffers/stats/time each tick"
        mte.core.logistics -> mte.core.state "Pushes transient {res, amt, x, y} events"
        mte.core.gather -> mte.core.state "Credits inventory + stats"
        mte.core.build -> mte.core.state "Builds extractors on the shared state"
        mte.core.tech -> mte.core.state "Applies upgrades/unlocks"
        mte.core.refinery -> mte.core.state "Applies refinery/abundance levels"
        mte.core.prestige -> mte.core.state "Resets and reshapes the state on embark"
        mte.core.goals -> mte.core.state "Writes goals/stats/exploration"

        // app-internal flows (also feed the dynamic views)
        mte.app.input -> mte.app.fx "Spawns flyers/FX when the player gathers or collects"
        mte.app.fx -> mte.core.state "Drains transient state.events into flyers each frame"
        mte.app.fx -> mte.app.render "Flyers are drawn before the night lighting pass"
        mte.app.fx -> mte.app.sav "Schedules a save when the world changes"
        mte.app.render -> mte.app.ui "Refreshes the HUD whenever the world changes"
        mte.app.sav -> mte.core.state "serialize(state)/deserialize(save) for persistence"

        // ------------------------------------------ deployment
        deploymentEnvironment "Local Development" {

            deploymentNode "Browser" "Mobile Safari or desktop Chrome." {
                deploymentNode "Browser tab" "Runs the single-page game." {
                    containerInstance mte.app
                    containerInstance mte.core
                }
            }

            deploymentNode "Static Host" "Any static file server (python3 -m http.server, GitHub Pages, S3). No server-side logic." {
                infrastructureNode "Static Files" "Serves index.html, style.css, version.js, core.js and game.js over HTTP(S)."
            }

            deploymentNode "Node.js 18+" "Developer machine / CI runner." {
                containerInstance tools.coreTests
                deploymentNode "Headless Chrome" "Launched by the e2e harness via CDP (--headless=new, test profile)." {
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
            mte.app.input -> mte.core.step "Calls step(state, dt) every frame"
            mte.core.step -> mte.core.logistics "Auto-collects units within 3 tiles"
            mte.core.logistics -> mte.core.state "Pushes {res, amt, x, y} events"
            mte.app.input -> mte.app.fx "doGather/doCollect spawn flyers"
            mte.app.fx -> mte.core.state "Drains events into flyers"
            mte.app.fx -> mte.app.render "Draws flyers before the night pass"
            mte.app.render -> mte.app.ui "Refreshes HUD when the world changes"
            autoLayout
        }

        dynamic mte.app "CollectFlow" {
            title "Manual Collect / Gather"
            mte.app.input -> mte.core.gather "gather() within range (collect() for COLLECT)"
            mte.core.gather -> mte.core.state "Credits inventory + stats"
            mte.app.input -> mte.app.fx "spawnGatherFX + spawnFlyers from the source tile"
            mte.app.fx -> mte.app.sav "onWorldChanged() schedules a save"
            mte.app.sav -> mte.core.state "serialize(state) to localStorage"
            autoLayout
        }

        deployment * "Local Development" "Deployment" {
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