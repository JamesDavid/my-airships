// The basket, in a headset.
//
// Santos-Dumont's whole argument for the dirigible over the aeroplane was that
// you STAND in it — "I looked down upon the air-ship" — and the game already
// models what you would be standing among: a barometer face, a compass, the
// ballast sacks along the rim, the trim cords, the guide rope going over the
// side. Camera mode 1 puts the eye an inch from those instruments. In a headset
// you simply are there, and you read the barometer by leaning toward it.
//
// SO THIS ADDS NOTHING TO THE WORLD. It moves the eye into the basket, hands
// the controls to the two Touch controllers, and gets out of the way. Every
// number, every scenario and every course is the same one the desktop flies.
//
// WHAT IT MUST NOT DO is disturb the flat game. WebXR is offered only where the
// browser reports a headset; on a desktop or a phone nothing here runs at all,
// beyond one feature test at boot.
import * as THREE from 'three';

// ---------------------------------------------------------------- the seat
// The XR camera's pose comes from the headset and is expressed in the local
// reference space. To put the pilot somewhere in the world you move the space
// itself, which in three.js means parenting the camera to a Group and moving
// THAT — the headset then adds the pilot's own head movement on top, which is
// exactly the relationship a basket has to the man standing in it.
let rig = null, camera = null, renderer = null;
let enabled = false;            // the browser has a headset and said yes
let session = null;
const hand = { left: null, right: null };
const hands = [];

// a wicker-brown glove: fist, cuff, and a pale fingertip AT THE GRAB POINT, so
// what the game measures and what the pilot sees are the same spot
function makeHand() {
  const g = new THREE.Group();
  const glove = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glove);
  fist.scale.set(1, 0.85, 1.25);
  fist.position.set(0, 0, -0.02);
  g.add(fist);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.07, 10),
    new THREE.MeshLambertMaterial({ color: 0x5c4630 }));
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, 0, 0.055);
  g.add(cuff);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8dcc0, emissive: 0x2a2418 }));
  g.add(tip);                                   // at the controller's origin
  return g;
}

// the controls, latched between frames like the ship's own levers
const pad = { throttle: 0, rudder: 0, pitch: 0, vent: false, coax: false,
  throttleSet: null };   // throttleSet: an absolute lever position, 0..1
let ballastEdge = false, ventEdge = false, camEdge = false, menuEdge = false;
let sparkEdge = false, sparkHeld = 0, menuPressEdge = false;
let trimHand = -1, trimFrom = 0, trimBase = 0, trimHeldValue = 0;
let carbHand = -1, carbFrom = 0, carbBase = 0, carbValue = 0;
let helmHand = -1, helmFrom = 0, helmBase = 0, helmValue = 0;
const pressed = new Set();

/**
 * Feature-test and wire up. Safe to call anywhere: on a machine with no XR it
 * sets `renderer.xr.enabled` and returns, and nothing else in this file runs.
 *
 * @param opts.onBallast  drop a sack / open a spigot (the SAND/WATER button)
 * @param opts.onCamera   cycle the view (kept, so a seated pilot can look from
 *                        outside the ship without taking the headset off)
 * @param opts.onMenu     open and close the menu
 */
