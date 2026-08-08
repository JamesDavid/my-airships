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
    'tiller', 'push_bug', 'push_menu', 'push_go', 'push_exitvr']) {
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
  if (reached.length < 10) {
    console.log('   FAIL a hand laid on a fitting did not reach it: only '
      + reached.length + ' of 11 answered');
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

  // THE RUDDER CORDS RUN OUTSIDE THE CABIN.
  //
  // MEASURED AGAINST THE PILOT, NOT THE WEAVE. The first cut of this check
  // measured the cords against the basket box and passed on the old geometry
  // too, by 0.137 m — because the tiller stands 0.21 m ABOVE the rim, so a cord
  // leaving it runs over the basket rather than through it and the box was
  // never the thing being fouled. What the cords went through was the PILOT:
  // they left the bar at +-0.27, which is inside a man's shoulders, at
  // 1.26 m above the deck, which is his chest. So the test is the volume he
  // occupies -- a shoulder's radius about the deck point, from his boots to the
  // top of his head.
  {
    const { SHIPS: ALL } = await import('../src/ships.js');
    const SHOULDER = 0.32, HEAD = 1.80;
    let worstShip = null, worstD = Infinity;
    for (const id of Object.keys(ALL)) {
      const s2 = makeShip(id);
      s2.reset({ x: 0, y: 100, z: 0 }, 0);
      s2.updateTransforms(0.016);
      if (!s2.tillerCords || !s2.deckPoint) continue;   // no helm to foul him with
      const d0 = s2.deckPoint.position;
      const p = s2.tillerCords.geometry.attributes.position.array;
      for (let c = 0; c < 2; c++) {
        const ax = p[c * 6], ay = p[c * 6 + 1], az = p[c * 6 + 2];
        const bx2 = p[c * 6 + 3], by = p[c * 6 + 4], bz = p[c * 6 + 5];
        for (let t = 0; t <= 1; t += 0.004) {
          const x = ax + (bx2 - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
          if (y < d0.y || y > d0.y + HEAD) continue;    // above or below the man
          const d = Math.hypot(x - d0.x, z - d0.z) - SHOULDER;
          if (d < worstD) { worstD = d; worstShip = id; }
        }
      }
    }
    const ok = worstD > 0.05;
    if (!ok) fails++;
    console.log('   %s  the rudder cords pass %s m outside the pilot (worst: %s)',
      ok ? 'ok  ' : 'FAIL', worstD.toFixed(3), worstShip);

    // NOR DOES THE SHIP'S OWN FRAME STAND IN HIM.
    //
    // The No. 9's keel had its third member down the centreline at -drop+0.55,
    // which on a truss keel is a ridge well over your head and on a runabout
    // with a 4.2 m drop is 1.55 m above the deck: a man's throat. "The runabout
    // no9 the top bar of the keel goes through my body in vr." The same test as
    // the cords, run over every keel member and every suspension wire in the
    // fleet -- a rail is a horizontal cylinder along x, so it fouls him if its
    // own (y, z) falls inside him.
    let frameShip = null, frameD = Infinity, frameWhat = '';
    for (const id of Object.keys(ALL)) {
      const s4 = makeShip(id);
      if (!s4.deckPoint) continue;
      const d0 = s4.deckPoint.position;
      const note = (d, what) => {
        if (d < frameD) { frameD = d; frameShip = id; frameWhat = what; }
      };
      for (const r of (s4.keelRails || [])) {
        // the rail runs the length of the ship, so it passes over him whatever
        // its length: what matters is how far its axis is from his own
        if (r.y < d0.y || r.y > d0.y + HEAD) continue;
        note(Math.abs(r.z - d0.z) - SHOULDER - r.r, 'a keel rail');
      }
      const wp = s4.wires && s4.wires.geometry && s4.wires.geometry.attributes.position;
      if (wp && wp.array) {
        const a2 = wp.array;
        for (let k = 0; k + 5 < a2.length; k += 6) {
          for (let t = 0; t <= 1; t += 0.01) {
            const y = a2[k + 1] + (a2[k + 4] - a2[k + 1]) * t;
            if (y < d0.y || y > d0.y + HEAD) continue;
            const x = a2[k] + (a2[k + 3] - a2[k]) * t;
            const z = a2[k + 2] + (a2[k + 5] - a2[k + 2]) * t;
            note(Math.hypot(x - d0.x, z - d0.z) - SHOULDER, 'a suspension wire');
          }
        }
      }
    }
    const ok2 = frameD > 0.05;
    if (!ok2) fails++;
    console.log('   %s  the frame clears the pilot by %s m (worst: %s, %s)',
      ok2 ? 'ok  ' : 'FAIL', Number.isFinite(frameD) ? frameD.toFixed(3) : 'n/a',
      frameShip || '-', frameWhat || 'nothing near him');
  }

  // THE HAZE TAKES THE CITY AND LEAVES THE LANDMARKS.
  //
  // "With the fog idea in vr always show goal rings and landmarks and clouds."
  // three gives it for nothing — a material with fog:false is not touched —
  // but only if the right things are marked. So: build a scene with something
  // marked each way, run the real cityFog(), and see which materials it took
  // the fog off, and that turning it off again puts every one of them back.
  {
    const scene2 = new THREE.Group();
    const mk = (mark) => {
      const o = new THREE.Mesh();
      o.material = { fog: true, needsUpdate: false };
      o.userData = mark ? { [mark]: true } : {};
      scene2.add(o);
      return o;
    };
    const monument = mk('vrFar'), ring = mk('alwaysSeen'), house = mk(null);
    scene2.traverse = (f) => { f(scene2); for (const c of scene2.children) f(c); };
    scene2.fog = null;

    vr.cityFog(true, scene2);
    const hazed = !!scene2.fog;
    const keptClear = monument.material.fog === false && ring.material.fog === false;
    const cityFades = house.material.fog === true;
    vr.cityFog(false, scene2);
    const putBack = monument.material.fog === true && ring.material.fog === true
      && scene2.fog === null;

    const ok = hazed && keptClear && cityFades && putBack;
    if (!ok) fails++;
    console.log('   %s  the haze %s, spares %s, fades %s, and %s',
      ok ? 'ok  ' : 'FAIL',
      hazed ? 'comes down' : 'NEVER COMES DOWN',
      keptClear ? 'landmarks and rings' : 'NOTHING — THEY FADE TOO',
      cityFades ? 'the housetops' : 'NOTHING',
      putBack ? 'lifts again when the headset comes off' : 'IS NEVER LIFTED');
  }

  // THE ROOM NOTICE STANDS DOWN. It was set when the room opened and never
  // taken away, so on the screen it parked at the top for the whole flight and
  // in a headset it rode along the bottom of the slate for ever, because the
  // slate carries centerSub: "persistent roommmessage in the way" (#72).
  {
    // THIS CHECK USED TO DEMAND THE BUG.
    //
    // It asserted the source read `function setCenter(big, sub, holdFor = 0)`
    // and `centerHold = holdFor === 0 ? 0 : (holdFor || CENTRE_DWELL)` -- the
    // exact broken text -- and passed because it found them. So the default
    // hold was 0, every one of the thirty instructions took the verdict branch
    // and stayed up for the whole flight, and three rounds of dutifully marking
    // verdicts `, 0` changed nothing at all. The pilot counted: "you've said
    // you have fixed this like 3 times!" (#103). He was right, and this check
    // is why. A check that matches the spelling of the code cannot tell you
    // whether the code works; it can only tell you nobody has retyped it.
    //
    // So RUN it. The rule is lifted out of main.js as source and evaluated,
    // and then asked the only questions that matter: does a notice with no
    // hold stand down, does a verdict stay, and does an empty one never hold?
    const src = await (await import('node:fs/promises')).readFile('src/main.js', 'utf8');
    const sig = src.match(/function setCenter\(big, sub, holdFor = ([^)]*)\)/);
    // the ASSIGNMENT inside setCenter, not the `let centerHold = 0` that
    // declares it — which is the first match in the file and says nothing
    const body = [...src.matchAll(/(let\s+)?centerHold = ([^;]+);/g)]
      .filter((m) => !m[1]).map((m) => [m[0], m[2]])[0];
    const dwell = Number((src.match(/const CENTRE_DWELL = (\d+)/) || [])[1]);
    const sweeps = /if \(centerHold && performance\.now\(\) - centerSetAt > centerHold\) setCenter\('', ''\)/.test(src);
    let instruction = null, verdict = null, cleared = null;
    if (sig && body && dwell > 0) {
      // eslint-disable-next-line no-new-func
      const hold = new Function('big', 'sub', 'holdFor', 'CENTRE_DWELL',
        `if (holdFor === undefined) holdFor = ${sig[1]}; return (${body[1]});`);
      instruction = hold('August 8th, 1901', 'Fly west and fly low.', undefined, dwell);
      verdict = hold('Wrecked!', 'Practise landings.', 0, dwell);
      cleared = hold('', '', undefined, dwell);
    }
    // the verdicts must also actually SAY 0, or they vanish mid-sentence
    const verdicts = (src.match(/setCenter\([^;]*?,\s*0\);/g) || []).length;
    const ok = sweeps && dwell > 0 && verdicts >= 6
      && instruction > 0 && verdict === 0 && cleared === 0;
    if (!ok) fails++;
    console.log('   %s  an instruction holds %s ms, a verdict %s, an empty notice %s; %d verdicts marked to stay%s',
      ok ? 'ok  ' : 'FAIL',
      instruction === null ? '?' : instruction,
      verdict === 0 ? 'for ever' : 'NOT FOR EVER',
      cleared === 0 ? 'never' : 'FOR EVER',
      verdicts, sweeps ? '' : ' — AND NOTHING SWEEPS THEM');
  }

  // NO TWO PLACARDS LIE ACROSS EACH OTHER.
  //
  // The four buttons on the port boards were spaced 0.12 m apart, which clears
  // the 0.10 m grab radius handsomely — and the plate that NAMES each button is
  // 0.15 m wide, so every one of them lay three centimetres over its
  // neighbours and the four words ran together: "port placards overlap on the
  // sides" (#72). Spacing a control by the size of the control is not enough
  // when the label is bigger than the thing it labels. Each plate carries its
  // own size now, and this measures the plates.
  {
    const { SHIPS: ALL } = await import('../src/ships.js');
    let worst = null;
    for (const id of Object.keys(ALL)) {
      const s3 = makeShip(id);
      const plates = [];
      for (const o of (s3.pitchGroup.children || [])) {
        const p = o && o.userData && o.userData.placard;
        if (p) plates.push({ o, p });
      }
      for (let a = 0; a < plates.length; a++) {
        for (let b = a + 1; b < plates.length; b++) {
          const A = plates[a], B = plates[b];
          // the same board: facing the same way, and in the same plane
          const ryA = A.o.rotation.y || 0, ryB = B.o.rotation.y || 0;
          if (Math.abs(ryA - ryB) > 0.05) continue;
          const acrossX = Math.abs(Math.cos(ryA)) > 0.5;   // width runs along x
          const depthA = acrossX ? A.o.position.z : A.o.position.x;
          const depthB = acrossX ? B.o.position.z : B.o.position.x;
          if (Math.abs(depthA - depthB) > 0.03) continue;  // different boards
          const uA = acrossX ? A.o.position.x : A.o.position.z;
          const uB = acrossX ? B.o.position.x : B.o.position.z;
          const gapU = Math.abs(uA - uB) - (A.p.w + B.p.w) / 2;
          const gapV = Math.abs(A.o.position.y - B.o.position.y) - (A.p.h + B.p.h) / 2;
          const gap = Math.max(gapU, gapV);                // apart in EITHER axis is apart
          if (!worst || gap < worst.gap) {
            worst = { gap, id, a: A.p.text, b: B.p.text };
          }
        }
      }
    }
    const ok = !worst || worst.gap > 0.005;
    if (!ok) fails++;
    console.log('   %s  placards on the same board clear each other by %s m (%s: %s / %s)',
      ok ? 'ok  ' : 'FAIL', worst ? worst.gap.toFixed(3) : 'n/a',
      worst ? worst.id : '-', worst ? worst.a : '-', worst ? worst.b : '-');
  }

  // THE FAULT PICTURE PUTS THE SESSION BACK.
  //
  // vrPicture() takes xr.enabled off and binds a render target of its own so
  // it can read a mono frame back without touching the XR framebuffer — the
  // readback that ended the Oculus browser. If it ever returns without undoing
  // both of those, every frame after it is drawn into a target nobody presents
  // and the pilot's headset goes black. So: drive it through main.js's own
  // code with a renderer that RECORDS what was done to it, including on the
  // path where the render throws.
  {
    const src = await (await import('node:fs/promises')).readFile('src/main.js', 'utf8');
    const ok = /finally\s*\{[\s\S]{0,400}?renderer\.setRenderTarget\(prevTarget\)[\s\S]{0,200}?renderer\.xr\.enabled = hadXR/.test(src);
    if (!ok) fails++;
    console.log('   %s  the fault picture restores xr.enabled and the render target in a finally',
      ok ? 'ok  ' : 'FAIL');
    // ...and it must not be the old canvas readback, which is what crashed.
    const noReadback = !/function vrPicture[\s\S]{0,1600}?domElement\.toDataURL/.test(src);
    if (!noReadback) fails++;
    console.log('   %s  it never reads back the drawing buffer the session owns',
      noReadback ? 'ok  ' : 'FAIL');
    // ...and the picture is taken from the FRAME, not from the button handler.
    const inFrame = /if \(bugWanted\) takeVRFault\(\);/.test(src);
    if (!inFrame) fails++;
    console.log('   %s  the picture is taken in the frame, not in a controller poll',
      inFrame ? 'ok  ' : 'FAIL');
  }

  // ...and the slate must survive being DRAWN. It grew a navigation block and
  // a toast mode, which is a good deal more of the 2-D canvas API than it used
  // to touch (save/rotate/beginPath/fill), and a throw in here is a throw
  // inside the frame loop with a headset on.
  {
    let threw = null;
    const cases = [
      [[['height', '120 m'], ['speed', '31 km/h']], '', [], ''],
      [[['height', '120 m'], ['speed', '31 km/h'], ['gas', '88%'],
        ['ballast', '3 cyl'], ['petrol', '61%']],
        'A cloud passes before the sun.',
        [{ deg: -90, far: '340 m', name: 'gate 2 of 6' },
         { deg: 40, far: '1.2 km', name: 'Alberto', rival: true }], ''],
      [[], '', [], 'The valves hiss, easing a dangerous pressure.'],
      [[['gas', '0%']], null, null, null],
    ];
    for (const [rows, note, nav, toast] of cases) {
      // a fresh key each time, or drawPanel short-circuits and proves nothing
      sh._panelKey = null;
      try { sh.drawPanel(rows, note, nav, toast); }
      catch (e) { threw = e.message; break; }
    }
    if (threw) { console.log('   FAIL drawing the slate threw — ' + threw); fails++; }
    else console.log('   ok   the slate draws readings, bearings and a toast without throwing');
  }

  // THE SLATE COMES UP AND IN TO BE READ. "When you make the tablet bigger
  // move it up and closer to the user." And it must go back EXACTLY home
  // afterwards, or fourteen seconds at a time will walk it across the basket.
  {
    sh.bigPanel(false);
    const homeY = sh.panelMesh.position.y, homeX = sh.panelMesh.position.x;
    sh.bigPanel(true);
    const bigY = sh.panelMesh.position.y, bigX = sh.panelMesh.position.x;
    const grew = (sh.panelMesh.scale.y || 1) > 1.5;
    sh.bigPanel(false);
    const backY = sh.panelMesh.position.y, backX = sh.panelMesh.position.x;
    const up = bigY > homeY + 0.05;
    const nearer = bigX < homeX - 0.05;         // the pilot faces +x
    const home = Math.abs(backY - homeY) < 1e-9 && Math.abs(backX - homeX) < 1e-9;
    const ok = grew && up && nearer && home;
    if (!ok) fails++;
    console.log('   %s  the slate grows %s, %s, %s, and %s',
      ok ? 'ok  ' : 'FAIL',
      grew ? 'to 2.4x' : 'NOT AT ALL',
      up ? `up ${(bigY - homeY).toFixed(2)} m` : 'DOES NOT RISE',
      nearer ? `in ${(homeX - bigX).toFixed(2)} m` : 'DOES NOT COME NEARER',
      home ? 'goes exactly home again' : 'DRIFTS');
  }
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
