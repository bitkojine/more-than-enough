/* The performance panel: how well the game runs on this device, on any device.
 * Tap the version badge (or press F3) to show it. Numbers and short labels
 * only; what they mean is in the wiki.
 *
 * Every frame reports its interval and how long the game logic and the
 * drawing took. The panel shows the last WINDOW frames, refreshed a few times
 * a second so reading it costs next to nothing. */

const WINDOW = 120;            // frames kept for the averages (~2 s at 60 fps)
const REFRESH_EVERY = 0.25;    // seconds between panel updates
const GOOD_FPS = 55, OK_FPS = 30;

export function createPerf(el, canvas, audio) {
  const interval = new Float32Array(WINDOW); // ms between frames
  const logic = new Float32Array(WINDOW);    // ms spent in the game update
  const draw = new Float32Array(WINDOW);     // ms spent drawing
  let i = 0, count = 0, tiles = 0, refreshIn = 0;

  const perf = {
    visible: false,

    // One finished frame.
    frame(intervalMs, logicMs, drawMs, tilesDrawn) {
      interval[i] = intervalMs; logic[i] = logicMs; draw[i] = drawMs;
      i = (i + 1) % WINDOW;
      count = Math.min(WINDOW, count + 1);
      tiles = tilesDrawn;
    },

    // The figures the panel shows (also used by the browser tests).
    snapshot() {
      let sum = 0, worst = 0, logicSum = 0, drawSum = 0;
      for (let k = 0; k < count; k++) {
        sum += interval[k];
        worst = Math.max(worst, interval[k]);
        logicSum += logic[k];
        drawSum += draw[k];
      }
      const n = count || 1;
      const avg = sum / n;
      return {
        fps: avg > 0 ? 1000 / avg : 0,
        frameMs: avg,
        worstMs: worst,
        logicMs: logicSum / n,
        drawMs: drawSum / n,
        tiles,
        screen: `${window.innerWidth}×${window.innerHeight}`,
        canvas: `${canvas.width}×${canvas.height}`,
        dpr: window.devicePixelRatio || 1,
        cores: navigator.hardwareConcurrency || null,
        memoryGb: navigator.deviceMemory || null,
        heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
        sound: audio.state(),
        soundTrace: audio.trace()
      };
    },

    toggle(show = !perf.visible) {
      perf.visible = show;
      el.perf.hidden = !show;
      el.version.setAttribute('aria-pressed', String(show));
      refreshIn = 0;
    },

    tick(dt) {
      if (!perf.visible || (refreshIn -= dt) > 0) return;
      refreshIn = REFRESH_EVERY;
      render(perf.snapshot());
    }
  };

  function render(m) {
    const grade = m.fps >= GOOD_FPS ? 'good' : m.fps >= OK_FPS ? 'ok' : 'bad';
    el.perf.dataset.grade = grade;
    const lines = [
      `FPS     ${m.fps.toFixed(0)}`,
      `frame   ${m.frameMs.toFixed(1)} ms  worst ${m.worstMs.toFixed(0)}`,
      `logic   ${m.logicMs.toFixed(2)} ms`,
      `draw    ${m.drawMs.toFixed(2)} ms`,
      `tiles   ${m.tiles}`,
      `screen  ${m.screen} @${+m.dpr.toFixed(2)}x`,
      `canvas  ${m.canvas}`,
      `sound   ${m.sound}  wakes ${m.soundTrace.wakes} ${m.soundTrace.last}`
    ];
    if (m.soundTrace.error) lines.push(`        ${m.soundTrace.error}`);
    if (m.cores) lines.push(`cores   ${m.cores}`);
    if (m.memoryGb) lines.push(`memory  ${m.memoryGb} GB`);
    if (m.heapMb !== null) lines.push(`heap    ${m.heapMb.toFixed(1)} MB`);
    el.perf.textContent = lines.join('\n');
  }

  return perf;
}