export function initVR(rendererIn, cameraIn, opts = {}) {
  renderer = rendererIn;
  camera = cameraIn;
  renderer.xr.enabled = true;
  // stand on the floor of the basket, not float at an arbitrary origin
  try { renderer.xr.setReferenceSpaceType('local-floor'); } catch { /* older runtime */ }
  // a hair under native, which buys a lot of fill on a mobile chip for very
  // little that the eye can find
  try { renderer.xr.setFramebufferScaleFactor(0.9); } catch { /* older runtime */ }
  rig = new THREE.Group();
  rig.name = 'xrRig';

  VR_ACTIONS.ballast = opts.onBallast || (() => {});
  VR_ACTIONS.camera = opts.onCamera || (() => {});
  VR_ACTIONS.menu = opts.onMenu || (() => {});
  VR_ACTIONS.start = opts.onStart || (() => {});
  VR_ACTIONS.end = opts.onEnd || (() => {});

  // ---- and something to see them with ----
  // The controllers were added to the rig and given nothing to draw, so a
  // pilot had two invisible hands: "i cant see my hands". You cannot reach for
  // a cord you cannot see yourself reaching with.
  //
  // A gloved fist with a short cuff, and a stub of a pointing finger so it is
  // obvious WHERE the hand grabs from — the grab test measures from the
  // controller's own origin, and the fingertip is drawn at that point.
  for (const i of [0, 1]) {
    // guarded: a runtime that hands back something other than an Object3D must
    // not take the whole game down at boot, which is the one thing this file is
    // not allowed to do
    let c = null;
    try { c = renderer.xr.getController(i); } catch { c = null; }
    if (!c || typeof c.add !== 'function') continue;
    c.add(makeHand());
    rig.add(c);
    hands.push(c);
  }

  renderer.xr.addEventListener('sessionstart', () => {
    session = renderer.xr.getSession();
    enabled = true;
    floorFix = null; headMax = 0; seatFrames = 0;   // re-measure for this session
    // THE DEPTH RANGE, which is not a detail.
    //
    // The eye is in the basket, so the near plane has to let the instruments
    // and your own hands in — but I set it to 0.05 against a far plane of
    // 12,000, and a 240,000:1 range leaves so little precision that every
    // painted thing on the ground fights the ground: "a lot of zfighting with
    // different paths on the ground".
    //
    // 0.15 still admits a hand at arm's length and the slate at 0.44 m, and
    // 6,500 still shows the Eiffel Tower from the aerodrome 5.4 km off, which
    // is the furthest anything has to be seen. 43,000:1 — the flat game runs at
    // 24,000:1, so this is the same order rather than ten times worse.
    farWas = camera.far;
    camera.near = 0.15;
    camera.far = 6500;
    camera.updateProjectionMatrix();
    if (camera.parent !== rig) rig.add(camera);

    // ---- WHAT A HEADSET CANNOT AFFORD ----
    // A flat frame here draws the scene twice: once for the shadow map, once
    // for the eye. An XR frame drew it FOUR times — shadow map, the Water
    // addon's reflection, and then both eyes — at ninety hertz on a mobile
    // chip, which is where "the framerate seems low and tracking seems to lag"
    // comes from.
    //
    // The shadow map is the easy half: the sun follows the ship, so it is
    // regenerated in full every single frame.
    if (renderer.shadowMap) {
      shadowWas = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
    }
    // and let the runtime blur the edges of vision, which is free quality
    try { renderer.xr.setFoveation(1); } catch { /* older runtime */ }
    VR_ACTIONS.start();
  });
  renderer.xr.addEventListener('sessionend', () => {
    session = null;
    enabled = false;
    camera.near = 0.5;
    if (farWas) { camera.far = farWas; farWas = 0; }
    camera.updateProjectionMatrix();
    if (camera.parent === rig) rig.remove(camera);
    if (shadowWas !== null && renderer.shadowMap) { renderer.shadowMap.enabled = shadowWas; }
    shadowWas = null;
    VR_ACTIONS.end();
  });
  return true;
}

const VR_ACTIONS = { ballast: () => {}, camera: () => {}, menu: () => {},
  start: () => {}, end: () => {} };

/**
 * Put the rig into the current scene. Travelling between Paris, Monaco and
 * St. Louis builds a WHOLE NEW SCENE and disposes the old one, so the rig — and
 * with it the camera and both controllers — has to be carried across, or the
 * pilot is left standing in a world that has been taken away.
 */
export function attachTo(scene) {
  if (rig && scene && rig.parent !== scene) scene.add(rig);
}

/** Is a headset session running right now? */
export function inVR() { return enabled; }

/**
 * Offer the button, but only where there is something to press it with.
 * `navigator.xr` exists in plenty of browsers that have no headset attached,
 * so this asks whether an immersive session is actually supported and stays
 * silent when it is not — no dead button on a laptop.
 */
export async function offerVR(mount, onEnter) {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return false;
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported('immersive-vr'); }
  catch { return false; }
  if (!ok) return false;

  const b = document.createElement('button');
  b.id = 'vrBtn';
  b.textContent = 'ENTER VR';
  b.title = 'Stand in the basket (Meta Quest and other WebXR headsets)';
  b.addEventListener('click', async () => {
    if (session) { session.end(); return; }
    try {
      const s = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      await renderer.xr.setSession(s);
      if (onEnter) onEnter();
    } catch (e) {
      b.textContent = 'VR REFUSED';
      setTimeout(() => { b.textContent = 'ENTER VR'; }, 2500);
    }
  });
  (mount || document.body).appendChild(b);
  return true;
}

