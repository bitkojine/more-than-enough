/* What every route of the room service shares (routes.js, admin-routes.js):
 * the security headers, which pages may call it, the moderator's token,
 * request bodies read with a cap, and JSON answers. Nothing here needs
 * Cloudflare, so the unit tests run it (test/unit/http.test.js). */

import { sha256Hex } from '../../src/net/protocol.js';
import { visitor } from './limits.js';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

export function allowedOrigin(env, origin) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes(origin)) return true;
  // Local development only when the deployment says so.
  return (
    env.ALLOW_LOCALHOST === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)
  );
}

// A short, salted hash of a visitor for a room's socket limits: enough to
// count sockets, without the room keeping anyone's address.
export async function visitorTag(room, request) {
  return (
    await sha256Hex('mte-visitor|' + room + '|' + visitor(request.headers.get('CF-Connecting-IP')))
  ).slice(0, 12);
}

// The request body as text, or null once it passes `max` bytes (read in
// pieces, so a huge body is never held whole).
export async function readCapped(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  } catch {
    return null;
  }
}

// Whether a request carries the moderator's token. Without an ADMIN_TOKEN
// secret (or with a short one) there is no moderator. The hashes are
// compared, so how long the comparison takes says nothing about the token.
export async function isAdmin(request, env) {
  const want = env.ADMIN_TOKEN;
  if (typeof want !== 'string' || want.length < 32) return false;
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!got) return false;
  const [a, b] = await Promise.all([sha256Hex('mte-admin|' + got), sha256Hex('mte-admin|' + want)]);
  return a === b;
}

export function respond(body, status, origin) {
  const headers = { ...SECURITY_HEADERS, 'Content-Type': 'application/json' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// The request body as JSON, or null if it's too big or isn't JSON.
export async function readJson(request, max) {
  const body = await readCapped(request, max);
  try {
    return body === null ? null : JSON.parse(body);
  } catch {
    return null;
  }
}
