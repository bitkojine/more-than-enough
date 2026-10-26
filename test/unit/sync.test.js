/* Your own world on two devices (src/game/sync.js), through the room
 * service's real route and vault (server/src/worker.js POST /solo,
 * server/src/vault.js) on a stand-in Durable Object storage
 * (test/support/durable.js). Each device has its own storage and its own
 * game; they share only the vault, as a phone and a Mac do.
 *
 * What must hold: the world played last carries on; a device that wasn't
 * played since it last agreed with the vault takes the newest without a
 * question; only when both played the same world does the player choose,
 * and the copy not chosen is kept on the device anyway; a browser that
 * forgot everything gets the world back by linking again; nothing is ever
 * deleted, and the key itself is never stored by the vault. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { createSync, linkFrom, linkUrl, IDLE_MS, LINK_PLAYED } from '../../src/game/sync.js';
import { registerCloudflare, Storage, start } from '../support/durable.js';

registerCloudflare();
const worker = await import('../../server/src/worker.js');
const { push, pull, vaultName } = await import('../../server/src/vault.js');

const ORIGIN = 'https://play.robertasrudys.com';
const SERVICE = 'https://rooms.example';

// The room service: the worker's own fetch, its Vault objects kept by name
// on storages that outlive them (a restart is a new object, same storage).
function cloud() {
  const storages = new Map();
  let down = false;
  const VAULT = {
    idFromName: (n) => n,
    get: (n) => {
      if (!storages.has(n)) storages.set(n, new Storage());
      const obj = new worker.Vault({ storage: storages.get(n) }, {});
      return obj;
    }
  };
  const env = { VAULT, ALLOWED_ORIGINS: ORIGIN };
  return {
    storages,
    set down(v) { down = v; },
    async fetch(url, init = {}) {
      if (down) throw new TypeError('Failed to fetch');
      const req = new Request(url, { method: init.method, headers: { ...init.headers, Origin: ORIGIN }, body: init.body });
      return worker.default.fetch(req, env);
    }
  };
}

function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    keys: () => [...m.keys()],
    map: m
  };
}

let clock = 1_700_000_000_000;
const now = () => clock;

// A device: its storage, the world it plays, and the sync on it. `asked`
// holds the open which-world question, if any.
function device(service, seed) {
  const store = memoryStore();
  const d = { store, asked: null, said: [] };
  d.state = C.createState(seed ?? (Math.random() * 2 ** 32) >>> 0, { cultivation: true });
  // As storage.js saveGame: the save and the world's own copy.
  d.save = () => {
    const raw = C.serialize(d.state);
    store.setItem('more-than-enough-save', raw);
    store.setItem('mte.solo.world.' + d.state.seed, raw);
    d.sync.saved();
  };
  d.sync = createSync({
    store, fetch: (u, i) => service.fetch(u, i), service: SERVICE, now,
    own: () => (d.asked ? null : d.state),
    serialize: C.serialize, deserialize: C.deserialize,
    seeds: () => store.keys().filter((k) => k.startsWith('mte.solo.world.')).map((k) => Number(k.slice(15))),
    archived: (seed) => store.getItem('mte.solo.world.' + seed),
    copy: (seed, raw) => store.setItem('mte.solo.world.' + seed, raw),
    aside: (seed, raw) => store.setItem('mte.solo.kept.' + seed + '.' + clock, raw),
    replace: (s) => { d.state = s; d.save(); },
    conflict: (c) => { d.asked = c; },
    said: (w) => d.said.push(w)
  });
  // Playing: an action, then some play (gathering, time).
  d.play = (ms = 90_000, mycelium = 5) => {
    d.sync.played();
    d.state.stats.playedMs += ms;
    d.state.time += ms / 1000;
    d.state.inv.mycelium += mycelium;
    d.save();
  };
  // Answers the open question.
  d.pick = (which) => { const c = d.asked; d.asked = null; return which === 'mine' ? c.keepMine() : c.keepOther(); };
  return d;
}

async function linked(service) {
  const mac = device(service), phone = device(service);
  mac.play();
  const key = mac.sync.start();
  await mac.sync.check();
  const url = linkUrl({ origin: ORIGIN, pathname: '/' }, key);
  assert.equal(linkFrom(new URL(url).hash), key, 'the link carries the key');
  assert.equal(await phone.sync.link(key), true);
  return { mac, phone, key };
}

const played = (d) => d.state.stats.playedMs;

test('a linked phone plays the computer\'s world, and its own stays on it', async () => {
  const service = cloud();
  const mac = device(service), phone = device(service);
  mac.play(120_000, 7);
  phone.play(LINK_PLAYED + 1000, 3); // the phone had a world of its own, played a while
  const phoneOwn = phone.state.seed;
  const key = mac.sync.start();
  await mac.sync.check();
  assert.ok(mac.sync.okAt > 0, 'the computer reached the vault');
  assert.equal(await phone.sync.link(key), true);
  assert.equal(phone.state.seed, mac.state.seed, 'the phone plays the computer\'s world');
  assert.equal(phone.state.inv.mycelium, mac.state.inv.mycelium);
  assert.deepEqual(phone.said, ['arrived']);
  assert.ok(phone.store.getItem('mte.solo.world.' + phoneOwn), 'the phone\'s own world is still on the phone');
  // ...and in the vault, without becoming the one played.
  const [storage] = service.storages.values();
  const meta = await storage.get('meta');
  assert.equal(meta.cur, mac.state.seed);
  assert.deepEqual(Object.keys(meta.revs).map(Number).sort(), [mac.state.seed, phoneOwn].sort());
  assert.equal(await phone.sync.link(key), false, 'linking twice changes nothing');
});

test('a world played less than a minute stays out of the vault when a device links', async () => {
  const service = cloud();
  const mac = device(service), phone = device(service);
  mac.play();
  const key = mac.sync.start();
  await mac.sync.check();
  phone.play(5_000);
  await phone.sync.link(key);
  const meta = await [...service.storages.values()][0].get('meta');
  assert.deepEqual(Object.keys(meta.revs).map(Number), [mac.state.seed]);
});

test('whichever device was played last carries on, without a question', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  for (let round = 0; round < 3; round++) {
    clock += IDLE_MS * 2;
    phone.play(60_000, 2);
    await phone.sync.flush();
    await mac.sync.check(); // the Mac comes back to the front
    assert.equal(played(mac), played(phone), 'the Mac took the phone\'s progress');
    assert.equal(mac.asked, null);
    clock += IDLE_MS * 2;
    mac.play(30_000, 4);
    await mac.sync.flush();
    await phone.sync.check();
    assert.equal(played(phone), played(mac), 'and the phone the Mac\'s');
    assert.equal(phone.asked, null);
  }
  assert.equal(phone.state.inv.mycelium, mac.state.inv.mycelium);
});

test('a device left open and untouched takes the newest before it plays on', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  clock += IDLE_MS * 2;
  phone.play(200_000, 9);
  await phone.sync.flush();
  // The Mac sat open all along (no focus change), and is played again.
  clock += IDLE_MS * 2;
  const before = played(mac);
  mac.sync.played();
  await mac.sync.check(); // the check that play started, then nothing new
  assert.equal(played(mac), played(phone), 'the Mac took the phone\'s world first');
  assert.notEqual(played(mac), before);
  assert.equal(mac.asked, null, 'no question: the Mac wasn\'t played since');
  // Its next play is kept over the phone's, as the newest.
  mac.play(10_000, 1);
  await mac.sync.flush();
  await phone.sync.check();
  assert.equal(played(phone), played(mac));
});

test('both devices played the same world: the player picks, and the other copy is kept', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  phone.play(50_000, 1);
  await phone.sync.flush();
  mac.play(80_000, 20); // played without having taken the phone's
  await mac.sync.flush();
  assert.ok(mac.asked, 'the Mac asks which to keep');
  assert.ok(mac.asked.other, 'the other copy is readable');
  const macPlayed = played(mac);
  mac.pick('mine');
  await mac.sync.check();
  assert.equal(played(mac), macPlayed, 'the Mac kept its own');
  const kept = mac.store.keys().filter((k) => k.startsWith('mte.solo.kept.' + mac.state.seed));
  assert.equal(kept.length, 1, 'the phone\'s copy is kept on the Mac');
  assert.equal(C.deserialize(mac.store.getItem(kept[0])).stats.playedMs, played(phone));
  await phone.sync.check();
  assert.equal(played(phone), macPlayed, 'and the phone now plays it');
});

test('picking the other device\'s copy plays it, and keeps this one aside', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  phone.play(50_000, 1);
  await phone.sync.flush();
  mac.play(80_000, 20);
  await mac.sync.flush();
  const mine = played(mac);
  mac.pick('other');
  assert.equal(played(mac), played(phone), 'the Mac plays the phone\'s copy');
  const kept = mac.store.keys().filter((k) => k.startsWith('mte.solo.kept.'));
  assert.equal(C.deserialize(mac.store.getItem(kept[0])).stats.playedMs, mine, 'its own is kept aside');
  // Nothing more to ask: they agree now.
  await mac.sync.check();
  await phone.sync.check();
  assert.equal(mac.asked, null);
  assert.equal(phone.asked, null);
});

test('a new world on one device is the one the other plays next; the old one is kept on both', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  const first = mac.state.seed;
  // The Mac starts a new world (Nerds, New world): picked, so it counts as played.
  mac.state = C.createState(12345, { cultivation: true });
  mac.save();
  mac.sync.touched();
  await mac.sync.flush();
  await phone.sync.check();
  assert.equal(phone.state.seed, 12345);
  assert.ok(phone.store.getItem('mte.solo.world.' + first), 'the first world is still on the phone');
  // The phone goes back to the first one and plays it: the Mac follows.
  phone.state = C.deserialize(phone.store.getItem('mte.solo.world.' + first));
  phone.sync.touched();
  phone.play(10_000);
  await phone.sync.flush();
  await mac.sync.check();
  assert.equal(mac.state.seed, first);
  assert.equal(played(mac), played(phone));
});

test('a world played on this device while another was on top is kept before switching', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  const first = mac.state.seed;
  // The phone, offline, starts a world and plays it; meanwhile the Mac plays the first.
  service.down = true;
  phone.state = C.createState(777, { cultivation: true });
  phone.sync.touched();
  phone.play(70_000);
  await phone.sync.flush();
  service.down = false;
  // The phone switches back to the first world (not touched since).
  phone.state = C.deserialize(phone.store.getItem('mte.solo.world.' + first));
  clock += IDLE_MS * 2;
  mac.play(5_000);
  await mac.sync.flush();
  await phone.sync.check();
  const meta = await [...service.storages.values()][0].get('meta');
  assert.ok(777 in meta.revs, 'the world played offline reached the vault');
  assert.equal(phone.state.seed, first);
  assert.equal(played(phone), played(mac));
});

test('every world a device has goes with it, not only the one played (Embark leaves worlds behind)', async () => {
  const service = cloud();
  const mac = device(service), phone = device(service);
  // The Mac played three worlds before it was ever linked: two left behind.
  const left = [];
  for (const seed of [11, 22]) {
    mac.state = C.createState(seed, { cultivation: true });
    mac.play(30_000, seed);
    left.push(seed);
  }
  mac.state = C.createState(33, { cultivation: true });
  mac.play();
  const key = mac.sync.start();
  await mac.sync.check();
  const revs = (await [...service.storages.values()][0].get('meta')).revs;
  assert.deepEqual(Object.keys(revs).map(Number).sort(), [11, 22, 33], 'all three reached the vault');
  await phone.sync.link(key);
  assert.equal(phone.state.seed, 33);
  for (const seed of left) {
    const raw = phone.store.getItem('mte.solo.world.' + seed);
    assert.ok(raw, 'world ' + seed + ' is on the phone too');
    assert.equal(C.deserialize(raw).inv.mycelium, seed);
  }
  // A world left behind, played again on the Mac, is copied over the phone's older one.
  mac.state = C.deserialize(mac.store.getItem('mte.solo.world.11'));
  mac.sync.touched();
  mac.play(10_000, 100);
  mac.state = C.deserialize(mac.store.getItem('mte.solo.world.33'));
  mac.sync.touched();
  await mac.sync.check();
  await phone.sync.check();
  assert.equal(C.deserialize(phone.store.getItem('mte.solo.world.11')).inv.mycelium, 111);
  assert.equal(phone.state.seed, 33, 'and the phone still plays the one on top');
});

test('a world left behind and played on both: the question keeps the one played now in play', async () => {
  const service = cloud();
  const mac = device(service), phone = device(service);
  mac.state = C.createState(44, { cultivation: true });
  mac.play();
  mac.state = C.createState(55, { cultivation: true });
  mac.play();
  const key = mac.sync.start();
  await mac.sync.check();
  await phone.sync.link(key);
  // Both go back to 44 for a moment, then on to 55; neither has heard of the other.
  for (const d of [mac, phone]) {
    const on = d.state;
    d.state = C.deserialize(d.store.getItem('mte.solo.world.44'));
    d.sync.touched();
    d.play(5_000, d === mac ? 1 : 2);
    d.state = on;
    d.sync.touched();
  }
  await phone.sync.check();
  await mac.sync.check();
  assert.ok(mac.asked, 'the Mac asks about world 44');
  assert.equal(mac.asked.mine.seed, 44);
  mac.pick('other');
  assert.equal(mac.state.seed, 55, 'it keeps playing 55');
  assert.equal(C.deserialize(mac.store.getItem('mte.solo.world.44')).inv.mycelium, 7, 'the phone\'s 44 is the Mac\'s now');
  assert.ok(mac.store.keys().some((k) => k.startsWith('mte.solo.kept.44.')), 'its own 44 is kept aside');
});

test('out of reach: nothing is lost, it goes when the vault is back', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  service.down = true;
  phone.play(40_000, 6);
  await phone.sync.flush();
  assert.equal(phone.sync.failed, true);
  await mac.sync.check();
  assert.notEqual(played(mac), played(phone), 'nothing arrived while down');
  service.down = false;
  await phone.sync.check();
  await mac.sync.check();
  assert.equal(played(mac), played(phone), 'kept once the vault answered');
});

test('a browser that forgot everything gets the world back by linking again', async () => {
  const service = cloud();
  const { mac, phone, key } = await linked(service);
  phone.play(300_000, 30);
  await phone.sync.flush();
  const lost = played(phone);
  // Safari's 7-day cap: every key the site wrote is gone.
  phone.store.clear();
  const fresh = device(service);
  assert.equal(fresh.sync.linked, false);
  await fresh.sync.link(key); // scanned again from the Mac
  assert.equal(played(fresh), lost, 'the phone plays its world again');
  assert.equal(fresh.state.inv.mycelium, phone.state.inv.mycelium);
  await mac.sync.check();
  assert.equal(played(mac), lost);
});

test('a link to another key keeps the key this device had', async () => {
  const service = cloud();
  const { phone } = await linked(service);
  const other = P.randomHex(32);
  await phone.sync.link(other);
  const before = phone.store.keys().filter((k) => k.startsWith('mte.sync.before.'));
  assert.equal(before.length, 1);
  assert.ok(phone.store.getItem(before[0]).includes('"key"'));
});

test('a world played while its push was on the way is pushed again', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  phone.play(10_000);
  const going = phone.sync.flush();
  phone.play(10_000, 1); // played while the push is out
  await going;
  await phone.sync.flush();
  await mac.sync.check();
  assert.equal(played(mac), played(phone));
});

test('a question open or a shared world: sync stands still', async () => {
  const service = cloud();
  const { mac, phone } = await linked(service);
  phone.play();
  await phone.sync.flush();
  mac.asked = { keepMine() {}, keepOther() {} }; // own() is null meanwhile
  const before = played(mac);
  await mac.sync.check();
  assert.equal(played(mac), before);
});

/* -------------------------------------------------------- the vault */