// ---------------------------------------------------------------- the seat
/**
 * Put the pilot in the basket. `eye` is the world point the head should be at
 * (the same eyePoint camera mode 1 uses) and `yaw` is the ship's heading, so
 * that "forward" is over the bow and turning the ship turns the world about
 * you rather than swivelling your neck.
 *
 * The headset's own translation rides on top, which is what makes leaning
 * toward the barometer work.
 */
let floorFix = null;          // measured once a session: does the space have a floor?
let headMax = 0, seatFrames = 0;
let shadowWas = null, farWas = 0;

/**
 * Put the pilot in the basket. `deck` is the top of the floor he stands on —
 * the ship's own deckPoint — and `eye` is where a standing man's eyes would be,
 * used only where the runtime gives no floor. `yaw` is her heading, so forward
 * is over the bow and turning the ship turns the world about you.
 *
 * SEAT THE DECK, NOT THE EYE. With a local-floor reference space WebXR reports
 * the head at the pilot's own standing height above the physical floor. Putting
 * the rig at the modelled eye stacked one on the other and left him hanging a
 * metre and a half over the ship looking down into it — "I am like sitting 3-5
 * feet above the basket, not in the basket". The headset supplies the man; a
 * tall pilot sees further over the rim than a short one, which is right.
 */
export function seatIn(deck, yaw, eye) {
  if (!rig || !camera) return;
  // Decided over a second, not on the first frame — on frame one the pose may
  // not have been written yet, and latching a correction off that zero would
  // put the pilot right back up in the air. Until it settles we assume the
  // local-floor we asked for: too low for a moment rather than floating.
  if (floorFix === null && enabled) {
    headMax = Math.max(headMax, camera.position.y || 0);
    if (++seatFrames > 60) floorFix = headMax > 0.8;
  }
  rig.position.copy(floorFix === false && eye ? eye : deck);
  rig.rotation.y = yaw;
}

// ---------------------------------------------------------------- the view
// PARIS IS TOO MANY THINGS TO DRAW TWICE.
//
// Counted: 777 top-level objects and about 1,714 leaf meshes, which is 1,714
// draw calls per eye and near 3,400 a frame. A Quest wants under two hundred.
// It is worst looking east from St-Cloud because that is where all of them are
// — "the framerate problems occur when i look toward paris... must be all the
// buildings etc over that way", which is exactly right.
//
// So: cull by distance, but SCALED BY SIZE, because the whole game is being
// able to see the Eiffel Tower from the aerodrome five kilometres off. A thing
// stays drawn while it is big enough in the view to be worth a draw call —
// which keeps the Tower, the Trocadéro and the two Palais, and drops the
// window-boxes of Passy from four kilometres away.
//
// The ground itself, the river, the roads and the sky are exempt: they are
// already single meshes covering everything, and they carry `noLift` for the
// same reason (see liftToTerrain).
// Seen from anywhere: `userData.vrFar`, set by the world on the things a pilot
// navigates by. NOT a size heuristic — I wrote one of those first, measuring
// each object's bounding box, and could not test it at all: the headless three
// stub returns the same box for everything, so the numbers it produced were
// fiction and the real rule culled the Eiffel Tower from the aerodrome. The
// world knows which of its objects are monuments. Let it say so.
const KEEP_NEAR = 900;
const SMALL = 60;             // half-extent, in metres: bigger than this is scenery you steer by

let cullScene = null, cullList = null;

/** Forget the list — the world has been rebuilt. */
export function resetCull() { cullScene = null; cullList = null; }

/**
 * Hide the near-field clutter you have flown past.
 *
 * SAFE BY DEFAULT, and it was not: the first version culled anything it had
 * not been told to keep, and what it took away was the sky. The sky dome sits
 * at the origin and is ten kilometres across, so from the aerodrome it was
 * 4.9 km off and went black — while within 900 m of the Eiffel Tower, which is
 * where the origin is, it came back. "The sky is black unless im near the
 * eiffel tower" is exactly that, and the clouds went with it.
 *
 * So the rule is inverted. An object is culled only if it is BOTH far away AND
 * measurably small; if it cannot be measured it is kept. Anything the world
 * marked (noLift for the ground and the river, vrFar for the monuments, the
 * sky and the clouds) is never even considered.
 */
