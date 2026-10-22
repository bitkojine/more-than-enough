# The room service

Playing together runs through this: a Cloudflare Worker (`src/worker.js`)
with one Durable Object per shared world (`Rooms`) and one per visitor
address for the room-making limit (`Limiter`). A room's rules are plain
JavaScript in `src/room.js`, tested in Node (`test/unit/together.test.js`).
The wire format and every check on it are in `../src/net/protocol.js`,
shared with the game.

## How it works

1. Watch makes a world (a seed) with `POST /rooms` under the admin token.
   The service makes a room with a random 128-bit id and keeps it.
   Everyone starts a shared world from nothing: the room
   can't check progress made anywhere else, so it takes no save or edits.
2. You connect to `GET /rooms/<id>/ws` (a WebSocket) and say who you are
   with your secret key. Your id in that room is a hash of the room and the
   key, so nobody can pose as you without the key, and ids differ from room
   to room.
3. Holding up the sign asks the room for an **invite link**: a second random
   code that lets in a few people (1 to 25, 3 unless the player picks; never
   unlimited) for a while (30 minutes to a week, a week unless they pick).
   Your sign keeps showing your newest one made that way while it has room
   and time left. The room counts how many joined with each link; each
   player lists and stops the links they made, and the moderator any of
   them (admin route). The QR is
   `<game>#join=<room>.<invite>`. It's in the fragment, which browsers never
   send to any server.
4. A friend's phone opens that link, connects and shows the invite once.
   From then on their key is enough, from anywhere.
5. The room relays positions (about 8 a second) and world edits (echoed to
   everyone in one order, so every phone ends with the same world), and
   **works out each player's progress itself** (`shadow.js`): the game sends
   what the player did (`acts`: gather, collect, build, place, buy; see
   `src/core/acts.js`) and the room does the same with the game's own rules
   on its own copy. That copy is what they have. When the progress a game
   sends (`save`) differs, the room keeps its own and sends the game its
   numbers (`econ`, with `why`: what it refused since the last `save`,
   `spot`, `cost`, `pace` or `full`, for the game to tell the player); the
   game keeps what it got, built and bought since. Buildings and props
   go up in the world from the room's copy, not from the game's edits. Time
   away (up to 8 hours) is made up by the room too: with the first `save`
   after coming back, their buildings' output goes into the copy and the game
   hears it (`away`). Someone who left before rooms noted when (v0.100.0)
   is away since their last `save`. Players see each other as online,
   away, connection lost (offline after a minute) or offline.
6. The room keeps the world's **clock**: it starts at the creator's time of
   day, runs whether anyone is in or not, and comes with every welcome, so
   day and night are the same for everyone in the world.
7. The welcome also says which world format (`WORLD_FORMAT`) the world
   plays by (`fmt`; always the current one, see *Every world is kept*). A game on another
   format stays out until both sides match: an older one reloads into the
   newest version, a newer one tries again a minute later, while the room
   service catches up. So during a deploy nobody grows different land from
   the same seed.
