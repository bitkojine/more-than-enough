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
const at = ({ x, y, z, tx, ty }) => ({ x, y, z, ...(tx === undefined ? {} : { tx, ty }) });