export function cullForVR(from, scene) {
  if (!enabled || !scene) return 0;
  if (cullScene !== scene) {
    cullScene = scene;
    cullList = [];
    const box = new THREE.Box3(), sz = new THREE.Vector3();
    for (const o of scene.children) {
      if (!o || !o.position || o === rig) continue;
      const u = o.userData || {};
      if (u.noLift || u.vrFar) continue;
      if (o.isLight || o.isCamera || o.isInstancedMesh) continue;
      // measure once. A failure, or anything big, means KEEP — the cost of
      // being wrong that way is a few draw calls; the other way it is the sky.
      let r = Infinity;
      try {
        box.makeEmpty();
        box.setFromObject(o);
        if (!box.isEmpty()) { box.getSize(sz); r = Math.max(sz.x, sz.y, sz.z) * 0.5; }
      } catch { r = Infinity; }
      if (!Number.isFinite(r) || r > SMALL) continue;
      cullList.push(o);
    }
  }
  let hidden = 0;
  for (const o of cullList) {
    const dx = o.position.x - from.x, dz = o.position.z - from.z;
    const on = dx * dx + dz * dz < KEEP_NEAR * KEEP_NEAR;
    if (o.visible !== on) o.visible = on;
    if (!on) hidden++;
  }
  return hidden;
}

/** Put everything back when the headset comes off. */
export function uncull() {
  if (!cullList) return;
  for (const o of cullList) o.visible = true;
}

// ---------------------------------------------------------------- the menu
// A DOM menu does not exist inside a headset. WebXR draws the WebGL scene and
// nothing else, so every button, panel and board in index.html is simply not
// there — and because opening the menu also PAUSES the simulation, the first
// version of this shipped a B button that froze the pilot in front of an
// invisible menu with no way back. That is the whole reason this exists.
//
// It is the same menu: main.js funnels every entry through menuButton(), which
// now records what it built, and this draws that list on a board hung a metre
// and a bit in front of the basket. The stick moves the selection, the trigger
// presses it. Nothing is duplicated, so a button added to the flat menu appears
// here without anyone remembering to add it twice.
let menuMesh = null, menuTex = null, menuCanvas = null;
let menuItems = [], menuIndex = 0, menuOn = false, menuKey = '';
let stickLatch = 0, tabLatch = 0, menuTab = 'solo';
const TABS = [['solo', 'SOLO'], ['together', 'TOGETHER'], ['ship', 'SHIP'],
  ['place', 'PLACE'], ['options', 'OPTIONS']];
const shown = () => menuItems.filter((i) => (i.tab || 'solo') === menuTab);

function ensureMenuBoard() {
  if (menuMesh || !rig) return;
  const c = document.createElement('canvas');
  c.width = 768; c.height = 1024;
  menuCanvas = c;
  menuTex = new THREE.CanvasTexture(c);
  menuTex.colorSpace = THREE.SRGBColorSpace;
  menuMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2),
    new THREE.MeshBasicMaterial({ map: menuTex, transparent: true, depthTest: false }));
  menuMesh.renderOrder = 999;              // over the world, like a held card
  // the rig is turned to the ship's heading, so its local +x is over the bow
  menuMesh.position.set(1.15, 0.05, 0);
  menuMesh.rotation.y = -Math.PI / 2;
  menuMesh.visible = false;
  rig.add(menuMesh);
}

/** Hand the flat menu's own buttons over. `items` is [{label, sub, onClick}]. */
export function setMenu(items, title) {
  menuItems = items || [];
  while (menuItems[menuIndex] && menuItems[menuIndex].head) menuIndex++;
  if (menuIndex >= menuItems.length) menuIndex = Math.max(0, menuItems.length - 1);
  drawMenu(title);
}

export function showMenu(on, items, tab) {
  ensureMenuBoard();
  menuOn = !!on && enabled;
  if (items) setMenu(items, tab);
  if (menuMesh) menuMesh.visible = menuOn;
  if (menuOn) drawMenu();
}

export function menuShowing() { return menuOn; }

