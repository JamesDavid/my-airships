// My Airships — prototype. Boot, input, camera, race logic, HUD, quotes, audio.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, updateClouds, underCloud, towerRadiusAt, windMats, windAt, mulberry32 } from './world.js';
import { buildWorldMonaco } from './world_monaco.js';
import { buildWorldStLouis } from './world_stlouis.js';
import { Airship } from './airship.js';
import { SHIPS, SHIP_KEYS } from './ships.js';
import { SCENARIOS, Rival } from './scenarios.js';
import { TRACKS, trackSpawn, GHOST_DT, encodeGhost, decodeGhost, loadCustomTracks, saveCustomTrack } from './tracks.js';

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
let rivals = [], scenario = null;
let track = null;                       // the active course (historic or time trial)
let ghostBest = null, ghostMesh = null, ghostRec = [], ghostLastSample = -1;
let editing = null;                     // track-editor state
let splitUntil = 0;
let currentLocation = 'paris', currentShip = 'no6';
const wind = new THREE.Vector3(3.4, 0, 0.7);
const dailyWind = new THREE.Vector3(3.4, 0, 0.7);
let windGustT = 0;

function spawnShip(specId) {
  currentShip = specId;
  if (ship) ship.dispose();
  ship = new Airship(scene, SHIPS[specId]);
  const y = ship.spec.keel.drop + 1.2;
  ship.reset(new THREE.Vector3(world.padPos.x, y, world.padPos.z), 0);
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

// ---------------------------------------------------------------- tracks
function historicTrack() {
  return {
    id: 'historic_' + currentLocation,
    name: world.name, location: currentLocation,
    laps: 1, historic: true,
    gates: (world.gates || []).map((g) => ({ x: g.x, y: g.y, z: g.z, r: 24 })),
  };
}

function buildRings(gates, originPos) {
  for (const r of gateRings) scene.remove(r);
  const n = gates.length;
  gateRings = gates.map((g, i) => {
    const r = makeRing(0x8a8a8a);
    r.position.set(g.x, g.y, g.z);
    // face each ring along the BISECTOR of its incoming and outgoing legs:
    // on an oval this is the true tangent; at a sharp corner it splits the
    // turn, so the fly-through always makes sense. Point-to-point courses
    // use the start ring as the leg before gate 0 and the start ring again
    // as the leg after the last gate (the homeward turn).
    const prev = i > 0 ? gates[i - 1] : (originPos || gates[n - 1]);
    const next = i < n - 1 ? gates[i + 1] : (originPos || gates[0]);
    let ix = g.x - prev.x, iz = g.z - prev.z;
    let ox = next.x - g.x, oz = next.z - g.z;
    const il = Math.hypot(ix, iz) || 1, ol = Math.hypot(ox, oz) || 1;
    ix /= il; iz /= il; ox /= ol; oz /= ol;
    let dx = ix + ox, dz = iz + oz;
    if (Math.hypot(dx, dz) < 0.15) { dx = ix; dz = iz; } // hairpin: face the entry
    if (dx || dz) r.rotation.y = Math.atan2(dx, dz);
    if (g.ang != null) r.rotation.y = g.ang; // explicit heading (e.g. an archway)
    r.scale.setScalar((g.r || 24) / 24);
    r.userData.r = g.r || 24;
    return r;
  });
}

function bestKey(t) { return `tt_${t.id}_${currentShip}`; }

function loadBest(t) {
  try { ghostBest = JSON.parse(localStorage.getItem(bestKey(t)) || 'null'); }
  catch { ghostBest = null; }
  updateGhostMesh();
}

function updateGhostMesh() {
  if (ghostMesh) { scene.remove(ghostMesh); ghostMesh = null; }
  if (!ghostBest) return;
  const E = ship.spec.envelope;
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
  race.lastResult = null; race._gateS = undefined;
  ghostRec = []; ghostLastSample = -1;
  loadBest(t);
  if (!t.historic) {
    const sp = trackSpawn(t);
    ship.reset(new THREE.Vector3(sp.x, sp.y, sp.z), sp.yaw);
    ship.landed = false;
    setCenter(t.name, ghostBest ? `${t.laps} laps — your ghost flies at ${fmt(ghostBest.t)}` : `${t.laps} laps — set the first time`);
  }
}

function endTrack() {
  track = null;
  buildRings(historicTrack().gates, world.startRing);
  startRing.visible = true;
  if (ghostMesh) ghostMesh.visible = false;
  race.state = 'idle'; race.t = 0; race.gate = 0;
}

function loadWorld(loc) {
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
  // the daily wind: seeded by the date, so everyone flies the same sky today
  const d = new Date();
  const dr = mulberry32(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
  const rot = (dr() - 0.5) * 0.9, mag = 0.85 + dr() * 0.4;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  dailyWind.set((world.windBase.x * rc + world.windBase.z * rs) * mag, 0,
    (-world.windBase.x * rs + world.windBase.z * rc) * mag);
  wind.copy(dailyWind);
  race.state = 'idle'; race.t = 0; race.gate = 0;
  setCenter('', '');
  spawnShip(currentShip);
  camPos.set(world.padPos.x - 90, 45, world.padPos.z + 90);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.7, 0.86));
  composer.addPass(new OutputPass());
  addMsg('loc', world.name, 0);
}

