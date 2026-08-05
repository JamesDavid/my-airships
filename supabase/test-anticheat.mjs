// A bench test for the Commission: synthesise runs and see what it refuses.
//   node supabase/test-anticheat.mjs
//
// The "honest" run is flown by a crude autopilot that steers gate to gate at a
// speed the ship can actually make — the same shape a real recording has.

import { validateRun, validateEntry, shipTopSpeed, maxGroundSpeed, courseLength } from '../src/anticheat.js';
import { TRACKS, GHOST_DT, gateHeadings } from '../src/tracks.js';
import { SHIPS } from '../src/ships.js';

function flyTrack(track, shipId, speed) {
  const spec = SHIPS[shipId];
  const v = speed ?? shipTopSpeed(spec) * 0.85;
  const gates = track.gates;
  const headings = gateHeadings(gates);
  const p = [], splits = [];
  // start on the run-in, 90 m back along the last leg, and fly the gates in order
  const g0 = gates[0], gl = gates[gates.length - 1];
  let dx = g0.x - gl.x, dz = g0.z - gl.z;
  const l = Math.hypot(dx, dz) || 1;
  let pos = { x: g0.x - (dx / l) * 90, y: g0.y, z: g0.z - (dz / l) * 90 };
  let t = 0, yaw = Math.atan2(-dz / l, dx / l);
  const yawRate = spec.physics.yawRate || 0.5;   // the helm answers only so fast
  const step = GHOST_DT;
  p.push(+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1), +yaw.toFixed(2));

  for (let lap = 0; lap < track.laps; lap++) {
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const nx = Math.sin(headings[i]), nz = Math.cos(headings[i]);
      // a pilot flies THROUGH the middle: aim 26 m past the centre along the
      // line of approach, so the crossing happens on the ring's axis
      let ax = g.x - pos.x, az = g.z - pos.z;
      const al = Math.hypot(ax, az) || 1;
      ax /= al; az /= al;
      const target = { x: g.x + ax * 26, y: g.y, z: g.z + az * 26 };
      let guard = 0, crossed = null;
      // a stopping trial is flown INTO the station slowly, and halted there
      const legV = (track.stops && i === 0) ? Math.min(v, 2.4) : v;
      let sd = (pos.x - g.x) * nx + (pos.z - g.z) * nz;
      while (guard++ < 20000) {
        const ddx = target.x - pos.x, ddy = target.y - pos.y, ddz = target.z - pos.z;
        const d = Math.hypot(ddx, ddy, ddz);
        if (d < legV * step) break;
        pos = { x: pos.x + (ddx / d) * legV * step, y: pos.y + (ddy / d) * legV * step, z: pos.z + (ddz / d) * legV * step };
        t += step;
        let want = Math.atan2(-ddz, ddx) - yaw;
        want = Math.atan2(Math.sin(want), Math.cos(want));            // shortest way round
        yaw += Math.max(-yawRate * step, Math.min(yawRate * step, want));
        p.push(+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1), +yaw.toFixed(2));
        // stamp the split at the instant the ring's plane is crossed
        const now = (pos.x - g.x) * nx + (pos.z - g.z) * nz;
        if (crossed === null && sd < 0 && now >= 0) crossed = t - step * (now / (now - sd));
        sd = now;
      }
      splits.push(+(crossed ?? t).toFixed(2));
      // on a stopping trial she halts in the station ring before going on
      if (track.stops && i === 0) {
        for (let k = 0; k < 12; k++) {
          t += step;
          p.push(+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1), +yaw.toFixed(2));
        }
      }
    }
  }
  return { t: +(splits[splits.length - 1]).toFixed(2), splits, dt: GHOST_DT, p };
}

