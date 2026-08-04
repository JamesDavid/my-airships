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

export const STREETS = [
  // ---- the grand axis ----
  { name: 'Avenue des Champs-Élysées', w: 30, pts: [[420, -420], [900, -180]], frontage: true },
  { name: 'Rue de Rivoli', w: 24, pts: [[900, -180], [1260, -110]], frontage: true },
  { name: 'Grands Boulevards', w: 26, pts: [[810, -380], [1000, -500], [1180, -450], [1290, -350]], frontage: true },
  { name: 'Avenue de l’Opéra', w: 20, pts: [[700, -560], [880, -300]], frontage: true },

  // ---- the twelve avenues of the Étoile, by name and true destination ----
  { name: 'Avenue du Bois (Foch)', w: 26, pts: [[420, -420], [-140, -380]] },
  { name: 'Avenue de la Grande-Armée', w: 22, pts: [[420, -420], [240, -740]], frontage: true },
  { name: 'Avenue de Wagram', w: 18, pts: [[420, -420], [610, -700]], frontage: true },
  { name: 'Avenue Hoche', w: 16, pts: [[420, -420], [690, -580]], frontage: true },
  { name: 'Avenue de Friedland', w: 18, pts: [[420, -420], [770, -450]], frontage: true },
  { name: 'Avenue Marceau', w: 16, pts: [[420, -420], [560, -140]], frontage: true },
  { name: 'Avenue d’Iéna', w: 16, pts: [[420, -420], [300, -60]], frontage: true },
  { name: 'Avenue Kléber', w: 18, pts: [[420, -420], [20, 140]], frontage: true },
  { name: 'Avenue Victor-Hugo', w: 16, pts: [[420, -420], [120, -560]], frontage: true },
  { name: 'Avenue MacMahon', w: 14, pts: [[420, -420], [330, -660]], frontage: true },
  { name: 'Avenue Carnot', w: 14, pts: [[420, -420], [220, -600]], frontage: true },

  // ---- the quays (riverside rows survive only on the dry side) ----
  { name: 'Quai (right bank)', w: 18, pts: [[-40, -300], [-70, -60], [30, 180], [170, 420], [210, 640]], frontage: true },
  { name: 'Quai (left bank)', w: 18, pts: [[-200, -280], [-160, -40], [-60, 220], [50, 470], [80, 660]], frontage: true },

  // ---- Trocadéro, the Champ, the École Militaire ----
  { name: 'Axe Trocadéro–École Militaire', w: 22, pts: [[20, 140], [460, 330]] },
  { name: 'Avenue de Suffren', w: 16, pts: [[195, 180], [245, 540]], frontage: true },
  { name: 'Avenue de la Bourdonnais', w: 16, pts: [[395, 175], [430, 520]], frontage: true },
  { name: 'Avenue de la Motte-Picquet', w: 16, pts: [[220, 480], [560, 430]], frontage: true },

  // ---- Passy, between the river and the Bois ----
  { name: 'Rue de Passy', w: 14, pts: [[-70, -60], [-230, -230]], frontage: true },
  { name: 'Avenue Mozart', w: 14, pts: [[-230, -230], [-330, -50]], frontage: true },
  { name: 'Rue de Boulainvilliers', w: 12, pts: [[-230, -50], [-120, 120]], frontage: true },

  // ---- the Bois de Boulogne carriage roads (dirt, unbuilt) ----
  { name: 'Allée de Longchamp', w: 14, dirt: true, pts: [[-160, -500], [-700, -160], [-990, 40]] },
  { name: 'Allée de Bagatelle', w: 12, dirt: true, pts: [[-450, -140], [-820, 100]] },
  { name: 'Allée des Lacs', w: 12, dirt: true, pts: [[-370, 470], [-420, 160], [-520, -120]] },
  { name: 'Route de la Cascade', w: 12, dirt: true, pts: [[-990, 40], [-1120, 320], [-980, 480], [-700, 420], [-560, 300]] },
];

// building-free precincts: plazas, parks, monuments, water approaches
export const SITES = [
  { x: 260, z: 150, r: 135 },   // the Tower and her plaza
  { x: 300, z: 330, r: 185 },   // the Champ de Mars
  { x: 420, z: -420, r: 64 },   // the Étoile
  { x: 900, z: -180, r: 85 },   // Place de la Concorde
  { x: 20, z: 140, r: 75 },     // the Trocadéro palace
  { x: 620, z: 260, r: 72 },    // Les Invalides
  { x: 560, z: -310, r: 78 },   // the Grand Palais
  { x: 400, z: 560, r: 85 },    // the Grande Roue
  { x: 700, z: -560, r: 58 },   // the Opéra
  { x: 810, z: -380, r: 48 },   // the Madeleine
  { x: 1040, z: 140, r: 78 },   // Notre-Dame
  { x: 920, z: 460, r: 62 },    // the Panthéon
  { x: 980, z: -720, r: 250 },  // Montmartre hill
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