// ---------------------------------------------------------------- input
const input = { throttle: 0, rudder: 0, pitch: 0, vent: false, coax: false };
const keys = {};
let camMode = 0, muted = false;

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  initAudio();
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
  if (e.code === 'Escape') toggleMenu();
  if (e.code === 'KeyP') document.body.classList.toggle('photo');
  if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
  if (e.code === 'KeyM') muted = !muted;
  if (SHIP_KEYS[e.code]) {
    if (ship.landed && race.state === 'idle') spawnShip(SHIP_KEYS[e.code]);
    else addMsg('noswitch', 'Land (and finish the trial) to change ships.', 6);
  }
  if (e.code === 'KeyL') {
    if (ship.landed && race.state === 'idle') loadWorld(LOCS[(LOCS.indexOf(currentLocation) + 1) % LOCS.length]);
    else addMsg('noloc', 'Land (and finish the trial) before travelling — the air-ship goes by railway waggon.', 6);
  }
});
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
    'On touch: THR buttons for throttle. The HELM slider steers and stays where you lash it; ' +
    'the TRIM slider is the shifting weights and holds too — center either to run straight ' +
    'and level. SAND drops ballast, VENT descends, FIX coaxes the motor, GO starts the trial. ' +
    'Drag the sky to look around. Tap this panel to close it.';
}

// the on-screen controls work anywhere — touch devices get them by default,
// and PC pilots can switch them on from the menu
function setTouchUI(on) {
  document.body.classList.toggle('touch', on);
  if (on) wireTouchControls();
  else { touchPitch = 0; touchHelm = 0; }
  localStorage.setItem('myairships_touchui', on ? '1' : '0');
}

function wireTouchControls() {
  if (wireTouchControls._done) return;
  wireTouchControls._done = true;
  for (const b of document.querySelectorAll('#touchUI .tbtn')) {
    const code = b.dataset.key;
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
  trk.addEventListener('pointerdown', (e) => { trk.setPointerCapture(e.pointerId); setTrim(e); });
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
  hTrk.addEventListener('pointerdown', (e) => { hTrk.setPointerCapture(e.pointerId); setHelm(e); });
  hTrk.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure > 0) setHelm(e); });
}

// on-screen controls default ON everywhere; the menu toggle remembers "off"
const touchPref = localStorage.getItem('myairships_touchui');
if (touchPref !== '0') setTouchUI(true);

