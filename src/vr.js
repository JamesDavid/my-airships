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

// the controls, latched between frames like the ship's own levers
const pad = { throttle: 0, rudder: 0, pitch: 0, vent: false, coax: false };
let ballastEdge = false, ventEdge = false, camEdge = false, menuEdge = false;
let sparkEdge = false, sparkHeld = 0, menuPressEdge = false;
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
  rig = new THREE.Group();
  rig.name = 'xrRig';

  VR_ACTIONS.ballast = opts.onBallast || (() => {});
  VR_ACTIONS.camera = opts.onCamera || (() => {});
  VR_ACTIONS.menu = opts.onMenu || (() => {});
  VR_ACTIONS.start = opts.onStart || (() => {});
  VR_ACTIONS.end = opts.onEnd || (() => {});

  for (const i of [0, 1]) {
    const c = renderer.xr.getController(i);
    if (c) rig.add(c);
  }

  renderer.xr.addEventListener('sessionstart', () => {
    session = renderer.xr.getSession();
    enabled = true;
    // the eye is IN the basket, so the near plane has to let the instruments in
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    if (camera.parent !== rig) rig.add(camera);
    VR_ACTIONS.start();
  });
  renderer.xr.addEventListener('sessionend', () => {
    session = null;
    enabled = false;
    camera.near = 0.5;
    camera.updateProjectionMatrix();
    if (camera.parent === rig) rig.remove(camera);
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
export function seatIn(eye, yaw) {
  if (!rig) return;
  rig.position.copy(eye);
  rig.rotation.y = yaw;
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
let stickLatch = 0;

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
  if (menuIndex >= menuItems.length) menuIndex = Math.max(0, menuItems.length - 1);
  drawMenu(title);
}

export function showMenu(on, items, title) {
  ensureMenuBoard();
  menuOn = !!on && enabled;
  if (items) setMenu(items, title);
  if (menuMesh) menuMesh.visible = menuOn;
  if (menuOn) drawMenu(title);
}

export function menuShowing() { return menuOn; }

function drawMenu(title) {
  if (!menuCanvas) return;
  const key = menuIndex + '|' + menuItems.length + '|'
    + menuItems.map((i) => i.label).join('~') + '|' + (title || '');
  if (key === menuKey) return;                 // no upload unless something moved
  menuKey = key;
  const g = menuCanvas.getContext('2d');
  const W = menuCanvas.width, H = menuCanvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(16,13,10,0.94)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#6b5a3e'; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16);
  g.textBaseline = 'middle';
  g.fillStyle = '#e8c477';
  g.font = 'bold 34px Georgia, serif';
  g.fillText(title || 'MY AIRSHIPS', 34, 52);
  g.fillStyle = '#7a6b4e';
  g.font = 'italic 20px Georgia, serif';
  g.fillText('stick to choose · trigger to press · B to close', 34, 88);

  // a window of eleven, so a long list scrolls instead of overflowing
  const PER = 11, rowH = 74;
  const first = Math.max(0, Math.min(menuIndex - 5, menuItems.length - PER));
  for (let k = 0; k < PER; k++) {
    const i = first + k;
    if (i >= menuItems.length) break;
    const it = menuItems[i];
    const y = 140 + k * rowH;
    if (i === menuIndex) {
      g.fillStyle = 'rgba(232,196,119,0.20)';
      g.fillRect(24, y - 30, W - 48, rowH - 8);
      g.fillStyle = '#e8c477';
      g.fillText('▸', 34, y);
    }
    g.fillStyle = i === menuIndex ? '#f6e8c8' : '#c3b391';
    g.font = (i === menuIndex ? 'bold ' : '') + '30px Georgia, serif';
    g.fillText(String(it.label).slice(0, 34), 66, y - 8);
    if (it.sub) {
      g.fillStyle = '#8b7a5c';
      g.font = 'italic 21px Georgia, serif';
      g.fillText(String(it.sub).slice(0, 44), 66, y + 20);
    }
  }
  if (menuItems.length > PER) {
    g.fillStyle = '#7a6b4e';
    g.font = '20px Georgia, serif';
    g.fillText((menuIndex + 1) + ' of ' + menuItems.length, 34, H - 34);
  }
  menuTex.needsUpdate = true;
}

// stick navigation, latched so one push moves one row
function menuNav(sy, press) {
  if (!menuOn) return false;
  if (Math.abs(sy) < 0.55) stickLatch = 0;
  else if (!stickLatch) {
    stickLatch = 1;
    menuIndex = Math.max(0, Math.min(menuItems.length - 1,
      menuIndex + (sy > 0 ? 1 : -1)));
    drawMenu();
    rumble(0.25, 20);
  }
  if (press) {
    const it = menuItems[menuIndex];
    if (it && it.onClick) { rumble(0.6, 45); it.onClick(); }
    return true;
  }
  return true;
}

// ---------------------------------------------------------------- the levers
// Quest Touch, and anything reporting the same standard mapping:
//
//   left  stick  Y   the carburating lever — push forward for more
//   right stick  X   the helm
//   right stick  Y   the shifting weights (trim)
//   either grip      coax the motor when she sputters (the F key) — or take
//                    hold of the ALLUM. lever itself and squeeze the trigger
//   A / X            change the view
//   B / Y            the menu — or pull the brass bell-ring in the basket
//
// BALLAST AND THE VALVE ARE NOT ON BUTTONS. They hang in the basket on their
// own cords, and you pull them — reach a hand to the toggle and squeeze the
// trigger. That is not decoration: it is how the ship was actually worked.
// Ch. XI, of the No. 5's water ballast, "their two spigots were so arranged
// that they could be opened and shut from my basket by means of two steel
// wires." The valve was on a cord to the hand in the same way.
//
// The trigger still works as a plain button when your hand is nowhere near a
// cord — left for ballast, right for the valve — so a pilot who cannot reach,
// or who is sitting down, is not locked out of half the ship.
//
// Sticks are DEAD-ZONED at 0.12: a Touch stick at rest reports a few
// hundredths, and a helm that is never quite centred makes a ship that will not
// fly straight, which on the Deutsch course is the difference between rounding
// the Tower and drifting past it.
const DEAD = 0.12;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
const GRAB = 0.16;                 // how near the toggle a hand must be, in metres

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
  reach.ballast = false; reach.vent = false; reach.spark = false; reach.menu = false;

  let i = -1;
  for (const src of session.inputSources) {
    i++;
    const g = src.gamepad;
    if (!g) continue;
    const ax = g.axes || [];
    // xr-standard puts the thumbstick at axes 2/3; touchpad-only controllers
    // put it at 0/1, so take whichever pair is present
    const sx = ax.length > 2 ? ax[2] : ax[0] || 0;
    const sy = ax.length > 3 ? ax[3] : ax[1] || 0;
    const trigger = !!(g.buttons[0] && g.buttons[0].pressed);
    const grip = !!(g.buttons[1] && g.buttons[1].pressed);
    const bA = !!(g.buttons[4] && g.buttons[4].pressed);
    const bB = !!(g.buttons[5] && g.buttons[5].pressed);
    const left = src.handedness === 'left';

    // WITH THE BOARD UP THE STICKS DRIVE IT, not the ship. Otherwise choosing a
    // scenario means shoving the helm hard over while you do it.
    if (menuOn) {
      if (src.handedness === 'right' || session.inputSources.length === 1) {
        menuNav(sy, trigger && !menuPressEdge);
      }
      menuPressEdge = trigger;
      if (bB) sawMenu = true;
      continue;
    }

    if (left) { pad.throttle = -dz(sy); }
    else if (src.handedness === 'right') { pad.rudder = -dz(sx); pad.pitch = -dz(sy); }
    if (grip) pad.coax = true;
    if (bA) sawCam = true;
    if (bB) sawMenu = true;

    // where is this hand, and is it on a cord?
    const ctrl = renderer.xr.getController(handIndex(src, i));
    let onCord = null;
    if (ctrl && ship && ship.cordAt) {
      ctrl.getWorldPosition(_hp);
      for (const id of ['ballast', 'vent', 'spark', 'menu']) {
        const cp = ship.cordAt(id, _cp);
        if (cp && _hp.distanceTo(cp) < GRAB) { onCord = id; reach[id] = true; break; }
      }
    }
    if (trigger) {
      if (onCord === 'ballast') sawBallast = true;
      else if (onCord === 'vent') pad.vent = true;
      else if (onCord === 'spark') sawSpark = true;
      else if (onCord === 'menu') sawMenu = true;
      else if (left) sawBallast = true;         // the plain-button fallback
      else pad.vent = true;
    }
  }

  // edges, so holding a button does not fire it ninety times a second
  if (sawBallast && !ballastEdge) { VR_ACTIONS.ballast(); if (ship) ship.pullCord('ballast'); rumble(0.5, 45); }
  // ALLUM. — a jab at the spark, which is `coax` and the F key. Held, it
  // repeats slowly rather than sixty times a second, because that is what
  // working a stiff lever feels like and what the motor is worth per jab.
  if (sawSpark) {
    sparkHeld += 1;
    if (!sparkEdge || sparkHeld % 20 === 0) {
      pad.coax = true;
      if (ship) ship.pullCord('spark');
      rumble(0.65, 35);
    }
  } else sparkHeld = 0;
  sparkEdge = sawSpark;
  if (pad.vent && !ventEdge && ship) ship.pullCord('vent');
  if (sawCam && !camEdge) VR_ACTIONS.camera();
  if (sawMenu && !menuEdge) { VR_ACTIONS.menu(); if (ship) ship.pullCord('menu'); rumble(0.4, 40); }
  ballastEdge = sawBallast; ventEdge = pad.vent;
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
export const reach = { ballast: false, vent: false, spark: false, menu: false };

/** A short buzz in both hands — a cord pulled, a gate passed, a wall touched. */
export function rumble(strength = 0.4, ms = 60) {
  if (!enabled || !session) return;
  for (const src of session.inputSources) {
    const act = src.gamepad && src.gamepad.hapticActuators
      && src.gamepad.hapticActuators[0];
    if (act && act.pulse) { try { act.pulse(strength, ms); } catch { /* none fitted */ } }
  }
}
