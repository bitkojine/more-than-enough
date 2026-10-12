/* The bottom sheet: Upgrades (the progression map), Build, and Beyond. It
 * renders from state and reports what the player picked through `actions`. */

import * as Core from '../core/index.js';
import { fmt, fmt1, fmtMult, esc } from './format.js';

const TITLES = { upgrades: 'Upgrades', build: 'Build', beyond: 'Beyond' };
const TERRAIN = { [Core.T.FOREST]: 'forest', [Core.T.STONE]: 'stone', [Core.T.ORE]: 'ore', [Core.T.CRYSTAL]: 'crystal' };
const PERK_FAMILY = Core.pathFamily('perks');

const icon = (res) => Core.RESOURCE_ICON[res];

function costHtml(cost) {
  return Object.keys(cost).map((r) => fmt(cost[r]) + ' ' + icon(r)).join(' ');
}

function costLine(cost, affordable) {
  return `<span class="${affordable ? 'ok' : 'bad'}">Cost: ${costHtml(cost)}</span>`;
}

function row(rowIcon, name, sub, button) {
  return `<div class="row"><div class="ic">${rowIcon}</div>` +
    `<div class="main"><div class="nm">${name}</div><div class="sub">${sub}</div></div>${button}</div>`;
}

function button(attrs, label, enabled, extraClass = '') {
  return `<button class="buy${extraClass}" ${attrs}${enabled ? '' : ' disabled'}>${label}</button>`;
}

const doneButton = (label) => `<button class="buy max" disabled>${label}</button>`;

/* ------------------------------------------------------ upgrade rows */

// What the next purchase of each kind of upgrade does, and its button label.
const DESCRIBE = {
  tool(s, id) {
    const levels = Core.TOOLS[id].levels;
    const lv = s.tools[id];
    const head = `Level ${lv} / ${levels.length}`;
    if (lv >= levels.length) return { sub: head + ' — MAX' };
    const cur = levels[lv - 1], next = levels[lv];
    const effect = next.yield !== undefined
      ? `yield ${cur.yield} → <span class="ok">${next.yield}</span>`
      : `${id === 'boots' ? 'speed' : 'output'} &times;${cur.mult} → <span class="ok">&times;${next.mult}</span>`;
    return { sub: `${head} &middot; ${effect}`, label: 'Craft' };
  },
  resup(s, res) {
    const max = Core.REFINERIES[res].levels.length;
    const lv = s.resUp[res];
    const mult = Core.refineryMult(s, res);
    const head = `Level ${lv} / ${max} &middot; &times;${fmtMult(mult)}`;
    if (lv >= max) return { sub: head + ' &mdash; MAX' };
    const next = mult * Core.REFINERIES[res].levels[lv].mult;
    return { sub: `${head} → <span class="ok">&times;${fmtMult(next)}</span>`, label: 'Refine' };
  },
  abundance(s) {
    const lv = s.abundanceLv;
    let sub = `Level ${lv} &middot; +${lv}/s of each resource`;
    if (lv > 0) sub += ` &middot; extractors &times;${fmtMult(Core.abundanceMult(s))}`;
    return { sub, label: lv === 0 ? 'Build' : 'Level ' + (lv + 1) };
  },
  unlock(s, id) {
    const desc = esc(Core.UPGRADES[id].desc);
    return s.unlocks[id] ? { sub: '<span class="ok">Active</span> &middot; ' + desc } : { sub: desc, label: 'Unlock' };
  },
  perk(s, id) {
    const lv = s.perks[id];
    const repeat = Core.PERKS[id].repeat;
    return { sub: esc(Core.UPGRADES[id].desc), label: repeat && lv ? 'Level ' + (lv + 1) : 'Buy', tag: lv ? (repeat ? 'Lv ' + lv : 'Owned') : '' };
  }
};

