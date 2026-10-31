/* Shared space policy for semantic HUD groups. Only presentation changes:
 * core actions, world rules, and the player's disclosure choices stay intact. */
import { setChipCompact } from './players.js';
import { createHudPanels } from './hud-panels.js';

export const HUD_COLLAPSE_ORDER = ['performance', 'friends', 'status', 'messages'];
const wideHud = (width, height) => width >= 1024 && height > 500;

// Region bounds depend only on the viewport and permanent HUD, never on an
// open card, unread count or notification content. Work is constant-sized.
export function hudRegions({ width, height, edgeBottom, action }) {
  const wide = wideHud(width, height);
  const landscape = height <= 500;
  const messageBottom = edgeBottom + (landscape ? 0 : action + 16);
  const logBottom = landscape ? edgeBottom + action + 8 : messageBottom;
  const previewHeight = landscape ? 64 : wide ? 128 : 80;
  return { wide, landscape, messageBottom, logBottom, previewHeight };
}

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
  return {
    level,
    performance: level >= 1,
    friends: level >= 2,
    status: level >= 3,
    messages: level >= 4
  };
}

export function createHudLayout({ el, messages, openCrafting, beforeOpen = () => {} }) {
  const body = document.body,
    top = document.getElementById('topbar');
  const secondary = document.getElementById('hudSecondary');
  const tray = el.equipmentTray;
  let dirty = true,
    signature = '',
    lastLevel = -1,
    measurements = 0;
  const mark = () => {
    dirty = true;
  };
  const visible = (node) => !node.hidden;
  const css = (name, value) => {
    if (body.style.getPropertyValue(name) !== value) body.style.setProperty(name, value);
  };
  const panels = createHudPanels({
    el,
    messages,
    beforeOpen,
    openCrafting,
    changed: mark,
    isWide: () => wideHud(innerWidth, innerHeight)
  });
  const resize = new ResizeObserver(mark);
  for (const node of [top, secondary, tray]) resize.observe(node);
  window.addEventListener('resize', mark);

  function tick() {
    const stamp = [
      innerWidth,
      innerHeight,
      messages.open,
      messages.expanded,
      body.classList.contains('placing'),
      body.classList.contains('signing'),
      body.classList.contains('mapping'),
      el.sheet.classList.contains('open'),
      ...[
        el.battery,
        el.depth,
        el.depthGauge,
        el.perf,
        el.mine,
        el.perfect,
        el.lantern,
        el.flare,
        tray,
        document.getElementById('friends')
      ].map((n) => n.hidden),
      el.depthGauge.children.length,
      el.battery.querySelector('span').textContent
    ].join(':');
    if (stamp !== signature) {
      signature = stamp;
      mark();
    }
    if (!dirty) return;
    dirty = false;
    measurements++;
    if (
      el.sheet.classList.contains('open') ||
      body.classList.contains('placing') ||
      body.classList.contains('signing')
    )
      panels.close();
    const action = el.action.getBoundingClientRect();
    const edgeBottom = Math.max(0, innerHeight - action.bottom);
    const act = action.height;
    const topEnd = top.getBoundingClientRect().bottom;
    const regions = hudRegions({ width: innerWidth, height: innerHeight, edgeBottom, action: act });
    const messageBottom = regions.messageBottom;
    const bars = el.depthGauge.hidden ? 0 : el.depthGauge.children.length;
    const status = el.depth.hidden ? 0 : 48 + (bars ? bars * 11 + 18 : 0);
    const plan = hudSpacePlan({
      room: innerHeight - messageBottom - topEnd - 8,
      status,
      performance: visible(el.perf) ? 44 : 0,
      friends: visible(document.getElementById('friends')) ? 34 : 0,
      messages: Math.max(52 + regions.previewHeight, messages.open ? 180 : 0)
    });
    if (body.classList.contains('placing') || !regions.wide) {
      plan.level = Math.max(3, plan.level);
      plan.performance = true;
      plan.status = true;
      plan.friends = true;
    }
    if (plan.level !== lastLevel) {
      lastLevel = plan.level;
      body.dataset.hudLevel = String(plan.level);
      setChipCompact(document.getElementById('friends'), plan.friends);
    }
    panels.apply(plan.messages);
    const safeTop = Math.max(topEnd, secondary.getBoundingClientRect().bottom) + 10;
    const logRoom = Math.max(
      40,
      innerHeight - regions.logBottom - (regions.landscape ? topEnd + 8 : safeTop)
    );
    css('--hud-message-bottom', messageBottom + 'px');
    css('--hud-log-bottom', regions.logBottom + 'px');
    css('--hud-message-room', logRoom + 'px');
    // Existing bubble timing/queue is unchanged; its paint stays in HUD space.
    css('--hud-preview-room', regions.previewHeight + 'px');
    css('--hud-top-end', safeTop + 'px');
    css('--hud-topbar-end', topEnd + 'px');
    const primary = [
      action,
      ...[el.build, el.upgrade].filter((n) => !n.hidden).map((n) => n.getBoundingClientRect())
    ].filter((r) => r.height > 0);
    const secondaryActions = [el.mine, el.perfect]
      .filter((n) => !n.hidden)
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.height > 0);
    const primaryTop = Math.min(innerHeight, ...primary.map((r) => r.top));
    css('--hud-primary-top', primaryTop + 'px');
    css('--hud-action-top', Math.min(primaryTop, ...secondaryActions.map((r) => r.top)) + 'px');
    css(
      '--hud-secondary-left',
      Math.min(innerWidth, ...secondaryActions.map((r) => r.left)) + 'px'
    );
    css(
      '--hud-meta-end',
      Math.max(topEnd, document.getElementById('hudMeta').getBoundingClientRect().bottom) + 8 + 'px'
    );
    if (el.gearStatus.hidden !== el.battery.hidden) el.gearStatus.hidden = el.battery.hidden;
    const charge = el.battery.querySelector('span').textContent;
    if (el.gearStatus.textContent !== charge) el.gearStatus.textContent = charge;
    el.gearStatus.classList.toggle('low', el.battery.classList.contains('low'));
    messages.fit(logRoom);
  }
  return {
    tick,
    invalidate: mark,
    close: panels.close,
    toggle: panels.toggle,
    get open() {
      return panels.open;
    },
    get level() {
      return lastLevel;
    },
    get measurements() {
      return measurements;
    }
  };
}
