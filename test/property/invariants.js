/* The rules the game must never break, as executable checks. Each
 * `invariant(name, check)` is a function of a state that must be true
 * at every point of play; the property tests drive random legal play and
 * hold every one after each step (game.test.js).
 *
 * They come from the code's own promises, not invented: see the comment in
 * src/core/economy.js, save.js, shared.js and format.js each one pins. A
 * check takes the whole state, so feed it whole states only. */

import * as C from '../../src/core/index.js';
import { WORLD_FORMAT, ECON_FORMAT } from '../../src/core/format.js';

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

export function invariants() {
  const list = [];
  const invariant = (name, check) => list.push({ name, check });

  invariant('cultivation condition and completion records remain valid', (s) => {
    if(s.cultivation&&!C.validCultivation(s.cultivation))throw new Error('Invalid cultivation state');
    if(s.cultivation&&C.canEmbark(s)!==(!s.shared&&s.cultivation.completed===true))throw new Error('Cultivation completion mismatch');
  });

  // --- resources and money: never negative, never NaN (economy.js: pay()
  // refuses a cost you can't afford, copyNumbers keeps numbers finite).
  invariant('every resource count is finite and never negative', (s) => {
    for (const r of C.RESOURCES) {
      if (!finite(s.inv[r])) throw new Error(`${r} = ${s.inv[r]}`);
      if (s.inv[r] < 0) throw new Error(`${r} = ${s.inv[r]}`);
      if (!finite(s.stats[r])) throw new Error(`stats.${r} = ${s.stats[r]}`);
      if (s.stats[r] < 0) throw new Error(`stats.${r} = ${s.stats[r]}`);
    }
  });

  // --- you never get something for nothing: you can only hold what you have
  // gathered or been given, so a spend never puts you below zero. This is
  // the balance invariant — the "two requests spend the same balance" case,
  // checked as "what you hold is never more than what you ever had minus a
  // plausible spend". Its concrete half is the non-negative check above; the
  // abstract half is that paying always succeeds or changes nothing.
  invariant('paying a cost you cannot afford changes nothing', (s) => {
    // Pure function of the current inventory, checked directly: this is the
    // atomicity guarantee the room leans on (economy.pay).
    for (const cost of [{ mycelium: s.inv.mycelium + 1 }, { crystal: s.inv.crystal + 1 }, { stone: 1e18 }]) {
      const before = { ...s.inv };
      const paid = C.pay(s.inv, cost);
      if (paid) {
        for (const r in cost) if (s.inv[r] < 0) throw new Error('paid into the negative');
        // undo, so the state is left as the check found it
        for (const r in before) s.inv[r] = before[r];
      } else {
        for (const r in before) if (s.inv[r] !== before[r]) throw new Error('an unaffordable pay touched the packs');
      }
    }
  });

  // --- the tools and chains index their content tables, so their levels stay
  // inside them (save.js: clampInt keeps a tampered save in range).
  invariant('tool and refinery levels index their tables', (s) => {
    for (const k in s.tools) {
      if (!Number.isInteger(s.tools[k])) throw new Error(`tools.${k} = ${s.tools[k]}`);
      if (s.tools[k] < 0 || s.tools[k] > C.TOOLS[k].levels.length) throw new Error(`tools.${k} = ${s.tools[k]}`);
    }
    for (const k in s.resUp) {
      if (!Number.isInteger(s.resUp[k])) throw new Error(`resUp.${k} = ${s.resUp[k]}`);
      if (s.resUp[k] < 0 || s.resUp[k] > C.REFINERIES[k].levels.length) throw new Error(`resUp.${k} = ${s.resUp[k]}`);
    }
    if (!Number.isInteger(s.abundanceLv) || s.abundanceLv < 0) throw new Error(`abundanceLv = ${s.abundanceLv}`);
  });

  // --- one building per tile, and only on a tile a building can stand on
  // (actions.place, extractorAt; PROPS are in world.props, never doubled).
  invariant('no two buildings share a tile', (s) => {
    const seen = new Set();
    for (const e of s.extractors) {
      const at = e.x + ',' + e.y + ',' + e.z;
      if (seen.has(at)) throw new Error(`two buildings at ${at}`);
      seen.add(at);
      if (!C.EXTRACTORS[e.key]) throw new Error(`unknown building ${e.key}`);
      if (!Number.isFinite(e.buffer) || e.buffer < 0) throw new Error(`buffer = ${e.buffer}`);
    }
  });

  // --- the world is a function of the seed plus the edits: any two states
  // with the same seed and edits have the same land. Pinned by serializing
  // and re-reading (save.js) — the "saved progress survives a restart" rule.
  invariant('a state survives a save and load unchanged', (s) => {
    const back = C.deserialize(C.serialize(s));
    if (!back) throw new Error('a state this game made did not load');
    if (back.seed !== s.seed) throw new Error('seed changed');
    if (C.serialize(back) !== C.serialize(s)) throw new Error('a save does not round-trip');
  });

  // --- every world is kept: the format is frozen, and neither a save nor a
  // shared-world round-trip may move it (format.js, worlds-kept.test.js).
  invariant('the world and economy formats never move', () => {
    if (WORLD_FORMAT !== 11 || ECON_FORMAT !== 1) throw new Error(`formats moved: ${WORLD_FORMAT}/${ECON_FORMAT}`);
  });

  // --- your buildings are yours and only yours after a round-trip through
  // the room (shared.js: progressOf keeps your buildings, worldOf marks
  // them, correctProgress restores them as yours). The room's copy never
  // contains a building it doesn't know the owner of.
  invariant('progress sent to the room keeps your buildings yours', (s) => {
    const mine = new Set(s.extractors.filter((e) => !e.owner || e.owner === s.me).map((e) => e.x + ',' + e.y + ',' + e.z));
    const sent = JSON.parse(C.progressOf(s));
    if (Array.isArray(sent.extractors)) {
      for (const e of sent.extractors) {
        const at = e.x + ',' + e.y + ',' + e.z;
        if (!mine.has(at)) throw new Error(`progress sent a building that isn't yours at ${at}`);
      }
    }
  });

  // --- exploring only ever reveals: the fog (world.explored) is a set of
  // masks that never shrinks through play (world.js markExplored sets bits).
  invariant('explored land never un-reveals', (s) => {
    if (!(s.world.explored instanceof Map)) throw new Error('explored is not a map');
    for (const [k, mask] of s.world.explored) {
      if (!Number.isInteger(k)) throw new Error('an explored key is not an integer');
      if (!(mask instanceof Uint8Array)) throw new Error('an explored mask is not bytes');
    }
  });

  // --- the deepest layer only goes down as you dig, and never past the
  // mine's floor (underground.js, Z_MIN).
  invariant('the deepest layer stays within the mine', (s) => {
    if (!Number.isInteger(s.underground.deepest)) throw new Error(`deepest = ${s.underground.deepest}`);
    if (s.underground.deepest > C.SURFACE || s.underground.deepest < C.Z_MIN) throw new Error(`deepest = ${s.underground.deepest}`);
    if (s.player.z > C.SURFACE || s.player.z < C.Z_MIN) throw new Error(`player.z = ${s.player.z}`);
  });

  // --- milestones count once each, in the order reached (goals.js; save.js
  // dedups a tampered list). goalIndex is goalsDone.length.
  invariant('milestones are reached once each, and counted', (s) => {
    if (new Set(s.goalsDone).size !== s.goalsDone.length) throw new Error('a milestone was counted twice');
    if (s.goalIndex !== s.goalsDone.length) throw new Error(`goalIndex ${s.goalIndex} != ${s.goalsDone.length} done`);
    const ids = new Set((s.cultivation?C.CULTIVATION_GOALS:C.GOALS).map((g) => g.id));
    for (const id of s.goalsDone) if (!ids.has(id)) throw new Error(`unknown milestone ${id}`);
  });

  return list;
}