function drawMenu() {
  if (!menuCanvas) return;
  const rows = shown();
  const key = menuTab + '|' + menuIndex + '|' + rows.map((i) => i.label).join('~');
  if (key === menuKey) return;                 // no upload unless something moved
  menuKey = key;
  const g = menuCanvas.getContext('2d');
  const W = menuCanvas.width, H = menuCanvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(16,13,10,0.94)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#6b5a3e'; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16);
  g.textBaseline = 'middle';

  // ---- the tab strip: the same five the page has ----
  const tw = (W - 48) / TABS.length;
  TABS.forEach(([id, name], i) => {
    const x = 24 + i * tw, on = id === menuTab;
    if (on) {
      g.fillStyle = 'rgba(232,196,119,0.22)';
      g.fillRect(x, 26, tw - 4, 46);
    }
    g.fillStyle = on ? '#f6e8c8' : '#7a6b4e';
    g.font = (on ? 'bold ' : '') + '21px Georgia, serif';
    g.textAlign = 'center';
    g.fillText(name, x + tw / 2 - 2, 49);
  });
  g.textAlign = 'left';
  g.strokeStyle = 'rgba(232,196,119,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(24, 78); g.lineTo(W - 24, 78); g.stroke();
  g.fillStyle = '#7a6b4e';
  g.font = 'italic 19px Georgia, serif';
  g.fillText('stick left/right for the tabs · up/down to choose · grip to press', 26, 100);

  if (!rows.length) {
    g.fillStyle = '#8b7a5c';
    g.font = 'italic 26px Georgia, serif';
    g.fillText('nothing here just now', 34, 170);
    menuTex.needsUpdate = true;
    return;
  }

  // a window of ten, so a long tab scrolls instead of overflowing
  const PER = 10, rowH = 76;
  const first = Math.max(0, Math.min(menuIndex - 5, rows.length - PER));
  for (let k = 0; k < PER; k++) {
    const i = first + k;
    if (i >= rows.length) break;
    const it = rows[i];
    const y = 156 + k * rowH;
    if (i === menuIndex) {
      g.fillStyle = 'rgba(232,196,119,0.20)';
      g.fillRect(24, y - 30, W - 48, rowH - 8);
      g.fillStyle = '#e8c477';
      g.fillText('▸', 34, y);
    }
    g.fillStyle = i === menuIndex ? '#f6e8c8' : (it.current ? '#c8b98a' : '#c3b391');
    g.font = (i === menuIndex ? 'bold ' : '') + '29px Georgia, serif';
    g.fillText(String(it.label).slice(0, 34), 66, y - 8);
    if (it.sub) {
      g.fillStyle = '#8b7a5c';
      g.font = 'italic 20px Georgia, serif';
      g.fillText(String(it.sub).slice(0, 46), 66, y + 20);
    }
  }
  if (rows.length > PER) {
    g.fillStyle = '#7a6b4e';
    g.font = '20px Georgia, serif';
    g.fillText((menuIndex + 1) + ' of ' + rows.length, 34, H - 30);
  }
  menuTex.needsUpdate = true;
}

// stick navigation, latched so one push moves one row
function menuNav(sy, press, sx) {
  if (!menuOn) return false;
  // left and right walk the tabs, exactly as clicking them does on the page
  if (Math.abs(sx) < 0.55) tabLatch = 0;
  else if (!tabLatch) {
    tabLatch = 1;
    let t = TABS.findIndex(([id]) => id === menuTab);
    t = Math.max(0, Math.min(TABS.length - 1, t + (sx > 0 ? 1 : -1)));
    menuTab = TABS[t][0];
    menuIndex = 0;
    drawMenu();
    rumble(0.3, 22);
  }
  const rows = shown();
  if (Math.abs(sy) < 0.55) stickLatch = 0;
  else if (!stickLatch) {
    stickLatch = 1;
    menuIndex = Math.max(0, Math.min(rows.length - 1, menuIndex + (sy > 0 ? 1 : -1)));
    drawMenu();
    rumble(0.25, 20);
  }
  if (press) {
    const it = rows[menuIndex];
    if (it && it.onClick) { rumble(0.6, 45); it.onClick(); }
    return true;
  }
  return true;
}

