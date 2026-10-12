/* The heads-up display: resource chips, goal banner, the contextual thumb
 * buttons, toasts and the controls tutorial. */

import * as Core from '../core/index.js';
import { fmt, fmt1 } from './format.js';
import { tutorialSeen, markTutorialSeen } from './storage.js';

const TOAST_SECONDS = 1.6;

export function createHud(el) {
  const chips = {};
  let toastLeft = 0;
  let lastAction = '';

  for (const r of Core.RESOURCES) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span class="ic">${Core.RESOURCE_ICON[r]}</span>` +
      `<span class="col"><span class="val">0</span><span class="lbl">${Core.RESOURCE_LABEL[r]}</span></span>` +
      '<span class="rate"></span>';
    el.resources.appendChild(chip);
    chips[r] = { val: chip.querySelector('.val'), rate: chip.querySelector('.rate') };
  }

  function openTutorial() { el.tutorial.hidden = false; }
  function closeTutorial() { el.tutorial.hidden = true; markTutorialSeen(); }
  el.tutorialClose.addEventListener('click', closeTutorial);
  el.tutorialDone.addEventListener('click', closeTutorial);
  if (!tutorialSeen()) openTutorial();

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  return {
    openTutorial,

    update(s) {
      const rates = Core.productionRates(s);
      for (const r of Core.RESOURCES) {
        setText(chips[r].val, fmt(s.inv[r]));
        setText(chips[r].rate, rates[r] > 0.01 ? '+' + fmt1(rates[r]) + '/s' : '');
      }
      setText(el.goal, Core.isUnderground(s)
        ? 'Depth ' + (Core.SURFACE - s.player.z) + ' · dig tunnels, gather, then choose your next shaft'
        : Core.currentGoal(s));
    },

    flashGoal() {
      el.goal.classList.add('flash');
      setTimeout(() => el.goal.classList.remove('flash'), 700);
    },

    // The big button names what holding it will do right now.
    updateButtons(s) {
      let icon = '—', label = 'EXPLORE', ready = false;
      const collect = Core.collectTarget(s);
      const harvest = !collect && Core.harvestTarget(s);
      if (collect) {
        icon = '\u{1F4E6}'; label = 'COLLECT ' + fmt(collect.total); ready = true;
      } else if (harvest) {
        icon = Core.RESOURCE_ICON[harvest.res]; label = 'GATHER +' + fmt(Core.gatherYield(s, harvest.res)); ready = true;
      } else if (Core.isUnderground(s)) {
        icon = '⛏️'; label = 'GATHER'; ready = true;
      }
      const key = icon + label + ready;
      if (key !== lastAction) {
        lastAction = key;
        el.actionIcon.textContent = icon;
        el.actionLabel.textContent = label;
        el.action.setAttribute('aria-label', label);
        el.action.classList.toggle('ready', ready);
        el.action.classList.toggle('disabled', !ready);
      }
      const below = Core.isUnderground(s);
      setText(el.mineIcon, below ? '⬆️' : '⛏️');
      setText(el.mineLabel, below ? 'SURFACE' : 'MINE');
      el.mine.setAttribute('aria-label', below ? 'Return to the forest' : 'Descend into the mine');
    },

    trailHint(count, underground) {
      el.trailHint.classList.add('active');
      if (underground) {
        el.trailHint.textContent = count
          ? count + (count === 1 ? ' rock tile' : ' rock tiles') + ' · release to dig'
          : 'Draw across nearby rock to preview';
      } else {
        el.trailHint.textContent = count
          ? count + (count === 1 ? ' green tile' : ' green tiles') + ' · release to sweep'
          : 'Draw anywhere · green tiles will sweep';
      }
    },

    hideTrailHint() {
      el.trailHint.classList.remove('active');
    },

    zoom(z) {
      setText(el.zoomLevel, Math.round(z * 100) + '%');
    },

    toast(msg) {
      el.toast.textContent = msg;
      el.toast.classList.add('show');
      toastLeft = TOAST_SECONDS;
    },

    tick(dt) {
      if (toastLeft > 0 && (toastLeft -= dt) <= 0) el.toast.classList.remove('show');
    }
  };
}
