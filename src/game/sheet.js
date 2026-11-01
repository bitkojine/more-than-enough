/* The bottom sheet: Upgrades (the progression map), Build, Beyond, Awards,
 * the earnings statement (opened by tapping the resource bar, so it has no
 * separate menu button; src/game/statement.js) and
 * Settings (opened by the gear; its controls are static, in index.html). It
 * renders from state and reports what the player picked through `actions`.
 * Rows keep names, levels, numbers and prices concise. Optional inspection
 * reuses catalog descriptions; longer explanations remain in the wiki. */

import * as Core from '../core/index.js';
import { fmt, fmtRate, esc } from './format.js';
import {
  useLook,
  pic,
  row,
  button,
  upgradeRow,
  beyondUnlocked,
  crystalName,
  insight,
  price,
  icon,
  lockedRow,
  cultivationUpgradeRows,
  cultivationBuildRows,
  awardsRows
} from './sheet-rows.js';

import { t } from '../i18n/i18n.js';

const TITLES = Object.fromEntries(
  ['upgrades', 'build', 'beyond', 'awards', 'statement']
    .map((k) => [k, t('sheet.' + k)])
    .concat([
      ['performance', t('nerds.perf')],
      ['settings', t('settings.title')],
      ['invites', t('invites.title')],
      ['worlds', t('worlds.title')],
      ['players', t('players.title')],
      ['nerds', t('nerds.title')],
      ['news', t('news.title')],
      ['devices', t('devices.title')]
    ])
);
// Screens that are a panel of their own rather than rendered rows.
const PANELS = {
  performance: 'performancePanel',
  settings: 'settingsPanel',
  invites: 'invitesPanel',
  worlds: 'worldsPanel',
  players: 'playersPanel',
  nerds: 'nerdsPanel',
  news: 'newsPanel',
  devices: 'devicesPanel'
};
// Every menu has its own title and dedicated entry button.
TITLES.build = t('hud.settlement');
TITLES.upgrades = t('hud.equipment');
// Screens one row inside Settings: opened from there, ‹ goes back to it.
const IN_SETTINGS = ['worlds', 'players', 'invites', 'nerds', 'devices', 'beyond'];
const PERK_FAMILY = Core.pathFamily('perks');

/* ----------------------------------------------------------- the sheet */

