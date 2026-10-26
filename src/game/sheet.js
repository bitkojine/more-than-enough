/* The bottom sheet: Upgrades (the progression map), Build, Beyond, Awards,
 * the earnings statement (opened by tapping the resource bar, so it has no
 * tab; src/game/statement.js) and
 * Settings (opened by the gear; its controls are static, in index.html). It
 * renders from state and reports what the player picked through `actions`.
 * Rows keep names, levels, numbers and prices concise. Optional inspection
 * reuses catalog descriptions; longer explanations remain in the wiki. */

import * as Core from '../core/index.js';
import { fmt, fmtRate, fmtMult, esc } from './format.js';
import { iconHtml } from './look/look.js';
import { t } from '../i18n/i18n.js';
import { SHEETS } from './fresh.js';
import { createStatement } from './statement.js';

const TITLES = Object.fromEntries(['upgrades', 'build', 'beyond', 'awards', 'statement'].map((k) => [k, t('sheet.' + k)]).concat([['settings', t('settings.title')], ['invites', t('invites.title')], ['worlds', t('worlds.title')], ['players', t('players.title')], ['nerds', t('nerds.title')], ['news', t('news.title')]]));
// Screens that are a panel of their own rather than rendered rows.
const PANELS = { settings: 'settingsPanel', invites: 'invitesPanel', worlds: 'worldsPanel', players: 'playersPanel', nerds: 'nerdsPanel', news: 'newsPanel' };
// The game lists, which show their tabs; every other screen shows its title.
const TABBED = ['upgrades', 'build', 'beyond', 'awards'];
// Screens one row inside Settings: opened from there, ‹ goes back to it.
const IN_SETTINGS = ['worlds', 'players', 'invites', 'nerds'];
const TROPHY = '<svg class="trophy ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M12 13v4M8 21h8M9.5 17h5v4h-5z" /></svg>';
const PERK_FAMILY = Core.pathFamily('perks');

// Set by createSheet: pictures come from the game's pack.
let look = null;
// What's new on the sheet showing (src/game/fresh.js): ids to tag NEW.
let newIds = new Set();
const NEW_TAG = `<span class="newTag">${t('badge.new')}</span>`;
const newTag = (id) => newIds.has(id) ? ' ' + NEW_TAG : '';
export const pic = (id, slot, level=null) => iconHtml(look, id, 'ico', slot, level);
const icon = (res) => pic(Core.resourceLook(res));
const insight = () => pic('resource.insight');

function priceTag(text, affordable) {
  return `<span class="${affordable ? 'ok' : 'bad'}">${text}</span>`;
}

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
  return `<span class="price ${ready ? 'ready' : 'short'}">` + (ready ? '' : `<span class="still">${t('sheet.stillNeed')}</span>`) + keys.map((r) => {
    if (ready) return pill(r, fmt(cost[r]), 'cost');
    const short = Math.ceil(cost[r] - have[r]);
    return short > 0 ? pill(r, fmt(short), 'need') : pill(r, '✓', 'met');
  }).join('') + '</span>';
}

function row(rowIcon, name, sub, button) {
  return `<div class="row"><div class="ic">${rowIcon}</div>` +
    `<div class="main"><div class="nm">${name}</div><div class="sub">${sub}</div></div>${button}</div>`;
}

function button(attrs, label, enabled) {
  return `<button class="buy" ${attrs}${enabled ? '' : ' disabled'}>${label}</button>`;
}

const doneButton = (label) => `<button class="buy max" disabled>${label}</button>`;
const arrow = (from, to) => `${from} → <span class="ok">${to}</span>`;

/* ------------------------------------------------------ upgrade rows */

// What a tool level opens (see Core.toolOpens), in a few words.
const doorName = (d) => t('door.' + d.id, { n: d.layer });

