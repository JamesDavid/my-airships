// Fly the scenarios and see how they end.
//
// A scenario is a setup() and a tick(), and until now the only way to know
// whether one could be WON was to fly it by hand in a browser. Three bug
// reports in three minutes on 6 August 2026 were one pilot discovering that
// scenario II could not be. This runs them.
//
// Use: node tools/check_scenarios.mjs
import './headless.mjs';
import { buildWorld } from '../src/world.js';
import { SCENARIOS } from '../src/scenarios.js';
import { makeShip } from './sim.mjs';
import { SHIPS } from '../src/ships.js';
import { TRACKS } from '../src/tracks.js';
import { inRiver } from '../src/paris_terrain.js';
import { flyTrack } from './fly_track.mjs';

const scene = { children: [], add(...o) { this.children.push(...o); },
  remove() {}, traverse(f) { f(this); } };
const world = buildWorld(scene, 'paris');

/** Fly one scenario to its own verdict. `pilot(ship, t)` returns input. */
export function play(def, { shipId, pilot, secs = 900, dt = 1 / 30 } = {}) {
  const ship = makeShip(shipId || def.shipId);
  let verdict = null, wind = { x: 0, y: 0, z: 0 }, zone = null, route = [];
  const msgs = [];
  const ctx = {
    ship, world, wind,
    place: (x, y, z, yaw) => ship.reset({ x, y, z }, yaw),
    setWind: (x, z) => { wind.x = x; wind.z = z; },
    setZone: (v, r) => { zone = { v, r }; },
    clearZone: () => { zone = null; },
    zoneDist: () => (zone ? Math.hypot(ship.pos.x - zone.v.x, ship.pos.z - zone.v.z) : 1e9),
    zoneR: () => (zone ? zone.r : 0),
    setCenter: () => {}, addMsg: (k, m) => msgs.push(m),
    complete: (m) => { if (!verdict) verdict = { ok: true, msg: m }; },
    fail: (m) => { if (!verdict) verdict = { ok: false, msg: m }; },
    // the rest of the ctx main.js hands a scenario
    raceResult: () => null, setRoute: (r) => { route = r || []; },
  };
  def.setup(ctx);
  const env = { groundAt: world.groundAt, buildings: world.buildings,
    underCloud: false, inBois: false };
  for (let i = 0; i * dt < secs && !verdict; i++) {
    const t = i * dt;
    ship.update(dt, pilot ? pilot(ship, t) : { throttle: 0, rudder: 0, pitch: 0, vent: 0, coax: 0 },
      wind, env);
    def.tick(ctx, dt);
  }
  return { verdict, msgs, t: ship._t, pos: { ...ship.pos },
    onRoof: !!ship.restingOnRoof,
    bags: ship.bags, landed: ship.landed, wrecked: ship.wrecked };
}

