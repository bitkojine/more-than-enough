/* The sign your wanderer holds up in a shared world: a QR code of an invite
 * link, for a friend to scan with their phone's camera (render/sprites.js
 * drawSign draws it). It rises in a third of a second and comes down when
 * the invite runs out or you put it down; tapping it copies its link. The
 * Invite button beside the dock holds it up or puts it down.
 *
 * The page is reached only through what's passed in (`el`, `qr`, `copy`,
 * `page`), so tests run it with stand-ins. */

import { t } from '../i18n/i18n.js';

export const SIGN_SPEED = 3; // the sign goes up in a third of a second

// The link on the sign. The invite is in the fragment (#), which browsers
// never send to any server: it reaches the friend's phone and nowhere else.
export const inviteUrl = ({ origin, pathname }, room, code) =>
  origin + pathname + '#join=' + room + '.' + code;

export function createInviteSign({
  el, // {invite, inviteLabel}: the button and its label
  body, // classList 'signing' clears the screen around the sign (style.css)
  qr, // url -> a promise of its canvas (qr.js, loaded the first time it's needed)
  copy, // text -> Promise
  page, // {origin, pathname}
  room, // () -> the shared world's id
  shown, // () -> whether the button belongs on screen
  toast,
  now = () => Date.now()
}) {
  let invite = null; // {code, until} while the QR is up
  let rise = 0; // 0..1: how far up the sign is
  let face = null; // the QR on it (a canvas), kept while it comes down

  function render() {
    const up = !!invite;
    el.invite.hidden = !shown();
    el.invite.classList.toggle('up', up);
    body.classList.toggle('signing', up);
    el.invite.setAttribute('aria-pressed', String(up));
    el.inviteLabel.textContent = t(up ? 'together.button.down' : 'together.button');
  }

  return {
    get invite() {
      return invite;
    },
    get rise() {
      return rise;
    },
    get face() {
      return face;
    },
    render,

    // The room gave us an invite: up goes the sign with its code.
    // The QR is drawn as soon as its code is in (the first sign loads it);
    // the sign rises meanwhile.
    show(code, until) {
      const mine = { code, until };
      invite = mine;
      face = null;
      render();
      return Promise.resolve(qr(inviteUrl(page, room(), code))).then((canvas) => {
        if (invite === mine) face = canvas;
      });
    },

    // The sign goes down; its link keeps working (see Invite links).
    close() {
      invite = null;
      render();
    },

    tick(dt) {
      rise = Math.max(0, Math.min(1, rise + (invite ? dt : -dt) * SIGN_SPEED));
      if (rise === 0 && !invite) face = null;
      if (invite && now() > invite.until) this.close();
    },

    // Tapping your sign copies its link, to send to a friend who isn't there.
    async copyLink() {
      if (!invite) return;
      try {
        await copy(inviteUrl(page, room(), invite.code));
        toast(t('together.toast.copied'));
      } catch {
        toast(t('together.toast.copyFailed'));
      }
    }
  };
}