const ask = (seed, base, extra = {}) => ({ t: 'push', key: 'k', seed, base, save: JSON.stringify({ seed, v: 11, ...extra }), cur: true });

test('the vault never writes over a newer copy, and answers with it', async () => {
  const s = new Storage();
  assert.deepEqual(await push(s, ask(5, 0), 1), { rev: 1 });
  assert.deepEqual(await push(s, ask(5, 1, { n: 2 }), 2), { rev: 2 });
  const stale = await push(s, ask(5, 1, { n: 3 }), 3);
  assert.equal(stale.conflict, true);
  assert.equal(stale.rev, 2);
  assert.equal(JSON.parse(stale.save).n, 2, 'the copy kept is the one it answers with');
  assert.equal(JSON.parse((await pull(s, null)).save).n, 2);
  assert.deepEqual(await pull(s, { seed: 5, rev: 2 }), { cur: 5, rev: 2, at: 2, worlds: { 5: 2 }, same: true });
  assert.deepEqual(await pull(new Storage(), null), { cur: null });
});

test('the vault keeps every world; a key that has its most gets no more, and loses none', async () => {
  const s = new Storage();
  for (let seed = 0; seed < P.SOLO.worlds; seed++) assert.ok((await push(s, ask(seed, 0), seed)).rev);
  assert.deepEqual(await push(s, ask(P.SOLO.worlds + 7, 0), 1), { error: 'full' });
  assert.equal(Object.keys((await s.get('meta')).revs).length, P.SOLO.worlds);
  for (let seed = 0; seed < P.SOLO.worlds; seed++) assert.ok(await s.get('w:' + seed), 'world ' + seed + ' still there');
  assert.ok((await push(s, ask(3, 1), 100)).rev, 'worlds it has still save');
});