export function createSheet(
  el,
  { getState, actions, look: currentLook, income, onTab = () => {} }
) {
  useLook(currentLook);
  let open = false;
  let tab = 'upgrades';
  let from = null; // the screen ‹ goes back to, if this one was opened from it
  // Progression families showing their buy rows. One the player hasn't
  // opened or closed opens by itself while it has something to buy.
  const expanded = { tools: true };
  let beyondShownUnlocked = beyondUnlocked(getState());
  el.beyond.hidden = !beyondShownUnlocked;

  function rail(nodes) {
    return (
      '<span class="rail">' +
      nodes
        .map(
          (n) => `<span class="node ${n.state}" aria-hidden="true" title="${esc(n.name)}"></span>`
        )
        .join('') +
      '</span>'
    );
  }

  function familyHead(familyId, name, famLook, countText, extra) {
    const p = Core.pathProgress(getState(), familyId);
    return (
      `<button class="railHead${p.canBuy ? ' ready' : ''}${extra.cls || ''}" type="button" data-family="${extra.target || familyId}"` +
      (extra.expandable ? ` aria-expanded="${extra.open}"` : '') +
      '>' +
      `<span class="fh-ic">${pic(famLook)}</span>` +
      `<span class="fh-main"><span class="fh-nm">${esc(name)}</span>${rail(p.nodes)}</span>` +
      `<span class="fh-count">${countText(p)}</span>` +
      `<span class="chev" aria-hidden="true">${extra.open ? '▾' : '▸'}</span></button>`
    );
  }

  function renderUpgrades(s, settlement = false) {
    if (s.cultivation) return settlement ? '' : cultivationUpgradeRows(s);

    let html = `<div class="section">${t('sheet.section.world')}</div>`;
    for (const f of Core.PATH_FAMILIES.filter(
      (fam) => fam.layer === 'world' && (settlement ? fam.id !== 'tools' : fam.id === 'tools')
    )) {
      const isOpen = expanded[f.id] ?? Core.pathProgress(s, f.id).canBuy;
      const count =
        f.id === 'abundance'
          ? () => t('sheet.level', { lv: s.abundanceLv })
          : (p) => p.owned + '/' + p.total;
      html += familyHead(f.id, f.name, f.look, count, { expandable: true, open: isOpen });
      if (isOpen)
        html +=
          '<div class="familyBody">' +
          f.nodes
            .filter((id) => id !== 'logistics' || !Core.usesDepots(s))
            .map((id) => upgradeRow(s, id))
            .join('') +
          '</div>';
    }
    if (beyondUnlocked(s)) {
      html += `<div class="section">${t('sheet.section.legacy')}</div>`;
      html += familyHead(
        'perks',
        PERK_FAMILY.name,
        PERK_FAMILY.look,
        (p) => p.owned + '/' + p.total,
        { target: 'legacy', cls: ' legacy', open: false }
      );
    }
    return html;
  }

  function extractorRow(s, key) {
    if (Core.contentLocked(s, key))
      return lockedRow(
        'building.' + key,
        'image',
        Core.EXTRACTORS[key].name,
        t(
          {
            garden: 'cr.bed.desc',
            quarry: 'cr.quarry.desc',
            mine: 'cr.mine.desc',
            stoneworks: 'building.stoneworks.desc',
            depot: 'building.depot.desc'
          }[key]
        )
      );
    const def = Core.EXTRACTORS[key];
    if (def.depot && !Core.usesDepots(s)) return '';
    const count = Core.extractorCount(s, key);
    const name = esc(def.name) + (count ? ` <span class="tag">×${count}</span>` : '');
    const place = (enabled, label = t('sheet.place')) =>
      button(`data-kind="build" data-id="${key}"`, label, enabled);
    const picture = pic('building.' + key, 'image');
    if (def.unlock && !s.unlocks[def.unlock])
      return row(picture, name, '', place(false, t('sheet.locked')));
    const spot = Core.buildTarget(s, key);
    const rate = def.depot
      ? esc(t('building.depot.desc'))
      : def.support
        ? esc(t('building.' + key + '.desc'))
        : `+${fmtRate(Core.placementGain(s, key, spot))} ${icon(def.res)}/s`;
    const cost = Core.extractorCost(s, key);
    const affordable = Core.canAfford(s.inv, cost);
    const preview =
      def.depot && spot
        ? '<br>' + esc(t('building.depot.count', { n: Core.depotGain(s, spot) }))
        : def.support && spot
          ? `<br>+${fmtRate(Core.supportGain(s, spot))} ${icon('stone')}/s`
          : '';
    return row(
      picture,
      name,
      rate + preview + '<br>' + price(s.inv, cost) + '<br>' + where(def),
      place(affordable)
    );
  }

  // Where a building goes. Place closes the sheet and you pick the tile on
  // the map (placing.js).
  function where(def) {
    const tile = def.tile === null ? '' : esc(Core.TILE_NAME[def.tile].toLocaleLowerCase());
    return `<span class="where">${tile ? t('sheet.goesOn', { tile }) : t('sheet.goesAnywhere')}</span>`;
  }

  // Something to place where you stand: in the mine, or water power on the
  // water (saying where, while you aren't there).
  function propRow(s, kind) {
    const def = Core.PROPS[kind];
    const here = Core.canPlaceProp(s, kind);
    const ok = here && Core.canAfford(s.inv, def.cost);
    const where =
      def.on === 'tunnel' || here
        ? ''
        : `<br><span class="where">${t('sheet.goesOn.' + def.on, { tool: Core.TOOLS.boots.name, lv: Core.GEAR.water })}</span>`;
    return row(
      pic('mark.' + kind, 'image'),
      def.name,
      def.does + '<br>' + price(s.inv, def.cost) + where,
      button(`data-kind="prop" data-id="${kind}"`, t('sheet.place'), ok)
    );
  }
  const propsOn = (water) =>
    Object.keys(Core.PROPS).filter((k) => (Core.PROPS[k].on !== 'tunnel') === water);

  function renderConstruction(s) {
    // Only what can stand on the layer you're on: nothing you'd have to go
    // up or down for, and no heading over an empty section.
    const here = (keys) => keys.filter((k) => Core.buildsOnLayer(s, k));
    const section = (title, rows) => (rows ? `<div class="section">${t(title)}</div>` + rows : '');
    if (s.cultivation)
      return (
        cultivationBuildRows(s) +
        here(['garden', 'quarry', 'mine', 'stoneworks', 'depot'])
          .map((k) => extractorRow(s, k))
          .join('') +
        section(
          'sheet.section.water',
          here(propsOn(true))
            .filter((k) => Core.PROPS[k].charge)
            .map((k) => propRow(s, k))
            .join('')
        )
      );
    return (
      section(
        'sheet.section.extractors',
        here(Core.DEPOSIT_EXTRACTORS)
          .map((k) => extractorRow(s, k))
          .join('')
      ) +
      section(
        'sheet.section.converters',
        here(Core.CONVERTERS)
          .map((k) => extractorRow(s, k))
          .join('')
      ) +
      section(
        'sheet.section.support',
        here(Core.SUPPORT_BUILDINGS)
          .map((k) => extractorRow(s, k))
          .join('')
      ) +
      section(
        'sheet.section.water',
        here(propsOn(true))
          .map((k) => propRow(s, k))
          .join('')
      ) +
      section(
        'sheet.section.mine',
        here(propsOn(false))
          .map((k) => propRow(s, k))
          .join('')
      )
    );
  }

  function renderBuild(s) {
    let html = renderConstruction(s);
    if (!s.cultivation) return html + renderUpgrades(s, true);
    const improvements = s.cultivation.facilities
      .filter((b) => b.z === s.player.z)
      .map((b) => {
        const action =
          ['chamber', 'vault'].includes(b.kind) && !b.reinforced
            ? 'reinforce'
            : b.kind === 'machine' && Core.machineRepairCost(b)
              ? 'repair'
              : null;
        if (!action) return '';
        if (Core.contentLocked(s, action))
          return lockedRow(
            Core.CULTIVATION_LOOK[b.kind],
            'image',
            t('hud.site', { name: crystalName(b.kind), x: b.x, y: b.y }),
            crystalName(action)
          );
        const cost =
          action === 'repair' ? Core.machineRepairCost(b) : Core.CULTIVATION_RECIPES.reinforce;
        const title = t('hud.site', { name: crystalName(b.kind), x: b.x, y: b.y });
        return row(
          pic(Core.CULTIVATION_LOOK[b.kind], 'image'),
          esc(title),
          price(s.inv, cost),
          button(
            `data-kind="cultivation" data-action="${action}" data-id="${b.kind}" data-x="${b.x}" data-y="${b.y}"`,
            crystalName(action),
            Core.canAfford(s.inv, cost)
          )
        );
      })
      .join('');
    return (
      html +
      (improvements ? `<div class="section">${t('hud.improvements')}</div>` + improvements : '')
    );
  }

  function renderBeyond(s) {
    const can = Core.canEmbark(s);
    const m = Core.worldMastery(s);
    const progress = `${m.done} / ${m.total}`;
    const embark = row(
      pic('ui.embark'),
      t('sheet.embark'),
      can ? t('world.emptyStart') : progress,
      button('data-kind="embark"', t('sheet.embark'), can)
    );
    if (s.emptyStart)
      return (
        `<div class="section">${t('sheet.section.newWorld')}</div>` +
        embark +
        row('', t('sheet.embarks', { n: s.prestiges, total: fmt(Core.lifetimeTotal(s)) }), '', '')
      );
    return (
      `<div class="section">${t('res.insight')}</div>` +
      row(
        insight(),
        fmt(s.insight),
        t('sheet.embarks', { n: s.prestiges, total: fmt(Core.lifetimeTotal(s)) }),
        ''
      ) +
      `<div class="section">${t('sheet.section.newWorld')}</div>` +
      embark +
      `<div class="section">${t('path.perks')}</div>` +
      PERK_FAMILY.nodes.map((id) => upgradeRow(s, id)).join('')
    );
  }

  // What a milestone still takes: a price as what's still needed, or a
  // number to reach.
  let statement,
    statementLoading,
    statementResource,
    statementError,
    statementAttempts = 0;
  function loadStatement() {
    if (statementLoading) return statementLoading;
    statementError = null;
    const url = new URL('./statement.js', import.meta.url);
    url.search = new URL(import.meta.url).search;
    if (statementAttempts++) url.searchParams.set('retry', String(statementAttempts));
    return (statementLoading = import(url.href).then(
      ({ createStatement }) => {
        statement = createStatement({ look: currentLook, pic, icon, price, row, income });
        statement.attach(el.sheetBody, { go: (next) => setTab(next) });
        if (open && tab === 'statement') {
          render();
          highlightResource(statementResource);
        }
      },
      (error) => {
        statementLoading = null;
        statementError = String(error);
        globalThis.MTE_FAULT?.(error, 'earnings/load ' + url.href);
        console.error('Earnings module failed to load', url.href, error);
        if (open && tab === 'statement') render();
      }
    ));
  }
  const RENDER = {
    upgrades: renderUpgrades,
    build: renderBuild,
    beyond: renderBeyond,
    awards: awardsRows,
    statement: (s) =>
      statement
        ? statement.render(s)
        : `<p class="statementNote">${t(statementError ? 'sheet.statementFailed' : 'sheet.statementLoading')}</p>${statementError ? '<pre>' + esc(statementError) + '</pre>' : ''}`
  };

  function render() {
    el.sheetBody.innerHTML = PANELS[tab] ? '' : RENDER[tab](getState());
  }

  // Live updates while open (prices count down as you gather): changed
  // texts and button states are patched in place, so a button never gets
  // swapped out from under a finger mid-tap.
  let nextRefresh = 0;
  function patch(was, now) {
    if (was.children.length !== now.children.length) {
      was.innerHTML = now.innerHTML;
      return;
    }
    [...now.children].forEach((n, i) => {
      const o = was.children[i];
      if (o.outerHTML === n.outerHTML || o.classList.contains('lit')) return;
      if (o.tagName === 'DETAILS') {
        n.open = o.open;
        patch(o, n);
      } else if (n.classList.contains('cards')) patch(o, n);
      else o.replaceWith(n.cloneNode(true));
    });
  }
  function refresh() {
    if (PANELS[tab]) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = RENDER[tab](getState());
    // The statement: swap in just the rows, charts and cards that changed.
    if (tab === 'statement') {
      patch(el.sheetBody, tmp);
      return;
    }
    const was = el.sheetBody.querySelectorAll('.row, .railHead'),
      now = tmp.querySelectorAll('.row, .railHead');
    if (was.length !== now.length) {
      render();
      return;
    }
    now.forEach((n, i) => {
      const o = was[i];
      if (o.innerHTML === n.innerHTML && o.className === n.className) return;
      if (o.matches('.railHead')) {
        o.className = n.className;
        o.innerHTML = n.innerHTML;
        return;
      }
      for (const part of ['.ic', '.nm', '.sub']) {
        const a = o.querySelector(part),
          b = n.querySelector(part);
        if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
      }
      const a = o.querySelector('button'),
        b = n.querySelector('button');
      if (a && b) {
        a.disabled = b.disabled;
        a.className = b.className;
        if (a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
      }
    });
  }

  // Opens the statement at resource `res`, briefly lit so the eye finds it.
  function showStatement(res) {
    statementResource = res;
    show('statement');
    if (!statement) {
      void loadStatement();
      return;
    }
    highlightResource(res);
  }
  function highlightResource(res) {
    if (!res) {
      el.sheetBody.scrollTop = 0;
      return;
    }
    const head = el.sheetBody.querySelector('#col-' + res);
    if (!head) return;
    el.sheetBody.scrollTop = head.offsetTop - el.sheetBody.offsetTop;
    head.classList.add('lit');
    setTimeout(() => head.classList.remove('lit'), 1500);
  }

  function setTab(next, parent = null) {
    statement?.hide();
    tab = next;
    from = parent;
    el.sheetTitle.textContent = TITLES[tab];
    el.sheet.dataset.tab = tab;
    el.back.hidden = !from;
    for (const [screen, panel] of Object.entries(PANELS)) el[panel].hidden = screen !== tab;
    el.sheetBody.hidden = !!PANELS[tab];
    render();
    onTab(tab);
  }

  // A screen inside Settings opened from Settings remembers it, for ‹.
  function show(next) {
    el.beyond.hidden = !beyondUnlocked(getState());
    const parent = open && tab === 'settings' && IN_SETTINGS.includes(next) ? 'settings' : null;
    open = true;
    el.sheet.classList.add('open');
    el.sheet.setAttribute('aria-hidden', 'false');
    setTab(next || tab, parent);
  }

  function close() {
    statement?.hide();
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
      if (family === 'legacy') setTab('beyond', tab);
      else {
        expanded[family] = target.getAttribute('aria-expanded') !== 'true';
        render();
      }
      return;
    }
    if (kind === 'cultivation') {
      actions.cultivation({
        type: target.dataset.action,
        kind: id,
        x: Number(target.dataset.x),
        y: Number(target.dataset.y)
      });
    } else if (kind === 'build') actions.place(id);
    else if (kind === 'prop') actions.placeProp(id);
    else if (kind === 'embark') actions.embark();
    else if (kind) actions.buy(id);
    if (open) render();
  });
  el.beyond.addEventListener('click', () => show('beyond'));
  el.close.addEventListener('click', close);
  el.back.addEventListener('click', back);

  // Swipe the sheet down by its grab handle to dismiss it.
  let dragging = false,
    startY = 0,
    dy = 0;
  el.sheetGrab.addEventListener('pointerdown', (e) => {
    dragging = true;
    startY = e.clientY;
    dy = 0;
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
    get isOpen() {
      return open;
    },
    get tab() {
      return tab;
    },
    show,
    close,
    back,
    toggle,
    render,
    showStatement,
    // Keep the dedicated Beyond entry in step with the world's unlock state.
    tick() {
      const shown = beyondUnlocked(getState());
      if (shown !== beyondShownUnlocked) {
        beyondShownUnlocked = shown;
        el.beyond.hidden = !shown;
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