// The numbers for each kind of upgrade, and its button label.
const DESCRIBE = {
  tool(s, id) {
    const levels = Core.TOOLS[id].levels;
    const lv = Math.max(1, s.tools[id]);
    const head = s.tools[id] === 0 ? t('sheet.notCrafted') : t('sheet.levelOf', { lv, max: levels.length });
    if (lv >= levels.length) return { sub: head };
    const cur = levels[lv - 1], next = levels[lv];
    const effect = next.yield !== undefined ? arrow(cur.yield, next.yield) : arrow('&times;' + cur.mult, '&times;' + next.mult);
    const doors = Core.toolOpens(id, lv + 1);
    const opens = doors.length ? `<br><span class="ok">${t('sheet.opens', { what: doors.map(doorName).join(', ') })}</span>` : '';
    return { sub: `${head} &middot; ${effect}${opens}`, label: t('sheet.craft') };
  },
  resup(s, res) {
    const levels = Core.REFINERIES[res].levels;
    const lv = s.resUp[res];
    const mult = Core.refineryMult(s, res);
    const head = t('sheet.levelOf', { lv, max: levels.length });
    if (lv >= levels.length) return { sub: `${head} &middot; &times;${fmtMult(mult)}` };
    return { sub: `${head} &middot; ${arrow('&times;' + fmtMult(mult), '&times;' + fmtMult(mult * levels[lv].mult))}`, label: t('sheet.refine') };
  },
  abundance(s) {
    const lv = s.abundanceLv;
    return { sub: `${t('sheet.level', { lv })} &middot; +${lv}/s &middot; &times;${fmtMult(Core.abundanceMult(s))}`, label: lv === 0 ? t('sheet.buildIt') : t('sheet.level', { lv: lv + 1 }) };
  },
  unlock() {
    return { sub: '', label: t('sheet.unlock') };
  },
  perk(s, id) {
    const lv = s.perks[id];
    const repeat = Core.PERKS[id].repeat;
    return { sub: repeat && lv ? t('sheet.level', { lv }) : '', label: repeat && lv ? t('sheet.level', { lv: lv + 1 }) : t('sheet.buy') };
  }
};

function upgradeRow(s, id) {
  const u = Core.UPGRADES[id];
  const artwork=pic(u.look,'icon',u.kind==='tool'&&['basket','pickaxe','boots'].includes(id)?Math.max(0,Math.min(s.tools[id]-1,Core.TOOLS[id].levels.length-2)):null);
  const d = DESCRIBE[u.kind](s, id);
  if (u.retired) return row(artwork, esc(u.name), d.sub, doneButton(t('sheet.retired')));
  const name = esc(u.name) + (u.kind === 'resup' ? ` <span class="tag">${icon(id)}</span>` : '') + newTag(id);
  const cost = Core.upgradeCost(s, id);
  if (cost === null) return row(artwork, name, d.sub, doneButton(t(u.max === 1 ? 'sheet.owned' : 'sheet.max')));
  const affordable = Core.canBuy(s, id);
  const tag = u.currency === 'insight' ? price({ insight: s.insight }, { insight: cost }) : price(s.inv, cost);
  return row(artwork, name, d.sub ? d.sub + '<br>' + tag : tag, button(`data-kind="${u.kind}" data-id="${id}"`, d.label, affordable));
}

// Beyond (embarking and perks) stays out of sight until a world is
// mastered, every upgrade done; after the first Embark it stays. Never in a
// shared world, which has no Embark (perks you have still work there).
const beyondUnlocked = (s) => !s.shared && (s.insight > 0 || s.prestiges > 0 || Core.canEmbark(s));

/* ------------------------------------------------- crystal-world rows */

const crystalName = (k) => t('cr.' + k);
// Craft and Place are greyed out until you can pay for the thing (Watch,
// 2026-10-26): a button that looks ready must be ready.
function crystalButton(s, type, kind, label) {
  const p = s.player;
  return button(`data-kind="cultivation" data-action="${type}" data-id="${kind}" data-x="${Math.floor(p.x)}" data-y="${Math.floor(p.y)}"`, label, Core.canAfford(s.inv, Core.CULTIVATION_RECIPES[kind]));
}
const crystalRow = (s, kind, slot, btn) => row(pic(Core.CULTIVATION_LOOK[kind], slot), crystalName(kind), crystalName(kind + '.desc') + '<br>' + price(s.inv, Core.CULTIVATION_RECIPES[kind]), btn);

// Upgrades in a crystal world: the three tools, then the gear you craft.
export function cultivationUpgradeRows(s) {
  return ['basket', 'pickaxe', 'boots'].map((k) => upgradeRow(s, k)).join('') +
    ['lantern', 'carrier'].map((k) => crystalRow(s, k, k === 'carrier' ? 'icon' : 'image',
      s.cultivation.gear[k] ? doneButton(crystalName('owned')) : crystalButton(s, 'craft', k, t('sheet.craft')))).join('');
}

