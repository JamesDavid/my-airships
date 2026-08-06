import { place } from './paris_geo.js';
// The street skeleton of western Paris, 1900-1901, adapted to the game's
// half-scale frame (+x east, -z north; the Tower at 260,150; the Étoile at
// 420,-420). Traced against the period plans catalogued in PERIOD_NOTES.md:
// the Corps d'état-major survey (1901), the Larousse Plan de Paris (1900),
// and the Plan de l'Exposition Universelle (1900).
//
// street: { name, w, pts:[[x,z],...], frontage?, dirt? }
//  - frontage: buildings generate along both sides (river/site exclusions
//    naturally clear the water side of the quays)
//  - dirt: Bois carriage roads, unbuilt

import { OSM_STREETS } from './paris_streets.js';
// …and everything that is not a through route. The trunk network alone was
// 65 km against the thousand Paris had inside the fortifications, so thirty per
// cent of the city stood more than six hundred metres from any street — which
// is what a pilot filed as "no roads in paris again?", and why the frontage
// generator had to pack three thousand buildings onto the roads it did have.
// See docs/PARIS_1901.md and tools/fetch_paris_streets.py.
import { OSM_MINOR } from './paris_streets_minor.js';
import { LANDMARKS } from './paris_landmarks.js';

// What the survey does not carry: the earth carriage roads of the Bois, which
// are paths in OpenStreetMap and not roads at all.
//
// The city avenues that used to be here have gone. They were traced by hand
// against period plans in the old half frame, and when the world went to full
// scale their coordinates were merely doubled — so the Champs-Élysées began at
// (840,-840) while the Étoile stands at (559,-1428), and every one of them lay
// across open country beside the real street it was meant to be. The surveyed
// network carries all of them, in the right places and at 1901 widths.
const HAND = (() => {
  const B = place('bagatelle'), L = place('longchamp'), A = place('autueil'), E = place('etoile');
  const P = (x, z) => [Math.round(x), Math.round(z)];
  return [
    { name: 'Allée de Longchamp', w: 16, dirt: true,
      pts: [P(E.x - 700, E.z + 500), P(B.x + 500, B.z + 700), P(L.x + 350, L.z - 250)] },
    { name: 'Allée de Bagatelle', w: 14, dirt: true,
      pts: [P(E.x - 900, E.z - 100), P(B.x + 200, B.z - 150), P(B.x, B.z)] },
    { name: 'Allée des Lacs', w: 14, dirt: true,
      pts: [P(E.x - 800, E.z + 1100), P(B.x + 900, B.z + 1400), P(A.x + 400, A.z - 300)] },
    { name: 'Route de la Cascade', w: 14, dirt: true,
      pts: [P(L.x + 350, L.z - 250), P(L.x - 100, L.z + 500), P(L.x + 700, L.z + 800), P(A.x, A.z - 200)] },
  ];
})();


// The hand-drawn avenues first — they carry the names and the deliberate
// choices — then the whole surveyed network behind them. Together they give
// the city streets everywhere instead of a few grand axes across bare ground.
// The minor streets are DRAWN in full — that is the whole point of them — but
// they build at a quarter of a boulevard's density. Measured: at boulevard
// density six hundred kilometres of street generates some fifty thousand
// frontages and the renderer stops. See generateFrontages' `skip`.
export const STREETS = [...HAND, ...OSM_STREETS,
  ...OSM_MINOR.map((s) => ({ ...s, skip: 0.74 }))];


// building-free precincts: plazas, parks, monuments, water approaches
// The ground each landmark stands on, which no building may be placed in.
//
// These were written as numbers, and when the places moved onto their true
// coordinates the numbers were merely DOUBLED — so every exclusion ended up in
// the wrong field. Blocks were built on top of the Arc, the Grand Palais, the
// Trocadéro and the Invalides, while empty circles were cleared in open country
// where nothing stood. Two reported faults, one cause.
//
// Derived now, so a site cannot be anywhere but on its own landmark.
export const SITES = (() => {
  const P = (id) => place(id);
  const t = P('eiffel'), e = P('ecolemil');
  const S = (id, r) => { const p = P(id); return { x: p.x, z: p.z, r }; };
  return [
    S('eiffel', 270),
    { x: (t.x + e.x) / 2, z: (t.z + e.z) / 2, r: 370 },   // the Champ de Mars
    S('etoile', 200),           // the Étoile: twelve avenues meet in it
    S('concorde', 190),
    S('trocadero', 190),
    S('invalides', 150),
    S('grandpalais', 160),
    S('roue', 120),
    S('opera', 116),
    S('madeleine', 96),
    S('notredame', 156),
    S('pantheon', 124),
    S('montmartre', 420),
    // …and every landmark that had no site at all, which is why the frontage
    // generator ran rows of houses straight over the Louvre and the Hôtel de
    // Ville: they were coordinates in a table and nothing on the ground. The
    // radius comes from each one's own footprint (src/paris_landmarks.js), so
    // it cannot drift away from the building actually being drawn.
    ...LANDMARKS.map((L) => ({
      x: L.x, z: L.z, r: Math.hypot(L.w, L.l) / 2 + 26,
    })),
  ];
})();


export function inSite(x, z, pad = 0) {
  for (const s of SITES) {
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < (s.r + pad) * (s.r + pad)) return true;
  }
  return false;
}

// distance from a point to the nearest street centerline (for interior fill)
export function distToStreets(x, z) {
  let best = 1e9;
  for (const st of STREETS) {
    const p = st.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const x1 = p[i][0], z1 = p[i][1], x2 = p[i + 1][0], z2 = p[i + 1][1];
      const dx = x2 - x1, dz = z2 - z1;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - x1) * dx + (z - z1) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
      if (d < best) best = d;
    }
  }
  return best;
}


// ---------------------------------------------------------------------------
// How far a point is from the nearest street EDGE — negative when it is in the
// roadway. generateFrontages sets a building clear of the street it faces, but
// knew nothing of the other three hundred, so blocks landed in the middle of
// crossing roads. Everything that places a building asks this first.
//
// A coarse bucket grid, because this is asked a few thousand times at load and
// there are some seven hundred segments to try against.
const CELL = 120;
let grid = null;
function buildGrid() {
  grid = new Map();
  for (const st of STREETS) {
    for (let i = 0; i < st.pts.length - 1; i++) {
      const [x1, z1] = st.pts[i], [x2, z2] = st.pts[i + 1];
      const seg = { x1, z1, x2, z2, hw: st.w / 2 };
      const pad = st.w / 2 + CELL;
      const gx0 = Math.floor((Math.min(x1, x2) - pad) / CELL);
      const gx1 = Math.floor((Math.max(x1, x2) + pad) / CELL);
      const gz0 = Math.floor((Math.min(z1, z2) - pad) / CELL);
      const gz1 = Math.floor((Math.max(z1, z2) + pad) / CELL);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const k = gx + ',' + gz;
          let b = grid.get(k);
          if (!b) grid.set(k, b = []);
          b.push(seg);
        }
      }
    }
  }
}

export function streetClearance(x, z) {
  if (!grid) buildGrid();
  const bucket = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!bucket) return Infinity;
  let best = Infinity;
  for (const s of bucket) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - s.x1) * dx + (z - s.z1) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t)) - s.hw;
    if (d < best) best = d;
  }
  return best;
}
