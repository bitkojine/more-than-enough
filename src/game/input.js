/* Touch, mouse and keyboard. Turns raw events into intents, and hands them to
 * the handlers it was given. It never touches game state itself.
 *
 *   drag anywhere            virtual joystick (moveVector)
 *   tap the map              handlers.tap(screenX, screenY)
 *   hold Gather / Space      `held` (the main loop repeats the action)
 *   hold Gather, drag off    a Trail (`trail`, then handlers.trailEnded)
 *   two fingers, wheel, +/-  zoom (tap the zoom readout for 1x)
 *   two fingers up/down      tilt (also Shift + wheel, T, the tilt button)
 *   B, U / C, Escape         handlers.command('build' | 'upgrades' | 'close')
 *   F3                       handlers.command('perf') */

const JOY_MAX = 74;          // px from the stick origin to full speed
const JOY_DEAD = 12;         // px of slack before the stick engages
const TAP_MAX_MOVE = 14;     // px a tap may wander
const TAP_MAX_MS = 320;
const TRAIL_MIN_STEP = 0.12; // tiles between recorded Trail points
const GESTURE_DECIDE = 10;   // px two fingers move before it counts as zoom or tilt
const TILT_DRAG_PX = 220;    // two-finger drag that swings from flat to full tilt

export function createInput({ canvas, cam, el, handlers }) {
  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, moved: 0, t: 0 };
  const pointers = new Map();                     // pointerId -> {x, y}, for pinch
  const pinch = { active: false, mode: null, dist: 0, zoom: 1, midY: 0, tilt: 0 };
  let keys = {};
  let actionPointerId = null;

  const input = {
    joy,
    held: false,   // Gather is held down (button or key)
    trail: null,   // { id, points: [{x, y}] in world space, leftButton }

    // Desired movement direction, length 0..1. The joystick wins over keys.
    moveVector() {
      if (joy.active && (joy.x || joy.y)) return { x: joy.x, y: joy.y };
      if (handlers.blocked()) return { x: 0, y: 0 };
      const x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      const y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      const len = Math.hypot(x, y);
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },

    release() {
      input.held = false;
      actionPointerId = null;
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

  function pinchMidY() {
    const [a, b] = [...pointers.values()];
    return b ? (a.y + b.y) / 2 : a.y;
  }

  function toggleTilt() {
    cam.setTilt(cam.tiltTarget > 0.5 ? 0 : 1);
    handlers.viewChanged();
  }

  function outsideActionButton(e) {
    const b = el.action.getBoundingClientRect();
    return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom;
  }

  /* ------------------------------------------------------------ trail */

  function beginTrail(e) {
    if (!input.held || input.trail || handlers.blocked()) return;
    input.trail = { id: e.pointerId, points: [worldPoint(e)], leftButton: false };
    joy.active = false; joy.x = 0; joy.y = 0;
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
      // A second finger means zoom or tilt, not a joystick drag.
      joy.active = false; joy.x = 0; joy.y = 0;
      if (!pinch.active) {
        Object.assign(pinch, { active: true, mode: null, dist: pinchDistance() || 1, zoom: cam.zoom, midY: pinchMidY(), tilt: cam.tilt });
      }
      return;
    }
    const p = canvasPoint(e);
    Object.assign(joy, { active: true, id: e.pointerId, ox: p.x, oy: p.y, x: 0, y: 0, moved: 0, t: performance.now() });
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, canvasPoint(e));
    if (pinch.active) {
      e.preventDefault();
      if (pointers.size < 2) return;
      const d = pinchDistance(), dy = pinchMidY() - pinch.midY;
      // Fingers spreading means zoom; both sliding up or down means tilt.
      if (!pinch.mode) {
        const spread = Math.abs(d - pinch.dist);
        if (Math.max(spread, Math.abs(dy)) < GESTURE_DECIDE) return;
        pinch.mode = spread > Math.abs(dy) ? 'zoom' : 'tilt';
      }
      if (pinch.mode === 'zoom' && d > 1) cam.setZoom(pinch.zoom * (d / pinch.dist));
      if (pinch.mode === 'tilt') cam.setTilt(pinch.tilt - dy / TILT_DRAG_PX, true);
      handlers.viewChanged();
      return;
    }
    if (input.held && !input.trail && e.pointerId === actionPointerId && outsideActionButton(e)) beginTrail(e);
    if (input.trail && input.trail.id === e.pointerId) {
      extendTrail(e);
      e.preventDefault();
      return;
    }
    if (handlers.blocked() || !joy.active || e.pointerId !== joy.id) return;
    const p = canvasPoint(e);
    let dx = p.x - joy.ox, dy = p.y - joy.oy;
    const dist = Math.hypot(dx, dy);
    joy.moved = Math.max(joy.moved, dist);
    if (dist < JOY_DEAD) { joy.x = 0; joy.y = 0; return; }
    if (dist > JOY_MAX) {
      // Recentre so the stick follows the thumb.
      joy.ox += dx * (1 - JOY_MAX / dist);
      joy.oy += dy * (1 - JOY_MAX / dist);
      dx = p.x - joy.ox; dy = p.y - joy.oy;
    }
    joy.x = dx / JOY_MAX;
    joy.y = dy / JOY_MAX;
    e.preventDefault();
  }

  function onCanvasUp(e) {
    pointers.delete(e.pointerId);
    if (pinch.active) {
      if (pointers.size < 2) pinch.active = false; // ignore the leftover finger
      e.preventDefault();
      return;
    }
    if (!joy.active || e.pointerId !== joy.id) return;
    const wasTap = joy.moved < TAP_MAX_MOVE && performance.now() - joy.t < TAP_MAX_MS;
    joy.active = false; joy.x = 0; joy.y = 0;
    if (wasTap && !handlers.blocked()) {
      const p = canvasPoint(e);
      handlers.tap(p.x, p.y);
    }
  }

  canvas.addEventListener('pointerdown', onCanvasDown, { passive: false });
  // Touch may stay implicitly captured by Gather; listen on the window so the
  // same thumb can drag from the button onto the map.
  window.addEventListener('pointermove', onMove, { capture: true, passive: false });
  window.addEventListener('pointerup', (e) => {
    if (input.trail && input.trail.id === e.pointerId) endTrail();
  }, true);
  canvas.addEventListener('pointerup', onCanvasUp, { passive: false });
  canvas.addEventListener('pointercancel', onCanvasUp, { passive: false });
  canvas.addEventListener('wheel', (e) => {
    if (handlers.blocked()) return;
    e.preventDefault();
    if (e.shiftKey) cam.setTilt(cam.tiltTarget - (e.deltaY || e.deltaX) / 600, true);
    else cam.setZoom(cam.zoom * Math.pow(1.0015, -e.deltaY));
    handlers.viewChanged();
  }, { passive: false });

  /* ------------------------------------------------------ Gather button */

  el.action.addEventListener('pointerdown', (e) => {
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

  /* ------------------------------------------------------ zoom and tilt */

  el.zoomOut.addEventListener('click', () => { cam.setZoom(cam.zoom / 1.25); handlers.viewChanged(); });
  el.zoomIn.addEventListener('click', () => { cam.setZoom(cam.zoom * 1.25); handlers.viewChanged(); });
  el.zoomLevel.addEventListener('click', () => { cam.setZoom(1); handlers.viewChanged(); });
  el.tilt.addEventListener('click', toggleTilt);

  /* ---------------------------------------------------------- keyboard */

  const isActionKey = (e) => e.key === ' ' || e.key === 'Enter';
  window.addEventListener('keydown', (e) => {
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
    if (k === 'escape') handlers.command('close');
    if (k === 'b') handlers.command('build');
    if (k === 'u' || k === 'c') handlers.command('upgrades');
    if (k === 't' && !e.repeat && !handlers.blocked()) toggleTilt();
    if (e.key === 'F3') { e.preventDefault(); if (!e.repeat) handlers.command('perf'); }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (isActionKey(e)) input.release();
  });
  window.addEventListener('blur', () => { input.release(); keys = {}; });

  // Block browser scrolling and zoom gestures outside the sheet.
  document.addEventListener('touchmove', (e) => {
    if (e.target && e.target.closest && e.target.closest('#sheet')) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  return input;
}
