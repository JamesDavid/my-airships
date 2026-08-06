// Fly a course and see whether it can be finished.
//
// This is the question the leaderboard could not answer: eighteen time-trial
// attempts on record and not one completion, because two of the gymkhana's
// gates were under the pavement. It uses the SHIPPED gate test — gateOffset()
// and gatePlane() in src/tracks.js, the same two functions main.js's race loop
// calls — so a pass here is a pass in the game.
//
// Use: node tools/fly_track.mjs [trackId]
import './headless.mjs';
import { buildWorld } from '../src/world.js';
import { TRACKS, gateHeadings, gateOffset, gatePlane, trackSpawn } from '../src/tracks.js';
import { makeShip } from './sim.mjs';

export function flyTrack(track, world, { shipId = 'no6', secs = 3000, dt = 1 / 30,
  STOP_IN = 220,
  wind = { x: 0, y: 0, z: 0 } } = {}) {
  const gates = track.gates;
  const spawn = trackSpawn(track);
  const headings = gateHeadings(gates, spawn);
  const env = { groundAt: world.groundAt, buildings: world.buildings,
    underCloud: false, inBois: false };
  const s = makeShip(shipId);
  s.reset({ x: spawn.x, y: spawn.y, z: spawn.z }, spawn.yaw);
  let gate = 0, lap = 1, prevS, t = 0;
  const log = [];
  for (let k = 0; k * dt < secs; k++) {
    t = k * dt;
    const g = gates[gate];
    const rel = { x: s.pos.x - g.x, y: s.pos.y - g.y, z: s.pos.z - g.z };
    // "stopping each time at a point designed beforehand" — on a stopping
    // trial the station gate only counts if she is very nearly at rest, so the
    // pilot has to come off the throttle for it, exactly as the race loop asks
    // "stopping each time at a point designed beforehand" — you cannot simply
    // shut the throttle: with no thrust she coasts to a halt SHORT of the ring
    // and never crosses its plane at all. She has to be walked through it under
    // power, at less than 3 m/s, which is what the rule is really asking for.
    const mustStop = track.stops && gate === 0;
    const dTo = Math.hypot(g.x - s.pos.x, g.z - s.pos.z);
    const spd = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    // NOTE the throttle is a RATE, not a setting — it is the brass lever, and
    // input 0 means "leave it where it is". To slow down you must pull it back.
    const wantSpd = mustStop && dTo < STOP_IN ? 1.8 : 99;
    const lever = spd > wantSpd ? -1 : 1;
    // steer for the gate, holding its height
    const a = Math.atan2(-(g.z - s.pos.z), g.x - s.pos.x);
    let e = a - s.yaw;
    while (e > Math.PI) e -= 2 * Math.PI;
    while (e < -Math.PI) e += 2 * Math.PI;
    s.update(dt, { throttle: lever, rudder: Math.max(-1, Math.min(1, e * 2.5)),
      pitch: Math.max(-1, Math.min(1, (g.y - s.pos.y) * 0.05)),
      vent: s.pos.y > g.y + 30 ? 1 : 0, coax: 0 }, wind, env);
    if (s.wrecked) return { ok: false, why: 'wrecked', t, gate, lap, log };
    const rel2 = { x: s.pos.x - g.x, y: s.pos.y - g.y, z: s.pos.z - g.z };
    const sd = gatePlane(rel2, headings[gate]);
    const { off } = gateOffset(rel2, g, headings[gate]);
    if (prevS !== undefined && prevS < 0 && sd >= 0 && off < 1
        && !(track.stops && gate === 0 && Math.hypot(s.vel.x, s.vel.y, s.vel.z) > 3)) {
      log.push({ lap, gate, t: +t.toFixed(1), off: +off.toFixed(2) });
      prevS = undefined;
      gate++;
      if (gate === gates.length) {
        if (lap < track.laps) { lap++; gate = 0; }
        else return { ok: true, t, log };
      }
      continue;
    }
    prevS = sd;
  }
  return { ok: false, why: 'ran out of time', t, gate, lap, log };
}

if (process.argv[1] && process.argv[1].includes('fly_track')) {
  const scene = { children: [], add(...o) { this.children.push(...o); },
    remove() {}, traverse(f) { f(this); } };
  const world = buildWorld(scene, 'paris');
  const want = process.argv[2];
  for (const t of TRACKS.filter((x) => x.location === 'paris'
      && (!want || x.id === want))) {
    const r = flyTrack(t, world);
    console.log('\n%s — %s', t.name, r.ok ? 'FINISHED in ' + Math.round(r.t) + ' s'
      : 'NOT FINISHED (' + r.why + ') — reached lap ' + r.lap + ', gate ' + r.gate);
    for (const p of r.log)
      console.log('   lap %d gate %d at %s s  (%s of the opening out)',
        p.lap, p.gate, String(p.t).padStart(6), p.off.toFixed(2));
  }
}
