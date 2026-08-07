// My Airships — prototype. Boot, input, camera, race logic, HUD, quotes, audio.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, updateClouds, underCloud, towerRadiusAt, windMats, windAt, verticalAir, mulberry32,
  skyTime, skyDaySeed } from './world.js';
import { buildWorldMonaco } from './world_monaco.js';
import { buildWorldStLouis } from './world_stlouis.js';
import { Airship } from './airship.js';
import { SHIPS, SHIP_KEYS } from './ships.js';
import { SCENARIOS, Rival } from './scenarios.js';
import * as vr from './vr.js';
import { gateOffset, TRACKS, trackSpawn, GHOST_DT, gateHeadings, encodeGhost, decodeGhost, loadCustomTracks, saveCustomTrack } from './tracks.js';
import * as net from './net.js';
import * as live from './live.js';
import { courseLength, shipTopSpeed } from './anticheat.js';
import { GAMES, gameById, pickPlaces, hiddenPlace, warmth, KID_WIND, TAG_GRACE, FOLLOW_RANGE } from './games.js';

// ---------------------------------------------------------------- the drawer
// iOS Safari in private browsing has a localStorage that THROWS on write, and
// Firefox can refuse it outright. Every read and write goes through here, so a
// pilot who cannot save a best time can still fly.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  /**
   * Stored JSON that will not parse must never stop a flight. A single corrupt
   * key used to blank the menu and, because building it was the last thing boot
   * did, stop the frame loop being reached at all — a salmon screen with the
   * instruments painted on it. It is thrown away and the default returned.
   */
  json(k, fallback) {
    const raw = this.get(k);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch {
      console.warn(`[store] ${k} would not parse — discarding it`);
      this.del(k);
      return fallback;
    }
  },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nothing to do */ } },
};

