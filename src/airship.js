// The airship: mesh generated from a ship spec (src/ships.js) and physics
// implementing the handling catalogue (docs/BOOK_REFERENCE.md Part B):
//  B1 wind-as-river (less wind at low altitude)   B2 gas/ballast economy
//  B3 shifting-weight diagonal flight             B4 guide rope auto-ballast
//  B5 tangage speed band                          B6 pressure, sag, wire-fouling
//  B7 capricious motor                            B8 gas-rush rearing
//  B9 landing discipline

import * as THREE from 'three';
import { windAt } from './world.js';

export { windAt }; // re-export for existing importers

const UP = new THREE.Vector3(0, 1, 0);

// How hard she weathercocks: turns per hull length of airflow, the same unit
// the rudder is quoted in. 0.35 brings her head to wind in about half a minute
// on the rope, and holds a heading without fighting the helm under way.
const VANE = 0.35;

// ...and how hard she rides to a dragging guide rope, which is made fast about
// a third of the keel ahead of her middle and so pulls her head round.
const ROPE_VANE = 0.6;

/**
 * THE PLANCHER NOTCHES, by the pilot each one suits.
 *
 * A floor is not a slider — you set it once, for your own height, and forget
 * it. So the buttons walk a ladder with a name against every rung.
 *
 * The rim stands 1.05 m over the bare floor, and a six-footer's eye is 1.70 m
 * up (eye height is about 93% of stature), so he looks over it by 0.65 m. Each
 * notch is the lift that gives a shorter pilot the SAME 0.65 m — which works
 * exactly down to four foot six.
 *
 * Below that the basket itself runs out: a three-footer would need 0.85 m, and
 * a duckboard 0.85 m up in a basket 1.1 m deep leaves 0.20 m of rim, which is
 * an ankle rail and not a rail at all. So the last two rungs are as high as the
 * basket allows — 0.49 m of rim left, which is above the waist of a three-foot
 * pilot — and they still put his eye 0.38 m clear of it. Said plainly here
 * rather than pretended away: the shortest pilots get a good view, not the
 * same view.
 *
 * The last two rungs were cut back 3 cm from what the arithmetic wanted,
 * because the baskets are not all the same depth and the No. 3's is the
 * shallowest: at 0.50 m her rim came 9 mm under the hip of the four-foot pilot
 * that notch is cut for. The ladder has to be safe in the tightest basket, not
 * the nominal one.
 *
 * 5 ft is in the ladder though it was not asked for: with 5 ft 6 and 4 ft 6
 * both there it is the obvious gap, and a ladder with a hole in it is one the
 * pilot has to think about.
 */
export const DECK_NOTCHES = [
  { label: '6 ft',   stature: 1.83, lift: 0.00 },
  { label: '5 ft 6', stature: 1.68, lift: 0.14 },
  { label: '5 ft',   stature: 1.52, lift: 0.28 },
  { label: '4 ft 6', stature: 1.37, lift: 0.42 },
  { label: '4 ft',   stature: 1.22, lift: 0.47 },
  { label: '3 ft',   stature: 0.91, lift: 0.56 },
];
export const DECK_LIFT_MAX = DECK_NOTCHES[DECK_NOTCHES.length - 1].lift;

// ------------------------------------------------------- the pitch pendulum
/**
 * How fast a ship swings in pitch, in radians per second, from her own size.
 *
 * She floats, so she displaces her own mass — and that mass cancels out of the
 * period entirely, which is why this needs no weights, only geometry:
 *
 *     restoring moment   M g h sin(theta),  h = metacentric height
 *     pitch inertia      I = (1-F) M L^2/20  +  F M drop^2  +  K' M L^2/20
 *     omega^2 = M g h / I = g F drop / [ (1 - F + K') L^2/20 + F drop^2 ]
 *
 * L^2/20 is the transverse radius of gyration of a slender ellipsoid squared.
 * F is the share of the whole system hanging low — motor, keel, basket, pilot,
 * fuel — which is also what sets h, since the gas is up in the envelope and
 * weighs almost nothing. K' is the added-moment coefficient: a hull pitching in
 * air has to swing a good deal of air with it.
 *
 * F and K' are estimates, so they were swept: over F = 0.30..0.60 and
 * K' = 0.5..1.1 the No. 6's period runs 8.5 s to 13.7 s. The old model's 1.43 s
 * is not within reach of any of it, which is the whole point.
 */
const PEND_F = 0.45;                  // share of her hanging below the gas
const PEND_K = 0.8;                   // added moment of the air she swings
const TRIM_HAUL = 5;                  // seconds to haul a weight the whole way
export function pitchOmega(spec) {
  const L = spec.envelope.length || 30;
  const drop = (spec.keel && spec.keel.drop) || 6;
  const w2 = (9.81 * PEND_F * drop)
    / ((1 - PEND_F + PEND_K) * L * L / 20 + PEND_F * drop * drop);
  return Math.sqrt(Math.max(1e-4, w2));
}
export const pitchPeriod = (spec) => 2 * Math.PI / pitchOmega(spec);

// ---------------------------------------------------------------- dial faces
// Engraved instrument faces, drawn once and shared by every ship. Both dials
// are built the same way: the pilot's eye sees texture-up as up and
// texture-right as their own right, and a positive rotation.x turns the dial
// clockwise from where they stand.
function dialCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f2ead6'; x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#8a7350'; x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 120, 0, Math.PI * 2); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  return { c, x };
}
function dialTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the compass rose: N at the needle, bearings running clockwise (N E S W)
function makeCompassFace() {
  const { c, x } = dialCanvas();
  x.strokeStyle = '#22180f';
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg - 90) * Math.PI / 180;          // canvas 0° is to the right
    const major = deg % 90 === 0, mid = deg % 30 === 0;
    const r0 = major ? 88 : mid ? 96 : 104;
    x.lineWidth = major ? 5 : mid ? 3 : 1.5;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    x.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116);
    x.stroke();
  }
  // canvas y grows downward, so drawing N at the top puts it at texture-up;
  // going clockwise on screen is E, S, W — exactly how a card is engraved.
  // The cardinals sit well inside the band the north pointer sweeps, so the
  // needle never hides the letter it is pointing at.
  x.font = 'bold 42px Georgia, serif';
  for (const [ch, deg] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const a = (deg - 90) * Math.PI / 180;
    x.fillStyle = ch === 'N' ? '#8c2f1e' : '#22180f';
    x.fillText(ch, 128 + Math.cos(a) * 50, 128 + Math.sin(a) * 50);
  }
  x.font = 'italic 18px Georgia, serif';
  x.fillStyle = '#6b5a3f';
  // English throughout, to match the cardinals and the HUD's own wind names:
  // the card had French ordinals (SO, NO) against an English W, which is neither
  for (const [ch, deg] of [['NE', 45], ['SE', 135], ['SW', 225], ['NW', 315]]) {
    const a = (deg - 90) * Math.PI / 180;
    x.fillText(ch, 128 + Math.cos(a) * 78, 128 + Math.sin(a) * 78);
  }
  return dialTexture(c);
}

// the aneroid, read as an altimeter: 0 at the top, 400 m clockwise round
function makeBaroFace() {
  const { c, x } = dialCanvas();
  const SPAN = 4.6;                                 // radians of needle travel
  x.strokeStyle = '#22180f';
  for (let m = 0; m <= 400; m += 25) {
    const a = (m / 400) * SPAN - Math.PI / 2;
    const major = m % 100 === 0;
    x.lineWidth = major ? 5 : 2;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * (major ? 90 : 100), 128 + Math.sin(a) * (major ? 90 : 100));
    x.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116);
    x.stroke();
  }
  x.fillStyle = '#22180f';
  x.font = 'bold 30px Georgia, serif';
  for (let m = 0; m <= 400; m += 100) {
    const a = (m / 400) * SPAN - Math.PI / 2;
    x.fillText(String(m), 128 + Math.cos(a) * 62, 128 + Math.sin(a) * 62);
  }
  // the legend goes in the gap the scale leaves at the bottom right
  x.font = 'italic 16px Georgia, serif';
  x.fillStyle = '#6b5a3f';
  x.fillText('MÈTRES', 128, 208);
  return dialTexture(c);
}

// A small engraved plate for a single fitting. Every control in the basket
// carries one — in a headset there is no tooltip and no key legend, so a cord
// hanging in the air is a mystery until it is labelled. French, and period:
// LEST is ballast, SOUPAPE the valve, ALLUM. the ignition, POIDS the shifting
// weights, CARNET the ship's book.
const PLACARDS = {};
function makePlacard(text) {
  if (PLACARDS[text]) return PLACARDS[text];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, 256, 64);
  x.strokeStyle = '#8a7350'; x.lineWidth = 4; x.strokeRect(3, 3, 250, 58);
  x.fillStyle = '#22180f';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  // FIT THE WORD TO THE PLATE. A single letter and SOUPAPE cannot share one
  // font size on a 256-pixel canvas: at 30px the long word runs off both ends.
  let px = 30;
  do { x.font = `bold ${px}px Georgia, serif`; px -= 2; }
  while (px > 12 && x.measureText(text).width > 226);
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  PLACARDS[text] = t;
  return t;
}

/**
 * Hang a placard beside a fitting. `ry` is which way it faces: the default
 * -PI/2 turns it aft toward the pilot, which is right for a plate beside a cord
 * he is looking straight at — and wrong for one screwed to a side wall, where
 * it stood out from the boards edge-on like a shelf: "rotate these placards to
 * be on the port wall not extending out from them".
 */
function placard(parent, text, x, y, z, ry, w = 0.15) {
  const h = w * 0.25;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ map: makePlacard(text), emissive: 0x4a453c,
      side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = ry === undefined ? -Math.PI / 2 : ry;
  // how big it is, on the plate itself, so a check can ask whether two of them
  // are on top of each other — "port placards overlap on the sides" (#72)
  m.userData.placard = { w, h, text };
  parent.add(m);
  return m;
}

/**
 * A MAN IN THE BASKET.
 *
 * Only ever for a ship somebody ELSE is flying — your own basket has you in
 * it, and in a headset a figure at your own deck point is a figure you are
 * standing inside of. A remote pilot's ship used to fly past with nobody
 * aboard, which reads as a runaway rather than as a person you are racing.
 *
 * Built facing forward (+X, the way the ship goes) with his origin at his
 * boots, so it drops straight onto deckPoint. He is deliberately plain: this
 * is seen from tens of metres across the sky, and a rough silhouette in the
 * right clothes carries further than detail nobody can resolve. The hat is a
 * panama, which is what Santos-Dumont wore aloft and what he beat the No. 9's
 * petrol fire out with (Ch. XXII).
 *
 * No arms reaching for the controls: a remote ship's tiller is interpolated
 * from an 8 Hz packet and hands that miss it by a hand's breadth look worse
 * than hands at rest.
 */
function makeAeronaut() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x3a3832 });   // dark jacket
  const trous = new THREE.MeshLambertMaterial({ color: 0x4b4740 });
  const linen = new THREE.MeshLambertMaterial({ color: 0xe6dfcd });   // collar
  const skin  = new THREE.MeshLambertMaterial({ color: 0xc79a74 });
  const straw = new THREE.MeshLambertMaterial({ color: 0xe0cd9e });   // the panama
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };

  // He stands 1.72 m in his boots. The basket floor is a metre below its rim,
  // so that puts his head and shoulders over the weave and his legs inside it,
  // which is how every photograph of him aloft looks.
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.86, 6), trous),
      0, 0.43, s * 0.10);
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.17, 0.62, 8), cloth), 0, 1.16, 0);
  // arms down at his sides, close in to the coat
  for (const s of [-1, 1]) {
    const arm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.58, 6), cloth),
      0, 1.13, s * 0.21);
    arm.rotation.x = s * 0.10;
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.05, 8), linen), 0, 1.49, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 6), skin), 0, 1.55, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.098, 8, 7), skin), 0, 1.66, 0);
  // the panama: a low crown and a brim
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.09, 10), straw), 0, 1.74, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.012, 12), straw), 0, 1.70, 0);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// the engraved placard under the two levers, read from the pilot's seat
function makeLeverPlate() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 52;
  const x = c.getContext('2d');
  x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, 256, 52);
  x.strokeStyle = '#8a7350'; x.lineWidth = 3; x.strokeRect(2, 2, 252, 48);
  x.fillStyle = '#22180f';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 22px Georgia, serif';
  x.fillText('CARB.', 66, 27);
  x.fillText('ALLUM.', 190, 27);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let COMPASS_FACE = null, BARO_FACE = null, LEVER_PLATE = null;

