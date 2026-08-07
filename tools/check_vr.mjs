// Drive the headset's controls without a headset.
//
// A DOM menu does not exist inside WebXR, and opening one PAUSES the game — so
// the first cut of this shipped a button that froze the pilot in front of an
// invisible menu with no way out. Nothing but flying it in a Quest would have
// found that, and nobody here has a Quest. So: a fake xr session, a fake
// gamepad, and the real vr.js driven through both.
//
// Use: node tools/check_vr.mjs
import './headless.mjs';
const THREE = await import('three');
const vr = await import('../src/vr.js');

// a fake renderer.xr and session, so the board can be driven without a headset
const listeners = {};
const fakeSession = { inputSources: [], end(){} };
// STABLE controllers, so a test can put a hand somewhere and leave it there.
// They were a fresh Group per call, which meant the grab tests below were
// reaching from the origin and touching nothing — a check that could not fail.
const ctrls = [new THREE.Group(), new THREE.Group()];
for (const c of ctrls) c.getWorldPosition = (v) => (v || new THREE.Vector3()).copy(c.position);
const renderer = { shadowMap: { enabled: true },
  xr: { enabled:false, setReferenceSpaceType(){}, setFramebufferScaleFactor(){}, setFoveation(){},
  getController: (i) => ctrls[i] || ctrls[0],
  addEventListener: (k,f) => { listeners[k]=f; }, getSession: () => fakeSession } };
const camera = new THREE.Group(); camera.updateProjectionMatrix = () => {};
const scene = new THREE.Group();
let fired = [];
vr.initVR(renderer, camera, { onBallast: () => fired.push('ballast'),
  onCamera: () => fired.push('camera'), onMenu: () => fired.push('menu'),
  onStart: () => fired.push('start'), onEnd: () => fired.push('end') });
vr.attachTo(scene);
listeners.sessionstart();
console.log('session started; inVR =', vr.inVR());

// a board shaped like the real one: five tabs, items filed under them
const items = [
  { tab: 'solo', label: 'The Aerial Gymkhana', onClick: () => fired.push('pressed:gymkhana') },
  { tab: 'solo', label: 'The Longchamps Circuit', onClick: () => fired.push('pressed:longchamps') },
  { tab: 'ship', label: 'The No. 6', onClick: () => fired.push('pressed:no6') },
  { tab: 'ship', label: 'The No. 9', onClick: () => fired.push('pressed:no9') },
  { tab: 'place', label: 'Paris', onClick: () => fired.push('pressed:Paris') },
  { tab: 'place', label: 'Monaco', onClick: () => fired.push('pressed:Monaco') },
];
vr.showMenu(true, items, 'solo');
console.log('board showing =', vr.menuShowing());

// one controller, right hand: push the stick down twice, then the trigger
const gp = { axes:[0,0,0,0], buttons: Array.from({length:6},()=>({pressed:false})) };
fakeSession.inputSources = [{ handedness:'right', gamepad: gp }];
const step = () => vr.pollVR(null);
const push = (v) => { gp.axes[3] = v; step(); gp.axes[3] = 0; step(); };
// walk right two tabs to PLACE, then down one row to Monaco: the tabs must
// behave the same way the page's do, and each must show only its own items.
const pushX = (v) => { gp.axes[2] = v; step(); gp.axes[2] = 0; step(); };
pushX(1); pushX(1); pushX(1);      // solo -> together -> ship -> place
push(1);                            // Paris -> Monaco
gp.buttons[0].pressed = true; step();   // trigger
gp.buttons[0].pressed = false; step();
console.log('fired:', fired.join(', '));
let fails = 0;
if (!fired.some((f) => f === 'pressed:Monaco')) {
  console.log('   FAIL the tabs do not walk, or a tab shows the wrong items');
  console.log('        (fired: ' + fired.join(', ') + ')');
  fails++;
} else {
  console.log('   ok   the stick walks the five tabs and each shows only its own');
}

// ...and with the board DOWN the sticks must fly the ship again
vr.showMenu(false);
gp.axes[2] = 1; gp.axes[3] = -1;
const pad = vr.pollVR(null);
if (!pad || pad.rudder === 0 || pad.pitch === 0) {
  console.log('   FAIL the sticks do not reach the helm once the board is down');
  fails++;
} else {
  console.log('   ok   board down, and the sticks fly her again (helm '
    + pad.rudder.toFixed(2) + ', trim ' + pad.pitch.toFixed(2) + ')');
}

// shadows must go off in a session and come back after it
if (renderer.shadowMap.enabled) {
  console.log('   FAIL shadows are still on in a session — that is a whole extra pass');
  fails++;
} else {
  console.log('   ok   the shadow pass is off while the headset is on');
}

// ...and poll with a REAL SHIP in hand, which is the only way to catch a call
// into a method that is not there. `ship.setTrimFromHand is not a function`
// crashed a live headset, and nothing here touched a ship until now.
{
  const { makeShip } = await import('./sim.mjs');
  const sh = makeShip('no6');
  sh.reset({ x: 0, y: 100, z: 0 }, 0);
  sh.updateTransforms(0);
  let threw = null;
  const reached = [];
  gp.buttons[1].pressed = true;              // GRIP: grab whatever is nearest
  for (const id of ['ballast', 'vent', 'spark', 'menu', 'trim', 'carb',
    'tiller']) {
    const p = sh.cordAt(id);
    if (!p) continue;
    ctrls[0].position.copy(p);               // put the hand ON it
    try { for (let k = 0; k < 3; k++) vr.pollVR(sh); }
    catch (e) { threw = id + ': ' + e.message; break; }
    if (vr.reach[id] || vr.reach[id.replace(/P$|S$/, '')]) reached.push(id);
  }
  gp.buttons[1].pressed = false;
  try { vr.pollVR(sh); } catch (e) { threw = threw || 'release: ' + e.message; }
  if (threw) { console.log('   FAIL polling with a ship threw — ' + threw); fails++; }
  else console.log('   ok   every fitting can be grabbed without throwing');
  if (reached.length < 6) {
    console.log('   FAIL a hand laid on a fitting did not reach it: only '
      + reached.length + ' of 7 answered');
    fails++;
  } else {
    console.log('   ok   all ' + reached.length + ' fittings answer a hand laid on them');
  }

  // the carburating lever must produce an absolute setting, not a nudge: it is
  // the one control whose whole character is that you set it and it stays
  gp.buttons[1].pressed = true;
  ctrls[0].position.copy(sh.cordAt('carb'));
  let hasSet = false;
  for (let k = 0; k < 3; k++) { const p = vr.pollVR(sh); if (p && p.throttleSet !== null) hasSet = true; }
  gp.buttons[1].pressed = false; vr.pollVR(sh);
  if (!hasSet) { console.log('   FAIL CARB. does not report a lever position'); fails++; }
  else console.log('   ok   CARB. reports a lever POSITION, not a nudge');
}

// a session that ends must put everything back
listeners.sessionend();
if (!renderer.shadowMap.enabled) {
  console.log('   FAIL shadows were not handed back to the flat game');
  fails++;
} else {
  console.log('   ok   shadows restored when the headset comes off');
}
if (vr.inVR() || vr.menuShowing()) { console.log('   FAIL the session did not end cleanly'); fails++; }
else console.log('   ok   the session ends and hands the flat game back');

console.log('');
console.log(fails === 0 ? 'ALL CHECKS PASS' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
