/* Playing together: one world shared with friends through a room on the room
 * service (server/). You hold up a sign with a QR code; a friend scans it
 * with their phone's camera and lands next to you in your world.
 *
 * The room is the source of truth for the world and keeps each player's own
 * progress. This module talks to it, keeps the friends you see (and how
 * they're doing: online, away, connection lost, offline), and shows the QR.
 * Everything that arrives is checked (src/net/protocol.js, then the core's own
 * tables) before it touches the game; nothing from the network is ever put
 * into the page as HTML. */

import * as Core from '../core/index.js';
import {
  LIMITS, parse, cleanPos, cleanEdits, cleanWorld, cleanSave, cleanStatus, cleanColor, cleanTime,
  ROOM_ID_RE, KEY_RE, ID_RE, randomHex, INVITE_USES, INVITE_LIVES, INVITE_DEFAULT, cleanInviteAsk, PING
} from '../net/protocol.js';
import { roomService } from '../net/config.js';
import { WORLD_FORMAT } from '../core/format.js';
import { qrcode } from '../vendor/qrcode.js';
import { loadGame, randomSeed } from './storage.js';
import { createActor } from './render/motion.js';
import { t, DEVICE, LANG } from '../i18n/i18n.js';

const KEY_STORE = 'mte.key';          // your secret: who you are to every room
const ROOMS_STORE = 'mte.rooms';      // shared worlds you've been in, newest first
const PLAYING_STORE = 'mte.playing';  // the shared world you're in, if any
const SAVE_PREFIX = 'mte.room.';      // your progress in a shared world (a copy)
const FOG_PREFIX = 'mte.fog.';        // the map you've explored there
const PRIVACY_STORE = 'mte.privacy';   // the version of the privacy policy the player agreed to
// The privacy policy (privacy/index.html). Playing together means agreeing
// to it; a new version (after a change that matters) asks everyone again.
export const POLICY_VERSION = '1';
export const policyUrl = () => 'privacy/#' + LANG;
const GEN_PREFIX = 'mte.gen.';        // which making of that world those are from (see the nuke)
const INVITE_USES_STORE = 'mte.inviteUses'; // how many people your new invite links let in
const INVITE_LIFE_STORE = 'mte.inviteLife'; // and for how many minutes

const WELCOME_BYTES = 8_000_000;      // the most a room's welcome may be
const POS_EVERY = 0.125;              // seconds between position updates
const MAX_CHIPS = 5;                  // friends shown by name under the top bar; the rest are "+N"
const HEARTBEAT = 2;                  // seconds: say where you are even standing still
const EDITS_EVERY = 0.25;
const SAVE_EVERY = 10;
const FOG_EVERY = 15;
const QUIET_IS_LOST = 6;              // seconds without a word: shown as lost
const MAX_PENDING_EDITS = 20000;      // kept while the connection is down
const RECONNECT_MAX = 15;             // seconds between tries, at most
const PING_EVERY = 5;                 // seconds of play between asking the room if it's there
const SILENT_IS_DEAD = 15;            // seconds of play without a word from the room: the connection is gone
const ACTS_PER_TICK = 4;              // 'acts' messages at most per frame (the room allows 30 messages a second)
const SENT_KEPT = 6;                  // progress sent, remembered for the room's answer to it
const MAX_UNACKED = 400;              // batches of edits sent and not yet answered, kept to send again
const INVITES_WAIT = 8000;           // ms to wait for the invite links before saying they didn't come
const NUKE_TOASTS = 8;                // worlds this small hear about every nuke vote
const NUKE_NAMES = 6;                 // names listed on the nuke screen
const FORMAT_RETRY = 60_000;          // ms before trying a world again whose room service hasn't updated yet
const AWAY_EVERY = 2100;              // ms between away/back changes (the room takes one per STATUS_MS)
// Why a link turned you away (the room says, see server/src/room.js whyNot).
const INVITE_WHY = Object.freeze({
  expired: () => t('together.toast.inviteExpired'),
  usedUp: () => t('together.toast.inviteUsedUp'),
  stopped: () => t('together.toast.inviteStopped'),
  limit: () => t('together.toast.inviteLimit', { n: LIMITS.invitesPerDay }),
  banned: () => t('together.toast.removed')   // taken out of that world for good
});
const SIGN_SPEED = 3;                 // the sign goes up in a third of a second

const JOIN_RE = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

// Friends' colours, by the colour number the room gives them.
const FRIEND_COLORS = ['#7fd07a', '#ffb347', '#6fb7ff', '#ff7aa8', '#c9a6ff', '#ffe066', '#5fe0d0', '#ff8a65'];
// A player's colour, from their place in the world (it comes round again
// after eight: the name tells players apart).
export const friendColor = (c) => FRIEND_COLORS[c % FRIEND_COLORS.length];

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* full or blocked: the room still has it */ }
}

function myKey() {
  let key = read(KEY_STORE);
  if (!key || !KEY_RE.test(key)) {
    key = randomHex(32);
    write(KEY_STORE, key);
  }
  return key;
}

function knownRooms() {
  try {
    const list = JSON.parse(read(ROOMS_STORE) || '[]');
    return Array.isArray(list) ? list.filter((r) => typeof r === 'string' && ROOM_ID_RE.test(r)) : [];
  } catch { return []; }
}

function remember(room) {
  write(ROOMS_STORE, JSON.stringify([room, ...knownRooms().filter((r) => r !== room)].slice(0, 8)));
}

// A world you can never go back to: Back to the shared world tries the next.
function forget(room) {
  write(ROOMS_STORE, JSON.stringify(knownRooms().filter((r) => r !== room)));
}

// A world that turned you away for now (it froze your character): Back to
// the shared world tries your other worlds before it again.
function skip(room) {
  const list = knownRooms();
  if (list.includes(room)) write(ROOMS_STORE, JSON.stringify([...list.filter((r) => r !== room), room]));
}

// The time stamp in a progress string, to tell which copy is newer.
function playedTime(save) {
  try {
    const ms = JSON.parse(save).stats?.playedMs;
    return typeof ms === 'number' ? ms : -1;
  } catch { return -1; }
}

// A canvas of a QR code for `text`: one pixel per module times SCALE, with
// the quiet margin scanners need, black on white.
const QR_SCALE = 8, QR_QUIET = 4;
function qrCanvas(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (n + QR_QUIET * 2) * QR_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + QR_QUIET) * QR_SCALE, (r + QR_QUIET) * QR_SCALE, QR_SCALE, QR_SCALE);
  }
  return canvas;
}