function upgradeRow(s, id) {
  const u = Core.UPGRADES[id];
  const d = DESCRIBE[u.kind](s, id);
  let name = esc(u.name);
  if (u.kind === 'resup') name += ` <span class="tag">${icon(id)}</span>`;
  if (d.tag) name += ` <span class="tag">${d.tag}</span>`;
  const cost = Core.upgradeCost(s, id);
  if (cost === null) return row(u.icon, name, u.kind === 'perk' ? d.sub + '<br><span class="ok">Active</span>' : d.sub, doneButton(u.max === 1 ? 'OWNED' : 'MAX'));
  const affordable = Core.canBuy(s, id);
  const price = u.currency === 'insight'
    ? `<span class="${affordable ? 'ok' : 'bad'}">${cost} Insight</span>`
    : costLine(cost, affordable);
  return row(u.icon, name, d.sub + '<br>' + price, button(`data-kind="${u.kind}" data-id="${id}"`, d.label, affordable));
}

/* ----------------------------------------------------------- the sheet */

export function createSheet(el, { getState, actions }) {
  let open = false;
  let tab = 'upgrades';
  const expanded = { tools: true }; // progression families showing their buy rows
  let beyondShownUnlocked = false;

  function rail(nodes) {
    return '<span class="rail">' + nodes.map((n) => `<span class="node ${n.state}" aria-hidden="true" title="${esc(n.name)}"></span>`).join('') + '</span>';
  }

  function familyHead(familyId, name, famIcon, countText, extra) {
    const p = Core.pathProgress(getState(), familyId);
    return `<button class="railHead${p.canBuy ? ' ready' : ''}${extra.cls || ''}" type="button" data-family="${extra.target || familyId}"` +
      (extra.expandable ? ` aria-expanded="${extra.open}"` : '') + '>' +
      `<span class="fh-ic">${famIcon}</span>` +
      `<span class="fh-main"><span class="fh-nm">${esc(name)}</span>${rail(p.nodes)}</span>` +
      `<span class="fh-count">${countText(p)}</span>` +
      `<span class="chev" aria-hidden="true">${extra.open ? '▾' : '▸'}</span></button>`;
  }

  function renderUpgrades(s) {
    let html = '<div class="section">This World</div>';
    for (const f of Core.PATH_FAMILIES.filter((fam) => fam.layer === 'world')) {
      const isOpen = !!expanded[f.id];
      const count = f.id === 'abundance' ? () => 'Lv ' + s.abundanceLv : (p) => p.owned + '/' + p.total;
      html += familyHead(f.id, f.name, f.icon, count, { expandable: true, open: isOpen });
      if (isOpen) html += '<div class="familyBody">' + f.nodes.map((id) => upgradeRow(s, id)).join('') + '</div>';
    }
    html += '<div class="section">Legacy &middot; kept across Embark</div>';
    html += familyHead('perks', 'Perks & Insight', PERK_FAMILY.icon, (p) => p.owned + '/' + p.total, { target: 'legacy', cls: ' legacy', open: false });
    return html;
  }

  function extractorRow(s, key) {
    const def = Core.EXTRACTORS[key];
    const count = Core.extractorCount(s, key);
    const name = esc(def.name) + (count ? ` <span class="tag">×${count}</span>` : '');
    const place = (enabled, label = 'Place') => button(`data-kind="build" data-id="${key}"`, label, enabled);
    if (def.unlock && !s.unlocks[def.unlock]) {
      return row(def.icon, name, `<span class="bad">Locked — craft ${esc(Core.UNLOCKS[def.unlock].name)}</span>`, place(false, 'Locked'));
    }
    const where = def.tile === null ? 'On any land' : 'On ' + TERRAIN[def.tile];
    const stat = `${where} &middot; +${fmt1(Core.extractorRate(s, key))} ${icon(def.res)}/s`;
    const cost = Core.extractorCost(s, key);
    const affordable = Core.canAfford(s.inv, cost);
    const spot = Core.buildTarget(s, key);
    if (!spot) {
      const why = def.tile === null ? stat + '<br><span class="bad">No open land around you</span>' : `<span class="bad">Stand on / next to ${TERRAIN[def.tile]}</span>`;
      return row(def.icon, name, why, place(false));
    }
    return row(def.icon, name, stat + '<br>' + costLine(cost, affordable), place(affordable));
  }

  function renderBuild(s) {
    return '<div class="section">Extractors</div>' + Core.DEPOSIT_EXTRACTORS.map((k) => extractorRow(s, k)).join('') +
      '<div class="section">Converters &middot; any land</div>' + Core.CONVERTERS.map((k) => extractorRow(s, k)).join('');
  }

  // Before the prestige loop is reachable, Beyond previews it sealed, so new
  // players can see the horizon without a wall of controls.
  const beyondUnlocked = (s) => s.insight > 0 || s.prestiges > 0 || Core.canEmbark(s);

  function renderBeyond(s) {
    const thisWorld = fmt(Core.worldTotal(s));
    const goal = fmt(Core.EMBARK_MIN_TOTAL);
    if (!beyondUnlocked(s)) {
      return '<div class="section">Legacy</div>' +
        row('\u{1F30D}', 'A New World Awaits', `Gather ${goal} resources in one world to unlock Embark. This world: <span class="ok">${thisWorld}</span>.`, doneButton('Sealed')) +
        '<div class="section">Perks</div>' +
        PERK_FAMILY.nodes.map((id) => row(Core.PERKS[id].icon, esc(Core.PERKS[id].name),
          esc(Core.PERKS[id].desc) + '<br><span class="bad">Unlocks after your first Embark</span>', doneButton('Locked'))).join('');
    }
    const can = Core.canEmbark(s);
    const gain = fmt(Core.embarkGain(s));
    return '<div class="section">Insight</div>' +
      row('✨', fmt(s.insight) + ' Insight', `Prestiges: ${s.prestiges} &middot; Lifetime gathered: ${fmt(Core.lifetimeTotal(s))}`, '') +
      '<div class="section">New World</div>' +
      row('\u{1F30D}', 'Embark',
        can ? `Reset the world, inventory and upgrades. Keep Insight &amp; perks, and gain <span class="ok">+${gain}</span> Insight.`
          : `Gather ${goal} resources in this world. Currently ${thisWorld}.`,
        button('data-kind="embark"', can ? 'Embark +' + gain : 'Embark', can)) +
      '<div class="section">Perks</div>' + PERK_FAMILY.nodes.map((id) => upgradeRow(s, id)).join('');
  }

  const RENDER = { upgrades: renderUpgrades, build: renderBuild, beyond: renderBeyond };

  function render() {
    const s = getState();
    beyondShownUnlocked = beyondUnlocked(s);
    el.sheetBody.innerHTML = RENDER[tab](s);
  }

  function setTab(next) {
    tab = next;
    el.sheetTitle.textContent = TITLES[tab];
    for (const t of el.tabs) t.classList.toggle('active', t.dataset.tab === tab);
    render();
  }

  function show(next) {
    open = true;
    el.sheet.classList.add('open');
    el.sheet.setAttribute('aria-hidden', 'false');
    setTab(next || tab);
  }

  function close() {
    open = false;
    el.sheet.classList.remove('open');
    el.sheet.setAttribute('aria-hidden', 'true');
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
      else { expanded[family] = !expanded[family]; render(); }
      return;
    }
    if (kind === 'build') actions.place(id);
    else if (kind === 'embark') actions.embark();
    else if (kind) actions.buy(id);
    if (open) render();
  });
  el.tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  el.close.addEventListener('click', close);

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
    show, close, toggle, render,
    // Reveal the Beyond tab's contents live once the prestige loop unlocks.
    tick() {
      if (open && tab === 'beyond' && beyondUnlocked(getState()) !== beyondShownUnlocked) render();
    }
  };
}
