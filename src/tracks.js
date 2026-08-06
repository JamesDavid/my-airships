import { placeLegacy } from './paris_geo.js';
import { place as placeMC, groundAt as groundMC } from './monaco_geo.js';
import { LONGCHAMP } from './paris_stcloud.js';
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
    // ON the racecourse, and the right way round. This was a 600 x 380 ellipse
    // typed by hand; the real course is 418 x 705 — TALLER THAN IT IS WIDE — so
    // the circuit was turned through ninety degrees and stood wider than the
    // ground it was named for: "the rings seem wider than the track" (bug #44).
    // Taken from the course itself now (src/paris_stcloud.js), inset so the
    // gates sit over the track rather than outside the rail.
    gates: ellipse(LONGCHAMP.x, LONGCHAMP.z,
      LONGCHAMP.rx * 0.86, LONGCHAMP.rz * 0.86, 6, 60, 20),
  },
  {
    // his own exercise of 12 July 1901, and the hardest kind of flying there is:
    // not speed, but arriving at a named spot and stopping there
    id: 'longchamps-ten', location: 'paris', laps: 3, stops: true, v: 2,
    name: 'The Longchamps Ten',
    sub: '“stopping each time at a point designed beforehand” — halt in the first ring each lap',
    gates: ellipse(LONGCHAMP.x, LONGCHAMP.z,
      LONGCHAMP.rx * 0.86, LONGCHAMP.rz * 0.86, 6, 60, 20),
  },
  {
    id: 'gymkhana', location: 'paris', laps: 2, v: 4,
    name: 'The Aerial Gymkhana',
    sub: 'skirt the Roue, the Tower’s shoulder, under the Arc — 2 laps',
    // Hung off the landmarks themselves rather than written out: the places
    // moved onto their true coordinates, and gates written as numbers would
    // still be circling where the Roue and the Trocadéro used to stand.
    gates: (() => {
      const P = (id) => placeLegacy(id);
      const roue = P('roue'), twr = P('eiffel'), troc = P('trocadero'), arc = P('etoile');
      const ec = P('ecolemil');
      return [
        // SKIRT the rim — outside it. The Grande Roue's rim radius is 46 m and
        // this gate stood 52 m from its axis with a radius of 30, so its inner
        // edge was twenty-two metres INSIDE the wheel and the rim ran straight
        // through the hoop: "the first target is kinda smooshed into the Ferris
        // wheel" (bug #33). 88 m out leaves twelve metres of daylight.
        { x: roue.x + 88, y: 42, z: roue.z, r: 30 },
        { x: (twr.x + ec.x) / 2, y: 25, z: (twr.z + ec.z) / 2, r: 34 }, // low over the Champ de Mars
        { x: twr.x, y: 35, z: twr.z - 150, r: 34 },               // the Tower's shoulder
        // PAST the palace front, not through it. This gate sat on the rotunda
        // at 50 m with a radius of 34, and gateHeadings pointed it down the
        // z axis — which is exactly the line the Trocadéro's two 70 m towers
        // stand on, at 21 m either side of the centre. You were being asked to
        // fly between them through a ring wider than the gap: "this goal is
        // twisted should be turned so not blocked by towers" (bug #37).
        //
        // Sixty-two metres out over the forecourt keeps the low pass and the
        // drama — the rotunda is 18 m across and the curved galleries all sweep
        // the OTHER way, toward the Tower — with eighteen metres of daylight.
        { x: troc.x - 62, y: 44, z: troc.z, r: 26 },
        { x: arc.x + 300, y: 16, z: arc.z + 150, r: 26 },         // DOWN the Champs-Élysées
        { x: arc.x, y: 13, z: arc.z, r: 11, ang: -2.034 },        // UNDER the Arc
      ];
    })(),
  },
  {
    id: 'harbor', location: 'monaco', laps: 2, v: 3,
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
      return [
        { x: st.x, y: 20, z: st.z, r: 18 },                           // off the landing-stage
        { x: pt.x + 120, y: 18, z: pt.z + 90, r: 18 },                // wave-top across the bay
        { x: cs.x + 40, y: cs.g + 34, z: cs.z + 30, r: 20 },          // the Casino terrace
        { x: oc.x + 150, y: 22, z: oc.z + 120, r: 20 },               // out round the Rock's foot
        { x: rk.x, y: rk.g + 40, z: rk.z, r: 18 },                    // clear OVER the palace
      ];
    })(),
  },
  {
    id: 'basin', location: 'stlouis', laps: 2, v: 3,
    // v3: re-cut onto the surveyed fairground. The whole of St. Louis was
    // re-georeferenced off the 1904 ground plan (docs/STLOUIS_PLAT.md steps
    // 3–5), so every one of these gates moved — the old ones now stand over
    // open park a kilometre from what they were named for.
    name: 'The Basin Sprint',
    sub: 'the wheel, The Pike’s midway, the lagoon avenue — 2 laps',
    gates: [
      { x: 426, y: 40, z: 660, r: 15 },   // skirt the great wheel's rim
      { x: -370, y: 14, z: 543, r: 13 },  // down The Pike's midway canyon
      { x: -330, y: 16, z: 60, r: 16 },   // the Plaza of St. Louis
      { x: 140, y: 16, z: 0, r: 14 },     // skim the Grand Basin (mind the water!)
      { x: 316, y: 50, z: 95, r: 18 },    // round Festival Hall, up on its terrace
      { x: 35, y: 18, z: 330, r: 15 },    // up the lagoon avenue
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
