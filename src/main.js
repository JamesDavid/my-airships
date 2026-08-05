// My Airships — prototype. Boot, input, camera, race logic, HUD, quotes, audio.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, updateClouds, underCloud, towerRadiusAt, windMats, windAt, verticalAir, mulberry32 } from './world.js';
import { buildWorldMonaco } from './world_monaco.js';
import { buildWorldStLouis } from './world_stlouis.js';
import { Airship } from './airship.js';
import { SHIPS, SHIP_KEYS } from './ships.js';
import { SCENARIOS, Rival } from './scenarios.js';
import { TRACKS, trackSpawn, GHOST_DT, gateHeadings, encodeGhost, decodeGhost, loadCustomTracks, saveCustomTrack } from './tracks.js';
import * as net from './net.js';
import * as live from './live.js';
import { courseLength, shipTopSpeed } from './anticheat.js';

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

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 20000);

const LOCS = ['paris', 'monaco', 'stlouis'];
let scene, world, ship = null, startRing, gateRings = [], scenRing = null;
let rivals = [], scenario = null, scenBeacon = null;
let routeRings = [];
let track = null;                       // the active course (historic or time trial)
let ghostBest = null, ghostMesh = null, ghostRec = [], ghostLastSample = -1;
let chaseGhost = null;                  // a downloaded record, pinned to its course
let editing = null;                     // track-editor state
let splitUntil = 0;
let currentLocation = 'paris', currentShip = 'no6';
const wind = new THREE.Vector3(3.4, 0, 0.7);
const dailyWind = new THREE.Vector3(3.4, 0, 0.7);
let windGustT = 0;

/**
 * @param where  null to start from the shed, or a place aloft to take her over
 *               at — a free-flying pilot changing ships does not fall out of
 *               the sky while the new one is fetched.
 */
function spawnShip(specId, where = null) {
  currentShip = specId;
  live.setShip(specId);
  if (ship) ship.dispose();
  ship = new Airship(scene, SHIPS[specId]);
  const y = ship.restHeight();
  if (where) {
    ship.reset(new THREE.Vector3(where.x, Math.max(where.y, y), where.z), where.yaw);
    ship.landed = false;
  } else {
    ship.reset(new THREE.Vector3(world.padPos.x, y, world.padPos.z), 0);
  }
  setCenter('', '');   // clear any wreck notice from the previous ship
  document.getElementById('helpTitle').textContent = `My Airships — ${ship.spec.name}`;
  addMsg('ship', `${ship.spec.name} — ${ship.spec.sub}`, 0);
}

function makeRing(color) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 10, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, fog: true }));
  m.rotation.y = Math.PI / 2;
  scene.add(m);
  return m;
}

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
    gates: (world.gates || []).map((g) => ({ x: g.x, y: g.y, z: g.z, r: 24 })),
  };
}

function buildRings(gates, originPos) {
  for (const r of gateRings) scene.remove(r);
  // headings come from tracks.js so the ring you see, the pass test, and the
  // server-side run validator all use one definition of "through the gate"
  const headings = gateHeadings(gates, originPos);
  gateRings = gates.map((g, i) => {
    const r = makeRing(0x8a8a8a);
    r.position.set(g.x, g.y, g.z);
    r.rotation.y = headings[i];
    r.scale.setScalar((g.r || 24) / 24);
    r.userData.r = g.r || 24;
    return r;
  });
}

// a re-cut circuit is a different course: its version retires the old times
function bestKey(t) { return `tt_${t.id}${t.v ? '_v' + t.v : ''}_${currentShip}`; }