// ---------------------------------------------------------------- the fault book
// Kept from the first line, before anything else can throw: a pilot reporting
// a fault should not have to reproduce it with the console open.
const faultLog = [];
function noteFault(kind, text) {
  faultLog.push({ kind, text: String(text).slice(0, 300), at: Math.round(performance.now()) });
  if (faultLog.length > 25) faultLog.shift();
}
addEventListener('error', (e) => noteFault('error',
  `${e.message} — ${String(e.filename || '').split('/').pop()}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => noteFault('rejection', e.reason && e.reason.message || e.reason));

// ---------------------------------------------------------------- setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);
let composer = null;


const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 12000);

// ---------------------------------------------------------------- headset
// Offered only where a headset answers. See src/vr.js: the flat game is
// untouched, and this costs one feature test at boot on everything else.
vr.initVR(renderer, camera, {
  onBallast: () => { if (ship && !ship.wrecked) ship.dropBallast(); },
  onCamera: () => cycleCamera(),
  onMenu: () => toggleMenu(),
  onBug: () => fileFaultFromVR(),
  onGo: () => tryStartRace(),
  onStart: () => {
    stillWater(true);
    swapCityForVR(true);
    // stand in the basket, whatever view you were in, and put the slate up
    if (camMode !== 1) cycleCameraTo(1);
    if (ship) ship.showPanel(true);
    document.body.classList.add('in-vr');
    // the game opens ON the menu, so a pilot who puts the headset on at the
    // start screen must find the board already up rather than a frozen world
    if (menuOpen) buildMenuButtons();
  },
  onEnd: () => {
    vr.uncull();
    swapCityForVR(false);
    stillWater(false);
    vr.showMenu(false);
    if (ship) ship.showPanel(false);
    document.body.classList.remove('in-vr');
    fitToWindow.w = -1; fitToWindow();      // take the flat screen back
  },
});


const LOCS = ['paris', 'monaco', 'stlouis'];
let scene, world, ship = null, startRing, gateRings = [], scenRing = null;
let rivals = [], scenario = null, scenBeacon = null, scenZone = null;
let routeRings = [];
let track = null;                       // the active course (historic or time trial)
let ghostBest = null, ghostMesh = null, ghostRec = [], ghostLastSample = -1;
let chaseGhost = null;                  // a downloaded record, pinned to its course
let editing = null;                     // track-editor state
let splitUntil = 0;
let currentLocation = 'paris', currentShip = 'no6';
const wind = new THREE.Vector3(3.4, 0, 0.7);
const dailyWind = new THREE.Vector3(3.4, 0, 0.7);
// …and today's, kept aside. `dailyWind` is what the gusts are built on and a
// historical scenario may replace it for the afternoon it reconstructs, so the
// real one has to survive somewhere to be put back.
const todaysWind = new THREE.Vector3(3.4, 0, 0.7);
let windGustT = 0;      // seconds since midnight UTC — see skyTime()

// The button said SAND for every ship in the fleet, and only five of them
// threw sand. From the No. 5 on it is a spigot on a brass water cylinder —
// Ch. XI, "the first time in aeronautics, I used liquid ballast" — so the
// button says WATER and the messages talk about the spigot. See src/ships.js.
function ballastWord() {
  return (ship && ship.spec.ballast === 'water') ? 'WATER' : 'SAND';
}

function labelBallast() {
  const b = document.getElementById('btnSand');
  if (b) b.textContent = ballastWord();
  touchHelp();
}

/**
 * @param where  null to start from the shed, or a place aloft to take her over
 *               at — a free-flying pilot changing ships does not fall out of
 *               the sky while the new one is fetched.
 */
function spawnShip(specId, where = null) {
  currentShip = specId;
  if (track) seedRace(track.id, specId);   // the caprice is keyed to the class too
  live.setShip(specId);
  if (ship) ship.dispose();
  ship = new Airship(scene, SHIPS[specId]);
  if (where) {
    ship.reset(new THREE.Vector3(where.x, Math.max(where.y, restAt(where.x, where.z)), where.z), where.yaw);
    ship.landed = false;
  } else {
    ship.reset(new THREE.Vector3(world.padPos.x, restAt(world.padPos.x, world.padPos.z), world.padPos.z), 0);
  }
  ship.eyeNear = measureEyeNear(ship);
  setCenter('', '');   // clear any wreck notice from the previous ship
  labelBallast();
  // the new ship's slate: showPanel was only called when the session started,
  // so changing ship inside a headset left you with no readings at all
  ship.showPanel(vr.inVR());
  document.getElementById('helpTitle').textContent = `My Airships — ${ship.spec.name}`;
  addMsg('ship', `${ship.spec.name} — ${ship.spec.sub}`, 0);
}

/**
 * Stop the streets fighting the ground they are painted on.
 *
 * The roads, plazas and water sit five to nine centimetres above a ground plane
 * nine kilometres across. That is far too fine a distinction for the depth
 * buffer at any distance: aboard the ship, where the near plane is 0.1 m, the
 * buffer can only resolve 0.18 m at the range of the Grand Palais from the
 * Tower — and on a telephone with a 16-bit buffer, 46 m. So the two surfaces
 * flicker against each other across the whole city.
 *
 * Moving them further apart would make the roads visibly hover when you fly low
 * over them, and adding vertices does nothing at all: this is depth precision,
 * not tessellation. The right tool is polygon offset, which biases the depth
 * written for a surface without moving the surface. Each decal is nudged by its
 * height order, so they keep their own layering as well.
 */
function settleGroundDecals(root) {
  const flats = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.isInstancedMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!isFinite(b.min.y)) return;
    if (b.max.y - b.min.y > 1.5) return;              // not a flat thing
    if (b.max.y <= 0.005 || b.max.y > 1.2) return;    // the ground itself, or a building
    if ((b.max.x - b.min.x) * (b.max.z - b.min.z) < 100) return;
    flats.push({ o, y: b.max.y });
  });
  flats.sort((a, b) => a.y - b.y);
  flats.forEach(({ o }, i) => {
    // the material may be shared with something that is NOT a decal
    o.material = o.material.clone();
    o.material.polygonOffset = true;
    // FACTOR is multiplied by the polygon's depth slope, so at a grazing angle
    // — a road seen nearly edge-on from a low camera — a large one throws the
    // surface a very long way forward. Ranking it up to -87 pushed the streets
    // clean in front of the buildings standing on them, which was reported as
    // the houses having a reflection in the ground. It stays at -1 for
    // everything; the RANK goes into units, which are counted in the smallest
    // resolvable depth step and stay tiny however many decals there are.
    o.material.polygonOffsetFactor = -1;
    o.material.polygonOffsetUnits = -(2 + i);
    o.material.needsUpdate = true;
  });
  return flats.length;
}

/**
 * How near the near plane may be, aboard THIS ship.
 *
 * Depth precision is inversely proportional to the near plane, and 0.1 m is far
 * tighter than most of the fleet needs: in the No. 6 the closest thing to the
 * pilot's eye is a dial face at 0.44 m. The No. 4 is the exception — she is
 * flown from a bicycle saddle with the frame 0.08 m away — so it cannot simply
 * be raised for everyone. Measured per ship, most of the fleet gets a near
 * plane two and a half times further out, and that much more depth precision
 * across the whole city.
 */
function measureEyeNear(s) {
  try {
    s.group.updateMatrixWorld(true);
    // eyePoint is an Object3D carried on the ship, not a bare vector: ask it
    // where it is. Treating it as a Vector3 gives NaN distances and every ship
    // silently falls back to the old near plane, which is what happened first.
    const eye = new THREE.Vector3();
    if (s.eyePoint && s.eyePoint.getWorldPosition) s.eyePoint.getWorldPosition(eye);
    else eye.copy(s.pos);
    const v = new THREE.Vector3();
    let near = Infinity;
    s.group.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 200));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const d = v.distanceTo(eye);
        if (d === d) near = Math.min(near, d);        // NaN is not a distance
      }
    });
    if (!isFinite(near)) return 0.1;
    return Math.max(0.05, Math.min(0.3, near * 0.6));
  } catch { return 0.1; }
}

/**
 * A ring. With `arrows`, one that says which way through it.
 *
 * The torus's axis is its local +Z, and buildRings turns that to the heading a
 * pilot is meant to cross on — so +Z is the way you go and -Z is the side you
 * come from. A bare hoop looks identical from both, and on a course that
 * doubles back past itself there is no way to tell whether the gate ahead is
 * the one you want or the one you have already taken from behind.
 *
 * Two cues, and they answer different questions:
 *
 *   three barbs on the rim, pointing the way through. Approach it right and
 *   they point away from you; approach it backwards and they are aimed at your
 *   face. They share the hoop's material, so they go gold with it when it is
 *   the gate in hand.
 *
 *   a wide, faint funnel ring standing off the ENTRY side only. From in front
 *   the gate reads as a mouth to fly into. From behind there is nothing.
 */
function makeRing(color, arrows, box) {
  if (box) return makeGateFrame(color, arrows, box);
  const m = new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 10, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, fog: true }));
  m.rotation.y = Math.PI / 2;
  if (arrows) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      const barb = new THREE.Mesh(new THREE.ConeGeometry(3.1, 9.5, 7), m.material);
      barb.position.set(Math.cos(a) * 24, Math.sin(a) * 24, 5.5);
      barb.rotation.x = Math.PI / 2;                 // the cone's +Y onto +Z
      m.add(barb);
    }
    // GREEN on the way in, RED on the way out — a flat collar either side of
    // the hoop, each rendered SINGLE-SIDED and facing outward, so a face is
    // invisible from behind itself. Come at the gate the right way and you see
    // green and no red; come at it backwards and you see red and no green.
    // There is never a moment where both show and you have to work out which.
    const collar = (color, z, flip) => {
      const c = new THREE.Mesh(new THREE.RingGeometry(21.5, 26.5, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55,
          side: THREE.FrontSide, fog: true, depthWrite: false }));
      c.position.z = z;
      if (flip) c.rotation.y = Math.PI;               // turn its face about
      m.add(c);
    };
    collar(0x5fbf6a, -2.2, true);                     // entry: facing the pilot
    collar(0xc4544a, 2.2, false);                     // exit: facing away
  }
  scene.add(m);
  return m;
}

/**
 * A gate you round a MAST through, rather than a hoop you thread.
 *
 * A 24 m ring is the right size for a turn buoy in open air. It is the wrong
 * size for a pylon, and it is absurd for the Eiffel Tower: a hoop two ship
 * lengths across, hung beside a three-hundred-metre iron tower, tells the pilot
 * nothing about where the tower is. So the gates that stand off a mast are cut
 * to the mast instead — as tall as the thing being rounded, half that wide, and
 * lifted a quarter of its height clear of the ground so the frame reads against
 * the mast's whole length and not against the crowd at its feet.
 *
 * Built in the local XY plane with its normal down +Z, exactly like the torus,
 * so the heading, the pass test and the entry/exit colours are unchanged — only
 * the shape and the extent are different. The pass test reads `gw`/`gh` off the
 * gate and tests the rectangle; see the gate crossing in tick().
 */
function makeGateFrame(color, arrows, box) {
  const m = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, fog: true });
  // a Group has no .material, and the active gate is recoloured every frame —
  // hand out the frame's own material so gateTint() has something to set.
  m.userData.frameMat = mat;
  const hw = box.w / 2, hh = box.h / 2;
  const t = Math.max(1.4, Math.min(box.w, box.h) * 0.028);   // bar thickness
  const bar = (w, h, x, y) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat);
    b.position.set(x, y, 0);
    m.add(b);
  };
  bar(box.w + t, t, 0, hh); bar(box.w + t, t, 0, -hh);        // head and sill
  bar(t, box.h, hw, 0); bar(t, box.h, -hw, 0);                // jambs
  if (arrows) {
    // barbs at the middle of each side, pointing the way through
    for (const [bx, by] of [[0, hh], [0, -hh], [hw, 0], [-hw, 0]]) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(t * 2.2, t * 6.8, 7), mat);
      barb.position.set(bx, by, t * 3.9);
      barb.rotation.x = Math.PI / 2;
      m.add(barb);
    }
    // the same green-in / red-out collars as the hoop, cut square. Each is
    // single-sided and faces outward, so only one of them is ever visible.
    const collar = (col, z, flip) => {
      const ow = hw + t * 3.4, oh = hh + t * 3.4;
      const sh = new THREE.Shape();
      sh.moveTo(-ow, -oh); sh.lineTo(ow, -oh); sh.lineTo(ow, oh); sh.lineTo(-ow, oh);
      sh.closePath();
      const hole = new THREE.Path();                          // wound the other way
      hole.moveTo(-hw, -hh); hole.lineTo(-hw, hh); hole.lineTo(hw, hh); hole.lineTo(hw, -hh);
      hole.closePath();
      sh.holes.push(hole);
      const c = new THREE.Mesh(new THREE.ShapeGeometry(sh),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55,
          side: THREE.FrontSide, fog: true, depthWrite: false }));
      c.position.z = z;
      if (flip) c.rotation.y = Math.PI;
      m.add(c);
    };
    collar(0x5fbf6a, -t * 1.6, true);                         // entry: green
    collar(0xc4544a, t * 1.6, false);                         // exit: red
  }
  scene.add(m);
  return m;
}

// recolour a gate whichever shape it is — a hoop is one mesh, a frame is a
// group whose bars share one material (the entry/exit collars keep their own)
function gateTint(r, color) { (r.userData.frameMat || r.material).color.set(color); }

function clearRivals() { rivals.forEach((r) => r.dispose()); rivals = []; }

// the waypoint hoops of a scenario's route
function clearRoute() { for (const r of routeRings) scene.remove(r); routeRings = []; }
function updateRoute() {
  for (let i = routeRings.length - 1; i >= 0; i--) {
    const r = routeRings[i];
    if (ship.pos.distanceTo(r.position) < 45) {     // passed: take it away
      scene.remove(r); routeRings.splice(i, 1); blip(760);
    }
  }
}

// ---------------------------------------------------------------- tracks
function historicTrack() {
  return {
    id: 'historic_' + currentLocation,
    name: world.name, location: currentLocation,
    // St. Louis is three laps of the triangle, as he proposed it
    laps: world.raceLaps || 1, historic: true,
    // gw/gh, when a world sets them, make the gate a rectangle cut to the mast
    // it stands off (see makeGateFrame) instead of a 24 m hoop
    gates: (world.gates || []).map((g) => ({
      x: g.x, y: g.y, z: g.z, r: 24,
      ...(g.gw ? { gw: g.gw, gh: g.gh } : {}),
    })),
  };
}

function buildRings(gates, originPos) {
  for (const r of gateRings) scene.remove(r);
  // headings come from tracks.js so the ring you see, the pass test, and the
  // server-side run validator all use one definition of "through the gate"
  const headings = gateHeadings(gates, originPos);
  gateRings = gates.map((g, i) => {
    const r = makeRing(0x8a8a8a, true, g.gw ? { w: g.gw, h: g.gh } : null);
    r.position.set(g.x, g.y, g.z);
    r.rotation.y = headings[i];
    // a rectangle is already cut to size; only the hoop scales off its radius
    r.userData.s0 = g.gw ? 1 : (g.r || 24) / 24;
    r.scale.setScalar(r.userData.s0);
    r.userData.r = g.r || 24;
    return r;
  });
}

// a re-cut circuit is a different course: its version retires the old times
// THE LOCAL BESTS CARRY AN ERA, and this is what retires them.
//
// A time is only comparable to another flown over the same ground in the same
// ship. `t.v` already covered the ground — recut a course and its board starts
// clean. This covers the FLEET: when what the ships can do changes, every time
// ever set was set by a different aeroplane.
//
// Era 2: the 10% drag trim of August 2026, which brought the No. 5 down to the
// 30-35 km/h Maurice Farman measured (see src/ships.js). Every record on every
// board was set by ships six to eleven per cent too fast.
//
// LOCAL KEYS ONLY. The world boards are keyed on the bare track id, and both
// the anticheat and the submit-time Edge Function look the course up by that
// id — an era-tagged id comes back `unknown-track` and no time can be filed at
// all. So the world boards are reset at the source instead, by clearing
// public.times; see docs/ONLINE.md.
const BOARD_ERA = 2;

function bestKey(t) {
  return `tt_${t.id}${t.v ? '_v' + t.v : ''}_e${BOARD_ERA}_${currentShip}`;
}

function loadBest(t) {
  // a ghost fetched from the record office keeps flying this course until you
  // leave it — restarts (R) go on chasing the record-holder, not yourself
  if (chaseGhost && chaseGhost.trackId === t.id) {
    ghostBest = chaseGhost.ghost;
    updateGhostMesh();
    return;
  }
  chaseGhost = null;
  try { ghostBest = store.json(bestKey(t), null); }
  catch { ghostBest = null; }
  updateGhostMesh();
}

function updateGhostMesh() {
  if (ghostMesh) { scene.remove(ghostMesh); ghostMesh = null; }
  if (!ghostBest) return;
  // a downloaded ghost flies at the size of the ship that actually set it
  const E = (SHIPS[ghostBest.ship] || ship.spec).envelope;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xd9b24a, transparent: true, opacity: 0.32, depthWrite: false }));
  m.scale.set(E.length / 2, E.diameter / 2, E.diameter / 2);
  ghostMesh = new THREE.Group();
  ghostMesh.add(m);
  ghostMesh.visible = false;
  scene.add(ghostMesh);
}

// start any course: the historic trial or a lap circuit (instant restart)
/**
 * A circuit's gates, lifted onto the ground.
 *
 * Every gate height in tracks.js — 13 m under the Arc, 16 down the
 * Champs-Elysees, 50 over the Trocadero — was written when the ground was a
 * plane at zero, and means "so far up in the air". Paris has hills now: the
 * Etoile stands twenty-five metres over the Tower's feet and the Chaillot bluff
 * twenty-six, so read as absolute heights those gates would be half buried in
 * their own hillsides.
 *
 * Lifted HERE, at the one place a track becomes the active one, so the ring you
 * see, the pass test and the run validator go on using a single definition of
 * "through the gate" — and lifted into a COPY, so loading a track twice cannot
 * raise it twice.
 */
function groundGates(t) {
  if (!world || !world.groundAt) return t;
  return { ...t, gates: t.gates.map((g) => ({ ...g, y: g.y + world.groundAt(g.x, g.z) })) };
}

function startTrack(t0) {
  const t = groundGates(t0);
  dailyWind.copy(todaysWind);    // …and not a scenario's borrowed weather
  wind.copy(dailyWind);
  flightBegin('trial', t.id);
  track = t;
  scenario = null;
  editing = null;
  seedRace(t.id, currentShip);     // the same motor trouble for everyone, today
  clearRivals();
  buildRings(t.gates, t.historic ? world.startRing : null);
  startRing.visible = !!t.historic;
  race.state = 'count';
  race.count = t.historic ? 3.5 : 1.8;
  race.gate = 0; race.lap = 1; race.t = 0; race.splits = [];
  race.winding = 0; race._az = null;      // how far round the Tower she has swept
  race.lastResult = null; race._gateS = undefined;
  ghostRec = []; ghostLastSample = -1;
  loadBest(t);
  if (!t.historic) {
    const sp = trackSpawn(t);
    ship.reset(new THREE.Vector3(sp.x, sp.y, sp.z), sp.yaw);
    ship.landed = false;
    const wr = worldRecord(t.id, currentShip);
    let sub = ghostBest ? `${t.laps} laps — your ghost flies at ${fmt(ghostBest.t)}` : `${t.laps} laps — set the first time`;
    if (wr) sub += ` · the world record is ${fmt(wr.t)}, held by ${wr.pilot}`;
    else if (net.enabled() && wr === null) sub += ' · no one holds this course yet';
    setCenter(t.name, sub);
    fetchRecord(t.id, currentShip);
  }
}

function endTrack() {
  track = null;
  // The gates are rebuilt so a fresh call has them ready, and left HIDDEN —
  // updateRace draws them only while a course is being flown. Setting them
  // visible here is what put the Deutsch turn ring beside the Tower, and the
  // start ring over the aerodrome, for pilots who were only out flying.
  buildRings(historicTrack().gates, world.startRing);
  startRing.visible = false;
  if (ghostMesh) ghostMesh.visible = false;
  race.state = 'idle'; race.t = 0; race.gate = 0;
}

// Give the graphics card back everything the old city was holding. Without
// this, each journey between the three worlds left its geometry and textures
// resident for the life of the tab — a slow climb that ends in a crash on a
// tablet. (Shared, module-cached resources are simply re-uploaded on demand.)
function disposeWorld(oldScene, oldComposer) {
  const seenRes = new Set();
  const kill = (r) => { if (r && !seenRes.has(r)) { seenRes.add(r); r.dispose?.(); } };
  if (oldComposer) {
    // the composer only frees its own two buffers — the bloom pass is holding
    // a dozen more of its own, and they go with it
    for (const p of oldComposer.passes || []) kill(p);
    kill(oldComposer);
  }
  if (!oldScene) { return; }
  oldScene.traverse((o) => {
    // every world lights its own sun, and each sun holds a 2048² shadow map
    if (o.isLight && o.shadow) { kill(o.shadow.map); kill(o.shadow.mapPass); o.shadow.map = null; }
    kill(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) kill(m[k]);
      // the sky and the water carry their textures in shader uniforms, where
      // a plain property sweep never finds them
      for (const u of Object.values(m.uniforms || {})) if (u && u.value && u.value.isTexture) kill(u.value);
      kill(m);
    }
  });
  oldScene.clear();
}

function loadWorld(loc) {
  const oldScene = scene, oldComposer = composer;
  currentLocation = loc;
  clearRivals();
  scenario = null;
  scene = new THREE.Scene();
  vr.attachTo(scene);
  vr.resetCull();          // sizes are measured per world
  world = loc === 'paris' ? buildWorld(scene)
    : loc === 'monaco' ? buildWorldMonaco(scene)
    : buildWorldStLouis(scene);
  if (vr.inVR()) { stillWater(true); swapCityForVR(true); }   // and for a world arrived at IN a headset
  startRing = makeRing(0xd9b24a); startRing.position.copy(world.startRing);
  track = null;
  buildRings(historicTrack().gates, world.startRing);
  scenRing = makeRing(0x4a9c5f);
  scenRing.rotation.set(Math.PI / 2, 0, 0); // flat ground marker
  scenRing.visible = false;
  // …and a shaft of light standing in it, so the objective can be found from
  // the other side of Paris rather than only when you are on top of it
  scenBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(24, 24, 150, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fc48a, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false, fog: true }));
  scenBeacon.visible = false;
  scene.add(scenBeacon);
  // the daily wind: seeded by the UTC date, so everyone flies the same sky today
  // — a LOCAL date put a pilot in Paris and a pilot in St. Louis under different
  // weather on the same afternoon, which a shared leaderboard cannot afford
  const dr = mulberry32(skyDaySeed());
  const rot = (dr() - 0.5) * 0.9, mag = 0.85 + dr() * 0.4;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  dailyWind.set((world.windBase.x * rc + world.windBase.z * rs) * mag, 0,
    (-world.windBase.x * rs + world.windBase.z * rc) * mag);
  todaysWind.copy(dailyWind);
  wind.copy(dailyWind);
  race.state = 'idle'; race.t = 0; race.gate = 0;
  // each course keeps its own record: the Deutsch half-hour and the St. Louis
  // ten minutes are not the same achievement
  race.best = +(store.get(bestRaceKey()) || 0);
  setCenter('', '');
  spawnShip(currentShip);
  camPos.set(world.padPos.x - 90, 45, world.padPos.z + 90);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.7, 0.86));
  composer.addPass(new OutputPass());
  disposeWorld(oldScene, oldComposer);
  settleGroundDecals(scene);   // roads and plazas must not fight the ground
  live.attach(scene);
  addMsg('loc', world.name, 0);
}

// ---------------------------------------------------------------- input
const input = { throttle: 0, rudder: 0, pitch: 0, vent: false, coax: false };
const keys = {};
let camMode = 0, muted = false;

addEventListener('keydown', (e) => {
  initAudio();
  if (e.code === 'Escape') {
    if (albumOpen()) closeAlbum();
    else if (bugBookOpen()) closeBugBook(); else if (boardOpen()) closeBoard(); else toggleMenu();
    return;
  }
  // while a panel is up the simulation is paused: don't fly the ship behind it
  if (menuOpen || boardOpen() || bugBookOpen() || albumOpen()) return;
  keys[e.code] = true;
  if (e.code === 'Space') { ship.dropBallast(); e.preventDefault(); }
  if (e.code === 'KeyF') input.coax = true;
  if (e.code === 'Enter') tryStartRace();
  if (e.code === 'KeyR') {
    if (scenario) startScenario(scenario);
    else if (track && !track.historic) startTrack(track);   // instant restart
    else resetShip();
  }
  if (e.code === 'KeyG' && editing && race.state === 'idle') {
    editing.gates.push({ x: +ship.pos.x.toFixed(0), y: +ship.pos.y.toFixed(0), z: +ship.pos.z.toFixed(0), r: 16 });
    buildRings(editing.gates);
    addMsg('edg', `Gate ${editing.gates.length} dropped. (U undoes · Esc menu to save)`, 0);
  }
  if (e.code === 'KeyU' && editing && editing.gates.length) {
    editing.gates.pop();
    buildRings(editing.gates);
    addMsg('edu', `Gate removed — ${editing.gates.length} left.`, 0);
  }
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyX' && spectate.on) watchNext();
  if (e.code === 'KeyP') document.body.classList.toggle('photo');
  if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
  if (e.code === 'KeyM') { muted = !muted; drawSoundBtn(); }
  if (SHIP_KEYS[e.code]) tryChangeShip(SHIP_KEYS[e.code]);
  if (e.code === 'KeyL') tryTravel(LOCS[(LOCS.indexOf(currentLocation) + 1) % LOCS.length]);
});

// A wrecked ship is on the ground for good: she can be left for another, and
// doing so clears away the trial she died in. (Before this, a wreck in mid-air
// left `landed` false and the fleet was locked behind an impossible order.)
function canLeaveShip() {
  return (ship.landed || ship.wrecked) && (race.state === 'idle' || ship.wrecked);
}
/**
 * Ships may be swapped in mid-air, but only in free flight: a scenario is a
 * particular ship on a particular day, and a trial is a class of machine
 * against the clock. Neither survives changing horses halfway.
 */
function canChangeShip() {
  if (ship.wrecked) return true;
  return !scenario && race.state === 'idle';
}
function clearAfterWreck() {
  if (!ship.wrecked) return;
  endTrack(); clearRivals(); scenario = null; editing = null;
  // …and today's sky back. A scenario may have set its own weather for the
  // afternoon it reconstructs (VII does, 16 km/h from the aerodrome), and
  // crashing out of it used to leave that wind blowing over free flight and
  // over every race started from there: "16km/h wind again".
  dailyWind.copy(todaysWind);
  wind.copy(dailyWind);
  if (scenRing) scenRing.visible = false;
  if (scenBeacon) scenBeacon.visible = false;
  // ...and take the wreck notice down with it. resetShip() cleared the centre
  // and this did not, so a pilot who wrecked and then changed ship or travelled
  // carried "Dashed against the Tower!" into the next flight and the next
  // world: "message persisted after I reset the ship to a new location" (#56).
  setCenter('', '');
  seen.clear();
}
function tryChangeShip(id) {
  if (!canChangeShip()) {
    addMsg('noswitch', scenario
      ? 'Not in the middle of a flight of the memoir — finish it, or reset the ship.'
      : 'Finish the trial before changing ships.', 6);
    return false;
  }
  const aloft = !ship.landed && !ship.wrecked;
  const where = aloft ? { x: ship.pos.x, y: ship.pos.y, z: ship.pos.z, yaw: ship.yaw } : null;
  clearAfterWreck();
  spawnShip(id, where);
  if (aloft) addMsg('swap', 'She is taken over where she flew — trim her before you let go.', 5);
  return true;
}
function tryTravel(loc) {
  if (loc === currentLocation) return false;
  if (!canLeaveShip()) {
    addMsg('noloc', 'Land (and finish the trial) before travelling — the air-ship goes by railway waggon.', 6);
    return false;
  }
  clearAfterWreck();
  loadWorld(loc);
  return true;
}
addEventListener('keyup', (e) => { keys[e.code] = false; });

// drag orbit (mouse or touch) on the canvas only
let dragging = false, orbitYaw = 0, orbitPitch = 0, lastPX = 0, lastPY = 0;
const cvs = renderer.domElement;
cvs.style.touchAction = 'none';
cvs.addEventListener('pointerdown', (e) => {
  dragging = true; lastPX = e.clientX; lastPY = e.clientY;
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointerup', () => dragging = false);
cvs.addEventListener('pointercancel', () => dragging = false);
cvs.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw -= (e.clientX - lastPX) * 0.005;
  orbitPitch = Math.max(-0.5, Math.min(0.9, orbitPitch + (e.clientY - lastPY) * 0.004));
  lastPX = e.clientX; lastPY = e.clientY;
});

// ---------------------------------------------------------------- touch controls
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  || location.search.includes('touch');
if (isTouch) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); // spare the phone GPU
  document.getElementById('menuQuote').textContent = 'The simulation is paused — tap ☰ or Resume to fly.';
  // no accidental page zoom while flying
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  // tapping the controls panel dismisses it; explain the touch scheme there
  document.getElementById('help').addEventListener('pointerdown', () => {
    document.getElementById('help').classList.add('hidden');
  });
  touchHelp(true);
}

// Rebuilt whenever the ship changes, because the ballast button is not always
// called the same thing: the first five ships throw sand and the rest open a
// spigot on a water cylinder.
// `install` on the one call that puts the touch scheme up; afterwards it only
// REFRESHES text that is already there. That way it needs no reference to
// `isTouch`, which is declared further down this file than spawnShip's first
// call — reading it from here would be a temporal dead zone and would take the
// whole game down at boot.
function touchHelp(install) {
  const q = document.querySelector('#help .quote');
  if (!q) return;
  if (!install && !/^On touch:/.test(q.textContent || '')) return;
  q.textContent =
    'On touch: the CARB lever is the throttle — set it and it stays, like the brass lever aboard. '
    + 'The HELM slider steers and stays where you lash it; '
    + 'the TRIM slider is the shifting weights and holds too — center either to run straight '
    + `and level. ${ballastWord()} drops ballast, VENT descends, FIX coaxes the motor, `
    + 'GO starts the trial. Drag the sky to look around. Tap this panel to close it.';
}

// the on-screen controls work anywhere — touch devices get them by default,
// and PC pilots can switch them on from the menu
function setTouchUI(on) {
  document.body.classList.toggle('touch', on);
  if (on) wireTouchControls();
  else { touchPitch = 0; touchHelm = 0; throttleLever = false; }   // give the keys back the motor
  store.set('myairships_touchui', on ? '1' : '0');
}

// capturing the pointer is a convenience, never a precondition: if the
// browser refuses the id, the control must still answer the touch
function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } }

function wireTouchControls() {
  if (wireTouchControls._done) return;
  wireTouchControls._done = true;
  for (const b of document.querySelectorAll('#touchUI .tbtn')) {
    const code = b.dataset.key;
    if (!code) continue;               // the fault book is a click, not a key
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      b.classList.add('on');
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    };
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('on');
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }
  // the pitch TRIM slider: drag or tap; it stays where you leave it,
  // exactly like the shifting weights it commands
  const trk = document.getElementById('pitchTrack');
  const thumb = document.getElementById('pitchThumb');
  const setTrim = (e) => {
    e.preventDefault();
    initAudio();
    const rect = trk.getBoundingClientRect();
    const half = rect.height / 2 - 22;
    // reversed sense: haul the thumb DOWN to bring the nose up (weights aft)
    let v = (e.clientY - (rect.top + rect.height / 2)) / half;
    v = Math.max(-1, Math.min(1, v));
    if (Math.abs(v) < 0.08) v = 0;   // gentle center detent
    touchPitch = v;
    thumb.style.top = `calc(50% - 19px + ${v * half}px)`;   // thumb tracks the pointer
  };
  trk.addEventListener('pointerdown', (e) => { capture(trk, e); setTrim(e); });
  trk.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure > 0) setTrim(e); });
  // the helm: horizontal, and it stays where you lash it (drag left = port)
  const hTrk = document.getElementById('helmTrack');
  const hThumb = document.getElementById('helmThumb');
  const setHelm = (e) => {
    e.preventDefault();
    initAudio();
    const rect = hTrk.getBoundingClientRect();
    const half = rect.width / 2 - 22;
    let v = (rect.left + rect.width / 2 - e.clientX) / half;
    v = Math.max(-1, Math.min(1, v));
    if (Math.abs(v) < 0.08) v = 0;   // gentle center detent
    touchHelm = v;
    hThumb.style.left = `calc(50% - 19px - ${v * half}px)`;
  };
  hTrk.addEventListener('pointerdown', (e) => { capture(hTrk, e); setHelm(e); });
  hTrk.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure > 0) setHelm(e); });
  // the carburating lever: an absolute setting, bottom stopped to top full —
  // the motor then chases it, exactly as the brass lever aboard commands it
  const tTrk = document.getElementById('thrTrack');
  const setThr = (e) => {
    e.preventDefault();
    initAudio();
    const rect = tTrk.getBoundingClientRect();
    const span = rect.height - 46;
    let v = 1 - (e.clientY - (rect.top + 23)) / span;
    touchThrottle = Math.max(0, Math.min(1, v));
    throttleLever = true;
  };
  tTrk.addEventListener('pointerdown', (e) => { capture(tTrk, e); setThr(e); });
  tTrk.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure > 0) setThr(e); });
}

// the lever's thumb always shows what the motor is ACTUALLY doing, so the
// keyboard (W/S) and the lever can never disagree
function drawThrottleLever() {
  const trk = document.getElementById('thrTrack');
  if (!trk || !ship) return;
  const thumb = document.getElementById('thrThumb');
  const fill = document.getElementById('thrFill');
  const h = trk.clientHeight || 150;
  const span = h - 46;
  thumb.style.bottom = `${4 + ship.throttle * span}px`;
  fill.style.height = `${6 + ship.throttle * span}px`;
}

// on-screen controls default ON everywhere; the menu toggle remembers "off"
const touchPref = store.get('myairships_touchui');
if (touchPref !== '0') setTouchUI(true);

let touchPitch = 0;      // trim sliders: they hold their setting, like real weights
let touchHelm = 0;       // and a lashed helm
let touchThrottle = 0;   // and the carburating lever stays where it is set
let throttleLever = false;
function pollInput() {
  const kbT = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
  if (kbT !== 0) {
    input.throttle = kbT;
    touchThrottle = ship.throttle;   // the lever follows the keys
  } else if (throttleLever) {
    // drive the motor toward the lever's setting
    input.throttle = Math.max(-1, Math.min(1, (touchThrottle - ship.throttle) * 8));
  } else {
    input.throttle = 0;
  }
  const kbR = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? -1 : 0);
  input.rudder = kbR !== 0 ? kbR : touchHelm;
  const kb = (keys['KeyE'] ? 1 : 0) + (keys['KeyQ'] ? -1 : 0);
  input.pitch = kb !== 0 ? kb : touchPitch;
  input.vent = !!keys['KeyV'];

  // ...and the two Touch controllers, which take precedence while a hand is
  // actually doing something. The sticks are absolute positions, so the lever
  // is driven toward them exactly as the touch UI's lever is.
  const g = vr.pollVR(ship);
  if (g) {
    // a hand ON the carburating lever sets it outright — that is what a lever
    // is — while the stick only nudges it, the way the touch slider does
    if (g.throttleSet !== null) { touchThrottle = g.throttleSet; throttleLever = true; }
    else if (g.throttle !== 0) {
      touchThrottle = Math.max(0, Math.min(1, touchThrottle + g.throttle * 0.9 * (1 / 60)));
      throttleLever = true;
    }
    if (throttleLever) {
      input.throttle = Math.max(-1, Math.min(1, (touchThrottle - ship.throttle) * 8));
    }
    if (g.rudder !== 0) input.rudder = g.rudder;
    if (g.pitch !== 0) input.pitch = g.pitch;
    if (g.vent) input.vent = true;
    if (g.coax) input.coax = true;
  }
}

function cycleCamera() { cycleCameraTo((camMode + 1) % 4); }

function cycleCameraTo(m) {
  camMode = m;
  // in a headset the near plane belongs to vr.js, which sets it to let the
  // instruments in at arm's length; leave it alone
  if (!vr.inVR()) {
    camera.near = camMode === 1 ? (ship.eyeNear || 0.1) : 0.5;  // FP: instruments are inches from the eye
    camera.updateProjectionMatrix();
  }
  addMsg('cam', 'Camera: ' + CAM_NAMES[camMode], 0);
}

// ---------------------------------------------------------------- menu
const menuEl = document.getElementById('menu');
let menuOpen = false;
let menuTab = 'solo';

// The tab rail: what am I doing, then what am I flying, then where. The
// Together tab exists only when a record office is configured — configure
// nothing and multiplayer is not merely disabled, it is absent.
function buildTabs() {
  const tabs = [['solo', 'Solo'], ['together', 'Together'], ['ship', 'Ship'],
    ['place', 'Place'], ['options', 'Options']];
  const rail = document.getElementById('menuTabs');
  rail.innerHTML = '';
  for (const [id, label] of tabs) {
    if (id === 'together' && !net.enabled()) continue;
    const b = document.createElement('button');
    b.textContent = label;
    if (id === 'together' && live.inRoom()) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      pip.textContent = `● ${roomRoster.length || live.roster().length}`;
      b.appendChild(pip);
    }
    if (id === menuTab) b.classList.add('on');
    b.onclick = () => { menuTab = id; showPane(); };
    rail.appendChild(b);
  }
  showPane();
}
function showPane() {
  if (menuTab === 'together' && !net.enabled()) menuTab = 'solo';
  for (const p of document.querySelectorAll('#menuBody .pane')) {
    p.classList.toggle('on', p.dataset.pane === menuTab);
  }
  for (const b of document.querySelectorAll('#menuTabs button')) {
    b.classList.toggle('on', b.textContent.replace(/●.*$/, '').trim()
      === ({ solo: 'Solo', together: 'Together', ship: 'Ship', place: 'Place', options: 'Options' })[menuTab]);
  }
}
/**
 * On a telephone the top of the screen is one column, not four corners. Across
 * 440 px, "WIND 11 km/h from the W" and a trial line cannot both fit on a row,
 * and the room's roster and any parked notice want the same band again — they
 * printed over each other, which is what pilots reported.
 *
 * So they are stacked, each measured below the last, because none of them has a
 * knowable height: the trial line wraps to one row on a desk and four on a
 * phone, and a roster grows with every pilot who joins. On a wide screen the
 * stylesheet's corners are restored.
 */
function layoutHud() {
  const tl = document.getElementById('panelTL');
  const tr = document.getElementById('panelInfo');
  const rm = document.getElementById('room');
  const ct = document.getElementById('center');
  const parked = ct.classList.contains('parked');
  // On its side the screen is wide and very short: the round buttons run across
  // the TOP, so there is no column to dodge and no room to stack under. The
  // stylesheet puts each panel in its own corner there; leave them alone.
  if (innerWidth > 900
      || matchMedia('(orientation: landscape) and (max-height: 560px)').matches) {
    tr.style.top = ''; tr.style.left = ''; rm.style.top = ''; ct.style.top = '';
    return;
  }
  const GAP = 5;
  const tlBox = tl.getBoundingClientRect();
  // First try to put the trial in the empty band BESIDE the instruments — the
  // band between them and the round buttons is dead space otherwise, and using
  // it lifts everything below by the height of a whole block. It only counts as
  // fitting if it wraps no lower than the instruments do.
  tr.style.top = `${Math.round(tlBox.top)}px`;
  tr.style.left = `${Math.round(tlBox.right + 10)}px`;
  if (tr.getBoundingClientRect().bottom > tlBox.bottom + 2) {
    tr.style.left = '';                        // too tall beside them: stack instead
    tr.style.top = `${Math.round(tlBox.bottom + GAP)}px`;
  }
  // read back after each write: an empty block is zero-high and must not
  // reserve a band, and a wrapped one takes as many as it needs
  rm.style.top = `${Math.round(Math.max(tlBox.bottom, tr.getBoundingClientRect().bottom) + GAP)}px`;
  ct.style.top = parked
    ? `${Math.round(Math.max(tr.getBoundingClientRect().bottom, rm.getBoundingClientRect().bottom) + GAP + 4)}px`
    : '';
}
addEventListener('resize', layoutHud);

function toggleMenu(force) {
  menuOpen = force !== undefined ? force : !menuOpen;
  if (vr.inVR() && !menuOpen) vr.showMenu(false);
  menuEl.classList.toggle('hidden', !menuOpen);
  if (!menuOpen && !live.inRoom()) live.stopLobby();
  if (menuOpen) {
    // the list of open rooms is live only while the menu is showing
    if (net.enabled()) {
      live.watchLobby((list) => { openRooms = list.filter((r) => !r.mine); if (menuOpen) buildMenuButtons(); });
    }
    if (live.inRoom() && menuTab === 'solo') menuTab = 'together';   // land where the action is
    buildMenuButtons();
    document.getElementById('help').classList.add('hidden');
    document.getElementById('board').classList.add('hidden');
  }
}
// Everything the menu offers goes through here, so this is also where the
// headset's board gets its list — one funnel, and a button added to the flat
// menu appears in VR without anybody remembering to add it twice.
let vrMenuItems = [];
// The flat menu groups its buttons by putting them in different columns of the
// page — ships here, places there, courses in a third. A board that flattens
// all of that into one list of forty rows is exactly as confusing as it sounds,
// which is what a pilot found. So carry the grouping across.
// ...and WHICH TAB it belongs to. The flat menu builds every pane and shows one
// by CSS, so collecting them all gave the headset a single list of everything
// the game can do — "having one big list in vr was too cluttered". These are
// the same five tabs the page has.
// THE REAL PANE IDS. I invented `menuRooms`, which does not exist, so every
// button in the Together pane fell through the default and landed in Solo —
// and Together showed "nothing here just now" while holding the whole roster.
const VR_PANE = {
  menuTracks: 'solo', menuScens: 'solo', menuGo: 'solo',
  menuTogether: 'together', menuWho: 'together',
  menuShips: 'ship', menuPlaces: 'place', menuOpts: 'options',
};
export const VR_TABS = [['solo', 'SOLO'], ['together', 'TOGETHER'],
  ['ship', 'SHIP'], ['place', 'PLACE'], ['options', 'OPTIONS']];
function menuButton(parent, label, sub, onClick, current) {
  vrMenuItems.push({ label, sub, onClick, current,
    tab: VR_PANE[parent && parent.id] || 'solo' });
  const b = document.createElement('button');
  b.innerHTML = label + (sub ? ` <small>— ${sub}</small>` : '');
  if (current) b.classList.add('current');
  b.onclick = onClick;
  parent.appendChild(b);
}
function buildMenuButtons() {
  vrMenuItems = [];
  const shipsDiv = document.getElementById('menuShips');
  const optsDiv = document.getElementById('menuOpts');
  const placeDiv = document.getElementById('menuPlaces');
  shipsDiv.innerHTML = ''; optsDiv.innerHTML = ''; placeDiv.innerHTML = '';
  for (const [id, s] of Object.entries(SHIPS)) {
    if (s.ai) continue;
    menuButton(shipsDiv, s.name, s.sub, () => {
      if (tryChangeShip(id)) toggleMenu(false);
    }, id === currentShip);
  }
  const inRoomNotHost = live.inRoom() && !live.isHost();
  const locBtn = (id, label, sub) => menuButton(placeDiv, label,
    inRoomNotHost ? 'the room flies together — the host chooses' : sub, () => {
      if (inRoomNotHost) {
        addMsg('roomplace', 'The room flies together: its host chooses where. Leave the room to travel alone.', 0);
        return;
      }
      if (tryTravel(id)) toggleMenu(false);
    }, id === currentLocation);

  // The three cities are the choice; what you can do once you are there hangs
  // beneath the one you are in — the ground crew can only walk her to places in
  // the city she is actually standing in.
  const PLACES = [
    ['paris', 'Paris, 1901', 'the Deutsch Prize course'],
    ['monaco', 'Monaco, winter 1902', 'the maritime guide rope'],
    ['stlouis', 'St. Louis, 1904', 'the World’s Fair grand prize'],
  ];
  for (const [id, label, sub] of PLACES) {
    locBtn(id, label, sub);
    if (id !== currentLocation) continue;
    const spots = world.towSpots || [];
    if (!spots.length) continue;
    const nest = document.createElement('div');
    nest.className = 'subopts';
    const cap = document.createElement('div');
    cap.className = 'subcap';
    cap.textContent = 'the ground crew will walk her by the rope to —';
    nest.appendChild(cap);
    for (const spot of spots) {
      menuButton(nest, spot.name, '', () => {
        if (!ship.landed || race.state !== 'idle') {
          addMsg('notow', 'Land first — the men cannot catch a flying rope.', 0); return;
        }
        ship.reset(new THREE.Vector3(spot.pos.x, restAt(spot.pos.x, spot.pos.z), spot.pos.z), ship.yaw);
        toggleMenu(false);
        addMsg('tow', `The men walk her out by the guide rope to ${spot.name} — “as stable-boys lead a racehorse.”`, 0);
      });
    }
    placeDiv.appendChild(nest);
  }

  // scenarios column
  const scenDiv = document.getElementById('menuScens');
  scenDiv.innerHTML = '';
  const doneMap = store.json('myairships_scen', {}) || {};
  for (const def of SCENARIOS) {
    menuButton(scenDiv, (doneMap[def.id] ? '✓ ' : '') + def.title, def.sub, () => startScenario(def));
  }

  // time trials
  const trDiv = document.getElementById('menuTracks');
  trDiv.innerHTML = '';
  // say plainly whether the world ledger is open, and who you are flying as
  if (net.enabled()) {
    const status = document.createElement('div');
    status.className = 'officeline';
    status.innerHTML = `<b>The Record Office is open</b> — flying as ${escapeHtml(net.pilotName())}`;
    trDiv.appendChild(status);
  }
  for (const t of [...TRACKS, ...loadCustomTracks()]) {
    let best = null;
    try { best = JSON.parse(store.get(bestKey(t)) || 'null'); } catch { /* noop */ }
    // warn before the flight, not at the moment the tank runs dry
    const P = ship.spec.physics;
    const vTop = shipTopSpeed(ship.spec);
    const need = vTop ? courseLength(t) / vTop : 0;
    const thirsty = P.fuel && need > P.fuel * 0.9;
    // the standing record for this course and class, alongside your own best
    let wrNote = '';
    if (net.enabled() && !t.custom) {
      const wr = worldRecord(t.id, currentShip);
      if (wr) wrNote = ` · <span class="wrtag">world ${fmt(wr.t)} (${escapeHtml(wr.pilot)})</span>`;
      else if (wr === null) wrNote = ' · <span class="wrtag">world record unclaimed</span>';
      else fetchRecord(t.id, currentShip, () => { if (menuOpen) buildMenuButtons(); });
    }
    menuButton(trDiv, t.name + (best ? ` — ${fmt(best.t)}` : ''),
      (t.custom ? '(custom) ' : '') + (t.sub || `${t.laps} laps`)
      + (thirsty ? ' · <b>at the limit of her petrol</b>' : '') + wrNote, () => {
        if (currentLocation !== t.location) loadWorld(t.location);
        startTrack(t);
        toggleMenu(false);
      });
  }
  menuButton(trDiv, 'Copy ghost code', 'share your best on the current trial', () => {
    if (!track || track.historic || !ghostBest) { addMsg('gh', 'Fly a time trial and set a time first.', 0); return; }
    try {
      navigator.clipboard.writeText(encodeGhost(ghostBest));
      addMsg('gh', 'Ghost code copied — send it to a rival.', 0);
    } catch { addMsg('gh', 'Clipboard refused; try a desktop browser.', 0); }
  });
  menuButton(trDiv, 'Race a rival’s ghost', 'paste a ghost code', () => {
    const code = prompt('Paste the ghost code:');
    if (!code) return;
    const g = decodeGhost(code);
    if (!g) { addMsg('gh2', 'That code would not decode.', 0); return; }
    g.foreign = true;
    ghostBest = g;
    if (track && !track.historic) chaseGhost = { trackId: track.id, ghost: g };
    updateGhostMesh();
    addMsg('gh2', g.pilot
      ? `${g.pilot}’s ghost is loaded — it flies at ${fmt(g.t)}. Beat it.`
      : `Rival ghost loaded — it flies at ${fmt(g.t)}. Beat it.`, 0);
    toggleMenu(false);
  });
  if (!editing) {
    menuButton(trDiv, 'Track editor', 'G drops a gate at the ship · U undoes', () => {
      if (race.state !== 'idle') { addMsg('ed', 'Finish the current trial first.', 0); return; }
      editing = { gates: [] };
      buildRings(editing.gates);
      toggleMenu(false);
      addMsg('ed', 'Editor on: fly anywhere, G drops a gate, U undoes. Esc menu → save.', 0);
    });
  } else {
    menuButton(trDiv, `Editor: save & fly (${editing.gates.length} gates)`, 'names it, copies its share code', () => {
      if (editing.gates.length < 2) { addMsg('ed2', 'Drop at least two gates first (G).', 0); return; }
      const name = prompt('Name the circuit:', 'My Circuit') || 'My Circuit';
      const t = {
        id: 'c_' + name.toLowerCase().replace(/\W+/g, '-'),
        name, sub: 'custom circuit', custom: true,
        location: currentLocation, laps: 2, gates: editing.gates.slice(),
      };
      saveCustomTrack(t);
      try { navigator.clipboard.writeText(btoa(JSON.stringify(t))); } catch { /* noop */ }
      editing = null;
      startTrack(t);
      toggleMenu(false);
      addMsg('ed3', `“${t.name}” saved — its share code is on your clipboard.`, 0);
    });
    menuButton(trDiv, 'Editor: cancel', '', () => { editing = null; buildRings(historicTrack().gates); buildMenuButtons(); });
  }
  // ---- the record office: these entries exist only if one is configured ----
  if (net.enabled()) {
    menuButton(trDiv, 'World records', 'the ledger of times for this course', () => {
      showBoard(boardTrackFor().id, currentShip, false);
    });
    if (ghostBest && track && !track.historic && !track.custom && !ghostBest.foreign) {
      menuButton(trDiv, 'Send my best to the record office', `${fmt(ghostBest.t)} on ${track.name}`,
        () => { submitBest(track, ghostBest); toggleMenu(false); });
    }
  }
  {
    const n = albumGet().length;
    menuButton(trDiv, 'Your postcards', n ? `${n} collected` : 'none yet — fly a postcard hunt',
      () => { toggleMenu(false); openAlbum(); });
  }
  menuButton(trDiv, 'Load a track code', 'paste a friend’s circuit', () => {
    const code = prompt('Paste the track code:');
    if (!code) return;
    try {
      const t = JSON.parse(atob(code.trim()));
      if (!t.gates || !t.location) throw new Error('bad');
      t.custom = true;
      saveCustomTrack(t);
      addMsg('tc', `“${t.name}” added to your time trials.`, 0);
      buildMenuButtons();
    } catch { addMsg('tc', 'That code would not decode.', 0); }
  });
  menuButton(optsDiv, 'Camera: ' + CAM_NAMES[camMode], 'change view', () => { cycleCamera(); buildMenuButtons(); });
  menuButton(optsDiv, `Photograph mode: ${document.body.classList.contains('photo') ? 'on' : 'off'}`, 'sepia and grain', () => {
    document.body.classList.toggle('photo'); buildMenuButtons();
  });
  menuButton(optsDiv, `Sound: ${soundState() === 'asleep' ? 'asleep — tap the horn to wake her'
    : (muted ? 'off' : 'on')}`, 'the spitting rumble', () => {
    initAudio();
    muted = soundState() === 'asleep' ? false : !muted;
    drawSoundBtn(); buildMenuButtons();
  });
  menuButton(optsDiv, `On-screen controls: ${document.body.classList.contains('touch') ? 'on' : 'off'}`,
    'the helm and trim sliders, on any screen', () => {
      setTouchUI(!document.body.classList.contains('touch'));
      buildMenuButtons();
    });
  menuButton(optsDiv, 'Controls', 'the key reference', () => { toggleMenu(false); document.getElementById('help').classList.remove('hidden'); });
  const wKmh = Math.round(Math.hypot(dailyWind.x, dailyWind.z) * 3.6 * 0.42);
  menuButton(optsDiv, `Today’s surface wind: ~${wKmh} km/h`, 'the same sky for everyone, everywhere, today', () => {});
  menuButton(optsDiv, 'Reset the ship', 'back to the aerodrome', () => { resetShip(); toggleMenu(false); });
  if (net.enabled()) {
    menuButton(optsDiv, 'Report a fault', 'send the works an account of it, with a picture', openBugBook);
    menuButton(optsDiv, `Flight records: ${net.recordsOn() ? 'on' : 'off'}`,
      'how attempts end — no names, no positions, nothing that follows you', () => {
        net.setRecordsOn(!net.recordsOn());
        buildMenuButtons();
      });
  }

  // the register sits with the title: it is who you are, not a setting
  const who = document.getElementById('menuWho');
  if (who) {
    who.innerHTML = `Flying as <b>${escapeHtml(net.pilotName())}</b>`;
    const b = document.createElement('button');
    b.textContent = '✎';                  // a pencil, beside the name
    b.title = 'Sign the register under another name';
    b.setAttribute('aria-label', 'Change pilot name');
    b.onclick = () => {
      const name = net.setPilotName(prompt('Sign the register — your pilot name:', net.pilotName()) || '');
      if (name) { addMsg('pn', `The register reads “${name}”.`, 0); live.setShip(currentShip); }
      buildMenuButtons();
    };
    who.appendChild(b);
  }

  // "M. Machuron gave the word: 'Let go all!'" (Ch. III) — the way out of the
  // menu should be the way she leaves the ground, not a keyboard hint
  const go = document.getElementById('menuGo');
  if (go) {
    go.innerHTML = '';
    const b = document.createElement('button');
    b.textContent = '“Let go all!”';
    b.onclick = () => toggleMenu(false);
    go.appendChild(b);
  }

  buildTogether();
  buildTabs();
  // ...and the same list to the headset's board
  if (vr.inVR()) vr.showMenu(menuOpen, vrMenuItems, menuTab);
}

// ---- the Together pane: the lobby before you are in a room, the room after
function buildTogether() {
  const div = document.getElementById('menuTogether');
  if (!div) return;
  div.innerHTML = '';
  if (!net.enabled()) return;

  if (!live.inRoom()) {
    const head = document.createElement('div');
    head.className = 'officeline';
    head.innerHTML = openRooms.length
      ? `<b>${openRooms.length} room${openRooms.length > 1 ? 's' : ''} open</b> — join one, or start your own`
      : '<b>No rooms open</b> — start one and it will be listed here';
    div.appendChild(head);

    for (const r of openRooms.slice(0, 6)) {
      const rt = TRACKS.find((x) => x.id === r.trackId);
      menuButton(div, `${escapeHtml(r.host)}’s room`,
        `${rt ? rt.name : r.trackId} · ${r.count} aboard · code ${r.code}`, () => {
          createOrJoinRoom(r.trackId, r.code, false);
          toggleMenu(false);
        });
    }
    const openOne = (listed) => {
      const t = (track && !track.historic && !track.custom) ? track : TRACKS[0];
      createOrJoinRoom(t.id, live.newRoomCode(), true, listed);
      toggleMenu(false);
    };
    menuButton(div, 'Open a room', 'listed above for anyone to join', () => openOne(true));
    menuButton(div, 'Open a private room', 'off the list — only your code lets anyone in',
      () => openOne(false));
    menuButton(div, 'Join by code', 'if a friend sent you one', () => {
      const code = (prompt('Room code:') || '').trim().toUpperCase();
      if (!code) return;
      // no need to ask what they are flying: the host's word settles the course
      // the moment we are aboard, and we follow it from there
      createOrJoinRoom(track ? track.id : TRACKS[0].id, code, false, true);
      toggleMenu(false);
    });
    return;
  }

  // ---- in a room ----
  const info = live.roomInfo();
  // live.roster() every time, not the snapshot from the last presence sync:
  // that one was taken before anybody had sent a position, so the bearings
  // in it are permanently blank
  const aboard = live.roster();
  const head = document.createElement('div');
  head.className = 'officeline';
  head.innerHTML = `<b>Room ${info.code}</b> — ${aboard.length} aboard, flying `
    + `${escapeHtml((TRACKS.find((t) => t.id === info.trackId) || {}).name || info.trackId)}`
    + `${info.listed ? '' : ' · <i>off the list</i>'}`
    + `${live.isHost() ? ' · <b>you hold the room</b>' : ''}`;
  div.appendChild(head);
  for (const r of aboard) {
    const row = document.createElement('div');
    row.className = 'rrow' + (r.self ? ' rme' : '');
    row.style.cssText = 'font-size:13px;padding:1px 2px';
    row.innerHTML = `${escapeHtml(r.pilot)}<span style="opacity:.55"> · `
      + `${r.spectating ? 'watching' : (SHIPS[r.ship] || SHIPS.no6).name.replace('Santos-Dumont ', '')}</span>`;
    div.appendChild(row);
  }
  // the host chooses what the room flies, and calls it away
  if (live.isHost()) {
    const cur = TRACKS.find((t) => t.id === info.trackId);
    menuButton(div, `Course: ${cur ? cur.name : info.trackId}`, 'the whole room follows — click to change', () => {
      const i = TRACKS.findIndex((t) => t.id === info.trackId);
      const next = TRACKS[(i + 1) % TRACKS.length];
      live.callCourse(next.id);
      if (currentLocation !== next.location) loadWorld(next.location);
      startTrack(next);
      race.state = 'idle';
      buildMenuButtons();
    });
    menuButton(div, 'Call the race', 'eight seconds, everyone on the grid', () => {
      toggleMenu(false);
      tryStartRace();
    });
    // ---- the games a child can be handed the controls for ----
    const gh = document.createElement('div');
    gh.className = 'officeline';
    gh.innerHTML = play.id
      ? `<b>Playing ${escapeHtml((gameById(play.id) || {}).name || play.id)}</b> — half the day’s wind`
      : '<b>Games</b> — gentler than a trial, and nobody is knocked out';
    div.appendChild(gh);
    for (const g of GAMES) {
      const few = live.roster().filter((r) => !r.spectating).length < g.minPilots;
      menuButton(div, g.name, few ? `${g.sub} · wants ${g.minPilots} pilots` : g.sub, () => {
        if (few) { addMsg('game', `${g.name} wants at least ${g.minPilots} aboard.`, 5); return; }
        live.callGame(g.id, 1);
        if (g.id === 'tag') {                    // somebody has to be it to begin with
          const all = live.roster().filter((r) => !r.spectating);
          live.startIt(all[Math.floor(Math.random() * all.length)].key);
        }
        toggleMenu(false);
      }, play.id === g.id);
    }
    if (play.id) menuButton(div, 'Call the game off', 'back to free flight', () => {
      live.callGame(null); toggleMenu(false);
    });
  } else {
    const line = document.createElement('div');
    line.className = 'officeline';
    line.innerHTML = play.id
      ? `<b>Playing ${escapeHtml((gameById(play.id) || {}).name || play.id)}</b> — `
        + escapeHtml((gameById(play.id) || {}).sub || '')
      : 'Waiting on the host to call the race or a game — fly about until they do.';
    div.appendChild(line);
  }
  menuButton(div, 'Copy the room code', info.code, () => {
    try { navigator.clipboard.writeText(info.code); addMsg('room', `Room code ${info.code} copied.`, 0); }
    catch { addMsg('room', `The room code is ${info.code}.`, 0); }
  });
  menuButton(div, spectate.on ? 'Take a ship again' : 'Stand down and watch',
    spectate.on ? 'rejoin the flying' : 'ride with any pilot (X cycles)', () => setSpectate(!spectate.on));
  menuButton(div, 'Leave the room', '', () => {
    if (spectate.on) setSpectate(false);
    live.leave(); roomRoster = []; roomResults = []; drawRoom(); buildMenuButtons();
  });
}

// ---------------------------------------------------------------- flying together
// A live room: everyone in it flies the same trial, sees the others where they
// actually are, and starts on one call. Scoring stays on each pilot's own
// machine — the ledger is where scrutineered times live.
let roomRoster = [], roomResults = [], openRooms = [];

/**
 * Which way to look for a rival, and how far off she is. The same arrow and the
 * same convention as the wind: it turns with YOUR head, so straight up means
 * dead ahead — a pilot can follow it out of the window without doing sums.
 */
function bearingTag(r) {
  if (!r || r.self || !r.pos || !ship) return '';
  const dx = r.pos.x - ship.pos.x, dz = r.pos.z - ship.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return '';
  const deg = -90 - (Math.atan2(-dz, dx) - ship.yaw) * 180 / Math.PI;
  const far = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 5) * 5 + ' m';
  return ` <span class="brg" style="transform:rotate(${deg.toFixed(0)}deg)">➤</span>`
    + `<span style="opacity:.5"> ${far}</span>`;
}

/**
 * Where the next thing you are looking for is, and how far off.
 *
 * A pilot asked for this: "we should have a bearing and distance to next ring
 * in any game with sequential goals". Anything with an order to it — the gates
 * of a trial, the hoops of a scenario route, the landing zone, the gems of a
 * hunt, the hidden place in hot-and-cold — hands its next mark to this, and it
 * is shown on the same arrow as the wind and the rivals: turning with your own
 * head, so straight up is dead ahead.
 */
function nextMark() {
  if (!ship || !world) return null;
  if (play.id === 'hotcold' && play.places[0] && play.pause <= 0) {
    const p = play.places[0];
    return { x: p.x, z: p.z, name: 'it' };            // no name — that is the game
  }
  if (play.id === 'postcards' && play.gems.length) {
    let best = null, bd = Infinity;
    for (const g of play.gems) {
      const d = Math.hypot(g.position.x - ship.pos.x, g.position.z - ship.pos.z);
      if (d < bd) { bd = d; best = g; }
    }
    return best ? { x: best.position.x, z: best.position.z, name: best.userData.place.name } : null;
  }
  if (scenario && routeRings.length) {
    const r = routeRings[0];
    return { x: r.position.x, z: r.position.z, name: 'the next hoop' };
  }
  if (scenario && scenRing && scenRing.visible) {
    return { x: scenRing.position.x, z: scenRing.position.z, name: 'the landing' };
  }
  if (track && race.state === 'run') {
    const gates = track.gates;
    const g = gates[race.gate % gates.length];
    if (g) return { x: g.x, z: g.z, name: `gate ${(race.gate % gates.length) + 1} of ${gates.length}` };
  }
  if (track && race.state === 'idle' && world.startRing) {
    return { x: world.startRing.x, z: world.startRing.z, name: 'the starting line' };
  }
  return null;
}

function drawNextMark() {
  const el = document.getElementById('mark');
  if (!el) return;
  const m = nextMark();
  if (!m) { el.innerHTML = ''; return; }
  const dx = m.x - ship.pos.x, dz = m.z - ship.pos.z;
  const d = Math.hypot(dx, dz);
  const deg = -90 - (Math.atan2(-dz, dx) - ship.yaw) * 180 / Math.PI;
  const far = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 5) * 5 + ' m';
  el.innerHTML = `<span class="brg" style="transform:rotate(${deg.toFixed(0)}deg)">➤</span> `
    + `<b>${far}</b> <span class="markname">${escapeHtml(m.name)}</span>`;
}

// ---------------------------------------------------------------- flight records
// One row when an attempt ends, so it can be seen WHICH things people give up
// on and where. Nothing follows a pilot around: no positions, no session, no
// names — see net.logFlight and supabase/schema.sql.
let flight = null;
function flightBegin(kind, ref) {
  flightEnd('abandoned');                    // whatever was open is over
  flight = { kind, ref, at: performance.now(), ship: currentShip, place: currentLocation };
}
function flightEnd(outcome, detail) {
  // Today's sky back, whatever else happens. A scenario may reconstruct its own
  // afternoon with ctx.setWind — VII does — and a flight can end in more ways
  // than there are places to remember that: completed, failed, wrecked, walked
  // away from. Putting it here means every one of them is covered, and a
  // scenario that wants its own weather sets it again in setup. Without it,
  // 1901 kept blowing over free flight and over every race started from there:
  // "16km/h wind again".
  dailyWind.copy(todaysWind);
  wind.copy(dailyWind);
  if (!flight) return;
  const f = flight;
  flight = null;                             // before the send: never log twice
  net.logFlight({ place: f.place, kind: f.kind, ref: f.ref, shipId: f.ship,
    outcome, secs: (performance.now() - f.at) / 1000, detail });
}

// ---------------------------------------------------------------- the games
// Tag, the postcard hunt, hot-and-cold and follow-the-leader. What is being
// played is the host's word, broadcast; WHERE everything is is worked out
// locally from the day and the room code, so nothing but "I found one" is sent.
const play = {
  id: null, round: 1,          // which game, and which hunt within it
  places: [],                  // the hunt's list, or the single hidden place
  got: new Set(),              // what I have collected this round
  gems: [],                    // the shining things, as meshes
  itSince: 0, itTimes: new Map(),   // tag: who is it, and for how long each has been
  lastTag: 0,                  // the no-tag-backs grace
  ping: 0, pause: 0,           // hot-and-cold: the next bell, and the pause after a find
  kept: 0, lost: 0,            // follow: seconds with the leader and without
  said: '',                    // the line under the instruments
};

function kidGame() { return !!play.id; }

function clearGems() {
  for (const g of play.gems) { scene.remove(g); g.geometry.dispose(); g.material.dispose(); }
  play.gems = [];
}

/** A gem turning in the air over a place, bright enough to see from a way off. */
function makeGem(p) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(7, 0),
    new THREE.MeshBasicMaterial({ color: 0x7fe3c4, transparent: true, opacity: 0.92, fog: false }));
  m.position.set(p.x, p.y, p.z);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(15, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x7fe3c4, transparent: true, opacity: 0.14,
      depthWrite: false, fog: false }));
  m.add(halo);
  m.userData.place = p;
  scene.add(m);
  play.gems.push(m);
  return m;
}

function startGame(id, round) {
  if (id) flightBegin('game', id);
  clearGems();
  play.id = id; play.round = round || 1;
  play.got = new Set(); play.ping = 0; play.pause = 0; play.kept = 0; play.lost = 0;
  play.itTimes = new Map(); play.lastTag = 0; play.said = '';
  const code = live.inRoom() ? live.roomInfo().code : 'solo';
  if (id === 'postcards') {
    play.places = pickPlaces(world, code, play.round, 6);
    for (const p of play.places) makeGem(p);
    setCenter('The postcard hunt', 'Six gems are turning over the famous places. '
      + 'Fly through one and a postcard is made of it, with your ship in the picture.');
  } else if (id === 'hotcold') {
    play.places = [hiddenPlace(world, code, play.round)].filter(Boolean);
    setCenter('Hot and cold', 'Something is hidden over one of the places. '
      + 'The bell rings faster as you get warmer — there is nothing to read.');
  } else if (id === 'tag') {
    play.places = [];
    setCenter('Tag', 'Fly into another ship to pass it on. Silk on silk: nobody is hurt.');
  } else if (id === 'follow') {
    play.places = [];
    setCenter('Follow the leader', `Stay within ${FOLLOW_RANGE} metres of the ship in front.`);
  }
  if (id) addMsg('game', gameById(id) ? gameById(id).how : '', 0);
  buildMenuButtons();
}

function stopGame(quiet) {
  flightEnd('stopped', play.id === 'postcards'
    ? { found: play.got.size, of: play.places.length } : null);
  clearGems();
  play.id = null; play.places = []; play.got = new Set(); play.said = '';
  if (!quiet) setCenter('', '');
  buildMenuButtons();
}

// ---------------------------------------------------------------- postcards
// The reward for finding a gem: a photograph of the place with your own ship in
// it, framed and captioned like a card of the period.
//
// It is rendered to an offscreen target rather than to the screen, so nothing
// flickers and the pilot never sees the camera jump. That also means it misses
// the bloom pass, so the warmth is put back with a wash in the 2D frame.
const CARD_W = 760, CARD_H = 500;
let cardTarget = null, cardCam = null;

function shootPostcard(place) {
  try {
    if (!cardTarget) {
      // sRGB on the target: rendering to the screen gets the output conversion
      // for free, rendering to a target does not, and without it every postcard
      // came out as a dark brown evening
      cardTarget = new THREE.WebGLRenderTarget(CARD_W, CARD_H,
        { colorSpace: THREE.SRGBColorSpace });
      cardCam = new THREE.PerspectiveCamera(52, CARD_W / CARD_H, 0.5, 20000);
    }
    // stand off along the line from the place to the ship, and take them both in
    const at = new THREE.Vector3(place.x, place.y * 0.62, place.z);
    const away = ship.pos.clone().sub(at); away.y = 0;
    if (away.lengthSq() < 1) away.set(1, 0, 0);
    away.normalize();
    // Stand off behind the ship, on the far side from the place, and only as far
    // as is needed to hold them both: 62 m put the ship in the middle distance
    // and the postcard was of some rooftops. She is the subject.
    const d = Math.hypot(ship.pos.x - place.x, ship.pos.z - place.z);
    const back = Math.min(95, Math.max(38, d * 0.95));
    cardCam.position.copy(ship.pos).addScaledVector(away, back)
      .add(new THREE.Vector3(0, back * 0.3, 0));
    cardCam.lookAt(ship.pos.clone().lerp(at, 0.5));
    cardCam.updateProjectionMatrix();

    const wasRope = ship.ropeLine && ship.ropeLine.visible;
    renderer.setRenderTarget(cardTarget);
    renderer.render(scene, cardCam);
    renderer.setRenderTarget(null);
    if (wasRope) ship.ropeLine.visible = true;

    const buf = new Uint8Array(CARD_W * CARD_H * 4);
    renderer.readRenderTargetPixels(cardTarget, 0, 0, CARD_W, CARD_H, buf);
    return frameCard(buf, place);
  } catch (e) {
    console.warn('[postcard]', e);
    return null;
  }
}

/** The picture, turned the right way up and given a border and a caption. */
function frameCard(buf, place) {
  const raw = document.createElement('canvas');
  raw.width = CARD_W; raw.height = CARD_H;
  const rg = raw.getContext('2d');
  const img = rg.createImageData(CARD_W, CARD_H);
  // WebGL hands the pixels back bottom-up
  for (let y = 0; y < CARD_H; y++) {
    const src = (CARD_H - 1 - y) * CARD_W * 4, dst = y * CARD_W * 4;
    img.data.set(buf.subarray(src, src + CARD_W * 4), dst);
  }
  rg.putImageData(img, 0, 0);

  const M = 26, c = document.createElement('canvas');
  c.width = CARD_W + M * 2; c.height = CARD_H + M * 2 + 44;
  const g = c.getContext('2d');
  g.fillStyle = '#efe3c8'; g.fillRect(0, 0, c.width, c.height);      // the card stock
  g.drawImage(raw, M, M);
  g.fillStyle = 'rgba(196,150,74,0.16)';                             // the warmth of the day
  g.fillRect(M, M, CARD_W, CARD_H);
  g.strokeStyle = '#8a6d3b'; g.lineWidth = 2;
  g.strokeRect(M - 1, M - 1, CARD_W + 2, CARD_H + 2);

  g.fillStyle = '#4a3a24';
  g.font = 'italic 27px Georgia, serif';
  g.textBaseline = 'middle';
  g.fillText(place.name, M, CARD_H + M + 24);
  g.font = 'italic 15px Georgia, serif';
  g.fillStyle = '#7a6647';
  const who = net.pilotName() || 'a pilot';
  const line = `${(SHIPS[currentShip] || SHIPS.no6).name} · ${who}`;
  g.textAlign = 'right';
  g.fillText(line, c.width - M, CARD_H + M + 24);
  g.textAlign = 'left';
  return c.toDataURL('image/jpeg', 0.74);
}

// ---- the album ----------------------------------------------------------
const LS_CARDS = 'myairships_cards';
const CARD_MAX = 24;
function albumGet() { const a = store.json(LS_CARDS, []); return Array.isArray(a) ? a : []; }
function albumAdd(place, url) {
  if (!url) return;
  const a = albumGet().filter((c) => c.id !== place.id || c.place !== currentLocation);
  a.unshift({ id: place.id, name: place.name, place: currentLocation, url });
  while (a.length > CARD_MAX) a.pop();
  // the drawer is not infinite: drop the oldest until it will go in
  while (a.length && !store.set(LS_CARDS, JSON.stringify(a))) a.pop();
}

// ---------------------------------------------------------------- playing
function tickGames(dt) {
  if (!play.id || !ship) return;
  for (const g of play.gems) {                       // they turn and breathe
    g.rotation.y += dt * 1.1;
    g.position.y = g.userData.place.y + Math.sin(windGustT * 1.6 + g.userData.place.x) * 2.2;
  }
  if (play.id === 'postcards') return tickHunt(dt);
  if (play.id === 'hotcold') return tickHotCold(dt);
  if (play.id === 'tag') return tickTag(dt);
  if (play.id === 'follow') return tickFollow(dt);
}

function tickHunt() {
  for (let i = play.gems.length - 1; i >= 0; i--) {
    const gem = play.gems[i];
    const p = gem.userData.place;
    if (play.got.has(p.id)) continue;
    if (ship.pos.distanceTo(gem.position) > 26) continue;
    play.got.add(p.id);
    scene.remove(gem); play.gems.splice(i, 1);
    blip(880); setTimeout(() => blip(1180), 110);
    const url = shootPostcard(p);
    albumAdd(p, url);
    addMsg('card', `${p.name} — a postcard is made of her.`, 6);
    if (live.inRoom()) live.callClaim(p.id, { name: p.name });
    if (play.got.size >= play.places.length) {
      setCenter('All of them!', 'Every gem found — your postcards are in the menu, under Solo.');
      blip(1320);
    }
  }
  play.said = `Gems: ${play.got.size} of ${play.places.length}`;
}

function tickHotCold(dt) {
  // a moment to enjoy having found it before the next one begins
  if (play.pause > 0) {
    play.pause -= dt;
    if (play.pause <= 0) startGame('hotcold', play.round + 1);
    return;
  }
  const p = play.places[0];
  if (!p) return;
  const d = Math.hypot(ship.pos.x - p.x, ship.pos.z - p.z);
  const w = warmth(d, p.r, 1800);
  play.said = w > 0.92 ? 'BURNING' : w > 0.75 ? 'very warm' : w > 0.5 ? 'warm'
    : w > 0.28 ? 'cool' : 'cold';
  // the bell: a slow toll a long way off, a chatter when you are on top of it
  play.ping -= dt;
  if (play.ping <= 0) {
    play.ping = 1.6 - w * 1.45;
    blip(520 + w * 900);
  }
  if (d < p.r) {
    blip(1320); setTimeout(() => blip(1600), 120);
    addMsg('found', `Found it — ${p.name}!`, 7);
    if (live.inRoom()) live.callClaim(p.id, { name: p.name });
    play.said = `FOUND IT — ${p.name}!`;
    play.pause = 3.5;                                // then the next one
  }
}

function tickTag(dt) {
  const meIt = live.isIt();
  const it = live.itNow();
  if (it) {
    play.itTimes.set(it, (play.itTimes.get(it) || 0) + dt);
  }
  play.lastTag = Math.max(0, play.lastTag - dt);
  if (meIt && play.lastTag <= 0) {
    const hit = live.touchedNow();
    if (hit.length) {
      live.passIt(hit[0]);
      play.lastTag = TAG_GRACE;
      blip(760);
    }
  }
  const who = live.roster().find((r) => r.key === it);
  play.said = !it ? 'Nobody is it yet' : meIt ? 'YOU ARE IT — catch somebody!'
    : `${who ? who.pilot : 'Someone'} is it — keep away!`;
}

function tickFollow(dt) {
  const host = live.hostSeat();
  if (host === live.seat()) { play.said = 'You lead — they are following you.'; return; }
  const lead = live.roster().find((r) => r.key === host);
  if (!lead || !lead.pos) { play.said = 'Waiting for the leader…'; return; }
  const d = Math.hypot(ship.pos.x - lead.pos.x, ship.pos.z - lead.pos.z);
  if (d <= FOLLOW_RANGE) { play.kept += dt; play.said = `With her — ${Math.round(d)} m`; }
  else { play.lost += dt; play.said = `Falling behind — ${Math.round(d)} m`; }
}

function albumOpen() { return !document.getElementById('album').classList.contains('hidden'); }
function closeAlbum() { document.getElementById('album').classList.add('hidden'); }
function openAlbum() {
  const rows = document.getElementById('albumRows');
  const cards = albumGet();
  document.getElementById('albumSub').textContent = cards.length
    ? 'Tap one to see it whole. They are kept on this machine.'
    : 'None yet. Fly a postcard hunt and they will collect here.';
  rows.innerHTML = '';
  for (const c of cards) {
    const f = document.createElement('figure');
    const i = document.createElement('img');
    i.src = c.url; i.alt = c.name;
    i.onclick = () => window.open(c.url, '_blank');
    const cap = document.createElement('figcaption');
    cap.textContent = c.name;
    f.append(i, cap);
    rows.appendChild(f);
  }
  document.getElementById('album').classList.remove('hidden');
}

let roomTick = 0;
function drawRoom() {
  const el0 = document.getElementById('room');
  if (!live.inRoom()) { el0.innerHTML = ''; return; }
  const info = live.roomInfo();
  // during a race the panel is a running order: whoever is deepest into the
  // course stands first, so you can see the lead change instead of waiting
  // for the finish
  // live.roster() every time, not the snapshot from the last presence sync:
  // that one was taken before anybody had sent a position, so the bearings
  // in it are permanently blank
  const aboard = live.roster();
  const running = race.state === 'run' || live.standings().length > 0;
  const rows = running ? live.standings() : aboard;
  const lines = rows.map((r, i) => {
    const nm = escapeHtml(r.pilot) + (r.self ? '' : '');
    const shipName = (SHIPS[r.ship] || SHIPS.no6).name.replace('Santos-Dumont ', '');
    const brg = bearingTag(r);
    if (running && r.progress) {
      const nGates = track ? track.gates.length : 6;
      return `<div class="rrow${r.self ? ' rme' : ''}">${i + 1}. ${nm}${brg}` +
        `<span style="opacity:.6"> · lap ${r.progress.lap} gate ${r.progress.gate}/${nGates}` +
        ` · ${fmt(r.progress.t)}</span></div>`;
    }
    return `<div class="rrow${r.self ? ' rme' : ''}">${nm}${brg}` +
      `<span style="opacity:.55"> · ${r.spectating ? 'watching' : shipName}</span></div>`;
  }).join('');
  const watchers = aboard.filter((r) => r.spectating).length;
  const res = roomResults.length
    ? '<div class="rhead" style="margin-top:6px">FINISHED</div>' + roomResults
      .map((r, i) => `<div class="rrow">${i + 1}. ${escapeHtml(r.pilot)} — ${fmt(r.t)}</div>`).join('')
    : '';
  const watching = spectate.on ? ` · watching ${escapeHtml(spectate.pilot || '…')} (X: next)` : '';
  el0.innerHTML = `<div class="rhead">ROOM ${info.code} · ${aboard.length} aboard` +
    `${watchers ? ' · ' + watchers + ' watching' : ''}${watching}</div>${lines}${res}`;
}

// ---------------------------------------------------------------- spectating
// A pilot who is not flying rides with whoever is: the remote ships are full
// models, so every camera — chase, postcard, even standing in the basket —
// works on another pilot's machine exactly as it does on your own.
const spectate = { on: false, key: null, pilot: '', ship: null };

function camShip() { return (spectate.on && spectate.ship) ? spectate.ship : ship; }

function watchNext() {
  const ships = live.remoteShips();
  if (!ships.length) { spectate.ship = null; spectate.pilot = ''; return; }
  const i = ships.findIndex((s) => s.pilot === spectate.pilot);
  const pick = ships[(i + 1) % ships.length];
  spectate.ship = pick.mesh; spectate.pilot = pick.pilot;
  addMsg('watch', `Watching ${pick.pilot}.`, 0);
  drawRoom();
}

function setSpectate(on) {
  spectate.on = on;
  live.setSpectating(on);
  ship.group.visible = !on;
  ship.shadow.visible = !on;
  if (ship.ropeLine) ship.ropeLine.visible = !on;
  if (on) { watchNext(); addMsg('watch', 'You stand down and watch the race. (X for the next pilot)', 0); }
  else { spectate.ship = null; spectate.pilot = ''; addMsg('watch', 'You take a ship again.', 0); }
  drawRoom();
  buildMenuButtons();
}

// Everyone is put on the line, abreast and spaced, in an order the whole room
// agrees on (their seats, sorted). Without this the pilot who happened to be
// nearest the first gate when the call came simply won.
function placeOnGrid(t, grid) {
  const slot = Array.isArray(grid) ? Math.max(0, grid.indexOf(live.seat())) : live.gridSlot();
  const sp = trackSpawn(t);
  const across = new THREE.Vector3(-Math.sin(sp.yaw), 0, -Math.cos(sp.yaw));   // abeam
  const back = new THREE.Vector3(-Math.cos(sp.yaw), 0, Math.sin(sp.yaw));      // astern
  const row = Math.floor(slot / 3), col = (slot % 3) - 1;
  const p = new THREE.Vector3(sp.x, Math.max(14, sp.y), sp.z)
    .addScaledVector(across, col * 34)
    .addScaledVector(back, row * 40);
  ship.reset(p, sp.yaw);
  ship.landed = false;
}

async function createOrJoinRoom(trackId, code, hosting, listed = true) {
  const t = TRACKS.find((x) => x.id === trackId);
  if (!t) return;
  if (currentLocation !== t.location) loadWorld(t.location);
  live.attach(scene);
  live.setShip(currentShip);
  addMsg('room', `Calling the room ${code}…`, 0);
  const res = await live.join({
    trackId, code, listed,
    onRoster: (r) => { roomRoster = r; drawRoom(); },
    onStart: (p) => {
      const called = TRACKS.find((x) => x.id === p.trackId) || t;
      addMsg('roomgo', `${p.by} calls “Let go all!” — away in ${Math.round(p.delay)}…`, 0);
      roomResults = [];
      if (currentLocation !== called.location) loadWorld(called.location);
      startTrack(called);
      placeOnGrid(called, p.grid);
      race.count = p.delay;
    },
    onCourse: (p) => {
      const to = TRACKS.find((x) => x.id === p.trackId);
      if (!to) return;
      addMsg('roomcourse', `${p.by} sets the room to ${to.name}.`, 0);
      if (currentLocation !== to.location) loadWorld(to.location);
      startTrack(to);
      race.state = 'idle';
      buildMenuButtons();
    },
    onResult: (p) => {
      // keyed by seat: names are user-settable and two pilots may share one
      roomResults = [...roomResults.filter((x) => x.k !== p.k), p].sort((a, b) => a.t - b.t);
      addMsg('roomdone', `${p.pilot} crosses the line at ${fmt(p.t)}.`, 0);
      drawRoom();
    },
    onGate: () => drawRoom(),
    onGame: (p) => {
      if (!p.game) { stopGame(); addMsg('game', `${p.by} calls the game off.`, 0); return; }
      addMsg('game', `${p.by} calls ${(gameById(p.game) || {}).name || p.game}!`, 0);
      startGame(p.game, p.round);
    },
    onClaim: (p) => {
      if (p.k === live.seat()) return;
      addMsg('claim', `${p.pilot} has found ${p.name || 'one'}.`, 6);
      drawRoom();
    },
    onTag: (p) => {
      const mine = p.it === live.seat();
      addMsg('tag', mine ? 'You are IT!' : `${p.by} tags ${(live.roster().find((r) => r.key === p.it) || {}).pilot || 'someone'}.`, 5);
      if (mine) { play.lastTag = TAG_GRACE; blip(420); }
      drawRoom();
    },
    onNotice: (p) => addMsg('roomsay', `${p.pilot}: ${p.text}`, 0),
  });
  if (!res.ok) {
    addMsg('room', res.reason === 'no-realtime'
      ? 'The telegraph line to the other pilots could not be opened.'
      : `Could not join the room (${res.reason}).`, 0);
    return;
  }
  live.setHosting();                   // every room is listed, under whoever holds it
  // by now the room may already have told us what it flies — take THAT, not the
  // course we guessed on the way in, or we would shove the room onto our own
  const settled = TRACKS.find((x) => x.id === live.roomInfo().trackId) || t;
  if (currentLocation !== settled.location) loadWorld(settled.location);
  startTrack(settled);
  race.state = 'idle';
  setCenter(`Room ${code}`, hosting
    ? (listed
      ? `Your room is on the list for anyone to join — the code is ${code}. `
      : `Your room is off the list: give out the code ${code} and nobody else can find it. `)
      + 'Press Enter — or GO — when the room is ready to fly.'
    : 'Press Enter — or GO — when the room is ready to fly.');
  drawRoom();
  buildMenuButtons();
}

// ---------------------------------------------------------------- the fault book
// A pilot's report goes to the same office as the records, and appears only
// when that office is reachable: with no keys configured there is nowhere to
// send it, so the button is never built.

/** Everything worth knowing that a pilot should not have to type out. */
function faultState() {
  const info = live.inRoom() ? live.roomInfo() : null;
  const cfg = net.config();
  const hud = (id) => (document.getElementById(id) || {}).textContent || null;
  const st = {
    page: { href: location.href, ua: navigator.userAgent, lang: navigator.language,
      w: innerWidth, h: innerHeight, dpr: +Number(devicePixelRatio).toFixed(2),
      visible: document.visibilityState, touch: 'ontouchstart' in window },
    instruments: { alt: hud('alt'), speed: hud('spd'), throttle: hud('thr'), wind: hud('wind') },
    ui: { menu: menuOpen, tab: menuTab, camera: CAM_NAMES[camMode],
      onScreenControls: document.body.classList.contains('touch'),
      photograph: document.body.classList.contains('photo'), sound: !muted },
    course: track ? { id: track.id, name: track.name, laps: track.laps,
      custom: !!track.custom, historic: !!track.historic } : null,
    race: { state: race.state, t: +race.t.toFixed(2), gate: race.gate, counting: +race.count.toFixed(1) },
    scenario: scenario ? scenario.id : null,
    room: info ? { code: info.code, trial: info.trackId, aboard: live.roster().length,
      holding: live.isHost(), watching: live.spectating() } : null,
    office: { url: cfg ? cfg.url : null },
    faults: faultLog,
  };
  if (ship) {
    st.ship = { id: currentShip, place: currentLocation,
      x: +ship.pos.x.toFixed(1), y: +ship.pos.y.toFixed(1), z: +ship.pos.z.toFixed(1),
      yaw: +ship.yaw.toFixed(2), pitch: +ship.pitch.toFixed(2),
      throttle: +ship.throttle.toFixed(2), gas: Math.round(ship.gas),
      landed: !!ship.landed, wrecked: !!ship.wrecked };
  }
  return st;
}

/**
 * A picture of the view. The drawing buffer is not preserved between frames,
 * so render and read it in the same tick — a moment later it is blank.
 */
function viewPicture(maxW = 1280) {
  try {
    composer.render();
    const src = renderer.domElement;
    const sc = Math.min(1, maxW / src.width);
    if (sc >= 1) return src.toDataURL('image/jpeg', 0.62);
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.62);
  } catch { return null; }
}

/**
 * A picture of the whole window, instruments and all — the browser asks the
 * pilot which one to share, so nothing is taken without their say-so.
 */
async function windowPicture(maxW = 1280) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return null;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 }, audio: false, preferCurrentTab: true,
    });
    const v = document.createElement('video');
    v.srcObject = stream; v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 220));      // let a frame arrive
    const sc = Math.min(1, maxW / (v.videoWidth || maxW));
    const c = document.createElement('canvas');
    c.width = Math.round((v.videoWidth || maxW) * sc);
    c.height = Math.round((v.videoHeight || 720) * sc);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.62);
  } catch { return null; } finally {
    if (stream) for (const t of stream.getTracks()) t.stop();
  }
}

/**
 * A picture the pilot chose from their own device — on a telephone that means
 * the camera roll, and it is the only way to show a fault in the instruments or
 * the menu, since getDisplayMedia does not exist on mobile browsers.
 *
 * Phone screenshots run to several megabytes, well past what the table will
 * take, so it is drawn down until it fits: first by size, then by quality.
 */
async function devicePicture(file) {
  if (!file || !/^image\//.test(file.type)) return null;
  let bmp;
  try {
    // from-image so a photograph taken sideways is not sent on its side
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch { return null; }
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  for (const w of [1400, 1100, 850, 640]) {
    const sc = Math.min(1, w / bmp.width);
    c.width = Math.max(1, Math.round(bmp.width * sc));
    c.height = Math.max(1, Math.round(bmp.height * sc));
    g.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.7, 0.55, 0.42]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= net.SHOT_LIMIT) { bmp.close?.(); return url; }
    }
  }
  bmp.close?.();
  return null;                          // nothing we can do; the words still go
}

let bugShot = null, viewShot = null;
function openBugBook() {
  if (!net.enabled()) return;
  const el = document.getElementById('bug');
  toggleMenu(false);
  document.getElementById('board').classList.add('hidden');
  // take the picture NOW, while the pilot is still looking at the fault. Kept
  // apart from bugShot so that choosing a file and changing your mind can put
  // the view back without re-rendering a frame that has since moved on.
  viewShot = viewPicture();
  bugShot = viewShot;
  document.getElementById('bugPicView').checked = true;
  document.getElementById('bugFile').value = '';
  document.getElementById('bugPicName').textContent = '';
  const img = document.getElementById('bugShot');
  img.src = bugShot || '';
  img.style.display = bugShot ? 'block' : 'none';
  document.getElementById('bugNote').textContent = '';
  document.getElementById('bugSend').disabled = false;
  el.classList.remove('hidden');
  document.getElementById('bugBody').focus();
}
function closeBugBook() {
  document.getElementById('bug').classList.add('hidden');
  document.getElementById('bugBody').value = '';
  bugShot = null;
}
function bugBookOpen() { return !document.getElementById('bug').classList.contains('hidden'); }

function wireBugBook() {
  if (!net.enabled()) return;
  const note = document.getElementById('bugNote');
  const send = document.getElementById('bugSend');
  const img = document.getElementById('bugShot');
  const view = document.getElementById('bugPicView');
  const win = document.getElementById('bugPicWin');
  const fromFile = document.getElementById('bugPicFile');
  const none = document.getElementById('bugPicNone');
  const file = document.getElementById('bugFile');
  const name = document.getElementById('bugPicName');

  // no getDisplayMedia on a telephone: don't offer what cannot be done there
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    document.getElementById('bugPicWinRow').classList.add('hidden');
  }

  const preview = (url) => { img.src = url || ''; img.style.display = url ? 'block' : 'none'; };
  view.onchange = () => { if (view.checked) { bugShot = viewShot; preview(bugShot); } };
  none.onchange = () => { if (none.checked) preview(null); };
  win.onchange = async () => {
    if (!win.checked) return;
    note.textContent = 'waiting on the browser…';
    const shot = await windowPicture();
    note.textContent = shot ? '' : 'the browser gave nothing back';
    if (!shot) { view.checked = true; bugShot = viewShot; preview(bugShot); return; }
    bugShot = shot;
    preview(shot);
  };
  // the picker is opened by our own button so it can be styled like the rest
  document.getElementById('bugPicChoose').onclick = () => { fromFile.checked = true; file.click(); };
  fromFile.onchange = () => { if (fromFile.checked && !file.files.length) file.click(); };
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    fromFile.checked = true;
    name.textContent = 'reading…';
    const url = await devicePicture(f);
    if (!url) {
      name.textContent = 'that picture could not be read';
      view.checked = true; bugShot = viewShot; preview(bugShot);
      return;
    }
    name.textContent = `${f.name.slice(0, 28)} · ${Math.round(url.length / 1400)} KB`;
    bugShot = url;
    preview(url);
  };
  document.getElementById('bugCancel').onclick = closeBugBook;
  const round = document.getElementById('btnBug');
  round.style.display = 'flex';        // an office to write to: show the button
  round.onclick = () => (bugBookOpen() ? closeBugBook() : openBugBook());
  send.onclick = async () => {
    const body = document.getElementById('bugBody').value;
    if (!body.trim()) { note.textContent = 'a word about it first'; return; }
    send.disabled = true;
    note.textContent = 'sending…';
    const shot = none.checked ? null : bugShot;
    const r = await net.submitBug({ body, state: faultState(), shot });
    if (r.ok) {
      closeBugBook();
      addMsg('bug', r.dropped
        ? 'Your report is filed — the picture was too large to send with it.'
        : 'Your report is filed. Thank you.', 0);
    } else {
      send.disabled = false;
      note.textContent = net.phrase(r.reason);
    }
  };
}

// FILING A FAULT FROM INSIDE THE HEADSET.
//
// The fault book is a DOM panel with a textarea, which does not exist in WebXR
// — and opening it took a picture, which means reading back the canvas while
// an immersive session owns it. On a Quest that ends the browser: "bug report
// causes oculus browser to crash".
//
// So from a headset the FAUTE button files straight away: no panel, no
// textarea, and NO PICTURE. The state that rides with every report — ship,
// place, position, gas, throttle — is the useful half of a fault report
// anyway, and it is exactly the half a pilot in a headset cannot type.
async function fileFaultFromVR() {
  addMsg('bug', 'Filing a fault from the basket…', 0);
  const r = await net.submitBug({
    body: 'Looks wrong here. (Filed from the headset — no picture, and no '
      + 'words: see the state for where and what.)',
    state: faultState(), shot: null,
  });
  addMsg('bug', r.ok ? 'Your report is filed. Thank you.'
    : 'The telegraph office would not take it: ' + net.phrase(r.reason), 0);
  if (vr.rumble) vr.rumble(r.ok ? 0.6 : 0.2, 70);
}

// ---------------------------------------------------------------- world records
// The ledger is worth seeing while you fly, not only when you go looking for
// it: this keeps the standing record for a course-and-class to hand, fetched
// once and refreshed when it could have changed.
const wrCache = new Map();          // "track|ship" -> { t, pilot } | null
const wrPending = new Set();
function wrKeyFor(trackId, shipId) { return `${trackId}|${shipId}`; }
function worldRecord(trackId, shipId) { return wrCache.get(wrKeyFor(trackId, shipId)); }

function fetchRecord(trackId, shipId, then) {
  if (!net.enabled() || !trackId || !shipId) return;
  const key = wrKeyFor(trackId, shipId);
  if (wrPending.has(key)) return;
  wrPending.add(key);
  net.leaderboard(trackId, shipId, { limit: 1 }).then((res) => {
    wrPending.delete(key);
    if (res.ok) {
      wrCache.set(key, res.rows.length ? { t: res.rows[0].t, pilot: res.rows[0].pilot } : null);
      then?.();
    }
  }).catch(() => wrPending.delete(key));
}
function forgetRecord(trackId, shipId) { wrCache.delete(wrKeyFor(trackId, shipId)); }

// ---------------------------------------------------------------- record office
// Everything below is inert when no Supabase project is configured: the menu
// entries are never built, and nothing else calls into net.js.
const boardEl = document.getElementById('board');
let boardCtx = null;   // { trackId, shipId|null, today }

function closeBoard() { boardEl.classList.add('hidden'); }
function boardOpen() { return !boardEl.classList.contains('hidden'); }

function boardTrackFor() {
  if (track && !track.historic && !track.custom) return track;
  return TRACKS.find((t) => t.location === currentLocation) || TRACKS[0];
}

async function showBoard(trackId, shipId, today) {
  boardCtx = { trackId, shipId, today };
  const t = TRACKS.find((x) => x.id === trackId);
  boardEl.classList.remove('hidden');
  toggleMenu(false);
  document.getElementById('boardTitle').textContent = t ? t.name : 'The Record Office';
  const scope = shipId ? SHIPS[shipId].name : 'all classes';
  document.getElementById('boardSub').textContent =
    `${scope}${today ? ' · flown on today’s wind' : ' · all time'} — consulting the ledger…`;
  const rowsEl = document.getElementById('boardRows');
  rowsEl.innerHTML = '';
  renderBoardButtons();

  const res = await net.leaderboard(trackId, shipId, { today });
  if (!boardOpen() || boardCtx.trackId !== trackId) return;   // pilot moved on
  document.getElementById('boardSub').textContent =
    `${scope}${today ? ' · flown on today’s wind' : ' · all time'}`;
  if (!res.ok) {
    rowsEl.innerHTML = `<tr><td colspan="4">${net.phrase(res.reason)}</td></tr>`;
    return;
  }
  if (!res.rows.length) {
    rowsEl.innerHTML = '<tr><td colspan="4">No times on the books yet — set the first.</td></tr>';
    return;
  }
  const me = net.pilotName();
  res.rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.pilot === me) tr.className = 'mine';
    const seal = r.verified ? ' <span class="seal" title="verified by the Commission">✓</span>' : '';
    tr.innerHTML = `<td class="pos">${i + 1}</td><td>${escapeHtml(r.pilot)}${seal}</td>`
      + `<td class="sh">${SHIPS[r.ship_id] ? SHIPS[r.ship_id].name.replace('Santos-Dumont ', '') : r.ship_id}</td>`
      + `<td class="tm">${fmt(r.t)}</td><td></td>`;
    const btn = document.createElement('button');
    btn.textContent = 'race it';
    btn.onclick = () => raceWorldGhost(r);
    tr.lastElementChild.appendChild(btn);
    rowsEl.appendChild(tr);
  });
}

function renderBoardButtons() {
  const el = document.getElementById('boardBtns');
  el.innerHTML = '';
  const add = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label; b.onclick = fn; el.appendChild(b);
  };
  add(boardCtx.shipId ? `Class: ${SHIPS[boardCtx.shipId].name}` : 'Class: all',
    () => showBoard(boardCtx.trackId, boardCtx.shipId ? null : currentShip, boardCtx.today));
  add(boardCtx.today ? 'Today’s wind' : 'All time',
    () => showBoard(boardCtx.trackId, boardCtx.shipId, !boardCtx.today));
  add('Other courses', () => {
    const i = TRACKS.findIndex((x) => x.id === boardCtx.trackId);
    const nx = TRACKS[(i + 1) % TRACKS.length];
    showBoard(nx.id, boardCtx.shipId, boardCtx.today);
  });
  add('Close', closeBoard);
}

async function raceWorldGhost(row) {
  addMsg('wg', 'Sending for the record-holder’s barograph…', 0);
  const g = await net.fetchGhost(row.id);
  if (!g) { addMsg('wg', 'That trace could not be fetched.', 0); return; }
  const t = TRACKS.find((x) => x.id === boardCtx.trackId);
  if (!t) return;
  closeBoard();
  if (currentLocation !== t.location) loadWorld(t.location);
  if (g.ship && SHIPS[g.ship] && ship.landed) spawnShip(g.ship);
  chaseGhost = {
    trackId: t.id,
    ghost: { t: g.t, dt: g.dt || GHOST_DT, splits: g.splits, p: g.p,
      pilot: g.pilot, ship: g.ship, foreign: true },
  };
  startTrack(t);
  updateGhostMesh();
  setCenter(t.name, `${g.pilot} flies this course in ${fmt(g.t)} — chase them.`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// after a personal best, offer it to the record office (never blocks the game)
async function submitBest(t, run) {
  if (!net.enabled() || t.historic || t.custom) return;
  if (!net.pilotName()) {
    addMsg('sub', 'Sign the register (menu → Pilot) to send times to the record office.', 0);
    return;
  }
  const res = await net.submitTime({ trackId: t.id, shipId: currentShip, run });
  if (!res.ok) { addMsg('sub', net.phrase(res.reason), 0); return; }
  const rank = res.rank || await net.rankOf(t.id, currentShip, run.t);
  const took = rank === 1;
  addMsg('sub', rank
    ? (took ? `The world record is YOURS on ${t.name} — ${fmt(run.t)}.`
      : `Time entered in the ledger — ${ordinal(rank)} in the ${SHIPS[currentShip].name} class.`)
    : 'Time entered in the ledger.', 0);
  // the centre notice says where you stand, and the record line updates at once
  forgetRecord(t.id, currentShip);
  fetchRecord(t.id, currentShip);
  if (rank && race.state === 'done' && track && track.id === t.id) {
    const big = document.getElementById('centerBig').textContent;
    const sub = document.getElementById('centerSub').textContent;
    setCenter(big, sub + (took ? ' — and the world record with it!' : ` — ${ordinal(rank)} in the world.`));
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function resetShip() {
  ship.reset(new THREE.Vector3(world.padPos.x, restAt(world.padPos.x, world.padPos.z), world.padPos.z), 0);
  endTrack();
  clearRivals();
  editing = null;
  if (scenRing) scenRing.visible = false;
  if (scenBeacon) scenBeacon.visible = false;
  clearRoute();
  setCenter('', '');
  seen.clear();
}

// ---------------------------------------------------------------- race
// the historic trial's record, kept per city (their limits differ: the Deutsch
// half-hour at Paris and Monaco, the ten minutes of the St. Louis prize)
// era-tagged too: the Deutsch half-hour is a different feat on a slower ship
function bestRaceKey() { return `myairships_best_${currentLocation}_e${BOARD_ERA}`; }
(function migrateOldBest() {
  const old = store.get('myairships_best');
  if (old && !store.get('myairships_best_paris')) {
    store.set('myairships_best_paris', old);   // it can only have been Paris
    store.del('myairships_best');
  }
})();
/**
 * The motor's caprice, drawn from a seeded book rather than from Math.random.
 * Keyed on the day, the course and the class of ship, so every pilot flying the
 * Deutsch in a No. 6 today meets the same faltering at the same points — and a
 * ghost replays with the motor trouble it actually had.
 */
let raceRng = mulberry32(1);
function seedRace(trackId, shipId) {
  const key = `${skyDaySeed()}|${trackId}|${shipId}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  raceRng = mulberry32(h >>> 0);
}

const race = { state: 'idle', t: 0, gate: 0, count: 0, sputterAt: 0, lastResult: null,
  best: +(store.get('myairships_best_paris') || 0) };

function tryStartRace() {
  document.getElementById('help').classList.add('hidden');
  // A room game is an activity, and "Let go all!" would abandon it for a race
  // nobody asked for — which is what happened to a pilot in the middle of tag.
  if (play.id && !track) {
    const g = gameById(play.id);
    addMsg('roomgame', `You are playing ${g ? g.name : play.id} — “Let go all!” would start a race instead. `
      + 'Call the game off from the menu first.', 5);
    return;
  }
  // in a room, Enter is the call to the whole room, not a private start
  if (live.inRoom() && track && !track.historic) {
    if (!live.isHost()) {
      addMsg('roomgo', 'The room is called away by its host — wait for their signal.', 4);
      return;
    }
    roomResults = [];
    live.callStart(8, track.id);
    startTrack(track);
    placeOnGrid(track, live.gridOrder().map((r) => r.key));
    race.count = 8;
    addMsg('roomgo', 'You call “Let go all!” — the room is away in eight.', 0);
    return;
  }
  // In a lap trial Enter is instant restart — which is exactly what you want
  // between attempts and exactly what you do not want mid-flight, where one
  // stray press throws away the lap you were on. Ask, once.
  if (track && !track.historic && race.state !== 'idle') {
    const now = performance.now();
    if (race.state === 'run' && (!tryStartRace._askedAt || now - tryStartRace._askedAt > 4000)) {
      tryStartRace._askedAt = now;
      addMsg('restart', 'You are flying the trial — press GO again to throw this run away and start afresh.', 4);
      return;
    }
    tryStartRace._askedAt = 0;
    startTrack(track);
    return;
  }
  if (race.state !== 'idle' || ship.wrecked) return;
  if (ship.pos.distanceTo(world.startRing) > 150) {
    // No ring to point at any more, so say the place instead of the marker.
    addMsg('far', 'Convoke the Commission over the aerodrome, where the ground crew are waiting.', 6);
    return;
  }
  startTrack(historicTrack());
}

function raceTargetPos() {
  return race.gate < gateRings.length ? gateRings[race.gate].position : world.startRing;
}

function showSplit() {
  const i = race.splits.length - 1;
  const elS = document.getElementById('split');
  if (ghostBest && ghostBest.splits && ghostBest.splits[i] != null) {
    const d = race.t - ghostBest.splits[i];
    elS.textContent = (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1) + 's';
    elS.className = d <= 0 ? 'good' : 'bad';
  } else {
    elS.textContent = fmt(race.t);
    elS.className = '';
  }
  splitUntil = performance.now() + 2600;
}

function updateRace(dt) {
  const s = race.state;
  // The Deutsch course's rings are rebuilt whenever a track ends, so during a
  // scenario that is not a race they hung in the sky — the grey hoop by the
  // Tower with nothing to do with the mission in hand.
  // Rings belong to the course in hand and to nothing else.
  //
  // endTrack() rebuilds the historic gates every time a track finishes, so they
  // exist whether or not anything is being flown — which left the Deutsch
  // Prize's turn ring hanging in the air beside the Eiffel Tower during a
  // scenario, during a room game, and in plain free flight. The test is simply
  // whether there IS a course: a track being flown, or one being drawn in the
  // editor. Not "is something else going on", which is what this used to ask
  // and which free flight answered no to.
  const showGates = !!track || !!editing;
  for (const r of gateRings) r.visible = showGates;
  // The gold start ring goes with them. It marks where the Deutsch run begins
  // and ends, and it belongs to that run — hanging over the aerodrome in free
  // flight it is one more hoop in the sky with nothing to do with what the
  // pilot is doing. It comes back when the historic course is actually called.
  startRing.visible = (!!track && !!track.historic)
    || (!!scenario && !!scenario.usesStartRing);   // III sends the pilot to it
  const go = document.getElementById('btnGo');
  if (go) go.classList.toggle('off', !track && !!play.id);
  if (!track) return;
  const gates = track.gates;
  const running = s === 'run';
  const homeward = track.historic && race.gate >= gates.length;
  startRing.material.color.set(!running || homeward ? 0xd9b24a : 0x8a8a8a);
  gateRings.forEach((r, i) => gateTint(r, running && i === race.gate ? 0xd9b24a : 0x8a8a8a));
  const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.05;
  startRing.scale.setScalar(running && homeward ? pulse : 1);
  gateRings.forEach((r, i) => r.scale.setScalar(r.userData.s0 * (running && i === race.gate ? pulse : 1)));

  if (s === 'count') {
    race.count -= dt;
    const n = Math.ceil(race.count);
    setCenter(n > 0 ? String(n) : '“Let go all!”', '');
    if (race.count <= 0) {
      race.state = 'run'; race.t = 0; race.gate = 0; race.lap = 1; race.lastResult = null; race._gateS = undefined;
      if (track.historic && world.rivalSpecs) {
        clearRivals();
        world.rivalSpecs.forEach((id, i) => rivals.push(new Rival(scene, id, world, 5 + i * 8)));
        addMsg('rivals', 'The rival dirigibles are away behind you!', 0);
      }
      setTimeout(() => { if (race.state === 'run') setCenter('', ''); }, 1200);
    }
  } else if (s === 'run') {
    race.t += dt;
    // "…describe a closed curve in such a way that the axis of the Eiffel Tower
    // should be within the interior of the circuit" (the Deutsch foundation).
    // Summing the bearing swept about the Tower gives exactly that: a closed
    // path encloses the axis if and only if the total comes to a full turn.
    if (world.towerPos) {
      const az = Math.atan2(ship.pos.z - world.towerPos.z, ship.pos.x - world.towerPos.x);
      if (race._az !== null) {
        let d = az - race._az;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        race.winding += d;
      }
      race._az = az;
    }
    // the finish (historic homeward leg) stays a generous radius check
    if (homeward) {
      if (ship.pos.distanceTo(world.startRing) < 30) { finishRace(); }
    } else {
      // DIRECTIONAL gates: you must cross the ring's plane the right way,
      // inside its radius — no sideways or backwards triggers
      const ring = gateRings[race.gate];
      const gn = new THREE.Vector3(Math.sin(ring.rotation.y), 0, Math.cos(ring.rotation.y));
      const rel = ship.pos.clone().sub(ring.position);
      const sd = rel.dot(gn);
      const gg = gates[race.gate];
      // `off` is how far out you crossed, as a fraction of the opening: under 1
      // is through it, and under 3 is close enough to be worth telling you.
      const _go = gateOffset(rel, gg, ring.rotation.y);
      const off = _go.off, missedWide = _go.missedWide;
      const inside = off < 1;
      const prevSd = race._gateS;
      race._gateS = sd;
      if (prevSd !== undefined && prevSd < 0 && sd >= 0) {
        if (inside) {
          // "Ten times in succession I made the circuit of Longchamps, stopping
          // each time at a point designed beforehand" — on a stopping trial the
          // station gate only counts if she is very nearly at rest
          if (track.stops && race.gate === 0 && ship.vel.length() > 3) {
            addMsg('stop', 'You must STOP at the point designed beforehand — come round and halt in the ring.', 4);
            race._gateS = undefined;
            return;
          }
          race._gateS = undefined;
          blip(620 + race.gate * 60);
          race.splits.push(race.t);
          if (!track.historic) showSplit();
          race.gate++;
          if (live.inRoom()) { live.callGate(race.gate, race.lap, race.t); drawRoom(); }
          if (race.gate === gates.length) {
            if (track.historic && race.lap < track.laps) {
              // another circuit of the pylons before the run for home
              race.lap++; race.gate = 0;
              addMsg('lap', `Lap ${race.lap} of ${track.laps} — round again!`, 0);
            } else if (track.historic) {
              addMsg('turn', world.hints.turnMsg, 0);
              race.sputterAt = race.t + 10 + raceRng() * 18;
            } else if (race.lap < track.laps) {
              race.lap++; race.gate = 0;
              addMsg('lap', `Lap ${race.lap} of ${track.laps}!`, 0);
            } else { finishRace(); return; }
          } else if (track.historic && gates.length > 1) {
            addMsg('gate', `Pylon ${race.gate} of ${gates.length} rounded!`, 0);
          }
        } else if (missedWide) {
          addMsg('miss', 'Wide of the gate — come round and through the opening.', 4);
        } else if (off < 3) {
          addMsg('miss', 'Missed the gate — come round and through it!', 4);
        }
      }
    }
    if (track.historic && race.sputterAt && race.t > race.sputterAt && !ship.sputtering) {
      ship.sputtering = true; race.sputterAt = 0;
      addMsg('sputter', 'The capricious motor is stopping! Leave the helm — work the levers! (tap F)', 0);
    }
  }
}

function finishRace() {
  flightEnd('finished', { t: +race.t.toFixed(2), laps: track ? track.laps : null });
  race.state = 'done';
  const t = race.t;
  if (track.historic) {
    // the Commission checks the shape of the course as well as the clock
    const encircled = !world.towerPos || Math.abs(race.winding) >= 5.6;   // ~0.89 of a turn
    const won = t <= world.raceLimit && encircled;
    const beatSantos = t <= world.raceRecord;
    const ace = t <= 600;
    const beatRivals = !rivals.some((r) => r.beatPlayer);
    race.lastResult = { won, beatSantos, beatRivals, t };
    if (won && (!race.best || t < race.best)) {
      race.best = t; store.set(bestRaceKey(), String(t));
    }
    let sub;
    if (!encircled) {
      sub = `${fmt(t)} — but the Tower did not lie within your circuit. The Commission cannot allow it. (R to try again)`;
    } else if (!won) sub = `${fmt(t)} — “Errors do not count. I have learned my lesson.” (R to try again)`;
    else {
      sub = `${fmt(t)} — the prize is yours.`;
      if (beatSantos) sub += ' You have outflown Santos-Dumont himself.';
      if (ace && currentLocation !== 'stlouis') sub += ' A pace no dirigible of 1901 could have touched.';
      if (rivals.length) sub += beatRivals ? ' The rival dirigibles trail behind you.' : ' …but a rival crossed first.';
    }
    setCenter(won ? '“Have I won?” — “YES!”' : 'The half-hour is past…', sub);
    return;
  }
  // time trial: record the run, crown a new ghost
  blip(1100); blip(1400);
  // when you are chasing a downloaded ghost it stays on course; your own
  // best still comes from your own ledger, not from the rival's trace
  const rival = ghostBest && ghostBest.foreign ? ghostBest : null;
  let prev = ghostBest;
  if (rival) { try { prev = JSON.parse(store.get(bestKey(track)) || 'null'); } catch { prev = null; } }
  const run = { t, splits: race.splits.slice(), dt: GHOST_DT, p: ghostRec.slice(),
    pilot: net.pilotName(), ship: currentShip };
  const improved = !prev || t < prev.t;
  if (improved) {
    try { store.set(bestKey(track), JSON.stringify(run)); } catch { /* full */ }
    if (!rival) { ghostBest = run; updateGhostMesh(); }
    submitBest(track, run);            // fire and forget; failures are toasts
  }
  if (live.inRoom()) {
    live.callResult(t);
    roomResults = [...roomResults.filter((x) => x.k !== live.seat()),
      { k: live.seat(), pilot: net.pilotName(), t }].sort((a, b) => a.t - b.t);
    drawRoom();
  }
  let sub = improved
    ? (prev ? `New best — ${(prev.t - t).toFixed(1)}s faster! (Enter: again)` : 'First time set — your ghost now flies this course. (Enter: again)')
    : `+${(t - prev.t).toFixed(1)}s off your best of ${fmt(prev.t)}. (Enter: again)`;
  if (live.inRoom() && roomResults.length > 1) {
    const place = roomResults.findIndex((x) => x.k === live.seat()) + 1;
    sub = `${ordinal(place)} of ${roomResults.length} home. ` + sub;
  }
  if (rival) {
    sub = t < rival.t
      ? `You have beaten ${rival.pilot || 'the record-holder'} by ${(rival.t - t).toFixed(1)}s! ` + sub
      : `${(t - rival.t).toFixed(1)}s behind the record-holder. ` + sub;
  }
  setCenter(fmt(t), sub);
}

// ---------------------------------------------------------------- scenarios
/** Where the keel rests at (x, z) — over Monaco that is a hillside, not zero. */
function restAt(x, z) {
  return (world && world.groundAt ? world.groundAt(x, z) : 0) + ship.restHeight();
}

function scenCtx() {
  return {
    ship, world, addMsg, setCenter,
    wind: { x: wind.x, z: wind.z },     // so a scenario can set a pilot upwind
    /**
     * A historical scenario reconstructs ONE AFTERNOON, and one afternoon had
     * its own weather. The daily wind is seeded by the date so that everybody
     * flies the same sky today — which is right for the time trials, where the
     * leaderboard has to be fair — and wrong for a scenario that is trying to
     * reproduce something that happened, because today's sky can make the
     * recorded outcome impossible. Loading any world resets it.
     */
    setWind(x, z) { dailyWind.set(x, 0, z); wind.set(x, 0, z); },
    // `y` is HEIGHT ABOVE THE GROUND in all three of these, which is what every
    // number in scenarios.js already meant: they were written against a world
    // whose ground was a plane at zero. Now that Paris has hills, reading them
    // as absolute would spawn the No. 9 seventeen metres over the Cascade lawn
    // and sink the Trocadero ring into the Chaillot bluff.
    place(x, y, z, yaw) {
      const gy = world && world.groundAt ? world.groundAt(x, z) : 0;
      ship.reset(new THREE.Vector3(x, gy + y, z), yaw);
      ship.landed = gy + y <= restAt(x, z) + 0.8;
    },
    // a line of faint hoops marking the way, each fading out as it is passed
    setRoute(points) {
      clearRoute();
      for (const p of points) {
        const r = makeRing(0x6fc48a);
        r.position.copy(p);
        if (world && world.groundAt) r.position.y += world.groundAt(p.x, p.z);
        r.material.opacity = 0.34;
        r.scale.setScalar(0.75);
        routeRings.push(r);
      }
    },
    setZone(pos0, r) {
      const pos = pos0.clone();
      if (world && world.groundAt) pos.y += world.groundAt(pos.x, pos.z);
      // remembered, so a scenario's tick can ASK where its ring is instead of
      // repeating the coordinates. Repeating them meant that when the places
      // moved onto their true positions, rings moved and the checks did not:
      // you could land inside the green ring and be told you had missed.
      scenZone = { pos: pos.clone(), r };
      scenRing.visible = true; scenRing.position.copy(pos); scenRing.scale.setScalar(r / 24);
      scenBeacon.visible = true;
      scenBeacon.position.set(pos.x, pos.y + 75, pos.z);
      scenBeacon.scale.set(r / 24, 1, r / 24);
    },
    clearZone() { scenZone = null; scenRing.visible = false; scenBeacon.visible = false; clearRoute(); },
    /** How far the ship is from the ring, on the flat, and how big it is. */
    zoneDist: () => (scenZone ? Math.hypot(ship.pos.x - scenZone.pos.x, ship.pos.z - scenZone.pos.z) : Infinity),
    zoneR: () => (scenZone ? scenZone.r : 0),
    inZone() { return this.zoneDist() < this.zoneR(); },
    startRace() { startTrack(historicTrack()); },
    raceResult: () => (race.state === 'done' ? race.lastResult : null),
    complete: scenComplete,
    fail: scenFail,
  };
}

function startScenario(def) {
  flightBegin('scenario', def.id);
  toggleMenu(false);
  clearRoute();
  if (currentLocation !== def.location) loadWorld(def.location);
  endTrack();
  editing = null;
  clearRivals();
  seen.clear();
  spawnShip(def.shipId);
  scenario = def;
  def._failed = false;
  // Back to today's sky FIRST. A scenario may reconstruct its own afternoon
  // with ctx.setWind — VII does — and loadWorld only runs when the location
  // changes, so without this the next Paris scenario would inherit the weather
  // of 13 July 1901 and never know why it could not be flown.
  dailyWind.copy(todaysWind);
  wind.copy(dailyWind);
  def.setup(scenCtx());
  // a scenario that is not a race shows no race rings — hide them at once
  // rather than waiting for the next frame to notice
  if (!track) { for (const r of gateRings) r.visible = false; startRing.visible = false; }
  addMsg('brief', def.brief, 0);
}

function scenComplete(text) {
  flightEnd('complete');
  const done = store.json('myairships_scen', {}) || {};
  done[scenario.id] = true;
  store.set('myairships_scen', JSON.stringify(done));
  scenRing.visible = false;
  if (scenBeacon) scenBeacon.visible = false;
  clearRoute();
  scenario = null;
  setCenter('Scenario complete', `${text}  (Esc for the menu)`);
}

function scenFail(text) {
  flightEnd('failed');
  scenario._failed = true;
  setCenter('Not this time', `${text}  (R to retry)`);
}

function fmt(t) {
  const m = Math.floor(t / 60), s = (t % 60);
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------- collisions
// Multi-sphere hull: 5 stations along the pitched axis with ellipse-tapered radii,
// restitution + impact torque (off-center hits swing the ship), per-tree contacts.
const HULL_T = [-0.85, -0.45, 0, 0.45, 0.85];
function hullPoints() {
  const cp = Math.cos(ship.pitch), sp = Math.sin(ship.pitch);
  const fwdP = new THREE.Vector3(Math.cos(ship.yaw) * cp, sp, -Math.sin(ship.yaw) * cp);
  const half = ship.spec.envelope.length / 2;
  const b = ship.spec.envelope.diameter / 2;
  const pts = HULL_T.map(t => ({
    q: ship.pos.clone().addScaledVector(fwdP, half * t),
    r: b * Math.sqrt(Math.max(0.15, 1 - t * t)) + 0.6,
    s: half * t,
  }));
  // the keel and basket hang far below the gas bag — they hit things too
  const drop = ship.spec.keel.drop;
  const kHalf = ship.spec.keel.length * 0.3;
  for (const t of [-1, 0, 1]) {
    const q = ship.pos.clone().addScaledVector(fwdP, kHalf * t);
    q.y -= drop - 0.4;
    pts.push({ q, r: 1.5, s: kHalf * t, keel: true });
  }
  return pts;
}

function resolveHit(q, n, pen, s, hard, keel) {
  ship.pos.addScaledVector(n, pen);
  const vn = ship.vel.dot(n);
  let j = 0;
  if (vn < 0) {
    j = -vn;
    ship.vel.addScaledVector(n, -vn * 1.5); // restitution 0.5
    ship.applyImpact(s, n, j);
  }
  // A crash has to mean something to the ship doing the crashing. A fixed
  // 8.5 m/s threshold was faster than half the fleet can fly — the No. 9 tops
  // 6.5 and so could never break herself on anything. Judge it against her own
  // best speed, and remember the keel is pine and piano wire while the envelope
  // is silk that can be brushed along a wall.
  const top = Math.max(4, shipTopSpeed(ship.spec));
  const wreckAt = keel ? Math.max(2.4, top * 0.45) : Math.max(4.5, top * 0.75);
  if (hard && j > wreckAt) {
    ship.wreck('building');
    setCenter(keel ? 'The keel smashes against the wall!' : 'Wrecked on the housetops!',
      '“Chimney-pots that threaten to pierce its belly…” (R)');
    return true;
  }
  if (hard && j > (keel ? 0.7 : 1.2)) {
    if (keel) {
      // one bite per contact, not one per frame: a graze used to chew the
      // motor to half in a second of touching
      const now = performance.now();
      if (!ship._scrapeAt || now - ship._scrapeAt > 500) {
        ship._scrapeAt = now;
        ship.motorHealth = Math.max(0.25, ship.motorHealth - j * 0.06);
      }
      addMsg('scrapek', 'The basket grinds along the masonry — something in the keel gives!', 8);
    } else {
      ship.gas = Math.max(0, ship.gas - Math.min(6, j * 0.9));
      addMsg('scrape', 'The chimney-pots claw at the envelope! Hydrogen bleeds away…', 8);
    }
    return false;
  }
  // A touch too light to cost anything used to say nothing at all, and the ship
  // was simply pushed back out of the wall — so a pilot could not tell whether
  // they had hit the building or merely come near it. Say so, seldom.
  if (hard) {
    const now = performance.now();
    if (!ship._brushAt || now - ship._brushAt > 2500) {
      ship._brushAt = now;
      addMsg('brush', keel
        ? 'The basket touches the wall — no harm in it.'
        : 'Silk brushes the stonework — no harm in it.', 5);
    }
  }
  return false;
}

function checkCollisions(dt) {
  if (ship.wrecked) return;
  const pts = hullPoints();

  // Eiffel Tower — the one unsurvivable impact (A3, Paris only).
  // Below the first platform she is four legs and an open arch: a daring
  // pilot can fly THROUGH her. Above, the lattice is solid death.
  if (world.towerPos) {
    for (const { q, r } of pts) {
      const dx = q.x - world.towerPos.x, dz = q.z - world.towerPos.z;
      let hit = false;
      if (q.y < 52) {
        const off = 52 - (q.y / 100) * 31;   // leg corners taper with height
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            if (Math.hypot(q.x - (world.towerPos.x + sx * off), q.z - (world.towerPos.z + sz * off)) < 7 + r) hit = true;
          }
        }
      } else {
        hit = Math.hypot(dx, dz) < towerRadiusAt(q.y) + r;
      }
      if (hit) {
        ship.wreck('tower');
        setCenter('Dashed against the Tower!', '“The impact would certainly burst my balloon, and I should fall like a stone.” (R)');
        return;
      }
    }
  }

  // the sea — landing in it ends the experiments (Ch. XX, Monaco)
  if (world.isWater(ship.pos.x, ship.pos.z) && ship.pos.y < ship.spec.keel.drop + 1.6) {
    ship.wreck('water');
    setCenter('Down into the bay!', '“Balloon, keel, and motor were successfully fished up the next day…” (R)');
    return;
  }

  // Buildings: the ORIENTED box, not the axis-aligned one.
  //
  // `w`/`d` are the world-axis extents — a bounding box round a turned
  // building — while `rw`/`rd`/`ry` are the building itself. Testing against
  // w/d meant a block of 8 x 29 m standing at 26 degrees had a 30 x 20 m
  // collider: 147% too much area, and a pilot "about to go thru the ring"
  // took a keel smash from a wall ten metres away from any masonry. He
  // diagnosed it himself — "make sure colliders and buildings are the same
  // bounding box" — and with twelve thousand surveyed footprints standing at
  // every angle of the compass it had stopped being a rare annoyance.
  //
  // So the hull point is taken into the building's own frame, clamped there,
  // and brought back. `b.y` is the ground it stands on, so the box runs from
  // that up to `b.top`, not from zero.
  for (const b of world.buildings) {
    if (Math.abs(b.x - ship.pos.x) > 90 || Math.abs(b.z - ship.pos.z) > 90) continue;
    const ry = b.ry || 0;
    const hw = (b.rw !== undefined ? b.rw : b.w) / 2;
    const hd = (b.rd !== undefined ? b.rd : b.d) / 2;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const base = b.y || 0;
    for (const { q, r, s, keel } of pts) {
      if (q.y > b.top + r) continue;
      // world -> the building's own axes (the mesh is built with rotation.y)
      const px = q.x - b.x, pz = q.z - b.z;
      const lx = px * cs - pz * sn, lz = px * sn + pz * cs;
      const kx = Math.max(-hw, Math.min(hw, lx));
      const kz = Math.max(-hd, Math.min(hd, lz));
      const cy = Math.min(b.top, Math.max(base, q.y));
      // …and back again
      const cx = b.x + kx * cs + kz * sn;
      const cz = b.z - kx * sn + kz * cs;
      const d = Math.hypot(q.x - cx, q.y - cy, q.z - cz);
      if (d < r) {
        const n = d > 0.001
          ? new THREE.Vector3(q.x - cx, q.y - cy, q.z - cz).divideScalar(d)
          : new THREE.Vector3(0, 1, 0);
        if (resolveHit(q, n, r - d, s, true, keel)) return;
      }
    }
  }

  // trees — soft, springy canopy (A2: "a kind of insurance")
  for (const t of world.trees) {
    if (Math.abs(t.x - ship.pos.x) > 45 || Math.abs(t.z - ship.pos.z) > 45) continue;
    const cy = t.s * 1.15, cr = t.s * 1.2;
    for (const { q, r, s } of pts) {
      const d = Math.hypot(q.x - t.x, q.y - cy, q.z - t.z);
      if (d < r + cr) {
        const n = d > 0.001
          ? new THREE.Vector3(q.x - t.x, q.y - cy, q.z - t.z).divideScalar(d)
          : new THREE.Vector3(0, 1, 0);
        // soft: partial push, gentle slow, no gas loss
        ship.pos.addScaledVector(n, (r + cr - d) * 0.35 * Math.min(1, dt * 30));
        ship.vel.multiplyScalar(Math.pow(0.5, dt));
        const vn = ship.vel.dot(n);
        if (vn < -3) { ship.vel.addScaledVector(n, -vn * 0.8); ship.applyImpact(s, n, -vn * 0.4); }
        addMsg('treetops', 'Caught in the tree-tops — “a kind of insurance against more terrible accidents.”', 22);
      }
    }
  }
}

