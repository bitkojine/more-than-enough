/* The earnings statement (Watch, 2026-10-19), opened by tapping the resource
 * bar: what each resource earns and from what, a chart of it over your play,
 * what this world has given you and what you've spent, and the best buys by
 * how soon they pay back. The numbers come from src/core/ledger.js; ROI
 * counts everything in seconds of your own income (Watch's choice). Also
 * every kind of mushroom, as the Collected sheet before it showed. */

import * as Core from '../core/index.js';
import { fmt, fmtRate, fmtMult, esc } from './format.js';
import { t, listOr, capitalize, LOCALE } from '../i18n/i18n.js';

// Per second, minute or hour: the switch at the top, kept on this phone.
export const UNITS = { s: 1, min: 60, h: 3600 };
const UNIT_STORE = 'mte.statementUnit';
// Some private modes throw on merely touching localStorage.
function savedUnit() {
  try { const u = globalThis.localStorage?.getItem(UNIT_STORE); return Object.hasOwn(UNITS, u) ? u : 's'; } catch { return 's'; }
}
function saveUnit(unit) {
  try { globalThis.localStorage?.setItem(UNIT_STORE, unit); } catch { /* blocked: per second next time */ }
}

const BEST_SHOWN = 6;

// How soon something pays back: "40 s", "12 min", "2 h 5 min", "3 d 4 h".
export function fmtPayback(sec) {
  if (sec < 60) return t('ledger.seconds', { n: Math.max(1, Math.round(sec)) });
  const m = Math.round(sec / 60);
  if (m < 60) return t('duration.minutes', { m });
  if (m < 48 * 60) return t('duration.hours', { h: Math.floor(m / 60), m: m % 60 });
  const h = Math.round(m / 60);
  return t('ledger.days', { d: Math.floor(h / 24), h: h % 24 });
}

