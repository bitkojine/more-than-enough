/* The heads-up display: resource chips, the depth marker, the contextual
 * thumb buttons and status toasts. The game never explains itself in text;
 * everything to read lives in the wiki. */

import * as Core from '../core/index.js';
import { fmt, fmt1 } from './format.js';

const TOAST_SECONDS = 2.4;
const MILESTONE_SECONDS = 3.5;

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
    const text = milestones.shift();
    el.milestone.hidden = !text;
    milestoneLeft = text ? MILESTONE_SECONDS : 0;
    if (!text) return;
    el.milestone.querySelector('strong').textContent = text;
    // Restart the entrance animation for each one.
    el.milestone.style.animation = 'none';
    void el.milestone.offsetWidth;
    el.milestone.style.animation = '';
  }
  let lastAction = '';

  for (const r of Core.RESOURCES) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.setAttribute('aria-label', Core.RESOURCE_LABEL[r]);
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
      const below = Core.isUnderground(s);
      el.depth.hidden = !below;
      if (below) setText(el.depth, '▼ ' + (Core.SURFACE - s.player.z));
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
      const below = Core.isUnderground(s);
      setIcon(el.mineIcon, below ? 'ui.climb' : 'ui.dig');
      setText(el.mineLabel, below ? 'UP' : 'MINE');
      el.mine.setAttribute('aria-label', below ? 'Climb up a layer' : 'Dig down into the mine');
      el.mine.classList.toggle('disabled', !(below ? Core.canGoUp(s) : Core.canGoDown(s)));
      el.mine.classList.toggle('digging', !!s.digging);
      el.mine.style.setProperty('--dig', Core.digProgress(s).toFixed(3));
    },

    view(cam) {
      setText(el.zoomLevel, Math.round(cam.zoom * 100) + '%');
      el.tilt.setAttribute('aria-pressed', String(cam.tiltTarget > 0.5));
    },

    // Status only (e.g. a save that couldn't be read), never instructions.
    // A milestone reached: shown under the counters for MILESTONE_SECONDS;
    // several in a row take turns.
    milestone(text) {
      milestones.push(text);
      if (milestoneLeft <= 0) nextMilestone();
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