// ---------------------------------------------------------------- messages & quotes
const msgBox = document.getElementById('messages');
const lastMsg = new Map();
function addMsg(key, text, cooldown = 10) {
  const now = performance.now() / 1000;
  if (lastMsg.has(key) && now - lastMsg.get(key) < cooldown) return;
  lastMsg.set(key, now);
  const div = document.createElement('div');
  div.className = 'msg';
  div.textContent = text;
  msgBox.appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 600); }, 5200);
  while (msgBox.children.length > 3) msgBox.firstChild.remove();
}

let centerSetAt = 0;
function setCenter(big, sub) {
  document.getElementById('centerBig').textContent = big;
  document.getElementById('centerSub').textContent = sub;
  const c = document.getElementById('center');
  c.classList.remove('parked');
  c.style.top = '';               // hand the position back to the stylesheet
  centerSetAt = performance.now();
}

const seen = new Set();
function once(key, text) { if (!seen.has(key)) { seen.add(key); addMsg(key, text, 0); } }

const EVENT_TEXT = {
  shadow:   ['shadow', 'A cloud passes before the sun — its shadow cools the gas, and the balloon wrinkles and sinks…', 30],
  valves:   ['valves', 'The valves hiss, easing a dangerous pressure. Precious hydrogen is lost.', 20],
  sagWarn:  ['sagWarn', 'The envelope sags — the wires reach toward the propeller! Throttle down!', 12],
  fouling:  ['fouling', 'The propeller is cutting and tearing at the wires!', 6],
  rearing:  ['rearing', 'The gas rushes to the up-pointed stem — the ship rears like an aerial steed!', 15],
  // text chosen per ship at show time — sand goes over the side, water runs out
  ballast:  ['ballast', null, 2],
  noballast:['noballast', null, 8],
  treetops: ['treetops', 'Caught in the tree-tops — “a kind of insurance against more terrible accidents.”', 22],
  roughLanding: ['rough', 'A rough landing — the keel groans.', 8],
  motorFixed: ['motorfixed', 'The motor takes heart and rumbles on!', 4],
  fuelOut: ['fuelout', 'The petroleum is spent! The motor dies away — you are a free balloon now.', 0],
  folding: ['folding', 'The balloon is folding in the middle like a pocket knife! Throttle down, level off, drop ballast!', 8],
  pumpFail: ['pumpfail', 'The rotary ventilator has stopped — the air balloon is emptying and she will go slack! (tap F)', 0],
  pumpFixed: ['pumpfixed', 'The ventilator picks up again and the balloon draws taut.', 5],
};

