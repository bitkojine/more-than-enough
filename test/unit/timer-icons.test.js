import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { unlockOptional } from './helpers.js';
import { cargoClock, facilityClock, clockIcon } from '../../src/game/cargo-clock.js';
import { drawClock } from '../../src/game/render/cultivation.js';

function state() {
  const s = C.createState(7, { cultivation: true });
  s.time = C.DAY_LENGTH / 2;
  s.cultivation.gear.carrier = true;
  return s;
}

test('cargo clocks identify their subject in safe, warming and cooling states', () => {
  const s = state();
  s.inv.crystal = 8;
  s.cultivation.quality = 82;
  assert.equal(cargoClock(s).text, 'Crystal quality 82%');
  assert.equal(cargoClock(s).icon, 'crystal');
  s.cultivation.starter = { health: 90 };
  assert.equal(cargoClock(s).icon, 'starter');
  s.cultivation.heart = { where: 'carried', health: 80 };
  assert.equal(cargoClock(s).icon, 'heart');
  s.time = 0;
  C.tileAt(s.world, 0, 0, 0);
  s.world.hotChunk.type[C.chunkIndex(0, 0)] = C.T.GRASS;
  assert.equal(cargoClock(s).icon, 'heart', 'warming retains the actual subject');
  s.time = C.DAY_LENGTH / 2;
  s.cultivation.carrierWarmth = 6;
  assert.equal(cargoClock(s).icon, 'heart', 'cooling retains the actual subject');
});

test('facility timers distinguish a colony, stored crystal and a resting heart', () => {
  const s = state();
  const chamber = {
    id: 1,
    kind: 'chamber',
    x: 0,
    y: 0,
    z: -2,
    temperature: 35,
    health: 10,
    buffer: 0
  };
  assert.equal(facilityClock(s, chamber).icon, 'starter');
  unlockOptional(s);
  const vault = { ...chamber, kind: 'vault', buffer: 8, quality: 1 };
  assert.equal(facilityClock(s, vault).icon, 'crystal');
  const shelter = { ...chamber, kind: 'shelter', temperature: 18, z: 0 };
  s.cultivation.heart = { where: 1, health: 90 };
  assert.equal(facilityClock(s, shelter).icon, 'heart');
  assert.match(facilityClock(s, shelter).text, /^Heart mended in /);
});

test('timer subjects reuse world pictures and cache their cropped forms', () => {
  const sources = new Map();
  const look = {
    pick(id) {
      if (!sources.has(id))
        sources.set(id, {
          img: { naturalWidth: 96, naturalHeight: 100 },
          aspect: 100 / 96,
          cache: new Map()
        });
      return sources.get(id);
    }
  };
  for (const subject of ['heart', 'starter', 'crystal']) {
    const pic = clockIcon(look, subject);
    assert.equal(clockIcon(look, subject), pic, 'repeated frames reuse the same picture');
    if (pic.rect) {
      const [x, y, width, height] = pic.rect;
      assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
      assert.ok(x + width <= pic.img.naturalWidth && y + height <= pic.img.naturalHeight);
      assert.ok(
        width < pic.img.naturalWidth,
        'subject crop leaves out the surrounding building/ground'
      );
    }
  }
});

test('tag layout reserves space for the icon and suppresses overlapping complete tags', () => {
  let draws = 0,
    texts = 0,
    saves = 0,
    restores = 0;
  const ctx = {
    save() {
      saves++;
    },
    restore() {
      restores++;
    },
    measureText: () => ({ width: 60 }),
    beginPath() {},
    roundRect() {},
    fill() {},
    stroke() {},
    drawImage() {
      draws++;
    },
    fillText() {
      texts++;
    }
  };
  const pic = { aspect: 1 };
  const look = { pick: () => pic, bitmap: () => ({}) },
    taken = [];
  drawClock(
    ctx,
    look,
    { x: 100, y: 40, text: 'Crystal quality', icon: 'crystal', tone: 'calm' },
    taken
  );
  drawClock(
    ctx,
    look,
    { x: 180, y: 40, text: 'Other clock', icon: 'crystal', tone: 'calm' },
    taken
  );
  assert.equal(draws, 1, 'the second icon would overlap the first complete tag');
  assert.equal(texts, 1, 'icon and wording hide together');
  assert.ok(taken[0].r - taken[0].l > 60 + 18, 'collision box includes text and subject');
  assert.equal(saves, restores, 'drawing restores canvas state even when a tag is suppressed');
});
