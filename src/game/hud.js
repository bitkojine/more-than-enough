/* The heads-up display: the resource bar (tap it for the earnings
 * statement), the trophy button, the depth meter and the thumb cluster.
 * What it says (milestones, notices) goes in the message log (messages.js).
 * Layout rules: docs/ui.md. The game hardly explains itself in
 * text (a one-line hint at most, see README); everything to read lives in the wiki. */

import * as Core from '../core/index.js';
import { fmtClock, fmtRate, fmtShort } from './format.js';
import { t, number } from '../i18n/i18n.js';

const GAUGE_BARS = 12; // the most layers the depth gauge shows at once

// The layer button, by what it will do: [icon, label, aria-label].
const LAYER_BUTTON = {
  down: ['ui.climbDown', t('button.climbDown'), t('button.climbDown.aria')],
  up: ['ui.climb', t('button.climbUp'), t('button.climbUp.aria')]
};

// Every <img data-look="id" [data-slot="slot"]> on the page shows that
// thing's picture from the game's pack.
export function paintIcons(look, root = document) {
  for (const img of root.querySelectorAll('img[data-look]')) img.src = look.src(img.dataset.look, img.dataset.slot || 'icon');
}

export function createHud(el, look, messages) {
  const chips = {};
  let autoTipLeft = 0;
  let lastAction = '', lastPerfect = '';
  let inSight = false; // something to gather in sight for Explore to head to

  // The plate under the big button is as wide as its words need, but it must
  // stay clear of the screen's edge and of the plates beside it: a big yield
  // in a long language would otherwise run off or overlap. It grows into the
  // free space and shrinks only when it has to (docs/ui.md).
  function fitCap() {
    const plate = el.actionLabel;
    const b = el.action.getBoundingClientRect();
    if (!b.width) { plate.style.setProperty('--cap-scale', 1); return; }
    const mid = b.left + b.width / 2;
    const top = plate.getBoundingClientRect().top;
    let room = 2 * Math.min(innerWidth - mid - 1, mid - 1);
    for (const other of document.querySelectorAll('#controls button, #controls .cap')) { // i18n-ok: CSS selectors
      if (other === el.action || other === plate) continue;
      const r = other.getBoundingClientRect();
      if (r.width && r.right <= b.left && r.bottom > top) room = Math.min(room, 2 * (mid - r.right - 2));
    }
    const w = plate.offsetWidth;
    plate.style.setProperty('--cap-scale', w > room ? Math.max(room, 1) / w : 1);
  }

  // The depth gauge, underground: one bar per layer from the forest (green,
  // on top) down to the deepest you've been, plus one for deeper still; at
  // most GAUGE_BARS, kept around you. Yours is lit, with a marker beside it.
  let lastGauge = '';
  function updateGauge(s) {
    const deepest = s.underground.deepest, z = s.player.z;
    const key = z < Core.SURFACE ? deepest + ',' + z : '';
    if (key === lastGauge) return;
    lastGauge = key;
    el.depthGauge.hidden = !key;
    if (!key) return;
    let top = Core.SURFACE, bottom = Math.max(Core.Z_MIN, deepest - 1);
    if (top - bottom + 1 > GAUGE_BARS) {
      top = Math.min(Core.SURFACE, z + (GAUGE_BARS >> 1));
      bottom = top - GAUGE_BARS + 1;
    }
    let html = '';
    for (let k = top; k >= bottom; k--) {
      const cls = k === z ? 'here' : k === Core.SURFACE ? 'forest' : k < deepest ? 'deeper' : '';
      html += cls ? `<i class="${cls}"></i>` : '<i></i>';
    }
    el.depthGauge.innerHTML = html;
  }

  // The battery, once it isn't full: how much is left, and whether a
  // charger is filling it. The first time your light starts to shrink, one
  // line says where to charge it.
  let lastBattery = '', warned = false;
  function updateBattery(s) {
    const pct = Math.round(s.battery * 100);
    const charging = !!Core.chargerNear(s) && pct < 100;
    const key = pct < 100 ? pct + (charging ? 'c' : '') : '';
    if (key === lastBattery) return;
    lastBattery = key;
    el.battery.hidden = !key;
    if (!key) return;
    el.battery.querySelector('b').style.width = pct + '%';
    setText(el.battery.querySelector('span'), number(pct) + '%');
    el.battery.classList.toggle('low', s.battery < Core.BATTERY_LOW);
    el.battery.classList.toggle('flat', s.battery < 0.1);
    el.battery.classList.toggle('charging', charging);
    el.battery.setAttribute('aria-label', t(charging ? 'hud.batteryCharging' : 'hud.battery', { n: number(pct) }));
    if (s.battery < Core.BATTERY_LOW && !charging && !warned) {
      warned = true;
      hud.toast(t('toast.batteryLow'));
    } else if (s.battery >= Core.BATTERY_LOW) warned = false;
  }

  for (const r of Core.RESOURCES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.res = r;
    chip.setAttribute('aria-label', t('hud.chip', { res: Core.RESOURCE_LABEL[r] }));
    chip.innerHTML = `<span class="top"><img class="ic" data-look="${Core.resourceLook(r)}" alt=""><span class="val">0</span></span>` +
      '<span class="rate"></span>';
    el.resources.appendChild(chip);
    chips[r] = { val: chip.querySelector('.val'), rate: chip.querySelector('.rate') };
  }
  // A small chart at the bar's end says the bar opens the earnings statement.
  const ledger = document.createElement('button');
  ledger.type = 'button';
  ledger.className = 'chip ledger'; // i18n-ok: class names
  ledger.setAttribute('aria-label', t('hud.statement'));
  ledger.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13.5h12M3.5 11l3-3.5 2.5 2 3.5-5" /><path d="M10 4.5h2.5V7" /></svg>';
  el.resources.appendChild(ledger);

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  // A thing with no icon (a prop, say) shows its picture.
  function setIcon(img, id) {
    const src = look.src(id) || look.src(id, 'image');
    if (img.getAttribute('src') !== src) img.src = src;
    img.dataset.look = id;
  }

  // The sun clock round the gear (docs/ui.md): gold the part of the day the
  // sun works (it charges a solar panel; in a crystal world it cracks crystal
  // in the open), blue the rest, noon at the top, and the sun or the moon
  // riding the ring where the day is. Beside a solar panel, a pill under it
  // counts down to when the sun starts or stops charging.
  const RING = 19;
  el.settings.insertAdjacentHTML('afterbegin', '<svg class="dayRing" viewBox="-22 -22 44 44" aria-hidden="true">' +
    '<path class="day" /><path class="night" /><g class="body"><circle class="disc" cy="-19" r="4" /><circle class="shade" cx="1.9" cy="-20.3" r="3.2" /></g></svg>');
  const ring = el.settings.querySelector('.dayRing'), body = ring.querySelector('.body');
  const at = (a) => (RING * Math.sin(a)).toFixed(2) + ' ' + (-RING * Math.cos(a)).toFixed(2);
  const arc = (a0, a1) => `M${at(a0)} A${RING} ${RING} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${at(a1)}`;
  let lastLevel = -1, lastTurn = '', lastSunTime = '';
  function updateSun(s) {
    const level = s.cultivation ? Core.SUN_CRACKS : Core.SOLAR_LIGHT;
    const sun = Core.sunWindow(s.time, level);
    if (level !== lastLevel) {
      lastLevel = level;
      const a = (sun.half / Core.DAY_LENGTH) * 2 * Math.PI;
      ring.querySelector('.day').setAttribute('d', arc(-a, a));
      ring.querySelector('.night').setAttribute('d', arc(a, 2 * Math.PI - a));
    }
    const deg = (sun.phase * 360).toFixed(1);
    if (deg + sun.up !== lastTurn) {
      lastTurn = deg + sun.up;
      body.setAttribute('transform', `rotate(${deg})`);
      body.classList.toggle('sun', sun.up);
    }
    const solar = Core.solarInReach(s) ? Core.sunWindow(s.time) : null;
    const text = solar ? t(solar.up ? 'hud.sunLeft' : 'hud.sunIn', { t: fmtClock(solar.left) }) : '';
    if (text === lastSunTime) return;
    lastSunTime = text;
    el.sunTime.hidden = !text;
    document.body.classList.toggle('sunTime', !!text);
    if (!text) return;
    el.sunTime.classList.toggle('up', solar.up);
    setText(el.sunTime.lastElementChild, text);
    el.sunTime.setAttribute('aria-label', t(solar.up ? 'hud.sunLeft.aria' : 'hud.sunIn.aria', { t: fmtClock(solar.left) }));
  }

  const hud = {
    // The pictures loaded: repaint every one.
    repaint() {
      paintIcons(look);
      lastAction = '';
    },

    update(s) {
      const rates = Core.productionRates(s);
      for (const r of Core.RESOURCES) {
        setText(chips[r].val, fmtShort(s.inv[r]));
        setText(chips[r].rate, rates[r] > 0.01 ? '+' + fmtRate(rates[r], true) + '/s' : '');
      }
      setText(el.awardCount, String(s.goalIndex));
      const below = Core.isUnderground(s);
      inSight = !below && !!Core.nearestWork(s);
      updateBattery(s);
      updateSun(s);
      el.depth.hidden = !below;
      document.body.classList.toggle('below', below);
      if (below) {
        setText(el.depth.lastElementChild, number(Core.SURFACE - s.player.z));
        el.depth.setAttribute('aria-label', t('hud.layerN', { n: Core.SURFACE - s.player.z }) + '. ' + t('map.title'));
      }
      updateGauge(s);
    },

    // NEW on BUILD and UPGRADE (src/game/fresh.js says when).
    fresh(news) {
      el.build.classList.toggle('has', news.build);
      el.upgrade.classList.toggle('has', news.upgrades);
    },

    // AUTO (the Perfect button) above Gather: its badge shows what holding
    // it does right now (`badge`, a look id), a gold ring turns while it's
    // held, and it glows when the world is ready to Embark, which is yours
    // to press.
    perfect(badge, held) {
      const key = badge + held;
      if (key === lastPerfect) return;
      lastPerfect = key;
      setIcon(el.perfectBadge, badge);
      el.perfect.classList.toggle('embark', badge === 'ui.embark');
      el.perfect.classList.toggle('on', !!held);
    },

    // The big button shows what holding it will do right now.
    updateButtons(s) {
      let icon = 'ui.gather', label = t('button.explore'), ready = false;
      const collect = Core.collectTarget(s);
      const harvest = !collect && Core.harvestTarget(s);
      if (collect) {
        icon = 'ui.collect'; label = t('button.collect', { n: fmtShort(collect.total) }); ready = true;
      } else if (harvest) {
        // Plain rock pays nothing, so it gets no "+n" (it once read +NaNeNaN).
        icon = harvest.res ? Core.resourceLook(harvest.res) : 'ui.gather';
        label = harvest.res ? t('button.gatherYield', { n: fmtShort(Core.gatherYield(s, harvest.res)) }) : t('button.gather');
        ready = true;
      } else if (Core.isUnderground(s)) {
        label = t('button.gather'); ready = true;
      }
      const key = icon + label + ready + inSight;
      if (key !== lastAction) {
        lastAction = key;
        setIcon(el.actionIcon, icon);
        el.actionLabel.textContent = label;
        el.action.setAttribute('aria-label', label);
        el.action.classList.toggle('ready', ready);
        el.action.classList.toggle('disabled', !ready && !inSight);
        fitCap();
      }
      // The layer button shows only beside a way between layers, and says
      // which way it goes.
      const way = Core.layerWay(s);
      el.mine.hidden = !way;
      if (way) {
        const [mineIcon, mineLabel, mineAria] = LAYER_BUTTON[way.up ? 'up' : 'down'];
        setIcon(el.mineIcon, mineIcon);
        setText(el.mineLabel, mineLabel);
        el.mine.setAttribute('aria-label', mineAria);
      }
    },

    view(cam) {
      // Zoom as a magnification (1×, 1.25×, 0.64×, 8.3×; out on the world
      // map two figures, 0.021×), beside a magnifier.
      const zoom = number(+(cam.zoom < 0.1 ? cam.zoom.toPrecision(2) : cam.zoom.toFixed(cam.zoom >= 3 ? 1 : 2))) + '×';
      setText(el.zoomText, zoom);
      el.zoomLevel.setAttribute('aria-label', t('hud.zoomLevel', { zoom }));
    },

    // The screen is a different size now: the plate under the big button may
    // no longer fit, so it is measured again.
    fit() { fitCap(); },

    // A milestone reached (the `number`th of `total`): a gold line in the
    // log, and the trophy counter glows until the Awards are looked at.
    // `then`: the milestone after it, if any.
    milestone(text, number, total, then = null) {
      messages.add({ kind: 'milestone', text, of: t('hud.milestoneOf', { n: number, total }), then });
      el.awards.classList.add('new');
    },

    // The milestone to go for: a new character's first sight, so the first
    // thing they read is what to do.
    nextUp(text) { messages.add({ kind: 'goal', text }); },

    // Another world swapped in (its log is its own).
    newWorld() { el.awards.classList.remove('new'); },

    // The Awards were looked at.
    awardsSeen() {
      el.awards.classList.remove('new');
    },

    // Arriving on another layer: its name, briefly, where region names go
    // (the forest gives the region you come up in).
    layer(z, region) {
      if (z === Core.SURFACE) this.place(t('hud.forest'), region, true);
      else this.place(t('hud.underground'), t('hud.layerN', { n: Core.SURFACE - z }), true);
    },

    // Walked into a region (or woke up in one): its name across the upper
    // middle of the screen for a few seconds, the way an old map names a land.
    // `brief` for a layer's name, which goes sooner.
    place(kind, name, brief = false) {
      el.place.classList.toggle('brief', brief);
      el.place.querySelector('small').textContent = kind;
      el.place.querySelector('strong').textContent = name;
      el.place.hidden = false;
      el.place.style.animation = 'none';
      void el.place.offsetWidth;
      el.place.style.animation = '';
    },

    // The bubble over AUTO saying it must be held, for `seconds` (0 hides it).
    autoTip(seconds) {
      if (seconds) el.autoTip.textContent = t('tip.auto');
      el.autoTip.hidden = !seconds;
      autoTipLeft = seconds;
    },

    // A notice from the game (status, never instructions): a line in the log.
    toast(msg) { messages.add({ kind: 'game', text: msg }); },

    tick(dt) {
      if (autoTipLeft > 0 && (autoTipLeft -= dt) <= 0) el.autoTip.hidden = true;
    }
  };
  return hud;
}
