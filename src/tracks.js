import { placeLegacy } from './paris_geo.js';
import { place as placeMC, groundAt as groundMC } from './monaco_geo.js';
import { LONGCHAMP } from './paris_stcloud.js';
import { parisGround } from './world.js';
import { LANDMARKS } from './paris_landmarks.js';

/** "…a distance of about 35 kilometres (22 miles)" for ten circuits of
 *  Longchamps, 12 July 1901 (Ch. XII). A lap round the traced course measures
 *  3,585 m; this trims it to his 3,500. */
const LAP_INSET = 0.976;
// storage can throw outright (iOS private browsing) — never let it stop a flight
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* not saved */ } }

// Time-trial circuits (the "aerial gymkhana"). Historical warrant, Ch. XII:
// "Ten times in succession I made the circuit of Longchamps, stopping each
// time at a point designed beforehand." Gates thread the world's drama —
// the Grande Roue, the Arc, the harbor, the Observation Wheel.
//
// A track: { id, name, sub, location, laps, gates: [{x,y,z,r}] }
// The lap starts and ends at gates[0]; the spawn point is computed behind it.

export const TRACKS = [
  {
    id: 'longchamps', location: 'paris', laps: 3, v: 2,
    name: 'The Longchamps Circuit',
    sub: '“Ten times in succession I made the circuit of Longchamps” — 3 laps',
    // ON the racecourse, the right way round, AND THE RIGHT LENGTH.
    //
    // This was a 600 x 380 ellipse typed by hand; the real course is 418 x 705
    // — taller than it is wide — so the circuit stood turned through ninety
    // degrees and wider than the ground it was named for.
    //
    // And the book says how long a lap was. Ch. XII, 12 July 1901: "Ten times
    // in succession I made the circuit of Longchamps, stopping each time at a
    // point designed beforehand. After these first evolutions, which altogether
    // made up a distance of about 35 kilometres (22 miles)…" — 3.5 km a lap.
    //
    // A lap right round the traced outline comes to 3,585 m, which agrees with
    // his figure to 2.4%: the racecourse OpenStreetMap holds and the distance
    // he recorded in 1901 are the same ground. LAP_INSET trims that last 2.4%
    // so the lap IS 3.5 km, and the gates sit just inside the outer rail.
    gates: ellipse(LONGCHAMP.x, LONGCHAMP.z,
      LONGCHAMP.rx * LAP_INSET, LONGCHAMP.rz * LAP_INSET, 6, 60, 20),
  },
  {
    // his own exercise of 12 July 1901, and the hardest kind of flying there is:
    // not speed, but arriving at a named spot and stopping there
    id: 'longchamps-ten', location: 'paris', laps: 3, stops: true, v: 2,
    name: 'The Longchamps Ten',
    sub: '“stopping each time at a point designed beforehand” — halt in the first ring each lap',
    gates: ellipse(LONGCHAMP.x, LONGCHAMP.z,
      LONGCHAMP.rx * LAP_INSET, LONGCHAMP.rz * LAP_INSET, 6, 60, 20),
  },
  {
    // v7: four rings moved off the roofs they were hung on — a different course
    id: 'gymkhana', location: 'paris', laps: 1, v: 7,
    name: 'The Tour of Paris',
    sub: 'twelve landmarks, once round — the Tower, Montmartre, the Bastille, Notre-Dame',
    // ONE LAP OF THE WHOLE CITY, instead of two of six gates round the Champ de
    // Mars. Seventeen point seven kilometres, which the No. 6 has the petroleum
    // for three times over, and every gate is a place rather than a coordinate:
    // she is flown from the Tower out to the Étoile, along the grands boulevards
    // to Montmartre, down the eastern edge by the République and the Bastille,
    // back along the river past Notre-Dame and the Panthéon, and home over the
    // Invalides.
    //
    // Hung off the places themselves, like everything else here, so that when a
    // landmark moves onto better coordinates the course follows it.
    gates: (() => {
      const P = (id) => placeLegacy(id);
      const M = (id) => LANDMARKS.find((l) => l.id === id);
      // [what, how high over its own ground, how wide the ring, and where the
      //  ring stands relative to it]
      //
      // The heights clear what they are named for: the Tower is rounded at her
      // second platform rather than over the top, Montmartre's basilica stands
      // 86 m up on the butte before it starts, and the rest are flown past at
      // roof height, which is where a pilot of 1901 actually was.
      //
      // THE RING STANDS IN THE OPEN, NOT OVER THE ROOF. Every gate was hung on
      // the landmark's own coordinate, which is the middle of the building —
      // and a 34 m hoop centred on a building has that building through it.
      // Measured: four of the twelve had a roof standing above the ring's lower
      // rim, worst of all the Trocadero, whose 70 m towers came up through a
      // ring whose rim was at 46 m. "The rings for the course should be in the
      // avenue and not over the buildings."
      //
      // The offsets are measured, not guessed: for each blocked gate, the
      // smallest distance at which the ring finds air, and among the points at
      // that distance the one with the most open ground round it — which is
      // how you end up in the place or the boulevard rather than tucked behind
      // a corner. Sliding ALONG the course was tried first and moved the
      // Madeleine's gate 370 m, which is no longer the Madeleine's gate.
      //
      // They are written down rather than computed at run time because
      // src/anticheat.js replays a run through these same gates in the Edge
      // Function, where there is no city to measure against. Both sides must
      // read the same numbers. check_scenarios re-measures them against the
      // built city and fails if the city moves under them.
      // ...AND OFF THE TOWER HERSELF. "What the hell this is impossible it's
      // right in the tower." It was: a 46 m ring hung on the Eiffel Tower's own
      // axis at 120 m, where the Tower is 23 m across — so the iron stood dead
      // in the middle of the hoop and all that was left to fly through was a
      // 23 m annulus round a three-hundred-metre tower. The ring check missed
      // it because the Tower is not in world.buildings; she has her own taper,
      // towerRadiusAt(), and now the check asks it.
      //
      // She is rounded rather than threaded, so the gate goes out past her on
      // the Champ de Mars side — you come from the Trocadéro, over the Tower,
      // and take the ring beyond. 130 m out, which is 61 m of daylight between
      // the ring's near rim and the iron.
      const _e = P('eiffel'), _t = P('trocadero');
      const _d = Math.hypot(_e.x - _t.x, _e.z - _t.z) || 1;
      const _ex = ((_e.x - _t.x) / _d) * 130, _ez = ((_e.z - _t.z) / _d) * 130;
      const STOPS = [
        // The Trocadéro ring goes DOWN THE GARDENS, not beside the palace.
        // It used to sit 66 m west of the rotunda, which was open ground while
        // the palace was 115 m across; at its true 426 m the galleries sweep
        // through it — a 61 m roof through a 48 m rim. So it is struck 150 m
        // along the axis toward the Tower, over the cascade the wings hold
        // between them, which is where a gymkhana would thread it anyway.
        [P('eiffel'), 120, 46, _ex, _ez],
        [P('trocadero'), 58, 38, (_ex / 130) * 150, (_ez / 130) * 150],
        [P('etoile'), 62, 36], [M('madeleine'), 52, 34, 98, -69],
        [P('opera'), 58, 34], [P('montmartre'), 46, 40],
        [M('republique'), 46, 34], [M('bastille'), 58, 34, 48, -13],
        // ...and off the cathedral herself, now that she is 69 m of west tower
        // and solid with it rather than two boxes and a cone
        // ...and off the cathedral herself. -55, 25 was clear while she stood
        // as two boxes and a cone placed by eye; standing on her real outline
        // her 69 m west towers are through the ring. 120 m west and clear.
        [P('notredame'), 52, 36, -120, 40], [P('pantheon'), 58, 36],
        [M('gareorsay'), 46, 34, -122, -146], [P('invalides'), 62, 36],
      ];
      return STOPS.filter(([p]) => p).map(([p, h, r, dx = 0, dz = 0]) => {
        const x = p.x + dx, z = p.z + dz;
        // the height is over the ground UNDER THE RING, not under the monument
        return { x, y: parisGround(x, z) + h, z, r };
      });
    })(),
  },
  {
    // v4: the bay gate moved off the rock it was hung over
    id: 'harbor', location: 'monaco', laps: 2, v: 4,
    name: 'The Harbor Circuit',
    sub: 'the Casino terrace, over the Prince’s Palace — 2 laps',
    // Hung off the places, like the gymkhana, and for the same reason: Monaco
    // moved onto its true coordinates and real ground, and gates written out as
    // numbers would still be threading a bay that was never the right shape.
    // The heights are measured from what is under them, because the Rock is
    // fifty metres up and the water is not.
    gates: (() => {
      const P = (id) => { const p = placeMC(id); return { x: p.x, z: p.z, g: groundMC(p.x, p.z) }; };
      const st = P('stage'), pt = P('port'), cs = P('casino'), rk = P('rock'), oc = P('oceano');
      // RE-CUT FOR A SHIP THAT TURNS LIKE AN AIRSHIP — the same lesson the
      // St. Louis triangle learned below, and this course had not.
      //
      // "harbor circuit the turns are too tight" (#150), and measured, it was
      // not merely tight: flown stage-bay-casino-rockfoot-palace, the corner at
      // the Casino was a 167 DEGREE TURN — very nearly a reversal. The No. 6
      // circles at 102 m radius at racing speed (flown, not derived: full helm,
      // full throttle, until the circle settles), so that corner wants 908 m of
      // approach and the leg into it is 675. Two hundred and thirty metres
      // short: it could not be flown at all, only blundered round.
      //
      // Same five places, visited in the order that suits a turning circle.
      // Found by working every order of them from the landing-stage and taking
      // the one whose tightest corner has the most room: every corner now has
      // 208 m in hand, against minus 230.
      return [
        { x: st.x, y: 20, z: st.z, r: 18 },                           // off the landing-stage
        { x: oc.x + 150, y: 22, z: oc.z + 120, r: 20 },               // out round the Rock's foot
        { x: rk.x, y: rk.g + 40, z: rk.z, r: 18 },                    // clear OVER the palace
        // OUT OVER THE WATER. At port + [120, 90] this one stood where the
        // ground rises to 12 m, and its lower rim is at 0 — so twelve metres of
        // rock came up through a ring you are meant to fly at wave-top height:
        // "a ring in the bay that is too close to a mountain". Ninety metres
        // further into the bay it has nothing but sea under it, measured all
        // round the hoop rather than at its centre.
        { x: pt.x + 68, y: 18, z: pt.z + 16, r: 18 },                 // wave-top across the bay
        { x: cs.x + 40, y: cs.g + 34, z: cs.z + 30, r: 20 },          // the Casino terrace
      ];
    })(),
  },
  {
    // v4: RE-CUT FOR A SHIP THAT TURNS LIKE AN AIRSHIP.
    //
    // The order was wheel, Pike, Plaza, Basin, Festival Hall, lagoon — a
    // slalom, and it was flyable only because the No. 7 used to pivot inside
    // her own length. Once she turned in five lengths (168 m at racing speed)
    // it could not be flown at all: the run from the Basin to Festival Hall is
    // 200 m and ends in a 112 degree corner, which needs 250 m of approach to
    // set up, and the last corner at the wheel is 148 degrees — very nearly a
    // reversal.
    //
    // Same six places, visited in the order that suits a turning circle. Found
    // by working every cyclic order of them and taking the one whose tightest
    // leg has the most room to spare: every corner now has at least 159 m in
    // hand. The rings are four metres wider too, because a ship arriving off a
    // long sweep does not arrive as precisely as one that can pivot.
    id: 'basin', location: 'stlouis', laps: 2, v: 4,
    // v3: re-cut onto the surveyed fairground. The whole of St. Louis was
    // re-georeferenced off the 1904 ground plan (docs/STLOUIS_PLAT.md steps
    // 3–5), so every one of these gates moved — the old ones now stand over
    // open park a kilometre from what they were named for.
    name: 'The Basin Sprint',
    sub: 'the wheel, The Pike’s midway, the lagoon avenue — 2 laps',
    gates: [
      { x: 426, y: 40, z: 660, r: 19 },   // skirt the great wheel's rim
      { x: 316, y: 50, z: 95, r: 22 },    // round Festival Hall, up on its terrace
      { x: -370, y: 14, z: 543, r: 17 },  // down The Pike's midway canyon
      { x: -330, y: 16, z: 60, r: 20 },   // the Plaza of St. Louis
      { x: 140, y: 16, z: 0, r: 18 },     // skim the Grand Basin (mind the water!)
      { x: 35, y: 18, z: 330, r: 19 },    // up the lagoon avenue
    ],
  },
];

