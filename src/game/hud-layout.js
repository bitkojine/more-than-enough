/* Shared space policy for semantic HUD groups. Only presentation changes:
 * core actions, world rules, and the player's disclosure choices stay intact. */
import { setChipCompact } from './players.js';

export const HUD_COLLAPSE_ORDER = ['performance', 'friends', 'status', 'messages'];

// O(1), independent of world size. Groups yield detail in one fixed order.
export function hudSpacePlan({ room, status = 0, performance = 0, friends = 0, messages = 0 }) {
  const fits = () => Math.max(status, 24 + performance + friends) + messages + 12 <= room;
  let level = 0;
  while (!fits() && level < HUD_COLLAPSE_ORDER.length) {
    level++;
    if (level === 1) performance = performance ? 24 : 0;
    if (level === 2) friends = 0; // the compact count shares the metadata row
    if (level === 3) status = status ? 44 : 0;
    if (level === 4) messages = messages ? 44 : 0;
  }
  return { level, performance: level >= 1, friends: level >= 2, status: level >= 3, messages: level >= 4 };
}

export function createHudLayout({ el, messages, openCrafting, openPerformance, beforeOpen = () => {} }) {
  const body = document.body, top = document.getElementById('topbar');
  const secondary = document.getElementById('hudSecondary');
  const tray = el.equipmentTray;
  let dirty = true, signature = '', lastLevel = -1, measurements = 0;
  const mark = () => { dirty = true; };
  const visible = node => !node.hidden;
  const css = (name, value) => { if (body.style.getPropertyValue(name) !== value) body.style.setProperty(name, value); };
  const setGear = on => {
    if (tray.hidden === !on) return;
    if (on) beforeOpen();
    tray.hidden = !on; body.classList.toggle('equipment-open', on);
    if (on) messages.setCompact(true, { resetPeek: true });
    el.upgrade.setAttribute('aria-expanded', String(on));
    mark();
  };
  el.upgrade.addEventListener('click', () => setGear(tray.hidden));
  el.equipmentClose.addEventListener('click', () => { setGear(false); el.upgrade.focus(); });
  el.equipmentCraft.addEventListener('click', () => { setGear(false); openCrafting(); });
  for (const type of ['pointerdown', 'wheel']) tray.addEventListener(type, e => e.stopPropagation(), { passive: true });
  document.addEventListener('pointerdown', e => {
    if (!tray.hidden && !tray.contains(e.target) && !el.upgrade.contains(e.target)) setGear(false);
  }, { passive: true });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !tray.hidden) { setGear(false); e.stopImmediatePropagation(); el.upgrade.focus(); } }, true); // i18n-ok: keyboard event key names.
  el.perf.tabIndex = 0; el.perf.setAttribute('role', 'button');
  el.perf.addEventListener('click', openPerformance);
  el.perf.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPerformance(); } }); // i18n-ok: keyboard event key names.
  const resize = new ResizeObserver(mark);
  for (const node of [top, secondary, tray]) resize.observe(node);
  window.addEventListener('resize', mark);

  function tick() {
    const stamp = [innerWidth, innerHeight, messages.open, messages.expanded, body.classList.contains('placing'), body.classList.contains('signing'), body.classList.contains('mapping'), el.sheet.classList.contains('open'), ...[el.battery, el.depth, el.depthGauge, el.perf, el.mine, el.perfect, el.lantern, el.flare, tray, document.getElementById('friends')].map(n => n.hidden), el.depthGauge.children.length, el.battery.querySelector('span').textContent].join(':');
    if (stamp !== signature) { signature = stamp; mark(); }
    if (!dirty) return;
    dirty = false; measurements++;
    if (el.sheet.classList.contains('open') || body.classList.contains('placing') || body.classList.contains('signing') || body.classList.contains('mapping')) setGear(false);
    const action = el.action.getBoundingClientRect();
    const edgeBottom = Math.max(0, innerHeight - action.bottom);
    const act = action.height;
    const short = innerHeight <= 500;
    // Equipment shares the HUD with Messages rather than hiding it. On tall
    // screens its tray spans the message column, so reserve space above it.
    const messageBottom = Math.max(edgeBottom + act + (short ? 16 : 78),
      !tray.hidden && !short ? innerHeight - tray.getBoundingClientRect().top + 8 : 0);
    const topEnd = top.getBoundingClientRect().bottom;
    const bars = el.depthGauge.hidden ? 0 : el.depthGauge.children.length;
    const status = el.depth.hidden ? 0 : 48 + (bars ? bars * 11 + 18 : 0);
    const plan = hudSpacePlan({ room: innerHeight - messageBottom - topEnd - 8,
      status, performance: visible(el.perf) ? 110 : 0,
      friends: visible(document.getElementById('friends')) ? 34 : 0,
      messages: !tray.hidden ? 44 : messages.open ? 100 : 44 });
    if (body.classList.contains('placing') || (!tray.hidden && short)) {
      plan.level = Math.max(3, plan.level); plan.performance = true; plan.status = true; plan.friends = true;
    }
    if (plan.level !== lastLevel) {
      lastLevel = plan.level; body.dataset.hudLevel = String(plan.level);
      setChipCompact(document.getElementById('friends'), plan.friends);
    }
    messages.setCompact(plan.messages || !tray.hidden);
    body.classList.toggle('hud-reading', tray.hidden && plan.messages && messages.expanded && !body.classList.contains('placing'));
    const safeTop = Math.max(topEnd, secondary.getBoundingClientRect().bottom) + 10;
    css('--hud-message-bottom', messageBottom + 'px');
    css('--hud-message-room', Math.max(40, innerHeight - messageBottom - safeTop) + 'px');
    // Existing bubble timing/queue is unchanged; its paint stays in HUD space.
    css('--hud-preview-room', Math.max(24, innerHeight - messageBottom - 52 - safeTop) + 'px');
    css('--hud-top-end', safeTop + 'px');
    css('--hud-topbar-end', topEnd + 'px');
    css('--hud-tray-bottom', (edgeBottom + act + 18) + 'px');
    css('--hud-tray-room', Math.max(44, innerHeight - edgeBottom - act - 18 - topEnd - 8) + 'px');
    if (el.gearStatus.hidden !== el.battery.hidden) el.gearStatus.hidden = el.battery.hidden;
    const charge = el.battery.querySelector('span').textContent;
    if (el.gearStatus.textContent !== charge) el.gearStatus.textContent = charge;
    el.gearStatus.classList.toggle('low', el.battery.classList.contains('low'));
    el.perf.setAttribute('aria-label', el.perf.textContent.split('\n')[0]);
    messages.fit();
  }
  return { tick, invalidate: mark, close: () => setGear(false), toggle: () => setGear(tray.hidden), get open() { return !tray.hidden; }, get level() { return lastLevel; }, get measurements() { return measurements; } };
}
