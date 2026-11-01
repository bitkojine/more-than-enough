/* The rows the bottom sheet (sheet.js) and the building cards are made of:
 * a picture, a name, a line under it and a button, as HTML from the game's
 * own words and numbers (never a player's). Upgrade rows, crystal-world
 * rows, prices and locks. Pure apart from the pack the pictures come from
 * (`useLook`), so tests render them under Node. */

import * as Core from '../core/index.js';
import { fmt, fmtMult, esc, lockIcon } from './format.js';
import { iconHtml } from './look/look.js';
import { t } from '../i18n/i18n.js';

// Set by createSheet: pictures come from the game's pack.
let look = null;
export const pic = (id, slot, level = null) => iconHtml(look, id, 'ico', slot, level);
export const icon = (res) => pic(Core.resourceLook(res));
export const insight = () => pic('resource.insight');

// A price, as what you still have to gather: one pill per resource, picture
// first, after a "Still need" label. Short of a resource, its pill shows how
// much more you need; one you already have enough of shows a tick. Once you
// can pay it all, the label goes and the pills show what it will cost. `have` and `cost` are keyed by resource (or 'insight').
export function price(have, cost) {
  const keys = Object.keys(cost);
  const ready = keys.every((r) => have[r] >= cost[r]);
  const pill = (r, text, cls) => {
    const id = r === 'insight' ? 'resource.insight' : Core.resourceLook(r);
    return `<span class="amt ${cls}" style="--res:${look.color(id)}">${pic(id)}<span class="n">${text}</span></span>`;
  };
  return (
    `<span class="price ${ready ? 'ready' : 'short'}">` +
    (ready ? '' : `<span class="still">${t('sheet.stillNeed')}</span>`) +
    keys
      .map((r) => {
        if (ready) return pill(r, fmt(cost[r]), 'cost');
        const short = Math.ceil(cost[r] - have[r]);
        return short > 0 ? pill(r, fmt(short), 'need') : pill(r, '✓', 'met');
      })
      .join('') +
    '</span>'
  );
}

export function row(rowIcon, name, sub, button) {
  return (
    `<div class="row"><div class="ic">${rowIcon}</div>` +
    `<div class="main"><div class="nm">${name}</div><div class="sub">${sub}</div></div>${button}</div>`
  );
}

export function button(attrs, label, enabled) {
  return `<button class="buy" ${attrs}${enabled ? '' : ' disabled'}>${label}</button>`;
}

export const doneButton = (label) => `<button class="buy max" disabled>${label}</button>`;
export const arrow = (from, to) => `${from} → <span class="ok">${to}</span>`;

/* ------------------------------------------------------ upgrade rows */

// What a tool level opens (see Core.toolOpens), in a few words.
const doorName = (d) => t('door.' + d.id, { n: d.layer });

// The numbers for each kind of upgrade, and its button label.
const DESCRIBE = {
  tool(s, id) {
    const levels = Core.TOOLS[id].levels;
    const lv = Math.max(1, s.tools[id]);
    const head =
      s.tools[id] === 0 ? t('sheet.notCrafted') : t('sheet.levelOf', { lv, max: levels.length });
    if (lv >= levels.length) return { sub: head };
    const cur = levels[lv - 1],
      next = levels[lv];
    const effect =
      next.yield !== undefined
        ? arrow(cur.yield, next.yield)
        : arrow('&times;' + cur.mult, '&times;' + next.mult);
    const doors = Core.toolOpens(id, lv + 1);
    const opens = doors.length
      ? `<br><span class="ok">${t('sheet.opens', { what: doors.map(doorName).join(', ') })}</span>`
      : '';
    return { sub: `${head} &middot; ${effect}${opens}`, label: t('sheet.craft') };
  },
  resup(s, res) {
    const levels = Core.REFINERIES[res].levels;
    const lv = s.resUp[res];
    const mult = Core.refineryMult(s, res);
    const head = t('sheet.levelOf', { lv, max: levels.length });
    if (lv >= levels.length) return { sub: `${head} &middot; &times;${fmtMult(mult)}` };
    return {
      sub: `${head} &middot; ${arrow('&times;' + fmtMult(mult), '&times;' + fmtMult(mult * levels[lv].mult))}`,
      label: t('sheet.refine')
    };
  },
  abundance(s) {
    const lv = s.abundanceLv;
    return {
      sub: `${t('sheet.level', { lv })} &middot; +${lv}/s &middot; &times;${fmtMult(Core.abundanceMult(s))}`,
      label: lv === 0 ? t('sheet.buildIt') : t('sheet.level', { lv: lv + 1 })
    };
  },
  unlock() {
    return { sub: '', label: t('sheet.unlock') };
  },
  perk(s, id) {
    const lv = s.perks[id];
    const repeat = Core.PERKS[id].repeat;
    return {
      sub: repeat && lv ? t('sheet.level', { lv }) : '',
      label: repeat && lv ? t('sheet.level', { lv: lv + 1 }) : t('sheet.buy')
    };
  }
};

