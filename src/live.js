// Flying together — live race rooms over Supabase Realtime.
//
// Two of Realtime's three modes, and never the database: PRESENCE keeps the
// roster (who is in the room, in which ship), BROADCAST carries position at
// 8 Hz and the few race events. Postgres-changes is the wrong shape for this
// and far too heavy.
//
// Why a hosted relay is enough here: these ships cruise at 40 km/h and cannot
// collide with each other, so the 200-300 ms this costs disappears under
// interpolation. A car sim would need something dedicated; an airship does not.
//
// Nothing in this file loads until a pilot actually joins a room — the Realtime
// client is fetched on demand, so a solo pilot never pays for it. Everything is
// behind one small interface (join/leave/send/update), so PartyKit or a
// dedicated relay could replace the transport without the game noticing.

import * as THREE from 'three';
import * as net from './net.js';
import { Airship } from './airship.js';
import { SHIPS } from './ships.js';

const REALTIME_ESM = 'https://esm.sh/@supabase/realtime-js@2.11.2';
const SEND_HZ = 8;                 // position packets per second
const RENDER_DELAY = 0.25;         // seconds behind live, so we interpolate
const STALE_AFTER = 6;             // drop a pilot who has said nothing for this long

// A presence key must identify this SEAT, not this pilot. The pilot id lives in
// localStorage and is therefore shared by every tab of the same browser — using
// it meant two tabs presented as one person, so each saw an empty room and no
// ship. This is per page, and dies with it.
function seatUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-4${h.slice(6, 8).join('').slice(1)}` +
    `-a${h.slice(8, 10).join('').slice(1)}-${h.slice(10, 16).join('')}`;
}
const SEAT = seatUuid();

let client = null, channel = null, scene = null;
let lobby = null, onLobby = null;
let joining = 0;                   // a join in flight owns the client too
let me = { key: SEAT, pilot: '', ship: 'no6', spectating: false, since: 0, trackId: '', listed: true };
let room = null;                   // { trackId, code, topic }
const remotes = new Map();         // key -> { pilot, ship, buf[], mesh, label, lastSeen }
let sendAcc = 0;
let handlers = {};

export function inRoom() { return !!channel; }
export function roomInfo() { return room; }
export function roster() {
  const out = [{ key: me.key, pilot: me.pilot, ship: me.ship, self: true,
    spectating: me.spectating, progress: myProgress }];
  for (const [key, r] of remotes) {
    // where she is NOW, as drawn — the roster shows a bearing to each rival,
    // and the interpolated position is the one the pilot can actually see
    const last = r.buf.length ? r.buf[r.buf.length - 1] : null;
    const pos = r.mesh ? r.mesh.pos : (last ? { x: last.x, y: last.y, z: last.z } : null);
    out.push({ key, pilot: r.pilot, ship: r.ship, self: false,
      spectating: !!r.spectating, progress: r.progress || null,
      pos: (pos && !r.spectating) ? { x: pos.x, y: pos.y, z: pos.z } : null });
  }
  return out;
}

// where each pilot has got to: the leader is whoever is deepest into the course
let myProgress = null;
export function setMyProgress(p) { myProgress = p; }
export function standings() {
  return roster().filter((r) => !r.spectating && r.progress)
    .sort((a, b) => (b.progress.lap - a.progress.lap)
      || (b.progress.gate - a.progress.gate)
      || (a.progress.t - b.progress.t));
}

export function newRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';      // no look-alikes
  let s = '';
  for (const b of crypto.getRandomValues(new Uint8Array(4))) s += A[b % A.length];
  return s;
}

/** The scene changes when the pilot travels; hand us the new one. */
export function attach(newScene) {
  scene = newScene;
  for (const r of remotes.values()) { r.mesh = null; }   // rebuilt on the next frame
}

async function ensureClient() {
  if (client) return client;
  const cfg = net.config();
  const { RealtimeClient } = await import(/* @vite-ignore */ REALTIME_ESM);
  client = new RealtimeClient(cfg.url.replace(/^http/, 'ws') + '/realtime/v1', {
    params: { apikey: cfg.key, eventsPerSecond: 12 },
  });
  client.connect();
  return client;
}
function maybeDisconnect() {
  if (channel || lobby || joining || !client) return;
  try { client.disconnect(); } catch { /* going anyway */ }
  client = null;
}

// ---------------------------------------------------------------- the lobby
// Open rooms announce themselves by PRESENCE on one shared channel. No table,
// no heartbeat rows, no cleanup: a room appears when its host arrives and is
// gone the moment their page closes, which is exactly the lifetime we want.
const LOBBY_TOPIC = 'airships:lobby';

export async function watchLobby(cb) {
  onLobby = cb;
  const r = await openLobby();
  if (r.ok) cb(lobbyList());
  return r;
}

let opening = null;
async function openLobby() {
  if (lobby) return { ok: true };
  if (opening) return opening;                  // two callers, one subscription
  if (!net.config()) return { ok: false, reason: 'offline' };
  opening = (async () => {
    try {
      await ensureClient();
    } catch { return { ok: false, reason: 'no-realtime' }; }
    const ch = client.channel(LOBBY_TOPIC, {
      config: { presence: { key: SEAT, enabled: true }, broadcast: { self: false } },
    });
    ch.on('presence', { event: 'sync' }, () => onLobby?.(lobbyList()));
    lobby = ch;
    await new Promise((res) => {
      ch.subscribe((st) => { if (st === 'SUBSCRIBED') advertise(); res(st); });
      setTimeout(res, 8000);
    });
    return { ok: true };
  })();
  try { return await opening; } finally { opening = null; }
}

/**
 * The menu has stopped looking. Anyone in a room keeps the channel anyway: the
 * announcement IS its presence there, and dropping it takes the room off every
 * other pilot's list the moment its own menu closes — and any of them may be
 * holding the room by then.
 */
export function stopLobby() {
  onLobby = null;
  if (room) return;
  if (!lobby) return;
  try { lobby.unsubscribe(); } catch { /* going anyway */ }
  lobby = null;
  maybeDisconnect();
}

function lobbyList() {
  if (!lobby) return [];
  // keyed by code, not by seat: when a host leaves, the pilot taking the room
  // over starts announcing before the old record has expired, and for that
  // moment one room would otherwise be listed twice
  const by = new Map();
  for (const metas of Object.values(lobby.presenceState() || {})) {
    const m = metas[metas.length - 1];
    if (!m || !m.code) continue;
    const prev = by.get(m.code);
    if (prev && prev.count >= (m.count || 1)) continue;
    by.set(m.code, { code: m.code, trackId: m.trackId, host: m.pilot,
      count: m.count || 1, mine: m.seat === SEAT });
  }
  return [...by.values()].sort((a, b) => (b.count - a.count) || a.code.localeCompare(b.code));
}

/**
 * Every room is open to anyone: as long as it exists it is on the list. The
 * pilot HOLDING it announces it — not the one who opened it — so a room that
 * outlives its founder stays listed under whoever inherits it.
 */
export function setHosting() {
  // the room is opened from the menu, which closes on the same tick and takes
  // the lobby with it — so open one rather than announce into nothing
  if (!lobby) { openLobby().then(advertise).catch(() => {}); return; }
  advertise();
}

function advertise() {
  if (!lobby) return;
  if (room && room.listed && isHost()) {
    lobby.track({ seat: SEAT, code: room.code, trackId: room.trackId,
      pilot: me.pilot, count: 1 + remotes.size }).catch(() => {});
  } else {
    lobby.untrack().catch(() => {});
  }
}

// ---------------------------------------------------------------- joining
export async function join(opts) {
  const { trackId, code } = opts;
  const listed = opts.listed !== false;      // open to all unless asked otherwise
  const cfg = net.config();
  if (!cfg) return { ok: false, reason: 'offline' };
  if (channel) leave();
  // keep the whole set: naming them one by one quietly dropped onCourse and
  // onGate, so the host's course never reached the room and splits never showed
  handlers = opts;
  me = { key: SEAT, pilot: net.pilotName() || 'Someone', ship: me.ship,
    spectating: false, since: Date.now(), trackId, listed };

  joining++;
  try {
    return await connect(trackId, code);
  } finally {
    joining--;
    maybeDisconnect();
  }
}

async function connect(trackId, code) {
  let RealtimeClient;
  try {
    ({ RealtimeClient } = await import(/* @vite-ignore */ REALTIME_ESM));
  } catch {
    return { ok: false, reason: 'no-realtime' };
  }

  await ensureClient();

  // the code IS the room. The trial is not part of the address: the host can
  // move the whole room to another course mid-session, and a pilot arriving
  // with only a code must land in the same sky either way
  const topic = `airships:room:${code}`;
  const listed = me.listed;
  room = { trackId, code, topic, listed };
  channel = client.channel(topic, {
    // presence must be asked for: realtime-js 2.11 leaves it OFF unless
    // enabled, and then reports SUBSCRIBED, tracks "ok", and silently syncs
    // nobody — which looks exactly like an empty room
    config: { presence: { key: me.key, enabled: true }, broadcast: { self: false } },
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const seen = new Set();
    for (const [key, metas] of Object.entries(state)) {
      if (key === me.key) continue;
      seen.add(key);
      const m = metas[metas.length - 1] || {};
      const r = remotes.get(key) || { buf: [], mesh: null, lastSeen: nowS() };
      r.pilot = m.pilot || 'Someone';
      r.spectating = !!m.spectating;
      r.since = m.since || 0;
      r.trackId = m.trackId || '';
      r.listed = m.listed !== false;
      if (r.spectating && r.mesh) disposeMesh(r);       // a watcher has no ship aloft
      if (r.ship !== m.ship) { disposeMesh(r); r.ship = m.ship || 'no6'; }
      remotes.set(key, r);
    }
    for (const key of [...remotes.keys()]) if (!seen.has(key)) drop(key);
    adoptHostCourse();                 // an arrival flies whatever the room flies
    handlers.onRoster?.(roster());
    advertise();                       // the lobby shows how many are aboard
  });

  channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
    const r = remotes.get(payload.k);
    if (!r) return;
    r.lastSeen = nowS();
    r.buf.push({ t: nowS(), x: payload.x, y: payload.y, z: payload.z,
      yaw: payload.a, pitch: payload.p || 0 });
    r.throttle = payload.t || 0;
    r.rudder = payload.r || 0;
    r.gas = payload.g ?? 100;
    r.wrecked = !!payload.w;
    if (r.buf.length > 24) r.buf.shift();
  });

  channel.on('broadcast', { event: 'course' }, ({ payload }) => {
    if (room) { room.trackId = payload.trackId; }
    handlers.onCourse?.(payload);
  });
  channel.on('broadcast', { event: 'gate' }, ({ payload }) => {
    const r = remotes.get(payload.k);
    if (r) r.progress = { gate: payload.g, lap: payload.l, t: payload.t };
    handlers.onGate?.(payload);
  });
  channel.on('broadcast', { event: 'go' }, ({ payload }) => {
    for (const r of remotes.values()) r.progress = null;
    myProgress = null;
    handlers.onStart?.(payload);
  });
  channel.on('broadcast', { event: 'done' }, ({ payload }) => handlers.onResult?.(payload));
  channel.on('broadcast', { event: 'said' }, ({ payload }) => handlers.onNotice?.(payload));
  // the children's games: what is being played, and what has been found
  channel.on('broadcast', { event: 'game' }, ({ payload }) => {
    game = payload.game ? { id: payload.game, round: payload.round || 1, by: payload.by } : null;
    handlers.onGame?.(payload);
  });
  channel.on('broadcast', { event: 'claim' }, ({ payload }) => handlers.onClaim?.(payload));
  channel.on('broadcast', { event: 'tag' }, ({ payload }) => {
    itSeat = payload.it || null;
    handlers.onTag?.(payload);
  });

  const status = await new Promise((resolve) => {
    let settled = false;
    const done = (s) => { if (!settled) { settled = true; resolve(s); } };
    channel.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await channel.track(myPresence());
        done('SUBSCRIBED');
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') done(s);
    });
    setTimeout(() => done('TIMED_OUT'), 9000);
  });

  if (status !== 'SUBSCRIBED') { leave(); return { ok: false, reason: status.toLowerCase() }; }
  return { ok: true, code, topic };
}

export function leave() {
  try { channel?.untrack(); channel?.unsubscribe(); } catch { /* going anyway */ }
  for (const key of [...remotes.keys()]) drop(key);
  channel = null; room = null; game = null; itSeat = null;
  advertise();                         // take the room off the list
  if (!onLobby) stopLobby();           // nobody is reading it any more either
  maybeDisconnect();
  handlers.onRoster?.([]);
}

function myPresence() {
  return { pilot: me.pilot, ship: me.ship, spectating: me.spectating,
    since: me.since, trackId: me.trackId, listed: me.listed };
}

/** Our ship class rides in the presence record, so others draw us correctly. */
export function setShip(shipId) {
  me.ship = shipId;
  if (channel) channel.track(myPresence()).catch(() => {});
}

/** Watching rather than flying: no packets go out, and nobody draws a ship. */
export function setSpectating(on) {
  me.spectating = !!on;
  if (channel) channel.track(myPresence()).catch(() => {});
}
export function spectating() { return me.spectating; }

// ---------------------------------------------------------------- talking
export function sendState(dt, ship) {
  if (!channel || me.spectating) return;      // a watcher has nothing to report
  sendAcc += dt;
  if (sendAcc < 1 / SEND_HZ) return;
  sendAcc = 0;
  channel.send({ type: 'broadcast', event: 'pos', payload: {
    k: me.key,          // the seat, matching the presence key
    x: +ship.pos.x.toFixed(1), y: +ship.pos.y.toFixed(1), z: +ship.pos.z.toFixed(1),
    a: +ship.yaw.toFixed(2), p: +ship.pitch.toFixed(2),
    // the working state a watcher can SEE: an idling ship must not appear to
    // be driving her screw flat out, and her rudder should be over when she turns
    t: +(ship.throttle || 0).toFixed(2),
    r: +(ship.rudderInput || 0).toFixed(2),
    g: Math.round(ship.gas ?? 100),
    w: ship.wrecked ? 1 : 0,
  } }).catch?.(() => {});
}

export function callStart(delay, trackId) {
  channel?.send({ type: 'broadcast', event: 'go',
    payload: { by: me.pilot, delay, trackId, grid: gridOrder().map((r) => r.key) } });
}

/** Host only: move the whole room to another trial. */
export function callCourse(trackId) {
  if (room) room.trackId = trackId;
  me.trackId = trackId;
  channel?.track(myPresence()).catch(() => {});
  channel?.send({ type: 'broadcast', event: 'course', payload: { trackId, by: me.pilot } });
  advertise();
}
export function seat() { return SEAT; }

// ---------------------------------------------------------------- the games
let game = null, itSeat = null;
export function gameNow() { return game; }
export function itNow() { return itSeat; }
export function isIt() { return !!itSeat && itSeat === SEAT; }

/** Host only: start (or stop, with null) a game for the whole room. */
export function callGame(id, round = 1) {
  game = id ? { id, round, by: me.pilot } : null;
  itSeat = null;
  channel?.send({ type: 'broadcast', event: 'game',
    payload: { game: id, round, by: me.pilot } });
  handlers.onGame?.({ game: id, round, by: me.pilot });
}

/** "I have got number three" — or, in tag, "you are it now". */
export function callClaim(what, extra = {}) {
  channel?.send({ type: 'broadcast', event: 'claim',
    payload: { k: me.key, pilot: me.pilot, what, ...extra } });
}

/**
 * Tag is settled by whoever is IT: they are the one who knows they made the
 * catch, and they are the only one allowed to say so. That makes a quarter
 * second of lag harmless — nobody else can declare themselves caught, and no
 * two pilots can pass it at once.
 */
export function passIt(toKey) {
  itSeat = toKey;
  channel?.send({ type: 'broadcast', event: 'tag',
    payload: { it: toKey, by: me.pilot, from: me.key } });
  handlers.onTag?.({ it: toKey, by: me.pilot, from: me.key });
}
export function startIt(key) { passIt(key); }

/**
 * The host's presence record says what the room is flying, and whether it is
 * on the public list. A pilot who joined on a code alone knows neither, and a
 * broadcast would only reach whoever was already listening — so read both off
 * the host, every sync, and follow. That way a private room stays private when
 * its founder leaves and someone else inherits it.
 */
function adoptHostCourse() {
  if (!room) return;
  const host = hostSeat();
  if (host === SEAT) return;                 // we ARE the host; ours is the word
  const h = remotes.get(host);
  if (!h) return;
  let changed = false, moved = null;
  if (h.trackId && h.trackId !== room.trackId) {
    room.trackId = h.trackId; me.trackId = h.trackId; changed = true; moved = h.trackId;
  }
  const listed = h.listed !== false;
  if (listed !== room.listed) { room.listed = listed; me.listed = listed; changed = true; }
  if (!changed) return;
  channel?.track(myPresence()).catch(() => {});
  if (moved) handlers.onCourse?.({ trackId: moved, by: h.pilot || 'The host' });
}

// The room is held by whoever arrived first; if they leave it passes to the
// next longest-standing pilot, so a room never loses its host.
export function hostSeat() {
  let best = { key: SEAT, since: me.since || Infinity };
  for (const [key, r] of remotes) {
    const since = r.since || Infinity;
    if (since < best.since || (since === best.since && key < best.key)) best = { key, since };
  }
  return best.key;
}
export function isHost() { return inRoom() && hostSeat() === SEAT; }

/** Everyone in the room, in one agreed order — the starting grid. */
export function gridOrder() {
  return roster().filter((r) => !r.spectating).sort((a, b) => a.key.localeCompare(b.key));
}
export function gridSlot() {
  const g = gridOrder();
  return Math.max(0, g.findIndex((r) => r.key === SEAT));
}

/**
 * TEST HOOK — place a phantom pilot in the room without a network.
 * Browsers throttle timers in hidden tabs, so two tabs cannot stream to each
 * other while one of them renders; this makes the drawing, interpolation and
 * bumping testable from a single page. Not used by the game itself.
 */
export function _debugAddRemote({ pilot = 'Phantom', ship = 'no6', x = 0, y = 60, z = 0, yaw = 0, throttle = 0, progress = null }) {
  if (!scene) return null;
  const key = 'phantom-' + Math.random().toString(36).slice(2);
  const r = { pilot, ship, buf: [], mesh: null, lastSeen: nowS(), throttle, rudder: 0, gas: 100, wrecked: false, progress };
  for (let i = 0; i < 3; i++) r.buf.push({ t: nowS() - 0.4 + i * 0.15, x, y, z, yaw, pitch: 0 });
  remotes.set(key, r);
  return key;
}

/** The remote ships as drawn — for inspection and tests. */
export function remoteShips() {
  return [...remotes.values()].filter((r) => r.mesh)
    .map((r) => ({ pilot: r.pilot, ship: r.ship, mesh: r.mesh, throttle: r.throttle }));
}

export function callGate(gate, lap, t) {
  myProgress = { gate, lap, t };
  channel?.send({ type: 'broadcast', event: 'gate',
    payload: { k: me.key, pilot: me.pilot, g: gate, l: lap, t: +t.toFixed(2) } });
}

export function callResult(t, place) {
  // the seat identifies the entry; the name is only what we print
  channel?.send({ type: 'broadcast', event: 'done', payload: { k: me.key, pilot: me.pilot, t, place } });
}
export function say(text) {
  channel?.send({ type: 'broadcast', event: 'said', payload: { pilot: me.pilot, text } });
}

// ---------------------------------------------------------------- bumping
// Air-to-air contact, resolved so that latency can never be unjust: each pilot
// pushes ONLY THEIR OWN ship away from where they see the others. No shared
// authority, nobody's machine yanked about by someone else's packets. Two
// pilots may disagree by a metre or two about where they touched, which on
// craft this size and this slow is invisible.
//
// It bumps, it never wrecks. A hull-on-hull graze at these speeds costs way
// and a little gas — being knocked out of a race by another man's lag is not
// a thing this game should do.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

// who our hull was against on the last frame — tag is decided by contact, and
// the pusher already knows exactly whom they pushed
let touched = new Set();
export function touchedNow() { return [...touched]; }

export function bump(ship, dt) {
  touched = new Set();
  if (!channel || !ship || ship.wrecked) return 0;
  const myR = ship.spec.envelope.diameter / 2, myHalf = ship.spec.envelope.length / 2;
  const myFwd = _n.set(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw)).clone();
  let worst = 0;
  for (const [rkey, r] of remotes) {
    const o = r.mesh;
    if (!o) continue;
    r.key = rkey;
    const oR = o.spec.envelope.diameter / 2, oHalf = o.spec.envelope.length / 2;
    const oFwd = new THREE.Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
    // three stations along each hull is plenty for two cigars in slow motion
    for (const u of [-0.62, 0, 0.62]) {
      _a.copy(ship.pos).addScaledVector(myFwd, myHalf * u);
      for (const v of [-0.62, 0, 0.62]) {
        _b.copy(o.pos).addScaledVector(oFwd, oHalf * v);
        const d = _a.distanceTo(_b);
        const touch = myR + oR;
        if (d >= touch || d < 0.001) continue;
        touched.add(rkey);
        const n = _a.clone().sub(_b).divideScalar(d);
        ship.pos.addScaledVector(n, (touch - d) * Math.min(1, dt * 12));
        const vn = ship.vel.dot(n);
        if (vn < 0) {
          ship.vel.addScaledVector(n, -vn * 1.25);      // shove apart, keep some way
          ship.applyImpact(myHalf * u, n, -vn * 0.5);   // and swing her round a little
          worst = Math.max(worst, -vn);
        }
      }
    }
  }
  return worst;
}

// ---------------------------------------------------------------- drawing
// Remote ships are drawn a quarter-second in the past and interpolated between
// the two packets that straddle that moment — which is what makes 8 Hz look
// smooth, and what makes the relay's latency stop mattering.
export function update(dt) {
  if (!channel || !scene) return;
  const t = nowS() - RENDER_DELAY;
  for (const [key, r] of remotes) {
    // Silence is not absence. Presence says who is in the room; going quiet
    // (sitting in the menu, or just arrived) only means there is nothing to
    // draw yet — dropping them here erased pilots from the roster mid-race.
    if (nowS() - r.lastSeen > STALE_AFTER) { if (r.mesh) disposeMesh(r); continue; }
    if (r.buf.length < 2) continue;
    if (!r.mesh) buildMesh(r);
    let a = r.buf[0], b = r.buf[r.buf.length - 1];
    for (let i = 1; i < r.buf.length; i++) {
      if (r.buf[i].t >= t) { a = r.buf[i - 1]; b = r.buf[i]; break; }
    }
    const span = b.t - a.t || 1;
    const f = Math.max(0, Math.min(1, (t - a.t) / span));
    const s = r.mesh;
    s.pos.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
    let dyaw = b.yaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    s.yaw = a.yaw + dyaw * f;
    s.pitch = a.pitch + (b.pitch - a.pitch) * f;
    // her working state, so the screw turns at HER throttle and the rudder lies
    // where she has put it — updateTransforms does the rest from these
    s.throttle = r.throttle || 0;
    s.motorOn = !!s.spec.physics.thrust && s.throttle > 0 && !r.wrecked;
    s.rudderInput = r.rudder || 0;
    s.gas = r.gas ?? 100;
    s.fullness = (s.gas / 100);
    s.wrecked = !!r.wrecked;
    s.deformEnvelope();
    s.updateTransforms(dt);
    if (r.label) {
      r.label.position.set(s.pos.x, s.pos.y + s.spec.envelope.diameter * 0.9 + 4, s.pos.z);
    }
    while (r.buf.length > 3 && r.buf[1].t < t - 1) r.buf.shift();
  }
}

function buildMesh(r) {
  const spec = SHIPS[r.ship] || SHIPS.no6;
  r.mesh = new Airship(scene, spec);
  r.mesh.reset(new THREE.Vector3(r.buf[0].x, r.buf[0].y, r.buf[0].z), r.buf[0].yaw);
  // a rival's ship, not yours: tinted so the two never read as the same machine
  // in a close finish. Solid, though — she is a real airship over there, and a
  // see-through one reads as a replay ghost rather than a pilot you can bump.
  r.mesh.group.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = o.material.clone();
      if (o.material.color) o.material.color.lerp(new THREE.Color(0x6fa8c4), 0.35);
    }
  });
  if (r.mesh.ropeLine) r.mesh.ropeLine.visible = false;   // no rope physics for a remote
  r.label = makeLabel(r.pilot);
  scene.add(r.label);
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(24,17,10,0.55)';
  x.fillRect(0, 14, 256, 36);
  x.font = 'italic 26px Georgia, serif';
  x.fillStyle = '#f2ead6';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text.slice(0, 18), 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(26, 6.5, 1);
  return sp;
}

function disposeMesh(r) {
  if (r.mesh) { r.mesh.dispose(); r.mesh = null; }
  if (r.label) { scene?.remove(r.label); r.label.material.map?.dispose(); r.label.material.dispose(); r.label = null; }
}

function drop(key) {
  const r = remotes.get(key);
  if (r) disposeMesh(r);
  remotes.delete(key);
  handlers.onRoster?.(roster());
}

function nowS() { return performance.now() / 1000; }
