/* A company bot keeping a person company (bot plan phase 4, 0.211.0): when
 * its mind (mind.mjs) says so, it lets go of AUTO, walks to them as a held
 * stick would, and stays beside them, until its mind says its story again,
 * they go, or it can't get any closer; then AUTO goes on with its story. */

import { COMPANY_M } from './mind.mjs';

export const BESIDE_M = 3; // m from the person: close enough
export const STUCK_S = 8; // s without getting closer: it can't reach them

export function createCompany({ mind, session, game, seconds, log, auto }) {
  let at = null; // {id, best: closest yet (m), since: when it got there (s)}
  function end() {
    if (!at) return;
    at = null;
    auto().steer(null);
    auto().press();
  }
  return {
    get with() {
      return at?.id ?? null;
    },
    reset() {
      at = null;
    },
    tick() {
      const s = game.state,
        p = s.player,
        now = seconds();
      const goal = mind.decide(s, session.friends.rows(p), now);
      if (goal.kind !== 'company') return end();
      const f = session.friends.view().find((v) => v.id === goal.id);
      // Not drawn yet (just heard of): as far as can be, until it is.
      const d = !f
        ? COMPANY_M
        : f.z === p.z && f.st === 'online'
          ? Math.hypot(f.x - p.x, f.y - p.y)
          : Infinity;
      if (!at || at.id !== goal.id) {
        if (!at) auto().release(); // its own story waits
        at = { id: goal.id, best: d, since: now };
        log('goes to keep someone company');
      }
      if (d < at.best - 0.5) Object.assign(at, { best: d, since: now });
      const stuck = d > BESIDE_M && now - at.since > STUCK_S;
      if (d > COMPANY_M || stuck) {
        log(stuck ? 'could not get to them' : 'they went');
        mind.drop();
        return end();
      }
      if (d <= BESIDE_M) {
        at.since = now; // beside them: stays
        return auto().steer(null);
      }
      auto().steer(f ? { x: (f.x - p.x) / d, y: (f.y - p.y) / d } : null);
    }
  };
}
