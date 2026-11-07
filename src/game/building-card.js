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
import { esc, fmtRate, lockIcon } from './format.js';
import { pic, price, icon } from './sheet-rows.js';
import { reachOf } from './reach.js';
import { describeLight } from './light-info.js';

const name = (k) => t('cr.' + k);
const near = (s, x, y) => Core.atInteraction(s, x, y);
const act = (type, x, y, label, cost = null) => ({ type, x, y, label, cost });
// One of your buildings: what it makes, what it helps or what helps it, and Move.
function extractorCard(s, e) {
  const def = Core.EXTRACTORS[e.key],
    lines = [];
  if (Core.contentLocked(s, e.key))
    return {
      look: 'building.' + e.key,
      name: esc(def.name),
      lines: [
        lockIcon + ' ' + t('progression.requirement'),
        t('cr.buffer', { n: e.buffer.toFixed(1) })
      ],
      actions: [],
      building: e,
      key: e.key
    };
  if (def.rate > 0) lines.push(`+${fmtRate(Core.extractorRate(s, e.key, e))} ${icon(def.res)}/s`);
  const reach = reachOf(s, { key: e.key, x: e.x, y: e.y, z: e.z, building: e });
  if (e.key === 'stoneworks') lines.push(t('card.doubling', { count: reach.targets.length }));
  if (e.key === 'depot') lines.push(t('card.collecting', { count: reach.targets.length }));
  if (Core.supportMult(s, e) > 1) lines.push(t('card.doubled'));
  if (Core.usesDepots(s) && Core.depotFor(s, e)) lines.push(t('card.collected'));
  const actions = s.shared && !s.roomMoves ? [] : [act('move', e.x, e.y, t('card.move'))];
  return {
    look: 'building.' + e.key,
    name: esc(def.name),
    lines,
    actions,
    building: e,
    key: e.key,
    work: true
  };
}

// What the card for tile (x, y) on your layer shows, or null if nothing
// there has a card. Pure: reads the state, changes nothing. One of your
// old-economy buildings first, then in a crystal world: a crystal building,
// the heart's hiding place, a placed light, a wild colony.
export function cardAt(s, x, y) {
  const c = s.cultivation,
    z = s.player.z;
  if (!Core.isExplored(s.world, x, y, z)) return null;
  const e = Core.extractorAt(s, x, y, z);
  if (e && (!e.owner || e.owner === s.me)) return extractorCard(s, e);
  if (!c) return null;
  const at = { s, c, x, y, z, h: c.heart };
  const b = Core.cultivationAt(s, x, y, z);
  if (b) return facilityCard({ ...at, b });
  const theirs = Core.theirsAt(s, x, y, z);
  if (theirs) return theirsCard({ ...at, b: theirs });
  if (Core.heartAt(s, x, y)) return stationCard(at);
  const key = Core.packKey(x, y, z);
  if (Core.PROPS[s.world.props.get(key)]?.light) return lightCard({ ...at, key });
  if (Core.wildColony(s, x, y)) return wildCard(at);
  return null;
}

const move = ({ x, y }) => act('move', x, y, t('card.move'));
const withLocks = (s, actions) =>
  actions.map((a) => ({ ...a, locked: Core.contentLocked(s, a.type) }));

// A crystal building: locked, or by its kind.
function facilityCard(at) {
  const { s, b } = at;
  const card = Core.contentLocked(s, b.kind)
    ? lockedCard(at)
    : b.kind === 'shelter'
      ? shelterCard(at)
      : b.kind === 'bench'
        ? benchCard(at)
        : workingCard(at);
  return { ...card, building: b, kind: b.kind };
}

function lockedCard({ b, h, x, y }) {
  return {
    look: Core.CULTIVATION_LOOK[b.kind],
    name: name(b.kind),
    lines: [lockIcon + ' ' + t('progression.requirement'), name(b.kind + '.desc')],
    actions:
      b.kind === 'shelter' && h?.where === b.id ? [act('heart', x, y, name('heart.take'))] : []
  };
}

// A heart shelter: take the heart from it or rest it there, and after the
// win, a teleport home.
function shelterCard(at) {
  const { c, b, h, x, y } = at;
  const what = h?.where === b.id ? 'heart.take' : h?.where === 'carried' ? 'heart.rest' : '';
  return {
    look: Core.CULTIVATION_LOOK.shelter,
    name: name('shelter'),
    lines: [name('shelter.desc')],
    actions: [
      ...(what ? [act('heart', x, y, name(what))] : []),
      ...(c.completed ? [act('teleport', x, y, name('teleport.home'))] : []),
      move(at)
    ]
  };
}

// The camp's carrier bench: line the carrier once (Watch, 2026-11-01).
function benchCard(at) {
  const { c, x, y } = at;
  const lined = c.gear.lining;
  return {
    look: Core.CULTIVATION_LOOK.bench,
    name: name('bench'),
    lines: [name(lined ? 'lined' : 'bench.desc')],
    actions: [
      ...(lined ? [] : [act('line', x, y, name('line'), Core.CULTIVATION_RECIPES.lining)]),
      move(at)
    ]
  };
}