// Players' names (src/i18n: together.name.*), picked by nameOf().
const NAMES = ['moss', 'fern', 'acorn', 'clover', 'hazel', 'birch', 'willow', 'juniper', 'sparrow', 'otter', 'badger', 'hedgehog', 'fox', 'owl', 'hare', 'lynx', 'beaver', 'squirrel', 'heron', 'stork', 'bee', 'firefly', 'thyme', 'mint'];

/* ------------------------------------------------- what the room sends */

// The invite links the room lists, or null if the list doesn't fit. The
// game and the room service deploy separately, so for a while one can be a
// version ahead of the other: fields the game doesn't know yet are ignored,
// and a list from before `max` gets the default.
function cleanInvites(list) {
  if (!Array.isArray(list) || list.length > 100) return null;
  const out = [];
  for (const e of list) {
    if (!Array.isArray(e) || e.length < 6) return null;
    const [code, by, made, until, uses, off, max = INVITE_DEFAULT.uses] = e;
    if (typeof code !== 'string' || !ROOM_ID_RE.test(code) || typeof by !== 'string' || !ID_RE.test(by) ||
        !Number.isSafeInteger(made) || !Number.isSafeInteger(until) || !Number.isSafeInteger(uses) || uses < 0 || typeof off !== 'boolean' ||
        !Number.isSafeInteger(max) || max < 1) return null;
    out.push({ code, by, made, until, uses, off, max });
  }
  return out;
}

function cleanPlayers(players) {
  if (!players || typeof players !== 'object' || Array.isArray(players)) return null;
  const out = new Map();
  for (const [id, p] of Object.entries(players)) {
    if (out.size >= LIMITS.players || !ID_RE.test(id) || !p) return null;
    const c = cleanColor(p.c), st = cleanStatus(p.st);
    if (c === null || st === null) return null;
    out.set(id, { c, st, p: p.p ? cleanPos(p.p) : null });
  }
  return out;
}

// The nuke as the room sends it ({votes, until}), or null if it doesn't fit.
function cleanNuke(n) {
  if (!n || typeof n !== 'object' || !Array.isArray(n.votes) || n.votes.length > LIMITS.players || !Number.isSafeInteger(n.until)) return null;
  return n.votes.every((id) => typeof id === 'string' && ID_RE.test(id)) ? { votes: new Set(n.votes), until: n.until } : null;
}

// Tombstones where banned and frozen characters last stood ([id, colour,
// x, y, z, kind]), or an empty list if they don't fit: they only mark
// places, so a bad list mustn't keep anyone out of the world.
const GRAVE_KINDS = ['ban', 'ice'];
function cleanGraves(list) {
  if (!Array.isArray(list) || list.length > 300) return [];
  const out = [];
  for (const g of list) {
    if (!Array.isArray(g) || g.length < 6) return [];
    const [id, c, x, y, z, k] = g;
    const p = cleanPos({ x, y, z });
    if (typeof id !== 'string' || !ID_RE.test(id) || cleanColor(c) === null || !p || !GRAVE_KINDS.includes(k)) return [];
    out.push({ id, c, x: p.x, y: p.y, z: p.z, k });
  }
  return out;
}

function cleanWelcome(d) {
  if (!ID_RE.test(d.you) || !ID_RE.test(d.owner) || cleanColor(d.c) === null) return null;
  const world = cleanWorld({ seed: d.seed, mods: d.mods, props: d.props, ext: d.ext });
  const players = cleanPlayers(d.players);
  const nuke = d.nuke ? cleanNuke(d.nuke) : null;
  const gen = d.gen ?? 0;
  const fmt = d.fmt ?? null; // rooms from before v0.82.2 don't say
  if ((d.nuke && !nuke) || !Number.isSafeInteger(gen) || gen < 0 || (fmt !== null && !Number.isSafeInteger(fmt))) return null;
  const save = d.save === null || d.save === undefined ? null : cleanSave(d.save);
  if (!world || !players || (d.save && !save)) return null;
  return {
    you: d.you, owner: d.owner, c: d.c, seed: world.seed, mods: world.mods, props: world.props,
    ext: world.ext, players, save, p: d.p ? cleanPos(d.p) : null,
    time: d.time === undefined ? null : cleanTime(d.time), gen, nuke, graves: cleanGraves(d.graves ?? []), fmt,
    pong: d.pong === true, ack: d.ack === true, // rooms from before v0.85.0 do neither
    acts: d.acts === true,                      // nor this, before v0.87.0
    econ: d.econ === true                       // nor keep your progress, before v0.89.0
  };
}

/* ------------------------------------------------------------------ */

