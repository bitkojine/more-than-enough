# The room service

Playing together runs through this: a Cloudflare Worker (`src/worker.js`)
with one Durable Object per shared world (`Rooms`) and one per visitor
address for the room-making limit (`Limiter`). A room's rules are plain
JavaScript in `src/room.js`, tested in Node (`test/unit/together.test.js`).
The wire format and every check on it are in `../src/net/protocol.js`,
shared with the game.

## How it works

1. **Invite** in the game (the first time) posts your world (the seed and every edit,
   your buildings and your own progress) to `POST /rooms`. The service makes
   a room with a random 128-bit id and keeps it.
2. You connect to `GET /rooms/<id>/ws` (a WebSocket) and say who you are
   with your secret key. Your id in that room is a hash of the room and the
   key, so nobody can pose as you without the key, and ids differ from room
   to room.
3. Holding up the sign asks the room for an **invite link**: a second random
   code that lets in a few people (1 to 25, 3 unless the player picks; never
   unlimited) for a while (30 minutes to a day, a day unless they pick).
   Your sign keeps showing your newest one made that way while it has room
   and time left. The room counts how many joined with each link; the owner
   can list and stop every link, anyone else their own. The QR is
   `<game>#join=<room>.<invite>`. It's in the fragment, which browsers never
   send to any server.
4. A friend's phone opens that link, connects and shows the invite once.
   From then on their key is enough, from anywhere.
5. The room relays positions (about 8 a second), world edits (echoed to
   everyone in one order, so every phone ends with the same world) and each
   player's progress (kept by the room). Players see each other as online,
   away, connection lost (offline after a minute) or offline.
6. The room keeps the world's **clock**: it starts at the creator's time of
   day, runs whether anyone is in or not, and comes with every welcome, so
   day and night are the same for everyone in the world.

All traffic goes through the room: no phone ever learns another's IP
address.

## Security

Every message is checked on arrival (`protocol.js`), on the server and
again in the game; anything that doesn't fit exactly is dropped.

- **Who can call it:** only the game's own origins (`ALLOWED_ORIGINS` in
  `wrangler.toml`; `localhost` only with `ALLOW_LOCALHOST`, for
  `wrangler dev`).
