/* A building's own card (Watch, 2026-10-25): tapping one of your
 * buildings, a chamber, vault, machine, shelter, hiding place, placed light
 * or wild colony beside you pops a small card over it with how it is and
 * what you can do with it, the main thing green. Build only places things;
 * this is where a building's actions live, Move among them (Watch,
 * 2026-10-26; in a shared world once its room checks moves). While a card is up, what its
 * building reaches and helps shows on the map (reach.js). Tapping one out of
 * reach walks you there and opens its card on arrival; walking away, tapping
 * elsewhere or Back closes it. The rules are the core's; this only shows them. */
import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';
import { esc, fmtRate } from './format.js';
import { pic, price, icon } from './sheet.js';
import { reachOf } from './reach.js';
import {describeLight} from './light-info.js';

const name = (k) => t('cr.' + k);
const near = (s, x, y) => Core.atInteraction(s,x,y);
const act = (type, x, y, label, cost = null) => ({ type, x, y, label, cost });

// One of your buildings: what it makes, what it helps or what helps it, and Move.
function extractorCard(s, e) {
  const def = Core.EXTRACTORS[e.key], lines = [];
  if (def.rate > 0) lines.push(`+${fmtRate(Core.extractorRate(s, e.key, e))} ${icon(def.res)}/s`);
  const reach = reachOf(s, { key: e.key, x: e.x, y: e.y, z: e.z, building: e });
  if (e.key === 'stoneworks') lines.push(t('card.doubling', { count: reach.targets.length }));
  if (e.key === 'depot') lines.push(t('card.collecting', { count: reach.targets.length }));
  if (Core.supportMult(s, e) > 1) lines.push(t('card.doubled'));
  if (Core.usesDepots(s) && Core.depotFor(s, e)) lines.push(t('card.collected'));
  const actions = s.shared && !s.roomMoves ? [] : [act('move', e.x, e.y, t('card.move'))];
  return { look: 'building.' + e.key, name: esc(def.name), lines, actions, building: e, key: e.key, work: true };
}

// What the card for tile (x, y) on your layer shows, or null if nothing
// there has a card. Pure: reads the state, changes nothing.
export function cardAt(s, x, y) {
  const c = s.cultivation, z = s.player.z;
  if (!Core.isExplored(s.world, x, y, z)) return null;
  const e = Core.extractorAt(s, x, y, z);
  if (e && (!e.owner || e.owner === s.me)) return extractorCard(s, e);
  if (!c) return null;
  const h = c.heart, b = Core.cultivationAt(s, x, y, z);
  if (b && b.kind === 'shelter') {
    const what = h?.where === b.id ? 'heart.take' : h?.where === 'carried' ? 'heart.rest' : '';
    return { look: Core.CULTIVATION_LOOK.shelter, name: name('shelter'), lines: [name('shelter.desc')], actions: [...(what ? [act('heart', x, y, name(what))] : []), act('move', x, y, t('card.move'))], building: b, kind: b.kind };
  }
  if (b) {
    const lines = [name(Core.cultivationStatus(s, b)), t('cr.temperature', { n: b.temperature.toFixed(1) }), t('cr.buffer', { n: b.buffer.toFixed(1) }) + ' · ' + t('cr.quality', { n: Math.floor(b.quality) })];
    if (b.kind === 'machine') lines.push(t('cr.sections', { n: Core.machineSections(b), total: Core.MACHINE_REPAIRS.length }));
    if (b.health !== undefined) lines.push(t('cr.health', { n: Math.floor(b.health) }));
    const shuttered = ['chamber', 'vault', 'machine'].includes(b.kind);
    if (shuttered) lines.push(name(b.closed ? 'closed' : 'opened'));
    if(shuttered)lines.push(describeLight(s,x,y,z,b.closed));
    if (b.kind === 'machine' && c.restored) lines.push(name('discovery.' + Core.machineClue(s)));
    if (b.kind === 'machine' && c.completed) lines.push(name('activated'));
    const acts = b.kind === 'chamber' ? ['plant', 'tend', 'collect', 'reinforce'] : b.kind === 'vault' ? ['collect', 'store', 'reinforce']
      : b.kind === 'machine' ? (Core.machineRepairCost(b) ? ['repair'] : c.completed ? [] : ['activate']) : [];
    const actions = acts.filter((a) => !(a === 'reinforce' && b.reinforced) && !(a === 'plant' && b.health > 0) && !(a === 'tend' && !b.needsTend))
      .map((a) => act(a, x, y, name(a), a === 'repair' ? Core.machineRepairCost(b) : Core.CULTIVATION_RECIPES[a] || null));
    if (shuttered) actions.push(act('shutter', x, y, name(b.closed ? 'shutter.open' : 'shutter.close')));
    if (Core.BUILT_FACILITIES.includes(b.kind)) actions.push(act('move', x, y, t('card.move')));
    if (b.kind === 'cooler') lines.push(t('card.cooling', { count: reachOf(s, { kind: 'cooler', x, y, z, building: b }).targets.length }));
    return { look: Core.CULTIVATION_LOOK[b.kind], name: name(b.kind), lines, actions, building: b, kind: b.kind };
  }
  if (Core.heartAt(s, x, y)) return { look: Core.CULTIVATION_LOOK.station, name: name('station'), lines: [name('station.desc')], actions: h?.where === 'station' ? [act('heart', x, y, name('heart.take'))] : [] };
  const key = Core.packKey(x, y, z), prop = Core.PROPS[s.world.props.get(key)];
  if (prop?.light) {
    const covered = !!c.shaded?.[key], paid = c.shaded && key in c.shaded;
    return { look: 'mark.' + s.world.props.get(key), name: esc(prop.name), lines: [], actions: [act('shade', x, y, t(covered ? 'cr.uncover' : 'cr.cover'), paid ? null : Core.CULTIVATION_RECIPES.shade)] };
  }
  if (Core.wildColony(s, x, y)) return { look: 'tile.geode', slot: 'top', name: name('wild'), lines: [describeLight(s,x,y,z)], actions: [act('starter', x, y, name('gather'))] };
  return null;
}

