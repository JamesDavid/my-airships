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
const renderer = { shadowMap: { enabled: true },
  xr: { enabled:false, setReferenceSpaceType(){}, setFramebufferScaleFactor(){}, setFoveation(){},
  getController: () => new THREE.Group(),
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

// a board shaped like the real one: headings between the groups
const items = [
  { head: 'THE SHIPS' },
  ...['The No. 6','The No. 9'].map((l) => ({ label: l, onClick: () => fired.push('pressed:' + l) })),
  { head: 'WHERE TO FLY' },
  ...['Paris','Monaco','St. Louis'].map((l) => ({ label: l, onClick: () => fired.push('pressed:' + l) })),
];
vr.showMenu(true, items, 'SOLO');
console.log('board showing =', vr.menuShowing());

// one controller, right hand: push the stick down twice, then the trigger
const gp = { axes:[0,0,0,0], buttons: Array.from({length:6},()=>({pressed:false})) };
fakeSession.inputSources = [{ handedness:'right', gamepad: gp }];
const step = () => vr.pollVR(null);
const push = (v) => { gp.axes[3] = v; step(); gp.axes[3] = 0; step(); };
// three pushes from the first ship: No. 9, then OVER the heading to Paris,
// then Monaco. A heading is a signpost and must never be selectable.
push(1); push(1); push(1);
gp.buttons[0].pressed = true; step();   // trigger
gp.buttons[0].pressed = false; step();
console.log('fired:', fired.join(', '));
let fails = 0;
if (!fired.some((f) => f === 'pressed:Monaco')) {
  console.log('   FAIL the stick did not step over the headings to a real entry');
  console.log('        (fired: ' + fired.join(', ') + ')');
  fails++;
} else {
  console.log('   ok   the stick steps over headings and the trigger presses an entry');
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
  gp.buttons[1].pressed = true;              // GRIP: grab whatever is nearest
  for (const id of ['ballast', 'vent', 'spark', 'menu', 'trim']) {
    const p = sh.cordAt(id);
    if (!p) continue;
    try { for (let k = 0; k < 4; k++) vr.pollVR(sh); }
    catch (e) { threw = id + ': ' + e.message; break; }
  }
  gp.buttons[1].pressed = false;
  try { vr.pollVR(sh); } catch (e) { threw = threw || 'release: ' + e.message; }
  if (threw) { console.log('   FAIL polling with a ship threw — ' + threw); fails++; }
  else console.log('   ok   every fitting can be grabbed without throwing');
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
