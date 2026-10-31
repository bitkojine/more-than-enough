/* Touch, mouse and keyboard. Turns raw events into intents, and hands them to
 * the handlers it was given. It never touches game state itself.
 *
 *   drag anywhere            virtual joystick (moveVector); `invert` pulls
 *                            the map instead (you walk against the drag);
 *                            zoomed out to the world map (handlers.pans()),
 *                            handlers.pan(dx, dy) instead
 *   tap the map              handlers.tap(screenX, screenY)
 *   press and drag           handlers.grab(x, y) may take the finger
 *                            (dragging a building being placed), then
 *                            gets its moves and its lift (grabMove, grabEnd)
 *   hold still on the map    a long press: handlers.longPress(x, y) may take
 *                            that finger (Wiki does), then gets its moves
 *                            and its lift (longPressMove, longPressEnd)
 *   hold Gather / Space      `held` (the main loop repeats the action)
 *   hold Gather, drag off    a Trail (`trail`, then handlers.trailEnded)
 *   hold Perfect / P         `perfect` (handlers.perfectPressed, then the
 *                            main loop plays while held; perfectReleased)
 *   two fingers, wheel, +/-  zoom (tap the zoom readout for 1x); pinch and
 *                            wheel tell handlers.zoomed(was, x, y) about where
 *   B, U / C, Escape         handlers.command('build' | 'upgrades' | 'back')
 *   F3                       handlers.command('perf') */

const JOY_MAX = 74; // px from the stick origin to full speed
const JOY_DEAD = 12; // px of slack before the stick engages
const TAP_MAX_MOVE = 14; // px a tap may wander
const TAP_MAX_MS = 320;
const LONG_PRESS_MS = 500; // held this still this long: a long press
const TRAIL_MIN_STEP = 0.12; // tiles between recorded Trail points

