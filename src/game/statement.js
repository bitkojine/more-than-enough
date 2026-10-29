/* Resource production, waiting stock, packs, and recorded spending.
 * Old-world holdings estimates never masquerade as actual transactions. */

import * as Core from '../core/index.js';
import { fmt, fmtRate, fmtMult, esc } from './format.js';
import { t, listOr, capitalize, LOCALE, addStrings } from '../i18n/i18n.js';

import en from '../i18n/statement/en.js';
import lt from '../i18n/statement/lt.js';
addStrings({en,lt});

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
  const rate = (perSecond) => fmtRate(perSecond) + t('ledger.unit.s');
  const cost = (c) => `<span class="price ready">${Object.keys(c).filter((r) => c[r] > 0).map((r) =>
    `<span class="amt spent" style="--res:${look.color(Core.resourceLook(r))}">${icon(r)}<span class="n">${fmt(c[r])}</span></span>`).join('')}</span>`;

  // Sampled production on linear axes, retaining zeroes and real elapsed time.
  function chart(s, res) {
    const points = income.history(s, res).filter((p) => Number.isFinite(p.rate) && p.rate >= 0);
    if (points.length < 2) return `<div class="chart empty"><span>${t('ledger.chartSoon')}</span></div>`;
    const xs = [0];
    for (let i = 1; i < points.length; i++) xs.push(xs[i - 1] + Math.max(0, points[i].at - points[i - 1].at));
    const span = xs[xs.length - 1] || 1;
    const lo = 0, hi = Math.max(...points.map(p => p.rate)) || 1;
    const W = 300, H = 64;
    const px = (i) => (xs[i] / span) * W, py = (i) => H - 3 - (points[i].rate / hi) * (H - 6);
    const segments=[];let segment='',end=0,start=0;
    for(let i=0;i<points.length;i++) {
      if(i===0 || points[i].at-points[i-1].at>120000) {
        if(segment)segments.push({line:segment,start,end});
        start=px(i);segment=`M${start.toFixed(1)},${py(i).toFixed(1)}`;
      }else segment+=`H${px(i).toFixed(1)}V${py(i).toFixed(1)}`;
      end=px(i);
    }
    segments.push({line:segment,start,end});
    const d=segments.map(p=>p.line).join('');
    const area=segments.map(p=>p.line+`V${H}H${p.start.toFixed(1)}Z`).join('');
    const data = points.map((p, i) => [+(xs[i] / span).toFixed(4), p.rate, p.at]);
    const color = look.color(Core.resourceLook(res));
    return `<div class="chart" style="--res:${color}" data-points='${JSON.stringify(data)}'>` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="line" d="${d}"/></svg>` +
      `<span class="y hi">${rate(hi)}</span><span class="y lo">${rate(lo)}</span>` +
      `<span class="x from">${t('ledger.elapsedAgo', { time: fmtPayback(span / 1000) })}</span><span class="x now">${t('ledger.now')}</span>` +
      '</div>';
  }

  // Every multiplier that isn't ×1, by name.
  function multipliers(res, m) {
    const parts = [[m.refinery, Core.REFINERIES[res].name], [m.overclock, Core.TOOLS.overclock.name], [m.abundance, Core.ABUNDANCE.name], [m.legacy, Core.PERKS.legacy.name]];
    return parts.filter(([x]) => x > 1).map(([x, name]) => `&times;${fmtMult(x)} ${esc(name)}`).join(' &middot; ');
  }

  function incomeSection(s, res, inc) {
    let html = `<div class="section colHead" id="col-${res}">${icon(res)} ${Core.RESOURCE_LABEL[res]}<span class="headRate">+${rate(inc.rate)}</span></div>`;
    html += row(icon(res), t('ledger.packsStock', {packs:fmt(s.inv[res]),stock:fmt(inc.buffered)}), t('ledger.stockNote'), '');
    if (!inc.lines.length) {html += row(icon(res), t('ledger.noIncome'), '', '');if(income.history(s,res).length>1)html+=chart(s,res);}
    else {
      html += chart(s,res);
      for (const l of inc.lines) {
        const engine = l.key === 'engine';
        const name = engine ? Core.ABUNDANCE.name : l.facility ? t('cr.'+l.key) : Core.EXTRACTORS[l.key].name;
        const image = engine ? 'engine.abundance' : l.facility ? Core.CULTIVATION_LOOK[l.key] : 'building.'+l.key;
        let sub = engine ? t('ledger.direct') : t('ledger.status.'+l.status);
        if (!engine) sub += ' · '+t('ledger.waiting',{n:fmt(l.buffered)});
        if (l.facility) sub += '<br>'+t('ledger.facilityDetails',{layer:-l.z,x:l.x,y:l.y,temperature:fmt(l.temperature),quality:fmt(l.quality)});
        else if (!engine && l.potential > 0) sub += '<br>'+t('ledger.capacityRate',{rate:rate(l.potential)});
        html += row(pic(image,engine?undefined:'image'),esc(name)+(l.facility?'':` <span class="tag">×${l.count}</span>`)+`<span class="statementRate">+${rate(l.rate)}</span>`,sub,'');
      }
    }
    const mults = s.cultivation ? '' : multipliers(res,inc.mult);
    const hand = inc.hand === null ? t('ledger.crystalGather') : t('ledger.hand',{n:fmtRate(inc.hand)});
    html += `<div class="row note"><div class="main"><div class="sub">${mults ? mults+'<br>' : ''}${hand}</div></div></div>`;
    return html;
  }

  // This world's account per resource: what came in (and from where), what
  // went out, what's left.
  function account(s) {
    const spent = Object.fromEntries(Core.RESOURCES.map(r=>[r,Core.recordedSpending(s).reduce((n,c)=>n+(c.cost[r]||0),0)]));
    let html = `<div class="section">${t('ledger.thisWorld')}</div><p class="statementNote">${t('ledger.receiptsNote')}</p>`;
    for (const r of Core.RESOURCES) {
      const earned = s.stats[r];
      if (earned < 1 && spent[r] < 1) continue;
      const sources = Object.keys(Core.SOURCES).filter((k) => s.sources[r][k] >= 1);
      const bar = sources.map((k) => `<i class="src-${k}" style="width:${(100 * s.sources[r][k] / Math.max(earned, 1)).toFixed(1)}%"></i>`).join('');
      const from = sources.map((k) => `${Core.SOURCES[k]} ${Math.round(100 * s.sources[r][k] / Math.max(earned, 1))}%`).join(' &middot; ');
      html += `<div class="row account" style="--res:${look.color(Core.resourceLook(r))}"><div class="ic">${icon(r)}</div><div class="main">` +
        `<div class="nm">${Core.RESOURCE_LABEL[r]}</div>` +
        `<div class="cols"><span><b>${fmt(earned)}</b>${t('ledger.received')}</span><span><b>${fmt(spent[r])}</b>${t(s.spending?.complete?'ledger.spent':'ledger.spentRecorded')}</span><span><b>${fmt(s.inv[r])}</b>${t('ledger.held')}</span></div>` +
        `<div class="stack">${bar}</div><div class="sub">${from}</div></div></div>`;
    }
    return html;
  }

  const SPEND_NAME = {
    buildings: () => t('ledger.buildings'), props: () => t('ledger.props'),
    care: () => t('ledger.care'), restoration: () => t('ledger.restoration'), other: () => t('ledger.other'), tools: () => t('path.tools'), refining: () => t('path.refining'), abundance: () => t('path.abundance'), unlocks: () => t('path.unlocks')
  };
  const SPEND_LOOK = { care:'building.crystalChamber', restoration:'building.sleepingMachine', other:'path.tools', buildings: 'building.garden', props: 'mark.glowcap', tools: 'path.tools', refining: 'path.refining', abundance: 'path.abundance', unlocks: 'path.unlocks' };

  function spending(spend, historical = false) {
    if (!spend.length) return '';
    let html = `<div class="section">${t(historical?'ledger.historical':'ledger.spending')}<span class="headNote">${t(historical?'ledger.estimateNote':'ledger.recordedNote')}</span></div>`;
    for (const c of spend) {
      const slot = ['buildings','props','care','restoration'].includes(c.id) ? 'image' : undefined;
      html += row(pic(SPEND_LOOK[c.id], slot), SPEND_NAME[c.id](), cost(c.cost), '');
    }
    return html;
  }

  function bestBuys(s) {
    const buys = Core.bestBuys(s).slice(0, BEST_SHOWN);
    if (!buys.length) return '';
    let html = `<div class="section">${t('ledger.best')}<span class="headNote">${t('ledger.bestNote')}</span></div><p class="statementNote">${t('ledger.paybackNote')}</p>`;
    for (const b of buys) {
      const building = b.kind === 'building';
      const name = building ? Core.EXTRACTORS[b.id].name : Core.UPGRADES[b.id].name;
      const picture = building ? pic('building.' + b.id, 'image') : pic(Core.UPGRADES[b.id].look);
      const gain = Core.RESOURCES.filter((r) => b.gain[r] > 0.0005).map((r) => `+${rate(b.gain[r])} ${icon(r)}`).join(' ');
      const go = building || Core.UPGRADES[b.id].family !== 'tools' ? 'build' : 'upgrades';
      html += row(picture, esc(name), `<span class="ok">${gain}</span> &middot; ${t('ledger.paysBack', { time: fmtPayback(b.payback) })}<br>${price(s.inv, b.cost)}`,
        `<button class="buy go" type="button" data-goto="${go}">${t('sheet.' + go)}</button>`);
    }
    return html;
  }

  function render(s) {
    const inc = Core.incomeStatement(s);
    let html = `<p class="statementNote">${t('ledger.productionNote')}</p><div class="section">${t('ledger.income')}</div>`;
    for (const r of Core.RESOURCES) html += incomeSection(s,r,inc[r]);
    html += bestBuys(s) + account(s);
    html += `<p class="statementNote">${t(s.spending?.complete?'ledger.fullRecord':'ledger.partialRecord')}</p>`;
    html += spending(Core.recordedSpending(s));
    if (!s.spending?.complete) html += spending(Core.spendingStatement(s),true);
    return html + `<details class="mushroomCollection"><summary>${t('ledger.collection')}</summary>${mushroomCards(s)}</details>`;
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
        `<div class="sub">${seen ? (n > 0 ? t('sheet.mushroomPicked', { n: fmt(n) }) : t('sheet.mushroomElsewhere')) : esc(whereItGrows(m))}${m.magic && Core.contentLocked(s,'basket') ? '<br>'+t('progression.requirement') : ''}</div></div>`;
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
    // Wires investment links and chart inspection into the sheet body.
    attach(body, { go }) {
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
        if (b.dataset.goto) go(b.dataset.goto);
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