// Ring headings: each gate faces the BISECTOR of its incoming and outgoing
// legs — the true tangent on an oval, a fair split at a sharp corner. Shared
// by the renderer, the pass test, and the run validator so all three agree.
export function gateHeadings(gates, originPos) {
  const n = gates.length;
  return gates.map((g, i) => {
    if (g.ang != null) return g.ang;            // explicit heading (an archway)
    const prev = i > 0 ? gates[i - 1] : (originPos || gates[n - 1]);
    const next = i < n - 1 ? gates[i + 1] : (originPos || gates[0]);
    let ix = g.x - prev.x, iz = g.z - prev.z;
    let ox = next.x - g.x, oz = next.z - g.z;
    const il = Math.hypot(ix, iz) || 1, ol = Math.hypot(ox, oz) || 1;
    ix /= il; iz /= il; ox /= ol; oz /= ol;
    let dx = ix + ox, dz = iz + oz;
    // |in + out| = 2·cos(turn/2): below 1.0 the course doubles back through
    // more than 120°, and a bisector would stand the ring edge-on to both
    // legs. There, face the ENTRY leg — you fly through it, then turn.
    if (Math.hypot(dx, dz) < 1.0) { dx = ix; dz = iz; }
    return (dx || dz) ? Math.atan2(dx, dz) : 0;
  });
}

