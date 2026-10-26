/* Invite links (the code in a QR): who may make one, when one still lets
 * someone new in, and which one your sign shows. server/src/room.js keeps
 * them (`invites`: code -> {by, made, until, uses, max, life, off}) and
 * writes down every change. Only a new player needs one; anyone already in
 * the world comes back with their key. */

import { LIMITS, cleanInviteAsk, randomRoomId } from '../../src/net/protocol.js';

export const INVITE_MS = cleanInviteAsk(null).life * 60_000; // a link works this long unless asked otherwise
export const MAX_INVITES = 200;              // links a world keeps (working or not), to list and manage
export const INVITE_LIST = 100;              // newest links sent in one list (fits a message)
export const REUSE_MS = 3600_000;            // your sign shows your newest link while it has this long left (or half its life)
// One player brings at most LIMITS.invitesPerDay people into a world through
// their own links in a day, so one bad invite can't fill a world with others.
export const DAY_MS = 24 * 3600_000;

// How many people a link lets in (links from before the limit: the default).
export function maxOf(inv) {
  return Number.isSafeInteger(inv.max) ? inv.max : cleanInviteAsk(null).uses;
}

// Whether a link still lets someone new in: not stopped, not expired, not used up.
export function works(inv, now) {
  return !inv.off && inv.until >= now && inv.uses < maxOf(inv);
}

// Why a link no longer lets anyone in: 'stopped', 'expired' or 'usedUp'
// (or, from Room.join, 'limit': its maker has brought in LIMITS.invitesPerDay today).
export function whyNot(inv, now) {
  if (inv.off) return 'stopped';
  if (inv.until < now) return 'expired';
  return 'usedUp';
}

// The links player `id` may see and stop: the ones they made, newest first.
export function listFor(invites, id) {
  const list = [];
  for (const [code, inv] of invites) {
    if (inv.by === id) list.push([code, inv.by, inv.made, inv.until, inv.uses, inv.off, maxOf(inv)]);
  }
  list.sort((a, b) => b[2] - a[2]);
  return { t: 'invites', list: list.slice(0, INVITE_LIST) };
}

// The link player `id`'s sign shows when they ask for one like `ask`
// (cleanInviteAsk): their newest made that way while it still has a while to
// go and room for someone, else a new one, forgetting the oldest dead link
// if the world keeps MAX_INVITES. {code, made} (made: a new one was put in
// `invites`), or {full} when every link kept still works.
export function linkFor(invites, id, ask, now, newCode = randomRoomId) {
  const lifeMs = ask.life * 60_000;
  let code = null, newest = 0;
  for (const [c, inv] of invites) {
    if (inv.by === id && works(inv, now) && maxOf(inv) === ask.uses && inv.life === ask.life &&
        inv.until - now >= Math.min(REUSE_MS, lifeMs / 2) && inv.made >= newest) { code = c; newest = inv.made; }
  }
  if (code) return { code, made: false };
  if (invites.size >= MAX_INVITES) {
    let dead = null;
    for (const [c, inv] of invites) if (!works(inv, now) && (!dead || inv.made < invites.get(dead).made)) dead = c;
    if (!dead) return { full: true };
    invites.delete(dead);
  }
  code = newCode();
  invites.set(code, { by: id, made: now, until: now + lifeMs, uses: 0, max: ask.uses, life: ask.life, off: false });
  return { code, made: true };
}

// The times player `host` brought someone in within the last day, or null
// if they've brought in their share for today.
export function broughtToday(host, now) {
  const today = (Array.isArray(host.brought) ? host.brought : []).filter((t) => now - t < DAY_MS);
  return today.length >= LIMITS.invitesPerDay ? null : today;
}
