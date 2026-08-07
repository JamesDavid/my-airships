// Monaco: measure everything that moves on the water.
//
// "There is still a really really fast 300km/h sailboat zooming along the
// coast... we talked about this before" (#71). The escort's speed had already
// been fixed once — it used to read its speed as a FRACTION OF THE WHOLE LANE
// per second, which is 340 km/h — and the fix was believed. This measures it
// instead: build the real Monaco, run the real tick, and clock every boat in
// the scene between one frame and the next.
//
// Use: node tools/check_monaco.mjs
import './headless.mjs';
import { buildWorldMonaco } from '../src/world_monaco.js';

const scene = { children: [], add(...o) { this.children.push(...o); },
  remove() {}, traverse(f) { f(this); } };
const world = buildWorldMonaco(scene);

let fails = 0;
console.log('');
console.log('NOTHING ON THE WATER GOES FASTER THAN A BOAT');
console.log('   A steam chaloupe of 1902 made perhaps eight knots. Anything on this');
console.log('   list doing thirty is not a boat, it is an arithmetic error.');
console.log('');

// Every top-level object in the scene, watched across a frame. Whatever the
// tick moves shows up here whether or not this file knows its name.
const watched = scene.children.filter((o) => o && o.position);
const snap = () => watched.map((o) => ({ x: o.position.x, y: o.position.y, z: o.position.z }));

const wind = { x: 2.6, y: 0, z: 1.6 };
const DT = 1 / 30;
// Walk a real clock: world.tick takes ABSOLUTE seconds (the sky's own clock,
// seconds since midnight UTC), not a delta, so t must advance by dt.
let fastest = 0, fastestI = -1;
const speeds = new Array(watched.length).fill(0);
for (let i = 0; i < 600; i++) {
  const t = 43200 + i * DT;                       // noon, and on from there
  world.tick(DT, t, wind);
  const a = snap();
  world.tick(DT, t + DT, wind);
  const b = snap();
  for (let k = 0; k < watched.length; k++) {
    const v = Math.hypot(b[k].x - a[k].x, b[k].y - a[k].y, b[k].z - a[k].z) / DT;
    if (v > speeds[k]) speeds[k] = v;
    if (v > fastest) { fastest = v; fastestI = k; }
  }
}

// Report anything that moved at all, named by what it is made of.
const nameOf = (o) => {
  if (o.userData && o.userData.leg !== undefined) return 'escort boat';
  if (o.geometry && o.geometry.type === 'SphereGeometry') return 'smoke puff';
  return o.type || 'object';
};
const movers = [];
for (let k = 0; k < watched.length; k++) if (speeds[k] > 0.01) movers.push([k, speeds[k]]);
movers.sort((a, b) => b[1] - a[1]);
for (const [k, v] of movers.slice(0, 12)) {
  const kmh = v * 3.6;
  const isBoat = nameOf(watched[k]) === 'escort boat';
  // Smoke is carried by the wind and may legitimately outrun a boat; a hull
  // may not. Eight knots is 14.8 km/h, and the code aims at five to seven.
  const bad = isBoat && kmh > 16;
  if (bad) fails++;
  console.log('   %s  %s  %s km/h', bad ? 'FAIL' : 'ok  ',
    nameOf(watched[k]).padEnd(12), kmh.toFixed(1).padStart(7));
}
if (!movers.length) { console.log('   FAIL nothing in Monaco moves at all'); fails++; }

// And the fast one must not be found by luck of which frames we sampled: the
// old bug was a function of ABSOLUTE time, so check the far end of the day too.
console.log('');
console.log('   ...and again at four minutes to midnight, on the same clock');
let lateWorst = 0;
for (let i = 0; i < 200; i++) {
  const t = 86160 + i * DT;
  world.tick(DT, t, wind); const a = snap();
  world.tick(DT, t + DT, wind); const b = snap();
  for (let k = 0; k < watched.length; k++) {
    if (!(watched[k].userData && watched[k].userData.leg !== undefined)) continue;
    lateWorst = Math.max(lateWorst, Math.hypot(b[k].x - a[k].x, b[k].z - a[k].z) / DT);
  }
}
const lateOk = lateWorst * 3.6 <= 16;
if (!lateOk) fails++;
console.log('   %s  escort boat   %s km/h', lateOk ? 'ok  ' : 'FAIL',
  (lateWorst * 3.6).toFixed(1).padStart(7));

// ---------------------------------------------------------------------------
console.log('');
console.log('NO GROUND LIES IN THE SURFACE OF THE SEA');
console.log('   The sea is one plane at y = 0 and the seabed is part of the mountain');
console.log('   mesh. Where the survey put a wet point at exactly zero the two were');
console.log('   coplanar, and the pair traded the depth test frame by frame: "Dark');
console.log('   areas are water flickering dark to reflective" (#69). Measured on the');
console.log('   BUILT GEOMETRY, not on the survey it came from — the survey was');
console.log('   already known to hold those zeroes and the mesh is what is drawn.');
console.log('');
{
  const CLEAR = 0.25;                 // less daylight than this and it will fight
  // The mountain is the one big vertex-coloured mesh in the scene.
  let terr = null;
  for (const o of scene.children) {
    const p = o && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (p && p.count > 10000 && o.geometry.attributes.color) { terr = o; break; }
  }
  if (!terr) { console.log('   FAIL cannot find the terrain mesh to measure'); fails++; }
  else {
    const p = terr.geometry.attributes.position;
    const oy = terr.position.y || 0;
    let bad = 0, worst = Infinity, worstAt = null;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + oy;
      if (y > 0) continue;                       // dry land is not our business
      if (Math.abs(y) < Math.abs(worst)) { worst = y; worstAt = i; }
      if (y > -CLEAR) bad++;
    }
    const ok = bad === 0;
    if (!ok) fails++;
    console.log('   %s  %d wet vertices within %sm of the sea plane; shallowest is %sm',
      ok ? 'ok  ' : 'FAIL', bad, CLEAR, worst.toFixed(3));
  }
}

console.log('');
console.log(fails ? `${fails} FAILURE(S)` : 'Monaco: all clear.');
process.exit(fails ? 1 : 0);
