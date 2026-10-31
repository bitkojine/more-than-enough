/* Panel policy, separate from geometry. Compact screens share disclosure
 * space; roomy screens keep the left log independent of right-side tools. */
export function createHudPanels({ el, messages, isWide, beforeOpen, openCrafting, changed }) {
  const tray = el.equipmentTray;
  const setGear = (on) => {
    if (tray.hidden === !on) return;
    if (on) beforeOpen();
    tray.hidden = !on;
    el.upgrade.setAttribute('aria-expanded', String(on));
    if (on && !isWide()) messages.setCompact(true, { resetPeek: true });
    changed();
  };
  el.upgrade.addEventListener('click', () => setGear(tray.hidden));
  el.equipmentClose.addEventListener('click', () => {
    setGear(false);
    el.upgrade.focus();
  });
  el.equipmentCraft.addEventListener('click', () => {
    setGear(false);
    openCrafting();
  });
  for (const type of ['pointerdown', 'wheel'])
    tray.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (isWide() && e.target.closest?.('#log, #logPill, #logBubble')) return;
      if (!tray.hidden && !tray.contains(e.target) && !el.upgrade.contains(e.target))
        setGear(false);
    },
    { passive: true }
  );
  // Keyboard activation has no preceding pointerdown.
  document.addEventListener('click', (e) => {
    if (!isWide() && e.target.closest?.('#logPill')) setGear(false);
  });
  window.addEventListener(
    'keydown',
    (e) => {
      // i18n-ok: keyboard event key name.
      if (e.key === 'Escape' && !tray.hidden) {
        setGear(false);
        e.stopImmediatePropagation();
        el.upgrade.focus();
      }
    },
    true
  ); // i18n-ok: keyboard event key name.
  return {
    close: () => setGear(false),
    toggle: () => setGear(tray.hidden),
    get open() {
      return !tray.hidden;
    },
    apply(compact) {
      messages.setCompact(compact || (!isWide() && !tray.hidden));
    }
  };
}
