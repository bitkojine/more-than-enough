/* Your own world on every device you link (Settings → Another device), kept
 * by the room service (server/src/vault.js). It also brings a world back to
 * a phone whose browser wiped its storage (Safari does, for a site not opened
 * in 7 days): link it again from your other device.
 *
 * The device that shows the QR makes a sync key; the device that scans it
 * (#link=<key>) takes it. From then on each keeps the world it's playing in
 * the vault while it's played (every PUSH_EVERY, and when the game goes to
 * the background), and asks for the newest when it opens, comes back to the
 * front, or is played again after IDLE_MS unplayed. The world played last wins:
 * a device that hasn't been played since it last kept its world takes the
 * newest from the vault (time away makes nothing, so there's nothing to
 * lose). Only when both devices played the same world since they last
 * agreed does the game ask which to keep, and the other copy stays on this
 * device anyway (storage.js keepAside). Every solo world is kept, not only
 * the one played (Embark leaves worlds to go back to): the ones this device
 * has that the vault hasn't go to the vault, and the ones it lacks come from
 * it, so a browser that forgot everything gets them all back. Nothing is
 * ever deleted.
 *
 * Your character in shared worlds comes along too: the vault keeps the key
 * that is you there (and the worlds it plays in) from the first device that
 * had one, and a linked device that never played a shared world becomes
 * that character. One that has a character of its own is asked once; the
 * one it leaves is kept on it (main.js becomeMe), and sleeps in the world.
 *
 * What it keeps here, per seed: the vault's revision this device's copy
 * matches, and whether it was played since (`dirty`). A world the vault
 * never had counts as played. Everything outside (storage, the network, the
 * game) comes in through createSync's arguments, so Node tests run it. */

import { cleanSoloAnswer, LINK_RE, randomHex } from '../net/protocol.js';

const STORE = 'mte.sync';               // {key, w: {<seed>: {rev, dirty}}, meNo?: the other device's character, declined}
const BEFORE = 'mte.sync.before.';      // a key this device had before a link brought another (kept)
export const PUSH_EVERY = 20_000;       // ms between keeping the world being played
export const IDLE_MS = 30_000;          // unplayed this long, a device asks for the newest before playing on
export const LINK_PLAYED = 60_000;      // a world played less than this stays out of the vault when a device is linked
const WAIT_MS = 15_000;                 // a request gives up after this

// The link that brings `key` to another device: in the fragment, which
// browsers never send to any server.
export function linkUrl(loc, key) {
  return loc.origin + loc.pathname + '#link=' + key;
}

// The key in a #link= fragment, or null.
export function linkFrom(hash) {
  const k = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('link');
  return k && LINK_RE.test(k) ? k : null;
}

/**
 * @param {object} o
 * @param {Storage} o.store            localStorage, or a stand-in
 * @param {Function} o.fetch           fetch, or a stand-in
 * @param {string} o.service           the room service's address
 * @param {() => number} [o.now]
 * @param {() => object|null} o.own    the solo world being played, or null (a shared world, a question open)
 * @param {(s: object) => string} o.serialize
 * @param {(raw: string) => object|null} o.deserialize
 * @param {() => number[]} o.seeds   every solo world on this device
 * @param {(seed: number) => string|null} o.archived  this device's own copy of a world
 * @param {(seed: number, raw: string) => void} o.copy  keeps a world from the vault that isn't played now
 * @param {(seed: number, raw: string) => void} o.aside  keeps a copy that's about to be replaced
 * @param {(s: object) => void} o.replace  plays the world the vault gave
 * @param {(c: {mine: object, other: object|null, keepMine: Function, keepOther: Function}) => void} o.conflict
 * @param {(what: string) => void} [o.said]  'arrived' (a world from your other device), 'full', 'me' (your character)
 * @param {() => {key: string, rooms: string[]}|null} [o.me]  your character, if this device played a shared world
 * @param {(me: {key: string, rooms: string[]}) => void} [o.becomeMe]  plays as that character here (or adds its worlds)
 * @param {() => Promise<boolean>} [o.askMe]  whether to play as your other device's character instead of this one's
 */