/**
 * How far OUTSIDE a gate's opening a crossing is, as a fraction of the opening:
 * under 1 went through it. `rel` is the ship's position minus the gate's, and
 * `rotY` is the ring's heading from gateHeadings().
 *
 * Lives here, with the gates themselves, so that main.js's race loop and
 * tools/check_scenarios.mjs are asking the same question of the same code. A
 * course that cannot be flown is not a thing to discover from the leaderboard.
 */
export function gateOffset(rel, g, rotY) {
  if (g.gw) {
    // A rectangular gate: across the opening and up it, separately — and the
    // goal is the WHOLE ring, right down to the ground. The frame's sill sits a
    // quarter of its height up so that it reads against the mast it stands off,
    // but that lift is scenery: a pilot rounding below the sill has still
    // rounded. Above the head misses; below never does.
    const tx = Math.cos(rotY), tz = -Math.sin(rotY);
    const across = Math.abs(rel.x * tx + rel.z * tz) / (g.gw / 2 + 6);
    const up = rel.y > 0 ? rel.y / (g.gh / 2 + 6) : 0;
    return { off: Math.max(across, up), missedWide: across > 1 };
  }
  const nx = Math.sin(rotY), nz = Math.cos(rotY);
  const sd = rel.x * nx + rel.z * nz;
  const lenSq = rel.x * rel.x + rel.y * rel.y + rel.z * rel.z;
  return { off: Math.sqrt(Math.max(0, lenSq - sd * sd)) / ((g.r || 24) + 6),
    missedWide: false };
}

