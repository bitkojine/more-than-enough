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
3. Holding up the sign asks the room for an **invite**: a second random code,
   good for 10 minutes or until the sign goes down. The QR is
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
- **Who can join:** whoever holds a live invite, at most 4 players a room.
  The owner can remove a player, who then needs a new invite.
- **Abuse limits:** 6 new rooms an hour per IP address (per /64 for IPv6);
  16 KB per message (64 KB for your own progress); 30 messages a second per
  connection and 60 world edits a second per player, with small bursts;
  edits only within 24 tiles of where the player stands, on their own layer;
  a room holds at most 100,000 tile edits, 20,000 props and 4,000
  buildings; 8 sockets a room, and a socket that doesn't say who it is in 10
  seconds is closed. A connection that keeps breaking the limits is closed.
- **Ownership:** a building's owner is set by the room, never by the
  player.
- **No HTML from the network:** the game builds friends' chips from elements
  and text, and shows no text a player wrote (friends are numbered by
  colour). The page has a Content-Security-Policy.
- **Storage:** a room nobody visits for 30 days is deleted.

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
