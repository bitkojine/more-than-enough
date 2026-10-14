/* The heads-up display: resource chips (tap one for what you collected),
 * the depth marker, the contextual
 * thumb buttons and status toasts. The game never explains itself in text;
 * everything to read lives in the wiki. */

import * as Core from '../core/index.js';
import { fmt, fmt1 } from './format.js';

const TOAST_SECONDS = 2.4;
const MILESTONE_SECONDS = 6;
const GAUGE_BARS = 12; // the most layers the depth gauge shows at once

// The layer button, by what it will do: [icon, label, aria-label].
const LAYER_BUTTON = {
  down: ['ui.climbDown', 'CLIMB DOWN', 'Climb down the hole'],
  up: ['ui.climb', 'CLIMB UP', 'Climb up the ladder']
};

// Every <img data-look="id" [data-slot="slot"]> on the page shows that
// thing's picture from the current texture pack.
export function paintIcons(look, root = document) {
  for (const img of root.querySelectorAll('img[data-look]')) img.src = look.src(img.dataset.look, img.dataset.slot || 'icon');
}

export function createHud(el, look) {
  const chips = {};
  let toastLeft = 0;
  const milestones = []; // reached, waiting to be shown
  let milestoneLeft = 0;

  function nextMilestone() {
    const next = milestones.shift();
    el.milestone.hidden = !next;
    milestoneLeft = next ? MILESTONE_SECONDS : 0;
    if (!next) return;
    el.milestone.querySelector('strong').textContent = next.text;
    el.milestone.querySelector('.of').textContent = next.number + ' of ' + (Core.GOALS.length - 1);
    // Restart the entrance animation for each one.
    el.milestone.style.animation = 'none';
    void el.milestone.offsetWidth;
    el.milestone.style.animation = '';
  }
  let lastAction = '';

  // The depth gauge: one bar per layer from the forest down to the deepest
  // you've been, plus one for deeper still; at most GAUGE_BARS, kept around you.
  let lastGauge = '';
  function updateGauge(s) {
    const deepest = s.underground.deepest, z = s.player.z;
    const key = deepest < Core.SURFACE ? deepest + ',' + z : '';
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
      const cls = k === z ? 'here' : k === Core.SURFACE ? 'surface' : k < deepest ? 'deeper' : '';
      html += cls ? `<i class="${cls}"></i>` : '<i></i>';
    }
    el.depthGauge.innerHTML = html;
  }

  for (const r of Core.RESOURCES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.res = r;
    chip.setAttribute('aria-label', Core.RESOURCE_LABEL[r] + ': see what you collected');
    chip.innerHTML = `<img class="ic" data-look="${Core.resourceLook(r)}" alt="">` +
      '<span class="col"><span class="val">0</span></span><span class="rate"></span>';
    el.resources.appendChild(chip);
    chips[r] = { val: chip.querySelector('.val'), rate: chip.querySelector('.rate') };
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function setIcon(img, id) {
    const src = look.src(id);
    if (img.getAttribute('src') !== src) img.src = src;
    img.dataset.look = id;
  }

  return {
    // The texture pack changed: repaint every picture.
    repaint() {
      paintIcons(look);
      lastAction = '';
    },

    update(s) {
      const rates = Core.productionRates(s);
      for (const r of Core.RESOURCES) {
        setText(chips[r].val, fmt(s.inv[r]));
        setText(chips[r].rate, rates[r] > 0.01 ? '+' + fmt1(rates[r]) + '/s' : '');
      }
      // A dot on BUILD and UPGRADE when there's something in there you can
      // do right now, so the sheet is worth opening.
      el.upgrade.classList.toggle('has', Core.PATH_FAMILIES.some((f) => f.layer === 'world' && Core.pathProgress(s, f.id).canBuy));
      el.build.classList.toggle('has', [...Core.DEPOSIT_EXTRACTORS, ...Core.CONVERTERS].some((k) => {
        const def = Core.EXTRACTORS[k];
        return (!def.unlock || s.unlocks[def.unlock]) && Core.canAfford(s.inv, Core.extractorCost(s, k)) && !!Core.buildTarget(s, k);
      }));
      setText(el.awardCount, String(s.goalIndex));
      const below = Core.isUnderground(s);
      el.depth.hidden = !below;
      if (below) setText(el.depth, '▼ ' + (Core.SURFACE - s.player.z));
      updateGauge(s);
    },

    // The big button shows what holding it will do right now.
    updateButtons(s) {
      let icon = 'ui.gather', label = 'EXPLORE', ready = false;
      const collect = Core.collectTarget(s);
      const harvest = !collect && Core.harvestTarget(s);
      if (collect) {
        icon = 'ui.collect'; label = 'COLLECT ' + fmt(collect.total); ready = true;
      } else if (harvest) {
        icon = harvest.res ? Core.resourceLook(harvest.res) : 'ui.gather'; label = 'GATHER +' + fmt(Core.gatherYield(s, harvest.res)); ready = true;
      } else if (Core.isUnderground(s)) {
        label = 'GATHER'; ready = true;
      }
      const key = icon + label + ready;
      if (key !== lastAction) {
        lastAction = key;
        setIcon(el.actionIcon, icon);
        el.actionLabel.textContent = label;
        el.action.setAttribute('aria-label', label);
        el.action.classList.toggle('ready', ready);
        el.action.classList.toggle('disabled', !ready);
      }
      // The layer button says which way it goes: down from the forest, up
      // from below. It only works on a way you've found.
      const way = Core.layerWay(s);
      const [mineIcon, mineLabel, mineAria] = LAYER_BUTTON[way.up ? 'up' : 'down'];
      setIcon(el.mineIcon, mineIcon);
      setText(el.mineLabel, mineLabel);
      el.mine.setAttribute('aria-label', mineAria);
      el.mine.classList.toggle('disabled', !way.ok);
    },

    view(cam) {
      // Zoom as a magnification (1×, 1.25×, 0.64×), beside a magnifier.
      const zoom = +cam.zoom.toFixed(2) + '×';
      setText(el.zoomText, zoom);
      el.zoomLevel.setAttribute('aria-label', 'Zoom ' + zoom + ', tap to reset');
      el.tilt.setAttribute('aria-pressed', String(cam.tiltTarget > 0.5));
    },

    // Status only (e.g. a save that couldn't be read), never instructions.
    // A milestone reached (the `number`th): a banner under the counters for
    // MILESTONE_SECONDS, several in a row taking turns, and the trophy
    // counter glows until the Awards are looked at.
    milestone(text, number) {
      milestones.push({ text, number });
      el.awards.classList.add('new');
      if (milestoneLeft <= 0) nextMilestone();
    },

    // The Awards were looked at.
    awardsSeen() {
      el.awards.classList.remove('new');
    },

    toast(msg) {
      el.toast.textContent = msg;
      el.toast.classList.add('show');
      toastLeft = TOAST_SECONDS;
    },

    tick(dt) {
      if (toastLeft > 0 && (toastLeft -= dt) <= 0) el.toast.classList.remove('show');
      if (milestoneLeft > 0 && (milestoneLeft -= dt) <= 0) nextMilestone();
    }
  };
}
