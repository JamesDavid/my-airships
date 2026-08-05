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
let me = { key: SEAT, pilot: '', ship: 'no6' };
let room = null;                   // { trackId, code, topic }
const remotes = new Map();         // key -> { pilot, ship, buf[], mesh, label, lastSeen }
let sendAcc = 0;
let handlers = {};

export function inRoom() { return !!channel; }
export function roomInfo() { return room; }
export function roster() {
  const out = [{ key: me.key, pilot: me.pilot, ship: me.ship, self: true }];
  for (const [key, r] of remotes) out.push({ key, pilot: r.pilot, ship: r.ship, self: false });
  return out;
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

// ---------------------------------------------------------------- joining
export async function join({ trackId, code, onRoster, onStart, onResult, onNotice }) {
  const cfg = net.config();
  if (!cfg) return { ok: false, reason: 'offline' };
  if (channel) leave();
  handlers = { onRoster, onStart, onResult, onNotice };
  me = { key: SEAT, pilot: net.pilotName() || 'Someone', ship: me.ship };

  let RealtimeClient;
  try {
    ({ RealtimeClient } = await import(/* @vite-ignore */ REALTIME_ESM));
  } catch {
    return { ok: false, reason: 'no-realtime' };
  }

  client = new RealtimeClient(cfg.url.replace(/^http/, 'ws') + '/realtime/v1', {
    params: { apikey: cfg.key, eventsPerSecond: 12 },
  });
  client.connect();

  const topic = `airships:${trackId}:${code}`;
  room = { trackId, code, topic };
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
      if (r.ship !== m.ship) { disposeMesh(r); r.ship = m.ship || 'no6'; }
      remotes.set(key, r);
    }
    for (const key of [...remotes.keys()]) if (!seen.has(key)) drop(key);
    handlers.onRoster?.(roster());
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

  channel.on('broadcast', { event: 'go' }, ({ payload }) => handlers.onStart?.(payload));
  channel.on('broadcast', { event: 'done' }, ({ payload }) => handlers.onResult?.(payload));
  channel.on('broadcast', { event: 'said' }, ({ payload }) => handlers.onNotice?.(payload));

  const status = await new Promise((resolve) => {
    let settled = false;
    const done = (s) => { if (!settled) { settled = true; resolve(s); } };
    channel.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await channel.track({ pilot: me.pilot, ship: me.ship });
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
  try { client?.disconnect(); } catch { /* ditto */ }
  for (const key of [...remotes.keys()]) drop(key);
  channel = null; client = null; room = null;
  handlers.onRoster?.([]);
}

/** Our ship class rides in the presence record, so others draw us correctly. */
export function setShip(shipId) {
  me.ship = shipId;
  if (channel) channel.track({ pilot: me.pilot, ship: me.ship }).catch(() => {});
}

// ---------------------------------------------------------------- talking
export function sendState(dt, ship) {
  if (!channel) return;
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

export function callStart(delay) {
  channel?.send({ type: 'broadcast', event: 'go', payload: { by: me.pilot, delay } });
}
export function seat() { return SEAT; }

/** The remote ships as drawn — for inspection and tests. */
export function remoteShips() {
  return [...remotes.values()].filter((r) => r.mesh)
    .map((r) => ({ pilot: r.pilot, ship: r.ship, mesh: r.mesh, throttle: r.throttle }));
}

export function callResult(t, place) {
  // the seat identifies the entry; the name is only what we print
  channel?.send({ type: 'broadcast', event: 'done', payload: { k: me.key, pilot: me.pilot, t, place } });
}
export function say(text) {
  channel?.send({ type: 'broadcast', event: 'said', payload: { pilot: me.pilot, text } });
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
  // a rival's ship, not yours: tinted and slightly transparent so the two
  // never read as the same machine in a close finish
  r.mesh.group.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.9;
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