// ---------------------------------------------------------------- the levers
// Quest Touch, and anything reporting the same standard mapping:
//
//   GRIP             take hold of whatever your hand is touching. That is what
//                    a grip button is FOR, and it was mapped to the ignition
//                    instead — "the grip buttons are mapped to things that they
//                    shouldnt be it should be mapped to grab whatever my hand
//                    is touching". It is now the only thing it does.
//   left  stick  Y   the carburating lever, when your hands are not busy
//   right stick  X   the helm
//   right stick  Y   the shifting weights
//   A / X            change the view
//   B / Y            the ship's book (or pull the brass ring in the basket)
//
// EVERY CONTROL IS A THING IN THE BASKET, and each carries an engraved plate:
//
//   LEST      the ballast — a sack over the side, or the spigot on the water
//             cylinder, depending on the ship (Ch. XI)
//   SOUPAPE   the valve. Pull it and the hydrogen is gone for good
//   ALLUM.    the ignition, for when she sputters
//   CARB.     the carburating lever
//   POIDS     the shifting weights: a fore-and-aft lever you take hold of and
//             MOVE, because trim is a position and not a pull
//   CARNET    the ship's book
//
// The trigger still does what the nearest fitting does, for anyone who finds a
// grip awkward, and the sticks still fly her when no hand is holding anything.
const DEAD = 0.12;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
// How near a fitting a hand must be, in metres. Tighter than it was: the two
// levers on the engine quadrant are neighbours by nature, and a radius wide
// enough to cover both makes the nearer one unreachable.
const GRAB = 0.10;

const _hp = new THREE.Vector3(), _cp = new THREE.Vector3();

/**
 * Read the controllers. `ship` is passed so a hand can be tested against the
 * cords hanging in her basket. Returns the latched control state, or null when
 * no headset is running.
 */