// A sack over the side, or a spigot opened on a brass cylinder in the keel.
// Ch. XI, of the No. 5's new keel: "their two spigots were so arranged that
// they could be opened and shut from my basket by means of two steel wires."
const BALLAST_TEXT = {
  ballast: {
    sand:  'A sack of sand goes over the side.',
    water: 'A spigot opens, and the water runs out of the keel in a bright rope.',
  },
  noballast: {
    sand:  'Not a handful of sand remains.',
    water: 'The cylinders are dry — not a litre left to let go.',
  },
};

function drainEvents() {
  for (const ev of ship.events) {
    if (ev.startsWith('wreck:')) {
      flightEnd('wrecked', { how: ev.slice(6) });
      const r = ev.slice(6);
      if (r === 'hardLanding') setCenter('Wrecked!', '“He who wishes to navigate an air-ship should first practise landings…” (R)');
      continue;
    }
    const e = EVENT_TEXT[ev];
    if (e) addMsg(e[0], e[1] === null ? BALLAST_TEXT[ev][ship.spec.ballast] : e[1], e[2]);
  }
  ship.events.length = 0;
}

function ambientQuotes() {
  const p = ship.pos;
  if (world.isInBois(p.x, p.z) && p.y > 25) once('bois', 'Over the Bois — “an ocean of greenery, soft and safe.”');
  if (world.towerPos) {
    if (p.x > 180 && p.y < 70 && p.y > 20) once('housetops', '“The housetops look so dangerous, with their chimney-pots for spikes.”');
    if (p.distanceTo(world.towerPos) < 320) once('tower', '“The Eiffel Tower was my one danger — yet it was my winning-post!”');
  }
  if (world.isWater(p.x, p.z) && p.y < 120 && ship.groundedFrac > 0.1)
    once('maritime', 'The maritime guide rope — “as if in some mysterious way its lower end were attached to the waves.”');
  if (ship.groundedFrac > 0.12 && !ship.landed) once('rope', 'Guide-roping — the trailing rope ballasts and unballasts the ship of itself.');
}

