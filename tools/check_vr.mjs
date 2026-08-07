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
const renderer = { xr: { enabled:false, getController: () => new THREE.Group(),
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

const items = ['The No. 6','The No. 9','Paris','Monaco','St. Louis','A postcard hunt']
  .map((l,i) => ({ label: l, sub: 'row ' + i, onClick: () => fired.push('pressed:' + l) }));
vr.showMenu(true, items, 'SOLO');
console.log('board showing =', vr.menuShowing());

// one controller, right hand: push the stick down twice, then the trigger
const gp = { axes:[0,0,0,0], buttons: Array.from({length:6},()=>({pressed:false})) };
fakeSession.inputSources = [{ handedness:'right', gamepad: gp }];
const step = () => vr.pollVR(null);
const push = (v) => { gp.axes[3] = v; step(); gp.axes[3] = 0; step(); };
push(1); push(1);                       // down two rows
gp.buttons[0].pressed = true; step();   // trigger
gp.buttons[0].pressed = false; step();
console.log('fired:', fired.join(', '));
let fails = 0;
if (!fired.some((f) => f === 'pressed:Paris')) {
  console.log('   FAIL the stick and trigger did not work the board');
  fails++;
} else {
  console.log('   ok   two pushes moved the selection two rows and the trigger pressed it');
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

// a session that ends must put everything back
listeners.sessionend();
if (vr.inVR() || vr.menuShowing()) { console.log('   FAIL the session did not end cleanly'); fails++; }
else console.log('   ok   the session ends and hands the flat game back');

console.log('');
console.log(fails === 0 ? 'ALL CHECKS PASS' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