export function pollVR(ship) {
  if (!enabled || !session) return null;
  pad.throttle = 0; pad.rudder = 0; pad.pitch = 0;
  pad.vent = false; pad.coax = false;
  let sawBallast = false, sawCam = false, sawMenu = false, sawSpark = false;
  reach.ballast = false; reach.vent = false; reach.spark = false;
  reach.menu = false; reach.trim = false; reach.carb = false; reach.tiller = false;
  pad.throttleSet = null;
  let anyHeld = false;

  let i = -1;
  for (const src of session.inputSources) {
    i++;
    const g = src.gamepad;
    if (!g) continue;
    const ax = g.axes || [];
    const sx = ax.length > 2 ? ax[2] : ax[0] || 0;
    const sy = ax.length > 3 ? ax[3] : ax[1] || 0;
    const trigger = !!(g.buttons[0] && g.buttons[0].pressed);
    const grip = !!(g.buttons[1] && g.buttons[1].pressed);
    const bA = !!(g.buttons[4] && g.buttons[4].pressed);
    const bB = !!(g.buttons[5] && g.buttons[5].pressed);
    const left = src.handedness === 'left';
    const hold = grip || trigger;          // grip is the grab; trigger is a courtesy

    if (menuOn) {
      if (src.handedness === 'right' || session.inputSources.length === 1) {
        menuNav(sy, hold && !menuPressEdge, sx);
      }
      menuPressEdge = hold;
      if (bB) sawMenu = true;
      continue;
    }

    // WHAT IS THIS HAND TOUCHING?
    const ctrl = renderer.xr.getController(handIndex(src, i));
    let on = null;
    if (ctrl && ship && ship.cordAt && typeof ctrl.getWorldPosition === 'function') {
      ctrl.getWorldPosition(_hp);
      let best = GRAB;
      for (const id of ['ballast', 'vent', 'spark', 'menu', 'trim', 'carb',
        'tillerP', 'tillerS']) {
        const cp = ship.cordAt(id, _cp);
        if (!cp) continue;
        const d = _hp.distanceTo(cp);
        if (d < best) { best = d; on = id; }
      }
      if (on) reach[on] = true;
    }

    // THE SHIFTING WEIGHTS ARE HELD, not pulled: while a hand has the lever,
    // where the hand is IS the trim, and it stays where you let go of it.
    if (on === 'trim' && hold) {
      // fore-and-aft along the SHIP, not along the world: her bow is
      // (cos yaw, 0, -sin yaw), and the rig carries her yaw.
      const yaw = rig.rotation.y;
      const along = _hp.x * Math.cos(yaw) - _hp.z * Math.sin(yaw);
      if (trimHand !== i) { trimHand = i; trimFrom = along; trimBase = trimHeldValue; }
      // BACK FOR UP, FORWARD FOR DOWN — which is also what the weights do:
      // "pulling in the fore weight would cause the stem of the balloon to
      // point diagonally upward" (Ch. VI), and you pull it in toward yourself.
      trimHeldValue = Math.max(-1, Math.min(1, trimBase - (along - trimFrom) / 0.16));
      // the lever itself is driven from the ship's own `pitch` in
      // updateTransforms, so there is nothing to tell it here — one state, one
      // lever, and no second way to move it that could disagree
      anyHeld = true;
    } else if (trimHand === i && !hold) { trimHand = -1; }

    // THE TILLER. Take either grip and move it fore and aft: pushing the port
    // grip forward is pulling the starboard one back, so the two sides read
    // opposite and the helm goes over the same way whichever hand you use.
    if ((on === 'tillerP' || on === 'tillerS') && hold) {
      const yaw = rig.rotation.y;
      const along = _hp.x * Math.cos(yaw) - _hp.z * Math.sin(yaw);
      const side = on === 'tillerP' ? 1 : -1;
      if (helmHand !== i) { helmHand = i; helmFrom = along; helmBase = helmValue; }
      helmValue = Math.max(-1, Math.min(1, helmBase + side * (along - helmFrom) / 0.22));
      anyHeld = true;
    } else if (helmHand === i && !hold) {
      helmHand = -1;
      helmValue *= 0.0;          // let go and she steadies, like a lashed helm let slip
    }

    if (on === 'carb' && hold) {
      const yaw = rig.rotation.y;
      const along = _hp.x * Math.cos(yaw) - _hp.z * Math.sin(yaw);
      if (carbHand !== i) { carbHand = i; carbFrom = along; carbBase = carbValue; }
      carbValue = Math.max(0, Math.min(1, carbBase + (along - carbFrom) / 0.20));
      pad.throttleSet = carbValue;
      anyHeld = true;
    } else if (carbHand === i && !hold) { carbHand = -1; }

    if (hold && on && on !== 'trim' && on !== 'carb'
        && on !== 'tillerP' && on !== 'tillerS') {
      anyHeld = true;
      if (on === 'ballast') sawBallast = true;
      else if (on === 'vent') pad.vent = true;
      else if (on === 'spark') sawSpark = true;
      else if (on === 'menu') sawMenu = true;
    }

    // the sticks fly her whenever that hand is not holding something
    if (!(hold && on)) {
      if (left) pad.throttle = -dz(sy);
      else if (src.handedness === 'right') { pad.rudder = -dz(sx); pad.pitch = -dz(sy); }
    }
    if (bA) sawCam = true;
    if (bB) sawMenu = true;
  }

  // the lever HOLDS ITS SETTING, like the carburating lever: the shifting
  // weights stay where you put them until you move them again
  if (trimHeldValue !== 0) pad.pitch = trimHeldValue;
  if (helmHand >= 0) pad.rudder = helmValue;

  if (sawBallast && !ballastEdge) { VR_ACTIONS.ballast(); if (ship) ship.pullCord('ballast'); rumble(0.5, 45); }
  if (pad.vent && !ventEdge && ship) ship.pullCord('vent');
  if (sawSpark) {
    sparkHeld += 1;
    if (!sparkEdge || sparkHeld % 20 === 0) {
      pad.coax = true;
      if (ship) ship.pullCord('spark');
      rumble(0.65, 35);
    }
  } else sparkHeld = 0;
  if (sawMenu && !menuEdge) { VR_ACTIONS.menu(); if (ship) ship.pullCord('menu'); rumble(0.4, 40); }
  if (sawCam && !camEdge) VR_ACTIONS.camera();
  ballastEdge = sawBallast; ventEdge = pad.vent; sparkEdge = sawSpark;
  camEdge = sawCam; menuEdge = sawMenu;
  return pad;
}

// three.js indexes controllers by their order in the session, which is not
// guaranteed to match handedness; keep a map so a hand keeps its controller
const seen = new Map();
function handIndex(src, fallback) {
  if (!seen.has(src)) seen.set(src, fallback);
  return seen.get(src);
}

/** Is a hand on a cord or lever right now? Used to light the fitting up. */
export const reach = { ballast: false, vent: false, spark: false, menu: false,
  trim: false, carb: false };

/** A short buzz in both hands — a cord pulled, a gate passed, a wall touched. */
export function rumble(strength = 0.4, ms = 60) {
  if (!enabled || !session) return;
  for (const src of session.inputSources) {
    const act = src.gamepad && src.gamepad.hapticActuators
      && src.gamepad.hapticActuators[0];
    if (act && act.pulse) { try { act.pulse(strength, ms); } catch { /* none fitted */ } }
  }
}