export function createSync(o) {
  const now = o.now || Date.now;
  let flight = null;      // the seed a push is under way for: still played, if the game closes now
  let playedInFlight = false; // and whether it was played after its save was taken
  let busy = null;        // the request under way (one at a time)
  let timer = null;       // the next push of the world being played
  let paused = false;     // a question about which copy to keep is open
  let idleCheck = false;  // asking for the newest after an unplayed spell
  let lastPlayed = now();
  let okAt = 0, failed = false, saidFull = false;
  let meAsking = false;   // the question about which character is open

  function load() {
    try {
      const d = JSON.parse(o.store.getItem(STORE));
      if (d && typeof d.key === 'string' && LINK_RE.test(d.key) && d.w && typeof d.w === 'object') return d;
    } catch { /* unreadable: not linked */ }
    return null;
  }
  function keep(d) {
    const copy = structuredClone(d);
    if (flight !== null && copy.w[flight]) copy.w[flight].dirty = true;
    try { o.store.setItem(STORE, JSON.stringify(copy)); } catch { /* full or blocked: kept in the vault next time */ }
  }
  const dirty = (d, seed) => !d.w[seed] || d.w[seed].dirty === true;

  function mark(seed) {
    if (flight === seed) { playedInFlight = true; return; }
    const d = load();
    if (!d || (d.w[seed] && d.w[seed].dirty)) return;
    d.w[seed] = { rev: d.w[seed] ? d.w[seed].rev : 0, dirty: true };
    keep(d);
  }

  async function request(body) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const stop = ctl && setTimeout(() => ctl.abort(), WAIT_MS);
    try {
      const res = await o.fetch(o.service + '/solo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {})
      });
      const a = cleanSoloAnswer(await res.json());
      failed = !a;
      if (a && !a.error) okAt = now();
      return a;
    } catch {
      failed = true;
      return null;
    } finally {
      if (stop) clearTimeout(stop);
    }
  }

  // Keeps world `seed` (its save `raw`) in the vault: `cur` if it's the one
  // played. 'ok', 'conflict' (the question is up), or 'no' (out of reach,
  // refused).
  async function pushRaw(seed, raw, cur) {
    let d = load();
    if (!d) return 'no';
    const base = d.w[seed] ? d.w[seed].rev : 0;
    d.w[seed] = { rev: base, dirty: false };
    flight = seed;
    playedInFlight = false;
    keep(d);
    let a;
    try { a = await request({ t: 'push', key: d.key, seed, base, save: raw, cur }); } finally { flight = null; }
    d = load();
    if (!d) return 'no';
    if (a && a.rev && !a.conflict) {
      d.w[seed] = { rev: a.rev, dirty: playedInFlight };
      keep(d);
      return 'ok';
    }
    d.w[seed] = { rev: base, dirty: true };
    keep(d);
    if (a && a.conflict) { ask(seed, raw, a, cur); return 'conflict'; }
    if (a && a.error === 'full' && !saidFull) { saidFull = true; o.said?.('full'); }
    return 'no';
  }

  // Both devices played world `seed` since they last agreed: the player
  // picks. The copy not picked stays on this device (aside). `play`: the
  // world is (or becomes) the one played; otherwise it's only kept.
  function ask(seed, mineRaw, a, play) {
    const mine = o.deserialize(mineRaw);
    if (!mine) return;
    paused = true;
    o.conflict({
      mine,
      other: o.deserialize(a.save),
      keepMine() {
        paused = false;
        o.aside(seed, a.save);
        const d = load();
        if (!d) return;
        d.w[seed] = { rev: a.rev, dirty: true };
        keep(d);
        // Not the world being played (a copy kept here): play it now.
        const s = o.own();
        if (play && s && s.seed !== seed) o.replace(mine);
        run(() => pushRaw(seed, mineRaw, play));
      },
      keepOther() {
        paused = false;
        if (play) return adopt(seed, a.rev, a.save, mineRaw);
        o.aside(seed, mineRaw);
        took(seed, a.rev, a.save, true);
      }
    });
  }

  // Plays the vault's copy of world `seed`, after keeping this device's copy
  // aside if it differs (`stash`).
  function adopt(seed, rev, save, stash) {
    const s = o.deserialize(save);
    if (!s) return false; // from a newer game: the update brings it
    if (stash && stash !== save) o.aside(seed, stash);
    const d = load();
    if (!d) return false;
    d.w[seed] = { rev, dirty: false };
    keep(d);
    o.replace(s);
    return true;
  }

  // Keeps the vault's copy of world `seed` on this device, not played now;
  // over a copy played here only when the player picked it (`picked`).
  function took(seed, rev, save, picked = false) {
    const d = load();
    if (!d || (d.w[seed]?.dirty && !picked)) return;
    d.w[seed] = { rev, dirty: false };
    keep(d);
    o.copy(seed, save);
  }

  // Your character, each check: this device's goes to the vault (kept if
  // the vault has none, its worlds added if it's the same), and the vault's
  // is taken by a device that has none or, if the player says so, by one
  // that has its own.
  async function character(d) {
    if (!o.me || meAsking) return;
    const mine = o.me();
    const a = await request({ t: 'me', key: d.key, me: mine });
    if (!a || !('me' in a) || !a.me) return; // out of reach, a vault from before characters, or none yet
    if (!mine || mine.key === a.me.key) {
      o.becomeMe(a.me);
      if (!mine) o.said?.('me');
      return;
    }
    const dd = load();
    if (!dd || dd.meNo === a.me.key) return; // said no before
    meAsking = true;
    o.askMe().then((yes) => {
      meAsking = false;
      if (yes) return o.becomeMe(a.me);
      const d2 = load();
      if (d2) { d2.meNo = a.me.key; keep(d2); }
    }, () => { meAsking = false; });
  }

  function run(job) {
    if (busy) return busy.then(() => run(job));
    busy = job().finally(() => { busy = null; });
    return busy;
  }

  // Keeps what this device played, then takes the newest from the vault if
  // another device played since.
  function check() {
    return run(async () => {
      let d = load();
      const s = o.own();
      if (!d || paused || !s) return;
      await character(d);
      // Every other world this device played (or the vault never had).
      for (const seed of new Set([...o.seeds(), ...Object.keys(d.w).map(Number)])) {
        if (seed === s.seed || !dirty(load() || d, seed)) continue;
        const raw = o.archived(seed);
        if (!raw) continue;
        const r = await pushRaw(seed, raw, false);
        if (r === 'conflict' || (r === 'no' && failed)) return;
      }
      if (dirty(d, s.seed) && (await pushRaw(s.seed, o.serialize(s), true)) !== 'ok') return;
      d = load();
      if (!d || !d.w[s.seed]) return;
      const a = await request({ t: 'pull', key: d.key, have: { seed: s.seed, rev: d.w[s.seed].rev } });
      if (!a || a.error) return;
      // Worlds kept there that this device lacks, or has older and hasn't
      // played since: copied here.
      for (const [k, rev] of Object.entries(a.worlds || {})) {
        const seed = Number(k), r = load()?.w[seed];
        if (seed === a.cur || seed === s.seed || (r && (r.dirty || r.rev >= rev))) continue;
        if (!r && o.archived(seed)) continue; // this device's own, not kept yet: pushed next time
        const g = await request({ t: 'get', key: d.key, seed });
        if (g && g.save) took(seed, g.rev, g.save);
      }
      if (a.same) return;
      d = load();
      if (paused || o.own() !== s || !d) return; // the world changed while asking
      if (a.cur === null) { mark(s.seed); return pushRaw(s.seed, o.serialize(s), true); } // the vault has nothing: keep this
      if (dirty(d, s.seed)) return; // played while asking: the next push sorts it out
      if (a.cur !== s.seed && d.w[a.cur]?.dirty) {
        // Your other device plays a world this device played too, unkept.
        const raw = o.archived(a.cur);
        if (raw) return ask(a.cur, raw, { rev: a.rev, save: a.save }, true);
      }
      if (adopt(a.cur, a.rev, a.save, a.cur === s.seed ? null : o.archived(a.cur))) o.said?.('arrived');
    });
  }

  function pushCurrent() {
    clearTimeout(timer);
    timer = null;
    return run(async () => {
      const d = load(), s = o.own();
      if (!d || paused || !s || !dirty(d, s.seed)) return;
      await pushRaw(s.seed, o.serialize(s), true);
    });
  }

  return {
    get linked() { return !!load(); },
    // When the vault last answered (0: not since this page opened), and
    // whether the last try failed.
    get okAt() { return okAt; },
    get failed() { return failed; },
    // The sync key, made now if this device has none (the screen that shows
    // the QR asks for it, then checks: the world being played is kept at once).
    start() {
      let d = load();
      if (!d) { d = { key: randomHex(32), w: {} }; keep(d); }
      return d.key;
    },
    // A link from your other device: plays the world kept there. The world
    // played here is kept in the vault too (if it was played at all) and
    // stays on this device. Returns false if this device already had it.
    async link(key) {
      if (!LINK_RE.test(key)) return false;
      const had = load();
      if (had && had.key === key) return false;
      if (had) try { o.store.setItem(BEFORE + now(), JSON.stringify(had)); } catch { /* full: it goes */ }
      const d = { key, w: {} };
      const s = o.own();
      if (s && !(s.stats && s.stats.playedMs >= LINK_PLAYED)) d.w[s.seed] = { rev: 0, dirty: false };
      keep(d);
      if (s && d.w[s.seed] === undefined) await run(() => pushRaw(s.seed, o.serialize(s), false));
      await check();
      return true;
    },
    check,
    // The game saved: the world being played goes to the vault soon, if it was played.
    saved() {
      const d = load(), s = o.own();
      if (d && s && dirty(d, s.seed) && !timer) timer = setTimeout(pushCurrent, PUSH_EVERY);
    },
    // The game goes to the background: keep it now.
    flush: pushCurrent,
    // The player did something to the world (gathered, built, bought: what
    // the game saves for; opening a menu or the Another device screen isn't
    // playing). After an unplayed spell, the newest comes first.
    played() {
      const t = now(), idle = t - lastPlayed >= IDLE_MS;
      lastPlayed = t;
      const d = load(), s = o.own();
      if (!d || !s || idleCheck || paused) return;
      if (flight === s.seed) return mark(s.seed);
      if (!dirty(d, s.seed)) {
        if (!idle) return mark(s.seed);
        idleCheck = true;
        check().finally(() => {
          idleCheck = false;
          if (o.own() === s) mark(s.seed);
        });
      }
    },
    // The player changed which world they play (a new one, Embark, a
    // backup): that one is played.
    touched() {
      const s = o.own();
      if (s && load()) mark(s.seed);
    }
  };
}
