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
import { placeLegacy } from '../src/paris_geo.js';
import { flyTrack } from './fly_track.mjs';

const scene = { children: [], add(...o) { this.children.push(...o); },
  remove() {}, traverse(f) { f(this); } };
const world = buildWorld(scene, 'paris');
export { world };

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
  const NBAGS = SHIPS[sc.shipId].physics.bags;
  for (let b = 0; b <= NBAGS; b++) {
    let n = 0;
    // BOTH HALVES NOW. Fly west under power and LOW, where the wind is
    // thinner; when the wires foul, pull the lever right back — she has nine
    // seconds — and then choose the ballast.
    const r = play(sc, { pilot: (sh, t) => {
      const dead = sh.motorDead;
      // the wires are in the screw: pull the lever right back, as he did
      const cut = dead || sh.wiresFouled;
      if (dead && n < b) { sh.dropBallast(); n++; }
      // ABOVE THE GROUND, not above sea level. Holding 60 m absolute over the
      // Chaillot plateau — ground 26 m with 26 m roofs on it — flies you into
      // the chimney-pots, which is how this pilot kept ending the flight on a
      // roof half way home.
      const agl = sh.pos.y - world.groundAt(sh.pos.x, sh.pos.z);
      return { throttle: cut ? -1 : (sh.throttle < 0.98 ? 1 : 0),
        rudder: 0, pitch: agl > 85 ? -0.5 : 0.35, vent: 0, coax: 0 };
    } });
    if (r.verdict && r.verdict.ok) { wins++; if (b === 0 && r.onRoof) roofWin = true; }
    console.log('%s  %s  %s', String(b).padStart(3),
      (r.verdict ? (r.verdict.ok ? '  WON  ' : ' lost  ') : ' HUNG  '),
      (r.verdict ? r.verdict.msg : 'no verdict in 900 s').slice(0, 86));
  }
  console.log('');
  console.log('   %d of %d ballast choices win.', wins, NBAGS + 1);
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
    // UP FIRST, then down. A pilot that vents from the first tick never leaves
    // the ground, and a scenario is entitled not to judge a landing by someone
    // who has not yet flown — which is the whole of bug #54. So: climb for half
    // a minute, then valve her down and see whether the scenario answers.
    const r = play(def, { pilot: (sh, t) => (t < 30
      ? { throttle: 1, rudder: 0, pitch: 1, vent: 0, coax: 0 }
      : { throttle: 0, rudder: 0, pitch: -1, vent: 1, coax: 0 }) });
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
  console.log('NO SCENARIO PUTS GAS BACK INTO THE BALLOON');
  console.log('   A scripted leak may only ever TAKE hydrogen. All three leaking');
  console.log('   scenarios were written "gas = max(FLOOR, gas - rate*dt)", which');
  console.log('   reads as "leak down to FLOOR" and means "hold the gas AT FLOOR" —');
  console.log('   so a pilot who valved below it had the script re-inflate the');
  console.log('   balloon under him, every tick. That is bug #70: the No. 6 into');
  console.log('   Monaco, "vent button broken, stuck at 82%", 82 being the floor');
  console.log('   written on that very line. Scenario I held 34 and II held 20.');
  console.log('');
  for (const def of SCENARIOS) {
    const ship = makeShip(def.shipId);
    let zone = null;
    const ctx = {
      ship, world, wind: { x: 0, y: 0, z: 0 },
      place: (x, y, z, yaw) => ship.reset({ x, y, z }, yaw),
      setWind: () => {}, setZone: (v, r) => { zone = { v, r }; }, clearZone: () => { zone = null; },
      zoneDist: () => (zone ? Math.hypot(ship.pos.x - zone.v.x, ship.pos.z - zone.v.z) : 1e9),
      zoneR: () => (zone ? zone.r : 0),
      setCenter: () => {}, addMsg: () => {}, complete: () => {}, fail: () => {},
      raceResult: () => null, setRoute: () => {},
    };
    def.setup(ctx);
    // Sweep the whole range the pilot's own valve can put her at, and see
    // whether the scenario ever hands any of it back.
    let worst = 0, worstAt = 0;
    for (let g = 0; g <= 100; g += 0.5) {
      ship.gas = g;
      def.tick(ctx, 1 / 30);
      const rise = ship.gas - g;
      if (rise > worst) { worst = rise; worstAt = g; }
    }
    const ok = worst <= 1e-9;
    if (!ok) fails++;
    console.log('   %s  %s  %s', ok ? 'ok  ' : 'FAIL', def.id.padEnd(14),
      ok ? 'never raises the gas'
        : `puts ${worst.toFixed(2)}% BACK when the pilot vents to ${worstAt}%`);
  }

  console.log('');
  console.log('EVERY GROUND TRIANGLE FACES THE SKY');
  console.log('   The black triangles. Told four times now — #51 on the river bank,');
  console.log('   #55 after I double-sided the wrong ribbon, and #57, #87 and #89 out');
  console.log('   in the Bois and over the eastern reach. Nine places in world.js');
  console.log('   decide by hand which order to push three indices in, each a coin');
  console.log('   flip on which way the line happens to run, and a surface wound the');
  console.log('   wrong way has its normal in the earth: back-face culled if it is');
  console.log('   single-sided, BLACK if it is not, because it fails every lighting');
  console.log('   and shadow test there is.');
  console.log('');
  {
    let meshes = 0, tris = 0, down = 0, worst = null;
    for (const o of scene.children) {
      if (!o || o.isInstancedMesh) continue;
      const g = o.geometry;
      const p = g && g.attributes && g.attributes.position;
      if (!p || !p.count || !g.index) continue;
      const idx = g.index.array || g.index;
      if (!idx || !idx.length) continue;
      let mTris = 0, mDown = 0;
      for (let i = 0; i + 2 < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const ux = p.getX(b) - p.getX(a), uz = p.getZ(b) - p.getZ(a);
        const vx = p.getX(c) - p.getX(a), vz = p.getZ(c) - p.getZ(a);
        const ny = uz * vx - ux * vz;
        if (Math.abs(ny) < 1e-6) continue;          // a wall, not a floor
        mTris++;
        if (ny < 0) {
          mDown++;
          if (!worst || mDown === 1) worst = { x: Math.round(p.getX(a)), z: Math.round(p.getZ(a)) };
        }
      }
      if (!mTris) continue;
      meshes++; tris += mTris; down += mDown;
    }
    const ok = down === 0 && tris > 10000;
    if (!ok) fails++;
    console.log('   %s  %d of %d ground triangles across %d meshes face DOWN%s',
      ok ? 'ok  ' : 'FAIL', down, tris, meshes,
      down && worst ? ` (first at ${worst.x}, ${worst.z})` : '');
  }

  console.log('');
  console.log('NO GROUND STANDS UP THROUGH THE SEINE');
  console.log('   The river is one flat sheet 140 m wide and the terrain carves a bed');
  console.log('   for it — but on a 50 m grid, with a distance test, the ground');
  console.log('   interpolates back up between a carved station and an uncarved one.');
  console.log('   3.8% of it stood at or above the water, worst by 2.92 m: the bright');
  console.log('   rippling patches lying on the bank and flickering as the eye moves.');
  console.log('   MEASURED ON THE BUILT MESH, which is the thing that was fixed —');
  console.log('   parisGround still answers what the survey says.');
  console.log('');
  {
    const { SEINE_XZ, riverNear, RIVER_HALF } = await import('../src/paris_terrain.js');
    // BY NAME. This used to take whichever mesh had the most vertices, which
    // was the terrain right up until the harness learned to read hand-built
    // geometry — and then it was a bank ribbon, which lies ON the bank ABOVE
    // the water, so the check reported 692 vertices standing in the river and
    // was measuring the wrong object entirely.
    const terr = scene.children.find((o) => o && o.name === 'paris-terrain');
    if (!terr || !Number.isFinite(world.riverY)) {
      console.log('   ---  the world does not publish its river level; skipped');
    } else {
      const p = terr.geometry.attributes.position;
      const ox = terr.position.x || 0, oz = terr.position.z || 0;
      let up = 0, wet = 0, worst = -1e9;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + ox, z = p.getZ(i) + oz, y = p.getY(i);
        const near = riverNear(x, z);
        if (!near || near.dist >= RIVER_HALF) continue;
        wet++;
        const over = y - world.riverY;
        if (over > -0.25) { up++; if (over > worst) worst = over; }
      }
      const ok = up === 0 && wet > 1000;
      if (!ok) fails++;
      console.log('   %s  %d of %d vertices in the river channel reach the water%s',
        ok ? 'ok  ' : 'FAIL', up, wet,
        up ? ` (worst ${worst.toFixed(2)} m above it)` : '');
    }
  }

  console.log('');
  console.log('NO GEM IS INSIDE THE THING IT MARKS');
  console.log('   The postcard hunt hangs a gem at each landmark\'s own height, which');
  console.log('   is chosen to read well as a label and was never asked whether there');
  console.log('   is anything there. Three of them were inside the building: the mill');
  console.log('   at Longchamp, Festival Hall at St. Louis, and the Grande Roue —');
  console.log('   "gem is inside the Ferris wheel on scavenger hunt".');
  console.log('');
  {
    const { buildWorldMonaco } = await import('../src/world_monaco.js');
    const { buildWorldStLouis } = await import('../src/world_stlouis.js');
    const mkScene = () => ({ children: [], add(...o) { this.children.push(...o); },
      remove() {}, traverse(f) { f(this); } });
    const GEM = 7, HALO = 15;
    const worlds = [['paris', world],
      ['monaco', buildWorldMonaco(mkScene())],
      ['stlouis', buildWorldStLouis(mkScene())]];
    let bad = [];
    for (const [place, w2] of worlds) {
      for (const lm of (w2.landmarks || [])) {
        for (const b of (w2.buildings || [])) {
          const hw = (b.rw !== undefined ? b.rw : b.w) / 2;
          const hd = (b.rd !== undefined ? b.rd : b.d) / 2;
          if (Math.abs(b.x - lm.x) > hw + HALO || Math.abs(b.z - lm.z) > hd + HALO) continue;
          const top = b.top !== undefined ? b.top : b.h;
          if (lm.y - GEM < top && lm.y + GEM > (b.y || 0)) {
            bad.push(`${place}/${lm.id} at ${lm.y} m, inside something reaching ${top.toFixed(0)} m`);
            break;
          }
        }
      }
    }
    // ...AND THE WHEEL, which has no collider on purpose — her own clue says
    // the course threads her — so nothing above would ever have found her.
    // The rim is 46 m about a hub at 52; see La Grande Roue in world.js.
    const roue = (world.landmarks || []).find((l) => l.id === 'roue');
    if (roue && roue.y - GEM < 52 + 46) bad.push(`paris/roue at ${roue.y} m, inside a rim reaching 98 m`);
    const ok = bad.length === 0;
    if (!ok) fails++;
    console.log('   %s  %d gems inside what they mark%s', ok ? 'ok  ' : 'FAIL',
      bad.length, bad.length ? ':\n        ' + bad.join('\n        ') : '');
  }

  console.log('');
  console.log('THE BRIDGE REACHES THE OTHER BANK');
  console.log('   The Pont de Saint-Cloud was written as a 96 m deck with its');
  console.log('   abutments at +-41, which crosses a river 82 m wide. The Seine here');
  console.log('   is 144. So it stopped 24 m short of the water on both sides and its');
  console.log('   abutments stood out in the open stream: "the closer one looks like');
  console.log('   one ramp was in the middle of the Seine."');
  console.log('');
  {
    const { PONT, AVRE } = await import('../src/paris_stcloud.js');
    const { RIVER_HALF } = await import('../src/paris_terrain.js');
    // BOTH CROSSINGS. Fixing the road bridge and not the aqueduct earned two
    // more reports a minute apart, and the second of them was the aqueduct's
    // GREEN EMBANKMENT standing in the water: "dark green in the water?"
    for (const [name, at] of [['the road bridge', PONT], ['the aqueduct', AVRE]]) {
      const wb = scene.children.find((o) => o && o.position
        && Math.abs(o.position.x - at.x) < 1 && Math.abs(o.position.z - at.z) < 1
        && Array.isArray(o.children) && o.children.length > 8);
      if (!wb) { console.log('   FAIL cannot find %s to measure', name); fails++; continue; }
      // the deck is the longest thing in it; everything else must either be a
      // pier (thin, meant to stand in the stream) or clear of the water
      let deck = 0, worst = null;
      for (const c of wb.children) {
        const p = c && c.geometry && c.geometry.parameters;
        if (p && p.width > deck) deck = p.width;
      }
      for (const c of wb.children) {
        const p = c && c.geometry && c.geometry.parameters;
        if (!p || !c.position || !Number.isFinite(p.width)) continue;
        if (p.width >= deck - 0.01) continue;            // the deck and its parapets
        if (p.width <= 10) continue;                     // a pier or a railing post
        const inner = Math.abs(c.position.x) - p.width / 2;
        if (inner < RIVER_HALF - 0.5) {
          const into = RIVER_HALF - inner;
          if (!worst || into > worst.into) worst = { into, w: p.width };
        }
      }
      const spans = deck / 2 >= RIVER_HALF;
      const ok = spans && !worst;
      if (!ok) fails++;
      console.log('   %s  %s: deck %s m across %s m of river%s',
        ok ? 'ok  ' : 'FAIL', name.padEnd(15), deck.toFixed(0), (RIVER_HALF * 2).toFixed(0),
        worst ? `, and a ${worst.w.toFixed(0)} m block standing ${worst.into.toFixed(0)} m INTO the water`
          : spans ? ', nothing solid in it but piers' : ' — IT DOES NOT REACH');
    }
  }

  console.log('');
  console.log('EVERY RING HAS A HOLE IN IT');
  console.log('   "Every gate has air in it" measured the ground under the gate and');
  console.log('   nothing else, so it never noticed that four of the Tour of Paris\'s');
  console.log('   twelve rings were hung on the middle of a BUILDING. The worst was');
  console.log('   the Trocadero, whose 70 m towers came up through a ring whose lower');
  console.log('   rim was at 46 m: "the rings for the course should be in the avenue');
  console.log('   and not over the buildings."');
  console.log('');
  for (const t of TRACKS.filter((x) => x.location === 'paris')) {
    let blocked = 0, worst = null;
    for (let i = 0; i < t.gates.length; i++) {
      const g = t.gates[i];
      const rim = g.y - (g.r || 24);
      for (const b of world.buildings) {
        const d = Math.hypot(b.x - g.x, b.z - g.z) - Math.hypot(b.w, b.d) / 2;
        if (d > (g.r || 24)) continue;
        const top = b.top !== undefined ? b.top : b.h;
        const over = top - rim;
        if (over <= 0) continue;
        blocked++;
        if (!worst || over > worst.over) worst = { i: i + 1, over, top, rim };
        break;
      }
    }
    const ok = blocked === 0;
    if (!ok) fails++;
    console.log('   %s  %s  %d of %d rings have a roof through them%s',
      ok ? 'ok  ' : 'FAIL', t.id.padEnd(16), blocked, t.gates.length,
      worst ? ` (worst gate ${worst.i}: a ${worst.top.toFixed(0)} m roof through a rim at ${worst.rim.toFixed(0)} m)` : '');
  }

  console.log('');
  console.log('NOTHING IN PARIS IS BUILT UPSIDE DOWN');
  console.log('   Chasing #57 — "upside down cones like we had on the river bank" out');
  console.log('   in the Bois. Most of this world lives in instance matrices, and the');
  console.log('   harness could not read one until now: setMatrixAt threw the matrix');
  console.log('   away and Matrix4.makeScale returned itself unchanged, so the');
  console.log('   question could not be asked at all and three investigations came');
  console.log('   back empty. It can be asked now.');
  console.log('');
  {
    let meshes = 0, insts = 0;
    const bad = [];
    for (const o of scene.children) {
      if (!o || !o.isInstancedMesh || !Array.isArray(o.matrices)) continue;
      meshes++;
      for (const m of o.matrices) {
        if (!m || !m.s || !m.p) continue;
        insts++;
        if (m.s.x < 0 || m.s.y < 0 || m.s.z < 0
          || !Number.isFinite(m.s.x) || !Number.isFinite(m.s.y) || !Number.isFinite(m.s.z)
          || !Number.isFinite(m.p.x) || !Number.isFinite(m.p.y) || !Number.isFinite(m.p.z)) {
          bad.push(m);
        }
      }
    }
    if (!insts) { console.log('   FAIL no instance matrices were readable at all'); fails++; }
    else {
      const ok = bad.length === 0;
      if (!ok) fails++;
      console.log('   %s  %d instances across %d meshes; %d inverted or non-finite%s',
        ok ? 'ok  ' : 'FAIL', insts, meshes, bad.length,
        bad.length ? ` (first at ${bad[0].p.x.toFixed(0)}, ${bad[0].p.z.toFixed(0)})` : '');
    }
    // ...and the trees of the Bois stand ON the Bois, which is the other half
    // of what an upside-down cone out there could have been.
    const TX = -3086, TZ = -1051;
    let planted = 0, adrift = 0, worst = 0;
    for (const o of scene.children) {
      if (!o || !o.isInstancedMesh || !Array.isArray(o.matrices)) continue;
      for (const m of o.matrices) {
        if (!m || !m.p || Math.hypot(m.p.x - TX, m.p.z - TZ) > 600) continue;
        planted++;
        const off = m.p.y - world.groundAt(m.p.x, m.p.z);
        if (off < -0.5) { adrift++; worst = Math.min(worst, off); }
      }
    }
    const ok2 = adrift === 0 && planted > 50;
    if (!ok2) fails++;
    console.log('   %s  %d things stand within 600 m of the report; %d are under their own ground%s',
      ok2 ? 'ok  ' : 'FAIL', planted, adrift, adrift ? ` (worst ${worst.toFixed(1)} m)` : '');
  }

  console.log('');
  console.log('THE AERODROME STANDS ON THE GROUND');
  console.log('   liftToTerrain walks the scene\'s TOP-LEVEL children only, so the');
  console.log('   Aero-Club\'s field went up by the height under its own origin —');
  console.log('   the pad — and every building in it went with it whatever was');
  console.log('   underneath. The coteaux climb westward, so the shed sat 11.7 m');
  console.log('   into the hill ("there was no hanger in the headset") and the club');
  console.log('   house, the office, the gas plant and the cylinders were buried');
  console.log('   whole. Each is measured here against the ground beneath ITSELF.');
  console.log('');
  {
    // MEASURED OFF THE BUILT SCENE, not off the formula that built it. The
    // first cut of this check recomputed sitOn() and compared it with itself,
    // which is an identity: it could not fail, and this project has shipped
    // three of those already. So: find the group the aerodrome was actually
    // put in, and ask where its children ended up.
    const { PAD_POS } = await import('../src/world.js');
    const field = scene.children.find((o) => o && o.position
      && Math.abs(o.position.x - PAD_POS.x) < 1 && Math.abs(o.position.z - PAD_POS.z) < 1
      && Array.isArray(o.children) && o.children.length > 10);
    if (!field) { console.log('   FAIL cannot find the aerodrome group to measure'); fails++; }
    else {
      let buried = 0, floating = 0, worst = 0, worstAt = '';
      for (const c of field.children) {
        if (!c || !c.position) continue;
        const wx = field.position.x + c.position.x, wz = field.position.z + c.position.z;
        const wy = field.position.y + c.position.y;
        const under = world.groundAt(wx, wz);
        // the cylinders and the palings are modelled about their middles, so a
        // metre and a half of slack; anything past three is a fault
        const off = under - wy;
        if (Math.abs(off) > Math.abs(worst)) { worst = off; worstAt = `${wx.toFixed(0)}, ${wz.toFixed(0)}`; }
        if (off > 3) buried++;
        if (off < -3) floating++;
      }
      const ok = buried === 0 && floating === 0;
      if (!ok) fails++;
      console.log('   %s  %d of %d buildings buried, %d in the air; worst is %s m at (%s)',
        ok ? 'ok  ' : 'FAIL', buried, field.children.length, floating,
        worst.toFixed(1), worstAt);
    }
  }

  console.log('');
  console.log('SOMEBODY IS FLYING THE OTHER SHIP');
  console.log('   A remote pilot\'s ship used to go past with nobody aboard, which');
  console.log('   reads as a runaway rather than as the pilot whose name is on the');
  console.log('   label over it. He stands on the deck point, so he has to clear the');
  console.log('   balloon over his head on every hull in the fleet — the No. 9 is a');
  console.log('   runabout with the envelope close down on the basket.');
  console.log('');
  for (const [id, spec] of Object.entries(SHIPS)) {
    const sh = makeShip(id);
    const fig = sh.addCrew();
    const HEAD = 1.80;                       // the top of his hat, above his boots
    const deck = sh.deckPoint.position.y;
    const head = deck + HEAD;
    const roof = -spec.envelope.diameter / 2;             // the balloon over him
    const feetOk = fig && Math.abs(fig.position.y - deck) < 1e-9;
    const clear = roof - head;
    // ...and he may be put aboard once. A second call on the same ship would
    // stack a man inside a man.
    const onceOnly = sh.addCrew() === null;
    const ok = !!fig && feetOk && clear > 0.1 && onceOnly;
    if (!ok) fails++;
    console.log('   %s  %s  head %s m, balloon %s m — %s m of daylight%s%s',
      ok ? 'ok  ' : 'FAIL', id.padEnd(13),
      head.toFixed(2).padStart(6), roof.toFixed(2).padStart(6), clear.toFixed(2).padStart(5),
      feetOk ? '' : '   FEET NOT ON THE DECK', onceOnly ? '' : '   CREWED TWICE');
  }
  // and never in your OWN basket: in a headset that is a man you are standing
  // inside of. The only caller is the one that builds somebody else's ship.
  {
    const src = await (await import('node:fs/promises')).readFile('src/main.js', 'utf8');
    const ok = !/\.addCrew\s*\(/.test(src);
    if (!ok) fails++;
    console.log('   %s  main.js never crews the ship you are flying yourself',
      ok ? 'ok  ' : 'FAIL');
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
    // 81 indoors and 8 midstream when the gardens first went in; then 12, once
    // they were filtered but planted before the landmark colliders existed
    if (inR > 0) { console.log('   FAIL trees growing in the river'); fails++; }
    else if (inB > 2) { console.log('   FAIL trees growing indoors'); fails++; }
    else console.log('   ok   nothing growing in the river and nothing indoors');
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
  console.log('THE TWO THINGS THAT BALLAST HER WITHOUT A SACK');
  {
    const P = SHIPS.no6.physics;
    const env2 = { groundAt: world.groundAt, buildings: world.buildings,
      waterY: world.waterY, underCloud: false, inBois: false };

    // 1. burning petroleum leaves her light — the end-of-voyage lift problem
    const s1 = makeShip('no6');
    s1.reset({ x: 520, y: 120, z: 300 }, 0);
    let yEarly = 0;
    for (let k = 0; k < 90000; k++) {
      s1.update(1/30, { throttle: 1, rudder: 0, pitch: 0, vent: 0, coax: 0 },
        { x: 0, y: 0, z: 0 }, env2);
      if (k === 900) yEarly = s1.pos.y;
      if (s1.wrecked || s1.fuel <= 0) break;
    }
    const rose = s1.pos.y - yEarly;
    console.log('   petrol: a full tank weighs ' + (0.25 / P.bagLift).toFixed(1)
      + ' ballast bags; burning it lifted her ' + rose.toFixed(0) + ' m');
    if (rose < 20) { console.log('   FAIL burning fuel does not lighten her'); fails++; }
    else console.log('   ok   she gets light as the tank empties');

    // 2. the guide rope takes her weight as it lies down, and gives it back
    const s2 = makeShip('no6');
    s2.reset({ x: -2000, y: world.groundAt(-2000, 400) + 25, z: 400 }, 0);
    s2.gas = 96;
    for (let k = 0; k < 5400; k++)
      s2.update(1/30, { throttle: 0, rudder: 0, pitch: 0, vent: 0, coax: 0 },
        { x: 0, y: 0, z: 0 }, env2);
    const held = s2.groundedFrac * P.ropeLift;
    console.log('   rope:   ' + (s2.groundedFrac * 100).toFixed(0) + '% of it down, holding '
      + (held / P.bagLift).toFixed(1) + ' bags of her weight, hovering at '
      + (s2.pos.y - world.groundAt(s2.pos.x, s2.pos.z)).toFixed(1) + ' m');
    if (s2.groundedFrac <= 0 || s2.pos.y - world.groundAt(s2.pos.x, s2.pos.z) > 40) {
      console.log('   FAIL the rope is not holding her up'); fails++;
    } else console.log('   ok   she rides on her rope instead of sinking');

    // 3. and it lies ON the water, not on the riverbed under it
    const riv = world.riverPts[Math.floor(world.riverPts.length * 0.35)];
    const s3 = makeShip('no6');
    s3.reset({ x: riv.x, y: world.groundAt(riv.x, riv.z) + 34, z: riv.z }, 0);
    for (let k = 0; k < 1800; k++)
      s3.update(1/30, { throttle: 0, rudder: 0, pitch: 0, vent: 0, coax: 0 },
        { x: 0, y: 0, z: 0 }, env2);
    const lowest = s3.rope.reduce((m, n) => Math.min(m, n.p.y), Infinity);
    const under = riv.y - lowest;
    console.log('   Seine:  lowest rope node ' + (under >= 0 ? under.toFixed(2) + ' m under'
      : (-under).toFixed(2) + ' m over') + ' the surface (the bed is 1.4 m down)');
    if (under > 0.5) { console.log('   FAIL the rope is dragging on the riverbed'); fails++; }
    else console.log('   ok   the rope lies on the water');
  }

  console.log('');
  console.log('THE BASKET IS FLYABLE FROM INSIDE IT (headset)');
  console.log('   A cord you cannot reach is a control you do not have; two that');
  console.log('   overlap are worse; and a slate 29 cm from your eyes is 77');
  console.log('   degrees of instrument panel.');
  console.log('');
  {
    const V3 = makeShip('no6').pos.constructor;
    let worstCord = 0, worstSlate = 0, behind = 0, missing = 0, nearest = Infinity;
    for (const id of Object.keys(SHIPS)) {
      const sh = makeShip(id);
      sh.reset({ x: 0, y: 100, z: 0 }, 0);
      sh.updateTransforms(0);
      const eye = new V3();
      (sh.eyePoint || sh.basketMesh).getWorldPosition(eye);
      // ALLUM. is only fitted where there is a motor to light
      const want = sh.spec.prop === 'none' ? ['ballast', 'vent', 'menu']
        : ['ballast', 'vent', 'spark', 'menu', 'trim', 'carb', 'tiller',
        'push_bug', 'push_menu', 'push_go', 'push_exitvr'];
      const got = {};
      for (const c of want) {
        const p2 = sh.cordAt(c);
        if (!p2) { missing++; continue; }
        got[c] = p2.clone();
        worstCord = Math.max(worstCord, eye.distanceTo(p2));
      }
      // and no two fittings may sit inside one another's grab radius, or a
      // hand reaching for the valve throws the spark instead
      const ks = Object.keys(got);
      for (let a = 0; a < ks.length; a++) for (let b2 = a + 1; b2 < ks.length; b2++) {
        nearest = Math.min(nearest, got[ks[a]].distanceTo(got[ks[b2]]));
      }
      if (!sh.panelMesh) { missing++; continue; }
      const pm = new V3();
      sh.panelMesh.getWorldPosition(pm);
      worstSlate = Math.max(worstSlate, eye.distanceTo(pm));
      if (pm.x - eye.x < 0.05) behind++;
    }
    console.log('   furthest fitting ' + worstCord.toFixed(2) + ' m from the eye; '
      + 'closest two ' + nearest.toFixed(2) + ' m apart (grab radius 0.10); '
      + 'slate at ' + worstSlate.toFixed(2) + ' m');
    if (missing) { console.log('   FAIL ' + missing + ' ships have no cords or no slate'); fails++; }
    else if (worstCord > 0.9) { console.log('   FAIL a cord is out of reach'); fails++; }
    else if (worstSlate < 0.35) { console.log('   FAIL the slate is too close to focus on'); fails++; }
    else if (behind) { console.log('   FAIL a slate is behind the pilot'); fails++; }
    // wider than the grab radius in vr.js (0.10), so the nearer of any two
    // fittings is always the one the hand is actually on. The four pushes on
    // the port rail are a row and sit 0.12 apart; they were 0.08, which is
    // inside the radius and no hand could have picked one out.
    else if (nearest < 0.115) { console.log('   FAIL two fittings overlap — a hand cannot tell them apart'); fails++; }
    else console.log('   ok   LEST, SOUPAPE, CARB., ALLUM., POIDS and CARNET in reach and distinct');

    // ...and the test that matters: a hand laid ON a fitting must find THAT
    // fitting. CARB. failed this without being close to anything — it was not
    // registered at all, so a hand on it found ALLUM. four inches away.
    let confused = [];
    for (const id of Object.keys(SHIPS)) {
      const sh = makeShip(id);
      sh.reset({ x: 0, y: 100, z: 0 }, 0);
      sh.updateTransforms(0);
      for (const want2 of ['ballast', 'vent', 'spark', 'menu', 'trim', 'carb', 'tiller',
        'push_bug', 'push_menu', 'push_go', 'push_exitvr']) {
        const at = sh.cordAt(want2);
        if (!at) continue;
        let best = null, bestD = Infinity;
        for (const other of ['ballast', 'vent', 'spark', 'menu', 'trim', 'carb', 'tiller',
        'push_bug', 'push_menu', 'push_go', 'push_exitvr']) {
          const p3 = sh.cordAt(other);
          if (!p3) continue;
          const d = at.distanceTo(p3);
          if (d < bestD) { bestD = d; best = other; }
        }
        if (best !== want2) confused.push(id + ': ' + want2 + ' -> ' + best);
      }
    }
    if (confused.length) {
      console.log('   FAIL a hand on one control finds another: ' + confused[0]);
      fails++;
    } else {
      console.log('   ok   a hand on any control finds that control, on every ship');
    }
  }

  console.log('');
  console.log('PARIS IS AFFORDABLE IN A HEADSET');
  console.log('   1,714 leaf meshes is 1,714 draw calls an eye and near 3,400 a');
  console.log('   frame; a Quest wants under two hundred. But the Deutsch prize is');
  console.log('   flying to a Tower you can see from St-Cloud, so the monuments are');
  console.log('   marked vrFar and never culled however far off they are.');
  console.log('');
  {
    const leaves = (o) => {
      const k = Array.isArray(o.children) ? o.children : [];
      return k.length ? k.reduce((a, c) => a + leaves(c), 0) : 1;
    };
    const exempt = (o) => { const u = o.userData || {}; return u.noLift || u.vrFar; };
    let total = 0;
    for (const c of scene.children) total += leaves(c);
    const KEEP = 900;
    let drawn = 0;
    for (const c of scene.children) {
      if (exempt(c)) { drawn += leaves(c); continue; }
      if (Math.hypot(c.position.x - world.padPos.x, c.position.z - world.padPos.z) < KEEP) {
        drawn += leaves(c);
      }
    }
    console.log('   ' + total + ' meshes; ' + drawn + ' drawn from the aerodrome');

    // THE CITY IS CUT INTO CHUNKS, and only the near ones are drawn. It used
    // to be MERGED instead — one box per city block, a third of the geometry
    // and a bar chart to look at: "the giant buildings look bad in vr". These
    // are the real buildings; there are simply fewer of them in view.
    const { CITY_NEAR } = await import('../src/vr.js');
    // NUMBERS, not truthiness. The headless stub answers unknown properties
    // with a permissive callable, so `userData.chunkAt` is truthy on objects
    // that have never heard of a chunk — one of them got in here and made the
    // reach NaN, and `CITY_NEAR < NaN * 2` is false, so the haze test passed by
    // being unanswerable. Ask for finite numbers and it cannot happen.
    const chunks = scene.children.filter((o) => {
      const u = o.userData || {};
      return u.chunkAt && Number.isFinite(u.chunkAt.x) && Number.isFinite(u.chunkAt.z)
        && Number.isFinite(u.chunkR);
    });
    const houses = world.buildings.filter((b) => b.rw !== undefined).length;
    if (!chunks.length) { console.log('   FAIL the city is not built in chunks at all'); fails++; }
    else {
      // how much of the city is in view from the worst place to stand: the
      // middle of it, where there is city on every side
      const mid = { x: 900, z: 0 };
      let near = 0;
      for (const c of chunks) {
        const u = c.userData;
        if (Math.hypot(u.chunkAt.x - mid.x, u.chunkAt.z - mid.z) - u.chunkR < CITY_NEAR) near++;
      }
      const frac = near / chunks.length;
      console.log('   ' + houses + ' houses in ' + chunks.length + ' chunk meshes; '
        + near + ' chunks (' + Math.round(frac * 100) + '%) in view from mid-city');
      // A quarter of Paris at a time is the trade: the merged city was a third
      // of the geometry and every bit of it drawn, so this must beat that.
      if (frac > 0.33) { console.log('   FAIL the chunks are barely a saving'); fails++; }
      else console.log('   ok   a headset draws ' + Math.round(frac * 100)
        + '% of the city, and every house in it is a real one');
      // ...and the fog must close over before the chunks stop, or the city
      // ends at a visible edge with Paris on the far side of it.
      const reach = Math.max(...chunks.map((c) => c.userData.chunkR));
      if (!Number.isFinite(reach) || !Number.isFinite(CITY_NEAR) || CITY_NEAR < reach * 2) {
        console.log('   FAIL the haze closes nearer than a chunk is wide (reach '
          + reach + ', haze ' + CITY_NEAR + ')');
        fails++;
      } else {
        console.log('   ok   the haze closes at ' + CITY_NEAR + ' m, over chunks reaching '
          + reach.toFixed(0) + ' m');
      }
    }
    if (drawn > total * 0.55) { console.log('   FAIL the cull is not buying enough'); fails++; }
    else console.log('   ok   the cull takes it down to ' + Math.round(drawn / total * 100) + '%');
    let missing = [];
    for (const [nm, id] of [['eiffel', 'eiffel'], ['trocadero', 'trocadero'],
      ['arc', 'etoile'], ['montmartre', 'montmartre'], ['notredame', 'notredame']]) {
      const p2 = placeLegacy(id);
      const near = scene.children.filter((o) => o.position
        && Math.hypot(o.position.x - p2.x, o.position.z - p2.z) < 60);
      if (!near.some((o) => (o.userData || {}).vrFar)) missing.push(nm);
    }
    if (missing.length) { console.log('   FAIL not seen from afar: ' + missing.join(', ')); fails++; }
    else console.log('   ok   every monument is drawn from anywhere in the frame');
  }

  console.log('');
  console.log('NO SCENARIO TELLS A WATER SHIP TO SPEND ITS SAND');
  {
    const src2 = await (await import('node:fs/promises')).readFile('src/scenarios.js', 'utf8');
    const bad2 = [];
    // any literal mention of sand or water that is not chosen from the ship
    for (const m of src2.matchAll(/'[^']*(sand|water)[^']*'/g)) {
      const around = src2.slice(Math.max(0, m.index - 120), m.index + m[0].length);
      if (!/spec\.ballast/.test(around)) bad2.push(m[0].slice(0, 54));
    }
    if (bad2.length) {
      console.log('   FAIL a scenario names the ballast outright: ' + bad2[0]);
      fails++;
    } else {
      console.log('   ok   every mention of ballast is chosen from the ship');
    }
  }

  console.log('');
  console.log('%s', fails === 0 ? 'ALL CHECKS PASS' : fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
