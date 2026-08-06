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

const HAND = [
  // ---- the grand axis ----
  { name: 'Avenue des Champs-Élysées', w: 60, pts: [[840, -840], [1800, -360]], frontage: true },
  { name: 'Rue de Rivoli', w: 48, pts: [[1800, -360], [2520, -220]], frontage: true },
  { name: 'Grands Boulevards', w: 52, pts: [[1620, -760], [2000, -1000], [2360, -900], [2580, -700]], frontage: true },
  { name: 'Avenue de l’Opéra', w: 40, pts: [[1400, -1120], [1760, -600]], frontage: true },

  // ---- the twelve avenues of the Étoile, by name and true destination ----
  { name: 'Avenue du Bois (Foch)', w: 52, pts: [[840, -840], [-280, -760]] },
  { name: 'Avenue de la Grande-Armée', w: 44, pts: [[840, -840], [480, -1480]], frontage: true },
  { name: 'Avenue de Wagram', w: 36, pts: [[840, -840], [1220, -1400]], frontage: true },
  { name: 'Avenue Hoche', w: 32, pts: [[840, -840], [1380, -1160]], frontage: true },
  { name: 'Avenue de Friedland', w: 36, pts: [[840, -840], [1540, -900]], frontage: true },
  { name: 'Avenue Marceau', w: 32, pts: [[840, -840], [1120, -280]], frontage: true },
  { name: 'Avenue d’Iéna', w: 32, pts: [[840, -840], [600, -120]], frontage: true },
  { name: 'Avenue Kléber', w: 36, pts: [[840, -840], [40, 280]], frontage: true },
  { name: 'Avenue Victor-Hugo', w: 32, pts: [[840, -840], [240, -1120]], frontage: true },
  { name: 'Avenue MacMahon', w: 28, pts: [[840, -840], [660, -1320]], frontage: true },
  { name: 'Avenue Carnot', w: 28, pts: [[840, -840], [440, -1200]], frontage: true },

  // ---- the quays (riverside rows survive only on the dry side) ----
  { name: 'Quai (right bank)', w: 36, pts: [[-80, -600], [-140, -120], [60, 360], [340, 840], [420, 1280]], frontage: true },
  { name: 'Quai (left bank)', w: 36, pts: [[-400, -560], [-320, -80], [-120, 440], [100, 940], [160, 1320]], frontage: true },

  // ---- Trocadéro, the Champ, the École Militaire ----
  { name: 'Axe Trocadéro–École Militaire', w: 44, pts: [[40, 280], [920, 660]] },
  { name: 'Avenue de Suffren', w: 32, pts: [[390, 360], [490, 1080]], frontage: true },
  { name: 'Avenue de la Bourdonnais', w: 32, pts: [[790, 350], [860, 1040]], frontage: true },
  { name: 'Avenue de la Motte-Picquet', w: 32, pts: [[440, 960], [1120, 860]], frontage: true },

  // ---- Passy, between the river and the Bois ----
  { name: 'Rue de Passy', w: 28, pts: [[-140, -120], [-460, -460]], frontage: true },
  { name: 'Avenue Mozart', w: 28, pts: [[-460, -460], [-660, -100]], frontage: true },
  { name: 'Rue de Boulainvilliers', w: 24, pts: [[-460, -100], [-240, 240]], frontage: true },

  // ---- the Bois de Boulogne carriage roads (dirt, unbuilt) ----
  { name: 'Allée de Longchamp', w: 28, dirt: true, pts: [[-320, -1000], [-1400, -320], [-1980, 80]] },
  { name: 'Allée de Bagatelle', w: 24, dirt: true, pts: [[-900, -280], [-1640, 200]] },
  { name: 'Allée des Lacs', w: 24, dirt: true, pts: [[-740, 940], [-840, 320], [-1040, -240]] },
  { name: 'Route de la Cascade', w: 24, dirt: true, pts: [[-1980, 80], [-2240, 640], [-1960, 960], [-1400, 840], [-1120, 600]] },
];

// The hand-drawn avenues first — they carry the names and the deliberate
// choices — then the whole surveyed network behind them. Together they give
// the city streets everywhere instead of a few grand axes across bare ground.
export const STREETS = [...HAND, ...OSM_STREETS];


// building-free precincts: plazas, parks, monuments, water approaches
export const SITES = [
  { x: 520, z: 300, r: 270 },   // the Tower and her plaza
  { x: 600, z: 660, r: 370 },   // the Champ de Mars
  { x: 840, z: -840, r: 128 },   // the Étoile
  { x: 1800, z: -360, r: 170 },   // Place de la Concorde
  { x: 40, z: 280, r: 150 },     // the Trocadéro palace
  { x: 1240, z: 520, r: 144 },    // Les Invalides
  { x: 1120, z: -620, r: 156 },   // the Grand Palais
  { x: 800, z: 1120, r: 170 },    // the Grande Roue
  { x: 1400, z: -1120, r: 116 },   // the Opéra
  { x: 1620, z: -760, r: 96 },   // the Madeleine
  { x: 2080, z: 280, r: 156 },   // Notre-Dame
  { x: 1840, z: 920, r: 124 },    // the Panthéon
  { x: 1960, z: -1440, r: 500 },  // Montmartre hill
];

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