test('a world kept but not played now leaves the played one on top', async () => {
  const s = new Storage();
  await push(s, ask(1, 0), 1);
  await push(s, { ...ask(2, 0), cur: false }, 2);
  assert.equal((await pull(s, null)).cur, 1);
});

test('the route: only the game, only clean requests, and the key never stored', async () => {
  const service = cloud();
  const key = P.randomHex(32);
  const post = (body, origin = ORIGIN) => worker.default.fetch(new Request(SERVICE + '/solo', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), { VAULT: { idFromName: (n) => n, get: () => new worker.Vault({ storage: s }, {}) }, ALLOWED_ORIGINS: ORIGIN });
  const s = new Storage();
  const save = JSON.stringify({ seed: 9, v: 11 });
  assert.equal((await post({ t: 'push', key, seed: 9, base: 0, save }, 'https://evil.example')).status, 403);
  assert.equal((await post({ t: 'push', key: 'short', seed: 9, base: 0, save })).status, 400);
  assert.equal((await post({ t: 'push', key, seed: 9, base: 0, save: JSON.stringify({ seed: 10 }) })).status, 400, 'a save names its own seed');
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('x'.repeat(P.SOLO.bytes + 2048))).status, 413);
  const ok = await post({ t: 'push', key, seed: 9, base: 0, save });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { rev: 1 });
  const got = await (await post({ t: 'pull', key })).json();
  assert.equal(got.save, save);
  assert.ok(!JSON.stringify([...s.data]).includes(key), 'the key is not in storage');
  assert.match(await vaultName(key), /^solo\|[0-9a-f]{64}$/);
  assert.ok(!(await vaultName(key)).includes(key));
  void service;
});

test('answers that don\'t fit are refused by the game', () => {
  assert.equal(P.cleanSoloAnswer(null), null);
  assert.equal(P.cleanSoloAnswer({ cur: 5, rev: 1, save: JSON.stringify({ seed: 6 }) }), null, 'a save for another seed');
  assert.equal(P.cleanSoloAnswer({ rev: 0 }), null);
  assert.deepEqual(P.cleanSoloAnswer({ cur: null, extra: 1 }), { cur: null });
  assert.deepEqual(P.cleanSoloAnswer({ error: 'full' }), { error: 'full' });
  assert.equal(linkFrom('#link=abc'), null);
  assert.equal(linkFrom('#join=x.y'), null);
});
