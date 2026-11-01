/* Playing together: one world shared with friends through a room on the room
 * service (server/). You hold up a sign with a QR code; a friend scans it
 * with their phone's camera and lands next to you in your world.
 *
 * The room is the source of truth for the world and keeps each player's own
 * progress. This module decides what to do with what it says and sends it
 * what you do. Its parts: the connection (room-link.js), the friends you see
 * (friends.js), the sign (invite-sign.js), the invite links (invite-list.js),
 * what waits to be sent (outbox.js), who you are (identity.js), and the pure
 * decisions (together-rules.js, room-messages.js). Everything that arrives
 * is checked (src/net/protocol.js, then the core's own tables) before it
 * touches the game; nothing from the network is ever put into the page as
 * HTML. */

import * as Core from '../core/index.js';
import { LIMITS, parse } from '../net/protocol.js';
import { roomService } from '../net/config.js';
import { WORLD_FORMAT } from '../core/format.js';
import { playedTime, cleanWelcome } from './room-messages.js';
import { closeReason } from './together-rules.js';
import { createRoomHandlers } from './room-handlers.js';
import { createRoomSender, createAwayTeller } from './room-sender.js';
import { checkMaking, arrivalState } from './arrival.js';
import {
  knownRooms,
  remember,
  forget,
  skip,
  worldName,
  soloName,
  listWorlds,
  roomGone
} from './worlds.js';
import { createFriendsHud } from './players.js';
import { createInviteList } from './invite-list.js';
import { createInviteSign } from './invite-sign.js';
import { createFriends, friendColor } from './friends.js';
import { createRoomLink, socketUrl } from './room-link.js';
import {
  read,
  write,
  myKey,
  playing,
  agreedToPolicy,
  agreeToPolicy,
  askToPlayTogether,
  PLAYING_STORE
} from './identity.js';
import { loadGame, soloWorlds } from './storage.js';
import { createActor } from './render/motion.js';
import { createOutbox, resync as resyncState } from './outbox.js';
import { t } from '../i18n/i18n.js';

const WELCOME_BYTES = 8_000_000; // the most a room's welcome may be
const FORMAT_RETRY = 60_000; // ms before trying a world again whose room service hasn't updated yet
// Why a link turned you away (the room says, see server/src/room.js whyNot).
const INVITE_WHY = Object.freeze({
  expired: () => t('together.toast.inviteExpired'),
  usedUp: () => t('together.toast.inviteUsedUp'),
  stopped: () => t('together.toast.inviteStopped'),
  limit: () => t('together.toast.inviteLimit', { n: LIMITS.invitesPerDay })
});

const JOIN_RE = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

const seconds = () => performance.now() / 1000;

/* ------------------------------------------------------------------ */