export function createTogether({ game, hud, ask, el, nukeScreen, fbi, checkUpdate = () => {}, closeSheet = () => {} }) {
  const service = roomService();
  let ws = null;
  let room = null;          // the shared world you're in (or joining)
  let back = null;          // the shared world you're still in while a link takes you to another
  let code = null;          // the invite you're joining with, used once
  let me = null, owner = null, myColor = 0;
  let welcomed = false;     // the room has sent this connection its world
  let clock = null;         // the world's clock: {t: its time, at: our time then}
  let retry = 0, retryTimer = null;
  const friends = new Map();  // id -> {c, st, p, shown, heard, since, actor}
  const timers = { pos: 0, beat: 0, edits: 0, save: 0, fog: 0 };
  let lastPos = '', lastSave = '';
  let invite = null;        // {code, until} while the QR is up
  let turnedAway = null;    // why the room said your invite link no longer works
  let signT = 0;            // 0..1: how far up your sign is
  let signFace = null;      // the QR on it (a canvas), kept while it comes down
  let nukeOn = null;        // the nuke, while it's up: {votes, until}
  let graves = [];          // tombstones of banned and frozen characters (see cleanGraves)
  // Is the room still there? Seconds of play since it last said anything,
  // and until the next ping; whether it answers pings at all.
  let silence = 0, pingT = 0, pongs = false;
  // Edits sent and not yet answered ({n, e}), when the room answers them:
  // the ones a dead connection swallowed are sent again (see resync).
  let acks = false, editSeq = 0, unacked = [];
  let sent = [];            // {n, ms, inv} of the last progress sent, for the room's corrections ('econ')
  let saveSeq = 0;          // numbers the progress sent

  /* ---------------------------------------------------- the connection */

  function send(msg) {
    if (ws && ws.readyState === 1 && welcomed) ws.send(JSON.stringify(msg));
  }

  // One connection at a time: a newer one replaces any still open, so a
  // forgotten socket can't stay in a world as you, or take this one's place
  // there ("open on another screen").
  function connect() {
    clearTimeout(retryTimer);
    hangUp();
    if (!room || !service) return;
    const socket = new WebSocket(service.replace(/^http/, 'ws') + '/rooms/' + room + '/ws');
    ws = socket;
    welcomed = false;
    turnedAway = null;
    silence = 0;
    socket.onopen = () => socket.send(JSON.stringify({ t: 'hello', key: myKey(), ...(code ? { code } : {}) }));
    socket.onmessage = (e) => { if (ws === socket) { silence = 0; receive(e.data); } };
    socket.onclose = (e) => { if (ws === socket) closed(e.code, e.reason); };
  }

  function closed(codeNum, reason) {
    ws = null;
    welcomed = false;
    for (const f of friends.values()) f.heard = -Infinity;
    // The newer screen plays this world now, and comes back to it next time.
    if (codeNum === 4001) return stop(t('together.toast.elsewhere'), false);
    if (codeNum === 4003) { forget(room); return stop(t('together.toast.removed')); }
    // The moderator froze this character (its progress was hacked): the
    // "FBI" notice, every time, and back to your own world.
    if (codeNum === 4005 || reason === 'frozen') { skip(room); refused(); return fbi.show(); }
    // Everyone pressed the nuke: straight back in, to the world made anew.
    if (codeNum === 4004) { retry = 0; return connect(); }
    if (reason === 'invite' && turnedAway === 'banned') forget(room);
    if (reason === 'invite') return refused(turnedAway ? INVITE_WHY[turnedAway]() : t('together.toast.inviteOld'));
    if (reason === 'full') return refused(t('together.toast.full'));
    if (!room) return;
    // Never got in (the service is down or unreachable): say so, don't loop,
    // and try again next time the game opens.
    if (game.state.shared !== room) { gone(room); return refused(t('together.toast.unreachable'), false); }
    // Lost the connection: keep playing, and come back as soon as it can.
    if (retry === 0) hud.toast(t('together.toast.reconnecting'));
    const wait = Math.min(RECONNECT_MAX, 2 ** retry);
    retry++;
    retryTimer = setTimeout(connect, wait * 1000);
  }

  // The room has said nothing for too long (not even to a ping): the
  // connection died without closing. Dropped, as if it had closed, so the
  // game reconnects instead of playing on into nothing.
  function dead() {
    const s = ws;
    ws = null;
    try { s.close(4000, 'silent'); } catch { /* gone */ }
    closed(1006, 'silent');
  }

  // A world didn't let you in: back to the shared world you came from, if
  // a link was taking you elsewhere, else to your own.
  function refused(message, forget = true) {
    if (!back) return stop(message, forget);
    hangUp();
    room = back; back = null; code = null; retry = 0;
    if (message) hud.toast(message);
    connect();
  }

  // The world and this game are on different world formats. A newer world
  // needs the newest game, which reloads in as soon as the site has it; an
  // older one waits for the room service to update, and the game tries again.
  let formatTimer = 0;
  function mismatched(gameIsOld) {
    const was = room;
    refused(t(gameIsOld ? 'together.toast.oldGame' : 'together.toast.worldUpdating'), false);
    if (gameIsOld) checkUpdate();
    clearTimeout(formatTimer);
    // Only if nothing else started meanwhile (a link, going online, Back to the shared world).
    formatTimer = setTimeout(() => { if (!game.state.shared && !room && read(PLAYING_STORE) === was) resume(); }, FORMAT_RETRY);
  }

  // Closes the connection, saying goodbye.
  function hangUp() {
    clearTimeout(retryTimer);
    if (ws) { const s = ws; ws = null; try { s.close(1000, 'bye'); } catch { /* closed */ } }
    welcomed = false;
  }

  // Leaves the shared world for your own (saving your progress there first).
  // `forget`: the game no longer opens into it (not when another screen
  // took it over, or it couldn't be reached).
  function stop(message, forget = true) {
    if (game.state.shared) save(game.state, true);
    const wasIn = !!game.state.shared;
    if (forget && read(PLAYING_STORE) === (game.state.shared || room)) write(PLAYING_STORE, '');
    room = null; back = null; code = null; me = null; owner = null; clock = null; nukeOn = null;
    graves = [];
    pendingInvite = false; // for the world you were going into, not the next one
    unacked = []; sent = [];
    hangUp();
    friends.clear();
    roster = null;
    closeQr();
    renderFriends();
    if (wasIn) game.replace(loadGame().state);
    if (message) hud.toast(message);
    game.changedMode();
  }

  function receive(raw) {
    const d = parse(raw, WELCOME_BYTES);
    if (!d) return;
    if (d.t === 'welcome') return welcome(d);
    // Turned away at the door: why the link no longer works, said before the close.
    if (!welcomed && d.t === 'invite' && Object.hasOwn(INVITE_WHY, d.why)) turnedAway = d.why;
    if (!welcomed) return;
    // The room has dealt with every batch of edits up to this one.
    if (d.t === 'ack') {
      if (Number.isSafeInteger(d.n)) unacked = unacked.filter((u) => u.n > d.n);
      return;
    }
    if (d.t === 'pos') {
      const f = ID_RE.test(d.id) && friends.get(d.id), p = cleanPos(d.p);
      if (!f || !p) return;
      if (f.st !== 'online') { f.st = 'online'; f.since = 0; }
      f.p = p;
      f.actor.heard(p.a, p.n);
      f.heard = performance.now() / 1000;
      return;
    }
    // The room has you somewhere else than this game does: go there.
    if (d.t === 'place') {
      const p = cleanPos(d.p);
      if (p) game.moveTo(p);
      return;
    }
    if (d.t === 'econ') {
      // What you really have, as the room works it out, as of the progress
      // your game sent at play time `ms`: what you got since stays yours.
      if (game.state.shared !== room || !Number.isSafeInteger(d.ms) || !cleanSave(d.s)) return;
      // Which progress it answers: by its number (several can go at the
      // same play time, say while the game is hidden), or from a room
      // before v0.91.1, the newest at that play time.
      const at = Number.isSafeInteger(d.n) ? sent.find((x) => x.n === d.n) : sent.findLast((x) => x.ms === d.ms);
      if (Core.correctProgress(game.state, d.s, at ? at.inv : null)) game.worldChanged();
      return;
    }
    if (d.t === 'edits') {
      const list = cleanEdits(d.e);
      if (list && game.state.shared === room && Core.applyEdits(game.state, list)) game.worldChanged();
      return;
    }
    if (d.t === 'status') {
      if (!ID_RE.test(d.id) || d.id === me) return;
      const st = cleanStatus(d.st), c = cleanColor(d.c);
      if (st === null || c === null) return;
      let f = friends.get(d.id);
      const arrived = st === 'online' && (!f || f.st !== 'online');
      if (!f) {
        if (friends.size >= LIMITS.players) return;
        f = { c, st, p: null, shown: null, heard: 0, since: 0, actor: createActor() };
        friends.set(d.id, f);
        roster = null;
        if (st === 'online') hud.toast(t('together.toast.joined', { name: nameOf(d.id) }));
      }
      const back = st === 'online' && f.st !== 'online';
      // They most likely just loaded the newest game: make sure this is it too.
      if (arrived) checkUpdate();
      if (f.c !== c) roster = null;
      f.c = c;
      f.st = st;
      f.since = back ? 0 : f.since;
      if (d.p) { const p = cleanPos(d.p); if (p) f.p = p; }
      f.heard = performance.now() / 1000;
      renderFriends();
      renderNuke();
      return;
    }
    if (d.t === 'removed') {
      if (d.id === me || typeof d.id !== 'string' || !ID_RE.test(d.id)) return; // the close that follows says so
      if (friends.delete(d.id)) { roster = null; renderFriends(); renderNuke(); }
      // Their buildings go with them (the room has taken them down too).
      const s = game.state;
      const kept = s.extractors.filter((b) => b.owner !== d.id);
      if (kept.length !== s.extractors.length) { s.extractors = kept; game.worldChanged(); }
      return;
    }
    // Frozen (its progress was hacked): no longer asleep here, a tombstone
    // instead (the 'graves' that follows); its buildings stay.
    if (d.t === 'frozen') {
      if (d.id === me || typeof d.id !== 'string' || !ID_RE.test(d.id)) return;
      if (friends.delete(d.id)) { renderFriends(); renderNuke(); }
      return;
    }
    if (d.t === 'graves') {
      graves = cleanGraves(d.g);
      roster = null;
      return;
    }
    // The owner was removed for cheating: the world is someone else's now.
    if (d.t === 'owner') {
      if (typeof d.id !== 'string' || !ID_RE.test(d.id)) return;
      owner = d.id;
      roster = null;
      renderFriends();
      game.changedMode();
      hud.toast(d.id === me ? t('together.toast.youOwn') : t('together.toast.newOwner', { name: nameOf(d.id) }));
      return;
    }
    if (d.t === 'invite') {
      if (typeof d.code !== 'string' || !ROOM_ID_RE.test(d.code) || !Number.isSafeInteger(d.until)) return;
      openQr(d.code, d.until);
    }
    if (d.t === 'nuke') {
      const next = cleanNuke(d.nuke);
      if (next) voted(next);
    }
    if (d.t === 'invitesFull') hud.toast(t('invites.full'));
    if (d.t === 'invites') {
      clearTimeout(invitesTimer);
      const list = cleanInvites(d.list);
      if (list) renderInvites(list);
      else el.invitesPanel.replaceChildren(note(t('invites.failed')));
    }
  }

  function welcome(raw) {
    const w = cleanWelcome(raw);
    if (!w) { stop(t('together.toast.broken')); return; }
    // Made another way than this game makes worlds (an update is rolling
    // out): the same seed would grow different land here than for everyone
    // else, so not until both sides match.
    if (w.fmt !== null && w.fmt !== WORLD_FORMAT) return mismatched(w.fmt > WORLD_FORMAT);
    welcomed = true;
    retry = 0;
    pongs = w.pong; acks = w.ack; pingT = PING_EVERY;
    code = null;  // an invite is for getting in once
    back = null;
    me = w.you; owner = w.owner; myColor = w.c;
    friends.clear();
    roster = null;
    for (const [id, p] of w.players) friends.set(id, { ...p, shown: null, heard: performance.now() / 1000, since: 0, actor: createActor() });
    graves = w.graves;
    remember(room);
    write(PLAYING_STORE, room);
    nukeOn = w.nuke;
    // The world was nuked and made again since this phone was last in it:
    // its copies of your progress and map are from a world that's gone.
    const was = read(GEN_PREFIX + room);
    const renewed = was !== null && was !== String(w.gen);
    if (renewed) { write(SAVE_PREFIX + room, ''); write(FOG_PREFIX + room, ''); }
    write(GEN_PREFIX + room, String(w.gen));
    if (game.state.shared === room && !renewed) {
      resync(w);
    } else {
      unacked = []; // edits for another world, or one made again
      // Arriving: your progress is the room's (it works it out from what you
      // did). A room from before that kept whatever came last: then the newer
      // of its copy and this phone's.
      const local = w.econ ? null : cleanSave(read(SAVE_PREFIX + room));
      const save = local && (!w.save || playedTime(local) > playedTime(w.save)) ? local : w.save;
      let fog = null;
      try { fog = JSON.parse(read(FOG_PREFIX + room) || 'null'); } catch { fog = null; }
      const near = [...w.players.entries()].filter(([, f]) => f.st === 'online' && f.p)
        .sort(([a], [b]) => (a === w.owner ? -1 : b === w.owner ? 1 : 0)).map(([, f]) => f.p)[0] || w.p;
      const state = Core.joinState({ ...w, save }, room, fog, near);
      if (!state) { stop(t('together.toast.broken')); return; }
      game.replace(state);
      game.arrived();
      hud.toast(t(renewed ? 'nuke.toast.done' : 'together.toast.in'));
      policyNotice();
    }
    // The room works out your progress from what you do too (src/core/acts.js).
    if (game.state.shared === room) game.state.acts = w.acts ? (game.state.acts || []) : null;
    if (w.time !== null) clock = { t: w.time, at: performance.now() / 1000 };
    keepTime();
    lastPos = ''; lastSave = '';
    if (document.hidden) sendAway(); // the room takes everyone in as here
    renderFriends();
    renderNuke();
    game.changedMode();
    if (game.state.shared === room && pendingInvite) { pendingInvite = false; showInvite(); }
  }

  // Back after a lost connection: the room's world wins, your progress stays,
  // and what you changed meanwhile is sent again.
  function resync(w) {
    const s = game.state;
    const waiting = new Map(s.extractors.filter((e) => e.owner === me).map((e) => [e.x + ',' + e.y + ',' + e.z, e.buffer]));
    // Sent, but the connection died before the room answered: sent again,
    // unless the room already has something there (then the room's stands).
    const has = new Set([...w.mods.map(([k]) => 'm' + k), ...w.props.map(([k]) => 'p' + k), ...w.ext.map((e) => 'x' + e[1] + ',' + e[2] + ',' + e[3])]);
    const lost = unacked.flatMap((u) => u.e).filter((e) => !has.has(e[0] === 'x' ? 'x' + e[2] + ',' + e[3] + ',' + e[4] : e[0] + e[1]));
    unacked = [];
    const pending = [...lost, ...Core.takeEdits(s)];
    s.world.mods = new Map();
    s.world.props = new Map();
    s.extractors = [];
    Core.applyEdits(s, [...w.mods.map(([k, v]) => ['m', k, v]), ...w.props.map(([k, v]) => ['p', k, v]), ...w.ext.map((e) => ['x', ...e])]);
    for (const e of s.extractors) if (e.owner === me) e.buffer = waiting.get(e.x + ',' + e.y + ',' + e.z) || 0;
    s.world.edits = pending;
    for (const e of pending) Core.applyEdits(s, [e[0] === 'x' ? [...e, me] : e]);
    game.worldChanged();
  }

  /* ------------------------------------------------------- each frame */

  // The world's time of day is the room's: everyone in it sees the same sun.
  // The room sends its clock on every welcome; between those it runs here.
  function keepTime() {
    const s = game.state;
    if (s.shared === room && clock) s.time = clock.t + performance.now() / 1000 - clock.at;
  }

  function tick(dt) {
    const s = game.state;
    signT = Math.max(0, Math.min(1, signT + (invite ? dt : -dt) * SIGN_SPEED));
    if (signT === 0 && !invite) signFace = null;
    if (invite && Date.now() > invite.until) closeQr();
    if (!s.shared) return;
    keepTime();
    if (nukeOn) renderNuke(); // its countdown
    const w = s.world;
    if (w.edits && w.edits.length > MAX_PENDING_EDITS) w.edits.splice(0, w.edits.length - MAX_PENDING_EDITS);
    const now = performance.now() / 1000;
    for (const f of friends.values()) {
      if (f.st === 'online' && now - f.heard > QUIET_IS_LOST) f.quiet = true;
      else f.quiet = false;
      f.since += dt;
      if (f.p) {
        // Glide toward where they are; jump if it's far or another layer.
        if (!f.shown || f.shown.z !== f.p.z || Math.hypot(f.p.x - f.shown.x, f.p.y - f.shown.y) > 6) f.shown = { ...f.p };
        else {
          const k = Math.min(1, dt * 12);
          f.shown.x += (f.p.x - f.shown.x) * k;
          f.shown.y += (f.p.y - f.shown.y) * k;
          f.shown.fx = f.p.fx; f.shown.m = f.p.m; f.shown.sign = f.p.sign; f.shown.dev = f.p.dev;
        }
      }
    }
    if (!ws || ws.readyState !== 1 || !welcomed) return;
    // Counted in play time, so a game that was hidden doesn't come back
    // thinking the room went quiet.
    silence += dt;
    if (pongs) {
      if (silence > SILENT_IS_DEAD) return dead();
      if ((pingT -= dt) <= 0) { pingT = PING_EVERY; ws.send(PING); }
    }
    for (const k in timers) timers[k] -= dt;
    if (timers.pos <= 0) {
      timers.pos = POS_EVERY;
      const p = s.player, f = game.facing();
      const pos = { x: p.x, y: p.y, z: p.z, fx: f.x, fy: f.y, m: game.moving(), sign: signT > 0, dev: DEVICE, ...game.act() };
      const text = JSON.stringify(cleanPos(pos));
      if (text !== lastPos || timers.beat <= 0) {
        lastPos = text;
        timers.beat = HEARTBEAT;
        send({ t: 'pos', p: cleanPos(pos) });
      }
    }
    if (timers.edits <= 0) {
      timers.edits = EDITS_EVERY;
      sendActs(s); // before the edits they made: the room does them on the world as it was
      const edits = Core.takeEdits(s);
      // A few messages' worth now; the rest waits for the next turn.
      const now2 = edits.splice(0, LIMITS.editsPerMessage * 3);
      if (edits.length) s.world.edits.unshift(...edits);
      for (let i = 0; i < now2.length; i += LIMITS.editsPerMessage) {
        const batch = cleanEdits(now2.slice(i, i + LIMITS.editsPerMessage));
        if (batch) sendEdits(batch);
      }
    }
    if (timers.save <= 0) save(s);
  }

  // What you did since last time, with your play time now (see src/core/acts.js).
  // Kept while there's no connection to send them on, and a long backlog
  // goes ACTS_PER_TICK messages at a time, each as of its last act, so the
  // room never runs ahead of what's still to come. Returns whether all went.
  function sendActs(s) {
    if (!ws || ws.readyState !== 1 || !welcomed || !s.acts) return false;
    if (!s.acts.length) return true;
    const acts = Core.takeActs(s);
    const n = LIMITS.actsPerMessage;
    const now = acts.slice(0, n * ACTS_PER_TICK);
    s.acts.unshift(...acts.slice(now.length));
    const done = !s.acts.length;
    for (let i = 0; i < now.length; i += n) {
      const a = now.slice(i, i + n);
      send({ t: 'acts', ms: done && i + n >= now.length ? Math.round(s.stats.playedMs) : a[a.length - 1][1], a });
    }
    return done;
  }

  function sendEdits(batch) {
    if (!acks) return send({ t: 'edits', e: batch });
    const n = ++editSeq;
    unacked.push({ n, e: batch });
    if (unacked.length > MAX_UNACKED) unacked.shift();
    send({ t: 'edits', e: batch, n });
  }

  // Your progress: kept on this phone and sent to the room.
  function save(s, force = false) {
    if (!s.shared) return;
    const progress = Core.progressOf(s);
    write(SAVE_PREFIX + s.shared, progress);
    if (force || timers.fog <= 0) {
      timers.fog = FOG_EVERY;
      write(FOG_PREFIX + s.shared, JSON.stringify(Core.fogOf(s)));
    }
    if (timers.save > 0 && !force) return;
    timers.save = SAVE_EVERY;
    if (progress === lastSave || !cleanSave(progress)) return;
    lastSave = progress;
    // The room checks this against what you did, so that goes first, all of it.
    if (s.acts && !sendActs(s)) { lastSave = ''; timers.save = 0; return; }
    sent.push({ n: ++saveSeq, ms: Math.round(s.stats.playedMs), inv: { ...s.inv } });
    if (sent.length > SENT_KEPT) sent.shift();
    send({ t: 'save', s: progress, n: saveSeq });
  }

  // Couldn't get into a world: the room service may be down, or the world
  // gone (one nobody visits for 30 days is deleted). Gone, it's forgotten
  // and the player told; down, nothing changes.
  async function gone(id) {
    if (!service || !id) return;
    try {
      const res = await fetch(service + '/rooms/' + id, { cache: 'no-store' });
      const d = res.ok ? await res.json() : null;
      if (d?.exists !== false) return;
    } catch { return; }
    forget(id);
    if (read(PLAYING_STORE) === id) write(PLAYING_STORE, '');
    if (!game.state.shared) game.changedMode();
    hud.toast(t('together.toast.gone'));
  }

  // Away or back, as the screen is now. The room takes one change every
  // STATUS_MS and ignores the rest, so one that comes too soon waits: a
  // quick look away and back must not leave friends seeing the wrong one.
  let awayAt = -Infinity, awayTimer = 0;
  function sendAway() {
    clearTimeout(awayTimer);
    const wait = awayAt + AWAY_EVERY - performance.now();
    if (wait > 0) { awayTimer = setTimeout(sendAway, wait); return; }
    awayAt = performance.now();
    send({ t: 'away', a: document.hidden });
  }

  /* -------------------------------------------------------- the QR sign */

  let pendingInvite = false;

  function showInvite() {
    if (!game.state.shared || !welcomed) { hud.toast(t('together.toast.offline')); return; }
    send({ t: 'invite', ...inviteAsk() });
  }

  // How many people your new links let in and for how long (Invite links),
  // remembered on this device. Never unlimited.
  function inviteAsk() {
    return cleanInviteAsk({ uses: Number(read(INVITE_USES_STORE)), life: Number(read(INVITE_LIFE_STORE)) });
  }

  // The room gave us an invite: up goes the sign with its code. Your
  // wanderer holds it in the world (render/sprites.js drawSign).
  function openQr(inviteCode, until) {
    invite = { code: inviteCode, until };
    signFace = qrCanvas(inviteUrl(inviteCode));
    renderButton();
  }

  // The link on the sign. The invite is in the fragment (#), which browsers
  // never send to any server: it reaches the friend's phone and nowhere else.
  function inviteUrl(inviteCode) {
    return location.origin + location.pathname + '#join=' + room + '.' + inviteCode;
  }

  // Tapping your sign copies its link, to send to a friend who isn't there.
  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.code));
      hud.toast(t('together.toast.copied'));
    } catch {
      hud.toast(t('together.toast.copyFailed'));
    }
  }

  // The sign goes down; its link keeps working (see Invite links).
  function closeQr() {
    invite = null;
    renderButton();
  }

  /* ------------------------------------------------------ invite links */

  // Every invite link you may see (all of them for the world's owner), with
  // who made it, how many joined with it, and Show and Stop. Built from
  // elements and text only, never HTML.
  // Never "loading" for ever: no answer in a few seconds says so.
  let invitesTimer = 0;
  function listInvites() {
    clearTimeout(invitesTimer);
    const online = !!ws && ws.readyState === 1 && welcomed;
    el.invitesPanel.replaceChildren(note(t(online ? 'invites.loading' : 'together.toast.offline')));
    if (!online) return;
    send({ t: 'invites' });
    invitesTimer = setTimeout(() => el.invitesPanel.replaceChildren(note(t('invites.failed'))), INVITES_WAIT);
  }

  function note(text) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    return p;
  }

  // Picks for new links, like Discord's: how many people, for how long.
  function askRow(label, values, current, text, store, list) {
    const row = document.createElement('div');
    row.className = 'inviteAsk';
    const name = document.createElement('span');
    name.textContent = label;
    const pick = document.createElement('div');
    pick.className = 'pick';
    pick.setAttribute('role', 'radiogroup');
    pick.setAttribute('aria-label', label);
    for (const v of values) {
      const b = button(text(v), v === current ? 'on' : '', () => {
        write(store, String(v));
        if (invite) closeQr(); // the sign's link was made the old way
        renderInvites(list);
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === current));
      pick.append(b);
    }
    row.append(name, pick);
    return row;
  }

  function lifeText(min) {
    return min < 60 ? t('invites.minutes', { n: min }) : min < 1440 ? t('invites.hours', { n: min / 60 }) : t('invites.days', { count: min / 1440 });
  }

  function renderInvites(list) {
    const box = el.invitesPanel;
    const ask = inviteAsk();
    const asks = [
      askRow(t('invites.ask.uses'), INVITE_USES, ask.uses, String, INVITE_USES_STORE, list),
      askRow(t('invites.ask.life'), INVITE_LIVES, ask.life, lifeText, INVITE_LIFE_STORE, list)
    ];
    if (!list.length) { box.replaceChildren(...asks, note(t('invites.empty'))); return; }
    const now = Date.now();
    box.replaceChildren(...asks, ...list.map((inv) => {
      const works = !inv.off && inv.until > now && inv.uses < inv.max;
      const row = document.createElement('div');
      row.className = 'invite' + (works ? '' : ' dead');
      const by = inv.by === me ? myColor : friends.get(inv.by)?.c;
      row.style.setProperty('--friend', by === undefined ? 'var(--ink-dim)' : friendColor(by));
      const dot = document.createElement('i');
      const text = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = inv.by === me ? t('invites.yours') : t('invites.theirs', { name: nameOf(inv.by) || t('invites.someone') });
      const sub = document.createElement('small');
      const state = inv.off ? t('invites.stopped') : inv.until <= now ? t('invites.expired') : inv.uses >= inv.max ? t('invites.usedUp') : t('invites.left', { time: timeLeft(inv.until - now) });
      sub.textContent = t('invites.uses', { n: inv.uses, max: inv.max }) + ' · ' + state;
      text.append(title, sub);
      row.append(dot, text);
      if (works) {
        if (inv.by === me) row.append(button(t('invites.show'), '', () => { closeSheet(); openQr(inv.code, inv.until); }));
        row.append(button(t('invites.stop'), 'stop', () => revoke(inv.code)));
      }
      return row;
    }));
  }

  function button(label, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function timeLeft(ms) {
    const min = Math.max(1, Math.round(ms / 60_000));
    return min < 60 ? t('invites.minutes', { n: min })
      : min < 2880 ? t('invites.hours', { n: Math.round(min / 60) })
      : t('invites.days', { count: Math.round(min / 1440) });
  }

  async function revoke(inviteCode) {
    const yes = await ask({ title: t('invites.stopAsk.title'), text: t('invites.stopAsk.text'), yes: t('invites.stopAsk.yes'), danger: true });
    if (!yes) return;
    if (invite && invite.code === inviteCode) closeQr();
    send({ t: 'revoke', code: inviteCode });
  }

  // The main Invite button: holds up your sign (going online first if this
  // world isn't shared yet), or puts it down.
  function renderButton() {
    const up = !!invite;
    el.invite.hidden = !service;
    el.invite.classList.toggle('up', up);
    document.body.classList.toggle('signing', up); // clears the screen around the sign (style.css)
    el.invite.setAttribute('aria-pressed', String(up));
    el.inviteLabel.textContent = t(up ? 'together.button.down' : 'together.button');
  }
  el.invite.addEventListener('click', () => {
    if (invite) closeQr();
    else if (game.state.shared) showInvite();
    else start();
  });

  /* ------------------------------------------------------------ the nuke */

  // Someone arrived with an update this world can't have: the nuke is up on
  // every screen until the room makes the world again (server/src/room.js).
  // You must press it; it's pressed for anyone away or offline, and for
  // everyone left once its minute is up.
  function press() {
    if (!nukeOn || nukeOn.votes.has(me)) return;
    nukeOn.votes.add(me);
    send({ t: 'nuke' });
    renderNuke();
  }

  // The room's new count: in a small world, say who just pressed it.
  function voted(next) {
    const small = friends.size + 1 <= NUKE_TOASTS;
    for (const id of next.votes) {
      if (small && id !== me && !(nukeOn && nukeOn.votes.has(id))) hud.toast(t('nuke.toast.pressed', { name: nameOf(id) }));
    }
    nukeOn = next;
    renderNuke();
  }

  // The screen: how many have pressed it (counting those it's pressed for),
  // who it still waits for (the first few names, and how many more), and
  // how long until it's pressed for them.
  let shownNuke = '';
  function renderNuke() {
    if (!nukeOn || !game.state.shared) {
      if (shownNuke) { shownNuke = ''; nukeScreen.hide(); }
      return;
    }
    const everyone = [...friends.keys(), me].filter(Boolean);
    const here = (id) => id === me || friends.get(id)?.st === 'online';
    const waiting = everyone.filter((id) => here(id) && !nukeOn.votes.has(id));
    const left = Math.max(0, Math.ceil((nukeOn.until - Date.now()) / 1000));
    const time = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    const shown = waiting.slice(0, NUKE_NAMES).map((id) => nameOf(id)).join(', ');
    const lines = [t('nuke.votes.count', { n: everyone.length - waiting.length, total: everyone.length })];
    if (waiting.length) {
      lines.push(t('nuke.votes.waiting', { names: waiting.length > NUKE_NAMES ? t('nuke.votes.more', { names: shown, n: waiting.length - NUKE_NAMES }) : shown }));
      lines.push(t('nuke.votes.auto', { time }));
    }
    const line = lines.join('\n'), done = nukeOn.votes.has(me);
    const key = line + done;
    if (key === shownNuke) return;
    shownNuke = key;
    nukeScreen.show({ heading: t('nuke.title'), body: t('nuke.text.shared'), button: t(done ? 'nuke.pressed' : 'nuke.button'), line, done, press });
  }

  /* ---------------------------------------------------- friends in the HUD */

  // Everyone's name in this room, by id: a nature name picked from their id,
  // never two the same, and the same on every phone (players are named in
  // the order of their colours, which the room hands out). Shown in the
  // game's language.
  // Past the last name they come round again numbered (Fox 2, Fox 3…).
  // Worked out once per change of who's in the world.
  let roster = null;   // id -> name number, or null when it needs working out
  function nameOf(id) {
    if (!roster) {
      const players = [...friends.entries()].map(([pid, f]) => [pid, f.c]);
      if (me) players.push([me, myColor]);
      // A tombstone keeps its character's name, so nobody else gets it.
      for (const g of graves) if (g.id !== me && !friends.has(g.id)) players.push([g.id, g.c]);
      players.sort((a, b) => a[1] - b[1]);
      const taken = new Set();
      roster = new Map();
      for (const [pid] of players) {
        let k = parseInt(pid.slice(0, 8), 16) % NAMES.length;
        while (taken.has(k)) k++;
        taken.add(k);
        roster.set(pid, k);
      }
    }
    const k = roster.get(id);
    if (k === undefined) return '';
    const name = t('together.name.' + NAMES[k % NAMES.length]);
    return k < NAMES.length ? name : name + ' ' + (Math.floor(k / NAMES.length) + 1);
  }

  function stateOf(f) {
    return f.st === 'online' && f.quiet ? 'lost' : f.st;
  }

  // A small chip per friend under the top bar: their colour, name and how
  // they're doing; those awake first, and past a handful a "+N" for the rest.
  // Built from elements and text only, never HTML.
  let shownChips = '';
  function renderFriends() {
    const awake = (f) => (f.st === 'offline' ? 1 : 0);
    const all = [...friends.entries()].sort(([, a], [, b]) => awake(a) - awake(b) || a.c - b.c);
    const list = all.slice(0, MAX_CHIPS);
    const more = all.length - list.length;
    const key = list.map(([id, f]) => id + nameOf(id) + stateOf(f)).join('|') + '+' + more + (game.state.shared ? 1 : 0);
    if (key === shownChips) return;
    shownChips = key;
    const box = el.friends;
    box.replaceChildren();
    box.hidden = !game.state.shared;
    for (const [id, f] of list) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'friend ' + stateOf(f);
      chip.style.setProperty('--friend', friendColor(f.c));
      chip.setAttribute('aria-label', nameOf(id) + ', ' + t('together.state.' + stateOf(f)));
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = nameOf(id);
      chip.append(dot, name);
      chip.addEventListener('click', () => friendTapped(id));
      box.appendChild(chip);
    }
    if (more > 0) {
      const rest = document.createElement('span');
      rest.className = 'friend more'; // i18n-ok: a class name
      rest.textContent = '+' + more;
      rest.setAttribute('aria-label', t('together.more', { n: more }));
      box.appendChild(rest);
    }
  }

  // The owner can remove someone from their world (say a link got out).
  async function friendTapped(id) {
    const f = friends.get(id);
    if (!f) return;
    if (me !== owner) { hud.toast(nameOf(id) + ': ' + t('together.state.' + stateOf(f))); return; }
    const yes = await ask({ title: t('together.remove.title', { name: nameOf(id) }), text: t('together.remove.text'), yes: t('together.remove.yes'), danger: true });
    if (yes && friends.has(id)) send({ t: 'remove', id });
  }

  /* ---------------------------------------------------- starting & joining */

  // The question before going into a shared world says that playing
  // together accepts the privacy policy and links to it: yes accepts it,
  // Cancel keeps you playing alone. No extra step.
  async function askTogether(kind) {
    const yes = await ask({
      title: t(`together.${kind}.title`),
      text: t(`together.${kind}.text`) + ' ' + t(`privacy.${kind}`),
      yes: t(`together.${kind}.yes`),
      link: { href: policyUrl(), text: t('privacy.link') }
    });
    if (yes) write(PRIVACY_STORE, POLICY_VERSION);
    return yes;
  }

  // Back in a shared world without that question (on opening the game, or
  // Back to the shared world) by someone who joined before the policy: once,
  // a toast says playing together accepts it.
  function policyNotice() {
    if (read(PRIVACY_STORE) === POLICY_VERSION) return;
    write(PRIVACY_STORE, POLICY_VERSION);
    hud.toast(t('privacy.toast'));
  }

  // Already on the way into a shared world (back into yours, through a
  // link, or going online): a second one would race it. Says so.
  function busy() {
    if (!room && !starting) return false;
    hud.toast(t('together.toast.offline'));
    return true;
  }

  // Your world goes online: a room is made from it and you're its owner.
  let starting = false;
  async function start() {
    if (!service || game.state.shared || busy()) return;
    if (!(await askTogether('start')) || game.state.shared || busy()) return;
    starting = true;
    try { await goOnline(); } finally { starting = false; }
  }

  async function goOnline() {
    const s = game.state;
    // A new world, everyone in it starting from nothing, you too (Watch's
    // call: the room can't check progress made anywhere else). Your world
    // here stays as it is for playing alone.
    const body = JSON.stringify({ t: 'create', key: myKey(), world: { seed: randomSeed(), mods: [], props: [], ext: [] }, time: cleanTime(s.time) ?? 0 });
    if (body.length > LIMITS.createBytes) { hud.toast(t('together.toast.tooBig')); return; }
    let made;
    try {
      const res = await fetch(service + '/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      made = res.ok ? await res.json() : null;
      if (res.status === 429) { hud.toast(t('together.toast.busy')); return; }
    } catch { made = null; }
    // Something else took you into a shared world meanwhile: that stands.
    if (game.state.shared || room) return;
    if (!made || typeof made.room !== 'string' || !ROOM_ID_RE.test(made.room)) { hud.toast(t('together.toast.unreachable')); return; }
    room = made.room;
    pendingInvite = true;
    connect();
  }

  // `orBack`: the shared world the game was about to go back into when the
  // link opened it, gone back to if you say no or the link doesn't work.
  async function join(roomId, inviteCode, orBack = null) {
    if (!service) return;
    if (!(await askTogether('join'))) {
      if (orBack && !game.state.shared && !room) resume();
      return;
    }
    // You stay in the shared world you're in until the new one lets you in:
    // a link that no longer works brings you back to it.
    const here = game.state.shared || orBack;
    if (game.state.shared) save(game.state, true);
    back = here && here !== roomId ? here : null;
    hangUp();
    room = roomId;
    code = inviteCode;
    connect();
  }

  // A friend's QR opened the game: #join=<room>.<invite>. The code is taken
  // out of the address at once so it isn't kept in history or reloaded.
  function joinFromLink(atStart = false) {
    const hash = new URLSearchParams(location.hash.slice(1));
    const raw = hash.get('join');
    if (raw === null) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const m = JOIN_RE.exec(raw);
    if (!m) { hud.toast(t('together.toast.badLink')); return false; }
    if (!service) { hud.toast(t('together.toast.unavailable')); return false; }
    join(m[1], m[2], atStart ? playing() : null);
    return true;
  }

  // The shared world the game opens into, or null.
  function playing() {
    const last = read(PLAYING_STORE);
    return last && ROOM_ID_RE.test(last) ? last : null;
  }

  // Back into the shared world you were in when the game closed.
  function resume() {
    const last = playing();
    if (!service || !last) return;
    room = last;
    connect();
  }

  function rejoin() {
    const last = knownRooms()[0];
    if (!service || !last || game.state.shared || busy()) return;
    room = last;
    connect();
  }

  return {
    available: !!service,
    get active() { return !!game.state.shared; },
    get isOwner() { return !!me && me === owner; },
    get canRejoin() { return !!service && !game.state.shared && knownRooms().length > 0; },
    get color() { return myColor; },
    get me() { return game.state.shared && me ? { name: nameOf(me), color: friendColor(myColor) } : null; },
    get sign() { return signT; },
    get signFace() { return signFace; },
    tick,
    save,
    start,
    leave: () => stop(),
    rejoin,
    resume,
    joinFromLink,
    // The game opened: through a friend's link, else back into the shared
    // world you were in, if any.
    open() { if (!joinFromLink(true)) resume(); },
    showInvite,
    listInvites,
    copyLink,
    away(hidden) {
      sendAway();
      if (hidden) save(game.state, true);
    },
    // Friends as the renderer draws them (where they're shown, not where the
    // last message said), with how long they've been in their state.
    view() {
      const out = [];
      for (const [id, f] of friends) {
        if (f.shown) out.push({ id, c: f.c, color: friendColor(f.c), name: nameOf(id), st: stateOf(f), since: f.since, ...f.shown, actor: f.actor.view(f.shown.m) });
      }
      return out;
    },
    // The tombstones, as the renderer draws them.
    graves() {
      return graves.map((g) => ({ x: g.x, y: g.y, z: g.z, k: g.k, color: friendColor(g.c), name: nameOf(g.id) }));
    },
    refresh() { renderFriends(); renderButton(); renderNuke(); }
  };
}