export function createBuildingCard({ cam, state, run, approach, walking, work }) {
  const el = document.createElement('div');
  el.id = 'buildingCard'; el.className = 'bcard'; el.hidden = true;
  el.setAttribute('role', 'dialog');
  document.body.append(el);
  let open = null;     // { x, y, z } of the building whose card is up
  let pending = null;  // one tapped out of reach: open on arrival
  let shown = '';

  function render() {
    const s = state(), card = open && cardAt(s, open.x, open.y);
    if (!card || s.player.z !== open.z || !near(s, open.x, open.y)) return close();
    const html = `<div class="bc-head">${pic(card.look, card.slot || 'image')}<strong>${card.name}</strong></div>` +
      (card.lines.length ? `<p>${card.lines.join('<br>')}</p>` : '') +
      (card.actions.length ? '<div class="bc-acts">' + card.actions.map((a, i) =>
        `<div class="bc-act"><button type="button" class="${i ? 'alt' : ''}" data-i="${i}" data-type="${a.type}"${a.cost && !Core.canAfford(s.inv, a.cost) ? ' disabled' : ''}>${a.label}</button>${a.cost ? price(s.inv, a.cost) : ''}</div>`).join('') + '</div>' : '');
    if (html !== shown) { el.innerHTML = html; shown = html; }
    el.hidden = false;
    // Over the building, between the top bar and the thumb buttons (never
    // over either; it scrolls on a small screen), below it if there's no room.
    const roof = (document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const floor = Math.min(innerHeight, ...[...document.querySelectorAll('#thumbDock .btn')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect().top)) - 12;
    el.style.maxHeight = Math.max(120, floor - roof) + 'px';
    const p = cam.project(open.x + 0.5, open.y, open.z), w = el.offsetWidth, hgt = el.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 80, p.x - w / 2));
    const above = p.y - cam.tilePx * 1.3 - hgt;   // clear of the tallest building's art
    const below = cam.project(open.x + 0.5, open.y + 1, open.z).y + 8;
    const top = above >= roof ? above : Math.max(roof, Math.min(floor - hgt, below));
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }
  function close() {
    if (!open) return false;
    open = null; shown = ''; el.hidden = true;
    return true;
  }

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn || !open) return;
    const card = cardAt(state(), open.x, open.y), a = card?.actions[Number(btn.dataset.i)];
    if (a) run({ type: a.type, x: a.x, y: a.y });
    render();
  });

  return {
    get open() { return !!open; },
    // A tap on the map: true if it opened or closed a card, 'work' if it
    // opened one whose building the tap should also work (collect from). One
    // out of reach is remembered and left to the ordinary tap, which walks
    // you there.
    tap(sx, sy) {
      const s = state(), w = cam.unproject(sx, sy), x = Math.floor(w.x), y = Math.floor(w.y);
      const card = cardAt(s, x, y);
      if (!card) { pending = null; close(); return false; }
      if (open && open.x === x && open.y === y) { close(); return card.work ? 'work' : true; }
      // One of your buildings: its card, and its goods collected as before.
      if (near(s, x, y)) { if(approach)approach(x,y,()=>true); pending = null; open = { x, y, z: s.player.z }; render(); return card.work ? 'work' : true; }
      close(); pending = { x, y, z: s.player.z };
      if(approach){if(!approach(x,y,()=>{if(pending){open=pending;pending=null;render();if(cardAt(state(),x,y)?.work)work?.(x,y);}return true;}))pending=null;return true;}
      return false;
    },
    // Opens the card of tile (x, y) if it has one in reach (for the tests).
    openAt(x, y) {
      const s = state();
      if (!cardAt(s, x, y) || !near(s, x, y)) return false;
      open = { x, y, z: s.player.z }; render();
      return true;
    },
    // The building whose card is up, for its reach on the map.
    focus() {
      if (!open) return null;
      const card = cardAt(state(), open.x, open.y);
      return card?.building ? { key: card.key, kind: card.kind, x: open.x, y: open.y, z: open.z, building: card.building } : null;
    },
    // The building whose card is up (to move it), or null.
    building() { return open ? cardAt(state(), open.x, open.y)?.building ?? null : null; },
    tick() {
      const s = state();
      if (pending && (s.player.z !== pending.z || walking && !walking())) pending = null;
      if (pending && near(s, pending.x, pending.y)) { open = pending; pending = null; }
      if (open) render();
    },
    close
  };
}