function loadBest(t) {
  // a ghost fetched from the record office keeps flying this course until you
  // leave it — restarts (R) go on chasing the record-holder, not yourself
  if (chaseGhost && chaseGhost.trackId === t.id) {
    ghostBest = chaseGhost.ghost;
    updateGhostMesh();
    return;
  }
  chaseGhost = null;
  try { ghostBest = JSON.parse(localStorage.getItem(bestKey(t)) || 'null'); }
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
function startTrack(t) {
  track = t;
  scenario = null;
  editing = null;
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
  buildRings(historicTrack().gates, world.startRing);
  startRing.visible = true;
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
  world = loc === 'paris' ? buildWorld(scene)
    : loc === 'monaco' ? buildWorldMonaco(scene)
    : buildWorldStLouis(scene);
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
  // the daily wind: seeded by the date, so everyone flies the same sky today
  const d = new Date();
  const dr = mulberry32(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
  const rot = (dr() - 0.5) * 0.9, mag = 0.85 + dr() * 0.4;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  dailyWind.set((world.windBase.x * rc + world.windBase.z * rs) * mag, 0,
    (-world.windBase.x * rs + world.windBase.z * rc) * mag);
  wind.copy(dailyWind);
  race.state = 'idle'; race.t = 0; race.gate = 0;
  // each course keeps its own record: the Deutsch half-hour and the St. Louis
  // ten minutes are not the same achievement
  race.best = +(localStorage.getItem(bestRaceKey()) || 0);
  setCenter('', '');
  spawnShip(currentShip);
  camPos.set(world.padPos.x - 90, 45, world.padPos.z + 90);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.7, 0.86));
  composer.addPass(new OutputPass());
  disposeWorld(oldScene, oldComposer);
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
    if (bugBookOpen()) closeBugBook(); else if (boardOpen()) closeBoard(); else toggleMenu();
    return;
  }
  // while a panel is up the simulation is paused: don't fly the ship behind it
  if (menuOpen || boardOpen() || bugBookOpen()) return;
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
  if (e.code === 'KeyM') muted = !muted;
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
  if (scenRing) scenRing.visible = false;
  if (scenBeacon) scenBeacon.visible = false;
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
  document.querySelector('#help .quote').textContent =
    'On touch: the CARB lever is the throttle — set it and it stays, like the brass lever aboard. '
    + 'The HELM slider steers and stays where you lash it; ' +
    'the TRIM slider is the shifting weights and holds too — center either to run straight ' +
    'and level. SAND drops ballast, VENT descends, FIX coaxes the motor, GO starts the trial. ' +
    'Drag the sky to look around. Tap this panel to close it.';
}

// the on-screen controls work anywhere — touch devices get them by default,
// and PC pilots can switch them on from the menu
function setTouchUI(on) {
  document.body.classList.toggle('touch', on);
  if (on) wireTouchControls();
  else { touchPitch = 0; touchHelm = 0; throttleLever = false; }   // give the keys back the motor
  localStorage.setItem('myairships_touchui', on ? '1' : '0');
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
const touchPref = localStorage.getItem('myairships_touchui');
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
}