// ---------------------------------------------------------------- audio
let audio = null;

/**
 * The state the pilot needs to know about, which is not the same as `muted`:
 *   asleep — there is no sound and only a TAP can start it. Every mobile
 *            browser refuses to run an audio context until a real gesture, and
 *            iOS suspends it again whenever you leave the page. This is why the
 *            motor is sometimes silent from the first moment of a flight.
 *   off    — the pilot switched it off.
 *   on     — running.
 */
function soundState() {
  if (muted) return 'off';
  if (!audio || audio.ctx.state !== 'running') return 'asleep';
  return 'on';
}

const SPK = 'M3.6 9.2h3.1L11.4 5v14L6.7 14.8H3.6z';         // the horn, in all three
const ICONS = {
  on: `<path d="${SPK}" fill="currentColor"/>`
    + '<path d="M14.6 8.6a4.8 4.8 0 0 1 0 6.8M17.2 6a8.4 8.4 0 0 1 0 12"'
    + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  off: `<path d="${SPK}" fill="currentColor"/>`
    + '<path d="M15.2 9.6l5 4.8M20.2 9.6l-5 4.8" fill="none" stroke="currentColor"'
    + ' stroke-width="1.7" stroke-linecap="round"/>',
  asleep: `<path d="${SPK}" fill="currentColor"/>`
    + '<path d="M14.6 8.6a4.8 4.8 0 0 1 0 6.8" fill="none" stroke="currentColor"'
    + ' stroke-width="1.7" stroke-linecap="round"/>'
    + '<circle cx="18.6" cy="12" r="1.5" fill="currentColor"/>',
};
const TITLES = {
  on: 'Sound is on — tap to silence her',
  off: 'Sound is off — tap to let her be heard',
  asleep: 'Tap to wake the sound (your telephone will not start it on its own)',
};

