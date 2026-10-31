/* What the room sends, checked before it touches the game (together.js).
 * src/net/protocol.js checks each message's shape; these turn the parts the
 * game keeps (the welcome, players, invite links, tombstones, time away)
 * into plain values, or null when they don't fit. Pure: no page, no
 * storage, so the tests run them in Node (test/unit/room-messages.test.js). */

import * as Core from '../core/index.js';
import {
  LIMITS,
  cleanPos,
  cleanWorld,
  cleanSave,
  cleanStatus,
  cleanColor,
  cleanTime,
  ROOM_ID_RE,
  ID_RE,
  INVITE_DEFAULT
} from '../net/protocol.js';

// The time stamp in a progress string, to tell which copy is newer.
export function playedTime(save) {
  try {
    const ms = JSON.parse(save).stats?.playedMs;
    return typeof ms === 'number' ? ms : -1;
  } catch {
    return -1;
  }
}

// The invite links the room lists, or null if the list doesn't fit. The
// game and the room service deploy separately, so for a while one can be a
// version ahead of the other: fields the game doesn't know yet are ignored,
// and a list from before `max` gets the default.
export function cleanInvites(list) {
  if (!Array.isArray(list) || list.length > 100) return null;
  const out = [];
  for (const e of list) {
    if (!Array.isArray(e) || e.length < 6) return null;
    const [code, by, made, until, uses, off, max = INVITE_DEFAULT.uses] = e;
    if (
      typeof code !== 'string' ||
      !ROOM_ID_RE.test(code) ||
      typeof by !== 'string' ||
      !ID_RE.test(by) ||
      !Number.isSafeInteger(made) ||
      !Number.isSafeInteger(until) ||
      !Number.isSafeInteger(uses) ||
      uses < 0 ||
      typeof off !== 'boolean' ||
      !Number.isSafeInteger(max) ||
      max < 1
    )
      return null;
    out.push({ code, by, made, until, uses, off, max });
  }
  return out;
}

export function cleanPlayers(players) {
  if (!players || typeof players !== 'object' || Array.isArray(players)) return null;
  const out = new Map();
  for (const [id, p] of Object.entries(players)) {
    if (out.size >= LIMITS.players || !ID_RE.test(id) || !p) return null;
    const c = cleanColor(p.c),
      st = cleanStatus(p.st);
    if (c === null || st === null) return null;
    out.set(id, { c, st, p: p.p ? cleanPos(p.p) : null });
  }
  return out;
}

// Tombstones where banned and frozen characters last stood ([id, colour,
// x, y, z, kind]), or an empty list if they don't fit: they only mark
// places, so a bad list mustn't keep anyone out of the world.
const GRAVE_KINDS = ['ban', 'ice'];
export function cleanGraves(list) {
  if (!Array.isArray(list) || list.length > 300) return [];
  const out = [];
  for (const g of list) {
    if (!Array.isArray(g) || g.length < 6) return [];
    const [id, c, x, y, z, k] = g;
    const p = cleanPos({ x, y, z });
    if (
      typeof id !== 'string' ||
      !ID_RE.test(id) ||
      cleanColor(c) === null ||
      !p ||
      !GRAVE_KINDS.includes(k)
    )
      return [];
    out.push({ id, c, x: p.x, y: p.y, z: p.z, k });
  }
  return out;
}

export function cleanWelcome(d) {
  if (!ID_RE.test(d.you) || cleanColor(d.c) === null) return null;
  const world = cleanWorld({ seed: d.seed, mods: d.mods, props: d.props, ext: d.ext });
  const players = cleanPlayers(d.players);
  const gen = d.gen ?? 0; // how often the world was made again (only by the nuke, gone since v0.117.0)
  const fmt = d.fmt;
  if (!Number.isSafeInteger(gen) || gen < 0 || !Number.isSafeInteger(fmt)) return null;
  const save = d.save === null || d.save === undefined ? null : cleanSave(d.save);
  if (!world || !players || (d.save && !save)) return null;
  return {
    you: d.you,
    c: d.c,
    seed: world.seed,
    mods: world.mods,
    props: world.props,
    ext: world.ext,
    players,
    save,
    p: d.p ? cleanPos(d.p) : null,
    time: d.time === undefined ? null : cleanTime(d.time),
    gen,
    graves: cleanGraves(d.graves ?? []),
    fmt,
    // The room checks moves (v0.169.0): only then may a building move here.
    moves: d.moves === true,
    collectAt: d.collectAt === true
  };
}

// What a room says your buildings made while you were away: {secs, made}, or null.
export function cleanAway(d) {
  if (
    !d ||
    typeof d !== 'object' ||
    !Number.isFinite(d.secs) ||
    d.secs < 0 ||
    !d.made ||
    typeof d.made !== 'object'
  )
    return null;
  const made = {};
  for (const r of Core.RESOURCES) {
    const n = d.made[r] ?? 0;
    if (!Number.isFinite(n) || n < 0) return null;
    made[r] = n;
  }
  return { secs: Math.min(d.secs, Core.AWAY_CAP), made };
}