export function upgradeRow(s, id) {
  if (Core.toolPurchaseLocked(s, id))
    return lockedRow(
      'tool.' + id,
      'icon',
      Core.TOOLS[id].name + (id === 'basket' ? '' : ' · ' + t('progression.furtherUpgrades')),
      Core.TOOLS[id].desc
    );
  const u = Core.UPGRADES[id];
  const artwork = pic(
    u.look,
    'icon',
    u.kind === 'tool' && ['basket', 'pickaxe', 'boots'].includes(id)
      ? Math.max(0, Math.min(s.tools[id] - 1, Core.TOOLS[id].levels.length - 2))
      : null
  );
  const d = DESCRIBE[u.kind](s, id);
  if (u.retired) return row(artwork, esc(u.name), d.sub, doneButton(t('sheet.retired')));
  const name = esc(u.name) + (u.kind === 'resup' ? ` <span class="tag">${icon(id)}</span>` : '');
  const cost = Core.upgradeCost(s, id);
  if (cost === null)
    return row(artwork, name, d.sub, doneButton(t(u.max === 1 ? 'sheet.owned' : 'sheet.max')));
  const affordable = Core.canBuy(s, id);
  const tag =
    u.currency === 'insight'
      ? price({ insight: s.insight }, { insight: cost })
      : price(s.inv, cost);
  return row(
    artwork,
    name,
    d.sub ? d.sub + '<br>' + tag : tag,
    button(`data-kind="${u.kind}" data-id="${id}"`, d.label, affordable)
  );
}

// Beyond (embarking and perks) stays out of sight until a world is
// mastered, every upgrade done; after the first Embark it stays. Never in a
// shared world, which has no Embark (perks you have still work there).
export const beyondUnlocked = (s) =>
  !s.shared && (s.insight > 0 || s.prestiges > 0 || Core.canEmbark(s));

/* ------------------------------------------------- crystal-world rows */

export const crystalName = (k) => t('cr.' + k);
// Craft and Place are greyed out until you can pay for the thing (Watch,
// 2026-10-26): a button that looks ready must be ready.
function crystalButton(s, type, kind, label) {
  const p = s.player;
  return button(
    `data-kind="cultivation" data-action="${type}" data-id="${kind}" data-x="${Math.floor(p.x)}" data-y="${Math.floor(p.y)}"`,
    label,
    Core.canAfford(s.inv, Core.CULTIVATION_RECIPES[kind])
  );
}
export function lockedRow(lookId, slot, name, purpose) {
  return row(
    pic(lookId, slot),
    esc(name),
    esc(purpose) +
      '<br><span class="unlockRequirement">' +
      t('progression.requirement') +
      '</span>',
    `<button class="buy progressionLocked" disabled data-locked="${esc(lookId)}" aria-label="${esc(name + '. ' + t('progression.locked') + '. ' + t('progression.requirement'))}">${lockIcon}<span>${t('progression.locked')}</span></button>`
  );
}
const crystalRow = (s, kind, slot, btn) =>
  Core.contentLocked(s, kind)
    ? lockedRow(Core.CULTIVATION_LOOK[kind], slot, crystalName(kind), crystalName(kind + '.desc'))
    : row(
        pic(Core.CULTIVATION_LOOK[kind], slot),
        crystalName(kind),
        crystalName(kind + '.desc') + '<br>' + price(s.inv, Core.CULTIVATION_RECIPES[kind]),
        btn
      );

