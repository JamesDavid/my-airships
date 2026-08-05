// GENERATED FILE — do not edit.
// Copied from src/ships.js by supabase/sync-shared.mjs. Edit the original.
// Ship specifications derived from the book's text and figures.
// See docs/BOOK_REFERENCE.md, Part C, for sources. Units: metres; physics values
// are accelerations (m/s^2) on a unit-mass ship, tuned to the book's speeds (B10).
//
// envelope.shape: sphere | cylinder | stubby | ellipsoid | slender | egg
// keel.type: basket-long | pole | saddle | truss | minimal | double
// prop: none | bow | stern | both

export const SHIPS = {

  // "Brazil" — the beloved little spherical balloon (valise-packable).
  // No motor, no rudder: ballast, valve, and guide rope only. The tutorial.
  brazil: {
    id: 'brazil', name: 'The "Brazil"', sub: 'smallest of spherical balloons — drift with the wind',
    envelope: { shape: 'sphere', length: 8, diameter: 8, color: 0xdfd3b4 },
    keel: { type: 'basket-long', length: 3.5, drop: 7.5 },
    prop: 'none', rudderScale: 0,
    physics: {
      thrust: 0, dragQ: 0.2, dragL: 0.3, yawRate: 0, pitchMax: 0,
      gasLift: 3.0, weightBase: 1.7, bagLift: 0.2, bags: 6, fuel: 0, ventRate: 2.5,
      ropeLen: 90, ropeLift: 0.55, pressureLimit: 9, speedPressure: 0,
      foldResist: 1, partitions: true,
    },
  },

  // No. 1 (1898) — cylinder + cone ends, 25 x 3.5 m, 180 m^3, 3.5 hp tandem
  // tricycle motor, long cord suspension, sliding ballast bags (Fig. 3).
  // Folds like a pocket knife when starved — it nearly killed him at Bagatelle.
  no1: {
    id: 'no1', name: 'Santos-Dumont No. 1', sub: 'the first air-ship — handle with care',
    envelope: { shape: 'cylinder', length: 25, diameter: 3.5, color: 0xcfc2a2 },
    keel: { type: 'basket-long', length: 4, drop: 11 },
    prop: 'stern', rudderScale: 0.8,
    physics: {
      thrust: 3.2, dragQ: 0.05, dragL: 0.05, yawRate: 0.5, pitchMax: 0.3,
      gasLift: 3.15, weightBase: 1.5, bagLift: 0.15, bags: 8, fuel: 380, ventRate: 2.5,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.08, speedPressure: 0,
      foldResist: 0.05, partitions: false,   // the pocket-knife fold
    },
  },

  // No. 2 (1899) — same length, fatter (200 m^3), + fan ventilator (Fig. 5).
  // Doubled up in a rain gust on its first trial.
  no2: {
    id: 'no2', name: 'Santos-Dumont No. 2', sub: 'the ventilated cylinder',
    envelope: { shape: 'cylinder', length: 25, diameter: 4.1, color: 0xc8bb9d },
    keel: { type: 'basket-long', length: 4, drop: 10 },
    prop: 'stern', rudderScale: 0.8,
    physics: {
      thrust: 3.2, dragQ: 0.05, dragL: 0.05, yawRate: 0.5, pitchMax: 0.3,
      gasLift: 3.2, weightBase: 1.52, bagLift: 0.15, bags: 9, fuel: 380, ventRate: 2.5,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.1, speedPressure: 0,
      foldResist: 0.25, partitions: false,
    },
  },

  // No. 3 (1899) — stubby and big-bellied, 20 x 7.5 m, 500 m^3 of cheap coal gas,
  // 10 m bamboo pole keel (Fig. 6). No fold risk, but clumsy; ~25 km/h.
  no3: {
    id: 'no3', name: 'Santos-Dumont No. 3', sub: 'the big-bellied one — slow but sure',
    envelope: { shape: 'stubby', length: 20, diameter: 7.5, color: 0xb9ab8c },
    keel: { type: 'pole', length: 10, drop: 6.5 },
    prop: 'stern', rudderScale: 0.9,
    physics: {
      thrust: 3.4, dragQ: 0.07, dragL: 0.06, yawRate: 0.42, pitchMax: 0.3,
      gasLift: 3.2, weightBase: 1.6, bagLift: 0.14, bags: 10, fuel: 420, ventRate: 2.8,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.2, speedPressure: 0,
      foldResist: 1, partitions: true,
    },
  },

  // No. 4 (1900) — the bicycle-saddle ship: open spider-web keel, no basket,
  // propeller at the BOW pulling, 7 hp (photo p.135, Fig. 7).
  no4: {
    id: 'no4', name: 'Santos-Dumont No. 4', sub: 'the bicycle saddle — bow propeller',
    envelope: { shape: 'cylinder', length: 33, diameter: 5.1, color: 0xd5c9aa },
    keel: { type: 'saddle', length: 14, drop: 7.5 },
    prop: 'bow', rudderScale: 0.9,
    physics: {
      thrust: 4.4, dragQ: 0.045, dragL: 0.05, yawRate: 0.6, pitchMax: 0.34,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 8, fuel: 480, ventRate: 2.8,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.12, speedPressure: 0,
      foldResist: 0.45, partitions: false,
    },
  },

  // No. 5 (1901) — first true keel: 18 m pine truss, piano wire, water ballast
  // (Figs. 8-9). Won the Santos-Dumont prize; lost to a weakened valve over the
  // Trocadero. Its valves leak early — watch the pressure.
  no5: {
    id: 'no5', name: 'Santos-Dumont No. 5', sub: 'the pine truss — mind the weak valve',
    envelope: { shape: 'ellipsoid', length: 33, diameter: 5.4, color: 0xd2c5a5 },
    keel: { type: 'truss', length: 18, drop: 8.5 },
    prop: 'stern', rudderScale: 0.95,
    physics: {
      thrust: 5.0, dragQ: 0.042, dragL: 0.05, yawRate: 0.55, pitchMax: 0.32,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 9, fuel: 530, ventRate: 3.2,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.06, speedPressure: 0,
      foldResist: 0.4, partitions: false,
    },
  },

  // No. 6 (1901) — the Deutsch Prize winner (Fig. 10). Ellipsoid 33 x 6 m,
  // 630 m^3, 12 hp water-cooled, interior compensator. Balanced and honest.
  no6: {
    id: 'no6', name: 'Santos-Dumont No. 6', sub: 'the Deutsch Prize winner',
    envelope: { shape: 'ellipsoid', length: 33, diameter: 6, color: 0xd9c893 },
    keel: { type: 'truss', length: 18, drop: 8.5 },
    prop: 'stern', rudderScale: 1.0,
    physics: {
      thrust: 5.2, dragQ: 0.040, dragL: 0.05, yawRate: 0.55, pitchMax: 0.32,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 10, fuel: 580, ventRate: 3.0,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.13, speedPressure: 0,
      foldResist: 0.45, partitions: false,
    },
  },

  // No. 7 — the racer (Fig. 12): double silk, 1257 m^3, 60 hp, TWO 5 m
  // propellers bow + stern, valves at 12 cm water. 70-80 km/h design.
  no7: {
    id: 'no7', name: 'Santos-Dumont No. 7', sub: 'the racing air-ship',
    envelope: { shape: 'slender', length: 42, diameter: 5.4, color: 0x4a3b2e },
    keel: { type: 'truss', length: 22, drop: 8.0 },
    prop: 'both', rudderScale: 0.9,
    physics: {
      thrust: 11.0, dragQ: 0.032, dragL: 0.05, yawRate: 0.38, pitchMax: 0.26,
      gasLift: 3.4, weightBase: 1.70, bagLift: 0.15, bags: 8, fuel: 420, ventRate: 3.5,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.25, speedPressure: 0.10,
      foldResist: 0.7, partitions: false,
    },
  },

  // No. 9 (1903) — the runabout (Fig. 15): egg driven thick end first, 3 hp,
  // basket tucked close beneath. Slow, nimble, unfoldable; lands in streets.
  no9: {
    id: 'no9', name: 'Santos-Dumont No. 9', sub: 'the little runabout',
    envelope: { shape: 'egg', length: 15, diameter: 6.2, color: 0xd3c9a8 },
    keel: { type: 'minimal', length: 5.5, drop: 4.2 },
    prop: 'stern', rudderScale: 0.8,
    physics: {
      thrust: 2.7, dragQ: 0.055, dragL: 0.06, yawRate: 0.85, pitchMax: 0.35,
      gasLift: 3.1, weightBase: 1.62, bagLift: 0.12, bags: 8, fuel: 660, ventRate: 2.2,
      ropeLen: 40, ropeLift: 0.45, pressureLimit: 1.18, speedPressure: 0,
      foldResist: 1.0, partitions: true,
    },
  },

  // No. 10 — "The Omnibus" (Figs. 13-14): 2010 m^3, double keel with three
  // passenger baskets and the aid's basket. Stately; turns like a steamer.
  no10: {
    id: 'no10', name: 'Santos-Dumont No. 10', sub: 'the Omnibus — twelve passengers',
    envelope: { shape: 'ellipsoid', length: 36, diameter: 9, color: 0xcdbf9d },
    keel: { type: 'double', length: 20, drop: 8.5 },
    prop: 'stern', rudderScale: 1.1,
    physics: {
      thrust: 5.2, dragQ: 0.06, dragL: 0.06, yawRate: 0.3, pitchMax: 0.24,
      gasLift: 3.5, weightBase: 1.6, bagLift: 0.12, bags: 14, fuel: 580, ventRate: 3.2,
      ropeLen: 70, ropeLift: 0.55, pressureLimit: 1.18, speedPressure: 0,
      foldResist: 0.8, partitions: true,
    },
  },

  // "La Ville de Paris" — Henry Deutsch's own dirigible, built on the lines of
  // the No. 6. The rival ship (AI only; not player-selectable).
  villedeparis: {
    id: 'villedeparis', name: 'La Ville de Paris', sub: 'M. Deutsch’s rival dirigible',
    ai: true,
    envelope: { shape: 'ellipsoid', length: 32, diameter: 6.4, color: 0xb8ab5f },
    keel: { type: 'truss', length: 18, drop: 8.5 },
    prop: 'stern', rudderScale: 1.0,
    physics: {
      thrust: 5.0, dragQ: 0.040, dragL: 0.05, yawRate: 0.5, pitchMax: 0.3,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 10, fuel: 900, ventRate: 3.0,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 2.0, speedPressure: 0,
      foldResist: 1.0, partitions: true,   // AI-friendly: no death spirals
    },
  },
};

// keyboard mapping for ship selection at the aerodrome
export const SHIP_KEYS = {
  KeyB: 'brazil', Digit1: 'no1', Digit2: 'no2', Digit3: 'no3', Digit4: 'no4',
  Digit5: 'no5', Digit6: 'no6', Digit7: 'no7', Digit9: 'no9', Digit0: 'no10',
};