let soundShown = null;
function drawSoundBtn() {
  const b = document.getElementById('btnSound');
  if (!b) return;
  const st = soundState();
  if (st === soundShown) return;                 // only touch the DOM on a change
  soundShown = st;
  b.querySelector('svg').innerHTML = ICONS[st];
  b.title = TITLES[st];
  b.setAttribute('aria-label', TITLES[st]);
  b.classList.toggle('asleep', st === 'asleep');
  b.classList.toggle('off', st === 'off');
}

function wireSound() {
  const b = document.getElementById('btnSound');
  if (!b) return;
  // pointerdown, not click: on iOS the gesture that may resume an audio context
  // is the one being handled, and click can arrive too late to count as one
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const wasAsleep = soundState() === 'asleep';
    initAudio();                                 // create or resume, inside the gesture
    // asleep means she simply is not running: wake her rather than toggling,
    // or a pilot whose sound never started would switch it OFF by trying
    muted = wasAsleep ? false : !muted;
    drawSoundBtn();
    buildMenuButtons();
  });
  drawSoundBtn();

  // Any touch anywhere is also a chance to start her — a pilot who taps the helm
  // before finding the sound button should not have to go looking for it.
  // NOT for the sound button itself: this runs in the capture phase, so it would
  // resume the context before the button's own handler could see that it had
  // been asleep, and the pilot's first tap would silence her instead of starting
  // her.
  const wake = (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#btnSound')) return;
    initAudio();
  };
  addEventListener('pointerdown', wake, { capture: true, passive: true });
  addEventListener('touchend', wake, { capture: true, passive: true });
  // iOS suspends the context when the page goes away and does NOT resume it
  addEventListener('visibilitychange', () => { if (!document.hidden) initAudio(); });
}
function initAudio() {
  // iOS/iPad Safari starts the context suspended, and puts it back to sleep —
  // as 'suspended' or as the WebKit-only 'interrupted' — whenever the page goes
  // away or a call comes in. Resume must happen inside the gesture, and may be
  // needed many times over a flight, so this is safe to call as often as we like.
  if (audio) {
    if (audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;                      // no audio on this browser; fly in silence
  let ctx;
  try { ctx = new Ctor(); } catch { return; }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 50;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 320;
  const gain = ctx.createGain(); gain.gain.value = 0;
  osc.connect(filt).connect(gain).connect(ctx.destination);
  osc.start();
  // wind rush: looped noise through a bandpass, louder with airspeed squared
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.5;
  const windGain = ctx.createGain(); windGain.gain.value = 0;
  noise.connect(bp).connect(windGain).connect(ctx.destination);
  noise.start();
  audio = { ctx, osc, gain, windGain };
}
function updateAudio() {
  drawSoundBtn();                  // the context can suspend itself at any time
  if (!audio) return;
  const h = ship.motorHealth;
  const flicker = ship.sputtering && Math.random() < 0.35 ? 0.15 : 1;
  const target = muted || ship.wrecked || !ship.motorOn ? 0 : ship.throttle * 0.055 * flicker * (0.4 + 0.6 * h);
  audio.gain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.05);
  audio.osc.frequency.setTargetAtTime(42 + 75 * ship.throttle * h, audio.ctx.currentTime, 0.1);
  const spd = ship.vel.length();
  const wt = muted ? 0 : Math.min(0.13, (spd / 17) ** 2 * 0.13);
  audio.windGain.gain.setTargetAtTime(wt, audio.ctx.currentTime, 0.12);
}
// a short chime for gate passes and finishes
function blip(freq) {
  if (!audio || muted) return;
  const { ctx } = audio;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.09, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.25);
}