export function createTogether({
  game,
  hud,
  ask,
  el,
  fbi,
  checkUpdate = () => {},
  closeSheet = () => {},
  showPlayers = () => {},
  onAway = () => {}
}) {
  const service = roomService();
  let room = null; // the shared world you're in (or joining)
  let back = null; // the shared world you're still in while a link takes you to another
  let code = null; // the invite you're joining with, used once
  let clock = null; // the world's clock: {t: its time, at: our time then}
  let turnedAway = null; // why the room said your invite link no longer works
  const outbox = createOutbox(); // edits, acts and progress sent, kept until the room has them (outbox.js)
  // Whether this player's time away makes anything (freeze season defaults it
  // off). Their own Settings choice, told to the room on every join (hello),
  // which works out away production for them (server/src/shadow.js away).
  let awayProduce = false;

  const friends = createFriends({ clock: seconds, actor: createActor, limit: LIMITS.players });
  const link = createRoomLink({
    hello: () => ({ t: 'hello', key: myKey(), away: awayProduce, ...(code ? { code } : {}) }),
    onMessage: receive,
    onClosed: closed
  });
  const send = link.send;
  const sender = createRoomSender({ outbox, send, ready: () => link.ready, write });
  const save = sender.save;
  const sign = createInviteSign({
    el,
    body: document.body,
    qr: (url) => import('./qr.js').then((m) => m.qrCanvas(url)), // the QR library loads only for a sign
    copy: (text) => navigator.clipboard.writeText(text),
    page: location,
    room: () => room,
    shown: () => !!service && !!game.state.shared,
    toast: (text) => hud.toast(text)
  });

  /* ---------------------------------------------------- the connection */

  function connect() {
    turnedAway = null;
    link.connect(room && service ? socketUrl(service, room) : null);
  }

  function closed(codeNum, reason) {
    friends.unheard();
    const why = closeReason(codeNum, reason);
    // The newer screen plays this world now, and comes back to it next time.
    if (why === 'elsewhere') return stop(t('together.toast.elsewhere'), false);
    if (why === 'removed') {
      forget(room);
      return stop(t('together.toast.removed'));
    }
    // The moderator froze this character: the "FBI" notice, every time,
    // and back to your own world.
    if (why === 'frozen') {
      skip(room);
      refused();
      return fbi.show();
    }
    // An admin's copy whose time was up (server/src/copy.js): it's gone.
    if (why === 'copyEnded') {
      forget(room);
      return stop(t('copy.ended'));
    }
    if (why === 'invite')
      return refused(turnedAway ? INVITE_WHY[turnedAway]() : t('together.toast.inviteOld'));
    if (why === 'full') return refused(t('together.toast.full'));
    if (!room) return;
    // Never got in (the service is down or unreachable): say so, don't loop,
    // and try again next time the game opens.
    if (game.state.shared !== room) {
      gone(room);
      return refused(t('together.toast.unreachable'), false);
    }
    // Lost the connection: keep playing, and come back as soon as it can.
    if (link.retryLater(connect)) hud.toast(t('together.toast.reconnecting'));
  }

  // The network is back (the phone found Wi-Fi again, or the game is back
  // on screen) while waiting to reconnect: try now, not after the wait.
  function retryNow() {
    if (link.waiting && !link.open && room) connect();
  }

  // A world didn't let you in: back to the shared world you came from, if
  // a link was taking you elsewhere, else to your own.
  function refused(message, forget = true) {
    if (!back) return stop(message, forget);
    link.hangUp();
    room = back;
    back = null;
    code = null;
    link.resetRetry();
    if (message) hud.toast(message);
    connect();
  }

  // The world and this game are on different world formats. A newer world
  // needs the newest game, which reloads in as soon as the site has it; an
  // older one waits for the room service to update, and the game tries again.
  let formatTimer = 0;
  function mismatched(gameIsOld) {
    const was = room;
    refused(t(gameIsOld ? 'together.toast.oldGame' : 'together.toast.worldUpdating'), false);
    if (gameIsOld) checkUpdate();
    clearTimeout(formatTimer);
    // Only if nothing else started meanwhile (a link, going online, Back to the shared world).
    formatTimer = setTimeout(() => {
      if (!game.state.shared && !room && read(PLAYING_STORE) === was) resume();
    }, FORMAT_RETRY);
  }

  // Leaves the shared world for your own (saving your progress there first).
  // `forget`: the game no longer opens into it (not when another screen
  // took it over, or it couldn't be reached).
  function stop(message, forget = true) {
    if (game.state.shared) save(game.state, true);
    const wasIn = !!game.state.shared;
    if (forget && read(PLAYING_STORE) === (game.state.shared || room)) write(PLAYING_STORE, '');
    room = null;
    back = null;
    code = null;
    clock = null;
    outbox.reset();
    link.hangUp();
    friends.clear();
    sign.close();
    renderFriends();
    if (wasIn) game.replace(loadGame().state, 'back');
    if (message) hud.toast(message);
    game.changedMode();
  }

  /* ------------------------------------------------- what the room says */

  const handlers = createRoomHandlers({
    game,
    hud,
    friends,
    outbox,
    sign,
    here: () => room,
    invites: () => invites,
    onAway,
    renderFriends: () => renderFriends(),
    checkUpdate,
    clock: seconds
  });

  function receive(raw) {
    const d = parse(raw, WELCOME_BYTES);
    if (!d) return;
    if (d.t === 'welcome') return welcome(d);
    // Turned away at the door: why the link no longer works, said before the close.
    if (!link.letIn && d.t === 'invite' && Object.hasOwn(INVITE_WHY, d.why)) turnedAway = d.why;
    if (link.letIn) handlers.handle(d);
  }

  function welcome(raw) {
    const w = cleanWelcome(raw);
    if (!w) {
      stop(t('together.toast.broken'));
      return;
    }
    // Made another way than this game makes worlds (an update is rolling
    // out): the same seed would grow different land here than for everyone
    // else, so not until both sides match.
    if (w.fmt !== WORLD_FORMAT) return mismatched(w.fmt > WORLD_FORMAT);
    link.welcome();
    code = null; // an invite is for getting in once
    back = null;
    friends.welcome(w.you, w.c, w.players, w.graves);
    remember(room);
    write(PLAYING_STORE, room);
    const renewed = checkMaking(room, w, read, write);
    if (game.state.shared === room && !renewed) resync(w);
    else if (!arrive(w, renewed)) return;
    // The room works out your progress from what you do too (src/core/acts.js).
    if (game.state.shared === room) game.state.acts ||= [];
    // ...moves too, when it says so (src/core/actions.js moveExtractor).
    if (game.state.shared === room) {
      game.state.roomMoves = w.moves;
      game.state.roomCollectAt = w.collectAt;
    }
    if (w.time !== null) clock = { t: w.time, at: seconds() };
    keepTime();
    sender.reset();
    if (document.hidden) sendAway(); // the room takes everyone in as here
    renderFriends();
    game.changedMode();
  }

  // Arriving: your progress is the room's (it works it out from what you
  // did). Says whether the world could be opened.
  function arrive(w, renewed) {
    outbox.newWorld(); // edits for another world, or one made again
    const made = arrivalState(room, w, renewed, read);
    if (!made) {
      stop(t('together.toast.broken'));
      return false;
    }
    game.replace(made.state);
    game.arrived();
    handlers.fixed = made.fixed;
    const inWorld = t('together.toast.in', { world: worldName(room) });
    hud.toast(made.fixed ? inWorld + '. ' + t('together.toast.fixed') : inWorld);
    policyNotice();
    return true;
  }

  // Back after a lost connection: the room's world wins, your progress stays,
  // and what you changed meanwhile is sent again (outbox.js resync).
  function resync(w) {
    resyncState(game.state, w, friends.me, outbox, playedTime(w.save));
    game.worldChanged();
  }

  /* ------------------------------------------------------- each frame */

  // The world's time of day is the room's: everyone in it sees the same sun.
  // The room sends its clock on every welcome; between those it runs here.
  function keepTime() {
    const s = game.state;
    if (s.shared === room && clock) s.time = clock.t + seconds() - clock.at;
  }

  function tick(dt) {
    const s = game.state;
    sign.tick(dt);
    if (!s.shared) return;
    keepTime();
    sender.trim(s);
    friends.tick(dt);
    if (!link.ready) return sender.offline(s, dt);
    if (!link.tick(dt)) return; // the room went silent: dropped, and trying again
    const you = { facing: game.facing(), moving: game.moving(), sign: sign.rise > 0 };
    sender.tick(s, dt, { ...you, act: game.act() });
  }

  // Couldn't get into a world: the room service may be down, or the world
  // gone. Gone, it's forgotten and the player told; down, nothing changes.
  async function gone(id) {
    if (!(await roomGone(service, id))) return;
    forget(id);
    if (read(PLAYING_STORE) === id) write(PLAYING_STORE, '');
    if (!game.state.shared) game.changedMode();
    hud.toast(t('together.toast.gone'));
  }

  const sendAway = createAwayTeller({ send, hidden: () => document.hidden });

  /* ---------------------------------------------- the sign and its links */

  function showInvite() {
    if (!game.state.shared || !link.letIn) {
      hud.toast(t('together.toast.offline'));
      return;
    }
    send({ t: 'invite', ...invites.asked() });
  }

  const invites = createInviteList({
    panel: el.invitesPanel,
    online: () => link.ready,
    send,
    ask,
    read,
    write,
    me: () => friends.me,
    colorOf: friends.colorOf,
    nameOf: friends.nameOf,
    paint: friendColor,
    sign: () => sign.invite,
    dropSign: sign.close,
    show(inviteCode, until) {
      closeSheet();
      sign.show(inviteCode, until);
    }
  });

  // The main Invite button: holds up your sign, or puts it down. It is only
  // there inside a shared world: worlds are made by Watch now, so there is
  // nothing here to start — you get into one through a friend's link.
  el.invite.addEventListener('click', () => {
    if (sign.invite) sign.close();
    else showInvite();
  });

  const hudFriends = createFriendsHud({
    el,
    friends,
    shared: () => !!game.state.shared,
    at: () => game.state.player,
    tell: (text) => hud.toast(text),
    more: showPlayers
  });
  const renderFriends = hudFriends.render;

  /* ---------------------------------------------------- joining a world */

  const askTogether = (kind, world) => askToPlayTogether(ask, kind, world);

  // Back in a shared world without that question (on opening the game, or
  // Back to the shared world) by someone who joined before the policy: once,
  // a toast says playing together accepts it.
  function policyNotice() {
    if (agreedToPolicy()) return;
    agreeToPolicy();
    hud.toast(t('privacy.toast'));
  }

  // `orBack`: the shared world the game was about to go back into when the
  // link opened it, gone back to if you say no or the link doesn't work.
  async function join(roomId, inviteCode, orBack = null) {
    if (!service) return;
    // A world you've been in already takes you back as you are: no question.
    if (knownRooms().includes(roomId)) {
      if ((game.state.shared || orBack) === roomId) {
        if (!game.state.shared && !room) resume();
        hud.toast(t('together.toast.already', { world: worldName(roomId) }));
      } else switchTo(roomId, inviteCode);
      return;
    }
    if (!(await askTogether('join', worldName(roomId)))) {
      if (orBack && !game.state.shared && !room) resume();
      return;
    }
    // You stay in the shared world you're in until the new one lets you in:
    // a link that no longer works brings you back to it.
    const here = game.state.shared || orBack;
    if (game.state.shared) save(game.state, true);
    back = here && here !== roomId ? here : null;
    link.hangUp();
    room = roomId;
    code = inviteCode;
    connect();
  }

  // A friend's QR opened the game: #join=<room>.<invite>. The code is taken
  // out of the address at once so it isn't kept in history or reloaded.
  function joinFromLink(atStart = false) {
    const hash = new URLSearchParams(location.hash.slice(1));
    const raw = hash.get('join');
    if (raw === null) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const m = JOIN_RE.exec(raw);
    if (!m) {
      hud.toast(t('together.toast.badLink'));
      return false;
    }
    if (!service || Core.usesDepots(game.state)) {
      hud.toast(t('together.toast.unavailable'));
      return false;
    }
    join(m[1], m[2], atStart ? playing() : null);
    return true;
  }

  // Back into the shared world you were in when the game closed.
  function resume() {
    const last = playing();
    if (!service || !last) return;
    room = last;
    connect();
  }

  // Into another world from the Worlds screen (null: your own). Turned
  // away there, you're back in the one you were in.
  // `inviteCode`: the link that brought you, in case the room doesn't know
  // you after all (this list is only this phone's).
  function switchTo(id, inviteCode = null) {
    const here = game.state.shared || room;
    if (id === here) return;
    if (!id) return stop();
    if (!service) return;
    if (game.state.shared) save(game.state, true);
    sign.close();
    back = game.state.shared || null;
    link.hangUp();
    room = id;
    code = inviteCode;
    link.resetRetry();
    connect();
  }

  function showWorlds() {
    listWorlds(el.worldsPanel, {
      here: game.state.shared || null,
      seed: game.state.shared ? null : game.state.seed,
      solo: soloWorlds(),
      // Shared worlds can't be reached from a crystal world (yet).
      rooms: !!game.state.shared || (!!service && !Core.usesDepots(game.state)),
      service,
      close: closeSheet,
      go: (id) => switchTo(id),
      playSolo: (seed) => game.playSolo(seed),
      ask
    });
  }

  return {
    get available() {
      return !!service && !Core.usesDepots(game.state);
    },
    get active() {
      return !!game.state.shared;
    },
    // The world you're in, by name, for Settings.
    get worldName() {
      return game.state.shared ? worldName(game.state.shared) : soloName(game.state.seed);
    },
    get color() {
      return friends.myColor;
    },
    get me() {
      const me = friends.me;
      return game.state.shared && me
        ? { name: friends.nameOf(me), color: friendColor(friends.myColor) }
        : null;
    },
    get sign() {
      return sign.rise;
    },
    get signFace() {
      return sign.face;
    },
    tick,
    save,
    listWorlds: showWorlds,
    listPlayers: hudFriends.list,
    switchTo,
    resume,
    joinFromLink,
    // The game opened: through a friend's link, else back into the shared
    // world you were in, if any.
    open() {
      if (Core.usesDepots(game.state)) return;
      if (!joinFromLink(true)) resume();
    },
    showInvite,
    listInvites: () => invites.open(),
    copyLink: () => sign.copyLink(),
    away(hidden) {
      sendAway();
      if (hidden) save(game.state, true);
      else retryNow();
    },
    online: retryNow,
    // The player's own freeze-season choice (Settings). The room honours it
    // for the away time it works out; a live connection is told at once, so
    // toggling it while playing together takes effect without rejoining.
    setAwayProduce(on) {
      awayProduce = on === true;
      send({ t: 'awayProduce', a: awayProduce });
    },
    view: friends.view,
    graves: friends.graves,
    refresh() {
      renderFriends();
      sign.render();
    },
    // The screen changed size: as many chips as fit now.
    refit: hudFriends.refit
  };
}
