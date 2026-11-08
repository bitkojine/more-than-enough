/* Someone else's crystal shared in a crystal room (0.200.0): the room's part
 * of src/core/cultivation-share.js. A job asked at someone's building goes
 * to its owner's game to do, then what came of it to the asker's game to
 * take in; each writes down when, so the room's copy of each does it at
 * the same point. Methods of Room, kept here by subject; `this` is the
 * room. Messages for one player go out as `to` ([{id, m}], worker.js).
 *
 * Jobs waiting on a game are kept in memory only: a restart forgets them,
 * and a player away when their part comes has it done in the room's copy at
 * once (their next welcome has it). */

import { doShared, gotShared } from '../../src/core/cultivation-share.js';
import { carriedLightLevel } from '../../src/core/illumination.js';

const SHINE_EVERY = 2; // seconds of someone's light near you gathered before you're told
const SHINE_GAP = 10; // seconds of play one acts message may count, at most

export class RoomJobs {
  // Whether player `id`'s game is there and takes jobs (its hello says `shares`).
  takesJobs(id) {
    const pl = this.players.get(id);
    return !!pl && pl.st !== 'offline' && pl.shares === true && !pl.frozen;
  }

  // Player `from` asked for `req` ({type, x, y, z, by}) at `by`'s building.
  askJob(from, req, now) {
    this.jobs ||= new Map();
    this.jobNo = (this.jobNo || 0) + 1;
    const n = this.jobNo,
      job = { n, from, owner: req.by, req: jobOf(req) };
    const owner = this.players.has(job.owner) && this.shadowOf().of(job.owner, this, now);
    if (!owner?.s.cultivation || job.owner === from) {
      this.jobs.set(n, job);
      return this.jobDone(n, { ok: false, n: 0, q: 0 }, now);
    }
    this.jobs.set(n, job);
    if (!this.takesJobs(job.owner)) return this.jobDone(n, doShared(owner.s, job.req), now);
    (owner.s.toTake ||= new Map()).set(n, job.req);
    return [{ id: job.owner, m: { t: 'take', n, k: job.req.type, ...at(job.req), by: from } }];
  }

  // Job `n` was done, and `got` came of it: to whoever asked.
  jobDone(n, got, now) {
    const job = this.jobs?.get(n);
    if (!job) return [];
    this.jobs.delete(n);
    const sh = this.players.has(job.from) && this.shadowOf().of(job.from, this, now);
    if (!sh?.s.cultivation) return [];
    if (!this.takesJobs(job.from)) {
      gotShared(sh.s, job.req, got);
      return [];
    }
    (sh.s.toGet ||= new Map()).set(n, { req: job.req, got });
    const m = { t: 'given', n, k: job.req.type, ...at(job.req), by: job.owner };
    return [{ id: job.from, m: { ...m, ok: got.ok, c: got.n, q: got.q } }];
  }

  // Player `by`'s carried light as a source {x, y, z, level}, or null when
  // they carry none lit, or aren't someone the room shares with.
  lightOf(by, other) {
    const level = this.takesJobs(by) && other.s.cultivation ? carriedLightLevel(other.s) : 0;
    if (!level) return null;
    const p = other.s.player;
    return { x: Math.floor(p.x), y: Math.floor(p.y), z: p.z, level };
  }

  // Someone else's lantern or flare, lit near player `id` while they played
  // since last looked (0.202.0, Watch: anyone's light hurts all of it), when
  // they carry crystal outside a carrier or have wild colonies near it:
  // their game is told ('lit') once SHINE_EVERY seconds gathered. Looked at
  // with each of their acts and saves, so standing still counts too.
  shine(id) {
    const sh = this.shadow?.players.get(id);
    if (this.eco !== 'crystal' || !sh?.s.cultivation || !this.takesJobs(id)) return [];
    const secs = playedSince(sh);
    if (!secs) return [];
    const out = [];
    for (const [by, other] of this.shadow.players) {
      const src = by === id ? null : this.lightOf(by, other);
      if (!src || !lightReaches(sh.s, src)) continue;
      sh.shone ||= new Map();
      const gathered = (sh.shone.get(by) || 0) + secs;
      sh.shone.set(by, gathered);
      if (gathered < SHINE_EVERY) continue;
      sh.shone.delete(by);
      out.push(this.litMessage(id, sh, by, src, gathered));
    }
    return out;
  }

  // Tells player `id` (shadow `sh`) that `by`'s light shone on them for
  // `gathered` seconds, kept so the room's copy of them takes it with theirs.
  litMessage(id, sh, by, src, gathered) {
    this.jobNo = (this.jobNo || 0) + 1;
    const n = this.jobNo,
      s = Math.round(gathered * 100) / 100;
    (sh.s.toLight ||= new Map()).set(n, { src, secs: s });
    const { x, y, z, level: lv } = src;
    return { id, m: { t: 'lit', n, x, y, z, lv, s, by } };
  }

  // Player `id` comes in: jobs still waiting on their game are done in the
  // room's copy of them now, so their welcome has them. Returns messages
  // for others (a job done for someone who asked).
  settleJobs(id, now) {
    const sh = this.shadow?.players.get(id);
    if (!sh) return [];
    const out = [];
    for (const [n, req] of sh.s.toTake || [])
      out.push(...this.jobDone(n, doShared(sh.s, req), now));
    for (const { req, got } of sh.s.toGet?.values() || []) gotShared(sh.s, req, got);
    sh.s.toTake = new Map();
    sh.s.toGet = new Map();
    sh.s.toLight = new Map(); // light that shone while they were gone did nothing
    return out;
  }
}

// A job's parts, as its owner's game is told them (cleanJob takes them in).
const jobOf = ({ type, x, y, z, tx, ty }) => ({
  type,
  x,
  y,
  z,
  ...(type === 'move' ? { tx, ty } : {})
});
// Whether light `src` could reach anything of `s`'s it hurts: what they
// carry outside a carrier, or one of their wild colonies (litBy does the rest).
function lightReaches(s, { x, y, z, level }) {
  const near = (p) => p.z === z && Math.abs(p.x - x) + Math.abs(p.y - y) < level;
  const c = s.cultivation,
    p = { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: s.player.z };
  const carried = s.inv.crystal > 0 || c.starter || c.heart?.where === 'carried';
  if (!c.gear.carrier && carried && near(p)) return true;
  return Object.values(c.wild).some((w) => !(w.regrow > 0) && near(w));
}
const at = ({ x, y, z, tx, ty }) => ({ x, y, z, ...(tx === undefined ? {} : { tx, ty }) });

// Seconds player shadow `sh` played since last looked at (at most
// SHINE_GAP), and looked at now.
function playedSince(sh) {
  const ms = sh.s.stats.playedMs;
  const secs = Math.min(SHINE_GAP, Math.max(0, ms - (sh.litAt ?? ms)) / 1000);
  sh.litAt = ms;
  return secs;
}
