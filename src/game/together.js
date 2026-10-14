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
  ROOM_ID_RE, KEY_RE, ID_RE, randomHex
} from '../net/protocol.js';
import { roomService } from '../net/config.js';
import { qrcode } from '../vendor/qrcode.js';
import { loadGame } from './storage.js';
import { playDevice } from './device.js';
import { t } from '../i18n/i18n.js';

const KEY_STORE = 'mte.key';          // your secret: who you are to every room
const ROOMS_STORE = 'mte.rooms';      // shared worlds you've been in, newest first
const PLAYING_STORE = 'mte.playing';  // the shared world you're in, if any
const SAVE_PREFIX = 'mte.room.';      // your progress in a shared world (a copy)
const FOG_PREFIX = 'mte.fog.';        // the map you've explored there

const WELCOME_BYTES = 8_000_000;      // the most a room's welcome may be
const POS_EVERY = 0.125;              // seconds between position updates
const HEARTBEAT = 2;                  // seconds: say where you are even standing still
const EDITS_EVERY = 0.25;
const SAVE_EVERY = 10;
const FOG_EVERY = 15;
const QUIET_IS_LOST = 6;              // seconds without a word: shown as lost
const MAX_PENDING_EDITS = 20000;      // kept while the connection is down
const RECONNECT_MAX = 15;             // seconds between tries, at most
const SIGN_SPEED = 3;                 // the sign goes up in a third of a second

const JOIN_RE = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

// Friends' colours, by the colour number the room gives them.
export const FRIEND_COLORS = ['#7fd07a', '#ffb347', '#6fb7ff', '#ff7aa8', '#c9a6ff', '#ffe066', '#5fe0d0', '#ff8a65'];

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

/* ------------------------------------------------- what the room sends */

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

function cleanWelcome(d) {
  if (!ID_RE.test(d.you) || !ID_RE.test(d.owner) || cleanColor(d.c) === null) return null;
  const world = cleanWorld({ seed: d.seed, mods: d.mods, props: d.props, ext: d.ext });
  const players = cleanPlayers(d.players);
  const save = d.save === null || d.save === undefined ? null : cleanSave(d.save);
  if (!world || !players || (d.save && !save)) return null;
  return {
    you: d.you, owner: d.owner, c: d.c, seed: world.seed, mods: world.mods, props: world.props,
    ext: world.ext, players, save, p: d.p ? cleanPos(d.p) : null,
    time: d.time === undefined ? null : cleanTime(d.time)
  };
}

/* ------------------------------------------------------------------ */

