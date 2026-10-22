import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

test('typed searches preserve exhaustive nearest-target ordering across resources and fog', () => {
  const s = C.createState(777), w = s.world;
  for (let y = -36; y <= 36; y++) for (let x = -36; x <= 36; x++) if ((x * 13 + y * 7) % 5) C.markExplored(w, x, y, 0);
  for (const type of [C.T.FOREST, C.T.STONE, C.T.ORE, C.T.CRYSTAL, C.T.CAVE, C.T.WATER]) {
    for (const [x, y] of [[0.5, 0.5], [-15.8, 16.2], [34.2, -34.8]]) for (const radius of [4, 16, 40]) {
      const pred = (tx, ty) => (tx * 13 + ty * 11) % 7 === 0;
      const expected = C.nearestTile(x, y, radius, (tx, ty) => C.isExplored(w, tx, ty, 0) && C.tileAt(w, tx, ty, 0) === type && pred(tx, ty));
      assert.deepEqual(C.nearestExploredTile(w, x, y, 0, radius, pred, null, type), expected);
    }
  }
});

test('repeated missing-resource searches do not rescan ten thousand unrelated known tiles', () => {
  const w = C.createWorld(12345);
  for (let cy = 0; cy < 14; cy++) for (let cx = 0; cx < 14; cx++) w.chunks.set(C.packKey(cx, cy, 0), {
    type: new Uint8Array(256), rich: new Uint8Array(256).fill(1) });
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) C.markExplored(w, x, y, 0);
  const first = { cells: 0, nodes: 0, chunks: 0 }, second = { cells: 0, nodes: 0, chunks: 0 };
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, first, C.T.CRYSTAL), null);
  assert.equal(first.classifiedCells, 10000);
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, second, C.T.CRYSTAL), null);
  assert.equal(second.classifiedCells || 0, 0);
  assert.equal(second.cells, 0);
  const reveal = (x, y, type) => {
    w.chunks.get(C.packKey(C.chunkCoord(x), C.chunkCoord(y), 0)).type[C.chunkIndex(x, y)] = type;
    C.markExplored(w, x, y, 0);
  };
  reveal(110, 110, C.T.CRYSTAL); // a newly seen cell in an already classified chunk
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, null, C.T.CRYSTAL), { x: 110, y: 110 });
  reveal(200, 200, C.T.ORE); // a newly explored chunk
  const added = { cells: 0, nodes: 0, chunks: 0 };
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, added, C.T.ORE), { x: 200, y: 200 });
  assert.equal(added.classifiedCells, 1, 'only the new chunk needs classification');
});

test('surface classification never reads an unseen cell', () => {
  const w = C.createWorld(12345), type = new Uint8Array(256).fill(C.T.STONE);
  w.chunks.set(C.packKey(0, 0, 0), { type: new Proxy(type, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) assert.equal(Number(key), 5);
    return target[key];
  } }), rich: new Uint8Array(256).fill(1) });
  C.markExplored(w, 5, 0, 0);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 100, () => true, null, C.T.STONE), { x: 5, y: 0 });
});

test('observed type changes update the derived index without a save-format change', () => {
  const w = C.createWorld(12345);
  w.chunks.set(C.packKey(0, 0, 0), { type: new Uint8Array(256).fill(C.T.BEDROCK), rich: new Uint8Array(256).fill(1) });
  C.markExplored(w, 10, 0, 0);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 30, () => true, null, C.T.BEDROCK), { x: 10, y: 0 });
  C.setRichness(w, 10, 0, 0, 0);
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 30, () => true, null, C.T.BEDROCK), null);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 30, () => true, null, C.T.TUNNEL), { x: 10, y: 0 });
});

