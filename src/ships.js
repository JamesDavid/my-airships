// Ship specifications derived from the book's text and figures.
// See docs/BOOK_REFERENCE.md, Part C, for sources. Units: metres; physics values
// are accelerations (m/s^2) on a unit-mass ship, tuned to the book's speeds (B10).
//
// envelope.shape: sphere | cylinder | stubby | ellipsoid | slender | egg
// keel.type: basket-long | pole | saddle | truss | minimal | double
// prop: none | bow | stern | both

// BALLAST: SAND OR WATER, and it changes ship by ship.
//
// The spherical balloons and the first four air-ships threw sand — Ch. III is
// full of it: "we are masters of our altitude by the possession of a few pounds
// of sand", "we threw out a few handfuls of sand to leap up and pass over it".
//
// The change came with the keel built for the No. 5. Ch. XI: "For the first
// time in these experiments, as well as the first time in aeronautics, I used
// liquid ballast. Two brass reservoirs, very thin, and holding altogether 54
// litres (12 gallons), were filled with water and fixed in the keel... their two
// spigots were so arranged that they could be opened and shut from my basket by
// means of two steel wires."
//
// So it is a spigot from the No. 5 on, not a sack over the side — and Ch. XVII
// confirms it still is at Monaco in the No. 6: "I let out the overplus of water
// ballast". The No. 9's material is not stated anywhere; it inherits the keel's
// cylinders, which is an inference and the only one here.
export const SHIPS = {

  // "Brazil" — the beloved little spherical balloon (valise-packable).
  // No motor, no rudder: ballast, valve, and guide rope only. The tutorial.
  brazil: {
    id: 'brazil', name: 'The "Brazil"', sub: 'smallest of spherical balloons — drift with the wind',
    ballast: 'sand',
    envelope: { shape: 'sphere', length: 8, diameter: 8, color: 0xdfd3b4 },
    keel: { type: 'basket-long', length: 3.5, drop: 7.5 },
    prop: 'none', rudderScale: 0,
    physics: {
      // SHE CANNOT BE STEERED, and that is the whole point of her: a sphere in
      // a wind has no preferred heading and nothing to give it one — no rudder,
      // no tail, and no airspeed of her own to work either against. So she does
      // not weathercock, not even riding to her guide rope, and A / D do not
      // turn her at all. What they turn is the PILOT, in the basket: see
      // noHelm() in main.js. Drifting where the wind takes you while you look
      // wherever you like is the lesson she is in the shed to teach.
      weathercocks: false,
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
    ballast: 'sand',
    // an interior air balloon, fed by a fan off the motor, to hold her form:
    // "the little interior air balloon… sewed inside to the bottom of the great
    // balloon like a kind of closed pocket" (Ch. X). Only the first two had one.
    envelope: { shape: 'cylinder', length: 25, diameter: 3.5, color: 0xcfc2a2, ballonnet: true },
    keel: { type: 'basket-long', length: 4, drop: 11 },
    prop: 'stern', rudderScale: 0.8,
    physics: {
      thrust: 3.2, dragQ: 0.05, dragL: 0.05, yawRate: 0.2, pitchMax: 0.3,
      gasLift: 3.15, weightBase: 1.5, bagLift: 0.15, bags: 8, fuel: 1580, ventRate: 2.5,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.08, speedPressure: 0,
      foldResist: 0.05, partitions: false,   // the pocket-knife fold
    },
  },

  // No. 2 (1899) — same length, fatter (200 m^3), + fan ventilator (Fig. 5).
  // Doubled up in a rain gust on its first trial.
  no2: {
    id: 'no2', name: 'Santos-Dumont No. 2', sub: 'the ventilated cylinder',
    ballast: 'sand',
    envelope: { shape: 'cylinder', length: 25, diameter: 4.1, color: 0xc8bb9d, ballonnet: true },
    keel: { type: 'basket-long', length: 4, drop: 10 },
    prop: 'stern', rudderScale: 0.8,
    physics: {
      thrust: 3.2, dragQ: 0.05, dragL: 0.05, yawRate: 0.2, pitchMax: 0.3,
      gasLift: 3.2, weightBase: 1.52, bagLift: 0.15, bags: 9, fuel: 1580, ventRate: 2.5,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.1, speedPressure: 0,
      foldResist: 0.25, partitions: false,
    },
  },

  // No. 3 (1899) — stubby and big-bellied, 20 x 7.5 m, 500 m^3 of cheap coal gas,
  // 10 m bamboo pole keel (Fig. 6). No fold risk, but clumsy; ~25 km/h.
  no3: {
    id: 'no3', name: 'Santos-Dumont No. 3', sub: 'the big-bellied one — slow but sure',
    ballast: 'sand',
    envelope: { shape: 'stubby', length: 20, diameter: 7.5, color: 0xb9ab8c },
    keel: { type: 'pole', length: 10, drop: 6.5 },
    prop: 'stern', rudderScale: 0.9,
    physics: {
      thrust: 3.4, dragQ: 0.07, dragL: 0.06, yawRate: 0.2, pitchMax: 0.3,
      gasLift: 3.2, weightBase: 1.6, bagLift: 0.14, bags: 10, fuel: 1810, ventRate: 2.8,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.2, speedPressure: 0,
      foldResist: 1, partitions: true,
    },
  },

  // No. 4 (1900) — the bicycle-saddle ship: open spider-web keel, no basket,
  // propeller at the BOW pulling, 7 hp (photo p.135, Fig. 7).
  no4: {
    id: 'no4', name: 'Santos-Dumont No. 4', sub: 'the bicycle saddle — bow propeller',
    ballast: 'sand',
    envelope: { shape: 'cylinder', length: 33, diameter: 5.1, color: 0xd5c9aa },
    keel: { type: 'saddle', length: 14, drop: 7.5 },
    prop: 'bow', rudderScale: 0.9,
    physics: {
      thrust: 4.4, dragQ: 0.045, dragL: 0.05, yawRate: 0.22, pitchMax: 0.34,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 8, fuel: 1270, ventRate: 2.8,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.12, speedPressure: 0,
      foldResist: 0.45, partitions: false,
    },
  },

  // No. 5 (1901) — first true keel: 18 m pine truss, piano wire, water ballast
  // (Figs. 8-9). Won the Santos-Dumont prize; lost to a weakened valve over the
  // Trocadero. Its valves leak early — watch the pressure.
  no5: {
    id: 'no5', name: 'Santos-Dumont No. 5', sub: 'the pine truss — mind the weak valve',
    ballast: 'water',
    envelope: { shape: 'ellipsoid', length: 33, diameter: 5.4, color: 0xd2c5a5 },
    keel: { type: 'truss', length: 18, drop: 8.5 },
    prop: 'stern', rudderScale: 0.95,
    physics: {
      thrust: 5.0, dragQ: 0.042, dragL: 0.05, yawRate: 0.25, pitchMax: 0.32,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 9, fuel: 1150, ventRate: 3.2,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.06, speedPressure: 0,
      foldResist: 0.4, partitions: false,
    },
  },

  // No. 6 (1901) — the Deutsch Prize winner (Fig. 10). Ellipsoid 33 x 6 m,
  // 630 m^3, 12 hp water-cooled, interior compensator. Balanced and honest.
  no6: {
    id: 'no6', name: 'Santos-Dumont No. 6', sub: 'the Deutsch Prize winner',
    ballast: 'water',
    envelope: { shape: 'ellipsoid', length: 33, diameter: 6, color: 0xd9c893 },
    keel: { type: 'truss', length: 18, drop: 8.5 },
    prop: 'stern', rudderScale: 1.0,
    physics: {
      thrust: 5.2, dragQ: 0.040, dragL: 0.05, yawRate: 0.25, pitchMax: 0.32,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 10, fuel: 1100, ventRate: 3.0,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.13, speedPressure: 0,
      foldResist: 0.45, partitions: false,
    },
  },

  // No. 7 — the racer (Fig. 12): double silk, 1257 m^3, 60 hp, TWO 5 m
  // propellers bow + stern, valves at 12 cm water. 70-80 km/h design.
  no7: {
    id: 'no7', name: 'Santos-Dumont No. 7', sub: 'the racing air-ship',
    ballast: 'water',
    envelope: { shape: 'slender', length: 42, diameter: 5.4, color: 0x4a3b2e },
    keel: { type: 'truss', length: 22, drop: 8.0 },
    prop: 'both', rudderScale: 0.9,
    physics: {
      thrust: 11.0, dragQ: 0.032, dragL: 0.05, yawRate: 0.2, pitchMax: 0.26,
      gasLift: 3.4, weightBase: 1.70, bagLift: 0.15, bags: 8, fuel: 670, ventRate: 3.5,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 1.25, speedPressure: 0.10,
      foldResist: 0.7, partitions: false,
    },
  },

  // No. 9 (1903) — the runabout (Fig. 15): egg driven thick end first, 3 hp,
  // basket tucked close beneath. Slow, nimble, unfoldable; lands in streets.
  no9: {
    id: 'no9', name: 'Santos-Dumont No. 9', sub: 'the little runabout',
    ballast: 'water',
    envelope: { shape: 'egg', length: 15, diameter: 6.2, color: 0xd3c9a8 },
    keel: { type: 'minimal', length: 5.5, drop: 4.2 },
    prop: 'stern', rudderScale: 0.8,
    physics: {
      thrust: 2.7, dragQ: 0.055, dragL: 0.06, yawRate: 0.27, pitchMax: 0.35,
      gasLift: 3.1, weightBase: 1.62, bagLift: 0.12, bags: 8, fuel: 1820, ventRate: 2.2,
      ropeLen: 40, ropeLift: 0.45, pressureLimit: 1.18, speedPressure: 0,
      foldResist: 1.0, partitions: true,
    },
  },

  // No. 10 — "The Omnibus" (Figs. 13-14): 2010 m^3, double keel with three
  // passenger baskets and the aid's basket. Stately; turns like a steamer.
  no10: {
    id: 'no10', name: 'Santos-Dumont No. 10', sub: 'the Omnibus — twelve passengers',
    ballast: 'water',
    envelope: { shape: 'ellipsoid', length: 36, diameter: 9, color: 0xcdbf9d },
    keel: { type: 'double', length: 20, drop: 8.5 },
    prop: 'stern', rudderScale: 1.1,
    physics: {
      thrust: 5.2, dragQ: 0.06, dragL: 0.06, yawRate: 0.17, pitchMax: 0.24,
      gasLift: 3.5, weightBase: 1.6, bagLift: 0.12, bags: 14, fuel: 1350, ventRate: 3.2,
      ropeLen: 70, ropeLift: 0.55, pressureLimit: 1.18, speedPressure: 0,
      foldResist: 0.8, partitions: true,
    },
  },

  // "La Ville de Paris" — Henry Deutsch's own dirigible, built on the lines of
  // the No. 6. The rival ship (AI only; not player-selectable).
  villedeparis: {
    id: 'villedeparis', name: 'La Ville de Paris', sub: 'M. Deutsch’s rival dirigible',
    ballast: 'water',
    ai: true,
    envelope: { shape: 'ellipsoid', length: 32, diameter: 6.4, color: 0xb8ab5f },
    keel: { type: 'truss', length: 18, drop: 8.5 },
    prop: 'stern', rudderScale: 1.0,
    physics: {
      thrust: 5.0, dragQ: 0.040, dragL: 0.05, yawRate: 0.22, pitchMax: 0.3,
      gasLift: 3.25, weightBase: 1.55, bagLift: 0.15, bags: 10, fuel: 900, ventRate: 3.0,
      ropeLen: 60, ropeLift: 0.5, pressureLimit: 2.0, speedPressure: 0,
      foldResist: 1.0, partitions: true,   // AI-friendly: no death spirals
    },
  },
};

// ---------------------------------------------------------------- the tanks
// THE SHIPS COULD NOT REACH THE END OF THEIR OWN COURSES.
//
// Measured: the No. 6 ran full throttle for 1,101 s and 10.7 km, and then the
// petroleum was gone. The Deutsch course is 10.8 km. The gymkhana is 11.2 km.
// Both of the Paris time trials and the race the No. 6 actually WON were longer
// than the ship could fly, and nobody had noticed because nobody had ever got
// far enough round to run dry — the gymkhana's gates were under the pavement
// and stopped them first. (My own 10% drag trim made it worse: same burn, less
// speed, so 11.9 km of range became 10.7.)
//
// The book is unambiguous that fuel was never the constraint. Ch. XVI, of the
// prize flight itself: "The actual winning of the Deutsch prize had cost only a
// few litres of petroleum!" And Ch. XII has the No. 5 make TEN circuits of
// Longchamps — "a distance of about 35 kilometres" — then set out for Puteaux,
// "an excursion of about 3 kilometres, done in nine minutes", and steer back to
// Longchamps again. Forty kilometres and more, on one filling.
//
// So the tanks are four times what they were, which puts the No. 5 at 43 km —
// his 13 July outing — and makes the Deutsch cost about a quarter of a tank,
// which is what "only a few litres" sounds like against a full supply.
//
// This costs nothing in lift: fuelWeight in airship.js is a FRACTION of
// capacity, so a full tank weighs the same whatever the tank holds.
export const FUEL_TRIM = 4;

// ---------------------------------------------------------------- drag trim
// THE FLEET RAN FAST, and the book says by how much.
//
// Ch. XIII is the only clean airspeed reading he ever got — Maurice Farman
// pacing the No. 5 round Longchamps in a motor-car: "between 26 and 30
// kilometres per hour with my guide rope dragging... about 5 kilometres per
// hour [for the rope's braking], which would have brought my proper speed up to
// between 30 and 35 kilometres per hour."
//
// Measured headless, the No. 5 made 37.2 km/h clear and 33.4 dragging — six to
// eleven per cent over. This trims that off.
//
// DRAG, NOT THRUST, because of which number is known. The motors are documented
// down to the horsepower and the No. 6's 66 kg of measured pull; the drag
// coefficients above were never measured, only tuned until a ship felt right.
// So the correction belongs on the guess, not on the record.
//
// Applied here rather than folded into the table so that the tuned numbers stay
// legible and this stays one line to revert. Solved by bisection for a 10% trim
// on the No. 5; the same factor is used fleet-wide so their relative
// performance is untouched. Afterwards: No. 5 33.5 (book 30-35), No. 9 20.9
// (book 20-25), No. 6 35.0, No. 7 57.7 against a design 70-80 she never
// actually reached. tools/check_scenarios.mjs asserts these against the book.
export const DRAG_TRIM = 1.2205;
for (const s of Object.values(SHIPS)) {
  s.physics.dragQ *= DRAG_TRIM;
  s.physics.dragL *= DRAG_TRIM;
  s.physics.fuel *= FUEL_TRIM;
}

// keyboard mapping for ship selection at the aerodrome
export const SHIP_KEYS = {
  KeyB: 'brazil', Digit1: 'no1', Digit2: 'no2', Digit3: 'no3', Digit4: 'no4',
  Digit5: 'no5', Digit6: 'no6', Digit7: 'no7', Digit9: 'no9', Digit0: 'no10',
};
