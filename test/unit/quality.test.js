import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuality, drawDpr, frameDue, frameWait, LEVELS, MAX_PIXELS, UP_AFTER_S, UP_MAX_S, RENDER_FPS } from '../../src/game/quality.js';

// Feeds `seconds` of frames `ms` apart.
function run(q, ms, seconds) {
  for (let t = 0; t < seconds * 1000; t += ms) q.frame(ms);
}

test('a device that keeps up keeps full quality', () => {
  let steps = 0;
  const q = createQuality(0, 3, () => steps++);
  run(q, 1000 / RENDER_FPS, 30);
  assert.equal(q.level, 0);
  assert.equal(q.dpr, 2);
  assert.ok(q.glass);
  assert.equal(steps, 0);
});

test('a slow device steps down a level at a time, to the last and no further', () => {
  let steps = 0;
  const q = createQuality(0, 3, () => steps++);
  run(q, 3000 / RENDER_FPS, 3);
  assert.equal(q.level, 1, 'one step after a few slow seconds');
  assert.ok(!q.glass, 'the frosted glass goes first');
  run(q, 3000 / RENDER_FPS, 60);
  assert.equal(q.level, LEVELS.length - 1);
  assert.equal(steps, LEVELS.length - 1);
});

test('pauses and the first seconds are not judged', () => {
  const q = createQuality(0, 2, () => {});
  run(q, 3000 / RENDER_FPS, 1.4);
  assert.equal(q.level, 0, 'the first seconds after starting are a grace period');
  for (let i = 0; i < 100; i++) q.frame(1000);
  assert.equal(q.level, 0, 'long gaps are pauses (a hidden tab), not the pace');
});

test('levels that look the same on this screen are skipped', () => {
  const q = createQuality(0, 1, () => {});
  run(q, 3000 / RENDER_FPS, 3);
  assert.equal(q.level, 1, 'glass off');
  run(q, 3000 / RENDER_FPS, 3);
  assert.equal(q.level, 3, 'a 1x screen draws 1.5x and 1x the same, so straight to fewer pixels');
});

test('a visit starts at the level the last one settled on', () => {
  assert.equal(createQuality(2, 2, () => {}).level, 2, 'an old phone does not lag through the same steps on every load');
  assert.equal(createQuality(0, 2, () => {}).level, 0);
  assert.equal(createQuality(99, 2, () => {}).level, LEVELS.length - 1);
  assert.equal(createQuality(undefined, 2, () => {}).level, 0);
});

test('a big screen is drawn with at most MAX_PIXELS, but never under 1x for that alone', () => {
  assert.equal(drawDpr(2, 3, 412, 915), 2, 'a phone keeps its sharpness');
  const mac = drawDpr(2, 2, 1440, 900);
  assert.ok(mac < 2 && Math.abs(1440 * 900 * mac * mac - MAX_PIXELS) < 1, 'a Retina laptop window is capped');
  assert.equal(drawDpr(2, 2, 5000, 3000), 1);
  assert.equal(drawDpr(0.75, 2, 412, 915), 0.75, 'a struggling device still goes under 1x');
  assert.equal(drawDpr(2, 1, 800, 600), 1);
});

test('once the device keeps up again (cooled down, plugged in) it steps back up, a level at a time', () => {
  let steps = 0;
  const q = createQuality(3, 3, () => steps++);
  run(q, 1000 / RENDER_FPS, UP_AFTER_S - 2);
  assert.equal(q.level, 3, 'not before UP_AFTER_S of smooth frames');
  run(q, 1000 / RENDER_FPS, 6);
  assert.equal(q.level, 2, 'one level better');
  run(q, 1000 / RENDER_FPS, 3 * (UP_AFTER_S + 3));
  assert.equal(q.level, 0, 'all the way back to full quality');
  assert.equal(steps, 3);
  run(q, 1000 / RENDER_FPS, 120);
  assert.equal(steps, 3, 'and stays there');
});

test('a try that is too slow steps straight back and waits twice as long before the next', () => {
  const q = createQuality(1, 3, () => {});
  run(q, 1000 / RENDER_FPS, UP_AFTER_S + 5);
  assert.equal(q.level, 0, 'tries a level better');
  run(q, 2000 / RENDER_FPS, 3);
  assert.equal(q.level, 1, 'too slow there: back down');
  run(q, 1000 / RENDER_FPS, UP_AFTER_S + 5);
  assert.equal(q.level, 1, 'no new try after the usual wait');
  run(q, 1000 / RENDER_FPS, UP_AFTER_S + 5);
  assert.equal(q.level, 0, 'but after twice as long');
  // Each failure doubles the wait, up to UP_MAX_S, so it never flickers.
  let tries = 0;
  for (let i = 0; i < 10; i++) {
    run(q, 2000 / RENDER_FPS, 3);   // back down
    let s = 0;
    while (q.level === 1 && s < UP_MAX_S + 10) { run(q, 1000 / RENDER_FPS, 1); s++; }
    if (q.level === 0) tries++;
    assert.ok(s <= UP_MAX_S + 5, 'the wait never grows past UP_MAX_S (' + s + ' s)');
  }
  assert.equal(tries, 10);
});

test('plugging in the charger tries a better level within seconds', () => {
  const q = createQuality(2, 3, () => {});
  run(q, 1000 / RENDER_FPS, 5);
  assert.equal(q.level, 2);
  q.retry();
  run(q, 1000 / RENDER_FPS, 8);
  assert.equal(q.level, 1);
});

test('there is one fixed 30 FPS rendering target, without early admission', () => {
  assert.equal(RENDER_FPS,30);
  for(const since of [0,1000/120,1000/60,1000/33,1000/30-.001])assert.equal(frameDue(since),false);
  assert.equal(frameDue(1000/30),true);
});

test('deadline pacing stays capped and close to 30 on regular and high-refresh screens',()=>{
  for(const hz of [60,75,90,120,144,165,240]){
    const drawn=[];let last=0,now=0;
    for(let steps=0;now<10000&&steps<5000;steps++){
      const wait=frameWait(now-last);
      if(wait===0){drawn.push(now);last=now;now=(Math.floor(now*hz/1000+1e-8)+1)*1000/hz;}
      else if(wait>0)now+=wait;
      else now=(Math.floor(now*hz/1000+1e-8)+1)*1000/hz;
    }
    assert.ok(now>=10000,'bounded refresh simulation completes');
    assert.ok(drawn.length>=280 && drawn.length<=300,'near target on '+hz+' Hz: '+drawn.length);
    for(let i=1;i<drawn.length;i++)assert.ok(drawn[i]-drawn[i-1]>=1000/30-1e-9);
  }
});

test('quality targets 30 FPS for every device and can recover at that pace', () => {
  const q = createQuality(0, 3, () => {});
  run(q, 2000 / 60, 60);
  assert.equal(q.level, 0, '30 fps meets the target');
  run(q, 1000 / 15, 3);
  assert.equal(q.level, 1, 'half its pace is too slow');
  const up = createQuality(1, 3, () => {});
  run(up, 2000 / 60, UP_AFTER_S + 5);
  assert.equal(up.level, 0, 'and at its pace it tries a level better');
});

test('quality: fewer gathered resources float at once at each lower level', () => {
  const b = LEVELS.map((l) => l.flyers);
  assert.deepEqual(b, [...b].sort((x, y) => y - x));
  assert.ok(b.at(-1) >= 10, 'the slowest phone still sees some');
  assert.equal(createQuality(LEVELS.length - 1, 2, () => {}).flyers, b.at(-1));
});