// Upgrades in a crystal world: the three tools, then the gear you craft.
export function cultivationUpgradeRows(s) {
  return (
    ['pickaxe', 'boots'].map((k) => upgradeRow(s, k)).join('') +
    ['lantern', 'carrier']
      .map((k) =>
        crystalRow(
          s,
          k,
          k === 'carrier' ? 'icon' : 'image',
          s.cultivation.gear[k]
            ? doneButton(crystalName('owned'))
            : crystalButton(s, 'craft', k, t('sheet.craft'))
        )
      )
      .join('') +
    upgradeRow(s, 'basket') +
    (Core.contentLocked(s, 'flare')
      ? lockedRow('tool.flare', 'image', t('flare.name'), t('flare.does'))
      : '')
  );
}

// Build in a crystal world places things; what a building beside you does
// is on its own card, tapped in the world (building-card.js).
// Only what goes on your layer: crystal rooms from layer 2 down (Core.DEEP),
// a heart shelter anywhere.
export function cultivationBuildRows(s) {
  return (
    (s.player.z <= Core.DEEP ? `<div class="section">${crystalName('deep')}</div>` : '') +
    ['chamber', 'cooler', 'vault', 'conduit', 'shelter']
      .filter((k) => Core.buildsOnLayer(s, k))
      .map((k) => crystalRow(s, k, 'image', crystalButton(s, 'build', k, t('sheet.place'))))
      .join('')
  );
}

// The pictures the sheet draws with (createSheet sets it; tests too).
export function useLook(l) {
  look = l;
}

/* ------------------------------------------------------------ awards */

const TROPHY =
  '<svg class="trophy ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M12 13v4M8 21h8M9.5 17h5v4h-5z" /></svg>';

function goalNeeds(s, goal) {
  const needs = Core.goalNeeds(s, goal);
  if (!needs) return '';
  return needs.cost ? price(s.inv, needs.cost) : `${fmt(needs.n)} / ${fmt(needs.of)}`;
}

// The next milestone and what it still takes, the last one far off, then
// the ones reached, newest first.
export function awardsRows(s) {
  const goals = Core.worldGoals(s);
  const total = goals.length;
  const next = Core.nextGoal(s);
  let html = '';
  if (next) {
    html +=
      `<div class="section">${t('sheet.nextMilestone')}</div>` +
      `<div class="row nextGoal"><div class="ic">${TROPHY}</div><div class="main"><div class="nm">${esc(next.text)}</div><div class="sub">${goalNeeds(s, next)}</div></div></div>`;
    const last = goals[total - 1];
    const far = last !== next && !s.goalsDone.includes(last.id);
    if (far) {
      html +=
        `<div class="row farGoal"><div class="ic">${TROPHY}</div><div class="main"><div class="nm">${esc(last.text)}</div>` +
        `<div class="sub">${t('sheet.farMilestone')}${Core.goalNeeds(s, last) ? ' &middot; ' + goalNeeds(s, last) : ''}</div></div></div>`;
    }
    const left = total - s.goalIndex - (far ? 2 : 1);
    if (left > 0)
      html += `<div class="row awardsLeft"><div class="ic">${TROPHY}</div><div class="main"><div class="sub">${t('sheet.milestonesLeft', { count: left })}</div></div></div>`;
  }
  html += `<div class="section">${t('sheet.milestones', { n: Math.min(s.goalIndex, total), total })}</div>`;
  for (let i = s.goalsDone.length - 1; i >= 0; i--) {
    const goal = goals.find((g) => g.id === s.goalsDone[i]);
    if (goal) html += row(TROPHY, esc(goal.reached), t('sheet.milestone', { n: i + 1 }), '');
  }
  return html;
}