let pass = 0, fail = 0;
const check = (name, got, wantOk, wantReason) => {
  const ok = got.ok === wantOk && (!wantReason || got.reason === wantReason);
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}  →  ${got.ok ? 'accepted' : got.reason + (got.detail ? ' (' + got.detail + ')' : '')}`);
  ok ? pass++ : fail++;
};

console.log('— course facts —');
for (const t of TRACKS) {
  console.log(`  ${t.id.padEnd(11)} ${t.laps} laps · ${courseLength(t).toFixed(0)} m · `
    + `no6 floor ${(courseLength(t) / maxGroundSpeed(SHIPS.no6)).toFixed(1)}s`);
}

console.log('\n— honest runs —');
for (const t of TRACKS) {
  for (const ship of ['no6', 'no7', 'no9']) {
    const run = flyTrack(t, ship);
    check(`${t.id} / ${ship} (${run.t}s)`, validateRun({ trackId: t.id, shipId: ship, run }), true);
  }
}

console.log('\n— forgeries —');
const base = flyTrack(TRACKS[1], 'no6');       // the gymkhana

// 1. simply claim a better time
const lie = { ...base, t: base.t / 3 };
check('time cut to a third', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: lie }), false);

// 2. cut the time AND scale the splits to match
const scaled = {
  ...base, t: base.t / 3,
  splits: base.splits.map((s) => +(s / 3).toFixed(2)),
};
check('time and splits scaled', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: scaled }), false);

// 3. scale everything, including the ghost's sample rate, by dropping samples
const thinned = { t: base.t / 3, dt: GHOST_DT, splits: base.splits.map((s) => +(s / 3).toFixed(2)), p: [] };
for (let i = 0; i < base.p.length / 4; i += 3) thinned.p.push(...base.p.slice(i * 4, i * 4 + 4));
check('ghost thinned to fly 3x', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: thinned }), false);

// 4. a straight line from start to finish
const line = { t: base.t, dt: GHOST_DT, splits: base.splits, p: [] };
const n = base.p.length / 4;
for (let i = 0; i < n; i++) {
  const f = i / (n - 1);
  line.p.push(base.p[0] + (base.p[(n - 1) * 4] - base.p[0]) * f,
    base.p[1], base.p[2] + (base.p[(n - 1) * 4 + 2] - base.p[2]) * f, 0);
}
check('flew the straight line', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: line }), false, 'gates-missed');

// 5. the right path, but on a ship that could not hold that pace
const fastShip = flyTrack(TRACKS[1], 'no7');
check('no7 pace claimed by no9', validateRun({ trackId: 'gymkhana', shipId: 'no9', run: fastShip }), false, 'impossible-pace');
check('no7 pace claimed by no7', validateRun({ trackId: 'gymkhana', shipId: 'no7', run: fastShip }), true);

// 6. one lap flown, three laps claimed
const oneLap = flyTrack({ ...TRACKS[1], laps: 1 }, 'no6');
check('one lap, two claimed', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: oneLap }), false, 'split-count');

// 7. a gate skipped
const skipped = { ...base, splits: base.splits.slice() };
skipped.p = base.p.slice();
check('honest control', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: skipped }), true);

// 8. teleport: one giant jump mid-run
const jump = { ...base, p: base.p.slice() };
jump.p[400] += 900;
check('a 900 m jump', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: jump }), false, 'impossible-speed');

// 9. garbage
check('NaN in the trace', validateRun({ trackId: 'gymkhana', shipId: 'no6', run: { ...base, p: [...base.p.slice(0, 40), NaN, ...base.p.slice(41)] } }), false, 'path-nan');
check('unknown track', validateRun({ trackId: 'nowhere', shipId: 'no6', run: base }), false, 'unknown-track');
check('rival AI ship', validateRun({ trackId: 'gymkhana', shipId: 'villedeparis', run: base }), false, 'ai-ship');

console.log('\n— the paperwork —');
const goodEntry = { pilot: 'Alberto', pilot_id: '2f1c9a3e-1111-4222-8333-444455556666', track_id: 'gymkhana', ship_id: 'no6', ghost: base };
check('a plain name', validateEntry(goodEntry), true);
check('a scripted name', validateEntry({ ...goodEntry, pilot: '<script>x</script>' }), false, 'name-characters');
check('no name at all', validateEntry({ ...goodEntry, pilot: '  ' }), false, 'no-pilot-name');
check('a forged pilot id', validateEntry({ ...goodEntry, pilot_id: 'me' }), false, 'bad-pilot-id');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