function cycleCamera() {
  camMode = (camMode + 1) % 4;
  camera.near = camMode === 1 ? 0.1 : 0.5;  // FP: instruments are inches from the eye
  camera.updateProjectionMatrix();
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
function toggleMenu(force) {
  menuOpen = force !== undefined ? force : !menuOpen;
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
function menuButton(parent, label, sub, onClick, current) {
  const b = document.createElement('button');
  b.innerHTML = label + (sub ? ` <small>— ${sub}</small>` : '');
  if (current) b.classList.add('current');
  b.onclick = onClick;
  parent.appendChild(b);
}
function buildMenuButtons() {
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
        ship.reset(new THREE.Vector3(spot.pos.x, ship.restHeight(), spot.pos.z), ship.yaw);
        toggleMenu(false);
        addMsg('tow', `The men walk her out by the guide rope to ${spot.name} — “as stable-boys lead a racehorse.”`, 0);
      });
    }
    placeDiv.appendChild(nest);
  }

  // scenarios column
  const scenDiv = document.getElementById('menuScens');
  scenDiv.innerHTML = '';
  const doneMap = JSON.parse(localStorage.getItem('myairships_scen') || '{}');
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
    try { best = JSON.parse(localStorage.getItem(bestKey(t)) || 'null'); } catch { /* noop */ }
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
  menuButton(optsDiv, `Sound: ${muted ? 'off' : 'on'}`, 'the spitting rumble', () => { muted = !muted; buildMenuButtons(); });
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
  } else {
    const line = document.createElement('div');
    line.className = 'officeline';
    line.innerHTML = 'Waiting on the host to call the race — fly about until they do.';
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
  const y = ship.restHeight();
  ship.reset(new THREE.Vector3(world.padPos.x, y, world.padPos.z), 0);
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
function bestRaceKey() { return `myairships_best_${currentLocation}`; }
(function migrateOldBest() {
  const old = localStorage.getItem('myairships_best');
  if (old && !localStorage.getItem('myairships_best_paris')) {
    localStorage.setItem('myairships_best_paris', old);   // it can only have been Paris
    localStorage.removeItem('myairships_best');
  }
})();
const race = { state: 'idle', t: 0, gate: 0, count: 0, sputterAt: 0, lastResult: null,
  best: +(localStorage.getItem('myairships_best_paris') || 0) };

function tryStartRace() {
  document.getElementById('help').classList.add('hidden');
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
  // in a lap trial, Enter is instant restart
  if (track && !track.historic && race.state !== 'idle') { startTrack(track); return; }
  if (race.state !== 'idle' || ship.wrecked) return;
  if (ship.pos.distanceTo(world.startRing) > 150) {
    addMsg('far', 'Convoke the Commission at the gold start ring, above the aerodrome.', 6);
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
  const freeScenario = !!scenario && !track;
  for (const r of gateRings) r.visible = !freeScenario;
  if (freeScenario) startRing.visible = false;
  if (!track) return;
  const gates = track.gates;
  const running = s === 'run';
  const homeward = track.historic && race.gate >= gates.length;
  startRing.material.color.set(!running || homeward ? 0xd9b24a : 0x8a8a8a);
  gateRings.forEach((r, i) => r.material.color.set(running && i === race.gate ? 0xd9b24a : 0x8a8a8a));
  const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.05;
  startRing.scale.setScalar(running && homeward ? pulse : 1);
  gateRings.forEach((r, i) => r.scale.setScalar((r.userData.r / 24) * (running && i === race.gate ? pulse : 1)));

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
      const lateral = Math.sqrt(Math.max(0, rel.lengthSq() - sd * sd));
      const passR = (gates[race.gate].r || 24) + 6;
      const prevSd = race._gateS;
      race._gateS = sd;
      if (prevSd !== undefined && prevSd < 0 && sd >= 0) {
        if (lateral < passR) {
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
              race.sputterAt = race.t + 10 + Math.random() * 18;
            } else if (race.lap < track.laps) {
              race.lap++; race.gate = 0;
              addMsg('lap', `Lap ${race.lap} of ${track.laps}!`, 0);
            } else { finishRace(); return; }
          } else if (track.historic && gates.length > 1) {
            addMsg('gate', `Pylon ${race.gate} of ${gates.length} rounded!`, 0);
          }
        } else if (lateral < passR * 3) {
          addMsg('miss', 'Missed the gate — come round and through it!', 4);
        }
      }
    }
    if (track.historic && race.sputterAt && race.t > race.sputterAt && !ship.sputtering) {
      ship.sputtering = true; race.sputterAt = 0;
      addMsg('sputter', 'The capricious motor is stopping! Abandon the wheel — work the levers! (tap F)', 0);
    }
  }
}

function finishRace() {
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
      race.best = t; localStorage.setItem(bestRaceKey(), String(t));
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
  if (rival) { try { prev = JSON.parse(localStorage.getItem(bestKey(track)) || 'null'); } catch { prev = null; } }
  const run = { t, splits: race.splits.slice(), dt: GHOST_DT, p: ghostRec.slice(),
    pilot: net.pilotName(), ship: currentShip };
  const improved = !prev || t < prev.t;
  if (improved) {
    try { localStorage.setItem(bestKey(track), JSON.stringify(run)); } catch { /* full */ }
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
function scenCtx() {
  return {
    ship, world, addMsg, setCenter,
    place(x, y, z, yaw) {
      ship.reset(new THREE.Vector3(x, y, z), yaw);
      ship.landed = y <= ship.restHeight() + 0.8;
    },
    // a line of faint hoops marking the way, each fading out as it is passed
    setRoute(points) {
      clearRoute();
      for (const p of points) {
        const r = makeRing(0x6fc48a);
        r.position.copy(p);
        r.material.opacity = 0.34;
        r.scale.setScalar(0.75);
        routeRings.push(r);
      }
    },
    setZone(pos, r) {
      scenRing.visible = true; scenRing.position.copy(pos); scenRing.scale.setScalar(r / 24);
      scenBeacon.visible = true;
      scenBeacon.position.set(pos.x, pos.y + 75, pos.z);
      scenBeacon.scale.set(r / 24, 1, r / 24);
    },
    clearZone() { scenRing.visible = false; scenBeacon.visible = false; clearRoute(); },
    startRace() { startTrack(historicTrack()); },
    raceResult: () => (race.state === 'done' ? race.lastResult : null),
    complete: scenComplete,
    fail: scenFail,
  };
}

function startScenario(def) {
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
  def.setup(scenCtx());
  // a scenario that is not a race shows no race rings — hide them at once
  // rather than waiting for the next frame to notice
  if (!track) { for (const r of gateRings) r.visible = false; startRing.visible = false; }
  addMsg('brief', def.brief, 0);
}

function scenComplete(text) {
  const done = JSON.parse(localStorage.getItem('myairships_scen') || '{}');
  done[scenario.id] = true;
  localStorage.setItem('myairships_scen', JSON.stringify(done));
  scenRing.visible = false;
  if (scenBeacon) scenBeacon.visible = false;
  clearRoute();
  scenario = null;
  setCenter('Scenario complete', `${text}  (Esc for the menu)`);
}

function scenFail(text) {
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

  // buildings (AABB vs each hull sphere)
  for (const b of world.buildings) {
    if (Math.abs(b.x - ship.pos.x) > 90 || Math.abs(b.z - ship.pos.z) > 90) continue;
    for (const { q, r, s, keel } of pts) {
      if (q.y > b.top + r) continue;
      const cx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, q.x));
      const cy = Math.min(b.top, Math.max(0, q.y));
      const cz = Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, q.z));
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
  document.getElementById('center').classList.remove('parked');
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
  ballast:  ['ballast', 'A sack of sand goes over the side.', 2],
  noballast:['noballast', 'Not a handful of sand remains.', 8],
  treetops: ['treetops', 'Caught in the tree-tops — “a kind of insurance against more terrible accidents.”', 22],
  roughLanding: ['rough', 'A rough landing — the keel groans.', 8],
  motorFixed: ['motorfixed', 'The motor takes heart and rumbles on!', 4],
  fuelOut: ['fuelout', 'The petroleum is spent! The motor dies away — you are a free balloon now.', 0],
  folding: ['folding', 'The balloon is folding in the middle like a pocket knife! Throttle down, level off, drop sand!', 8],
};

