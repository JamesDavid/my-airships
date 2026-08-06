// Monaco's landmark grounds — the plots no ordinary house may be built on.
//
// The street plan itself now lives in monaco_streets.js, generated from
// OpenStreetMap and screened to 1902; the frame and the real coordinates live
// in monaco_geo.js. Everything here is DERIVED from those, because the last
// time Monaco had a hand-typed table of positions the Tete de Chien stood two
// kilometres north of the mountain it is.

import { place } from './monaco_geo.js';

const at = (id, r) => { const p = place(id); return { x: p.x, z: p.z, r }; };

export const SITES_MC = [
  at('aerodrome', 70),    // the shed on the Boulevard de la Condamine and its apron
  at('stage', 55),        // the landing-stage out over the water
  at('rock', 90),         // the Place du Palais and the palace on it
  at('cathedral', 55),
  at('oceano', 55),       // Albert I's museum, going up on the cliff face
  at('casino', 85),       // the Casino and the gardens in front of it
  at('boulingrins', 70),  // the Boulingrins, above it
  at('stedevote', 30),    // the chapel in her ravine
  at('gare', 45),         // the station of 1868
  at('fortantoine', 40),
  at('forttete', 60),     // the fort on the summit, 1880s
  at('trophee', 55),      // the Trophy of Augustus, up at La Turbie
];

export function inSiteMC(x, z, pad = 0) {
  for (const s of SITES_MC) {
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < (s.r + pad) * (s.r + pad)) return true;
  }
  return false;
}
