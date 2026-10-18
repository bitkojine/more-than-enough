/* The heads-up display: the resource bar (tap a resource for what you
 * collected), the trophy button, the depth meter, the thumb cluster and
 * status toasts. Layout rules: docs/ui.md. The game hardly explains itself in
 * text (a one-line hint at most, see README); everything to read lives in the wiki. */

import * as Core from '../core/index.js';
import { fmt, fmtRate, fmtShort } from './format.js';
import { t, number } from '../i18n/i18n.js';

const TOAST_SECONDS = 2.4;
const MILESTONE_SECONDS = 6;
const GAUGE_BARS = 12; // the most layers the depth gauge shows at once

// The layer button, by what it will do: [icon, label, aria-label].
const LAYER_BUTTON = {
  down: ['ui.climbDown', t('button.climbDown'), t('button.climbDown.aria')],
  up: ['ui.climb', t('button.climbUp'), t('button.climbUp.aria')]
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
  let showing = null; // the number of the milestone on the banner (0: only what's next)

  function nextMilestone() {
    const next = milestones.shift();
    showing = next ? next.number : null;
    el.milestone.hidden = !next;
    milestoneLeft = next ? MILESTONE_SECONDS : 0;
    if (!next) return placeToast();
    // A milestone reached says what comes next; at the start, what's next is all it says.
    el.milestone.querySelector('.label').textContent = t(next.number ? 'hud.milestone' : 'hud.nextMilestone');
    el.milestone.querySelector('.of').textContent = next.number ? t('hud.milestoneOf', { n: next.number, total: next.total }) : '';
    el.milestone.querySelector('strong').textContent = next.text;
    el.milestone.querySelector('.next').textContent = next.then ? t('hud.then', { goal: next.then }) : '';
    // Restart the entrance animation for each one.
    el.milestone.style.animation = 'none';
    void el.milestone.offsetWidth;
    el.milestone.style.animation = '';
    placeToast();
  }
  // A message goes under the milestone banner while one is up, not over it.
  function placeToast() {
    const m = el.milestone;
    el.toast.style.top = m.hidden ? '' : m.offsetTop + m.offsetHeight + 8 + 'px';
  }
  let lastAction = '';
  let inSight = false; // something to gather in sight for Explore to head to

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
    chip.setAttribute('aria-label', t('hud.chip', { res: Core.RESOURCE_LABEL[r] }));
    chip.innerHTML = `<span class="top"><img class="ic" data-look="${Core.resourceLook(r)}" alt=""><span class="val">0</span></span>` +
      '<span class="rate"></span>';
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
        setText(chips[r].val, fmtShort(s.inv[r]));
        setText(chips[r].rate, rates[r] > 0.01 ? '+' + fmtRate(rates[r], true) + '/s' : '');
      }
      // A dot on BUILD and UPGRADE when there's something in there you can
      // do right now, so the sheet is worth opening.
      el.upgrade.classList.toggle('has', Core.PATH_FAMILIES.some((f) => f.layer === 'world' && Core.pathProgress(s, f.id).canBuy));
      el.build.classList.toggle('has', [...Core.DEPOSIT_EXTRACTORS, ...Core.CONVERTERS].some((k) => {
        const def = Core.EXTRACTORS[k];
        return (!def.unlock || s.unlocks[def.unlock]) && Core.canAfford(s.inv, Core.extractorCost(s, k)) && !!Core.buildTarget(s, k);
      }));
      setText(el.awardCount, String(s.goalIndex));
      el.awards.classList.toggle('has', Core.nextGoalReady(s));
      const below = Core.isUnderground(s);
      inSight = !below && !!Core.nearestWork(s);
      el.depth.hidden = !below;
      if (below) setText(el.depth, '▼ ' + (Core.SURFACE - s.player.z));
      updateGauge(s);
    },

    // The big button shows what holding it will do right now.
    updateButtons(s) {
      let icon = 'ui.gather', label = t('button.explore'), ready = false;
      const collect = Core.collectTarget(s);
      const harvest = !collect && Core.harvestTarget(s);
      if (collect) {
        icon = 'ui.collect'; label = t('button.collect', { n: fmt(collect.total) }); ready = true;
      } else if (harvest) {
        icon = harvest.res ? Core.resourceLook(harvest.res) : 'ui.gather'; label = t('button.gatherYield', { n: fmt(Core.gatherYield(s, harvest.res)) }); ready = true;
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
      // Zoom as a magnification (1×, 1.25×, 0.64×), beside a magnifier.
      const zoom = number(+cam.zoom.toFixed(2)) + '×';
      setText(el.zoomText, zoom);
      el.zoomLevel.setAttribute('aria-label', t('hud.zoomLevel', { zoom }));
    },

    // Status only (e.g. a save that couldn't be read), never instructions.
    // A milestone reached (the `number`th of `total`): a banner under the counters for
    // MILESTONE_SECONDS, several in a row taking turns, and the trophy
    // counter glows until the Awards are looked at.
    // `then`: the milestone after it, if any.
    milestone(text, number, total, then = null) {
      // Reached ones take over from a banner that only said what's next.
      for (let i = milestones.length - 1; i >= 0; i--) if (!milestones[i].number) milestones.splice(i, 1);
      milestones.push({ text, number, total, then });
      el.awards.classList.add('new');
      if (milestoneLeft <= 0 || showing === 0) nextMilestone();
    },

    // The milestone to go for, in the same banner: a new character's first
    // sight, so the first thing they read is what to do.
    nextUp(text) {
      milestones.push({ text, number: 0 });
      if (milestoneLeft <= 0) nextMilestone();
    },

    // Another world swapped in: milestones from the old one mean nothing here.
    newWorld() {
      milestones.length = 0;
      nextMilestone();
      el.awards.classList.remove('new');
    },

    // The Awards were looked at.
    awardsSeen() {
      el.awards.classList.remove('new');
    },

    // Walked into a region (or woke up in one): its name across the upper
    // middle of the screen for a few seconds, the way an old map names a land.
    place(kind, name) {
      el.place.querySelector('small').textContent = kind;
      el.place.querySelector('strong').textContent = name;
      el.place.hidden = false;
      el.place.style.animation = 'none';
      void el.place.offsetWidth;
      el.place.style.animation = '';
    },

    toast(msg, seconds = TOAST_SECONDS) {
      el.toast.textContent = msg;
      el.toast.classList.add('show');
      placeToast();
      toastLeft = seconds;
    },

    // A milestone banner is up (a hint would only be covered by it).
    get celebrating() { return milestoneLeft > 0; },

    tick(dt) {
      if (toastLeft > 0 && (toastLeft -= dt) <= 0) el.toast.classList.remove('show');
      if (milestoneLeft > 0 && (milestoneLeft -= dt) <= 0) nextMilestone();
    }
  };
}
