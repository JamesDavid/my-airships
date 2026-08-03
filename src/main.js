// My Airships — prototype. Boot, input, camera, race logic, HUD, quotes, audio.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, updateClouds, underCloud, towerRadiusAt, windMats } from './world.js';
import { buildWorldMonaco } from './world_monaco.js';
import { Airship, windAt } from './airship.js';
import { SHIPS, SHIP_KEYS } from './ships.js';

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

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 9000);

let scene, world, ship = null, startRing, turnRing;
let currentLocation = 'paris', currentShip = 'no6';
const wind = new THREE.Vector3(3.4, 0, 0.7);
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

function loadWorld(loc) {
  currentLocation = loc;
  scene = new THREE.Scene();
  world = loc === 'paris' ? buildWorld(scene) : buildWorldMonaco(scene);
  startRing = makeRing(0xd9b24a); startRing.position.copy(world.startRing);
  turnRing = makeRing(0x8a8a8a); turnRing.position.copy(world.turnRing);
  wind.copy(world.windBase);
  race.state = 'idle'; race.t = 0;
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
  if (e.code === 'KeyR') resetShip();
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
    if (ship.landed && race.state === 'idle') loadWorld(currentLocation === 'paris' ? 'monaco' : 'paris');
    else addMsg('noloc', 'Land (and finish the trial) before travelling — the air-ship goes by railway waggon.', 6);
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

// mouse orbit offset (chase cam)
let dragging = false, orbitYaw = 0, orbitPitch = 0;
addEventListener('mousedown', () => dragging = true);
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  orbitYaw -= e.movementX * 0.005;
  orbitPitch = Math.max(-0.5, Math.min(0.9, orbitPitch + e.movementY * 0.004));
});

function pollInput() {
  input.throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
  input.rudder = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? -1 : 0);
  input.pitch = (keys['KeyE'] ? 1 : 0) + (keys['KeyQ'] ? -1 : 0);
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
  menuButton(optsDiv, 'Camera: ' + CAM_NAMES[camMode], 'change view', () => { cycleCamera(); buildMenuButtons(); });
  menuButton(optsDiv, `Photograph mode: ${document.body.classList.contains('photo') ? 'on' : 'off'}`, 'sepia and grain', () => {
    document.body.classList.toggle('photo'); buildMenuButtons();
  });
  menuButton(optsDiv, `Sound: ${muted ? 'off' : 'on'}`, 'the spitting rumble', () => { muted = !muted; buildMenuButtons(); });
  menuButton(optsDiv, 'Controls', 'the key reference', () => { toggleMenu(false); document.getElementById('help').classList.remove('hidden'); });
  menuButton(optsDiv, 'Reset the ship', 'back to the aerodrome', () => { resetShip(); toggleMenu(false); });
  menuButton(optsDiv, 'Resume flying', '', () => toggleMenu(false));
}

function resetShip() {
  const y = ship.spec.keel.drop + 1.2;
  ship.reset(new THREE.Vector3(world.padPos.x, y, world.padPos.z), 0);
  race.state = 'idle'; race.t = 0;
  setCenter('', '');
  seen.clear();
}

// ---------------------------------------------------------------- race
const race = { state: 'idle', t: 0, count: 0, sputterAt: 0, best: +(localStorage.getItem('myairships_best') || 0) };

function tryStartRace() {
  document.getElementById('help').classList.add('hidden');
  if (race.state !== 'idle' || ship.wrecked) return;
  if (ship.pos.distanceTo(world.startRing) > 150) {
    addMsg('far', 'Convoke the Commission at the gold start ring, above the aerodrome.', 6);
    return;
  }
  race.state = 'count'; race.count = 3.5;
}

function updateRace(dt) {
  const s = race.state;
  startRing.material.color.set(s === 'out' ? 0x8a8a8a : 0xd9b24a);
  turnRing.material.color.set(s === 'out' ? 0xd9b24a : 0x8a8a8a);
  const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.05;
  (s === 'out' ? turnRing : startRing).scale.setScalar(pulse);
  (s === 'out' ? startRing : turnRing).scale.setScalar(1);

  if (s === 'count') {
    race.count -= dt;
    const n = Math.ceil(race.count);
    setCenter(n > 0 ? String(n) : '“Let go all!”', '');
    if (race.count <= 0) {
      race.state = 'out'; race.t = 0;
      setTimeout(() => setCenter('', ''), 1200);
    }
  } else if (s === 'out') {
    race.t += dt;
    if (ship.pos.distanceTo(world.turnRing) < 30) {
      race.state = 'back';
      race.sputterAt = race.t + 10 + Math.random() * 18;
      addMsg('turn', world.hints.turnMsg, 0);
    }
  } else if (s === 'back') {
    race.t += dt;
    if (race.sputterAt && race.t > race.sputterAt && !ship.sputtering) {
      ship.sputtering = true; race.sputterAt = 0;
      addMsg('sputter', 'The capricious motor is stopping! Abandon the wheel — work the levers! (tap F)', 0);
    }
    if (ship.pos.distanceTo(world.startRing) < 30) {
      race.state = 'done';
      finishRace();
    }
  }
}

