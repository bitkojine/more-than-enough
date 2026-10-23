/* localStorage persistence. Every access is guarded: private browsing and full
 * quotas throw, and the game must keep running regardless. */

import { serialize, deserialize, createState, SAVE_VERSION, OLDEST_SAVE } from '../core/index.js';

const SAVE_KEY = 'more-than-enough-save';
// A save this version couldn't read, set aside rather than written over.
const ASIDE_KEY = 'more-than-enough-save-aside';
function freshWorld() { return createState(randomSeed(),{cultivation:true}); }
const VIEW_KEY = 'more-than-enough-view';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// Returns the error if the write failed (full quota, storage blocked), else null.
function write(key, value) {
  try { localStorage.setItem(key, value); return null; } catch (err) { return err; }
}

export function randomSeed() {
  for(let i=0;i<100;i++){
    const seed=(Math.random()*4294967295)>>>0;
    if(!read('mte.solo.world.'+seed)&&!read('mte.depot-v1.world.'+seed))return seed;
  }
  throw new Error('No unused world seed'); // i18n-ok: diagnostic

}

// The save as this tab last read or wrote it. If what's stored differs, another
// tab has saved since: writing now would throw that tab's progress away.
let known = null;

// What another tab saved since this tab last read or wrote, or null if the
// save is still this tab's.
export function savedElsewhere() {
  const cur = read(SAVE_KEY);
  return cur !== null && cur !== known ? cur : null;
}

// Saves, unless another tab has saved since (then nothing is written and
// `conflict` holds that tab's save). `force` writes regardless.
// Returns null when saved, { conflict } or { error }.
export function saveGame(state, force = false) {
  if (state.cultivation&&state.shared) return {error:new Error('Save slot mismatch')}; // i18n-ok: storage diagnostic
  if (!force) {
    const other = savedElsewhere();
    if (other) return { conflict: other };
  }
  const raw = serialize(state);
  {
    const archived=write('mte.solo.world.'+state.seed,raw);
    if(archived)return {error:archived};
  }
  const err = write(SAVE_KEY, raw);
  if (err) return { error: err };
  known = raw;
  return null;
}

// Takes another tab's save as this tab's own. Returns its state, or null if
// this version of the game can't read it.
export function adopt(raw) {
  const state = deserialize(raw);
  if (state) known = raw;
  return state;
}

// Calls `fn` when another tab saves.
export function onSavedElsewhere(fn) {
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY && e.newValue !== null && e.newValue !== known) fn();
  });
}

// Loads the saved game, or starts a new world. `lost` says why a save that
// existed could not be read, so the player can be told: 'format' (made by
// another version of the game: a newer one, or one from before the
// oldest format kept) or 'broken'; false when nothing was lost.
// A save that can't be read is set aside, never just written over: one this
// version can read is taken back instead (an old cached page right after an
// update set the new game's save aside, or a later fix reads it again), and
// so is one played further than the save in use (v0.109.0, the last format
// change ever, set format 10 worlds aside and started new ones): every
// world is kept (src/core/format.js).
export function loadGame() {
  const raw = read(SAVE_KEY);
  known = raw;
  const aside = read(ASIDE_KEY);
  const back = aside && deserialize(aside);
  let state = raw && deserialize(raw);
  if(state&&!state.cultivation){
    const archived=read('mte.solo.world.'+state.seed),saved=archived&&deserialize(archived);
    if(saved?.cultivation){write(ASIDE_KEY,raw);state=saved;if(!write(SAVE_KEY,archived))known=archived;}
  }
  if (state && !(back && further(back, state))) return { state, lost: false };
  if (back) {
    // Back in use first, then the other set aside: closing the game in
    // between loses neither.
    if (!write(SAVE_KEY, aside)) { known = aside; write(ASIDE_KEY, raw ?? ''); }
    return { state: back, lost: false };
  }
  if (!raw) return { state: freshWorld(), lost: false };
  write(ASIDE_KEY, raw);
  return { state: freshWorld(), lost: formatOf(raw) === null ? 'broken' : 'format' };
}

// Whether world `a` has been played further than `b`: more Embarks (each
// starts the play clock again), else more time played.
function further(a, b) {
  return a.prestiges !== b.prestiges ? a.prestiges > b.prestiges : a.stats.playedMs > b.stats.playedMs;
}

// The format version a save says it has, or null if it doesn't say one.
function formatOf(raw) {
  try {
    const v = JSON.parse(raw)?.v;
    return Number.isInteger(v) && (v > SAVE_VERSION || v < OLDEST_SAVE) ? v : null;
  } catch { return null; }
}

// The viewer's zoom, drag direction, music choice, the tracks they have
// heard, quality level, whether they know to hold Gather, and whether time
// away makes anything (freeze season defaults it off): conveniences for this
// browser, not game state.
export function loadView() {
  try {
    const v = JSON.parse(read(VIEW_KEY));
    return {
      zoom: Number(v.zoom) || 1,
      invertDrag: v.invertDrag === true,
      music: v.music !== false,
      heard: Array.isArray(v.heard) ? v.heard.filter((x) => typeof x === 'string') : [],
      quality: Number(v.quality) || 0,
      holdTip: v.holdTip === true,
      awayProduce: v.awayProduce === true
    };
  } catch {
    return { zoom: 1, invertDrag: false, music: true, heard: [], quality: 0, holdTip: false, awayProduce: false };
  }
}

export function saveView(view) {
  write(VIEW_KEY, JSON.stringify(view));
}

// Retained solo worlds share one normal client; these are archives, not modes.
export function soloArchives(){
 try{return Object.keys(localStorage).filter(k=>k.startsWith('mte.solo.world.')||k.startsWith('mte.depot-v1.world.')||k==='mte.depot-v1.save').flatMap(k=>{const raw=read(k);try{const d=JSON.parse(raw);return Number.isInteger(d.seed)?[{seed:d.seed,raw}]:[];}catch{return [];}});}catch{return [];}
}
export function newSoloWorld(){return freshWorld();}