- **Who can join:** whoever holds a live invite that isn't used up, at most
  100 players a room (`LIMITS.players`). The owner can remove a player: they
  are banned from the room for good (their key can't come back), the link
  they joined with stops, and their buildings go.
- **Anti-cheat:** steps faster than `MAX_SPEED` tiles a second (from a
  budget, so bunched-up steps pass) are refused, and they and edits out of
  reach count as cheats; `CHEATS_TO_BAN` of them ban the player, as if the
  owner removed them (never the owner). One player (not the owner) puts up
  at most 400 buildings and 2,000 props.
- **Abuse limits:** 6 new rooms an hour per IP address (per /48 for IPv6)
  and 300 an hour in all; in a room, 8 sockets per visitor, 3 of them before
  saying who they are;
  16 KB per message (64 KB for your own progress); 30 messages a second per
  connection and 60 world edits a second per player, with small bursts;
  edits only within 24 tiles of where the player stands, on their own layer;
  a room holds at most 100,000 tile edits, 20,000 props and 4,000
  buildings; 200 sockets a room (two per player), and a socket that doesn't say who it is in 5
  seconds is closed. A connection that keeps breaking the limits is closed
  (strikes are forgiven over time).
- **Ownership:** a building's owner is set by the room, never by the
  player.
- **The nuke:** only the room service calls it, once, when a world was made
  before its own `WORLD_FORMAT` (`src/core/format.js`); nothing a player sends can. A player can only press it for themselves. The world is made
  again once everyone online has pressed it (away, lost and offline players
  count as pressed) or a minute after it was called, with a seed the room
  picks; every socket is then closed, so nothing from the old world gets in.
- **No HTML from the network:** the game builds friends' chips from elements
  and text, and shows no text a player wrote (friends get a name from the
  game's own list). The page has a Content-Security-Policy.
- **Steps:** a player's every step goes only to players within 48 tiles on
  their layer; everyone else hears where they are every 2 seconds, so a
  full world doesn't send every step to all 100.
- **Storage:** a room nobody visits for 30 days is deleted.
- **The moderator:** the `/admin/` routes answer only a bearer token equal
  to the `ADMIN_TOKEN` Worker secret (set on deploy from the
  `ROOMS_ADMIN_TOKEN` repository secret; at least 32 characters). Without
  it they answer 404, as if they weren't there. They read; the one thing
  they change is a ban, the same one the owner's *Remove* does.

## Audit log

Every room logs what its players do (`src/audit.js`), so cheats are caught
quickly and we learn how people play. Each event is one JSON object, one per
line in an export: `{"ts": <ms>, "p": <player id>, "e": <event>, ...}`. The
player id is the room's hash of their key (never the key), and nothing else
about a person is kept: no address, no name (players have none), nothing
they typed (there's nowhere to type). Logs are deleted after 14 days
(`LOG_DAYS`), and with the room. Players are told once, when they first
enter a shared world, and in Settings.

| `e` | when | fields |
| --- | --- | --- |
| `create` | the room is made | `seed`, `fmt`, how many `mods`, `props`, `ext` it came with |
| `join` | a player comes in | `new` (first time), `c` (their colour), `via` (first 6 characters of the invite), `at` [x, y, z], `online` (players in now) |
| `deny` | someone is turned away | `why`: `banned`, `invite` (none, or not working), `full` |
| `at` | every 15 s while a player moves, and when they leave | `x`, `y`, `z`, `act` (what they're doing), `secs` since the last one, `walked` tiles, `layers` changed, `dug`, `props`, `built`, `refused` edits, `drops` (messages the service threw away) |
| `build` | a building goes up | `k` (kind), `at` |
| `prog` | their progress changed (at most once a minute, at once for a new goal) | `goal`, `ever` (all-time total), `pres`, `ins`, `ab`, `deep`, `tools`, `perks`, `inv`, `built`, `played` (seconds), `nU` (unlocks), `gained` (new unlocks) |
| `st` | away or back | `st` |
| `leave` | a connection ends | `clean` (left on purpose), `secs` in this visit, `at` |
| `invite`, `revoke` | a link is made or stopped | `code` (first 6 characters), `uses`, `life` (minutes) |
| `cheat` | a step too far or an edit out of reach | `why` (`speed`, `reach`), `n` (cheats counted now), `from`, `to` or `at` |
| `cut` | a connection was closed for breaking the limits | `why` |
| `ban` | a player is taken out | `by` (`owner`, `auto`, `mod`), `why` |
| `nuke`, `nukeCall`, `renew` | the nuke is pressed, called, and the world made again | `fmt`, `gen`, `seed` |

Events wait in memory and are written as one chunk every 30 seconds at
most (or every 500, or when the last player leaves), into a SQL table of their own, so the free plan's row writes
go a long way and loading a room never reads its log.

The moderator's routes (`Authorization: Bearer <token>`):

- `GET /admin/rooms`: every world in brief (`id`, `seed`, `players`,
  `online`, `bans`, `created`, `last`).
- `GET /admin/rooms/<id>/players`: each player now, with their cheat count
  and progress.
- `GET /admin/rooms/<id>/log?since=<ms>`: the log as JSON lines: first
  `{"e": "room", ...}`, then the events from `since`, and last
  `{"e": "more", "since": ...}` if there is more to fetch from there.
- `POST /admin/rooms/<id>/ban` with `{"id": "<player id>", "why": "..."}`:
  takes a player out for good, as the owner would (never the owner).

The deploy's smoke test makes a room with seed 12345 every time; skip those.

## Running it

```sh
cd server
npm ci
npm run dev   # wrangler dev on :8787, localhost allowed
```

Then open the game at `http://localhost:8000/?rooms=http://localhost:8787`
(the `rooms` override only works on localhost).

Deploys happen from `.github/workflows/rooms.yml` on every push to `main`
that touches `server/` or `src/net/`, with the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets. After the first deploy, put the
service's address in `src/net/config.js` and in `connect-src` of the
Content-Security-Policy in `index.html`.