// `pic(id, slot)`, `icon(res)`, `price(have, cost)` and `row(...)` are the
// sheet's own, so the statement looks like every other list.
export function createStatement({ look, pic, icon, price, row, income }) {
  let unit = savedUnit();

  const rate = (perSecond) => fmtRate(perSecond * UNITS[unit]) + t('ledger.unit.' + unit);
  const cost = (c) => `<span class="price ready">${Object.keys(c).filter((r) => c[r] > 0).map((r) =>
    `<span class="amt spent" style="--res:${look.color(Core.resourceLook(r))}">${icon(r)}<span class="n">${fmt(c[r])}</span></span>`).join('')}</span>`;

  function units() {
    return '<div class="units" role="group">' + Object.keys(UNITS).map((u) =>
      `<button type="button" class="unit${u === unit ? ' on' : ''}" data-unit="${u}" aria-pressed="${u === unit}">${t('ledger.unit.' + u)}</button>`).join('') + '</div>';
  }

  // The resource's income over your play, on a log scale since it grows by
  // doublings. Time away is squeezed to a step, so the line is your play.
  function chart(s, res) {
    const points = income.history(s, res).filter((p) => p.rate > 0);
    if (points.length < 2) return `<div class="chart empty"><span>${t('ledger.chartSoon')}</span></div>`;
    const xs = [0];
    for (let i = 1; i < points.length; i++) xs.push(xs[i - 1] + Math.min(points[i].at - points[i - 1].at, 120000));
    const span = xs[xs.length - 1] || 1;
    const logs = points.map((p) => Math.log10(p.rate));
    let lo = Math.min(...logs), hi = Math.max(...logs);
    if (hi - lo < 0.3) { lo -= 0.15; hi += 0.15; }
    const W = 300, H = 64;
    const px = (i) => (xs[i] / span) * W, py = (i) => H - 3 - ((logs[i] - lo) / (hi - lo)) * (H - 6);
    let d = '';
    for (let i = 0; i < points.length; i++) d += (i ? `H${px(i).toFixed(1)}V` : `M${px(i).toFixed(1)},`) + py(i).toFixed(1);
    const area = d + `V${H}H0Z`;
    const data = points.map((p, i) => [+(xs[i] / span).toFixed(4), p.rate, p.at]);
    const color = look.color(Core.resourceLook(res));
    return `<div class="chart" style="--res:${color}" data-points='${JSON.stringify(data)}' data-unit="${unit}">` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="line" d="${d}"/></svg>` +
      `<span class="y hi">${rate(10 ** hi)}</span><span class="y lo">${rate(10 ** lo)}</span>` +
      `<span class="x from">${t('ledger.playedAgo', { time: fmtPayback(span / 1000) })}</span><span class="x now">${t('ledger.now')}</span>` +
      '</div>';
  }

  // Every multiplier that isn't ×1, by name.
  function multipliers(res, m) {
    const parts = [[m.refinery, Core.REFINERIES[res].name], [m.overclock, Core.TOOLS.overclock.name], [m.abundance, Core.ABUNDANCE.name], [m.legacy, Core.PERKS.legacy.name]];
    return parts.filter(([x]) => x > 1).map(([x, name]) => `&times;${fmtMult(x)} ${esc(name)}`).join(' &middot; ');
  }

  function incomeSection(s, res, inc, owned) {
    const total = inc.rate;
    let html = `<div class="section colHead" id="col-${res}">${icon(res)} ${Core.RESOURCE_LABEL[res]}<span class="headRate">${total > 0 ? '+' + rate(total) : ''}</span></div>`;
    if (!inc.lines.length) return html + row(icon(res), t('ledger.noIncome'), t('ledger.hand', { n: fmtRate(inc.hand) }), '');
    html += chart(s, res);
    for (const l of inc.lines) {
      const share = total > 0 ? l.rate / total : 0;
      const engine = l.key === 'engine';
      const name = engine ? esc(Core.ABUNDANCE.name) : esc(Core.EXTRACTORS[l.key].name) + ` <span class="tag">×${l.count}</span>`;
      const back = !engine && owned[l.key] < Infinity ? ' &middot; ' + t('ledger.earnsPrice', { time: fmtPayback(owned[l.key]) }) : '';
      const sub = (engine ? t('sheet.level', { lv: l.count }) : t(l.average ? 'ledger.average' : 'ledger.each', { rate: rate(l.each) })) + back;
      html += `<div class="row share line" style="--share:${(share * 100).toFixed(1)}%;--res:${look.color(Core.resourceLook(res))}">` +
        `<div class="ic">${pic(engine ? 'engine.abundance' : 'building.' + l.key, engine ? undefined : 'image')}</div>` +
        `<div class="main"><div class="nm">${name}<span class="amount">+${rate(l.rate)}</span></div><div class="sub">${sub}</div><div class="bar"><i></i></div></div></div>`;
    }
    const mults = multipliers(res, inc.mult);
    const hand = t('ledger.hand', { n: fmtRate(inc.hand) });
    html += `<div class="row note"><div class="main"><div class="sub">${mults ? mults + '<br>' : ''}${hand}</div></div></div>`;
    return html;
  }

  // This world's account per resource: what came in (and from where), what
  // went out, what's left.
  function account(s, spent) {
    let html = `<div class="section">${t('ledger.thisWorld')}</div>`;
    for (const r of Core.RESOURCES) {
      const earned = s.stats[r];
      if (earned < 1 && spent[r] < 1) continue;
      const sources = Object.keys(Core.SOURCES).filter((k) => s.sources[r][k] >= 1);
      const bar = sources.map((k) => `<i class="src-${k}" style="width:${(100 * s.sources[r][k] / Math.max(earned, 1)).toFixed(1)}%"></i>`).join('');
      const from = sources.map((k) => `${Core.SOURCES[k]} ${Math.round(100 * s.sources[r][k] / Math.max(earned, 1))}%`).join(' &middot; ');
      html += `<div class="row account" style="--res:${look.color(Core.resourceLook(r))}"><div class="ic">${icon(r)}</div><div class="main">` +
        `<div class="nm">${Core.RESOURCE_LABEL[r]}</div>` +
        `<div class="cols"><span><b>${fmt(earned)}</b>${t('ledger.earned')}</span><span><b>${fmt(spent[r])}</b>${t('ledger.spent')}</span><span><b>${fmt(s.inv[r])}</b>${t('ledger.held')}</span></div>` +
        `<div class="stack">${bar}</div><div class="sub">${from}</div></div></div>`;
    }
    return html;
  }

  const SPEND_NAME = {
    buildings: () => t('ledger.buildings'), props: () => t('ledger.props'),
    tools: () => t('path.tools'), refining: () => t('path.refining'), abundance: () => t('path.abundance'), unlocks: () => t('path.unlocks')
  };
  const SPEND_LOOK = { buildings: 'building.garden', props: 'mark.glowcap', tools: 'path.tools', refining: 'path.refining', abundance: 'path.abundance', unlocks: 'path.unlocks' };

  function spending(spend) {
    if (!spend.length) return '';
    let html = `<div class="section">${t('ledger.spending')}<span class="headNote">${t('ledger.todaysPrices')}</span></div>`;
    for (const c of spend) {
      const slot = c.id === 'buildings' || c.id === 'props' ? 'image' : undefined;
      html += row(pic(SPEND_LOOK[c.id], slot), SPEND_NAME[c.id](), cost(c.cost), '');
    }
    return html;
  }

  function bestBuys(s) {
    const buys = Core.bestBuys(s).slice(0, BEST_SHOWN);
    if (!buys.length) return '';
    let html = `<div class="section">${t('ledger.best')}<span class="headNote">${t('ledger.bestNote')}</span></div>`;
    for (const b of buys) {
      const building = b.kind === 'building';
      const name = building ? Core.EXTRACTORS[b.id].name : Core.UPGRADES[b.id].name;
      const picture = building ? pic('building.' + b.id, 'image') : pic(Core.UPGRADES[b.id].look);
      const gain = Core.RESOURCES.filter((r) => b.gain[r] > 0.0005).map((r) => `+${rate(b.gain[r])} ${icon(r)}`).join(' ');
      const go = building ? 'build' : 'upgrades';
      html += row(picture, esc(name), `<span class="ok">${gain}</span> &middot; ${t('ledger.paysBack', { time: fmtPayback(b.payback) })}<br>${price(s.inv, b.cost)}`,
        `<button class="buy go" type="button" data-goto="${go}">${t('sheet.' + go)}</button>`);
    }
    return html;
  }

  function render(s) {
    const inc = Core.incomeStatement(s), owned = Core.ownedPayback(s), spend = Core.spendingStatement(s);
    const spent = Core.totalSpent(s);
    let html = units() + `<div class="section">${t('ledger.income')}</div>`;
    for (const r of Core.RESOURCES) html += incomeSection(s, r, inc[r], owned);
    html += bestBuys(s) + account(s, spent) + spending(spend) + mushroomCards(s);
    return html;
  }

  /* ------------------------------------------------------- mushrooms */

  function growsIn(m) {
    if (m.where === 'cave') return m.from > 1 ? t('mushroom.where.deep', { layer: m.from }) : t('mushroom.where.cave');
    if (m.kinds.length === Object.keys(Core.FOREST_KINDS).length) return t('mushroom.where.anyForest');
    return capitalize(t('mushroom.where.forests', { list: listOr(m.kinds.map((k) => Core.FOREST_KINDS[k].in)) }));
  }

  function whereItGrows(m) {
    const where = growsIn(m);
    return m.magic ? `${where} · ${t('reason.gear', { tool: Core.TOOLS.basket.name, lv: Core.GEAR.rare })}` : where;
  }

  function mushroomCards(s) {
    const found = Core.MUSHROOM_KEYS.filter((k) => s.mushroomsEver.includes(k)).length;
    let html = `<div class="section">${t('sheet.mushroomKinds', { n: found, total: Core.MUSHROOM_KEYS.length })}</div><div class="cards">`;
    for (const k of Core.MUSHROOM_KEYS) {
      const m = Core.MUSHROOMS[k], seen = s.mushroomsEver.includes(k), n = s.mushrooms[k] || 0;
      const cls = 'card' + (seen ? '' : ' unseen') + (m.magic ? ' magic' : '');
      html += `<div class="${cls}" data-mushroom="${k}">${pic(Core.mushroomLook(k), 'image')}` +
        `<div class="nm">${seen ? esc(m.name) : '???'}${m.magic ? ' <span class="spark">✦</span>' : ''}</div>` +
        `<div class="sub">${seen ? (n > 0 ? t('sheet.mushroomPicked', { n: fmt(n) }) : t('sheet.mushroomElsewhere')) : esc(whereItGrows(m))}</div></div>`;
    }
    return html + '</div>';
  }

  /* ----------------------------------------------------- the chart tip */

  // Touching or pointing at a chart shows what it earned then: a line and a
  // label of their own over the sheet, so the chart's live updates leave them be.
  let cross = null, tip = null;
  function point(chartEl, clientX) {
    const data = JSON.parse(chartEl.dataset.points);
    const box = chartEl.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    let best = data[0];
    for (const p of data) if (Math.abs(p[0] - f) < Math.abs(best[0] - f)) best = p;
    const x = box.left + best[0] * box.width;
    cross.hidden = tip.hidden = false;
    Object.assign(cross.style, { left: x + 'px', top: box.top + 14 + 'px', height: box.height - 30 + 'px' });
    tip.textContent = `+${rate(best[1])} · ${new Date(best[2]).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
    const half = tip.offsetWidth / 2;
    Object.assign(tip.style, { left: Math.max(box.left + half, Math.min(box.right - half, x)) + 'px', top: box.top - 12 + 'px' });
  }
  function hide() {
    if (cross) cross.hidden = tip.hidden = true;
  }

  return {
    render,
    hide,
    // Wires the statement's own controls into the sheet body: the unit
    // switch (re-render), Best buys' buttons (`go(sheet)`), the charts' tips.
    attach(body, { rerender, go }) {
      cross = document.createElement('i');
      tip = document.createElement('span');
      cross.className = 'chartCross'; // i18n-ok: class names
      tip.className = 'chartTip'; // i18n-ok: class names
      cross.hidden = tip.hidden = true;
      document.body.append(cross, tip);
      body.addEventListener('scroll', hide, { passive: true });
      body.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('button');
        if (!b) return;
        if (b.dataset.unit) { unit = b.dataset.unit; saveUnit(unit); rerender(); }
        else if (b.dataset.goto) go(b.dataset.goto);
      });
      body.addEventListener('pointermove', (e) => {
        const c = e.target.closest && e.target.closest('.chart[data-points]');
        if (c) point(c, e.clientX);
      });
      body.addEventListener('pointerdown', (e) => {
        const c = e.target.closest && e.target.closest('.chart[data-points]');
        if (c) point(c, e.clientX);
        else hide();
      });
      body.addEventListener('pointerout', (e) => {
        const c = e.target.closest && e.target.closest('.chart[data-points]');
        if (c && e.pointerType === 'mouse' && !c.contains(e.relatedTarget)) hide();
      });
    }
  };
}