export function createInput({ canvas, cam, el, handlers }) {
  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, moved: 0, t: 0, pan: null };
  const pointers = new Map(); // pointerId -> {x, y}, for pinch
  const pinch = { active: false, dist: 0, zoom: 1 };
  let keys = {};
  let actionPointerId = null;
  let longTimer = 0,
    longId = null; // a press that may become long; the finger a long press took
  let grabId = null; // the finger dragging what handlers.grab took

  const input = {
    joy,
    held: false, // Gather is held down (button or key)
    perfect: false, // Perfect is held down (button or key)
    trail: null, // { id, points: [{x, y}] in world space, leftButton }
    invert: false, // drag pulls the map: you walk the other way from the finger

    // Desired movement direction, length 0..1. The joystick wins over keys.
    moveVector() {
      if (joy.active && (joy.x || joy.y))
        return input.invert ? { x: -joy.x, y: -joy.y } : { x: joy.x, y: joy.y };
      if (handlers.blocked()) return { x: 0, y: 0 };
      const x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      const y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },

    release() {
      input.held = false;
      actionPointerId = null;
    },

    releasePerfect() {
      if (input.perfect) handlers.perfectReleased();
      input.perfect = false;
    }
  };

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function worldPoint(e) {
    const p = canvasPoint(e);
    return cam.unproject(p.x, p.y);
  }

  function capture(target, e) {
    if (target.setPointerCapture) target.setPointerCapture(e.pointerId);
  }

  function pinchDistance() {
    const [a, b] = [...pointers.values()];
    return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function outsideActionButton(e) {
    const b = el.action.getBoundingClientRect();
    return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom;
  }

  /* ------------------------------------------------------------ trail */

  function beginTrail(e) {
    if (!input.held || input.trail || handlers.blocked()) return;
    input.trail = { id: e.pointerId, points: [worldPoint(e)], leftButton: false };
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    pointers.set(e.pointerId, canvasPoint(e));
    capture(canvas, e);
  }

  function extendTrail(e) {
    const t = input.trail;
    const p = worldPoint(e);
    const last = t.points[t.points.length - 1];
    if (outsideActionButton(e)) t.leftButton = true;
    if (Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > TRAIL_MIN_STEP) t.points.push(p);
  }

  // A Trail only counts once the finger has left the Gather button and drawn
  // at least a segment; otherwise it was just a press.
  function endTrail() {
    const t = input.trail;
    input.trail = null;
    input.release();
    handlers.trailEnded(t.leftButton && t.points.length >= 2 ? t.points : null);
  }

  /* ---------------------------------------------------------- pointers */

  function onCanvasDown(e) {
    // A menu is open: touching the world past it means "back to the game".
    // The touch only closes the menu; it doesn't also steer or gather.
    if (handlers.blocked()) {
      handlers.dismiss();
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    capture(canvas, e);
    pointers.set(e.pointerId, canvasPoint(e));
    // No preventDefault() on press or release (here, below and on Gather):
    // Safari only counts a touch as a gesture, the kind that may start
    // sound, if it ends in a click, and cancelling the press stops the click.
    // Scrolling and zooming are already off (touch-action: none).
    if (pinch.active || pointers.size >= 2) {
      // A second finger means zoom, not a joystick drag.
      joy.active = false;
      joy.x = 0;
      joy.y = 0;
      clearTimeout(longTimer);
      if (!pinch.active) {
        Object.assign(pinch, { active: true, dist: pinchDistance() || 1, zoom: cam.zoom });
      }
      return;
    }
    const p = canvasPoint(e);
    if (handlers.grab?.(p.x, p.y)) {
      grabId = e.pointerId;
      clearTimeout(longTimer);
      return;
    }
    Object.assign(joy, {
      active: true,
      id: e.pointerId,
      ox: p.x,
      oy: p.y,
      x: 0,
      y: 0,
      moved: 0,
      t: performance.now(),
      pan: handlers.pans() ? { ...p } : null
    });
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (
        !joy.active ||
        joy.id !== e.pointerId ||
        joy.moved >= TAP_MAX_MOVE ||
        pinch.active ||
        handlers.blocked()
      )
        return;
      if (!handlers.longPress(joy.ox, joy.oy)) return;
      // The finger is the long press's now: it no longer steers.
      longId = joy.id;
      joy.active = false;
      joy.x = 0;
      joy.y = 0;
    }, LONG_PRESS_MS);
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, canvasPoint(e));
    if (e.pointerId === grabId) {
      const p = canvasPoint(e);
      handlers.grabMove(p.x, p.y);
      e.preventDefault();
      return;
    }
    if (e.pointerId === longId) {
      const p = canvasPoint(e);
      handlers.longPressMove(p.x, p.y);
      e.preventDefault();
      return;
    }
    if (pinch.active) {
      e.preventDefault();
      if (pointers.size < 2) return;
      const d = pinchDistance();
      if (d > 1) {
        const [a, b] = [...pointers.values()],
          was = cam.tilePx;
        cam.setZoom(pinch.zoom * (d / pinch.dist));
        handlers.zoomed(was, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      handlers.viewChanged();
      return;
    }
    if (input.held && !input.trail && e.pointerId === actionPointerId && outsideActionButton(e))
      beginTrail(e);
    if (input.trail && input.trail.id === e.pointerId) {
      extendTrail(e);
      e.preventDefault();
      return;
    }
    if (handlers.blocked() || !joy.active || e.pointerId !== joy.id) return;
    const p = canvasPoint(e);
    let dx = p.x - joy.ox,
      dy = p.y - joy.oy;
    const dist = Math.hypot(dx, dy);
    joy.moved = Math.max(joy.moved, dist);
    // On the world map the finger pans it, and you stay where you are.
    if (joy.pan) {
      if (joy.moved >= TAP_MAX_MOVE || joy.pan.moving) {
        joy.pan.moving = true;
        handlers.pan(p.x - joy.pan.x, p.y - joy.pan.y);
        joy.pan.x = p.x;
        joy.pan.y = p.y;
      }
      e.preventDefault();
      return;
    }
    if (dist < JOY_DEAD) {
      joy.x = 0;
      joy.y = 0;
      return;
    }
    if (dist > JOY_MAX) {
      // Recentre so the stick follows the thumb.
      joy.ox += dx * (1 - JOY_MAX / dist);
      joy.oy += dy * (1 - JOY_MAX / dist);
      dx = p.x - joy.ox;
      dy = p.y - joy.oy;
    }
    joy.x = dx / JOY_MAX;
    joy.y = dy / JOY_MAX;
    e.preventDefault();
  }

  function onCanvasUp(e) {
    pointers.delete(e.pointerId);
    if (e.pointerId === grabId) {
      grabId = null;
      handlers.grabEnd();
      return;
    }
    if (e.pointerId === longId) {
      longId = null;
      const p = canvasPoint(e);
      handlers.longPressEnd(p.x, p.y, e.type === 'pointercancel');
      return;
    }
    if (e.pointerId === joy.id) clearTimeout(longTimer);
    if (pinch.active) {
      if (pointers.size < 2) pinch.active = false; // ignore the leftover finger
      e.preventDefault();
      return;
    }
    if (!joy.active || e.pointerId !== joy.id) return;
    const wasTap = joy.moved < TAP_MAX_MOVE && performance.now() - joy.t < TAP_MAX_MS;
    joy.active = false;
    joy.x = 0;
    joy.y = 0;
    if (wasTap && !handlers.blocked()) {
      const p = canvasPoint(e);
      handlers.tap(p.x, p.y);
    }
  }

  canvas.addEventListener('pointerdown', onCanvasDown, { passive: false });
  // Touch may stay implicitly captured by Gather; listen on the window so the
  // same thumb can drag from the button onto the map.
  window.addEventListener('pointermove', onMove, { capture: true, passive: false });
  window.addEventListener(
    'pointerup',
    (e) => {
      if (input.trail && input.trail.id === e.pointerId) endTrail();
    },
    true
  );
  canvas.addEventListener('pointerup', onCanvasUp, { passive: false });
  canvas.addEventListener('pointercancel', onCanvasUp, { passive: false });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (handlers.blocked()) return;
      e.preventDefault();
      const p = canvasPoint(e),
        was = cam.tilePx;
      cam.setZoom(cam.zoom * Math.pow(1.0015, -e.deltaY));
      handlers.zoomed(was, p.x, p.y);
      handlers.viewChanged();
    },
    { passive: false }
  );

  /* ------------------------------------------------------ Gather button */

  el.action.addEventListener('pointerdown', (e) => {
    if (handlers.blocked()) return;
    input.held = true;
    actionPointerId = e.pointerId;
    handlers.actionPressed();
  });
  const releaseAction = (e) => {
    if (input.trail && input.trail.id === e.pointerId) endTrail();
    else input.release();
  };
  el.action.addEventListener('pointerup', releaseAction);
  el.action.addEventListener('pointercancel', releaseAction);
  el.action.addEventListener('pointerleave', (e) => {
    if (input.held && !input.trail && e.pointerId === actionPointerId) beginTrail(e);
  });

  /* ----------------------------------------------------- Perfect button */

  el.perfect.addEventListener('pointerdown', (e) => {
    if (handlers.blocked()) return;
    capture(el.perfect, e);
    input.perfect = true;
    handlers.perfectPressed();
  });
  el.perfect.addEventListener('pointerup', input.releasePerfect);
  el.perfect.addEventListener('pointercancel', input.releasePerfect);

  /* -------------------------------------------------------------- zoom */

  // Out on the world map the steps are bigger: it reaches far further.
  const step = () => (handlers.pans() ? 2 : 1.25);
  const zoomBy = (f) => {
    const was = cam.tilePx;
    cam.setZoom(cam.zoom * f);
    handlers.zoomed(was, cam.width / 2, cam.height / 2);
    handlers.viewChanged();
  };
  el.zoomOut.addEventListener('click', () => zoomBy(1 / step()));
  el.zoomIn.addEventListener('click', () => zoomBy(step()));
  el.zoomLevel.addEventListener('click', () => zoomBy(1 / cam.zoom));

  /* ---------------------------------------------------------- keyboard */

  const isActionKey = (e) => e.key === ' ' || e.key === 'Enter'; // i18n-ok: a key name
  window.addEventListener('keydown', (e) => {
    // Native focused controls own Space; it must not also trigger Gather.
    if (isActionKey(e) && e.target?.closest?.('button, [role="button"]')) return;
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (isActionKey(e)) {
      e.preventDefault();
      if (handlers.blocked()) return;
      input.held = true;
      // One action per physical press. OS autorepeat (e.repeat) is ignored:
      // holding is paced by the main loop's cooldown, like the touch button.
      if (!e.repeat) handlers.actionPressed();
    }
    if (k === 'p' && !e.repeat && !handlers.blocked()) {
      input.perfect = true;
      handlers.perfectPressed();
    }
    if (k === 'escape') handlers.command('back');
    if (k === 'b') handlers.command('build');
    if (k === 'l' && !e.repeat) handlers.command('lantern');
    if (k === 'f' && !e.repeat) handlers.command('flare');
    if (k === 'u' || k === 'c') handlers.command('upgrades');
    if (e.key === 'F3') {
      e.preventDefault();
      if (!e.repeat) handlers.command('perf');
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (isActionKey(e)) input.release();
    if (e.key.toLowerCase() === 'p') input.releasePerfect();
  });
  window.addEventListener('blur', () => {
    input.release();
    input.releasePerfect();
    keys = {};
  });

  // Block browser scrolling and zoom gestures outside the sheet, the
  // building card and the message log, which scroll themselves.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (
        e.target &&
        e.target.closest &&
        e.target.closest('#sheet, #buildingCard, #log, #equipmentTray')
      )
        return;
      if (e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  return input;
}