// ---------------------------------------------------------------- camera
const CAM_NAMES = ['Chase', 'Aboard — the basket', 'Postcard', 'From the Tower'];
const camPos = new THREE.Vector3(-1050, 40, 120);
let bobT = 0;
function updateCamera(dt) {
  // watching, but the pilot you were riding with has gone: hold the view where
  // it is rather than snapping back to your own (hidden) ship
  if (spectate.on && !spectate.ship) return;
  const view = camShip();                       // your ship, or the one you are watching
  const p = view.pos;
  // IN A HEADSET THE POSE IS NOT OURS TO SET. The head's position and rotation
  // come from WebXR; all we place is the basket the head is standing in, and
  // the pilot's own leaning and looking ride on top of that. Anything else here
  // would fight the headset and make people ill.
  if (vr.inVR()) {
    const eye = new THREE.Vector3(), deck = new THREE.Vector3();
    (view.eyePoint || view.basketMesh).getWorldPosition(eye);
    (view.deckPoint || view.eyePoint || view.basketMesh).getWorldPosition(deck);
    vr.seatIn(deck, view.yaw, eye);
    return;
  }
  const fwd = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
  bobT += dt;
  let desired, look, snap = false;
  if (camMode === 0) {
    const off = fwd.clone().multiplyScalar(-44).add(new THREE.Vector3(0, 13, 0));
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitYaw);
    off.y += orbitPitch * 40;
    desired = p.clone().add(off);
    look = p.clone().addScaledVector(fwd, 30);
    look.y += 5;
    if (!dragging) { orbitYaw *= Math.pow(0.3, dt); orbitPitch *= Math.pow(0.3, dt); }
  } else if (camMode === 1) {
    // first person, standing in the basket (B3: the diagonal intoxication)
    desired = new THREE.Vector3();
    (view.eyePoint || view.basketMesh).getWorldPosition(desired);
    desired.addScaledVector(fwd, 0.1);
    const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const fwdP = new THREE.Vector3(fwd.x * cp, sp, fwd.z * cp);
    look = desired.clone().addScaledVector(fwdP, 30);
    look.y += Math.sin(bobT * 1.7) * 0.35 - 8 + orbitPitch * -20;
    look.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0); // keep
    if (orbitYaw) {
      const rel = look.clone().sub(desired).applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitYaw);
      look = desired.clone().add(rel);
    }
    if (!dragging) { orbitYaw *= Math.pow(0.05, dt); orbitPitch *= Math.pow(0.05, dt); }
    snap = true;
  } else if (camMode === 2) {
    // postcard: drag to pan and tilt around the ship; glides back to the
    // classic side framing when released
    const lat = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const off = lat.multiplyScalar(60).add(new THREE.Vector3(0, 6, 0));
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitYaw);
    off.y += orbitPitch * 45;
    desired = p.clone().add(off);
    look = p;
    if (!dragging) { orbitYaw *= Math.pow(0.45, dt); orbitPitch *= Math.pow(0.45, dt); }
  } else {
    desired = world.vistaPos.clone();
    look = p;
    snap = true;
  }
  const k = 1 - Math.pow(0.0012, dt);
  camPos.lerp(desired, snap ? 1 : k);
  // keep the lens out of the turf BEFORE aiming it, or the framing is computed
  // from a position the camera does not end up at
  if (camMode !== 1 && camPos.y < 2) camPos.y = 2;
  camera.position.copy(camPos);
  camera.lookAt(look);
}