// hull profiles: modify a unit sphere's radial profile along x
function makeEnvelopeGeometry(shape) {
  const geo = new THREE.SphereGeometry(1, 30, 20);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const ax = Math.abs(x);
    const rNow = Math.sqrt(Math.max(0.0001, 1 - x * x));
    let f = 1;
    if (shape === 'egg') {
      // Fig. 15 — driven thick end first
      f = x > 0 ? 1 + 0.16 * x : 1 - 0.28 * ax;
    } else if (shape === 'cylinder') {
      // Nos. 1, 2, 4: constant-radius barrel ending in cones
      const want = ax < 0.55 ? 1 : Math.max(0, (1 - ax) / 0.45);
      f = want / Math.max(rNow, 0.05);
    } else if (shape === 'slender') {
      // No. 7: long cigar
      const want = ax < 0.4 ? 1 : Math.pow(Math.max(0, (1 - ax) / 0.6), 0.7);
      f = want / Math.max(rNow, 0.05);
    }
    // 'sphere', 'stubby', 'ellipsoid': pure scaled sphere
    p.setY(i, p.getY(i) * f);
    p.setZ(i, p.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Airship {
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    this.pitchW = pitchOmega(spec);       // her own pendulum, from her own size
    this._airspeed = 0;
    this.buildMesh();
    scene.add(this.group);

    // blob shadow
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(spec.envelope.length * 0.45, 18),
      new THREE.MeshBasicMaterial({ color: 0x1e1812, transparent: true, opacity: 0.2, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.events = [];
    this.reset(new THREE.Vector3(0, 2, 0), 0);
  }

  // ------------------------------------------------------------ envelope shape
  // Per-vertex deformation of the gas bag, in the unit-sphere space that
  // mesh.scale stretches into the hull. Simulates (B6, B8):
  //  - slack silk as hydrogen is lost: the belly caves upward, the crown
  //    holds its shape longest (gas rises), wrinkles ripple in the cloth
  //  - gas POOLING along the axis when pitched without partitions
  //  - the pocket-knife FOLD: a waist crease and both arms drooping
  //  - at zero hydrogen the bag hangs dead — "a great bird that dies"
  deformEnvelope(force) {
    const f = clamp(this.fullness ?? 1, 0.03, 1);
    const F = this.fold || 0;
    const pool = this.gasPool || 0;
    const slack = f < 0.9 || F > 0.02;
    const key = `${(f * 90) | 0},${(F * 50) | 0},${(pool * 40) | 0},${slack ? (this._t * 8) | 0 : 0}`;
    if (!force && key === this._defKey) return;
    this._defKey = key;
    const base = this.envBase, pos = this.envGeo.attributes.position.array;
    const AB = this.envBaseScale.x / this.envBaseScale.y; // axial-to-radial ratio
    const t = this._t;
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i], y = base[i + 1], z = base[i + 2];
      const ax = Math.max(-1, Math.min(1, x));
      // local fullness: pitched gas rushes toward the high end
      const fl = Math.max(0.04, Math.min(1, f + pool * ax));
      const empty = 1 - fl;
      const bottom = Math.max(0, -y);          // 0 at the crown, 1 at the belly
      // radial slack — the underside collapses far more than the crown
      let radial = 1 - empty * (0.16 + 0.46 * bottom);
      // wrinkles ripple through slack silk
      radial *= 1 + empty * 0.05 * Math.sin(i * 2.4 + t * 2.6) * (0.35 + 0.65 * bottom);
      // the waist pinches as she folds
      radial *= 1 - F * 0.4 * Math.exp(-(ax * ax) / 0.05);
      let ny = y * radial;
      const nz = z * radial;
      // the empty belly caves upward
      ny += empty * 0.3 * bottom * (1 - ax * ax * 0.4);
      // pocket-knife: both arms droop from the central hinge
      ny -= F * 0.55 * Math.max(0, Math.abs(ax) - 0.14) * AB;
      pos[i] = x; pos[i + 1] = ny; pos[i + 2] = nz;
    }
    this.envGeo.attributes.position.needsUpdate = true;
    this.envGeo.computeVertexNormals();
  }

  // ------------------------------------------------------------ state
  reset(pos, yaw) {
    const P = this.spec.physics;
    this.pos = this.group.position;
    this.pos.copy(pos);
    this.vel = new THREE.Vector3();
    this.yaw = yaw; this.yawVel = 0;
    this.pitch = 0; this.pitchTarget = 0; this.pitchVel = 0;
    this.throttle = 0;
    this.gas = 100;
    this.bags = P.bags;
    this.fuel = P.fuel;
    this.restockT = 0;
    this.heat = 1.0;
    this.motorHealth = 1.0;
    this.sputtering = false;
    // A motor that will not come back. `sputtering` can be coaxed alight again
    // with the spark lever, which is the whole drama of the Deutsch run; this
    // is the other thing that happened to him — "the air-ship, bereft of its
    // power, was carried off" — and no amount of working the levers helps.
    this.motorDead = false;
    this.wrecked = false;
    this.landed = true;
    this.foulTime = 0;
    this.fold = 0;
    this.gasPool = 0;
    this.fullness = 1;
    // the interior air balloon of the Nos. 1 and 2, and the fan that feeds it
    this.airFill = this.spec.envelope.ballonnet ? 1 : 0;
    this.pumpOk = true;
    this.pumpNag = 0;
    this._defKey = null;
    this._foldWarned = false;
    this.deformEnvelope(true);
    this.propAngle = 0;
    this.rudderInput = 0;
    this._t = 0;
    this.initRope();
    this.updateTransforms(0);
  }

  // ------------------------------------------------------------ mesh
  buildMesh() {
    // EVERY FITTING A HAND CAN TAKE HOLD OF IN A HEADSET — the tiller, the two
    // engine levers, the weights, the ballast and valve cords, the bell-ring.
    //
    // Declared FIRST, before a line of geometry exists. This array has been
    // pushed to before it was created three separate times now, each time
    // because a new fitting went in above wherever the declaration happened to
    // sit — and each time it was not a subtle failure but every ship in the
    // game failing to construct. There is nowhere above here left to go.
    this.pullCords = [];

    const { envelope: E, keel: K, prop, rudderScale } = this.spec;
    this.group = new THREE.Group();
    this.pitchGroup = new THREE.Group();
    this.group.add(this.pitchGroup);

    // envelope: forward is +X; profile per hull form (see ships.js / Part C)
    const geo = makeEnvelopeGeometry(E.shape);
    const envMat = new THREE.MeshLambertMaterial({ color: E.color });
    this.envMesh = new THREE.Mesh(geo, envMat);
    this.envBaseScale = new THREE.Vector3(E.length / 2, E.diameter / 2, E.diameter / 2);
    this.envMesh.scale.copy(this.envBaseScale);
    this.pitchGroup.add(this.envMesh);
    // keep the pristine hull for the deformation pass (fold / slack / wrinkles)
    this.envGeo = geo;
    this.envBase = Float32Array.from(geo.attributes.position.array);

    // keel + basket + motor
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b5236 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2e241a });
    const drop = K.drop;
    this.keelY = -drop;
    // every keel member, published, so a check can ask whether one of them is
    // standing in the pilot — which is how the No. 9's ridge got through review
    this.keelRails = [];
    const addRail = (y, dz, len, r) => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), wood);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, y, dz);
      this.pitchGroup.add(rail);
      this.keelRails.push({ y, z: dz, len, r });
      return rail;
    };
    if (K.type === 'truss' || K.type === 'saddle' || K.type === 'double') {
      // triangular truss (Nos. 4-7, 10) — thin open girder of pine and piano wire
      const r = K.type === 'saddle' ? 0.06 : 0.09;
      // THE APEX HAS TO CLEAR A STANDING MAN, and on the No. 4 it did not.
      //
      // 1.1 m over the lower rails is a ridge two metres above the floor of a
      // basket, which is well over your head. But the No. 4 has no basket: she
      // is a bicycle saddle in an open web, and her deck point is set a crotch
      // BELOW the saddle, so the same 1.1 m is only 1.35 m above where the
      // pilot's boots are — through the chest of anyone standing up in their
      // own room. It is the No. 9's fault over again, found by the check
      // written for it. A seated rider on a bicycle frame would have ducked
      // under it; a pilot in a headset is standing.
      const APEX = K.type === 'saddle' ? 1.75 : 1.1;
      addRail(-drop, -0.7, K.length, r);
      addRail(-drop, 0.7, K.length, r);
      addRail(-drop + APEX, 0, K.length, r);
      // the apex: the single top member, and where the balloon's whole lift
      // comes into the keel. The suspension is landed on it below.
      this.keelApexY = -drop + APEX;
    } else if (K.type === 'minimal') {
      // the No. 9's little frame — "the keel barely longer than the basket" —
      // a light pair of rails with cross-pieces, carrying basket and motor.
      // Without them her gear hung in mid-air under the egg.
      //
      // THE THIRD MEMBER GOES UNDERNEATH, NOT OVERHEAD.
      //
      // It used to run down the centreline at -drop + 0.55. On a truss keel
      // that is a ridge well over the pilot's head; on a runabout with a 4.2 m
      // drop it is 1.55 m above the deck, which is the height of a standing
      // man's throat — "the runabout no9 the top bar of the keel goes through
      // my body in vr". There is no room for a ridge over the basket of a ship
      // this small, and she never had one: the No. 9 is the lightest thing he
      // built.
      //
      // So it goes under the floor as a keelson, where it does the same work —
      // tying the two longerons together down their length — and the balloon's
      // lift comes into the SIDE rails instead: "should we have that bar on the
      // bottom and then connect the gas bags to the side bars?" Which is what a
      // two-longeron keel wants anyway, since a V taken to the rail on its own
      // side never crosses the middle of the ship where the pilot is standing.
      addRail(-drop, -0.5, K.length, 0.05);
      addRail(-drop, 0.5, K.length, 0.05);
      addRail(-drop - 1.15, 0, K.length * 0.8, 0.04);   // the keelson, under the basket
      this.keelApexY = -drop;            // the longerons themselves
      this.keelLandZ = 0.5;              // ...each wire on to its own side
      for (const t of [-0.42, 0, 0.42]) {
        const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 4), wood);
        cross.rotation.x = Math.PI / 2;
        cross.position.set(t * K.length, -drop, 0);
        this.pitchGroup.add(cross);
      }
    } else if (K.type === 'pole') {
      // No. 3's bamboo pole, slung close beneath the balloon
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, K.length, 6),
        new THREE.MeshLambertMaterial({ color: 0xb8a468 }));
      pole.rotation.z = Math.PI / 2;
      pole.position.set(0, -this.spec.envelope.diameter / 2 - 1.2, 0);
      this.pitchGroup.add(pole);
    }
    if (K.type === 'double') {
      // the Omnibus (Figs. 13-14): a second keel of passenger baskets below
      addRail(-drop - 2.4, -0.7, K.length * 0.8, 0.09);
      addRail(-drop - 2.4, 0.7, K.length * 0.8, 0.09);
      const wickerP = new THREE.MeshLambertMaterial({ color: 0x8a734d });
      for (let i = 0; i < 3; i++) {
        const pb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.3), wickerP);
        pb.position.set(-K.length * 0.28 + i * K.length * 0.28, -drop - 3.1, 0);
        this.pitchGroup.add(pb);
      }
      const aid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.9), wickerP);
      aid.position.set(K.length * 0.42, -drop - 3.0, 0);
      this.pitchGroup.add(aid);
    }
    const wicker = new THREE.MeshLambertMaterial({ color: 0x8a734d });
    const brass = new THREE.MeshPhongMaterial({ color: 0xa8853b, shininess: 90, specular: 0xffe9a0 });
    const bx = K.type === 'minimal' || K.type === 'basket-long' ? 0 : -1.2;
    // THE FIRST THREE SHIPS HAVE NO KEEL AT ALL, and so nothing for the
    // suspension to land on: brazil, the No. 1 and the No. 2 hang their basket
    // straight off the balloon, and the No. 3 off a bamboo pole. With no apex
    // set, every wire ran to the ship's own centreline at rim height — which is
    // a metre above the deck and dead between the pilot's shoulders. Measured:
    // 0.30 m INSIDE him on the No. 1.
    //
    // Nothing found it for months because the harness threw hand-built geometry
    // away, and the wires are hand-built. They go to the rim's outer edge now,
    // one to each side, which is where a basket's cords are made fast anyway.
    if (this.keelApexY === undefined) {
      this.keelApexY = -drop;
      this.keelLandZ = 0.62 * (K.type === 'basket-long' ? 1.15 : 1);
    }
    if (K.type === 'saddle') {
      // No. 4: no basket at all — a bicycle saddle amid the spider web
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.35), dark);
      saddle.position.set(bx, -drop + 0.55, 0);
      this.pitchGroup.add(saddle);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5), dark);
      post.position.set(bx, -drop + 0.28, 0);
      this.pitchGroup.add(post);
      this.basketMesh = saddle;
      // The No. 4 has no basket at all — a bicycle saddle amid the spider web.
      // A pilot in a headset is standing in his own room whatever the ship is
      // doing, so the floor is set a CROTCH below the saddle: he finds it at
      // hip height, where a man sitting a bicycle finds it, and his head comes
      // a torso above it rather than a whole standing height.
      this.deckPoint = new THREE.Object3D();
      this.deckPoint.position.set(bx, -drop + 0.55 - 0.80, 0);
      this.pitchGroup.add(this.deckPoint);
    } else {
      // A BASKET YOU CAN STAND IN. This was one solid BoxGeometry, which is
      // fine from outside and absurd from within: in a headset the pilot stood
      // on the underside of a block with his legs buried in it. Wicker is a
      // floor and four walls, so it is built as a floor and four walls, and the
      // deck he stands on is the top face of that floor.
      const big = K.type === 'basket-long' ? 1.15 : 1;
      const W = 1.2 * big, H = 1.1 * big, D = 1.0 * big;
      const T = 0.055 * big;                      // the thickness of the weave
      const cy = -drop - 0.5;                     // the box's own centre
      const basket = new THREE.Group();
      basket.position.set(bx, cy, 0);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), wicker);
      floor.position.y = -H / 2 + T / 2;
      basket.add(floor);
      for (const [w, d, x, z] of [[T, D, (W - T) / 2, 0], [T, D, -(W - T) / 2, 0],
                                  [W, T, 0, (D - T) / 2], [W, T, 0, -(D - T) / 2]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H - T, d), wicker);
        wall.position.set(x, T / 2, z);
        basket.add(wall);
      }
      basket.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.pitchGroup.add(basket);
      this.basketMesh = basket;
      // A RIM, NOT A LID. This was one 1.34 x 1.14 m slab laid across the top,
      // which from outside reads as a rail and from inside is a ceiling six
      // inches over your head: "the top of the basket is still closed... but it
      // is hollow inside". Four bars round the edge, and the sky where the sky
      // should be.
      const rimMat = new THREE.MeshLambertMaterial({ color: 0x6f5a3a });
      const RW = 1.34 * big, RD = 1.14 * big, RT = 0.09;
      for (const [w2, d2, x2, z2] of [[RW, RT, 0, (RD - RT) / 2], [RW, RT, 0, -(RD - RT) / 2],
                                      [RT, RD, (RW - RT) / 2, 0], [RT, RD, -(RW - RT) / 2, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.1, d2), rimMat);
        bar.position.set(bx + x2, -drop + 0.05 * big, z2);
        bar.castShadow = true;
        this.pitchGroup.add(bar);
      }
      // where his boots actually are: the top of the floor he is standing on
      this.deckPoint = new THREE.Object3D();
      this.deckPoint.position.set(bx, cy - H / 2 + T, 0);
      this.pitchGroup.add(this.deckPoint);

      // THE DUCKBOARD ITSELF. A loose slatted board laid on the weave, raised
      // by the PLANCHER buttons. It is a separate thing ON the floor, not the
      // floor: the basket keeps its own boards, its walls and its height, and
      // nothing outside it moves. Slats, because that is what a duckboard is,
      // and because seeing the wicker between them tells you it is loose gear
      // rather than the ship.
      const board = new THREE.Group();
      const slatM = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
      const SL = 7, IW = W - 2 * T - 0.02, ID = D - 2 * T - 0.02;
      for (let i = 0; i < SL; i++) {
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(IW, 0.022, ID / SL * 0.7), slatM);
        b2.position.z = -ID / 2 + ((i + 0.5) / SL) * ID;
        board.add(b2);
      }
      for (const sx of [-1, 1]) {                 // two bearers under it
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, ID), slatM);
        r2.position.set(sx * (IW / 2 - 0.06), -0.026, 0);
        board.add(r2);
      }
      board.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      basket.add(board);
      this.deckBoard = board;
      this.deckBoardRest = -H / 2 + T + 0.03;
      board.position.y = this.deckBoardRest;
      // PLANCHER — the duckboard, and the reason it is here.
      //
      // A short pilot in a headset cannot see over the basket. The rim stands a
      // metre above the floor because that is where it stood, and nothing about
      // the ship should change to suit the man in it — so what moves is a loose
      // slatted board laid ON the floor, which is what you would actually do in
      // a wicker basket, and it changes nothing an observer outside can see.
      // The basket, the rim and the weave are untouched.
      //
      // Two discrete buttons rather than a lever: a floor is a thing you set
      // once and forget, not a control you fly with, and a notch a press is
      // something you can do without looking down. On the STARBOARD boards,
      // opposite the push bank on the port side.
      {
        const dbMat = new THREE.MeshPhongMaterial({ color: 0x8a7f5a, shininess: 60 });
        [['deckup', '▲', 0.075], ['deckdn', '▼', -0.075]].forEach(([id, glyph, dz]) => {
          const btn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.024, 0.024, 0.020, 10), dbMat);
          // MOUNTED ON THE WALL, not standing out from it. A cylinder's axis
          // is its local +Y, and rotation.x = t sends that to (0, cos t, sin t)
          // — so the face lies against a wall whose normal is Z only when the
          // turn is about X. Turned about Z instead, the axis went athwartships
          // and the buttons stuck out of the weave sideways. The port bank has
          // it right and is the model: -0.5 + PI/2 there, so the mirror of it
          // here, tilted the same half-radian up toward the hand.
          btn.rotation.x = 0.5 - Math.PI / 2;
          btn.position.set(bx + 0.30 + dz, -drop - 0.30, 0.394);
          this.pitchGroup.add(btn);
          placard(this.pitchGroup, glyph, btn.position.x, -drop - 0.20, 0.425,
            Math.PI, 0.075);
          this.pullCords.push({ id: 'push_' + id, mesh: btn,
            rest: btn.position.clone(), pulled: 0, push: true, lever: true });
        });
        placard(this.pitchGroup, 'PLANCHER', bx + 0.30, -drop - 0.40, 0.425,
          Math.PI, 0.155);

        // A SCALE, so you can see which notch you are on without counting
        // presses. Six ticks up the wall and a brass slider against them —
        // an instrument rather than a readout, which is what everything else
        // in this basket is. It is the one thing a set of discrete notches
        // needs and a slider did not.
        const tickM = new THREE.MeshLambertMaterial({ color: 0x6f5a3a });
        const SCX = bx + 0.30 + 0.145, SC0 = -drop - 0.44, SCH = 0.24;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, SCH, 5), tickM);
        rod.position.set(SCX, SC0 + SCH / 2, 0.392);
        this.pitchGroup.add(rod);
        DECK_NOTCHES.forEach((_n, i) => {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.006, 0.006), tickM);
          t.position.set(SCX, SC0 + (i / (DECK_NOTCHES.length - 1)) * SCH, 0.392);
          this.pitchGroup.add(t);
        });
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.014, 0.014),
          new THREE.MeshPhongMaterial({ color: 0xc9a437, shininess: 90 }));
        this.pitchGroup.add(slide);
        this.deckPointer = slide;
        this.deckScale = { x: SCX, y0: SC0, h: SCH, z: 0.392 };
      }
      this.deckPointRest = cy - H / 2 + T;
      // Remembered: a pilot's height does not change between ships, and being
      // made to find the buttons again on every one of them is the fault the
      // buttons were added to fix. The NOTCH is stored, not the height, so a
      // ladder that is ever re-cut carries a pilot's choice with it.
      let saved = 0;
      try { saved = parseInt(localStorage.getItem('myairships_deck'), 10) || 0; } catch { saved = 0; }
      this.deckNotch = Math.max(0, Math.min(DECK_NOTCHES.length - 1, saved));
      this.deckLift = DECK_NOTCHES[this.deckNotch].lift;
      // ...and the box the weave encloses, published so a check can ask what
      // has been run through the cabin rather than working the numbers out
      // again for itself and testing its own copy of them.
      this.basketBox = { x0: bx - W / 2, x1: bx + W / 2,
        y0: cy - H / 2, y1: cy + H / 2, z0: -D / 2, z1: D / 2 };
    }

    // NO BOARD BEHIND THE INSTRUMENTS. They have their own cases and stand on
    // their own; a slab behind them was one more thing in a basket that is
    // mostly things already.

    // ---- the operating position (B7: wheel, carburating lever, spark lever;
    //      plus barometer, compass, and the ballast sacks on the rim) ----
    // Laid out around the pilot's eye in "Aboard" view: eye ~(bx+0.1, -drop+0.5).
    const cream = new THREE.MeshLambertMaterial({ color: 0xf2ead6, emissive: 0x6b6355 });
    const needleMat = new THREE.MeshLambertMaterial({ color: 0x22180f });

    // The helm is a tiller: a bar lying athwartships on a pivot at its middle,
    // with a cord from each end running aft to its own side of the rudder. Push
    // one end away and pull the other back and the rudder swings — no wheel and
    // no gearing, only the two cords and what the airflow does to them.
    this.wheel = new THREE.Group();          // kept as the name the ship steers by
    this.tillerCords = null;
    if (prop !== 'none') {
      // waist height, and no higher: a bar across the eye-line would hide the
      // horizon, and the horizon is how an air-ship is flown
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.26, 6), dark);
      post.position.set(bx + 0.74, -drop + 0.13, 0);
      this.pitchGroup.add(post);

      const HALF = 0.27;                     // to each hand from the pivot
      // ...AND THE CORDS TAKE HOLD FURTHER OUT THAN THAT.
      //
      // The rudder cords used to leave the bar at +-0.27, which is well inside
      // a basket half a metre wide at the rim: both of them then ran aft
      // straight through the cabin and out through the wickerwork, past the
      // pilot's shoulders. "The tiller where the rudder cables are connected
      // should extend out further to the sides so the cables are outside the
      // cabin." So the bar carries a thinner arm out past the rim on each side
      // and the cords are made fast at the ends of those, where they have clear
      // air the whole way aft.
      //
      // The hands keep their old grips at +-0.22: the whole bar widened would
      // have put them out of reach over the side, and in a headset the tiller
      // is worked by its extension anyway.
      const rimHalf = 0.57 * (K.type === 'basket-long' ? 1.15 : 1);
      const CORD_HALF = rimHalf + 0.12;      // outboard of the weave, with room
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, HALF * 2, 6), wood);
      bar.rotation.x = Math.PI / 2;          // lying across the ship, along Z
      this.wheel.add(bar);
      for (const sz of [-1, 1]) {            // a turned grip at either end
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 6), wood);
        grip.rotation.x = Math.PI / 2;
        grip.position.z = sz * (HALF - 0.05);
        this.wheel.add(grip);
        // the outrigger, and the eye at its end that the cord is bent on to
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.016, CORD_HALF - HALF, 5), wood);
        arm.rotation.x = Math.PI / 2;
        arm.position.z = sz * (HALF + (CORD_HALF - HALF) / 2);
        this.wheel.add(arm);
        const eye = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 10), dark);
        eye.position.z = sz * CORD_HALF;
        this.wheel.add(eye);
      }
      this.wheel.position.set(bx + 0.74, -drop + 0.26, 0);
      this.pitchGroup.add(this.wheel);
      this.tillerHalf = HALF;
      this.tillerCordHalf = CORD_HALF;
      // AN EXTENSION, reaching back to the hand.
      //
      // The bar belongs at the front of the basket, where it is clear of
      // everything and out of the eye-line; but that is 0.81 m from the pilot,
      // past the end of an arm. Bringing the bar itself back put it through the
      // middle of the ship. So it gets what a dinghy's tiller gets: a stick
      // jointed at the middle of the bar and lying back toward the helmsman.
      //
      // IT IS DRAWN FROM THE SAME NUMBERS AS THE GRAB POINT. It was a child of
      // the swinging bar while the grab point was a marker computed separately,
      // and the two did not agree — the stick pointed one way and the ball you
      // were supposed to take hold of sat somewhere else: "the tiller extension
      // should be rotated to extend from the T of the tiller back to the grab
      // ball in the cockpit". One pivot, one length, one angle, both of them.
      const EXT = 0.34, RISE = 0.20;
      this.tillerExtLen = EXT;
      this.tillerRise = RISE;
      this.tillerAt = { x: bx + 0.74, y: -drop + 0.26 };
      const extPivot = new THREE.Group();
      extPivot.position.set(this.tillerAt.x, this.tillerAt.y, 0);
      this.pitchGroup.add(extPivot);
      const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, EXT, 6), wood);
      ext.geometry.rotateZ(Math.PI / 2);          // lying along the ship's x
      ext.geometry.translate(-EXT / 2, 0, 0);     // jointed at the bar's centre
      ext.rotation.z = RISE;                      // and rising a little to the hand
      extPivot.add(ext);
      const eknob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
      eknob.position.set(-EXT * Math.cos(RISE), EXT * Math.sin(RISE), 0);
      extPivot.add(eknob);
      this.tillerExt = extPivot;

      // the grab point: the ball's own place, from the same three numbers, hung
      // where tools/sim.mjs can measure it without walking a matrix chain
      this.tillerGrip = new THREE.Object3D();
      this.pitchGroup.add(this.tillerGrip);
      this.pullCords.push({ id: 'tiller', mesh: this.tillerGrip, lever: true,
        rest: null, pulled: 0 });

      // the two cords, laid out afresh each frame: both ends move, and so does
      // the rudder they pull on
      const cordMat = new THREE.LineBasicMaterial({ color: 0x2a1f14, transparent: true, opacity: 0.75 });
      this.tillerCords = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position',
          new THREE.BufferAttribute(new Float32Array(12), 3)), cordMat);
      this.tillerCords.frustumCulled = false;
      this.pitchGroup.add(this.tillerCords);
    }

    // each dial stands on its own small post at the fore rim
    for (const pz of [-0.2, 0.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 5), dark);
      post.position.set(bx + 0.5, -drop + 0.14, pz);
      this.pitchGroup.add(post);
    }

    // aneroid barometer (left dial) — the altitude's witness
    const baro = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 14), brass);
    drum.rotation.z = Math.PI / 2;
    baro.add(drum);
    if (!BARO_FACE) BARO_FACE = makeBaroFace();
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.088, 24),
      new THREE.MeshLambertMaterial({ map: BARO_FACE, emissive: 0x4a453c }));
    face.rotation.y = -Math.PI / 2;
    face.position.x = -0.03;
    baro.add(face);
    this.baroNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.078, 0.012), needleMat);
    this.baroNeedle.geometry.translate(0, 0.036, 0);
    this.baroNeedle.position.x = -0.04;
    baro.add(this.baroNeedle);
    // FORWARD OF THE CARBURATING LEVER'S THROW. It stands at bx +0.48 and its
    // knob sweeps from x +0.32 to +0.58 as the throttle opens, and the gauges
    // sat at +0.64 — six centimetres, with the compass at z +0.24 against the
    // lever's own +0.26. They are at +0.74 now, level with the tiller's pivot
    // and 0.16 m clear of the lever at full throttle.
    baro.position.set(bx + 0.74, -drop + 0.44, -0.24);
    baro.rotation.z = -0.55; // face tilted up toward the pilot's eye
    this.pitchGroup.add(baro);

    // compass card (right dial) — the needle holds its bearing as you turn
    const compass = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 14), brass);
    bowl.rotation.z = Math.PI / 2;
    compass.add(bowl);
    // the card FLOATS: it swings with the needle so N is always true north,
    // and the heading is whatever letter stands under the fixed lubber mark
    if (!COMPASS_FACE) COMPASS_FACE = makeCompassFace();
    this.compassCard = new THREE.Group();
    const card = new THREE.Mesh(new THREE.CircleGeometry(0.088, 24),
      new THREE.MeshLambertMaterial({ map: COMPASS_FACE, emissive: 0x4a453c }));
    card.rotation.y = -Math.PI / 2;
    card.position.x = -0.03;
    this.compassCard.add(card);
    compass.add(this.compassCard);
    // the lubber line: a brass index at the top of the bowl, marking the bow
    const lubber = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.012),
      new THREE.MeshLambertMaterial({ color: 0x8c2f1e, emissive: 0x3a130b }));
    lubber.position.set(-0.045, 0.098, 0);
    compass.add(lubber);
    // a slim north pointer riding the outer band, clear of the engraved letters
    this.compassNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.032, 0.014),
      new THREE.MeshLambertMaterial({ color: 0x8c2f1e, emissive: 0x3a130b }));
    this.compassNeedle.geometry.translate(0, 0.064, 0);
    this.compassNeedle.position.x = -0.04;
    compass.add(this.compassNeedle);
    compass.position.set(bx + 0.74, -drop + 0.44, 0.24);
    compass.rotation.z = -0.55; // face tilted up toward the pilot's eye
    this.pitchGroup.add(compass);

    // carburating + spark levers on a brass quadrant beside the compass —
    // the carburating lever IS the throttle indicator, leaning forward as you open it
    this.carbLever = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 5), brass);
    this.carbLever.geometry.translate(0, 0.15, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x22180f }));
    knob.position.y = 0.3;
    this.carbLever.add(knob);
    this.sparkLever = this.carbLever.clone();
    if (prop !== 'none') {
      // wide enough to carry BOTH levers: at 0.2 deep it spanned z 0.27..0.47
      // and the levers stood at 0.26 and 0.48, one off each end of their own
      // quadrant
      const quadrant = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.34), wood);
      quadrant.position.set(bx + 0.48, -drop + 0.18, 0.37);
      this.pitchGroup.add(quadrant);
      // the engraved plate naming the two levers, facing the operator
      if (!LEVER_PLATE) LEVER_PLATE = makeLeverPlate();
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.04),
        new THREE.MeshLambertMaterial({ map: LEVER_PLATE, emissive: 0x4a453c }));
      plate.rotation.y = -Math.PI / 2;
      plate.position.set(bx + 0.398, -drop + 0.18, 0.37);
      this.pitchGroup.add(plate);
      // 0.22 m apart, not 0.10. They sat inside one another's grab radius, so
      // a hand laid exactly on CARB. still found ALLUM. as the nearer FITTING —
      // because CARB. was not a fitting at all, and the nearest thing that was
      // sat four inches away: "i cant grip the carb handle, it always jiggles
      // the alum handle only when i reach over there and grab even if my hand
      // is dead bang on the carb lever".
      this.carbLever.position.set(bx + 0.48, -drop + 0.2, 0.26);
      this.pitchGroup.add(this.carbLever);
      this.sparkLever.position.set(bx + 0.48, -drop + 0.2, 0.48);
      this.pitchGroup.add(this.sparkLever);
      // THE SHIFTING WEIGHTS, on their own quadrant to port.
      //
      // POIDS is French for weights, and that is exactly what they are: "I
      // placed two bags of ballast, one fore and one aft, suspended from the
      // balloon envelope by cords. By means of lighter cords each of these two
      // weights could be drawn into the basket, thus shifting the centre of
      // gravity of the whole system" (Ch. VI). Pulling the fore weight in
      // points her stem up; the aft one, down.
      //
      // Mounted like CARB. and ALLUM. — a wooden quadrant with an engraved
      // plate — but on the other hand, because it is the other job. Trim is a
      // POSITION and not a pull, so you take hold of it and move it fore and
      // aft, and it stays where you leave it.
      {
        const quad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.2), wood);
        quad.position.set(bx + 0.48, -drop + 0.18, -0.38);
        this.pitchGroup.add(quad);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.04),
          new THREE.MeshLambertMaterial({ map: makePlacard('POIDS'), emissive: 0x4a453c }));
        plate.rotation.y = -Math.PI / 2;
        plate.position.set(bx + 0.398, -drop + 0.18, -0.38);
        this.pitchGroup.add(plate);
        const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), brass);
        trim.geometry.translate(0, 0.15, 0);
        const tknob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6),
          new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
        tknob.position.y = 0.3;
        trim.add(tknob);
        trim.position.set(bx + 0.48, -drop + 0.2, -0.38);
        this.pitchGroup.add(trim);
        this.trimLever = trim;
        this.pullCords.push({ id: 'trim', mesh: trim, lever: true,
          offset: new THREE.Vector3(0, 0.3, 0), rest: null, pulled: 0 });
      }

      // CARB. is a fitting too, and a HELD one: it is the throttle, and the
      // whole point of a carburating lever is that you set it and it stays.
      this.pullCords.push({ id: 'carb', mesh: this.carbLever, lever: true,
        offset: new THREE.Vector3(0, 0.3, 0), rest: null, pulled: 0 });

      // ALLUM. is grabbable too. It is the lever you work when she sputters —
      // "cords... for striking the motor's electric spark" (Ch. XI) — and in a
      // headset you should be able to take hold of the thing rather than press
      // a button that means it. The grabbed point is the KNOB at the top, which
      // is what a hand actually closes on; `lever` marks it as animating itself
      // (sparkT kicks it) so the cord dip does not fight that.
      // the grabbed point is the KNOB at the top of the lever, which is what a
      // hand closes on — given as a local offset rather than by reaching into
      // sparkLever.children[0], because that lever is a clone() and what a
      // clone carries is three.js's business, not ours
      this.pullCords.push({ id: 'spark', mesh: this.sparkLever, lever: true,
        offset: new THREE.Vector3(0, 0.3, 0), rest: null, pulled: 0 });

    }
    this.sparkT = 0;

    // The pilot's eye: one explicit point for every ship, just behind and a
    // little above the dials. Deriving it from the basket put the No. 4's eye
    // a metre high, because her "basket" is a bicycle saddle mounted well up
    // in the web — the instruments then sat far below the view.
    this.eyePoint = new THREE.Object3D();
    this.eyePoint.position.set(bx + 0.02, -drop + 0.55, 0);
    this.pitchGroup.add(this.eyePoint);

    // ---- the two cords, and the panel between them (for the headset) ----
    //
    // Ch. XI, of the No. 5's water ballast: "their two spigots were so arranged
    // that they could be opened and shut from my basket BY MEANS OF TWO STEEL
    // WIRES." The valve was worked the same way, on a cord to the pilot's hand.
    // So a pilot in a headset does not press a button labelled BALLAST — he
    // reaches up and pulls the cord, which is what the man did.
    //
    // Both hang within arm's reach of eyePoint, ballast to port and valve to
    // starboard, each ending in a turned wooden toggle you can actually see and
    // aim at. `vrGrab` is what src/vr.js tests against.
    {
      const cordMat = new THREE.LineBasicMaterial({ color: 0x2b2119 });
      const togMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
      const ey = -drop + 0.55;
      for (const [id, side, colour] of [['ballast', 0.42, 0x8a7048],
                                        ['vent', -0.42, 0x7d3f34]]) {
        const top = new THREE.Vector3(bx + 0.10, ey + 0.92, side);
        const bot = new THREE.Vector3(bx + 0.14, ey + 0.20, side);
        const g = new THREE.BufferGeometry().setFromPoints([top, bot]);
        this.pitchGroup.add(new THREE.Line(g, cordMat));
        const tog = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 8),
          new THREE.MeshLambertMaterial({ color: colour }));
        tog.position.copy(bot);
        this.pitchGroup.add(tog);
        // a collar so the two read apart at a glance: pale for ballast, red
        // for the valve, which is the one you cannot take back
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 10), togMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(bot).y += 0.075;
        this.pitchGroup.add(ring);
        // THE WHOLE WORD, AND MADE FAST TO THE CORD.
        //
        // It was a single letter — B and V — because LEST and SOUPAPE on a
        // plate the width of a hand were a smudge at arm's length. The plate is
        // wider now and makePlacard fits the word to it, so they can have their
        // proper names, which are the ones painted in the basket: LEST for the
        // ballast and SOUPAPE for the valve.
        //
        // And it HANGS ON THE CORD instead of beside it. The plate sat ten
        // centimetres forward of the line with nothing between them, so in a
        // headset it was a signboard floating in mid-air next to a rope. It is
        // set on the cord itself now, a hair aft so the two do not fight, with
        // a clip across it — which is how you would actually tie a label to a
        // rope.
        {
          const LABEL_Y = bot.y + 0.20;
          const f = (LABEL_Y - bot.y) / (top.y - bot.y);     // where up the cord
          const cx2 = bot.x + (top.x - bot.x) * f;
          placard(this.pitchGroup, id === 'ballast' ? 'LEST' : 'SOUPAPE',
            cx2 - 0.014, LABEL_Y, bot.z, undefined, 0.20);
          const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6), togMat);
          clip.rotation.z = Math.PI / 2;                     // across the cord
          clip.position.set(cx2, LABEL_Y + 0.022, bot.z);
          this.pitchGroup.add(clip);
        }
        this.pullCords.push({ id, mesh: tog, rest: bot.clone(), pulled: 0 });
      }

      // ---- THE PANEL OF PUSHES, on the basket's side ----
      // Four brass buttons on a plate screwed to the port rail, where a hand
      // falls when it is not flying her: the fault book, the ship's book, GO
      // for a trial, and the way out of the headset. Everything else in this
      // basket is a thing you take hold of; these are things you push.
      {
        // No backing plate: it was canted 0.5 rad while the buttons stood
        // upright, so the board cut straight through them. The buttons sit on
        // the port boards themselves, which is backing enough.
        //
        // SPACED BY THE PLACARDS, not by the buttons. 0.12 m apart cleared the
        // 0.10 m grab radius nicely and was still wrong, because the plate that
        // names each button is 0.15 m wide: every one of them lay three
        // centimetres across its neighbours and the four words ran together.
        // "Port placards overlap on the sides" (#72). The plates are cut to
        // 0.115 for these six-letter words and set 0.145 apart, which leaves
        // three centimetres of bare board between them, and the row is centred
        // on the basket instead of running aft from a fixed corner.
        const PUSH = [['bug', 'FAUTE', 0xb5442f], ['menu', 'CARNET', 0xb08a3c],
                      ['go', 'PARTIR', 0x5f8a74], ['exitvr', 'SORTIE', 0x8a8a8a]];
        const STEP = 0.145, PLATE = 0.115;
        PUSH.forEach(([id, text, colour], i) => {
          const x = bx + (i - (PUSH.length - 1) / 2) * STEP;
          const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 10),
            new THREE.MeshPhongMaterial({ color: colour, shininess: 70 }));
          btn.rotation.x = -0.5 + Math.PI / 2;
          btn.position.set(x, -drop + 0.035, -0.394);
          this.pitchGroup.add(btn);
          // flat on the port boards, facing inboard across the basket
          placard(this.pitchGroup, text, x, -drop + 0.105, -0.425, 0, PLATE);
          this.pullCords.push({ id: 'push_' + id, mesh: btn, lever: true,
            rest: btn.position.clone(), pulled: 0, push: true });
        });
      }

      // THE BELL-PULL. A third cord, aft of the other two and plainly a
      // different thing — a brass ring rather than a wooden toggle — that opens
      // the ship's book: the menu, the courses, the scenarios. In a headset the
      // B button does it too, but a button you cannot see is a button nobody
      // finds, and everything else in this basket is a thing you take hold of.
      {
        const ey = -drop + 0.55;
        // well aft of the working cords: the check measures every pair of
        // fittings against the 0.16 m grab radius, and at its first position
        // this ring sat 0.31 m from the ballast cord — near enough that a hand
        // reaching to open the book might have thrown ballast instead
        const top = new THREE.Vector3(bx - 0.34, ey + 0.92, 0.10);
        const bot = new THREE.Vector3(bx - 0.34, ey + 0.28, 0.10);
        const g = new THREE.BufferGeometry().setFromPoints([top, bot]);
        this.pitchGroup.add(new THREE.Line(g, cordMat));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.010, 6, 14),
          new THREE.MeshLambertMaterial({ color: 0xb08a3c }));
        ring.position.copy(bot);
        this.pitchGroup.add(ring);
        placard(this.pitchGroup, 'CARNET', bot.x + 0.10, bot.y + 0.20, bot.z);
        this.pullCords.push({ id: 'menu', mesh: ring, rest: bot.clone(), pulled: 0 });
      }
    }

    // The panel. Frankly anachronistic — there was no such thing in 1901, and
    // the flat game keeps its readings in the corners of the screen where a
    // headset cannot show them. Rather than pretend, it is mounted plainly on
    // the rim like a slate a pilot has wired on, and it carries exactly what
    // the corners carry. A canvas texture, redrawn only when a figure changes.
    {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 320;
      this.panelCanvas = c;
      this.panelTex = new THREE.CanvasTexture(c);
      this.panelTex.colorSpace = THREE.SRGBColorSpace;
      // THE SLATE, hung square to the eye and clear of the brass.
      //
      // It was tilted by setting rotation.x AND rotation.y on the same mesh,
      // which does not tilt a panel — it skews it, because the second rotation
      // is about an axis the first has already moved. It went up crooked. And
      // its frame was mounted 12 mm toward the pilot rather than away, so the
      // wooden back was in front of the canvas and the readings were being
      // drawn on the far side of a lid: "the tablet is crooked... and has a
      // black cover on it that blocks the text which is on the inside face of
      // the back surface".
      //
      // A group carries the yaw, the plane tilts inside it, and the frame goes
      // BEHIND. Set to port at z -0.30: the barometer is at -0.20 and the
      // compass at +0.20, and the slate was landing between them.
      const slate = new THREE.Group();
      // LOW AND CENTRED, its top edge on the basket's rim, so it is there when
      // you look down and nowhere when you look out. The rim is at -drop+0.05;
      // the panel is 0.19 tall tilted 0.55 rad, so its top sits 0.081 above its
      // centre. Same angle as before, just moved.
      // ON THE FORWARD PANEL with the brass, out of the way of the working
      // levers and the tiller's swing: "move the compass baro and tablet to a
      // panel that is mounted out front here so that it doesn't interfere with
      // the levers and tiller". The gauges stand off to either side at +-0.24
      // and the slate sits between them.
      //
      // Clear of the tiller stick, which sweeps y -drop+0.26 to +0.33 between
      // x +0.41 and +0.74; this is at +0.44, eleven centimetres over it. And
      // clear of the fore shifting weight, which hauls in only to x 1.62 and is
      // 2.18 m ahead of here at its nearest.
      slate.position.set(bx + 0.70, -drop + 0.44, 0);
      this.panelHome = bx + 0.70;
      this.panelHomeY = -drop + 0.44;        // bigPanel() grows down from here
      slate.rotation.y = -Math.PI / 2;
      this.pitchGroup.add(slate);
      // smaller and see-through: it is a reading, not a wall. At 0.30 x 0.19
      // and opaque it was a slab across the front of the basket.
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.133),
        new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true,
          opacity: 0.72, depthWrite: false }));
      pm.rotation.x = -0.55;                 // tipped up toward the eye
      pm.position.z = 0.004;                 // ...and proud of its own frame
      slate.add(pm);
      this.panelMesh = slate;
      slate.visible = false;                 // only in a headset
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.153, 0.008),
        new THREE.MeshLambertMaterial({ color: 0x4a3a28, transparent: true, opacity: 0.6 }));
      frame.rotation.x = -0.55;
      frame.position.z = -0.008;             // BEHIND the canvas, not in front
      slate.add(frame);
      this.panelFrame = null;                // the frame rides with the slate
    }

    // ballast sacks hung along the rim — one vanishes with each SPACE
    this.sackMeshes = [];
    const sackMat = new THREE.MeshLambertMaterial({ color: 0x9c8256 });
    const maxSacks = this.spec.physics.bags;
    for (let i = 0; i < maxSacks; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), sackMat);
      s.scale.y = 1.4;
      const side = i % 2 === 0 ? 1 : -1;
      s.position.set(bx - 0.5 + 0.22 * Math.floor(i / 2), -drop - 0.12, side * 0.58);
      this.pitchGroup.add(s);
      this.sackMeshes.push(s);
    }

    // ---- the shifting weights (Ch. VI; Figs. 3, 8-9) ----
    // "I placed two bags of ballast, one fore and one aft, suspended from the
    // balloon envelope by cords. By means of lighter cords each of these two
    // weights could be drawn into the basket, thus shifting the centre of
    // gravity of the whole system. Pulling in the fore weight would cause the
    // stem of the balloon to point diagonally upward; pulling in the aft weight
    // would have just the opposite effect."
    //
    // TWO sacks, then, not one weight sliding along a rail — and they do not
    // slide: each hangs at its own end and is HAULED IN toward the basket, one
    // at a time. From the No. 3 they hang at the extremities of the pole keel,
    // "because of the greater distance they were now set apart… they worked
    // with an effectiveness that astonished even myself."
    this.trim = null;
    if (prop !== 'none') {
      const onKeel = !(K.type === 'basket-long' || K.type === 'pole');
      const anchorY = onKeel ? -drop : -E.diameter / 2;
      const anchorX = onKeel ? K.length / 2 : E.length * 0.34;
      const hang = onKeel ? 0.9 : 1.6;
      const sackMat = new THREE.MeshLambertMaterial({ color: 0x83704f });
      const mk = () => {
        const g = new THREE.Group();
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), sackMat);
        sack.scale.set(0.85, 1.25, 0.85);
        sack.position.y = -hang;
        g.add(sack);
        this.pitchGroup.add(g);
        return g;
      };
      this.trim = {
        fore: mk(), aft: mk(), anchorX, anchorY, hang,
        travel: anchorX * 0.82,       // how far in they can be hauled
      };
      this.trim.fore.position.set(anchorX, anchorY, 0);
      this.trim.aft.position.set(-anchorX, anchorY, 0);
      // the cords: the one it hangs by, and the lighter one that hauls it in
      const cordMat = new THREE.LineBasicMaterial({ color: 0x2a1f14, transparent: true, opacity: 0.7 });
      this.trimCords = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position',
          new THREE.BufferAttribute(new Float32Array(24), 3)), cordMat);
      this.trimCords.frustumCulled = false;
      this.pitchGroup.add(this.trimCords);
    }
    // The motor belongs WITH its screw: a crankcase, cylinders standing up out
    // of it, the radiator ahead, exhaust stubs, and a shaft running to the hub.
    // (Before this the screw turned in clear air with the engine amidships.)
    const P0 = this.spec.physics;
    const brassM = new THREE.MeshPhongMaterial({ color: 0x8a6b2f, shininess: 60 });
    const copper = new THREE.MeshPhongMaterial({ color: 0x7d4a2e, shininess: 40 });
    const mkEngine = (x, facing) => {
      const e = new THREE.Group();
      const cyls = prop === 'both' ? 4 : (P0.thrust > 6 ? 4 : 2);   // the big ships got four
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.62), dark);
      e.add(crank);
      for (let i = 0; i < cyls; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.44, 8), dark);
        c.position.set(-0.36 + (i / Math.max(1, cyls - 1)) * 0.72, 0.42, 0);
        e.add(c);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 6), brassM);
        head.position.set(c.position.x, 0.66, 0);
        e.add(head);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5), copper);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(c.position.x, 0.5, 0.2);
        e.add(pipe);
      }
      // the water radiator, hung on the side the airflow meets
      const rad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.72), copper);
      rad.position.set(facing * 0.62, 0.12, 0);
      e.add(rad);
      // the shaft, out to the screw's hub
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), brassM);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.set(-facing * 0.72, 0, 0);
      e.add(shaft);
      e.position.set(x, -drop + 0.15, 0);
      e.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.pitchGroup.add(e);
      return e;
    };

    // ---- the rotary ventilator (Ch. X, Fig. 5) ----
    // "the tube by which the rotary ventilator fed the interior air balloon" —
    // a fan worked off the motor, with a trunk running up into the belly of the
    // gas bag. Only the first two ships carried one; from the No. 3 the rounder
    // form held itself and he was rid of the thing that had twice failed him.
    if (E.ballonnet) {
      const fanX = -K.length * 0.1;
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), dark);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(fanX, -drop + 0.42, 0.34);
      this.pitchGroup.add(housing);
      this.fanMesh = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.16),
          new THREE.MeshLambertMaterial({ color: 0x8a6b2f }));
        v.rotation.z = (i * Math.PI) / 2;
        this.fanMesh.add(v);
      }
      this.fanMesh.position.copy(housing.position);
      this.fanMesh.position.z += 0.16;
      this.pitchGroup.add(this.fanMesh);
      // the trunk, up into the belly
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13,
        Math.max(0.6, drop - this.envAt(fanX) - 0.4), 8),
        new THREE.MeshLambertMaterial({ color: 0x6b5236 }));
      trunk.position.set(fanX, (-drop + 0.55 + -this.envAt(fanX)) / 2, 0.2);
      this.pitchGroup.add(trunk);
    }

    // suspension wires
    const wirePts = [];
    // ---- the battened hems (Ch. VI) ----
    // "I gave up the usual network and chemise, or outer cover… Instead I
    // attached the suspension cords of my basket directly to the balloon
    // envelope by means of small wooden rods introduced into long horizontal
    // hems sewed on both sides to its stuff for a great part of the balloon's
    // length." So: no net over the bag and no cover round it — a seam down each
    // flank with rods in it, and the suspension taken straight off them, on
    // BOTH sides rather than from a line of bare points along her belly.
    const n = K.type === 'minimal' ? 4 : 7;
    const HEM = 0.45;                       // radians below the equator
    const sinH = Math.sin(HEM), cosH = Math.cos(HEM);
    const hemAt = (x) => { const r = this.envAt(x); return { y: -r * sinH, z: r * cosH }; };
    const hemMat = new THREE.MeshLambertMaterial({ color: 0x7a6242 });
    const spanX = (K.type === 'minimal' ? K.length * 0.5 : K.length / 2) * 0.85;
    for (const sz of [-1, 1]) {
      // the hem itself, following the flank for a good part of her length
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const x = -spanX + (2 * spanX / 12) * i;
        const h = hemAt(x);
        pts.push(new THREE.Vector3(x, h.y, sz * h.z));
      }
      const hem = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.045, 5, false), hemMat);
      this.pitchGroup.add(hem);
    }
    for (let i = 0; i < n; i++) {
      const fx = -K.length / 2 + (K.length / (n - 1)) * i;
      const ex = fx * 0.85;
      const h = hemAt(ex);
      for (const sz of [-1, 1]) {
        // the small wooden rod in the hem, and the wire hung from it
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), hemMat);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(ex, h.y, sz * h.z);
        this.pitchGroup.add(rod);
        // ...ON THE APEX, not through it. These ran to the keel's bottom
        // centreline, where there is nothing at all — between the two lower
        // rails — so on the way they went straight through the single top
        // member, which is the one thing in the ship the suspension is
        // actually FOR: "V wires should be attached to the top wood bar".
        // Ch. VI has the cords taken off the hems and into the keel, and the
        // apex is where a triangular girder takes them.
        // ...and on to the member that is actually there: the apex on a truss
        // keel, or the longeron on this wire's OWN side where there is no apex
        wirePts.push(ex, h.y, sz * h.z,
          fx, this.keelApexY !== undefined ? this.keelApexY : -drop,
          sz * (this.keelLandZ || 0));
      }
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
    this.wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2119, transparent: true, opacity: 0.75 }));
    this.pitchGroup.add(this.wires);

    // propeller(s): two silk-covered blades on a hub, with their motor set
    // just inboard of them and a shaft between (Fig. 10; the No. 4's screw at
    // the bow, the No. 7's pair at bow and stern)
    this.props = [];
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0xd8cdb2, side: THREE.DoubleSide });
    const mkProp = (x, facing) => {
      const holder = new THREE.Group();
      holder.position.set(x, -drop + 0.15, 0);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8), dark);
      hub.rotation.z = Math.PI / 2;
      holder.add(hub);
      // A 4-5 metre screw is what the book describes, but it has to TURN in the
      // gap between the keel and the belly of the gas bag: on the short-keeled
      // ships (the No. 9's basket rides close under her egg) a full-sized blade
      // would sweep straight through the envelope. Clamp it to the real room.
      const hubR = 0.15, clearance = 0.35;
      const bellyHere = this.envAt(x);              // 0 once we are past her stern
      const room = Math.max(0.55, drop - 0.15 - bellyHere - clearance);
      const R = Math.min(prop === 'both' ? 2.5 : 2.2, room);
      const span = Math.max(0.4, R - hubR);
      for (const sgn of [1, -1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, span, 0.46), bladeMat);
        blade.position.y = sgn * (span / 2 + hubR);
        // pitch is a twist about the blade's OWN span, not about the shaft:
        // turning it about the shaft just swings the blade out of line with
        // its opposite number, which is what made the screw look like two
        // sticks at odd angles instead of one straight two-blader
        blade.rotation.y = sgn * 0.34;
        holder.add(blade);
      }
      holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.pitchGroup.add(holder);
      this.props.push(holder);
      // CLEAR OF THE BASKET. On the Nos. 1 and 2 the screw is right at the
      // basket's tail and the motor stood 1.35 m in front of it — which on
      // those two ships is x -0.60, and their basket runs to -0.69. The engine
      // was standing in the basket with the pilot, which you notice at once
      // when you are in there with it.
      const engOff = K.type === 'basket-long' ? 0.62 : 1.35;
      mkEngine(x + facing * engOff, facing);    // her motor, right behind the screw
    };
    const sternX = K.type === 'basket-long' ? -1.95 : -K.length / 2 - 0.8; // Nos. 1-2: prop right at the basket
    if (prop === 'stern' || prop === 'both') mkProp(sternX, 1);
    if (prop === 'bow' || prop === 'both') mkProp(K.length / 2 + 0.8, -1);

    // rudder — the white triangle of the photographs (the "Brazil" has none)
    this.rudder = null;
    if (rudderScale > 0) {
      const rShape = new THREE.Shape();
      rShape.moveTo(0, 0); rShape.lineTo(-3.4 * rudderScale, 1.6 * rudderScale);
      rShape.lineTo(-3.4 * rudderScale, -1.6 * rudderScale); rShape.lineTo(0, 0);
      // a VERTICAL silk fin, as in the photographs — it steers by swinging
      // about its vertical hinge, not lying flat like an elevator
      this.rudder = new THREE.Mesh(new THREE.ShapeGeometry(rShape),
        new THREE.MeshLambertMaterial({ color: 0xefe8d6, side: THREE.DoubleSide }));
      this.rudder.position.set(-this.spec.envelope.length / 2 + 0.5, -this.spec.envelope.diameter * 0.25, 0);
      this.pitchGroup.add(this.rudder);
    }

    // pennant: "Por ceos nunca d'antes navegados!" — Camões altered by one word,
    // exactly as it flew on his streamer; it streams downwind
    const penGeo = new THREE.PlaneGeometry(2.6, 0.7);
    penGeo.translate(1.3, 0, 0); // pivot at the staff
    this.pennant = new THREE.Mesh(penGeo,
      new THREE.MeshLambertMaterial({ color: 0xb5442f, side: THREE.DoubleSide }));
    this.pennant.position.set(this.spec.envelope.length / 2 - 1, this.spec.envelope.diameter / 2 + 0.8, 0);
    this.pitchGroup.add(this.pennant);

    // What is the LOWEST thing on this ship? The Omnibus hangs passenger
    // baskets three metres under her keel, and a five-metre screw reaches
    // below the rails — resting her on a fixed keel height buried them in the
    // turf. Measure the built ship and stand her on that.
    const hull = new THREE.Box3().setFromObject(this.pitchGroup);
    this.lowY = hull.min.y;                  // in ship coordinates, envelope centre = 0

    // the ship throws a true shadow on the country below
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }


  // envelope half-height at local x (for wire attach)
  envAt(x) {
    const a = this.spec.envelope.length / 2, b = this.spec.envelope.diameter / 2;
    const c = Math.max(0, 1 - (x * x) / (a * a));
    return b * Math.sqrt(c);
  }

  // ------------------------------------------------------------ rope
  initRope() {
    const P = this.spec.physics;
    this.ropeSegs = 15;
    this.ropeSegLen = P.ropeLen / this.ropeSegs;
    const a = this.ropeAttachWorld();
    this.rope = [];
    for (let i = 0; i <= this.ropeSegs; i++) {
      const p = new THREE.Vector3(a.x, Math.max(0.2, a.y - i * this.ropeSegLen), a.z);
      this.rope.push({ p, prev: p.clone() });
    }
    if (!this.ropeLine) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array((this.ropeSegs + 1) * 3).fill(0), 3));
      this.ropeLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a2f22 }));
      this.ropeLine.frustumCulled = false;
      this.scene.add(this.ropeLine);
    }
    this.groundedFrac = 0;
  }

  ropeAttachWorld() {
    // rope attachment shifts fore/aft with the weights (Figs. 8-9)
    const K = this.spec.keel, P = this.spec.physics;
    const shift = -(this.pitch / (P.pitchMax || 1)) * K.length * 0.32;
    const v = new THREE.Vector3(K.length * 0.35 + shift, this.keelY, 0);
    return this.group.localToWorld(v);
  }

  updateRope(dt) {
    const attach = this.ropeAttachWorld();
    const nodes = this.rope;
    nodes[0].p.copy(attach); nodes[0].prev.copy(attach);
    let grounded = 0;
    const nearB = this._nearBuildings || [];
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const vx = (n.p.x - n.prev.x) * 0.985, vy = (n.p.y - n.prev.y) * 0.985, vz = (n.p.z - n.prev.z) * 0.985;
      n.prev.copy(n.p);
      n.p.x += vx; n.p.y += vy - 9.8 * dt * dt * 6; n.p.z += vz;
      // rope rests on whatever is beneath it — pavement, hillside or rooftops
      // (A1, B4). Over the sea it lies on the water and becomes the true
      // stabilisateur the book makes of it.
      let floor = this.groundUnder(n.p.x, n.p.z) + 0.15;
      // ON the water, not under it. The Seine's bed is cut below its sheet, so
      // a rope that asked only for the ground went to the bottom of the river
      // and dragged there — 1.2 m beneath the surface it is supposed to be
      // lying on. Over Monaco the sea IS the ground and this changes nothing.
      const wy = this._env && this._env.waterY && this._env.waterY(n.p.x, n.p.z);
      if (wy !== null && wy !== undefined && wy > floor) floor = wy;
      for (const b of nearB) {
        if (Math.abs(n.p.x - b.x) < b.w / 2 && Math.abs(n.p.z - b.z) < b.d / 2) {
          floor = Math.max(floor, b.top + 0.15);
        }
      }
      if (n.p.y < floor) {
        n.p.y = floor;
        n.p.x = n.prev.x + (n.p.x - n.prev.x) * 0.4;
        n.p.z = n.prev.z + (n.p.z - n.prev.z) * 0.4;
        grounded++;
      }
    }
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i], b = nodes[i + 1];
        const d = b.p.clone().sub(a.p);
        const len = d.length() || 0.0001;
        const diff = (len - this.ropeSegLen) / len;
        if (i === 0) b.p.sub(d.multiplyScalar(diff));
        else { a.p.add(d.clone().multiplyScalar(diff * 0.5)); b.p.sub(d.multiplyScalar(diff * 0.5)); }
      }
    }
    this.groundedFrac = grounded / this.ropeSegs;
    const posAttr = this.ropeLine.geometry.attributes.position;
    for (let i = 0; i < nodes.length; i++) posAttr.setXYZ(i, nodes[i].p.x, nodes[i].p.y, nodes[i].p.z);
    posAttr.needsUpdate = true;
  }

  // impact response: off-center hits swing the ship (yaw torque + pitch kick)
  // s: axial offset of contact point (m), n: outward normal, j: impulse (m/s)
  applyImpact(s, n, j) {
    const fwd = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.yawVel += s * (fwd.x * n.z - fwd.z * n.x) * j * 0.015;
    this.pitchKick = (this.pitchKick || 0) + s * n.y * j * 0.004;
  }

  // the aids replenish petroleum and ballast when the ship rests at its station
  replenish(dt) {
    const P = this.spec.physics;
    let did = false;
    if (P.fuel && this.fuel < P.fuel) {
      this.fuel = Math.min(P.fuel, this.fuel + P.fuel * dt / 6);
      did = true;
    }
    this.restockT += dt;
    if (this.bags < P.bags && this.restockT > 0.7) {
      this.bags++; this.restockT = 0; did = true;
    }
    return did;
  }

  // where her envelope's centre sits when she is standing on the ground
  restHeight() { return -(this.lowY ?? this.keelY) + 0.25; }

  /**
   * The ground under a point. Paris and St. Louis are flat and answer 0; Monaco
   * hands back a real heightfield, so the ship must land on the Tete de Chien at
   * five hundred metres and not fall through it to the sea.
   */
  groundUnder(x, z) {
    const g = this._env && this._env.groundAt;
    return g ? g(x, z) : 0;
  }

  // ------------------------------------------------------------ the panel
  /**
   * Draw the readings onto the basket panel. Called only while a headset is on;
   * `lines` is [[label, value], ...] and `note` a single line of message text.
   * Redraws only when something has actually changed — a canvas upload every
   * frame at ninety hertz is a cost a headset cannot afford.
   */
  drawPanel(lines, note, nav, toast) {
    const key = JSON.stringify([lines, note || '', nav || [], toast || '']);
    if (key === this._panelKey) return;
    this._panelKey = key;
    const c = this.panelCanvas;
    if (!c) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(18,15,11,0.88)';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#6b5a3e'; g.lineWidth = 4;
    g.strokeRect(6, 6, c.width - 12, c.height - 12);
    g.textBaseline = 'middle';

    // wrap `text` into the width, from `ly` down, and answer where it ended
    const wrap = (text, x, ly, step, maxW, maxY) => {
      let line = '';
      for (const wd of String(text).split(' ')) {
        if (line && g.measureText(line + wd).width > maxW) {
          g.fillText(line, x, ly); line = ''; ly += step;
          if (ly > maxY) return ly;
        }
        line += (line ? ' ' : '') + wd;
      }
      if (line && ly <= maxY) { g.fillText(line, x, ly); ly += step; }
      return ly;
    };

    // A TOAST TAKES THE WHOLE SLATE, for a moment. "When there is a toast the
    // tablet can replace the content with just the toast for a moment" — the
    // readings are always a glance away and the message is not.
    if (toast) {
      g.fillStyle = '#f4e6bf';
      g.font = 'italic 30px Georgia, serif';
      g.textAlign = 'center';
      const lines2 = [];
      {
        let line = '';
        for (const wd of String(toast).split(' ')) {
          if (line && g.measureText(line + wd).width > c.width - 64) { lines2.push(line); line = ''; }
          line += (line ? ' ' : '') + wd;
        }
        if (line) lines2.push(line);
      }
      const step = 38;
      let ly = c.height / 2 - ((lines2.length - 1) * step) / 2;
      for (const l of lines2.slice(0, 7)) { g.fillText(l, c.width / 2, ly); ly += step; }
      g.textAlign = 'left';
      this.panelTex.needsUpdate = true;
      return;
    }

    // the readings, in two columns so the lower half is free for the way home
    const half = Math.ceil(lines.length / 2);
    lines.forEach(([label, value], i) => {
      const col = i < half ? 0 : 1;
      const x0 = 26 + col * (c.width / 2 - 6);
      const x1 = (col === 0 ? c.width / 2 - 12 : c.width - 26);
      const y = 34 + (i - col * half) * 34;
      g.fillStyle = '#a99878';
      g.font = '19px Georgia, serif';
      g.fillText(String(label).toUpperCase(), x0, y);
      g.fillStyle = '#f0e2c2';
      g.font = 'bold 25px Georgia, serif';
      g.textAlign = 'right';
      g.fillText(String(value), x1, y);
      g.textAlign = 'left';
    });

    // THE WAY TO THE NEXT THING, and to anybody else in the sky.
    //
    // The same arrow as the wind and the roster: it turns with YOUR head, so
    // straight up is dead ahead and a pilot can follow it out of the basket
    // without doing sums.
    let y = 34 + half * 34 + 16;
    g.strokeStyle = '#5a4c34'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(22, y - 12); g.lineTo(c.width - 22, y - 12); g.stroke();
    y += 14;
    for (const n of (nav || []).slice(0, 3)) {
      g.save();
      g.translate(42, y);
      g.rotate(((n.deg || 0) + 90) * Math.PI / 180);   // the glyph points up at 0
      g.fillStyle = n.rival ? '#8fc6dd' : '#e8c477';
      g.beginPath();
      g.moveTo(0, -15); g.lineTo(10, 11); g.lineTo(0, 4); g.lineTo(-10, 11);
      g.closePath(); g.fill();
      g.restore();
      g.fillStyle = '#f0e2c2';
      g.font = 'bold 23px Georgia, serif';
      g.fillText(String(n.far || ''), 66, y);
      g.fillStyle = n.rival ? '#8fc6dd' : '#a99878';
      g.font = '19px Georgia, serif';
      const nx = 66 + g.measureText('88888 m').width + 8;
      const nm = String(n.name || '');
      g.fillText(g.measureText(nm).width > c.width - nx - 20
        ? nm.slice(0, 22) + '…' : nm, nx, y);
      y += 30;
    }

    if (note) {
      g.fillStyle = '#e8c477';
      g.font = 'italic 19px Georgia, serif';
      wrap(note, 26, Math.max(y + 8, c.height - 68), 24, c.width - 52, c.height - 18);
    }
    this.panelTex.needsUpdate = true;
  }

  /**
   * Grow the slate and make it solid, for an ending — a scenario's last word is
   * a paragraph, and 0.21 m of half-transparent canvas is the wrong place to
   * read one. It goes back to its small, see-through self when the notice does.
   */
  bigPanel(on) {
    if (!this.panelMesh || this._panelBig === on) return;
    this._panelBig = on;
    // THE SLATE DOES NOT MOVE. It is a fitting of the ship, screwed to the
    // basket, and a fitting that comes at you when it has something to say is
    // not a fitting — it is a pop-up. "Dont zoom the tablet closer to the
    // person in vr when a roast comes just keep it where it normally is."
    //
    // It used to grow 2.4x and travel 0.17 m up and 0.17 m in. That was asked
    // for once, when a long notice was unreadable at its normal size — but the
    // reason it was unreadable has since been fixed elsewhere: a toast takes
    // the WHOLE slate and wraps itself across it at a size meant to be read
    // (drawPanel, below). So the growth was solving a problem that no longer
    // exists, and paying for it by lunging at the pilot.
    //
    // What is left is the only part that never moved anything: a notice worth
    // reading makes the slate opaque instead of translucent, for as long as it
    // is up. Same place, same size, easier to read.
    this.panelMesh.scale.set(1, 1, 1);
    this.panelMesh.position.y = this.panelHomeY;
    if (this.panelHome !== undefined) this.panelMesh.position.x = this.panelHome;
    this.panelMesh.traverse((o) => {
      if (o.material && o.material.transparent !== undefined) {
        o.material.opacity = on ? 1 : (o.geometry && o.geometry.type === 'BoxGeometry' ? 0.6 : 0.72);
      }
    });
    // published as a plain flag, because the headless three is a stub and a
    // material's opacity does not survive it — without this, "does a notice
    // still make the slate opaque?" is a question the harness cannot ask, and
    // the check quietly becomes a guess. Same reason the funnel smoke publishes
    // its own alpha.
    this.panelOpaque = !!on;
  }

  /** Show or hide the panel and its frame — headset only. */
  showPanel(on) {
    if (this.panelMesh) this.panelMesh.visible = on;
    if (this.panelFrame) this.panelFrame.visible = on;
  }

  /**
   * The world position of a pull-cord's toggle, for a hand to reach for.
   * `id` is 'ballast' or 'vent'.
   */
  cordAt(id, out) {
    const c = (this.pullCords || []).find((k) => k.id === id);
    if (!c || !c.mesh) return null;
    const v = out || new THREE.Vector3();
    if (c.offset) { v.copy(c.offset); c.mesh.localToWorld(v); return v; }
    return c.mesh.getWorldPosition(v);
  }

  /**
   * Pull a cord, or throw a lever. A cord dips and springs back; ALLUM. kicks
   * on its own clock, which is the animation it already had for the F key, so
   * it is left to do that rather than being dipped as well.
   */
  pullCord(id) {
    if (id === 'spark') { this.sparkT = 0.35; return; }
    const c = (this.pullCords || []).find((k) => k.id === id);
    if (c) c.pulled = 1;
  }

  // ------------------------------------------------------------ controls
  dropBallast() {
    if (this.bags > 0 && !this.wrecked) { this.bags--; this.events.push('ballast'); }
    else if (this.bags === 0) this.events.push('noballast');
  }

  // ------------------------------------------------------------ physics
  update(dt, input, wind, env) {
    const P = this.spec.physics;
    this._env = env;
    // The wind gradient is reckoned from the ground below us, not from the sea,
    // so the whole frame shares one heightfield lookup for it.
    this.groundHere = this.groundUnder(this.pos.x, this.pos.z);
    this._t += dt;
    if (this.wrecked) {
      // the gas escapes and the bag dies — "losing the remains of its gas
      // in convulsive agitations, like a great bird that dies"
      this.gas = Math.max(0, this.gas - 28 * dt);
      this.fullness = (this.gas / 100) * this.heat;
      this.fold = Math.min(1, (this.fold || 0) + dt * 0.9 * (1 - this.spec.physics.foldResist * 0.7));
      this.deformEnvelope();
      this.vel.multiplyScalar(0.97);
      this.vel.y -= 6 * dt;
      this.pos.addScaledVector(this.vel, dt);
      // The wreck settles on its own keel, and once down it IS down: `landed`
      // must become true or the pilot can never leave the ship again.
      //
      // restHeight(), the SAME measure a clean landing uses. This used to be
      // -keelY * 0.4, a guess at the keel depth made before lowY existed, and
      // it put the wreck well below her own lowest timber: the basket sank
      // through the ground every time she came down hard.
      const rest = this.groundUnder(this.pos.x, this.pos.z) + this.restHeight();
      if (this.pos.y < rest) { this.pos.y = rest; this.vel.set(0, 0, 0); this.landed = true; }
      this.updateRope(dt);
      this.updateTransforms(dt);
      return;
    }

    // throttle / rudder / weights — and the petroleum (B10: a pound per hp-hour)
    this.throttle = P.thrust > 0 ? clamp(this.throttle + input.throttle * 0.6 * dt, 0, 1) : 0;
    if (P.thrust > 0 && this.fuel > 0 && this.throttle > 0) {
      this.fuel = Math.max(0, this.fuel - this.throttle * dt);
      if (this.fuel === 0) this.events.push('fuelOut');
    }
    this.motorOn = P.thrust > 0 && this.fuel > 0 && !this.motorDead;
    // THE DUCKBOARD rides where the PLANCHER buttons put it, and the pilot's
    // deck point rides with it. That is the whole trick: his eye goes up
    // because the FLOOR went up, so the rim, the dials, the cords and his own
    // hands all stay exactly where they were relative to him.
    if (this.deckBoard) {
      this.deckBoard.position.y = this.deckBoardRest + this.deckLift;
      if (this.deckPoint) this.deckPoint.position.y = this.deckPointRest + this.deckLift;
      // the slider stands against the notch she is set to — UP the scale as the
      // floor comes up, which is down the ladder toward the shorter pilot
      if (this.deckPointer && this.deckScale) {
        const f = (this.deckNotch || 0) / (DECK_NOTCHES.length - 1);
        this.deckPointer.position.set(this.deckScale.x,
          this.deckScale.y0 + f * this.deckScale.h, this.deckScale.z);
      }
    }
    this.rudderInput = input.rudder;
    // THE WEIGHT IS HAULED, NOT TELEPORTED. "By means of lighter cords each of
    // these two weights could be drawn into the basket" — a man pulling a
    // ballast sack the length of a keel takes some seconds over it, and that
    // slow hand is most of why these ships did not pitch about wildly. Fed the
    // trim as an instant step, an undamped pendulum overshoots by 100 per cent
    // by definition; fed it over five seconds, against a ten-second period, she
    // leans into it. So the lever commands where the sack goes, and the sack
    // takes TRIM_HAUL seconds to get there.
    const wantTrim = input.pitch * P.pitchMax;
    const haul = P.pitchMax / TRIM_HAUL * dt;
    this.pitchTarget += Math.max(-haul, Math.min(haul, wantTrim - this.pitchTarget));
    // ---- SHE IS A PENDULUM, AND SHE SWINGS (B3) ----
    //
    // The gas is up in the envelope and the motor, keel, basket and pilot hang
    // metres beneath it, so hauling a sack forward does not SET an angle — it
    // displaces a pendulum, which then swings about the new trim and takes two
    // or three swings to settle. This used to be written as
    //
    //     this.pitch += (target - this.pitch) * 1.6 * dt
    //
    // which reached full pitch in 1.43 s, never overshot, and did it in exactly
    // the same 1.43 s for the 370 kg No. 9 and the 1,870 kg No. 10: mass and
    // size did not enter the model at all. The real period is pitchPeriod()'s
    // seven to eleven seconds, so trim answered about seven times too quickly.
    //
    // Damping is aerodynamic, so it comes with airspeed: hanging still she
    // swings for the best part of a minute, at cruise the hull and fins kill it
    // in about two swings. A folding hull has lost the stiffness that restores
    // her, so its period lengthens.
    {
      const w = this.pitchW * (1 - (this.fold || 0) * 0.4);
      // even hanging still she is damped — a great bluff body of fabric moving
      // through air, and rigging and envelope that eat the energy between them;
      // the fins and the hull at speed add the rest
      const z = Math.min(0.9, 0.12 + 0.22 * Math.min(1, this._airspeed / 11));
      // semi-implicit, and substepped so a long frame cannot ring the spring
      const n = Math.max(1, Math.ceil(dt * w * 4));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.pitchVel += ((this.pitchTarget - this.pitch) * w * w
          - 2 * z * w * this.pitchVel) * h;
        this.pitch += this.pitchVel * h;
      }
    }
    // impact-induced rotation, decaying
    this.pitchKick = (this.pitchKick || 0) * Math.pow(0.15, dt);
    this.pitch += this.pitchKick * dt * 12;

    // (B8 gas-rush rearing lives in the structural section below,
    //  where fullness is known)

    // the pennant reads the apparent wind (true wind minus our own motion)
    const appWind = windAt(wind, this.pos.y, this.groundHere).sub(this.vel);
    this._pennantAng = Math.atan2(-appWind.z, appWind.x);

    // heat: cloud shadow and forest cooling (A2, A4)
    // superheat is a few percent in reality — at true gravity scale that is
    // plenty dangerous (a 4.5% loss sinks you ~1.5 m/s until you act)
    let heatTarget = 1.0;
    if (env.underCloud) heatTarget = 0.955;
    else if (env.inBois && this.pos.y < 120) heatTarget = 0.97;
    this.heat += (heatTarget - this.heat) * Math.min(1, 0.35 * dt);
    if (env.underCloud && this.heat > 0.985) this.events.push('shadow');

    // ---- the interior air balloon (B6a; Ch. X) ----
    // The fan is driven off the motor, so the ballonnet is only kept up while
    // she is under way: stop the engine, or let it sputter, and the air begins
    // to go out of her. That is the whole of the No. 2's disaster — the pump
    // "twice refused to work adequately at the critical moment".
    const hasBallonnet = !!this.spec.envelope.ballonnet;
    if (hasBallonnet) {
      const running = this.motorOn && !this.sputtering && this.throttle > 0.04 && this.fuel > 0;
      if (running && this.pumpOk) this.airFill = Math.min(1, this.airFill + dt * 0.30);
      else this.airFill = Math.max(0, this.airFill - dt * 0.10);
      if (this.pumpOk && running && Math.random() < dt / 75) {
        this.pumpOk = false;
        this.events.push('pumpFail');
      }
      // The same hand on the same levers that coaxes the motor will free it.
      // input.coax is a one-shot set on the key DOWN, not a flag held while the
      // key is: counting seconds of it accumulated one frame per press and the
      // fan could never be revived at all. It counts taps — three of them.
      if (!this.pumpOk && input.coax) {
        this.pumpNag += 0.34;
        if (this.pumpNag >= 1) { this.pumpOk = true; this.pumpNag = 0; this.events.push('pumpFixed'); }
      } else if (this.pumpOk) this.pumpNag = 0;
      if (this.fanMesh) this.fanMesh.rotation.z += dt * (running && this.pumpOk ? 26 : 0.4);
    }

    // pressure (B6): fullness x heat x altitude expansion, + tail suction with speed
    const airspeedV = this.vel.clone().sub(windAt(wind, this.pos.y, this.groundHere));
    // the air rises and settles as well as blowing: subtracting it here means
    // every vertical force below — drag, the dive exchange — is reckoned against
    // the moving air, so a column lifts the ship whatever the valve is doing
    this.airY = env.airY || 0;
    airspeedV.y -= this.airY;
    const airspeed = Math.hypot(airspeedV.x, airspeedV.z);
    // the air balloon makes up what the gas has lost, up to its own capacity —
    // which is why the first two ships could hold their shape at all
    const gasFull = (this.gas / 100) * this.heat;
    const AIR_CAP = 0.20;
    const fullness = hasBallonnet
      ? gasFull + Math.min(Math.max(0, 1 - gasFull), AIR_CAP * this.airFill)
      : gasFull;
    const pressure = fullness * (1 + this.pos.y / 1600) + P.speedPressure * (airspeed / 18);
    this.pressure = pressure;
    if (pressure > P.pressureLimit) {
      this.gas = Math.max(0, this.gas - P.ventRate * dt);
      this.events.push('valves');
    }
    if (input.vent) {
      this.gas = Math.max(0, this.gas - P.ventRate * dt);
    }

    // ---- envelope structural state (B6, B8) ----
    this.fullness = fullness;
    const sagThresh = 0.78 - P.foldResist * 0.33;
    // the FOLD: a starved long hull creases under way — worse with speed
    const airspeedNow = Math.hypot(airspeedV.x, airspeedV.z);
    const speedFac = 0.45 + 0.55 * Math.min(1, airspeedNow / 8);
    const foldTarget = P.foldResist >= 1 ? 0
      : clamp((sagThresh - fullness) / 0.22, 0, 1) * speedFac;
    this.fold += (foldTarget - this.fold) * Math.min(1, 1.1 * dt);
    if (this.fold > 0.35 && !this._foldWarned) {
      this._foldWarned = true;
      this.events.push('folding');
    } else if (this.fold < 0.2) this._foldWarned = false;
    // gas pooling along the axis when pitched (partitions nearly stop it)
    const poolTarget = clamp(Math.sin(this.pitch) * 2.2, -1, 1)
      * clamp((0.9 - fullness) * 2.2, 0, 1)
      * (P.partitions ? 0.12 : 0.5);
    this.gasPool += (poolTarget - this.gasPool) * Math.min(1, 0.5 * dt);
    // B8: gas-rush rearing — a slack, pitched, unpartitioned bag runs away
    if (!P.partitions && fullness < 0.92 && Math.abs(this.pitch) > 0.18) {
      const inst = clamp((0.92 - fullness) / 0.3, 0, 1) * 0.35;
      this.pitch += Math.sign(this.pitch) * inst * dt;
      this.pitch = clamp(this.pitch, -0.9, 0.9);
      if (Math.abs(this.pitch) > P.pitchMax * 1.6) this.events.push('rearing');
    }
    // a folding ship wallows: pitch wobble the helm cannot quiet
    this.pitch += Math.sin(this._t * 3.3) * this.fold * 1.1 * dt;
    this.deformEnvelope();

    const sag = fullness < sagThresh || this.fold > 0.2;
    if (sag && this.throttle > 0.5 && this.motorOn) {
      this.foulTime += dt;
      this.events.push('sagWarn');
      if (this.foulTime > 2.5) {
        this.gas = Math.max(0, this.gas - 2.5 * dt);
        this.motorHealth = Math.max(0.3, this.motorHealth - 0.1 * dt);
        this.events.push('fouling');
      }
    } else this.foulTime = Math.max(0, this.foulTime - dt);

    // motor sputter (B7)
    if (this.sputtering) {
      this.motorHealth = Math.max(0.12, this.motorHealth - 0.5 * dt);
      if (input.coax) { this.motorHealth = Math.min(1, this.motorHealth + 0.14); input.coax = false; this.sparkT = 0.35;
        if (this.motorHealth > 0.85) { this.sputtering = false; this.events.push('motorFixed'); } }
    } else if (input.coax) { input.coax = false; this.sparkT = 0.35; }

    // ---- forces ----
    const ry = this.yaw;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = new THREE.Vector3(Math.cos(ry) * cp, sp, -Math.sin(ry) * cp);
    const acc = new THREE.Vector3();

    // thrust
    const thrust = this.motorOn ? P.thrust * this.throttle * this.motorHealth : 0;
    acc.addScaledVector(fwd, thrust);

    // drag against airspeed, decomposed forward/lateral (streamlined hull)
    const fwdFlat = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const latFlat = new THREE.Vector3(-fwdFlat.z, 0, fwdFlat.x);
    const vf = airspeedV.dot(fwdFlat), vl = airspeedV.dot(latFlat);
    // a slack or folded bag is no longer streamlined — drag balloons
    const flab = 1 + this.fold * 2.2 + Math.max(0, 0.6 - this.fullness) * 1.2;
    acc.addScaledVector(fwdFlat, -(P.dragQ * flab * vf * Math.abs(vf) + P.dragL * vf));
    acc.addScaledVector(latFlat, -(0.9 * vl + 0.12 * vl * Math.abs(vl)));
    // ROPE GROUND DRAG (B4: the brake) — AGAINST THE WAY SHE IS ACTUALLY GOING.
    //
    // This was applied along fwdFlat and reckoned on vf, the airspeed's forward
    // component: a rope that only ever braked along the hull's own axis. So a
    // ship shoved sideways down the wind with sixty metres of rope on the
    // ground felt no brake at all from it, which is the other half of why she
    // slid instead of coming round. The rope drags on the EARTH, so it works on
    // her speed over the ground and in whatever direction that is.
    if (this.groundedFrac > 0) {
      const gx = this.vel.x, gz = this.vel.z;
      const gs = Math.hypot(gx, gz);
      if (gs > 0.01) {
        const k = this.groundedFrac * 0.06 * gs;
        acc.x -= k * gx;
        acc.z -= k * gz;
      }
    }

    // energy exchange: a nose-down dive rams the streamlined hull forward
    // (altitude is stored speed); hauling the nose up bleeds it away
    const sp0 = Math.sin(this.pitch);
    if (sp0 < -0.02 && airspeedV.y < 0) {
      acc.addScaledVector(fwdFlat, Math.min(6, -airspeedV.y * -sp0 * 2.2));
    } else if (sp0 > 0.02 && this.vel.y > 0) {
      acc.addScaledVector(fwdFlat, -Math.min(4, this.vel.y * sp0 * 1.6));
    }

    // buoyancy at true gravity scale: a = g(B - W)/m. LIFT_SCALE raises both
    // sides so the balance sums to ~g at trim - full-gas handling is unchanged,
    // but the physics of deficit is now real: airships fly essentially FULL
    // (neutral ~98% gas - why ballast exists), a cloud shadow's few-percent
    // superheat loss genuinely sinks you, and a bag at 30% falls at ~6 m/s
    // ("the descent became a fall").
    const LIFT_SCALE = 6.5;
    const density = Math.max(0.7, 1 - this.pos.y / 20000);
    const lift = (P.gasLift + LIFT_SCALE) * (this.gas / 100) * this.heat * density
      + this.groundedFrac * P.ropeLift;                    // B4 auto-ballast
    // petrol is real weight now (~3% of the ship): burning it over a long
    // flight leaves you light - the classic end-of-voyage lift problem
    const fuelWeight = P.fuel ? (this.fuel / P.fuel) * 0.25 : 0;
    const weight = P.weightBase + LIFT_SCALE + this.bags * P.bagLift + fuelWeight;
    let vAcc = lift - weight;
    vAcc -= 0.5 * airspeedV.y + 0.14 * airspeedV.y * Math.abs(airspeedV.y);
    // the grounded rope steadies her — "an incessant little tugging...
    // infinitely gentle": heavy damping, no porpoising at the pad
    if (this.groundedFrac > 0.25) vAcc -= this.vel.y * 2.2;
    acc.y += vAcc;

    // B5: tangage — the pitching in the 25-45 km/h band, worse against the wind
    //
    // This used to be a canned bob: a sine wave added straight to the vertical
    // acceleration, so the ship rose and fell without ever changing attitude.
    // Tangage is the hull PITCHING, and now that she is a real pendulum the
    // honest way to make it is to push the pendulum and let the bob follow from
    // the thrust vector — which also means it rings at HER period rather than
    // at one rate for the whole fleet, and that the same damping that settles a
    // weight shift settles this.
    const kmh = airspeed * 3.6;
    const band = Math.max(0, 1 - Math.abs(kmh - 33) / 18);
    const headwind = Math.max(0, -airspeedV.clone().normalize().dot(windAt(wind, this.pos.y, this.groundHere).normalize() || 0)) || 0;
    // a nudge, not a pump: enough to keep two or three degrees of pitching alive
    // in the band, not enough to stop a trim ever settling
    this.pitchVel += Math.sin(this._t * this.pitchW * 2) * band
      * (0.014 + 0.014 * headwind) * dt;
    this._airspeed = airspeed;         // next frame damps the pendulum with it

    // integrate
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // yaw — the rudder works on the airflow over the tail: sternway REVERSES
    // the helm, and only a stern propeller's slipstream steers you at rest
    // AN AIRSHIP TURNS IN HULL LENGTHS, NOT IN DEGREES A SECOND.
    //
    // This used to add a fixed yaw acceleration and let an exponential decay
    // find the balance, which gave the No. 6 a steady turn of 24 deg/s and a
    // radius of 21 m — two thirds of her own 33 m length. That is not a turn,
    // it is a pivot: the hull would have to slide sideways through the air to
    // do it. Measured across the fleet, every ship but the racer turned inside
    // its own length.
    //
    // What resists the turn is the envelope's side area and the mass of air it
    // has to shove aside, and what drives it is one small rudder in the flow
    // over the tail. BOTH scale with that flow, so the steady turning RADIUS is
    // a property of the hull and hardly of the speed at all — which is why a
    // real dirigible's turning circle is quoted in hull lengths, three to five
    // of them for a small non-rigid. He describes it himself at Cap Martin:
    // "the air-ship swung round like a boat."
    //
    // So P.yawRate is now turns-per-hull-length: 0.25 means a radius of four
    // lengths. The rudder commands a rate, the hull takes several seconds to
    // settle into it, and sternway still reverses the helm because `flow` goes
    // negative with the ship.
    // The slipstream over the tail belongs to the motor that makes it. A flat
    // four metres a second was most of the No. 1's whole airflow — she has a
    // 3.5 hp Dion-Bouton — and it turned her inside three lengths while the
    // racer with three times the engine got no more out of it.
    const wash = this.motorOn && (this.spec.prop === 'stern' || this.spec.prop === 'both')
      ? this.throttle * this.motorHealth * Math.min(4, P.thrust * 0.55) : 0;
    const flow = vf + wash;                        // the airflow over the tail
    const hull = this.spec.envelope.length || 30;
    // ---- SHE WEATHERCOCKS (and she never did) ----
    //
    // Yaw was the rudder and nothing else, so the hull had no opinion about
    // which way it pointed. A pilot watching the No. 6 shoved sideways down the
    // wind with her guide rope dragging asked whether she would not turn into
    // it. She would. The fins are a long way aft of the middle of her, so any
    // sideslip makes a moment that swings the nose back into the airflow — it
    // is why an airship at her mast lies head to wind and why she holds a
    // heading at all with the helm amidships.
    //
    // The airflow that matters is the one over the HULL: airspeedV, her motion
    // through the air. Free-ballooning she has none — she goes with the wind
    // and has no preferred heading, which is right. But with the rope down she
    // is held back, the air goes past her, and she comes round head to wind
    // like a boat riding to her anchor. One term does both; neither is a
    // special case.
    const airH = Math.hypot(airspeedV.x, airspeedV.z);
    let vane = 0;
    if (airH > 0.25) {
      const into = Math.atan2(-airspeedV.z, airspeedV.x);
      let e = into - this.yaw;
      while (e > Math.PI) e -= 2 * Math.PI;
      while (e < -Math.PI) e += 2 * Math.PI;
      // the same form as the rudder — a rate, per hull length of airflow — so a
      // ship that turns lazily also weathercocks lazily. A folded bag has lost
      // the tail that does it.
      vane = VANE * (airH / hull) * Math.sin(e) * (1 - (this.fold || 0) * 0.7);
    }
    // ---- AND SHE RIDES TO HER ROPE ----
    //
    // The vane alone is weak at a drift: the rope's brake goes as the square of
    // the speed, so at a few metres a second she nearly keeps up with the air
    // and there is little airflow to weathercock with -- measured, a quarter of
    // a metre a second, which swings her at a sixth of a degree.
    //
    // But the rope is made fast well FORWARD (ropeAttachWorld: 0.35 of the keel
    // ahead of the middle), so its drag on the ground is a MOMENT as well as a
    // brake. Drifting to starboard, the drag at the bow holds the bow back and
    // the stern goes on down the wind, and she comes head to wind about the
    // rope exactly as a boat does about her anchor. That is the term that was
    // missing, and at a drift it is the one that does the work.
    if (this.groundedFrac > 0) {
      const gl = this.vel.x * latFlat.x + this.vel.z * latFlat.z;
      vane += ROPE_VANE * this.groundedFrac * (gl / hull);
    }
    this.sideslip = vane;
    const want = input.rudder * P.yawRate * (flow / hull) * (1 - this.fold * 0.55) + vane;
    // she leans into it over about three seconds — a hull this size does not
    // change its mind quickly, and neither does the air around it
    this.yawVel += (want - this.yawVel) * Math.min(1, dt / 3);
    this.yaw += this.yawVel * dt;

    // broadphase: buildings near the ship, for the rope's rooftop draping and
    // for the floor. It used to run AFTER the ground contact below, which is
    // why the floor could not use it.
    let roof = -Infinity;
    if (env.buildings) {
      this._nearBuildings = [];
      const px0 = this.pos.x, pz0 = this.pos.z;
      for (const b of env.buildings) {
        if (Math.abs(b.x - px0) > 90 || Math.abs(b.z - pz0) > 90) continue;
        this._nearBuildings.push(b);
        // is the ship over this roof, and is the roof below her?
        if (b.top === undefined || b.top > this.pos.y || b.top <= roof) continue;
        const ry = b.ry || 0;
        const hw = (b.rw !== undefined ? b.rw : b.w) / 2;
        const hd = (b.rd !== undefined ? b.rd : b.d) / 2;
        const cs = Math.cos(ry), sn = Math.sin(ry);
        const dx = px0 - b.x, dz = pz0 - b.z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) roof = b.top;
      }
    }

    // ground contact (B9) — measured from the ground, which over Monaco is a
    // mountain and not a plane, and over Paris is a roof as often as not.
    //
    // THE FLOOR USED TO BE THE TERRAIN ALONE. Buildings were consulted for the
    // guide rope eleven lines further down and never for the keel, so a ship
    // settling on a roof had nothing to settle onto: the collider in main.js
    // held her off the tiles and `landed` never came true, and she hung there
    // for ever. You could not put her down on the housetops at all — which is
    // the whole of 8 August 1901, and half of what this game is about.
    const floor = Math.max(this.groundUnder(this.pos.x, this.pos.z), roof);
    this.restingOnRoof = roof > -Infinity && roof >= floor;
    const keelClear = floor + this.restHeight();
    if (this.pos.y < keelClear) {
      if (this.vel.y < -6) { this.wreck('hardLanding'); return; }
      if (this.vel.y < -2.5) this.events.push('roughLanding');
      this.pos.y = keelClear;
      this.vel.y = Math.max(0, this.vel.y);
      this.vel.x *= Math.pow(0.2, dt); this.vel.z *= Math.pow(0.2, dt);
      this.landed = true;
    } else this.landed = this.pos.y < keelClear + 0.5;

    this.updateRope(dt);
    this.updateTransforms(dt);
  }

  updateTransforms(dt) {
    // the pulled cord dips and springs back, so a hand that grabs it sees the
    // thing move — without that a headset gives you no answer at all
    for (const c of (this.pullCords || [])) {
      if (c.lever) continue;                 // ALLUM. kicks on its own clock
      if (c.pulled > 0) {
        c.pulled = Math.max(0, c.pulled - dt * 2.4);
        c.mesh.position.y = c.rest.y - 0.09 * Math.sin(c.pulled * Math.PI);
      }
    }
    this.group.rotation.y = this.yaw;
    this.pitchGroup.rotation.z = this.pitch;
    const P = this.spec.physics;
    this.updateTrim();
    // gentle roll around the ship's own axis in turns (smoothed)
    this.roll = this.roll || 0;
    this.roll += ((-this.rudderInput * 0.07) - this.roll) * Math.min(1, 3 * dt);
    this.pitchGroup.rotation.x = this.roll;

    // ---- cockpit instruments ----
    // A rudder bar, not a boat's tiller: the cord that goes taut is the one whose
    // end is PUSHED away, so the hand on the side you are turning toward goes
    // forward — helm to port (positive input) sends the port end ahead, which
    // hauls the port side of the rudder round and swings her trailing edge to
    // port. Driving it the other way would have the bar fighting the rudder.
    this.wheelA = (this.wheelA || 0) + ((-this.rudderInput * 0.62) - (this.wheelA || 0)) * Math.min(1, 6 * dt);
    this.wheel.rotation.y = this.wheelA;
    this.updateTiller();
    // THE LEVER FOLLOWS THE HAND. rotation.z positive tips the knob AFT, so
    // written as -0.55 + throttle*0.9 the lever walked BACKWARD as the throttle
    // opened — and a hand pushing it forward watched it go the other way:
    // "they all move opposite of my hand movement". Forward is open.
    this.carbLever.rotation.z = 0.55 - this.throttle * 0.9;
    // POIDS reads the ship's own trim, so it moves whether the setting came
    // from the keyboard, the touch slider or a hand in a headset — one state,
    // one lever, and no way for the indicator to disagree with the ship
    // the stick swings with the helm, and the ball with the stick — one angle
    if (this.tillerGrip && this.tillerAt) {
      const a = this.wheel ? this.wheel.rotation.y : 0;
      if (this.tillerExt) this.tillerExt.rotation.y = a;
      const L = this.tillerExtLen * Math.cos(this.tillerRise);
      this.tillerGrip.position.set(this.tillerAt.x - L * Math.cos(a),
        this.tillerAt.y + this.tillerExtLen * Math.sin(this.tillerRise),
        L * Math.sin(a));
    }
    if (this.trimLever) {
      const pm = this.spec.physics.pitchMax || 1;
      this.trimLever.rotation.z = Math.max(-1, Math.min(1, this.pitch / pm)) * 0.55;
    }
    this.sparkT = Math.max(0, (this.sparkT || 0) - dt);
    this.sparkLever.rotation.z = 0.35 - (this.sparkT > 0 ? Math.sin(this.sparkT * 18) * 0.4 : 0);
    const altM = Math.max(0, this.pos.y - this.spec.keel.drop);
    // the needle sweeps CLOCKWISE with height, over the engraved metre scale
    this.baroNeedle.rotation.x = (Math.min(altM, 400) / 400) * 4.6;
    if (this._pennantAng !== undefined) {
      this.pennant.rotation.y = this._pennantAng - this.yaw + Math.sin(this._t * 4.2) * 0.1;
    }
    // needle points true north (-z), and the engraved card rides with it, so
    // the letter beneath the lubber index is the bearing you are steering
    this.compassNeedle.rotation.x = this.yaw - Math.PI / 2;
    this.compassCard.rotation.x = this.yaw - Math.PI / 2;
    for (let i = 0; i < this.sackMeshes.length; i++) this.sackMeshes[i].visible = i < this.bags;
    this.propAngle += (this.motorOn ? 4 + 40 * this.throttle * this.motorHealth : 0.3) * dt;
    for (const p of this.props) p.rotation.x = this.propAngle;
    // helm to port (positive input) swings the trailing edge to PORT
    if (this.rudder) this.rudder.rotation.y = -this.rudderInput * 0.5;
    this.shadow.position.set(this.pos.x, 0.5, this.pos.z);
    // the sun already casts a true shadow; this is only a soft contact hint,
    // so keep it faint or it reads as a black disc painted on the ground
    const so = clamp(0.15 * (1 - this.pos.y / 260), 0, 0.15);
    this.shadow.material.opacity = so;
  }

  /**
   * Two cords, each from one end of the tiller to its own side of the rudder's
   * leading edge. Both ends of every cord move, so they are laid out afresh
   * rather than parented to anything.
   */
  updateTiller() {
    if (!this.tillerCords || !this.rudder) return;
    // the OUTBOARD half, not the hands' half: the cords are bent on to the eyes
    // at the ends of the outriggers, clear of the basket
    const h = this.tillerCordHalf || this.tillerHalf, a = this.wheel.rotation.y;
    const w = this.wheel.position;
    const rp = this.rudder.position, ra = this.rudder.rotation.y;
    const ARM = 0.34;                      // where the cords take hold, off the rudder post
    const p = this.tillerCords.geometry.attributes.position.array;
    let i = 0;
    // a point at local (0, 0, d) carried round by rotation.y = t lands at
    // (d·sin t, 0, d·cos t) — the sine is POSITIVE, and negating it hung both
    // cords off points mirrored fore-and-aft of the ends they belong to
    for (const side of [-1, 1]) {
      p[i++] = w.x + Math.sin(a) * h * side;      // the tiller end, pivoting at its middle
      p[i++] = w.y;
      p[i++] = w.z + Math.cos(a) * h * side;
      p[i++] = rp.x + Math.sin(ra) * ARM * side;  // its own side of the rudder
      p[i++] = rp.y;
      p[i++] = rp.z + Math.cos(ra) * ARM * side;
    }
    this.tillerCords.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * One sack in at a time, as he worked them. Nose up means the FORE weight has
   * been hauled back toward the basket — that is the way round the book gives
   * it, and it is the opposite of what "haul the weight aft to lift the nose"
   * makes you picture, because the weight being moved aft is the one that was
   * out at the bow.
   */
  updateTrim() {
    if (!this.trim) return;
    const P = this.spec.physics;
    const f = Math.max(-1, Math.min(1, this.pitch / (P.pitchMax || 1)));
    const t = this.trim;
    t.fore.position.x = t.anchorX - Math.max(0, f) * t.travel;
    t.aft.position.x = -t.anchorX + Math.max(0, -f) * t.travel;
    // a sack hauled in swings a little off the vertical, being under way
    t.fore.rotation.z = Math.max(0, f) * 0.5;
    t.aft.rotation.z = -Math.max(0, -f) * 0.5;

    const p = this.trimCords.geometry.attributes.position.array;
    const basket = [0, -this.spec.keel.drop + 0.2, 0];
    let i = 0;
    for (const g of [t.fore, t.aft]) {
      const sx = g.position.x + Math.sin(g.rotation.z) * t.hang;
      const sy = g.position.y - Math.cos(g.rotation.z) * t.hang;
      // the cord it hangs by, from its anchor straight down
      p[i++] = g.position.x; p[i++] = t.anchorY; p[i++] = 0;
      p[i++] = sx; p[i++] = sy; p[i++] = 0;
      // and the lighter cord, running to the basket
      p[i++] = sx; p[i++] = sy; p[i++] = 0;
      p[i++] = basket[0]; p[i++] = basket[1]; p[i++] = basket[2];
    }
    this.trimCords.geometry.attributes.position.needsUpdate = true;
  }

  wreck(reason) {
    if (this.wrecked) return;
    this.wrecked = true;
    this.throttle = 0;
    this.events.push('wreck:' + reason);
  }

  /**
   * Put a man at the helm. FOR SOMEBODY ELSE'S SHIP ONLY — see makeAeronaut.
   *
   * He rides on pitchGroup at the deck point, so he leans with her and stands
   * where her floor is, whatever keel she has. On the No. 4 there is no floor:
   * the deck point there is set a crotch below the saddle, which is exactly
   * where a man astride a bicycle frame has his feet, so standing is the right
   * pose and no special case is needed.
   */
  addCrew() {
    if (this.crew || !this.deckPoint || !this.pitchGroup) return null;
    const fig = makeAeronaut();
    fig.position.copy(this.deckPoint.position);
    this.pitchGroup.add(fig);
    this.crew = fig;
    return fig;
  }

  dispose() {
    this.scene.remove(this.group, this.shadow, this.ropeLine);
    // hand the card back its buffers — a ship is rebuilt on every respawn
    const done = new Set();
    const kill = (r) => { if (r && !done.has(r)) { done.add(r); r.dispose?.(); } };
    for (const root of [this.group, this.shadow, this.ropeLine]) {
      root?.traverse?.((o) => {
        kill(o.geometry);
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) kill(m);
      });
      kill(root?.geometry); kill(root?.material);
    }
    this.ropeLine = null;
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