if (process.argv[1] && process.argv[1].includes('check_scenarios')) {
  let fails = 0;
  const sc = SCENARIOS.find((s) => s.id === 'no5-trocadero');
  console.log('II. A Fall Before a Rise — every ballast choice');
  console.log('   (0 bags is what he did; 1-2 is what he meant to do)');
  console.log('');
  console.log('bags  outcome   ending');
  let wins = 0, roofWin = false;
  for (let b = 0; b <= 6; b++) {
    let n = 0;
    const r = play(sc, { pilot: (sh, t) => {
      if (t >= 15 && n < b) { sh.dropBallast(); n++; }
      return { throttle: 0, rudder: 0, pitch: 0, vent: 0, coax: 0 };
    } });
    if (r.verdict && r.verdict.ok) { wins++; if (b === 0 && r.onRoof) roofWin = true; }
    console.log('%s  %s  %s', String(b).padStart(3),
      (r.verdict ? (r.verdict.ok ? '  WON  ' : ' lost  ') : ' HUNG  '),
      (r.verdict ? r.verdict.msg : 'no verdict in 900 s').slice(0, 86));
  }
  console.log('');
  console.log('   %d of 7 ballast choices win.', wins);
  if (wins < 2) { console.log('   FAIL scenario II is all but unwinnable'); fails++; }
  // The one he actually flew: ballast untouched, down on the hotel roofs.
  if (!roofWin) {
    console.log('   FAIL holding the ballast does not put her on the roofs, which is what happened');
    fails++;
  } else {
    console.log('   ok   ballast untouched puts her on the Trocadero hotels, as it did him');
  }

  console.log('');
  console.log('EVERY PARIS SCENARIO ENDS WHEN THE SHIP DOES');
  console.log('   A scenario that sits still is not broken — the Deutsch prize and the');
  console.log('   review are things you must go and DO. But one that never answers even');
  console.log('   when you are on the ground has no way to end, which is what II had.');
  console.log('');
  for (const def of SCENARIOS.filter((d) => d.location === 'paris')) {
    // vent all the way down: whatever else happens, she lands
    const r = play(def, { pilot: () => ({ throttle: 0, rudder: 0, pitch: -1,
      vent: 1, coax: 0 }) });
    const ok = !!r.verdict;
    if (!ok) fails++;
    console.log('   %s  %s  %s', ok ? 'ok  ' : 'FAIL', def.id.padEnd(14),
      ok ? (r.verdict.ok ? 'won ' : 'lost') + ': ' + r.verdict.msg.slice(0, 52)
        : 'landed=' + r.landed + ' wrecked=' + r.wrecked + ' and still no verdict');
  }
  console.log('');
  console.log('EVERY SHIP KNOWS WHAT IT THREW');
  console.log('   Sand to the No. 4; water from the No. 5, whose keel carried the');
  console.log('   first liquid ballast ever flown (Ch. XI).');
  console.log('');
  const WANT = { brazil: 'sand', no1: 'sand', no2: 'sand', no3: 'sand', no4: 'sand',
    no5: 'water', no6: 'water', no7: 'water', no9: 'water', no10: 'water',
    villedeparis: 'water' };
  for (const [id, spec] of Object.entries(SHIPS)) {
    const want = WANT[id];
    const got = spec.ballast;
    const ok = want ? got === want : !!got;
    if (!ok) fails++;
    console.log('   %s  %s  %s', ok ? 'ok  ' : 'FAIL', id.padEnd(13),
      got ? got + (want && got === want ? '' : '  (expected ' + want + ')') : 'NO BALLAST FIELD');
  }

  console.log('');
  console.log('SHIP SPEEDS AGAINST THE ONES HE WROTE DOWN');
  console.log('   Ch. XIII, the No. 5 round Longchamps with Maurice Farman keeping');
  console.log('   pace in his motor-car: "between 26 and 30 kilometres per hour with');
  console.log('   my guide rope dragging"... "which would have brought my proper');
  console.log('   speed up to between 30 and 35".');
  console.log('');
  const env2 = { groundAt: () => 0, buildings: [], underCloud: false, inBois: false };
  const topSpeed = (id, alt) => {
    const sh0 = makeShip(id); sh0.reset({ x: 0, y: alt, z: 0 }, 0);
    let best = 0;
    const dt = 1 / 30;
    for (let k = 0; k * dt < 400; k++) {
      sh0.update(dt, { throttle: 1, rudder: 0,
        pitch: Math.max(-1, Math.min(1, (alt - sh0.pos.y) * 0.05)), vent: 0, coax: 0 },
        { x: 0, y: 0, z: 0 }, env2);
      if (sh0.pos.y > 4) best = Math.max(best, Math.hypot(sh0.vel.x, sh0.vel.z));
      if (sh0.wrecked) break;
    }
    return best * 3.6;
  };
  // Only the ships the book gives a figure for, with the tolerance a 1901
  // estimate from a moving automobile deserves.
  const BOOK = [
    ['no5', 30, 35, 'Ch. XIII, proper speed at Longchamps'],
    ['no9', 20, 25, 'Ch. XXII, the runabout'],
    ['no7', 55, 80, 'Ch. XVI, the racer, 70-80 by design and never realised'],
  ];
  for (const [id, lo, hi, src] of BOOK) {
    const v = topSpeed(id, 150);
    const slack = 0.15;
    const ok = v >= lo * (1 - slack) && v <= hi * (1 + slack);
    if (!ok) fails++;
    console.log('   %s  %s  %s km/h   book %d-%d   (%s)', ok ? 'ok  ' : 'FAIL',
      id.padEnd(5), v.toFixed(1).padStart(5), lo, hi, src);
  }
  {
    const clear = topSpeed('no5', 150), drag = topSpeed('no5', 37);
    console.log('   ---  no5    the guide rope costs %s km/h; he reckoned about 5',
      (clear - drag).toFixed(1));
  }

  console.log('');
  console.log('EVERY GATE HAS AIR IN IT');
  console.log('   The gymkhana was written when Paris was flat. Once the city got');
  console.log('   its hills, "UNDER the Arc" at y 13 was eleven metres beneath the');
  console.log('   Etoile and could not be flown at all — eighteen trial attempts on');
  console.log('   record and not one completion.');
  console.log('');
  for (const t of TRACKS.filter((t) => t.location === 'paris')) {
    let worst = Infinity, worstI = -1;
    t.gates.forEach((g, i) => {
      const agl = g.y - world.groundAt(g.x, g.z);
      if (agl < worst) { worst = agl; worstI = i; }
    });
    const ok = worst >= 6;
    if (!ok) fails++;
    console.log('   ' + (ok ? 'ok  ' : 'FAIL') + '  ' + t.id.padEnd(16)
      + ' lowest gate ' + worstI + ' at ' + worst.toFixed(1).padStart(6)
      + ' m over its ground');
  }

  console.log('');
  console.log('THE GARDENS ARE PLANTED, AND NOT THROUGH THE WALLS');
  {
    const trees = (world.trees || []).filter((t) => t && t.x !== undefined);
    const cell = 120, occ = new Map();
    for (const b of world.buildings) {
      const k = Math.floor(b.x / cell) + ',' + Math.floor(b.z / cell);
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push(b);
    }
    let inB = 0, inR = 0;
    for (const t of trees) {
      if (inRiver(t.x, t.z)) { inR++; continue; }
      const gx = Math.floor(t.x / cell), gz = Math.floor(t.z / cell);
      let hit = false;
      for (let a = -1; a <= 1 && !hit; a++) for (let c = -1; c <= 1 && !hit; c++) {
        for (const b of (occ.get((gx + a) + ',' + (gz + c)) || [])) {
          const ry = b.ry || 0;
          const hw = (b.rw !== undefined ? b.rw : b.w) / 2;
          const hd = (b.rd !== undefined ? b.rd : b.d) / 2;
          const cs = Math.cos(ry), sn = Math.sin(ry);
          const px = t.x - b.x, pz = t.z - b.z;
          const lx = px * cs - pz * sn, lz = px * sn + pz * cs;
          if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) { hit = true; break; }
        }
      }
      if (hit) inB++;
    }
    console.log('   ' + trees.length + ' trees; ' + inB + ' indoors, ' + inR + ' in the Seine');
    // the survivors are one cluster in the Bois under a collider registered
    // after the planting pass; it was 81 and 8 before the gardens got a filter
    if (inR > 0) { console.log('   FAIL trees growing in the river'); fails++; }
    else if (inB > 20) { console.log('   FAIL too many trees indoors'); fails++; }
    else console.log('   ok   nothing growing in the river, and next to nothing indoors');
  }

  console.log('');
  console.log('EVERY COURSE CAN ACTUALLY BE FINISHED');
  console.log('   Flown gate by gate with the shipped test — gateOffset() and');
  console.log('   gatePlane() from src/tracks.js, the same two the race loop calls.');
  console.log('');
  for (const t of TRACKS.filter((x) => x.location === 'paris')) {
    const r = flyTrack(t, world);
    if (!r.ok) fails++;
    console.log('   ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + t.id.padEnd(16)
      + (r.ok ? 'round in ' + Math.round(r.t) + ' s, ' + r.log.length + ' gates'
        : 'STUCK at lap ' + r.lap + ' gate ' + r.gate + ' (' + r.why + ')'));
  }

  console.log('');
  console.log('%s', fails === 0 ? 'ALL CHECKS PASS' : fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