// ---------------------------------------------------------------- HUD
const el = (id) => document.getElementById(id);
function updateHUD() {
  el('alt').textContent = Math.max(0, Math.round(ship.pos.y - ship.spec.keel.drop - 1));
  el('spd').textContent = Math.round(ship.vel.length() * 3.6);
  el('thr').textContent = Math.round(ship.throttle * 100);
  const w = windAt(wind, ship.pos.y);
  // compass name of where the wind is FROM, at YOUR altitude (currents veer aloft)
  const fromBearing = ((Math.atan2(-w.x, w.z) * 180 / Math.PI) + 360) % 360;
  const dirName = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(fromBearing / 45) % 8];
  el('wind').textContent = `${Math.round(Math.hypot(w.x, w.z) * 3.6)} km/h from the ${dirName}`;
  // true-wind arrow, relative to your heading (up = blowing the way you point)
  const rel = Math.atan2(-w.z, w.x) - ship.yaw;
  el('windArrow').style.transform = `rotate(${-90 - rel * 180 / Math.PI}deg)`;
  el('play').textContent = play.id ? play.said : '';
  drawNextMark();
  el('gasBar').style.width = ship.gas + '%';
  el('gasPct').textContent = Math.round(ship.gas) + '%';
  const fMax = ship.spec.physics.fuel;
  el('fuelBar').style.width = (fMax ? (ship.fuel / fMax) * 100 : 0) + '%';
  el('fuelPct').textContent = fMax ? Math.round((ship.fuel / fMax) * 100) + '%' : '—';
  el('ballast').textContent = ship.bags > 0 ? '◆'.repeat(ship.bags) : '—';
  el('pressWarn').style.visibility =
    (ship.pressure > ship.spec.physics.pressureLimit * 0.97 || ship.foulTime > 0.5) ? 'visible' : 'hidden';

  // after a few seconds, park the center notice at the top of the view
  // (countdown numbers refresh the timer each frame, so they stay centered)
  if (el('centerBig').textContent && performance.now() - centerSetAt > 3500) {
    document.getElementById('center').classList.add('parked');
    layoutHud();
  }
  const s = race.state;
  el('timer').textContent = (s === 'run' || s === 'done') ? fmt(race.t) : '';
  el('lapline').textContent = (s === 'run' && track && track.laps > 1)
    ? `LAP ${race.lap} / ${track.laps}` : '';
  if (performance.now() > splitUntil) { el('split').textContent = ''; el('split').className = ''; }
  let obj = '';
  if (editing) {
    obj = `Track editor — ${editing.gates.length} gates. G drops, U undoes, Esc menu saves.`;
  } else if (scenario && s === 'idle') {
    obj = scenario._failed ? 'R restarts the scenario.' : `${scenario.title} — ${scenario.sub}`;
  } else if (s === 'idle') {
    obj = ship.pos.distanceTo(world.startRing) < 150 ? world.hints.idleNear : world.hints.idleFar;
  } else if (s === 'run') {
    // distance OVER THE GROUND to the turn. A gate cut to a 312 m tower has its
    // centre 234 m up, and a straight-line distance to that would read as 250 m
    // to go while you are still directly under it.
    const _tp = raceTargetPos();
    const d = Math.round(Math.hypot(_tp.x - ship.pos.x, _tp.z - ship.pos.z));
    if (track && !track.historic) {
      obj = `${track.name} — gate ${race.gate + 1}/${track.gates.length} · ${d} m`;
    } else {
      const homeward = race.gate >= gateRings.length;
      const openCurve = world.towerPos && Math.abs(race.winding) < 5.6;
      obj = homeward
        ? (openCurve
          ? `${world.hints.back} — ${d} m · the Tower is not yet INSIDE your circuit!`
          : `${world.hints.back} — ${d} m`)
        : `${world.hints.out} — ${d} m${gateRings.length > 1 ? ` (pylon ${race.gate + 1}/${gateRings.length})` : ''}`;
    }
  } else if (s === 'done') obj = track && !track.historic ? 'Enter: fly it again.' : 'Trial complete. R to fly again.';
  el('objective').textContent = obj;
  if (track && !track.historic) {
    el('best').textContent = ghostBest ? `ghost: ${fmt(ghostBest.t)} · ${ship.spec.name}` : `no time set yet · ${ship.spec.name}`;
    const wr = worldRecord(track.id, currentShip);
    el('wr').innerHTML = wr
      ? `world record <b>${fmt(wr.t)}</b> — ${escapeHtml(wr.pilot)}`
      : (net.enabled() && wr === null ? 'world record: <b>unclaimed</b>' : '');
  } else {
    const limitLabel = `limit ${fmt(world.raceLimit)} (${world.limitNote})`;
    el('best').textContent = race.best ? `best: ${fmt(race.best)} · ${limitLabel}` : limitLabel;
    el('wr').textContent = '';
  }
}

// ---------------------------------------------------------------- loop
/**
 * Fit the canvas to the window. Reported from a telephone: turned on its side,
 * the view kept its portrait width and filled about half the screen.
 *
 * A single resize listener is not enough on iOS. Rotating fires resize while
 * innerWidth/innerHeight are still the OLD values, and the visual viewport
 * changes again as Safari's toolbars slide in and out without firing resize at
 * all. So: listen to everything that hints at it, AND check cheaply every frame
 * — the check costs two comparisons and only does work when they disagree,
 * which makes the canvas self-healing whatever the browser forgot to tell us.
 */
function fitToWindow() {
  // never while a headset is presenting: the size and the projection are the
  // session's, and setting them here would squash the stereo pair
  if (vr.inVR()) return;
  const w = innerWidth, h = innerHeight;
  if (fitToWindow.w === w && fitToWindow.h === h) return;
  fitToWindow.w = w; fitToWindow.h = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  layoutHud();
}
addEventListener('resize', fitToWindow);
addEventListener('orientationchange', () => {
  fitToWindow();
  // iOS reports the old size during the event itself: measure again after
  setTimeout(fitToWindow, 60);
  setTimeout(fitToWindow, 350);
});
if (window.visualViewport) {
  visualViewport.addEventListener('resize', fitToWindow);
  visualViewport.addEventListener('scroll', fitToWindow);
}

// ---------------------------------------------------------------- casting off
// Each step stands on its own. A fault in the register, or in the fault book
// itself, used to take the whole flight with it: the world never loaded, the
// frame loop at the foot of this file was never reached, and the pilot got a
// salmon screen with the instruments painted on it. Now one step failing costs
// only that step, and says so.
function step(what, fn) {
  try { fn(); return true; } catch (e) {
    console.error('[boot] ' + what, e);
    bootFaults.push(what + ': ' + ((e && e.message) || e));
    return false;
  }
}
const bootFaults = [];

step('the register', () => net.ensurePilotName());
const flying = step('the world', () => loadWorld('paris'));
step('the fault book', () => wireBugBook());
step('the sound', () => wireSound());
// asks the browser whether an immersive session is possible and puts up the
// button only if it is — on a laptop nothing appears and nothing is spent
step('the headset', () => { vr.offerVR(document.body); });
step('the album', () => { document.getElementById('albumClose').onclick = closeAlbum; });
step('the menu', () => {
  toggleMenu(true);   // start screen: choose your ship and your sky
  document.getElementById('help').classList.add('hidden');
});
if (bootFaults.length) {
  // the guard in index.html is the only thing a pilot on a telephone can read
  addEventListener('load', () => {
    if (!flying) console.error('[boot] she never left the shed:', bootFaults.join(' | '));
  });
  setTimeout(() => {
    addMsg('boot', 'Some of the works did not start: ' + bootFaults.join('; '), 0);
  }, 1200);
}

// debug handle
window.__game = { get ship() { return ship; }, get camMode() { return camMode; }, get world() { return world; },
  get rivals() { return rivals; }, get scenario() { return scenario; },
  get track() { return track; }, get ghostBest() { return ghostBest; }, get ghostRec() { return ghostRec; },
  get scene() { return scene; }, get composer() { return composer; },   // force a frame when rAF is asleep
  updateCamera, pollInput, drawThrottleLever, checkCollisions, hullPoints, updateHUD,
  setCamMode(m) { camMode = m; camera.near = m === 1 ? (ship.eyeNear || 0.1) : 0.5; camera.updateProjectionMatrix(); },
  startScenario, startTrack, loadWorld, SCENARIOS, TRACKS, camera, camPos, input, keys, race, wind };

let hudTick = 0;
let last = performance.now();
function frame(now) {
  window.__maBooted = true;      // tells the boot guard she is drawing
  fitToWindow();                 // cheap, and does nothing until the size moves
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (menuOpen || boardOpen() || bugBookOpen() || albumOpen()) {
    // A PANEL PAUSES THE SIMULATION, and in a headset that used to pause the
    // only way out of it as well: pollInput() never ran, so the sticks were
    // dead and the board could not be worked. The controllers are read here
    // whatever else is stopped.
    if (vr.inVR()) vr.pollVR(ship);
    updateCamera(dt); draw(); return;
  }

  // the sky runs on its own clock, not on how long this page has been open:
  // otherwise two pilots at the same instant get different gusts and different
  // lift, and "the same sky today" is only true of the prevailing wind
  windGustT = skyTime();
  wind.x = dailyWind.x + Math.sin(windGustT * 0.13) * 0.7 + Math.sin(windGustT * 0.041 + 2) * 0.9;
  wind.z = dailyWind.z + Math.sin(windGustT * 0.07 + 1) * 0.5;
  // A children's game is flown in half the day's wind. Not none of it: riding
  // it high and crawling home low against it is the whole lesson of the book,
  // and a dead calm teaches nothing at all. Half lets a small pilot get home.
  if (kidGame()) wind.multiplyScalar(KID_WIND);

  pollInput();
  const env = {
    underCloud: underCloud(world.clouds, ship.pos.x, ship.pos.z),
    inBois: world.isInBois(ship.pos.x, ship.pos.z),
    buildings: world.buildings,
    airY: verticalAir(world, ship.pos.x, ship.pos.y, ship.pos.z, windGustT),
    // THE GROUND. Airship.groundUnder() reads this, and ground contact, the
    // wreck's rest and the guide rope's floor all measure from it — but it was
    // never in the env, so groundUnder() returned zero for every ship in every
    // world. On the flat that is invisible. On the Chaillot bluff and the
    // Passy slope it is not: a ship that came down hard rested at absolute
    // zero and sank fifteen metres into the hill, which two pilots filed as
    // "I fell through the ground after crashing" and "Sank below the earth".
    groundAt: world.groundAt,
    // for the guide rope only: it lies on water, it does not sink through it
    waterY: world.waterY,
  };
  // the air itself is worth remarking on when it takes hold of the ship
  if (env.airY > 0.75) addMsg('updraft', 'The air itself is lifting you — a column of it, rising to build the cloud above.', 26);
  else if (env.airY < -0.55) addMsg('downdraft', 'The air is settling here: cool ground below, and the ship goes down with it.', 26);
  if (!spectate.on) ship.update(dt, input, wind, env);
  checkCollisions(dt);

  // rival dirigibles fly their own race
  for (const r of rivals) {
    r.update(dt, wind);
    if (r.finished && !r._announced) {
      r._announced = true;
      r.beatPlayer = race.state === 'run';
      addMsg('rv' + r.ship.spec.id, `${r.ship.spec.name} crosses the line!`, 0);
    }
  }

  // active scenario logic
  if (scenario && !scenario._failed) scenario.tick?.(scenCtx(), dt);
  if (routeRings.length) updateRoute();

  // the room: tell the others where we are, and put them where they say they are
  if (live.inRoom()) {
    live.sendState(dt, ship);
    live.update(dt);
    // the bearings in the roster are only useful while they are true: redraw
    // the panel a few times a second, not only when someone joins or finishes
    roomTick += dt;
    if (roomTick >= 0.25) { roomTick = 0; drawRoom(); }
    // silk on silk: she is shoved aside and loses a little gas, never wrecked
    // if the pilot we were watching has gone, ride with someone else
    if (spectate.on) {
      const still = live.remoteShips().some((s) => s.mesh === spectate.ship);
      if (!still) watchNext();
    }
    const rub = live.bump(ship, dt);
    if (rub > 0.6) {
      ship.gas = Math.max(0, ship.gas - Math.min(2.5, rub * 0.3));
      addMsg('bump', 'You foul the other ship — silk grinds on silk and the gas hisses away!', 6);
    }
  }

  // ghost: record this run, and fly the best one alongside
  if (race.state === 'run' && track && !track.historic) {
    if (race.t - ghostLastSample >= GHOST_DT) {
      ghostLastSample = race.t;
      ghostRec.push(+ship.pos.x.toFixed(1), +ship.pos.y.toFixed(1), +ship.pos.z.toFixed(1), +ship.yaw.toFixed(2));
    }
    if (ghostBest && ghostMesh) {
      const arr = ghostBest.p;
      const n = arr.length / 4;
      if (n > 1) {
        const f = Math.min(n - 1.001, race.t / (ghostBest.dt || GHOST_DT));
        const i0 = Math.floor(f) * 4, i1 = Math.min((n - 1) * 4, i0 + 4), fr = f - Math.floor(f);
        ghostMesh.position.set(
          arr[i0] + (arr[i1] - arr[i0]) * fr,
          arr[i0 + 1] + (arr[i1 + 1] - arr[i0 + 1]) * fr,
          arr[i0 + 2] + (arr[i1 + 2] - arr[i0 + 2]) * fr);
        ghostMesh.rotation.y = arr[i0 + 3];
        ghostMesh.visible = true;
      }
    }
  } else if (ghostMesh && ghostMesh.visible && race.state !== 'run') {
    ghostMesh.visible = false;
  }
  // the aids restock petroleum and ballast at the home station
  if (ship.landed && !ship.wrecked) {
    const dx = ship.pos.x - world.padPos.x, dz = ship.pos.z - world.padPos.z;
    if (dx * dx + dz * dz < 70 * 70 && ship.replenish(dt)) {
      addMsg('replen', 'The aids replenish petroleum and ballast.', 15);
    }
  }
  // the day's PREVAILING wind and the sky's clock — not the gusting wind and a
  // frame delta, which made where a cloud sat depend on when you opened the page
  updateClouds(world.clouds, dailyWind, windGustT);
  updateRace(dt);
  drainEvents();
  ambientQuotes();

  // free-flight random sputter (rare)
  if (!ship.sputtering && !ship.wrecked && race.state === 'idle' && ship.throttle > 0.6 && Math.random() < dt / 260) {
    ship.sputtering = true;
    addMsg('sputter', 'The motor coughs — there are sounds in its spitting rumble… (tap F)', 0);
  }

  // the world shows the wind: swaying foliage, streaming flags, drifting smoke
  // foliage answers the wind AT TREETOP HEIGHT, not the reference vector: down
  // here the air is slower and veered, and that is precisely what a pilot reads
  const wLow = windAt(wind, 9);
  for (const m of windMats) {
    const sh = m.userData.shader;
    if (sh) { sh.uniforms.uWind.value.set(wLow.x, wLow.z); sh.uniforms.uTime.value = windGustT; }
  }
  const flagAng = Math.atan2(-wind.z, wind.x);
  for (const f of world.flags || []) f.rotation.y = flagAng + Math.sin(windGustT * 3.1) * 0.14;
  world.tick?.(dt, windGustT, wind);

  // the sky box re-centers on the camera (or its walls show as black past 2 km)
  if (world.sky) world.sky.position.copy(camera.position);

  // sun shadow frustum follows the ship; water shimmers
  if (world.sun) {
    world.sun.position.copy(ship.pos).addScaledVector(world.sunDir, 900);
    world.sun.target.position.copy(ship.pos);
    world.sun.target.updateMatrixWorld();
  }
  if (world.waters) for (const w of world.waters) {
    const u = w.material.uniforms;
    u.time.value += dt * 0.5;
    if (u.flowUv) { u.flowUv.value.x += wind.x * dt; u.flowUv.value.y += wind.z * dt; }
  }

  tickGames(dt);
  updateCamera(dt);
  updateHUD();
  if (vr.inVR()) { vrPanel(); vr.cullForVR(ship.pos, scene); }
  // the blocks above change size as the wind, the trial and the roster change:
  // re-stack a few times a second rather than every frame
  hudTick += dt;
  if (hudTick > 0.2) { hudTick = 0; layoutHud(); }
  drawThrottleLever();
  updateAudio();
  draw();
}

// THE WATER STOPS REFLECTING IN A HEADSET, and this is the important half of
// the frame budget.
//
// three's Water is a Reflector: every frame it renders the WHOLE SCENE again,
// from a mirrored camera, into its own target — and to do that it calls
// renderer.setRenderTarget() and then puts it back. Inside an XR frame that is
// two things at once. It is a third full pass of a world with fifteen thousand
// buildings on it, and it rebinds the framebuffer the session is drawing into,
// which is exactly how you get a picture that is right in one eye and wrong in
// the other: "flickering that seems to be in one eye".
//
// onBeforeRender is what Water does its reflection in, so taking it away stops
// the extra pass and the rebinding both. The waves, the sun glitter and the
// colour are all still there — the mirror simply stops being repainted.
// The detailed city stands down in a headset and its block stand-in takes over
// — a sixth of the geometry for the same skyline. Marked at build time
// (userData.flatOnly / vrOnly) so nothing here has to know what a city is.
function swapCityForVR(on) {
  if (!scene) return;
  // built the first time a headset asks for it, not at every world load
  if (on && world && world.makeBlocks) world.makeBlocks();
  for (const o of scene.children) {
    const u = o.userData || {};
    if (u.flatOnly) o.visible = !on;
    else if (u.vrOnly) o.visible = on;
  }
}

let waterHooks = null;
function stillWater(on) {
  if (!world || !world.waters) return;
  if (on) {
    if (waterHooks) return;
    waterHooks = world.waters.map((w) => w.onBeforeRender);
    for (const w of world.waters) w.onBeforeRender = () => {};
  } else if (waterHooks) {
    world.waters.forEach((w, i) => { w.onBeforeRender = waterHooks[i]; });
    waterHooks = null;
  }
}

// ---------------------------------------------------------------- drawing
// The composer is a screen-sized render target with bloom on the end of it, and
// neither of those belongs in a headset: WebXR hands us its own framebuffer for
// the stereo pair, and a bloom pass over both eyes reads as a smear. So in a
// headset we render straight, which is also the cheapest thing we can do at
// ninety hertz on a mobile chip.
function draw() {
  if (vr.inVR()) renderer.render(scene, camera);
  else composer.render();
}

// The readings, on the slate wired to the basket rim. Frankly anachronistic —
// there was no such thing in 1901 — but a headset cannot show the corners of a
// screen, and flying blind is worse than flying with a slate.
// Declared ABOVE the function that reads them. Three temporal dead zones have
// blanked this page already; none of them will be this one.
let _vrNote = '', _vrNoteAt = 0;
// long enough to read a paragraph twice over, at a slow reading speed
const BIG_SLATE_DWELL = 14000;

function vrPanel() {
  if (!ship) return;
  const kmh = Math.hypot(ship.vel.x, ship.vel.z) * 3.6;
  const agl = ship.pos.y - (world.groundAt ? world.groundAt(ship.pos.x, ship.pos.z) : 0);
  const rows = [
    ['height', Math.round(agl) + ' m'],
    ['speed', kmh.toFixed(0) + ' km/h'],
    ['gas', Math.round(ship.gas) + '%'],
    ['ballast', ship.bags + (ship.spec.ballast === 'water' ? ' cyl' : ' bags')],
  ];
  if (ship.spec.physics.fuel) {
    rows.push(['petrol', Math.round((ship.fuel / ship.spec.physics.fuel) * 100) + '%']);
  }
  // the same words the flat game puts on screen, read off the DOM so the two
  // can never drift apart
  const sub = (document.getElementById('centerSub') || {}).textContent || '';
  const last = msgBox && msgBox.lastElementChild;
  const note = sub || (last ? last.textContent : '');
  // An ending is a paragraph: grow the slate and make it solid for it, and let
  // it shrink back to a see-through reading afterwards.
  //
  // "MESSAGES BLOCK VIEW" (#68). Two reasons, and the length test was both of
  // them. A scenario's opening line is a paragraph as surely as its last one
  // is — scenario II's is 113 characters — so the slate went big and opaque on
  // the first frame of the flight and STAYED there, for the whole flight, with
  // nothing to make it small again. It is meant to be a reading, not a wall;
  // the comment on the geometry says as much, since 0.30 x 0.19 and opaque was
  // condemned as "a slab across the front of the basket" once already and this
  // is 0.50 x 0.32.
  //
  // So it grows only while a long notice is NEW, on the same dwell the flat
  // game parks its centre notice on, and then hands the view back. The words
  // stay on the slate either way — it is the size that goes away, not the
  // message.
  if (note !== _vrNote) { _vrNote = note; _vrNoteAt = performance.now(); }
  ship.bigPanel(note.length > 90 && performance.now() - _vrNoteAt < BIG_SLATE_DWELL);
  ship.drawPanel(rows, note);
}

renderer.setAnimationLoop(frame);