// A chamber, vault, machine, cooler and the rest: how it is, and its work.
function workingCard(at) {
  const { c, b } = at;
  return {
    look: Core.CULTIVATION_LOOK[b.kind],
    name: name(b.kind === 'machine' && c.completed ? 'machine.awake' : b.kind),
    lines: facilityLines(at),
    actions: facilityActions(at)
  };
}

function facilityLines({ s, c, b, x, y, z }) {
  const lines = [
    name(Core.cultivationStatus(s, b)),
    t('cr.temperature', { n: b.temperature.toFixed(1) }),
    t('cr.buffer', { n: b.buffer.toFixed(1) }) +
      ' · ' +
      t('cr.quality', { n: Math.floor(b.quality) })
  ];
  const machine = b.kind === 'machine';
  if (machine)
    lines.push(
      t('cr.sections', { n: Core.machineSections(b), total: Core.MACHINE_REPAIRS.length })
    );
  if (b.health !== undefined) lines.push(t('cr.health', { n: Math.floor(b.health) }));
  if (['chamber', 'vault', 'machine'].includes(b.kind)) lines.push(describeLight(s, x, y, z, true));
  if (machine && c.restored && !c.completed) lines.push(name('discovery.' + Core.machineClue(s)));
  if (machine && c.completed) lines.push(name('activated'), name('thief.clue'));
  if (b.kind === 'cooler') {
    const count = reachOf(s, { kind: 'cooler', x, y, z, building: b }).targets.length;
    lines.push(t('card.cooling', { count }));
  }
  return lines;
}

// What each kind of building can be asked to do, before what's done already.
const WORK = {
  chamber: () => ['plant', 'tend', 'collect', 'reinforce'],
  vault: () => ['collect', 'store', 'reinforce'],
  machine: (b, c) => (Core.machineRepairCost(b) ? ['repair'] : c.completed ? [] : ['activate'])
};
const DONE = {
  reinforce: (b) => b.reinforced,
  plant: (b) => b.health > 0,
  tend: (b) => !b.needsTend
};

function facilityActions(at) {
  const { s, c, b, x, y } = at;
  const work = (WORK[b.kind]?.(b, c) || []).filter((a) => !DONE[a]?.(b));
  const cost = (a) =>
    a === 'repair' ? Core.machineRepairCost(b) : Core.CULTIVATION_RECIPES[a] || null;
  const actions = withLocks(
    s,
    work.map((a) => act(a, x, y, name(a), cost(a)))
  );
  // Where to: the map, where every heart shelter is a stop (Watch, 2026-11-01).
  if (b.kind === 'machine' && c.completed && Core.teleportStops(s).length)
    actions.push(act('travel', x, y, name('teleport.pick')));
  if (Core.BUILT_FACILITIES.includes(b.kind)) actions.push(move(at));
  return actions;
}

// Someone else's crystal building: tend or harvest it, as yours (0.200.0).
function theirsCard(at) {
  const { s, b, x, y } = at;
  const can = (j) => Core.SHARED_JOBS[j].includes(b.kind);
  const jobs = ['tend', 'collect'].filter(can);
  const actions = withLocks(
    s,
    jobs.map((j) => act(j, x, y, name(j), Core.CULTIVATION_RECIPES[j] || null))
  );
  if (can('move')) actions.push(move(at));
  return {
    look: Core.CULTIVATION_LOOK[b.kind],
    name: name(b.kind),
    lines: [t('card.theirs')],
    actions,
    building: b,
    kind: b.kind
  };
}

// Where the thief hid the heart.
function stationCard({ h, x, y }) {
  return {
    look: Core.CULTIVATION_LOOK.station,
    name: name('station'),
    lines: [name('station.desc')],
    actions: h?.where === 'station' ? [act('heart', x, y, name('heart.take'))] : []
  };
}

// A light-giving prop: cover it (paid once) or uncover it.
function lightCard({ s, c, x, y, key }) {
  const covered = !!c.shaded?.[key],
    paid = c.shaded && key in c.shaded;
  const label = t(covered ? 'cr.uncover' : 'cr.cover');
  return {
    look: 'mark.' + s.world.props.get(key),
    name: esc(Core.PROPS[s.world.props.get(key)].name),
    lines: [],
    actions: withLocks(s, [act('shade', x, y, label, paid ? null : Core.CULTIVATION_RECIPES.shade)])
  };
}

function wildCard({ s, x, y, z }) {
  return {
    look: 'tile.geode',
    slot: 'top',
    name: name('wild'),
    lines: [describeLight(s, x, y, z)],
    actions: [act('starter', x, y, name('gather'))]
  };
}

