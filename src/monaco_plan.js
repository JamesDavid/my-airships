// Monaco, 1902 — the street skeleton in the game frame (+x seaward, shore
// at x≈26; -z is northeast up the coast toward Monte Carlo and Cap Martin;
// the Rock at z≈420 southwest). Traced against period plans and photographs
// (see PERIOD_NOTES.md): the Boulevard de la Condamine along the water where
// the Prince built the aerodrome, Rue Grimaldi behind it, the avenues
// climbing to the Casino, the Boulevard des Moulins through Monte Carlo,
// the Nice-Ventimiglia railway cut into the slope, and the Rampe Major
// winding up the Rock.

export const STREETS_MC = [
  // La Condamine
  { name: 'Boulevard de la Condamine', w: 14, pts: [[12, 150], [8, 20], [4, -110]], frontage: true },
  { name: 'Rue Grimaldi', w: 12, pts: [[-44, 160], [-48, 30], [-44, -90]], frontage: true },
  { name: 'Avenue du Port', w: 10, pts: [[-60, 100], [8, 64]], frontage: true },
  { name: 'Rue de Millo', w: 10, pts: [[-90, 140], [-95, 10]], frontage: true },

  // the climb to the Casino
  { name: 'Avenue de Monte-Carlo', w: 12, pts: [[0, -130], [-64, -230], [-105, -272]], frontage: true },
  { name: 'Avenue de la Costa', w: 10, pts: [[-70, -90], [-130, -190]], frontage: true },

  // Monte Carlo
  { name: 'Boulevard des Moulins', w: 13, pts: [[-150, -190], [-100, -330], [-80, -470], [-105, -590]], frontage: true },
  { name: 'Avenue des Spélugues', w: 10, pts: [[-60, -330], [-15, -420]], frontage: true },

  // the Rock and the west
  { name: 'Rampe Major', w: 8, pts: [[-50, 300], [-15, 350], [-45, 405]] },
  { name: 'Route de la Corniche', w: 10, dirt: true, pts: [[-140, 90], [-300, -10], [-470, -90], [-620, -220]] },

  // the railway, cut along the slope (rendered darker; no frontage)
  { name: 'Chemin de fer', w: 7, rail: true, pts: [[-135, 620], [-120, 320], [-108, 60], [-128, -180], [-150, -400], [-190, -620]] },
];

export const SITES_MC = [
  { x: -20, z: 0, r: 95 },      // the aerodrome of La Condamine and its apron
  { x: -130, z: -300, r: 78 },  // the Casino and its gardens
  { x: -30, z: 420, r: 150 },   // the Rock (palace, cathedral)
  { x: -95, z: 42, r: 22 },     // Sainte-Dévote in her ravine
  { x: 40, z: 0, r: 60 },       // the landing stage
];

export function inSiteMC(x, z, pad = 0) {
  for (const s of SITES_MC) {
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < (s.r + pad) * (s.r + pad)) return true;
  }
  return false;
}