/** The signed distance through a gate's plane: negative before, positive after. */
export function gatePlane(rel, rotY) {
  return rel.x * Math.sin(rotY) + rel.z * Math.cos(rotY);
}

function ellipse(cx, cz, rx, rz, n, y, r) {
  const g = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.push({ x: cx + Math.cos(a) * rx, y, z: cz + Math.sin(a) * rz, r });
  }
  return g;
}

// spawn ~90 m behind gate 0, facing it, at gate height
export function trackSpawn(track) {
  const g0 = track.gates[0];
  const gLast = track.gates[track.gates.length - 1];
  let dx = g0.x - gLast.x, dz = g0.z - gLast.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  return {
    x: g0.x - dx * 90, y: Math.max(14, g0.y), z: g0.z - dz * 90,
    yaw: Math.atan2(-dz, dx),
  };
}

// ---------------------------------------------------------------- ghosts
// A run: positions sampled at fixed dt, quantized to decimeters.
export const GHOST_DT = 0.12;

export function encodeGhost(best) {
  return btoa(JSON.stringify(best));
}

export function decodeGhost(code) {
  try {
    const g = JSON.parse(atob(code.trim()));
    if (!Array.isArray(g.p) || typeof g.t !== 'number') return null;
    return g;
  } catch { return null; }
}

// custom tracks live in localStorage
export function loadCustomTracks() {
  try { return JSON.parse(lsGet('myairships_tracks') || '[]'); }
  catch { return []; }
}

export function saveCustomTrack(t) {
  const list = loadCustomTracks().filter((x) => x.id !== t.id);
  list.push(t);
  lsSet('myairships_tracks', JSON.stringify(list));
}
