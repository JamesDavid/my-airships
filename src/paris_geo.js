// Paris, by its real coordinates.
//
// Everything in the Paris world used to be placed by eye against period plans,
// and the errors did not agree with one another: the Étoile sat a third too
// close to the Tower, the Trocadéro two hundred metres too far south — which
// put it in the Seine instead of on the hill of Chaillot, and a pilot duly
// reported a "castle thing hanging over the water".
//
// So there is one projection now, and one table of true positions. Anything
// that can be given a latitude and longitude should be placed through here.
//
// The frame is the one the game already used: +x east, -z north, with the
// Eiffel Tower as the anchor everything else is measured from.

// FULL scale: a game metre is a metre. The world was built at half scale, which
// is why the Deutsch limit had to read "the historic 30:00 at half scale" — and
// why the ships, which fly at their true speeds, always felt too fast for the
// city. At one to one the No. 6's real 22 km/h flies the real 11 km course in
// the real twenty-nine and a half minutes, and the fudge goes away.
export const SCALE = 1;                       // real metres per game metre
export const ORIGIN = { lat: 48.85826, lon: 2.29450 };   // the Eiffel Tower
export const ORIGIN_XZ = { x: 520, z: 300 };  // twice the old (260,150)

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);

/** A real latitude and longitude, in game coordinates. */
export function geo(lat, lon) {
  return {
    x: ORIGIN_XZ.x + ((lon - ORIGIN.lon) * M_PER_DEG_LON) / SCALE,
    z: ORIGIN_XZ.z - ((lat - ORIGIN.lat) * M_PER_DEG_LAT) / SCALE,
  };
}
/** …as a bare pair, for the street plan. */
export function xz(lat, lon) { const p = geo(lat, lon); return [Math.round(p.x), Math.round(p.z)]; }

/**
 * The places, by their true coordinates. Where a building was replaced later
 * (the Palais du Trocadéro by the Palais de Chaillot, the Gare d'Orsay's
 * platforms by the museum) the SITE is the same and the site is what matters.
 */
export const PLACES = {
  eiffel:      [48.85826, 2.29450],
  etoile:      [48.87378, 2.29503],   // the Arc de Triomphe
  trocadero:   [48.86212, 2.28751],   // the 1878 palace, on the Chaillot hill
  invalides:   [48.85661, 2.31250],
  grandpalais: [48.86609, 2.31251],
  petitpalais: [48.86603, 2.31474],
  concorde:    [48.86561, 2.32120],
  madeleine:   [48.87000, 2.32450],
  opera:       [48.87198, 2.33163],
  louvre:      [48.86096, 2.33739],
  notredame:   [48.85296, 2.34990],
  pantheon:    [48.84622, 2.34640],
  montmartre:  [48.88671, 2.34310],   // Sacré-Cœur, then rising
  bastille:    [48.85320, 2.36940],
  hoteldeville:[48.85657, 2.35222],
  gareorsay:   [48.86000, 2.32660],
  chatelet:    [48.85780, 2.34690],
  republique:  [48.86752, 2.36396],
  vendome:     [48.86728, 2.32944],
  roue:        [48.85440, 2.29060],   // the Grande Roue, off the Champ de Mars
  ecolemil:    [48.85160, 2.30030],   // the École Militaire
  autueil:     [48.84760, 2.25400],   // the Auteuil racecourse
  longchamp:   [48.85830, 2.23330],   // the Longchamps racecourse
  bagatelle:   [48.87180, 2.24550],
  puteaux:     [48.88300, 2.24000],   // the Île de Puteaux
  stcloud:     [48.84300, 2.22600],   // the Aéro-Club's ground in the park —
                                      // 5.3 km from the Tower, so the Deutsch
                                      // round trip comes out at the historic 11 km
  vaugirard:   [48.83900, 2.30500],   // Lachambre's balloon works
};

/**
 * The Seine, traced down its centreline: in at Austerlitz, west through the
 * city under the bridges, then the great loop north round the Bois by Boulogne,
 * Saint-Cloud, Suresnes and the Île de Puteaux. Downstream is north-west.
 */
export const SEINE = [
  [48.8455, 2.3700], [48.8490, 2.3620], [48.8530, 2.3555], [48.8562, 2.3465],
  [48.8578, 2.3390], [48.8595, 2.3320], [48.8620, 2.3245], [48.8637, 2.3170],
  [48.8642, 2.3080], [48.8628, 2.3000], [48.8608, 2.2930], [48.8578, 2.2860],
  [48.8546, 2.2800], [48.8508, 2.2740], [48.8478, 2.2690], [48.8452, 2.2610],
  [48.8437, 2.2510], [48.8428, 2.2400], [48.8432, 2.2300], [48.8460, 2.2240],
  [48.8510, 2.2205], [48.8570, 2.2200], [48.8640, 2.2215], [48.8710, 2.2240],
  [48.8790, 2.2300], [48.8850, 2.2380], [48.8900, 2.2470], [48.8940, 2.2580],
];

/** A named place, in game coordinates. */
export function place(id) {
  const p = PLACES[id];
  return p ? geo(p[0], p[1]) : null;
}

// ---------------------------------------------------------------------------
// The world was converted to full scale through these two functions: while it
// was half scale they carried the true table into the old frame, and now they
// are the identity. Kept because a good deal of code reads them, and because
// they record how the conversion was done.
// The world is FULL SCALE now, so these are the true frame and placeLegacy is
// the same as place. They are kept as names because a good deal of code reads
// them, and because they document what the conversion was.
export const LEGACY_ORIGIN = { x: ORIGIN_XZ.x, z: ORIGIN_XZ.z };
export const LEGACY_SCALE = 1;

export function placeLegacy(id) {
  const p = place(id);
  if (!p) return null;
  return {
    x: LEGACY_ORIGIN.x + (p.x - ORIGIN_XZ.x) / LEGACY_SCALE,
    z: LEGACY_ORIGIN.z + (p.z - ORIGIN_XZ.z) / LEGACY_SCALE,
  };
}
