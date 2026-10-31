/* How much one visitor or connection may send a room (server/src/room.js and
 * worker.js use them): who's asking, and a token bucket per connection. */

import { LIMITS } from '../../src/net/protocol.js';

// Who's asking, for the limits: the IP address, or for IPv6 its /48 (a
// home or a phone gets a /64 to a /48, so single addresses, and even single
// /64s, cost an abuser nothing). Addresses are written out in full first, so
// "2001:db8::1" and "2001:0db8:0:0::1" are the same visitor.
export function visitor(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b]
    : a;
  return (
    groups
      .slice(0, 3)
      .map((g) => (parseInt(g, 16) || 0).toString(16))
      .join(':') + '::/48'
  );
}

/* A token bucket per connection: LIMITS.ratePerSecond on average, bursts
 * up to LIMITS.rateBurst. A connection that keeps going over is closed:
 * each refusal is a strike, and one strike is forgiven every STRIKE_FORGIVE_MS,
 * so an honest connection that goes over now and then is never cut. */
export const STRIKE_FORGIVE_MS = 10_000;
export class Bucket {
  constructor(now, rate = LIMITS.ratePerSecond, burst = LIMITS.rateBurst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = now;
    this.strikes = 0;
  }

  take(now, n = 1) {
    this.strikes = Math.max(0, this.strikes - (now - this.at) / STRIKE_FORGIVE_MS);
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    this.strikes++;
    return false;
  }
}

// A player's budget of edits (per player, not per connection: see moves.js).
export const editBucket = (now) => new Bucket(now, LIMITS.editsPerSecond, LIMITS.editsBurst);