// Build in a crystal world places things; what a building beside you does
// is on its own card, tapped in the world (building-card.js).
// Only what goes on your layer: crystal rooms from layer 2 down (Core.DEEP),
// a heart shelter anywhere.
export function cultivationBuildRows(s) {
  return (s.player.z <= Core.DEEP ? `<div class="section">${crystalName('deep')}</div>` : '') +
    ['chamber', 'cooler', 'vault', 'conduit', 'shelter'].filter((k) => Core.buildsOnLayer(s, k)).map((k) => crystalRow(s, k, 'image', crystalButton(s, 'build', k, t('sheet.place')))).join('');
}

// The pictures the sheet draws with (createSheet sets it; tests too).
export function useLook(l) { look = l; }

/* ----------------------------------------------------------- the sheet */

export function createSheet(el, { getState, actions, look: currentLook, fresh = null, income, onTab = () => {} }) {
  useLook(currentLook);
  let open = false;
  let tab = 'upgrades';
  let from = null;  // the screen ‹ goes back to, if this one was opened from it
  // Progression families showing their buy rows. One the player hasn't
  // opened or closed opens by itself while it has something to buy.
  const expanded = { tools: true };
  const beyondTab = el.tabs.find((t) => t.dataset.tab === 'beyond');
  let beyondShownUnlocked = beyondUnlocked(getState());
  beyondTab.hidden = !beyondShownUnlocked;

  function rail(nodes) {
    return '<span class="rail">' + nodes.map((n) => `<span class="node ${n.state}" aria-hidden="true" title="${esc(n.name)}"></span>`).join('') + '</span>';
  }

  function familyHead(familyId, name, famLook, countText, extra) {
    const p = Core.pathProgress(getState(), familyId);
    return `<button class="railHead${p.canBuy ? ' ready' : ''}${extra.cls || ''}" type="button" data-family="${extra.target || familyId}"` +
      (extra.expandable ? ` aria-expanded="${extra.open}"` : '') + '>' +
      `<span class="fh-ic">${pic(famLook)}</span>` +
      `<span class="fh-main"><span class="fh-nm">${esc(name)}${p.nodes.some((n) => newIds.has(n.key)) ? ' ' + NEW_TAG : ''}</span>${rail(p.nodes)}</span>` +
      `<span class="fh-count">${countText(p)}</span>` +
      `<span class="chev" aria-hidden="true">${extra.open ? '▾' : '▸'}</span></button>`;
  }

  function renderUpgrades(s) {
    if (s.cultivation) return cultivationUpgradeRows(s);

    let html = `<div class="section">${t('sheet.section.world')}</div>`;
    for (const f of Core.PATH_FAMILIES.filter((fam) => fam.layer === 'world')) {
      const isOpen = expanded[f.id] ?? Core.pathProgress(s, f.id).canBuy;
      const count = f.id === 'abundance' ? () => t('sheet.level', { lv: s.abundanceLv }) : (p) => p.owned + '/' + p.total;
      html += familyHead(f.id, f.name, f.look, count, { expandable: true, open: isOpen });
      if (isOpen) html += '<div class="familyBody">' + f.nodes.filter(id=>id!=='logistics'||!Core.usesDepots(s)).map((id) => upgradeRow(s, id)).join('') + '</div>';
    }
    if (beyondUnlocked(s)) {
      html += `<div class="section">${t('sheet.section.legacy')}</div>`;
      html += familyHead('perks', PERK_FAMILY.name, PERK_FAMILY.look, (p) => p.owned + '/' + p.total, { target: 'legacy', cls: ' legacy', open: false });
    }
    return html;
  }

  function extractorRow(s, key) {
    const def = Core.EXTRACTORS[key];
    if (def.depot && !Core.usesDepots(s)) return '';
    const count = Core.extractorCount(s, key);
    const name = esc(def.name) + (count ? ` <span class="tag">×${count}</span>` : '') + newTag(key);
    const place = (enabled, label = t('sheet.place')) => button(`data-kind="build" data-id="${key}"`, label, enabled);
    const picture = pic('building.' + key, 'image');
    if (def.unlock && !s.unlocks[def.unlock]) return row(picture, name, '', place(false, t('sheet.locked')));
    const spot = Core.buildTarget(s, key);
    const rate = def.depot ? esc(t('building.depot.desc')) : def.support ? esc(t('building.' + key + '.desc')) : `+${fmtRate(Core.placementGain(s, key, spot))} ${icon(def.res)}/s`;
    const cost = Core.extractorCost(s, key);
    const affordable = Core.canAfford(s.inv, cost);
    const preview = def.depot && spot ? '<br>' + esc(t('building.depot.count',{n:Core.depotGain(s,spot)})) : def.support && spot ? `<br>+${fmtRate(Core.supportGain(s, spot))} ${icon('stone')}/s` : '';
    return row(picture, name, rate + preview + '<br>' + price(s.inv, cost) + '<br>' + where(def, spot, affordable), place(affordable && !!spot));
  }

  // Where a building goes. Once you can pay for it but there's nowhere in
  // reach, why Place is greyed out (a greyed-out button says nothing itself).
  function where(def, spot, affordable) {
    const tile = def.tile === null ? '' : esc(Core.TILE_NAME[def.tile].toLocaleLowerCase());
    if (affordable && !spot) return `<span class="where bad">${tile ? t('sheet.notHere', { tile }) : t('sheet.notHereLand')}</span>`;
    const goes = !tile ? t('sheet.goesAnywhere') : spot ? t('sheet.goesOnHere', { tile }) : t('sheet.goesOn', { tile });
    return `<span class="where">${goes}</span>`;
  }

  // Something to place where you stand: in the mine, or water power on the
  // water (saying where, while you aren't there).
  function propRow(s, kind) {
    const def = Core.PROPS[kind];
    const here = Core.canPlaceProp(s, kind);
    const ok = here && Core.canAfford(s.inv, def.cost);
    const where = def.on === 'tunnel' || here ? '' : `<br><span class="where">${t('sheet.goesOn.' + def.on, { tool: Core.TOOLS.boots.name, lv: Core.GEAR.water })}</span>`;
    return row(pic('mark.' + kind, 'image'), def.name + newTag(kind), def.does + '<br>' + price(s.inv, def.cost) + where, button(`data-kind="prop" data-id="${kind}"`, t('sheet.place'), ok));
  }
  const propsOn = (water) => Object.keys(Core.PROPS).filter((k) => (Core.PROPS[k].on !== 'tunnel') === water);

  function renderBuild(s) {
    // Only what can stand on the layer you're on: nothing you'd have to go
    // up or down for, and no heading over an empty section.
    const here = (keys) => keys.filter((k) => Core.buildsOnLayer(s, k));
    if(s.cultivation)return here(['garden','quarry','mine','stoneworks','depot']).map(k=>extractorRow(s,k)).join('')+cultivationBuildRows(s);
    const section = (title, rows) => rows ? `<div class="section">${t(title)}</div>` + rows : '';
    return section('sheet.section.extractors', here(Core.DEPOSIT_EXTRACTORS).map((k) => extractorRow(s, k)).join('')) +
      section('sheet.section.converters', here(Core.CONVERTERS).map((k) => extractorRow(s, k)).join('')) +
      section('sheet.section.support', here(Core.SUPPORT_BUILDINGS).map((k) => extractorRow(s, k)).join('')) +
      section('sheet.section.water', here(propsOn(true)).map((k) => propRow(s, k)).join('')) +
      section('sheet.section.mine', here(propsOn(false)).map((k) => propRow(s, k)).join(''));
  }

  function renderBeyond(s) {
    const can = Core.canEmbark(s);
    const m = Core.worldMastery(s);
    const progress = `${m.done} / ${m.total}`;
    const embark = row(pic('ui.embark'), t('sheet.embark'), can ? t('world.emptyStart') : progress,
      button('data-kind="embark"', t('sheet.embark'), can));
    if (s.emptyStart) return `<div class="section">${t('sheet.section.newWorld')}</div>` + embark +
      row('', t('sheet.embarks', { n: s.prestiges, total: fmt(Core.lifetimeTotal(s)) }), '', '');
    return `<div class="section">${t('res.insight')}</div>` +
      row(insight(), fmt(s.insight), t('sheet.embarks', { n: s.prestiges, total: fmt(Core.lifetimeTotal(s)) }), '') +
      `<div class="section">${t('sheet.section.newWorld')}</div>` + embark +
      `<div class="section">${t('path.perks')}</div>` + PERK_FAMILY.nodes.map((id) => upgradeRow(s, id)).join('');
  }

  // What a milestone still takes: a price as what's still needed, or a
  // number to reach.
  function goalNeeds(s, goal) {
    const needs = Core.goalNeeds(s, goal);
    if (!needs) return '';
    return needs.cost ? price(s.inv, needs.cost) : `${fmt(needs.n)} / ${fmt(needs.of)}`;
  }

  // The next milestone and what it still takes, the last one far off, then
  // the ones reached, newest first.
  function renderAwards(s) {
    const total = Core.goalsTotal(s);
    const next = Core.nextGoal(s);
    let html = '';
    if (next) {
      html += `<div class="section">${t('sheet.nextMilestone')}</div>` +
        `<div class="row nextGoal"><div class="ic">${TROPHY}</div><div class="main"><div class="nm">${esc(next.text)}</div><div class="sub">${goalNeeds(s, next)}</div></div></div>`;
      const last = Core.GOALS[total - 1];
      const far = last !== next && !s.goalsDone.includes(last.id);
      if (far) {
        html += `<div class="row farGoal"><div class="ic">${TROPHY}</div><div class="main"><div class="nm">${esc(last.text)}</div>` +
          `<div class="sub">${t('sheet.farMilestone')}${Core.goalNeeds(s, last) ? ' &middot; ' + goalNeeds(s, last) : ''}</div></div></div>`;
      }
      const left = total - s.goalIndex - (far ? 2 : 1);
      if (left > 0) html += `<div class="row awardsLeft"><div class="ic">${TROPHY}</div><div class="main"><div class="sub">${t('sheet.milestonesLeft', { count: left })}</div></div></div>`;
    }
    html += `<div class="section">${t('sheet.milestones', { n: Math.min(s.goalIndex, total), total })}</div>`;
    for (let i = s.goalsDone.length - 1; i >= 0; i--) {
      const goal = Core.GOALS.find((g) => g.id === s.goalsDone[i]);
      html += row(TROPHY, esc(Core.usesDepots(s)&&goal.id==='logistics'?t('goal.depot.reached'):goal.reached), t('sheet.milestone', { n: i + 1 }), '');
    }
    return html;
  }

  const statement = createStatement({ look, pic, icon, price, row, income });
  statement.attach(el.sheetBody, { rerender: () => render(), go: (next) => setTab(next) });
  const RENDER = { upgrades: renderUpgrades, build: renderBuild, beyond: renderBeyond, awards: renderAwards, statement: statement.render };

  // Looking at Build or Upgrades sees what's new there.
  function noteNew() {
    newIds = fresh && open && SHEETS.includes(tab) ? fresh.see(getState(), tab) : new Set();
  }

  function render() {
    noteNew();
    el.sheetBody.innerHTML = PANELS[tab] ? '' : RENDER[tab](getState());
  }

  // Live updates while open (prices count down as you gather): changed
  // texts and button states are patched in place, so a button never gets
  // swapped out from under a finger mid-tap.
  let nextRefresh = 0;
  function patch(was, now) {
    if (was.children.length !== now.children.length) { was.innerHTML = now.innerHTML; return; }
    [...now.children].forEach((n, i) => {
      const o = was.children[i];
      if (o.outerHTML === n.outerHTML || o.classList.contains('lit')) return;
      if (n.classList.contains('cards')) patch(o, n);
      else o.replaceWith(n.cloneNode(true));
    });
  }
  function refresh() {
    if (PANELS[tab]) return;
    noteNew();
    const tmp = document.createElement('div');
    tmp.innerHTML = RENDER[tab](getState());
    // The statement: swap in just the rows, charts and cards that changed.
    if (tab === 'statement') { patch(el.sheetBody, tmp); return; }
    const was = el.sheetBody.querySelectorAll('.row, .railHead'), now = tmp.querySelectorAll('.row, .railHead');
    if (was.length !== now.length) { render(); return; }
    now.forEach((n, i) => {
      const o = was[i];
      if (o.innerHTML === n.innerHTML && o.className === n.className) return;
      if (o.matches('.railHead')) { o.className = n.className; o.innerHTML = n.innerHTML; return; }
      for (const part of ['.ic', '.nm', '.sub']) {
        const a = o.querySelector(part), b = n.querySelector(part);
        if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
      }
      const a = o.querySelector('button'), b = n.querySelector('button');
      if (a && b) {
        a.disabled = b.disabled;
        a.className = b.className;
        if (a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
      }
    });
  }

  // Opens the statement at resource `res`, briefly lit so the eye finds it.
  function showStatement(res) {
    show('statement');
    if (!res) { el.sheetBody.scrollTop = 0; return; }
    const head = el.sheetBody.querySelector('#col-' + res);
    if (!head) return;
    el.sheetBody.scrollTop = head.offsetTop - el.sheetBody.offsetTop;
    head.classList.add('lit');
    setTimeout(() => head.classList.remove('lit'), 1500);
  }

  function setTab(next, parent = null) {
    statement.hide();
    tab = next;
    from = parent;
    el.sheetTitle.textContent = TITLES[tab];
    for (const t of el.tabs) t.classList.toggle('active', t.dataset.tab === tab);
    el.sheet.dataset.tab = tab;
    el.sheet.classList.toggle('titled', !TABBED.includes(tab));
    el.back.hidden = !from;
    for (const [screen, panel] of Object.entries(PANELS)) el[panel].hidden = screen !== tab;
    el.sheetBody.hidden = !!PANELS[tab];
    render();
    onTab(tab);
  }

  // A screen inside Settings opened from Settings remembers it, for ‹.
  function show(next) {
    const parent = open && tab === 'settings' && IN_SETTINGS.includes(next) ? 'settings' : null;
    open = true;
    el.sheet.classList.add('open');
    el.sheet.setAttribute('aria-hidden', 'false');
    setTab(next || tab, parent);
  }

  function close() {
    statement.hide();
    open = false;
    el.sheet.classList.remove('open');
    el.sheet.setAttribute('aria-hidden', 'true');
  }

  // One step back: to the screen this one was opened from, or closed.
  function back() {
    if (from) setTab(from);
    else close();
  }

  // Opens on `next`, switches to it, or closes if it is already showing.
  function toggle(next) {
    if (!open) show(next);
    else if (tab === next) close();
    else setTab(next);
  }

  el.sheetBody.addEventListener('click', (e) => {
    const target = e.target.closest && e.target.closest('button');
    if (!target || target.disabled) return;
    const { kind, id, family } = target.dataset;
    if (family) {
      if (family === 'legacy') setTab('beyond');
      else { expanded[family] = target.getAttribute('aria-expanded') !== 'true'; render(); }
      return;
    }
    if(kind==='cultivation'){actions.cultivation({type:target.dataset.action,kind:id,x:Number(target.dataset.x),y:Number(target.dataset.y)});}
    else if (kind === 'build') actions.place(id);
    else if (kind === 'prop') actions.placeProp(id);
    else if (kind === 'embark') actions.embark();
    else if (kind) actions.buy(id);
    if (open) render();
  });
  el.tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  el.close.addEventListener('click', close);
  el.back.addEventListener('click', back);

  // Swipe the sheet down by its grab handle to dismiss it.
  let dragging = false, startY = 0, dy = 0;
  el.sheetGrab.addEventListener('pointerdown', (e) => {
    dragging = true; startY = e.clientY; dy = 0;
    if (el.sheetGrab.setPointerCapture) el.sheetGrab.setPointerCapture(e.pointerId);
    el.sheet.style.transition = 'none';
    e.preventDefault();
  });
  el.sheetGrab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    el.sheet.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    el.sheet.style.transition = '';
    el.sheet.style.transform = '';
    if (dy > 80) close();
  };
  el.sheetGrab.addEventListener('pointerup', endDrag);
  el.sheetGrab.addEventListener('pointercancel', endDrag);

  setTab(tab);

  return {
    get isOpen() { return open; },
    get tab() { return tab; },
    show, close, back, toggle, render, showStatement,
    // Reveal the Beyond tab's contents live once the prestige loop unlocks.
    tick() {
      const shown = beyondUnlocked(getState());
      if (shown !== beyondShownUnlocked) {
        beyondShownUnlocked = shown;
        beyondTab.hidden = !shown;
        if (!shown && tab === 'beyond') setTab('upgrades');
        else if (open) render();
      }
      if (!open) return;
      const now = performance.now();
      if (now < nextRefresh) return;
      nextRefresh = now + 250;
      refresh();
    }
  };
}