export function createTogether({ game, hud, ask, el, friendJoined = () => {} }) {
  const service = roomService();
  let ws = null;
  let room = null;          // the shared world you're in (or joining)
  let code = null;          // the invite you're joining with, used once
  let me = null, owner = null, myColor = 0;
  let welcomed = false;     // the room has sent this connection its world
  let clock = null;         // the world's clock: {t: its time, at: our time then}
  let retry = 0, retryTimer = null;
  const friends = new Map();  // id -> {c, st, p, shown, heard, since}
  const timers = { pos: 0, beat: 0, edits: 0, save: 0, fog: 0 };
  let lastPos = '', lastSave = '';
  let invite = null;        // {code, until} while the QR is up
  let signT = 0;            // 0..1: how far up your sign is
  let signFace = null;      // the QR on it (a canvas), kept while it comes down

  /* ---------------------------------------------------- the connection */

  function send(msg) {
    if (ws && ws.readyState === 1 && welcomed) ws.send(JSON.stringify(msg));
  }

  function connect() {
    clearTimeout(retryTimer);
    if (!room || !service) return;
    const socket = new WebSocket(service.replace(/^http/, 'ws') + '/rooms/' + room + '/ws');
    ws = socket;
    welcomed = false;
    socket.onopen = () => socket.send(JSON.stringify({ t: 'hello', key: myKey(), ...(code ? { code } : {}) }));
    socket.onmessage = (e) => { if (ws === socket) receive(e.data); };
    socket.onclose = (e) => { if (ws === socket) closed(e.code, e.reason); };
  }

  function closed(codeNum, reason) {
    ws = null;
    welcomed = false;
    for (const f of friends.values()) f.heard = -Infinity;
    if (codeNum === 4001) return stop(t('together.toast.elsewhere'));
    if (codeNum === 4003) return stop(t('together.toast.removed'));
    if (reason === 'invite') return stop(t('together.toast.inviteOld'));
    if (reason === 'full') return stop(t('together.toast.full'));
    if (!room) return;
    // Never got in (the service is down or unreachable): say so, don't loop.
    if (game.state.shared !== room) return stop(t('together.toast.unreachable'));
    // Lost the connection: keep playing, and come back as soon as it can.
    if (retry === 0) hud.toast(t('together.toast.reconnecting'));
    const wait = Math.min(RECONNECT_MAX, 2 ** retry);
    retry++;
    retryTimer = setTimeout(connect, wait * 1000);
  }

  // Leaves the shared world for your own (saving your progress there first).
  function stop(message) {
    if (game.state.shared) save(game.state, true);
    const wasIn = !!game.state.shared;
    room = null; code = null; me = null; owner = null; clock = null;
    clearTimeout(retryTimer);
    if (ws) { const s = ws; ws = null; try { s.close(1000, 'bye'); } catch { /* closed */ } }
    welcomed = false;
    friends.clear();
    closeQr();
    write(PLAYING_STORE, '');
    renderFriends();
    if (wasIn) game.replace(loadGame().state);
    if (message) hud.toast(message);
    game.changedMode();
  }

  function receive(raw) {
    const d = parse(raw, WELCOME_BYTES);
    if (!d) return;
    if (d.t === 'welcome') return welcome(d);
    if (!welcomed) return;
    if (d.t === 'pos') {
      const f = ID_RE.test(d.id) && friends.get(d.id), p = cleanPos(d.p);
      if (!f || !p) return;
      if (f.st !== 'online') { f.st = 'online'; f.since = 0; }
      f.p = p;
      f.heard = performance.now() / 1000;
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
        f = { c, st, p: null, shown: null, heard: 0, since: 0 };
        friends.set(d.id, f);
        if (st === 'online') hud.toast(t('together.toast.joined', { n: c + 1 }));
      }
      const back = st === 'online' && f.st !== 'online';
      // They most likely just loaded the newest game: make sure this is it too.
      if (arrived) friendJoined();
      f.c = c;
      f.st = st;
      f.since = back ? 0 : f.since;
      if (d.p) { const p = cleanPos(d.p); if (p) f.p = p; }
      f.heard = performance.now() / 1000;
      renderFriends();
      return;
    }
    if (d.t === 'removed') {
      if (d.id === me) return; // the close that follows says so
      if (friends.delete(d.id)) renderFriends();
      return;
    }
    if (d.t === 'invite') {
      if (typeof d.code !== 'string' || !ROOM_ID_RE.test(d.code) || typeof d.until !== 'number') return;
      openQr(d.code);
    }
  }

  function welcome(raw) {
    const w = cleanWelcome(raw);
    if (!w) { stop(t('together.toast.broken')); return; }
    welcomed = true;
    retry = 0;
    code = null;  // an invite is for getting in once
    me = w.you; owner = w.owner; myColor = w.c;
    friends.clear();
    for (const [id, p] of w.players) friends.set(id, { ...p, shown: null, heard: performance.now() / 1000, since: 0 });
    remember(room);
    write(PLAYING_STORE, room);
    if (game.state.shared === room) {
      resync(w);
    } else {
      // Arriving: your progress is the newer of the room's copy and this phone's.
      const local = cleanSave(read(SAVE_PREFIX + room));
      const save = local && (!w.save || playedTime(local) > playedTime(w.save)) ? local : w.save;
      let fog = null;
      try { fog = JSON.parse(read(FOG_PREFIX + room) || 'null'); } catch { fog = null; }
      const near = [...w.players.entries()].filter(([, f]) => f.st === 'online' && f.p)
        .sort(([a], [b]) => (a === w.owner ? -1 : b === w.owner ? 1 : 0)).map(([, f]) => f.p)[0] || w.p;
      const state = Core.joinState({ ...w, save }, room, fog, near);
      if (!state) { stop(t('together.toast.broken')); return; }
      game.replace(state);
      hud.toast(t('together.toast.in'));
    }
    if (w.time !== null) clock = { t: w.time, at: performance.now() / 1000 };
    keepTime();
    lastPos = ''; lastSave = '';
    renderFriends();
    game.changedMode();
    if (game.state.shared === room && pendingInvite) { pendingInvite = false; showInvite(); }
  }

  // Back after a lost connection: the room's world wins, your progress stays,
  // and what you changed meanwhile is sent again.
  function resync(w) {
    const s = game.state;
    const waiting = new Map(s.extractors.filter((e) => e.owner === me).map((e) => [e.x + ',' + e.y + ',' + e.z, e.buffer]));
    const pending = Core.takeEdits(s);
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
    for (const k in timers) timers[k] -= dt;
    if (timers.pos <= 0) {
      timers.pos = POS_EVERY;
      const p = s.player, f = game.facing();
      const pos = { x: p.x, y: p.y, z: p.z, fx: f.x, fy: f.y, m: game.moving(), sign: signT > 0, dev: playDevice() };
      const text = JSON.stringify(cleanPos(pos));
      if (text !== lastPos || timers.beat <= 0) {
        lastPos = text;
        timers.beat = HEARTBEAT;
        send({ t: 'pos', p: cleanPos(pos) });
      }
    }
    if (timers.edits <= 0) {
      timers.edits = EDITS_EVERY;
      const edits = Core.takeEdits(s);
      // A few messages' worth now; the rest waits for the next turn.
      const now2 = edits.splice(0, LIMITS.editsPerMessage * 3);
      if (edits.length) s.world.edits.unshift(...edits);
      for (let i = 0; i < now2.length; i += LIMITS.editsPerMessage) {
        const batch = cleanEdits(now2.slice(i, i + LIMITS.editsPerMessage));
        if (batch) send({ t: 'edits', e: batch });
      }
    }
    if (timers.save <= 0) save(s);
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
    send({ t: 'save', s: progress });
  }

  /* -------------------------------------------------------- the QR sign */

  let pendingInvite = false;

  function showInvite() {
    if (!game.state.shared || !welcomed) { hud.toast(t('together.toast.offline')); return; }
    send({ t: 'invite' });
  }

  // The room gave us an invite: up goes the sign with its code. Your
  // wanderer holds it in the world (render/sprites.js drawSign).
  function openQr(inviteCode) {
    invite = { code: inviteCode, until: Date.now() + 10 * 60_000 };
    // In the fragment (#), which browsers never send to any server: the
    // invite reaches the friend's phone and nowhere else.
    signFace = qrCanvas(location.origin + location.pathname + '#join=' + room + '.' + inviteCode);
    renderButton();
  }

  function closeQr() {
    if (invite) send({ t: 'uninvite', code: invite.code });
    invite = null;
    renderButton();
  }

  // The main Invite button: holds up your sign (going online first if this
  // world isn't shared yet), or puts it down.
  function renderButton() {
    const up = !!invite;
    el.invite.hidden = !service;
    el.invite.classList.toggle('up', up);
    el.invite.setAttribute('aria-pressed', String(up));
    el.inviteLabel.textContent = t(up ? 'together.button.down' : 'together.button');
  }
  el.invite.addEventListener('click', () => {
    if (invite) closeQr();
    else if (game.state.shared) showInvite();
    else start();
  });

  /* ---------------------------------------------------- friends in the HUD */

  function friendLabel(f) {
    return t('together.player', { n: f.c + 1 });
  }

  function stateOf(f) {
    return f.st === 'online' && f.quiet ? 'lost' : f.st;
  }

  // One small chip per friend under the top bar: their colour and how
  // they're doing. Built from elements and text only, never HTML.
  let shownChips = '';
  function renderFriends() {
    const list = [...friends.entries()].sort(([, a], [, b]) => a.c - b.c);
    const key = list.map(([id, f]) => id + stateOf(f)).join('|') + (game.state.shared ? 1 : 0);
    if (key === shownChips) return;
    shownChips = key;
    const box = el.friends;
    box.replaceChildren();
    box.hidden = !game.state.shared;
    for (const [id, f] of list) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'friend ' + stateOf(f);
      chip.style.setProperty('--friend', FRIEND_COLORS[f.c]);
      chip.setAttribute('aria-label', friendLabel(f) + ', ' + t('together.state.' + stateOf(f)));
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = String(f.c + 1);
      chip.append(dot, name);
      chip.addEventListener('click', () => friendTapped(id));
      box.appendChild(chip);
    }
  }

  // The owner can remove someone from their world (say a link got out).
  async function friendTapped(id) {
    const f = friends.get(id);
    if (!f) return;
    if (me !== owner) { hud.toast(friendLabel(f) + ': ' + t('together.state.' + stateOf(f))); return; }
    const yes = await ask({ title: t('together.remove.title', { name: friendLabel(f) }), text: t('together.remove.text'), yes: t('together.remove.yes'), danger: true });
    if (yes && friends.has(id)) send({ t: 'remove', id });
  }

  /* ---------------------------------------------------- starting & joining */

  // Your world goes online: a room is made from it and you're its owner.
  async function start() {
    if (!service || game.state.shared) return;
    const yes = await ask({ title: t('together.start.title'), text: t('together.start.text'), yes: t('together.start.yes') });
    if (!yes || game.state.shared) return;
    const s = game.state;
    const body = JSON.stringify({ t: 'create', key: myKey(), world: Core.worldOf(s), save: Core.progressOf(s), pos: cleanPos(s.player), time: cleanTime(s.time) ?? 0 });
    if (body.length > LIMITS.createBytes) { hud.toast(t('together.toast.tooBig')); return; }
    let made;
    try {
      const res = await fetch(service + '/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      made = res.ok ? await res.json() : null;
      if (res.status === 429) { hud.toast(t('together.toast.busy')); return; }
    } catch { made = null; }
    if (!made || typeof made.room !== 'string' || !ROOM_ID_RE.test(made.room)) { hud.toast(t('together.toast.unreachable')); return; }
    write(FOG_PREFIX + made.room, JSON.stringify(Core.fogOf(s)));
    room = made.room;
    pendingInvite = true;
    connect();
  }

  async function join(roomId, inviteCode) {
    if (!service) return;
    const yes = await ask({ title: t('together.join.title'), text: t('together.join.text'), yes: t('together.join.yes') });
    if (!yes) return;
    if (game.state.shared) stop();
    room = roomId;
    code = inviteCode;
    connect();
  }

  // A friend's QR opened the game: #join=<room>.<invite>. The code is taken
  // out of the address at once so it isn't kept in history or reloaded.
  function joinFromLink() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const raw = hash.get('join');
    if (raw === null) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const m = JOIN_RE.exec(raw);
    if (!m) { hud.toast(t('together.toast.badLink')); return false; }
    if (!service) { hud.toast(t('together.toast.unavailable')); return false; }
    join(m[1], m[2]);
    return true;
  }

  // Back into the shared world you were in when the game closed.
  function resume() {
    const last = read(PLAYING_STORE);
    if (!service || !last || !ROOM_ID_RE.test(last)) return;
    room = last;
    connect();
  }

  function rejoin() {
    const last = knownRooms()[0];
    if (!service || !last || game.state.shared) return;
    room = last;
    connect();
  }

  return {
    available: !!service,
    get active() { return !!game.state.shared; },
    get isOwner() { return !!me && me === owner; },
    get canRejoin() { return !!service && !game.state.shared && knownRooms().length > 0; },
    get color() { return myColor; },
    get sign() { return signT; },
    get signFace() { return signFace; },
    tick,
    save,
    start,
    leave: () => stop(),
    rejoin,
    resume,
    joinFromLink,
    showInvite,
    away(hidden) {
      send({ t: 'away', a: hidden });
      if (hidden) save(game.state, true);
    },
    // Friends as the renderer draws them (where they're shown, not where the
    // last message said), with how long they've been in their state.
    view() {
      const out = [];
      for (const [id, f] of friends) if (f.shown) out.push({ id, c: f.c, st: stateOf(f), since: f.since, ...f.shown });
      return out;
    },
    refresh() { renderFriends(); renderButton(); }
  };
}