let touchPitch = 0;   // trim sliders: they hold their setting, like real weights
let touchHelm = 0;    // and a lashed helm
function pollInput() {
  input.throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
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
function toggleMenu(force) {
  menuOpen = force !== undefined ? force : !menuOpen;
  menuEl.classList.toggle('hidden', !menuOpen);
  if (menuOpen) { buildMenuButtons(); document.getElementById('help').classList.add('hidden'); }
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
  shipsDiv.innerHTML = ''; optsDiv.innerHTML = '';
  for (const [id, s] of Object.entries(SHIPS)) {
    if (s.ai) continue;
    menuButton(shipsDiv, s.name, s.sub, () => {
      if (ship.landed && race.state === 'idle') { spawnShip(id); toggleMenu(false); }
      else addMsg('noswitch', 'Land (and finish the trial) to change ships.', 0);
    }, id === currentShip);
  }
  const locBtn = (id, label, sub) => menuButton(optsDiv, label, sub, () => {
    if (id === currentLocation) return;
    if (ship.landed && race.state === 'idle') { loadWorld(id); toggleMenu(false); }
    else addMsg('noloc', 'Land first — the air-ship travels by railway waggon.', 0);
  }, id === currentLocation);
  locBtn('paris', 'Paris, 1901', 'the Deutsch Prize course');
  locBtn('monaco', 'Monaco, winter 1902', 'the maritime guide rope');
  locBtn('stlouis', 'St. Louis, 1904', 'the World’s Fair grand prize');
  // the ground crew tows the ship by its guide rope (Ch. XXIII)
  for (const spot of world.towSpots || []) {
    menuButton(optsDiv, `Tow to ${spot.name}`, 'the men walk her by the rope', () => {
      if (!ship.landed || race.state !== 'idle') { addMsg('notow', 'Land first — the men cannot catch a flying rope.', 0); return; }
      const y = ship.spec.keel.drop + 1.2;
      ship.reset(new THREE.Vector3(spot.pos.x, y, spot.pos.z), ship.yaw);
      toggleMenu(false);
      addMsg('tow', `The men walk her out by the guide rope to ${spot.name} — “as stable-boys lead a racehorse.”`, 0);
    });
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
  for (const t of [...TRACKS, ...loadCustomTracks()]) {
    let best = null;
    try { best = JSON.parse(localStorage.getItem(`tt_${t.id}_${currentShip}`) || 'null'); } catch { /* noop */ }
    menuButton(trDiv, t.name + (best ? ` — ${fmt(best.t)}` : ''),
      (t.custom ? '(custom) ' : '') + (t.sub || `${t.laps} laps`), () => {
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
    ghostBest = g;
    updateGhostMesh();
    addMsg('gh2', `Rival ghost loaded — it flies at ${fmt(g.t)}. Beat it.`, 0);
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
  menuButton(optsDiv, 'Resume flying', '', () => toggleMenu(false));
}

function resetShip() {
  const y = ship.spec.keel.drop + 1.2;
  ship.reset(new THREE.Vector3(world.padPos.x, y, world.padPos.z), 0);
  endTrack();
  clearRivals();
  editing = null;
  if (scenRing) scenRing.visible = false;
  setCenter('', '');
  seen.clear();
}

// ---------------------------------------------------------------- race
const race = { state: 'idle', t: 0, gate: 0, count: 0, sputterAt: 0, lastResult: null,
  best: +(localStorage.getItem('myairships_best') || 0) };

function tryStartRace() {
  document.getElementById('help').classList.add('hidden');
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
          race._gateS = undefined;
          blip(620 + race.gate * 60);
          race.splits.push(race.t);
          if (!track.historic) showSplit();
          race.gate++;
          if (race.gate === gates.length) {
            if (track.historic) {
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
    const won = t <= world.raceLimit;
    const beatSantos = t <= world.raceRecord;
    const ace = t <= 600;
    const beatRivals = !rivals.some((r) => r.beatPlayer);
    race.lastResult = { won, beatSantos, beatRivals, t };
    if (won && (!race.best || t < race.best)) {
      race.best = t; localStorage.setItem('myairships_best', String(t));
    }
    let sub;
    if (!won) sub = `${fmt(t)} — “Errors do not count. I have learned my lesson.” (R to try again)`;
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
  const prev = ghostBest;
  const improved = !prev || t < prev.t;
  if (improved) {
    ghostBest = { t, splits: race.splits.slice(), dt: GHOST_DT, p: ghostRec.slice() };
    try { localStorage.setItem(bestKey(track), JSON.stringify(ghostBest)); } catch { /* full */ }
    updateGhostMesh();
  }
  setCenter(fmt(t),
    improved
      ? (prev ? `New best — ${(prev.t - t).toFixed(1)}s faster! (Enter: again)` : 'First time set — your ghost now flies this course. (Enter: again)')
      : `+${(t - prev.t).toFixed(1)}s off your best of ${fmt(prev.t)}. (Enter: again)`);
}

// ---------------------------------------------------------------- scenarios
function scenCtx() {
  return {
    ship, world, addMsg, setCenter,
    place(x, y, z, yaw) {
      ship.reset(new THREE.Vector3(x, y, z), yaw);
      ship.landed = y <= ship.spec.keel.drop + 2;
    },
    setZone(pos, r) { scenRing.visible = true; scenRing.position.copy(pos); scenRing.scale.setScalar(r / 24); },
    clearZone() { scenRing.visible = false; },
    startRace() { startTrack(historicTrack()); },
    raceResult: () => (race.state === 'done' ? race.lastResult : null),
    complete: scenComplete,
    fail: scenFail,
  };
}

function startScenario(def) {
  toggleMenu(false);
  if (currentLocation !== def.location) loadWorld(def.location);
  endTrack();
  editing = null;
  clearRivals();
  seen.clear();
  spawnShip(def.shipId);
  scenario = def;
  def._failed = false;
  def.setup(scenCtx());
  addMsg('brief', def.brief, 0);
}

function scenComplete(text) {
  const done = JSON.parse(localStorage.getItem('myairships_scen') || '{}');
  done[scenario.id] = true;
  localStorage.setItem('myairships_scen', JSON.stringify(done));
  scenRing.visible = false;
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
    pts.push({ q, r: 1.5, s: kHalf * t });
  }
  return pts;
}

function resolveHit(q, n, pen, s, hard) {
  ship.pos.addScaledVector(n, pen);
  const vn = ship.vel.dot(n);
  let j = 0;
  if (vn < 0) {
    j = -vn;
    ship.vel.addScaledVector(n, -vn * 1.5); // restitution 0.5
    ship.applyImpact(s, n, j);
  }
  if (hard && j > 8.5) {
    ship.wreck('building');
    setCenter('Wrecked on the housetops!', '“Chimney-pots that threaten to pierce its belly…” (R)');
    return true;
  }
  if (hard && j > 1.2) {
    ship.gas = Math.max(0, ship.gas - Math.min(6, j * 0.9));
    addMsg('scrape', 'The chimney-pots claw at the envelope! Hydrogen bleeds away…', 8);
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
    for (const { q, r, s } of pts) {
      if (q.y > b.top + r) continue;
      const cx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, q.x));
      const cy = Math.min(b.top, Math.max(0, q.y));
      const cz = Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, q.z));
      const d = Math.hypot(q.x - cx, q.y - cy, q.z - cz);
      if (d < r) {
        const n = d > 0.001
          ? new THREE.Vector3(q.x - cx, q.y - cy, q.z - cz).divideScalar(d)
          : new THREE.Vector3(0, 1, 0);
        if (resolveHit(q, n, r - d, s, true)) return;
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
  const p = ship.pos;
  const fwd = new THREE.Vector3(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw));
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
    ship.basketMesh.getWorldPosition(desired);
    desired.y += 1.0;
    desired.addScaledVector(fwd, 0.1);
    const cp = Math.cos(ship.pitch), sp = Math.sin(ship.pitch);
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
  camera.position.copy(camPos);
  camera.lookAt(look);
  if (camMode !== 1 && camPos.y < 2) camera.position.y = 2;
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
  el('lapline').textContent = (s === 'run' && track && !track.historic && track.laps > 1)
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
      obj = homeward
        ? `${world.hints.back} — ${d} m`
        : `${world.hints.out} — ${d} m${gateRings.length > 1 ? ` (pylon ${race.gate + 1}/${gateRings.length})` : ''}`;
    }
  } else if (s === 'done') obj = track && !track.historic ? 'Enter: fly it again.' : 'Trial complete. R to fly again.';
  el('objective').textContent = obj;
  if (track && !track.historic) {
    el('best').textContent = ghostBest ? `ghost: ${fmt(ghostBest.t)} · ${ship.spec.name}` : `no time set yet · ${ship.spec.name}`;
  } else {
    const limitLabel = `limit ${fmt(world.raceLimit)} (${world.limitNote})`;
    el('best').textContent = race.best ? `best: ${fmt(race.best)} · ${limitLabel}` : limitLabel;
  }
}

// ---------------------------------------------------------------- loop
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

loadWorld('paris');
toggleMenu(true);   // start screen: choose your ship and your sky
document.getElementById('help').classList.add('hidden');

// debug handle
window.__game = { get ship() { return ship; }, get camMode() { return camMode; }, get world() { return world; },
  get rivals() { return rivals; }, get scenario() { return scenario; },
  get track() { return track; }, get ghostBest() { return ghostBest; }, get ghostRec() { return ghostRec; },
  startScenario, startTrack, loadWorld, SCENARIOS, TRACKS, camera, camPos, input, keys, race, wind };

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (menuOpen) { updateCamera(dt); composer.render(); return; }  // paused while the menu is up

  windGustT += dt;
  wind.x = dailyWind.x + Math.sin(windGustT * 0.13) * 0.7 + Math.sin(windGustT * 0.041 + 2) * 0.9;
  wind.z = dailyWind.z + Math.sin(windGustT * 0.07 + 1) * 0.5;

  pollInput();
  const env = {
    underCloud: underCloud(world.clouds, ship.pos.x, ship.pos.z),
    inBois: world.isInBois(ship.pos.x, ship.pos.z),
    buildings: world.buildings,
  };
  ship.update(dt, input, wind, env);
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
  for (const m of windMats) {
    const sh = m.userData.shader;
    if (sh) { sh.uniforms.uWind.value.set(wind.x, wind.z); sh.uniforms.uTime.value = windGustT; }
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
  updateAudio();
  composer.render();
}
requestAnimationFrame(frame);