8. A connection can die without closing (a phone changing networks). The
   game sends `ping` (plain text) every 5 seconds of play and the room
   answers `pong` without waking up (`setWebSocketAutoResponse`); 15
   seconds of play with no word from the room and the game drops the
   connection and reconnects. Edits carry a number `n` and the room answers
   `{"t":"ack","n"}` once it has dealt with them (applied or refused): after
   a reconnect the game sends again those never answered, except where the
   room already has something on that tile (the room's stands). The welcome
   says `pong` and `ack` when the room does both; games rely on neither
   otherwise. Acts aren't answered: the game keeps the last minute of
   them, and after a reconnect sends again every one after the play time
   of the progress in the welcome (the room's copy), so acts a dying
   connection swallowed still count. The room stores each player's copy
   with the world edits they made (whenever it writes them), so a room
   that restarts (a deploy) never has the world ahead of their progress,
   and the acts it hadn't stored come again the same way.
9. `GET /rooms/<id>` says whether a world still exists (`{"exists": bool}`)
   and, if it does, how many play there now (`online`, a count, never who):
   a game that couldn't get in asks, so it stops offering a world that is
   gone (an admin copy whose time is up), and the Worlds list shows who's playing.

All traffic goes through the room: no phone ever learns another's IP
address.

## Security

Every message is checked on arrival (`protocol.js`), on the server and
again in the game; anything that doesn't fit exactly is dropped.

- **Who can call it:** only the game's own origins (`ALLOWED_ORIGINS` in
  `wrangler.toml`; `localhost` only with `ALLOW_LOCALHOST`, for
  `wrangler dev`).
- **Who can join:** whoever holds a live invite that isn't used up, at most
  100 players a room (`LIMITS.players`). Every player brings in at most
  5 people a day through their links (`LIMITS.invitesPerDay`). The
  moderator removes a player: they are banned from the room for good
  (their key can't come back), the link they joined with and every link
  they made stop, and their buildings go.
- **Anti-cheat:** steps faster than `MAX_SPEED` tiles a second (from a
  budget, so bunched-up steps pass) are refused, and they and edits out of
  reach count as cheats; `CHEATS_TO_BAN` of them ban the player (Watch's
  rule: nobody cheats in a shared world). One player adds at most 400 buildings, 2,000
  props and 60,000 newly changed tiles (`PLAYER_TILES`). Nothing grows back, so a
  tile's richness only goes down: an edit that raises it is refused. Reconnecting starts nothing afresh: the first step after
  it is checked against the time since the last one, and a game that is
  elsewhere is told where it stands (`place`).
- **Worlds are made by Watch:** `POST /rooms` answers only to the admin
  token (403 otherwise, before the body is read); Watch makes worlds by
  hand as players need them, and the deploy's smoke test marks its own.
  In a room, 8 sockets per visitor, 3 of them before
  saying who they are;
  16 KB per message (64 KB for your own progress); 30 messages a second per
  connection and 60 world edits a second per player, with small bursts;
  edits only within 24 tiles of where the player stands, on their own layer;
  a room holds at most 1,000,000 tile edits (stored in `MOD_BUCKETS` pieces), 20,000 props and 4,000
  buildings; 200 sockets a room (two per player), and a socket that doesn't say who it is in 5
  seconds is closed. A connection that keeps breaking the limits is closed
  (strikes are forgiven over time).
- **Ownership:** a building's owner is set by the room, never by the
  player.
- **Progress:** an act counts only if it could have happened: in play-time
  order, no more play time than has passed on the room's clock (2 seconds'
  slack), no further from the last act than `MAX_SPEED` allows, gathering
  no faster than the game lets anyone, and then by the game's own rules
  (reach, tools, costs, free tiles). Refused acts change nothing and are
  counted for the moderator (`shadow` in the player list).
- **Every world is kept:** nothing resets or deletes a players' world
  (Watch, 2026-10-18). There is no nuke any more: a world made under an
  older `WORLD_FORMAT` or `ECON_FORMAT` (`src/core/format.js`, frozen) plays
  on under the current one, logged once as `kept`; a `nuke` message from an
  old game changes nothing, and the welcome's `nuke` is always null. Unit
  tests fail if any of that comes back.
- **No HTML from the network:** the game builds friends' chips from elements
  and text, and shows no text a player wrote (friends get a name from the
  game's own list). The page has a Content-Security-Policy.
- **Steps:** a player's every step goes only to players within 48 tiles on
  their layer; everyone else hears where they are every 2 seconds, so a
  full world doesn't send every step to all 100.
- **Storage:** a players' world is kept forever, whatever its seed; only
  rooms the server marked as the deploy's smoke tests (under the admin
  token when made, or by the moderator) are deleted after 30 days
  unvisited, and admin copies when their time is up.
- **The moderator:** the `/admin/` routes answer only a bearer token equal
  to the `ADMIN_TOKEN` Worker secret (set on deploy from the
  `ROOMS_ADMIN_TOKEN` repository secret; at least 32 characters). Without
  it they answer 404, as if they weren't there; only the page at `/admin`
  answers without it, and it holds nothing but a form for the token. They read; what they
  change is a ban, a freeze or stopping an invite link.
  A copy (below) is a room of its own: making and playing it changes
  nothing in the real one.
- **Turned away:** a banned key gets `{"t": "invite", "why": "banned"}`
  and the socket closes (1008, `invite`); a frozen one gets
  `{"t": "frozen"}` and closes (1008, `frozen`).
- **Frozen characters:** a character whose player clearly hacked (an
  edited save or game: the room doesn't take its numbers, but logs the try
  as `drift`) is frozen by the moderator instead of banned. It stays in the world, asleep, with what it
  built, but its key can't play it again (`frozen`, close code 4005): the
  game shows a joke "FBI" notice and goes back to the player's own world.
  The links its player made stop.
- **Tombstones:** a banned or frozen character leaves a tombstone where it
  last stood (`graves` in the welcome and in a `graves` message: `[id,
  colour, x, y, z, 'ban' | 'ice']`, at most 300), until the world is made
  again; thawing takes it away.

## Audit log

Every room logs what its players do (`src/audit.js`), so cheats are caught
quickly and we learn how people play. Each event is one JSON object, one per
line in an export: `{"ts": <ms>, "p": <player id>, "e": <event>, ...}`. The
player id is the room's hash of their key (never the key), and nothing else
about a person is kept: no address, no name (players have none), nothing
they typed (there's nowhere to type). Nothing a player's game writes is
logged as text either: item and building names only from the game's own
list (`src/net/names.js`), invite codes only as a 6-character prefix of a
real code. The log is read by an AI reviewer, so text in it could be made
to read like an instruction. Logs are deleted after 14 days
(`LOG_DAYS`), except the security trail (`cheat`, `ban`, `freeze`, `thaw`, `deny`, `cut`, `drift`),
kept 90 days (`SECURITY_DAYS`); all of it goes with the room. Players are told once, when they first
enter a shared world, and in Settings.

| `e` | when | fields |
| --- | --- | --- |
| `create` | the room is made | `seed`, `fmt`, how many `mods`, `props`, `ext` it came with |
| `join` | a player comes in | `new` (first time), `c` (their colour), `via` (first 6 characters of the invite), `at` [x, y, z], `online` (players in now) |
| `deny` | someone is turned away | `why`: `banned`, `frozen`, `invite` (none, or not working), `full`, `limit` (the link's maker brought in `LIMITS.invitesPerDay` people today) |
| `at` | every 15 s while a player moves, and when they leave | `x`, `y`, `z`, `act` (what they're doing), `secs` since the last one, `walked` tiles, `layers` changed, `dug`, `props`, `built`, `refused` edits, `drops` (messages the service threw away) |
| `build` | a building goes up | `k` (kind, or `?` for one the game doesn't have), `at` |
| `prog` | their progress changed (at most once a minute, at once for a new goal) | `goal`, `ever` (all-time total), `pres`, `ins`, `ab`, `deep`, `tools`, `perks`, `inv`, `built`, `played` (seconds), `nU` (unlocks), `gained` (new unlocks) |
| `st` | away or back | `st` |
| `leave` | a connection ends | `clean` (left on purpose), `secs` in this visit, `at` |
| `invite`, `revoke` | a link is made or stopped | `code` (first 6 characters), `uses`, `life` (minutes) |
| `cheat` | a step too far or an edit out of reach | `why` (`speed`, `reach`), `n` (cheats counted now), `from`, `to` or `at` |
| `away` | a player's first progress after coming back, when their buildings made something while they were away (stage 3: up to 8 hours, worked out by the room) | `secs` away |
| `drift` | the progress a player's game sent differs from the room's own copy, worked out from what they did; the room kept its own and set the game straight (at most once a minute; security trail) | `res` ([resource, game's, room's]), `levels` ([what, game's, room's]) |
| `cut` | a connection was closed for breaking the limits | `why` |
| `ban` | a player is taken out | `by` (`auto`, `mod`), `why` |
| `freeze`, `thaw` | the moderator freezes a hacked character, or undoes it | `why` |
| `owner` | only in logs from before v0.131.1: the world passed to a new owner (`p`; null if nobody is left) | `was` |
| `kept` | a world made under an older format (or with a nuke pending from before nukes ended) is kept and plays on under the current one | `fmt`, `ef` (what it was) |
| `nuke`, `nukeCall`, `renew` | only in logs from before 2026-10-18: the old nuke | `fmt`, `gen`, `seed` |

Events wait in memory and are written as one chunk every 30 seconds at
most (or every 500, or when the last player leaves), into a SQL table of their own, so the free plan's row writes
go a long way and loading a room never reads its log.

The moderator's routes (`Authorization: Bearer <token>`):

- `GET /admin` (no token): the moderator's page (`src/admin.js`), every
  player of every world in one table that sorts by any column, with a
  copy, a backup download, freeze/thaw and the log for each, and
  *Restore a backup…* at the top. It asks for the token and keeps
  it in the browser, sending it only to these routes; it holds no data
  itself, writes what it's sent as text, and runs only its own script.
- `GET /admin/players[?tests=1]`: every world (`/admin/rooms`'s brief plus
  `name: {en, lt}`) with its players (as below, plus `name: {en, lt}`),
  named as the game names them (`src/net/naming.js`); the smoke test's
  worlds only with `tests=1`. A room that can't answer comes with `error`.
- `GET /admin/rooms`: every world in brief (`id`, `seed`, `players`,
  `online`, `bans`, `frozen`, `created`, `last`, `smk` — the last says
  whether it's the deploy's smoke test).
- `GET /admin/rooms/<id>/players`: each player now, with their cheat count,
  whether they're `frozen`, and progress.
- `GET /admin/rooms/<id>/log?since=<ms>`: the log as JSON lines: first
  `{"e": "room", ...}`, then the events from `since`, and last
  `{"e": "more", "since": ...}` if there is more to fetch from there.
- `POST /admin/rooms/<id>/ban` with `{"id": "<player id>", "why": "..."}`:
  takes a player out for good; everyone who came in through their links
  goes too.
- `POST /admin/rooms/<id>/freeze` with `{"id": "<player id>", "why": "..."}`:
  freezes a character whose progress was hacked (see Security); its game
  shows the "FBI" notice. `POST /admin/rooms/<id>/thaw` with `{"id"}` undoes it.
- `POST /admin/rooms/<id>/revoke` with `{"code": "<invite code>"}`: stops
  an invite link (the code after the dot in the link); anyone may stop
  their own in the game, the moderator any of them here.
- `POST /admin/rooms/<id>/copy` with `{"id": "<player id>"}`: a copy of the
  world to play as that player, to see what they'd see coming back now
  (`src/copy.js`). Answers `{room, key, until, link}`; the link
  (`<game>/#copy=<room>.<key>&of=<id>`, `of` for the world's name) opens the copy in the game, which then keeps
  nothing in the browser (`src/game/copy.js`). The copy has every entry of
  the room (each player's progress as the room has it now), but no invite
  links; only that key gets in, as the player (the player's own key is
  never needed or known), it logs nothing, isn't listed, and is deleted
  after 2 hours (`COPY_MS`), closing its sockets with 4006. Keep the key to
  yourself: it plays the copy, nothing else. What only the player's phone
  knew can be added to the link: `&was=0.89.0` (the version their tab last
  ran: the version badge rolls over from it and What's new marks what came since) and `&shown=mycelium:1.4e14,stone:2e13`
  (the numbers their phone last showed).
- `GET /admin/rooms/<id>/graves`: its tombstones, as a player's welcome
  carries them (`[id, colour, x, y, z, 'ban' | 'ice']`).
- `GET /admin/rooms/<id>/backup`: the whole world as one JSON file to keep
  on disk (`src/backup.js`, a download named `mte-world-<id>-<time>.json`):
  every entry the room keeps, each player's progress as the room has it now,
  but no invite links. `node scripts/backup-worlds.mjs [folder]` saves every
  world's (needs `ADMIN_TOKEN`, or the project's proxy). Only the moderator
  backs up a shared world (Watch's choice): it holds everyone's progress.
- `POST /admin/rooms/<id>/smoke` with `{"smoke": true}` (or `false`): marks
  (or unmarks) the room as the deploy's smoke test, the only kind of
  players' room that ages out unvisited. The mark is logged; nothing else
  sets it (`scripts/mark-smoke.mjs` marked the rooms made before v0.130.1,
  which had the smoke seed but no flag). Answers `{ok}`.
- `POST /admin/rooms/<id>/restore` with a backup file as the body: puts a
  world that's gone back from it, at its own address, so its players come
  back with their own phones (a player's id comes from the address and
  their key). A world that's still there is never written over: 409
  `exists` (Watch's choice). Answers `{room}`.

The deploy's smoke test makes a room every time, marked as one by the
server under the admin token; without the token it makes an ordinary,
unmarked room, so the CI address's quota matters only there.

## Running it

```sh
cd server
npm ci
npm run dev   # wrangler dev on :8787, localhost allowed
```

Then open the game at `http://localhost:8000/?rooms=http://localhost:8787`
(the `rooms` override only works on localhost).

Deploys happen from `.github/workflows/rooms.yml` on every push to `main`
that touches `server/`, `src/net/` or the rules it replays (`src/core/`,
`src/i18n/`), with the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets. The deploy stamps the commit
(`COMMIT`), which the service names at `/` so the hourly live check can tell
a service that stopped deploying. After the first deploy, put the
service's address in `src/net/config.js` and in `connect-src` of the
Content-Security-Policy in `index.html`.

Position presentation may include optional `gear` bits (1 = basket, 2 = pick)
so peers do not draw tools that an empty-handed character has not crafted.
Missing bits retain legacy presentation; older clients can ignore the field.
This is visual state, never authority for gathering or purchases. Actual tool
levels are validated through canonical replay and saves. New saves mark
`emptyStart: true`; absent markers retain legacy positive tool defaults.
