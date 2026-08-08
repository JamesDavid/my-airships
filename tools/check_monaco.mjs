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
// Position AND whether you could see it there. Smoke is recycled by fading to
// nothing at the end of its drift and reappearing at the funnel, which is a
// teleport in the arithmetic and no such thing to a pilot. So a jump is only
// judged if the thing was visible at BOTH ends of it. This is a rule about
// what can be seen, not about what this file happens to be able to name --
// anything visible on the water is still judged, whatever it is.
const seen = (o) => {
  if (o.visible === false) return false;
  // a published alpha if the object has one, else a material's own opacity
  const a = o.userData && o.userData.alpha;
  if (typeof a === 'number') return a >= 0.02;
  const m = o.material;
  if (m && typeof m.opacity === 'number' && m.opacity < 0.02) return false;
  return true;
};
const snap = () => watched.map((o) => ({ x: o.position.x, y: o.position.y, z: o.position.z,
  seen: seen(o) }));

const wind = { x: 2.6, y: 0, z: 1.6 };
const DT = 1 / 30;
// Walk a real clock: world.tick takes ABSOLUTE seconds (the sky's own clock,
// seconds since midnight UTC), not a delta, so t must advance by dt.
let fastest = 0, fastestI = -1;
const speeds = new Array(watched.length).fill(0);
// ACROSS MIDNIGHT, because that is the one moment the clock does something
// different. skyTime() is seconds since midnight UTC and it wraps; anything
// whose place is a pure function of it is flung the length of its run in a
// single frame when it does. The escort was doing 273,983 km/h there, every
// night, while this file was testing noon and four minutes to midnight and
// reporting all clear.
const clock = (t) => ((t % 86400) + 86400) % 86400;
for (let i = 0; i < 900; i++) {
  const t = 86390 + i * DT;                       // 900 frames at 1/30 s = 30 s,
                                                  // so 86390 -> 86420: through it
  world.tick(DT, clock(t), wind);
  const a = snap();
  world.tick(DT, clock(t + DT), wind);
  const b = snap();
  for (let k = 0; k < watched.length; k++) {
    if (!a[k].seen || !b[k].seen) continue;        // it moved where no one could see it
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
// NOTHING IS EXEMPT BY ITS NAME.
//
// This used to read `const bad = isBoat && kmh > 16`, so only an object this
// file had already recognised as a boat could fail. Everything else -- the
// funnel smoke at 6,293 km/h -- was printed with an "ok" beside it and the
// run declared all clear, four times over, while a pilot kept reporting fast
// things on the water. A check that excuses whatever it cannot name will
// always pass, and it is worse than no check because it reads like one.
//
// So: everything near the water is judged. Smoke is allowed to outrun a hull,
// because the wind carries it -- but not to outrun the wind by a hundredfold,
// which is a teleport and not a drift.
for (const [k, v] of movers.slice(0, 12)) {
  const kmh = v * 3.6;
  const what = nameOf(watched[k]);
  const isBoat = what === 'escort boat';
  // Eight knots is 14.8 km/h, and the code aims at five to seven. Smoke gets
  // ten times the wind, which is generous, and nothing gets a teleport.
  const windKmh = Math.hypot(wind.x, wind.z) * 3.6;
  const limit = isBoat ? 16 : Math.max(40, windKmh * 10);
  const bad = kmh > limit;
  if (bad) fails++;
  console.log('   %s  %s  %s km/h%s', bad ? 'FAIL' : 'ok  ',
    what.padEnd(12), kmh.toFixed(1).padStart(7),
    bad ? '   — over its limit of ' + limit.toFixed(0) : '');
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

// ---------------------------------------------------------------------------
console.log('');
console.log('EVERY MONACO LANDMARK STANDS ON ITS OWN FOOTPRINT');
{
  // The same fault Paris had, and found the same way: every landmark placed
  // with a position and nothing else, so all of them sat at rotation.y = 0 and
  // about half size -- the Prince's Palace drawn 60 m where it is 133, the
  // Musee oceanographique 40 m where it is 103.
  //
  // src/monaco_footprints.js is the real outline, generated by
  // tools/city_footprints.py and checked in, so this runs offline.
  const { FOOTPRINTS } = await import('../src/monaco_footprints.js');
  const bear = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 180;
  const ext = (geom) => {
    const q = (geom && geom.parameters) || {};
    if (q.width !== undefined) return [q.width, q.depth !== undefined ? q.depth : q.width];
    if (q.radiusTop !== undefined || q.radiusBottom !== undefined) {
      const r = Math.max(q.radiusTop || 0, q.radiusBottom || 0); return [2 * r, 2 * r];
    }
    if (q.radius !== undefined) return [2 * q.radius, 2 * q.radius];
    return null;
  };
  let worstSize = 0, worstId = '', worstDeg = 0, worstDegId = '', missing = [];
  for (const id of Object.keys(FOOTPRINTS)) {
    const f = FOOTPRINTS[id];
    if (f.len < 25) continue;
    const groups = scene.children.filter((o) => o && o.position && Array.isArray(o.children)
      && o.children.length && Math.hypot(o.position.x - f.x, o.position.z - f.z) < 70);
    if (!groups.length) { missing.push(id); continue; }
    const g = groups.reduce((a, b) => (b.children.length > a.children.length ? b : a));
    const pts = [];
    const walk = (o, ox, oz, rot, kx, kz) => {
      const lx = (o.position ? o.position.x : 0) * kx;
      const lz = (o.position ? o.position.z : 0) * kz;
      const px = ox + lx * Math.cos(rot) + lz * Math.sin(rot);
      const pz = oz - lx * Math.sin(rot) + lz * Math.cos(rot);
      const r2 = rot + ((o.rotation && o.rotation.y) || 0);
      const kx2 = kx * ((o.scale && o.scale.x) || 1);
      const kz2 = kz * ((o.scale && o.scale.z) || 1);
      const e = o.geometry ? ext(o.geometry) : null;
      if (e) {
        const hw = e[0] * kx2 / 2, hd = e[1] * kz2 / 2;
        const c = Math.cos(r2), sn = Math.sin(r2);
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          pts.push([px + sx * hw * c + sz * hd * sn, pz - sx * hw * sn + sz * hd * c]);
        }
      }
      if (Array.isArray(o.children)) for (const c2 of o.children) walk(c2, px, pz, r2, kx2, kz2);
    };
    for (const c of g.children) walk(c, g.position.x, g.position.z,
      (g.rotation && g.rotation.y) || 0,
      (g.scale && g.scale.x) || 1, (g.scale && g.scale.z) || 1);
    if (pts.length < 4) { missing.push(id); continue; }
    let bA = null;
    for (let i2 = 0; i2 < pts.length; i2++) {
      const a = pts[i2], b = pts[(i2 + 1) % pts.length];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const c = Math.cos(-ang), sn = Math.sin(-ang);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of pts) {
        const u = q[0] * c - q[1] * sn, v = q[0] * sn + q[1] * c;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const area = (u1 - u0) * (v1 - v0);
      if (!bA || area < bA.area) bA = { area, ang, du: u1 - u0, dv: v1 - v0 };
    }
    let ln = bA.du, ang2 = bA.ang;
    if (bA.dv > ln) { ln = bA.dv; ang2 += Math.PI / 2; }
    const dSize = Math.abs(ln - f.len) / f.len;
    if (dSize > worstSize) { worstSize = dSize; worstId = id; }
    if (f.len / Math.max(1, f.wid) > 1.5) {
      const want = bear(Math.cos(f.ry), -Math.sin(f.ry));
      const got = bear(Math.cos(ang2), Math.sin(ang2));
      let d = Math.abs(want - got); if (d > 90) d = 180 - d;
      if (d > worstDeg) { worstDeg = d; worstDegId = id; }
    }
  }
  console.log('   worst size %s%% (%s); worst bearing %s deg (%s)%s',
    (worstSize * 100).toFixed(0), worstId || '-', worstDeg.toFixed(0), worstDegId || '-',
    missing.length ? '; NOT BUILT: ' + missing.join(', ') : '');
  const ok2 = !missing.length && worstSize <= 0.35 && worstDeg <= 20;
  if (!ok2) { console.log('   FAIL a monument is not built to its own outline'); fails++; }
  else console.log('   ok   all of them on their real outlines, square to their own streets');
}

console.log('');
console.log('NO RING IS HUNG OVER THE ROCK');
console.log('   Monaco\'s gates are measured from what is under them, because the');
console.log('   Rock is fifty metres up and the water is not — but only from what is');
console.log('   under their CENTRE. The bay gate stood where the ground rises to 12 m');
console.log('   with its lower rim at 0: "a ring in the bay that is too close to a');
console.log('   mountain". Sampled all round the hoop now, not at one point.');
console.log('');
{
  const { TRACKS } = await import('../src/tracks.js');
  const { groundAt: mcGround } = await import('../src/monaco_geo.js');
  const rings = [];
  for (const t of TRACKS.filter((x) => x.location === 'monaco')) {
    t.gates.forEach((g, i) => rings.push([`${t.id} gate ${i + 1}`, g]));
  }
  if (world.turnRing) rings.push(['the turn', { ...world.turnRing, r: 24 }]);
  if (world.startRing) rings.push(['the start', { ...world.startRing, r: 24 }]);
  for (const [name, g] of rings) {
    const r = g.r || 24;
    let worst = -1e9;
    for (let a = 0; a < 24; a++) {
      for (let d = 0; d <= r; d += r / 4) {
        const h = mcGround(g.x + Math.cos(a / 24 * Math.PI * 2) * d,
          g.z + Math.sin(a / 24 * Math.PI * 2) * d);
        if (h > worst) worst = h;
      }
    }
    const rim = g.y - r;
    const ok = worst <= rim;
    if (!ok) fails++;
    console.log('   %s  %s  rim %s m, highest rock in the hoop %s m',
      ok ? 'ok  ' : 'FAIL', name.padEnd(18), rim.toFixed(0).padStart(4), worst.toFixed(0).padStart(4));
  }
}

console.log('');
console.log(fails ? `${fails} FAILURE(S)` : 'Monaco: all clear.');
process.exit(fails ? 1 : 0);