function drainEvents() {
  for (const ev of ship.events) {
    if (ev.startsWith('wreck:')) {
      const r = ev.slice(6);
      if (r === 'hardLanding') setCenter('Wrecked!', '“He who wishes to navigate an air-ship should first practise landings…” (R)');
      continue;
    }
    const e = EVENT_TEXT[ev];
    if (e) addMsg(e[0], e[1], e[2]);
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
function initAudio() {
  // iOS/iPad Safari starts the context suspended — resume inside the gesture
  if (audio) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
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
    const d = Math.round(ship.pos.distanceTo(raceTargetPos()));
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
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

net.ensurePilotName();   // every pilot is entered in the register on arrival
wireBugBook();           // no office configured, no fault book — see net_config.js
loadWorld('paris');
toggleMenu(true);   // start screen: choose your ship and your sky
document.getElementById('help').classList.add('hidden');

// debug handle
window.__game = { get ship() { return ship; }, get camMode() { return camMode; }, get world() { return world; },
  get rivals() { return rivals; }, get scenario() { return scenario; },
  get track() { return track; }, get ghostBest() { return ghostBest; }, get ghostRec() { return ghostRec; },
  get scene() { return scene; }, get composer() { return composer; },   // force a frame when rAF is asleep
  updateCamera, pollInput, drawThrottleLever, checkCollisions, hullPoints, updateHUD,
  setCamMode(m) { camMode = m; camera.near = m === 1 ? 0.1 : 0.5; camera.updateProjectionMatrix(); },
  startScenario, startTrack, loadWorld, SCENARIOS, TRACKS, camera, camPos, input, keys, race, wind };

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (menuOpen || boardOpen() || bugBookOpen()) { updateCamera(dt); composer.render(); return; }  // paused while a panel is up

  windGustT += dt;
  wind.x = dailyWind.x + Math.sin(windGustT * 0.13) * 0.7 + Math.sin(windGustT * 0.041 + 2) * 0.9;
  wind.z = dailyWind.z + Math.sin(windGustT * 0.07 + 1) * 0.5;

  pollInput();
  const env = {
    underCloud: underCloud(world.clouds, ship.pos.x, ship.pos.z),
    inBois: world.isInBois(ship.pos.x, ship.pos.z),
    buildings: world.buildings,
    airY: verticalAir(world, ship.pos.x, ship.pos.y, ship.pos.z, windGustT),
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
  updateClouds(world.clouds, wind, dt);
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

  updateCamera(dt);
  updateHUD();
  drawThrottleLever();
  updateAudio();
  composer.render();
}
requestAnimationFrame(frame);
