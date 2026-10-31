/* Invite links (Together → Invite links): the links you and your friends
 * made, how many joined with each, and Show and Stop for the ones that still
 * work; above them, the picks for new links, like Discord's: how many people,
 * for how long. Built from elements and text only, never HTML.
 *
 * together.js owns the connection, the sign and who is who; it hands this
 * panel what it needs as functions, so the list never reaches into the room
 * itself. */

import { cleanInviteAsk, INVITE_USES, INVITE_LIVES } from '../net/protocol.js';
import { cleanInvites } from './room-messages.js';
import { t } from '../i18n/i18n.js';

const USES_STORE = 'mte.inviteUses'; // how many people your new invite links let in
const LIFE_STORE = 'mte.inviteLife'; // and for how many minutes
const WAIT = 8000; // ms to wait for the list before saying it didn't come

// A link's lifetime as the picks name it: minutes, hours or days.
export function lifeText(min) {
  return min < 60
    ? t('invites.minutes', { n: min })
    : min < 1440
      ? t('invites.hours', { n: min / 60 })
      : t('invites.days', { count: min / 1440 });
}

// What is left of a link's time, rounded to what a person reads: at least a
// minute, hours up to two days, then days.
export function timeLeft(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60
    ? t('invites.minutes', { n: min })
    : min < 2880
      ? t('invites.hours', { n: Math.round(min / 60) })
      : t('invites.days', { count: Math.round(min / 1440) });
}

// A link's state line: why it no longer works, or how long it still does.
export function inviteState(inv, now) {
  if (inv.off) return t('invites.stopped');
  if (inv.until <= now) return t('invites.expired');
  if (inv.uses >= inv.max) return t('invites.usedUp');
  return t('invites.left', { time: timeLeft(inv.until - now) });
}

const works = (inv, now) => !inv.off && inv.until > now && inv.uses < inv.max;

/**
 * @param {object} deps
 * @param {HTMLElement} deps.panel   where the list goes
 * @param {() => boolean} deps.online  whether the room is there to ask
 * @param {(msg: object) => void} deps.send
 * @param {(q: object) => Promise<boolean>} deps.ask  the game's yes/no dialog
 * @param {(key: string) => string|null} deps.read   device storage
 * @param {(key: string, value: string) => void} deps.write
 * @param {() => string|null} deps.me          your player id
 * @param {(id: string) => number|undefined} deps.colorOf  a player's colour number
 * @param {(id: string) => string} deps.nameOf
 * @param {(id: string) => string} deps.paint  a colour number's CSS colour
 * @param {() => {code: string}|null} deps.sign  the invite on your sign, if it's up
 * @param {() => void} deps.dropSign
 * @param {(code: string, until: number) => void} deps.show  hold that link up on your sign
 */
export function createInviteList(deps) {
  const { panel, send, read, write } = deps;
  let timer = 0;

  // How many people your new links let in and for how long, remembered on
  // this device. Never unlimited.
  function asked() {
    return cleanInviteAsk({ uses: Number(read(USES_STORE)), life: Number(read(LIFE_STORE)) });
  }

  // Never "loading" for ever: no answer in a few seconds says so.
  function open() {
    clearTimeout(timer);
    const online = deps.online();
    panel.replaceChildren(note(t(online ? 'invites.loading' : 'together.toast.offline')));
    if (!online) return;
    send({ t: 'invites' });
    timer = setTimeout(() => panel.replaceChildren(note(t('invites.failed'))), WAIT);
  }

  // The room's answer to open(): the list as it sent it.
  function received(raw) {
    clearTimeout(timer);
    const list = cleanInvites(raw);
    if (list) render(list);
    else panel.replaceChildren(note(t('invites.failed')));
  }

  function pickRow(label, values, current, text, store, list) {
    const row = document.createElement('div');
    row.className = 'inviteAsk';
    const name = document.createElement('span');
    name.textContent = label;
    const pick = document.createElement('div');
    pick.className = 'pick';
    pick.setAttribute('role', 'radiogroup');
    pick.setAttribute('aria-label', label);
    for (const v of values) {
      const b = button(text(v), v === current ? 'on' : '', () => {
        write(store, String(v));
        if (deps.sign()) deps.dropSign(); // the sign's link was made the old way
        render(list);
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === current));
      pick.append(b);
    }
    row.append(name, pick);
    return row;
  }

  function render(list) {
    const now = Date.now();
    const pick = asked();
    const picks = [
      pickRow(t('invites.ask.uses'), INVITE_USES, pick.uses, String, USES_STORE, list),
      pickRow(t('invites.ask.life'), INVITE_LIVES, pick.life, lifeText, LIFE_STORE, list)
    ];
    if (!list.length) panel.replaceChildren(...picks, note(t('invites.empty')));
    else panel.replaceChildren(...picks, ...list.map((inv) => row(inv, now)));
  }

  function row(inv, now) {
    const mine = inv.by === deps.me();
    const el = document.createElement('div');
    el.className = 'invite' + (works(inv, now) ? '' : ' dead');
    const by = deps.colorOf(inv.by);
    el.style.setProperty('--friend', by === undefined ? 'var(--ink-dim)' : deps.paint(by));
    const dot = document.createElement('i');
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = mine
      ? t('invites.yours')
      : t('invites.theirs', { name: deps.nameOf(inv.by) || t('invites.someone') });
    const sub = document.createElement('small');
    sub.textContent =
      t('invites.uses', { n: inv.uses, max: inv.max }) + ' · ' + inviteState(inv, now);
    text.append(title, sub);
    el.append(dot, text);
    if (works(inv, now)) {
      if (mine) el.append(button(t('invites.show'), '', () => deps.show(inv.code, inv.until)));
      el.append(button(t('invites.stop'), 'stop', () => stop(inv.code)));
    }
    return el;
  }

  async function stop(code) {
    const yes = await deps.ask({
      title: t('invites.stopAsk.title'),
      text: t('invites.stopAsk.text'),
      yes: t('invites.stopAsk.yes'),
      danger: true
    });
    if (!yes) return;
    if (deps.sign()?.code === code) deps.dropSign();
    send({ t: 'revoke', code });
  }

  return { open, received, asked };
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  return p;
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