test('fog replacement and saving cannot retain stale typed candidates', () => {
  const s = C.createState(777), w = s.world, x = 32, y = 32;
  C.markExplored(w, x, y, 0);
  const type = C.tileAt(w, x, y, 0), pred = (tx, ty) => tx === x && ty === y;
  const saved = C.serialize(s);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 100, pred, null, type), { x, y });
  assert.equal(C.serialize(s), saved, 'derived classification is absent from saves');
  w.explored.set(C.packKey(2, 2, 0), new Uint8Array(32));
  C.markExplored(w, 33, 33, 0); // normal observation after an external map replacement
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 100, pred, null, type), null);
  const loaded = C.deserialize(saved);
  assert.deepEqual(C.nearestExploredTile(loaded.world, 0.5, 0.5, 0, 100, pred, null, type), { x, y });
  loaded.world.explored = new Map(loaded.world.explored);
  assert.deepEqual(C.nearestExploredTile(loaded.world, 0.5, 0.5, 0, 100, pred, null, type), { x, y }, 'plain-Map snapshots retain the correct fallback');
});

test('remaining-deposit queries skip exhausted chunks instead of revisiting their tiles', () => {
  const w = C.createWorld(91361);
  for (let cx = 1; cx <= 200; cx++) {
    const x = cx * C.CHUNK_SIZE, y = 8;
    const type = new Uint8Array(256).fill(C.T.FOREST), rich = new Uint8Array(256).fill(1);
    if (cx === 200) rich[C.chunkIndex(x, y)] = 2;
    w.chunks.set(C.packKey(cx, 0, 0), {type, rich});
    C.markExplored(w, x, y, 0);
  }
  const query = work => C.nearestExploredTile(w,.5,8.5,0,3300,()=>true,work,C.T.FOREST,2);
  assert.deepEqual(query({}), {x:3200,y:8});
  const work = {cells:0,chunks:0,nodes:0};
  assert.deepEqual(query(work), {x:3200,y:8});
  assert.equal(work.classifiedCells || 0,0,'repeated queries classify nothing');
  assert.equal(work.chunks,1,'exhausted chunks are absent from the eligible index');
  assert.ok(work.cells <= 256,'work is bounded by the live target chunk');
});

test('observed depletion removes reserve-boundary candidates and saves rebuild them correctly', () => {
  const s = C.createState(91362), w = s.world, x = 64, y = 8;
  w.chunks.set(C.packKey(4,0,0),{type:new Uint8Array(256).fill(C.T.FOREST),rich:new Uint8Array(256).fill(3)});
  C.markExplored(w,x,y,0);
  const query = minimum => C.nearestExploredTile(w,x+.5,y+.5,0,6,()=>true,null,C.T.FOREST,minimum);
  assert.deepEqual(query(2),{x,y});
  // Prime the derived index too; a near-only query does not need it.
  C.nearestExploredTile(w,x-8+.5,y+.5,0,12,()=>true,null,C.T.FOREST,2);
  C.setRichness(w,x,y,0,2);assert.deepEqual(query(2),{x,y});
  C.setRichness(w,x,y,0,1);assert.equal(query(2),null);assert.deepEqual(query(1),{x,y});
  C.setRichness(w,x,y,0,0);assert.equal(query(1),null);assert.deepEqual(query(0),{x,y});
  const back=C.deserialize(C.serialize(s));
  assert.equal(C.nearestExploredTile(back.world,x+.5,y+.5,0,6,()=>true,null,C.T.FOREST,1),null);
});

test('remaining-deposit index preserves ordinary nearest-query ordering', () => {
  for(const seed of [12345,777,99]){
    const s=C.createState(seed);s.tools.boots=6;C.revealAround(s,24);
    for(const type of [C.T.FOREST,C.T.STONE,C.T.ORE,C.T.CRYSTAL])for(const minimum of [1,2]){
      const pred=(x,y)=>C.richness(s.world,x,y,0)>=minimum;
      for(const offset of [0,5,-7]){
        const x=s.player.x+offset,y=s.player.y-offset;
        assert.deepEqual(C.nearestExploredTile(s.world,x,y,0,40,()=>true,null,type,minimum),
          C.nearestExploredTile(s.world,x,y,0,40,pred,null,type));
      }
    }
  }
});