function finishRace() {
  const t = race.t;
  const won = t <= world.raceLimit;
  const beatSantos = t <= world.raceRecord;
  if (won && (!race.best || t < race.best)) {
    race.best = t; localStorage.setItem('myairships_best', String(t));
  }
  setCenter(won ? '“Have I won?” — “YES!”' : 'The half-hour is past…',
    won ? `${fmt(t)} — the Deutsch Prize is yours.` + (beatSantos ? ' You have outflown Santos-Dumont himself (29:31).' : '')
        : `${fmt(t)} — “Errors do not count. I have learned my lesson.” (R to try again)`);
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

  // Eiffel Tower — the one unsurvivable impact (A3, Paris only)
  if (world.towerPos) {
    for (const { q, r } of pts) {
      const dx = q.x - world.towerPos.x, dz = q.z - world.towerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < towerRadiusAt(q.y) + r) {
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

function setCenter(big, sub) {
  document.getElementById('centerBig').textContent = big;
  document.getElementById('centerSub').textContent = sub;
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
  if (audio) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 50;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 320;
  const gain = ctx.createGain(); gain.gain.value = 0;
  osc.connect(filt).connect(gain).connect(ctx.destination);
  osc.start();
  audio = { ctx, osc, gain };
}
function updateAudio() {
  if (!audio) return;
  const h = ship.motorHealth;
  const flicker = ship.sputtering && Math.random() < 0.35 ? 0.15 : 1;
  const target = muted || ship.wrecked || !ship.motorOn ? 0 : ship.throttle * 0.055 * flicker * (0.4 + 0.6 * h);
  audio.gain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.05);
  audio.osc.frequency.setTargetAtTime(42 + 75 * ship.throttle * h, audio.ctx.currentTime, 0.1);
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
    const lat = new THREE.Vector3(-fwd.z, 0, fwd.x);
    desired = p.clone().addScaledVector(lat, 60).add(new THREE.Vector3(0, 6, 0));
    look = p;
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
  el('wind').textContent = `${Math.round(Math.hypot(w.x, w.z) * 3.6)} km/h ${currentLocation === 'paris' ? 'from the west' : 'along the coast'}`;
  el('gasBar').style.width = ship.gas + '%';
  el('gasPct').textContent = Math.round(ship.gas) + '%';
  const fMax = ship.spec.physics.fuel;
  el('fuelBar').style.width = (fMax ? (ship.fuel / fMax) * 100 : 0) + '%';
  el('fuelPct').textContent = fMax ? Math.round((ship.fuel / fMax) * 100) + '%' : '—';
  el('ballast').textContent = ship.bags > 0 ? '◆'.repeat(ship.bags) : '—';
  el('pressWarn').style.visibility =
    (ship.pressure > ship.spec.physics.pressureLimit * 0.97 || ship.foulTime > 0.5) ? 'visible' : 'hidden';

  const s = race.state;
  el('timer').textContent = (s === 'out' || s === 'back') ? fmt(race.t) : (s === 'done' ? fmt(race.t) : '');
  let obj = '';
  if (s === 'idle') obj = ship.pos.distanceTo(world.startRing) < 150
    ? world.hints.idleNear : world.hints.idleFar;
  else if (s === 'out') obj = `${world.hints.out} — ${Math.round(ship.pos.distanceTo(world.turnRing))} m`;
  else if (s === 'back') obj = `${world.hints.back} — ${Math.round(ship.pos.distanceTo(world.startRing))} m`;
  else if (s === 'done') obj = 'Trial complete. R to fly again.';
  el('objective').textContent = obj;
  el('best').textContent = race.best ? `best: ${fmt(race.best)} · limit ${fmt(world.raceLimit)} (the historic 30:00)` : `limit ${fmt(world.raceLimit)} (the historic 30:00)`;
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
window.__game = { get ship() { return ship; }, get camMode() { return camMode; }, get world() { return world; }, camera, camPos, input, keys, race, wind };

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (menuOpen) { updateCamera(dt); composer.render(); return; }  // paused while the menu is up

  windGustT += dt;
  wind.x = world.windBase.x + Math.sin(windGustT * 0.13) * 0.7 + Math.sin(windGustT * 0.041 + 2) * 0.9;
  wind.z = world.windBase.z + Math.sin(windGustT * 0.07 + 1) * 0.5;

  pollInput();
  const env = {
    underCloud: underCloud(world.clouds, ship.pos.x, ship.pos.z),
    inBois: world.isInBois(ship.pos.x, ship.pos.z),
    buildings: world.buildings,
  };
  ship.update(dt, input, wind, env);
  checkCollisions(dt);
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

  // sun shadow frustum follows the ship; water shimmers
  if (world.sun) {
    world.sun.position.copy(ship.pos).addScaledVector(world.sunDir, 900);
    world.sun.target.position.copy(ship.pos);
    world.sun.target.updateMatrixWorld();
  }
  if (world.waters) for (const w of world.waters) w.material.uniforms.time.value += dt * 0.5;

  updateCamera(dt);
  updateHUD();
  updateAudio();
  composer.render();
}
requestAnimationFrame(frame);
