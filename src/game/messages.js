/* The message log (Watch, 2026-10-26): everything the game says to the
 * player, in one place at the bottom left, like Old School RuneScape's chat
 * box. Wiki's lines, milestones and the game's own notices (a low lantern,
 * something you can't do yet, a save that failed) each go in as a line, in
 * their own colour, and stay: nothing fades or hides by itself, so there is
 * all the time to read it. The open log shows the last three; dragging (or
 * scrolling) inside it goes back through older ones. Hide folds it into a
 * small Messages pill, where new lines only raise the count, until the
 * pill is tapped (Watch's choice). Whether it's open is kept on this device,
 * and so are the last lines of each world. Presentation only. Layout:
 * docs/ui.md, Messages. */
import { t } from '../i18n/i18n.js';

const STORE = 'mte.log.';
const KEEP = 50;      // lines kept per world
const SHOWN = 3;      // lines the open log shows without scrolling
const CLEAR_PX = 12;  // kept between the log and Mica's feet, or the HUD above

const TROPHY = '<svg class="trophy" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4M8 21h8M9.5 17h5v4h-5z"/></svg>';

// Some private modes throw on merely touching localStorage.
const localStore = () => { try { return globalThis.localStorage; } catch { return null; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KINDS = ['wiki', 'milestone', 'goal', 'game'];

// One line's inner HTML. `line`: { kind, name, text, link, of, then, n }.
export function lineHtml(line) {
  let who = '', body = esc(line.text);
  if (line.kind === 'wiki') {
    who = `<b class="who">${esc(t('wiki.name'))}:</b> `;
    if (line.name) body = `<strong>${esc(line.name)}.</strong> ` + body;
    if (line.link) body += ` <a href="${esc(line.link)}" target="_blank" rel="noopener">${esc(t('wiki.more'))}</a>`;
  } else if (line.kind === 'milestone' || line.kind === 'goal') {
    const label = t(line.kind === 'milestone' ? 'hud.milestone' : 'hud.nextMilestone') + (line.of ? ' ' + line.of : '');
    who = `<b class="who">${TROPHY}${esc(label)}:</b> `;
    if (line.then) body += '. ' + esc(t('hud.then', { goal: line.then }));
  }
  return who + body + (line.n > 1 ? ` <span class="times">×${line.n}</span>` : '');
}

// `world()`: which world's lines to show (a key, or null before one loads).
// `feet()`: Mica's feet on the screen ({x, y}), for the log to stay under.
// `open`: whether it starts open (a new player's does); `keepOpen(open)`
// remembers the choice.
export function createMessages({ world = () => null, feet = () => null, open = true, keepOpen = () => {}, store = localStore(), root = document.body } = {}) {
  const box = document.createElement('section');
  box.id = 'log'; box.setAttribute('aria-label', t('log.title'));
  const list = document.createElement('div');
  list.id = 'logLines'; list.setAttribute('role', 'log'); list.setAttribute('aria-live', 'polite');
  const foot = document.createElement('div'); foot.className = 'logFoot';
  const hide = document.createElement('button');
  hide.id = 'logHide'; hide.type = 'button'; hide.textContent = t('log.hide');
  foot.append(hide); box.append(list, foot);
  const pill = document.createElement('button');
  pill.id = 'logPill'; pill.type = 'button';
  const pillName = document.createElement('span'); pillName.textContent = t('log.title');
  const count = document.createElement('b'); count.className = 'count';
  pill.append(pillName, count);
  root.append(box, pill);

  let key = null, lines = [], unread = 0, last = '', pad = null;

  // Another world's lines. What was said before any world loaded (a save
  // that couldn't be read) belongs to the first one.
  function load(k) {
    const early = key === null ? lines : [];
    key = k; lines = [];
    try {
      const raw = k && store && JSON.parse(store.getItem(STORE + k));
      if (Array.isArray(raw)) lines = raw.filter((l) => l && KINDS.includes(l.kind) && typeof l.text === 'string');
    } catch { /* unreadable: start empty */ }
    lines = lines.concat(early).slice(-KEEP);
    unread = open ? 0 : early.length;
    if (early.length) save();
    render();
  }
  function save() {
    try { key && store && store.setItem(STORE + key, JSON.stringify(lines)); } catch { /* full or blocked: kept for this visit */ }
  }
  function sync() { const k = world(); if (k !== key) load(k); }

  function show() {
    box.hidden = !open || !lines.length;
    pill.hidden = open || !lines.length;
    count.textContent = unread ? String(unread) : '';
    count.hidden = !unread;
    pill.setAttribute('aria-label', unread ? t('log.unread', { count: unread }) : t('log.title'));
  }
  // Someone reading back through older lines stays where they are when a
  // new one comes in; otherwise the newest is in view.
  let reading = false;
  function render() {
    reading = !!last && !box.hidden && list.scrollTop + list.clientHeight < list.scrollHeight - 30;
    list.innerHTML = lines.map((l) => `<p class="msg ${l.kind}">${lineHtml(l)}</p>`).join('');
    show(); last = ''; fit();
  }

  // The last SHOWN lines tall, no taller than the room between what's
  // above it (Mica's feet when the log is under them, the depth meter, the
  // top bar) and its own foot, and scrolled to the newest.
  function fit() {
    if (box.hidden) return;
    const r = box.getBoundingClientRect(), items = list.children;
    let top = 0;
    for (const id of ['topbar', 'depthMeter']) {
      const o = document.getElementById(id)?.getBoundingClientRect();
      if (o && o.height && o.right > r.left && o.left < r.right) top = Math.max(top, o.bottom);
    }
    const f = feet();
    if (f && f.x > r.left - 30 && f.x < r.right + 30) top = Math.max(top, f.y);
    const room = r.bottom - foot.offsetHeight - top - CLEAR_PX;
    // From the first shown line's top to the end, plus the list's own top
    // padding, so that line keeps the same room above it as at the sides.
    const first = items[Math.max(0, items.length - SHOWN)];
    pad ??= parseFloat(globalThis.getComputedStyle?.(list).paddingTop) || 0;
    const want = first ? list.scrollHeight - (first.offsetTop - list.offsetTop) + pad : 0;
    const h = Math.max(Math.min(want, room), Math.min(want, 40)) | 0;
    const stamp = h + ':' + list.scrollHeight;
    if (stamp === last) return;
    const atEnd = last ? list.scrollTop + list.clientHeight >= list.scrollHeight - 30 : !reading;
    reading = false;
    last = stamp;
    list.style.maxHeight = h + 'px';
    if (atEnd) list.scrollTop = list.scrollHeight;
  }

  function setOpen(on) {
    open = on; if (on) unread = 0;
    keepOpen(on); show(); last = ''; fit();
  }
  hide.addEventListener('click', () => setOpen(false));
  pill.addEventListener('click', () => setOpen(true));
  // A drag inside the log scrolls it; it never reaches the map below.
  for (const type of ['pointerdown', 'wheel', 'touchstart']) box.addEventListener(type, (e) => e.stopPropagation(), { passive: true });

  return {
    // A line in. `group`: lines from one long press that slides over the
    // map; while it's the newest, the next one of its group takes its place.
    add(line, group = null) {
      sync();
      if (!line || !line.text) return;
      const tail = lines.at(-1);
      const entry = { kind: KINDS.includes(line.kind) ? line.kind : 'game', text: String(line.text), n: 1 };
      for (const k of ['name', 'link', 'of', 'then']) if (line[k]) entry[k] = String(line[k]);
      // A milestone just said what's next ("Next: ..."): no second line for it.
      if (entry.kind === 'goal' && tail?.kind === 'milestone' && tail.then === entry.text) return;
      if (group && tail?.group === group) { Object.assign(tail, entry); }
      else if (tail && lineHtml({ ...tail, n: 1 }) === lineHtml(entry)) tail.n++;
      else { lines.push(entry); if (lines.length > KEEP) lines.splice(0, lines.length - KEEP); if (!open) unread++; }
      if (group) lines.at(-1).group = group; else delete lines.at(-1).group;
      save(); render();
    },
    // Each frame or so: another world's lines, and the room the log has.
    tick() {
      const invite = document.getElementById('btnInvite');
      document.body.classList.toggle('inviting', !!invite && !invite.hidden);
      sync(); fit();
    },
    get open() { return open; },
    setOpen,
    get unread() { return unread; },
    // For tests: the lines as plain text, oldest first.
    get lines() { return lines.map((l) => l.kind + ': ' + (l.name ? l.name + '. ' : '') + l.text + (l.then ? '. ' + l.then : '')); },
    get last() { const l = lines.at(-1); return l ? (l.name ? l.name + '. ' : '') + l.text : ''; }
  };
}