export function createBuildingCard({ cam, state, run, approach, walking, work }) {
  const el = document.createElement('div');
  el.id = 'buildingCard';
  el.className = 'bcard';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  document.body.append(el);
  let open = null; // { x, y, z } of the building whose card is up
  let pending = null; // one tapped out of reach: open on arrival
  let shown = '';

  function render() {
    const s = state(),
      card = open && cardAt(s, open.x, open.y);
    if (!card || s.player.z !== open.z || !near(s, open.x, open.y)) return close();
    const html =
      `<div class="bc-head">${pic(card.look, card.slot || 'image')}<strong>${card.name}</strong></div>` +
      (card.lines.length ? `<p>${card.lines.join('<br>')}</p>` : '') +
      (card.actions.length
        ? '<div class="bc-acts">' +
          card.actions
            .map(
              (a, i) =>
                `<div class="bc-act"><button type="button" class="${i ? 'alt' : ''}" data-i="${i}" data-type="${a.type}"${a.locked || (a.cost && !Core.canAfford(s.inv, a.cost)) ? ' disabled' : ''}>${a.locked ? lockIcon : ''}${a.label}</button>${a.locked ? '<small>' + t('progression.requirement') + '</small>' : a.cost ? price(s.inv, a.cost) : ''}</div>`
            )
            .join('') +
          '</div>'
        : '');
    if (html !== shown) {
      el.innerHTML = html;
      shown = html;
    }
    el.hidden = false;
    // Over the building, between the top bar and the thumb buttons (never
    // over either; it scrolls on a small screen), below it if there's no room.
    const roof = (document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const floor =
      Math.min(
        innerHeight,
        ...[...document.querySelectorAll('#thumbDock .btn')]
          .filter((b) => !b.hidden)
          .map((b) => b.getBoundingClientRect().top)
      ) - 12;
    el.style.maxHeight = Math.max(120, floor - roof) + 'px';
    const p = cam.project(open.x + 0.5, open.y, open.z),
      w = el.offsetWidth,
      hgt = el.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 80, p.x - w / 2));
    const above = p.y - cam.tilePx * 1.3 - hgt; // clear of the tallest building's art
    const below = cam.project(open.x + 0.5, open.y + 1, open.z).y + 8;
    const top = above >= roof ? above : Math.max(roof, Math.min(floor - hgt, below));
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }
  function close() {
    if (!open) return false;
    open = null;
    shown = '';
    el.hidden = true;
    return true;
  }

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn || !open) return;
    const card = cardAt(state(), open.x, open.y),
      a = card?.actions[Number(btn.dataset.i)];
    if (a) run({ type: a.type, x: a.x, y: a.y });
    // A teleport, or choosing one on the map, leaves the card behind.
    if (a?.type === 'teleport' || a?.type === 'travel') close();
    else render();
  });

  return {
    get open() {
      return !!open;
    },
    // A tap on the map: true if it opened or closed a card, 'work' if it
    // opened one whose building the tap should also work (collect from). One
    // out of reach is remembered and left to the ordinary tap, which walks
    // you there.
    tap(sx, sy) {
      const s = state(),
        w = cam.unproject(sx, sy),
        x = Math.floor(w.x),
        y = Math.floor(w.y);
      const card = cardAt(s, x, y);
      if (!card) {
        pending = null;
        close();
        return false;
      }
      if (open && open.x === x && open.y === y) {
        close();
        return card.work ? 'work' : true;
      }
      // One of your buildings: its card, and its goods collected as before.
      if (near(s, x, y)) {
        if (approach) approach(x, y, () => true);
        pending = null;
        open = { x, y, z: s.player.z };
        render();
        return card.work ? 'work' : true;
      }
      close();
      pending = { x, y, z: s.player.z };
      if (approach) {
        if (
          !approach(x, y, () => {
            if (pending) {
              open = pending;
              pending = null;
              render();
              if (cardAt(state(), x, y)?.work) work?.(x, y);
            }
            return true;
          })
        )
          pending = null;
        return true;
      }
      return false;
    },
    // Opens the card of tile (x, y) if it has one in reach (for the tests).
    openAt(x, y) {
      const s = state();
      if (!cardAt(s, x, y) || !near(s, x, y)) return false;
      open = { x, y, z: s.player.z };
      render();
      return true;
    },
    // The building whose card is up, for its reach on the map.
    focus() {
      if (!open) return null;
      const card = cardAt(state(), open.x, open.y);
      return card?.building
        ? {
            key: card.key,
            kind: card.kind,
            x: open.x,
            y: open.y,
            z: open.z,
            building: card.building
          }
        : null;
    },
    // The building whose card is up (to move it), or null.
    building() {
      return open ? (cardAt(state(), open.x, open.y)?.building ?? null) : null;
    },
    tick() {
      const s = state();
      if (pending && (s.player.z !== pending.z || (walking && !walking()))) pending = null;
      if (pending && near(s, pending.x, pending.y)) {
        open = pending;
        pending = null;
      }
      if (open) render();
    },
    close
  };
}
