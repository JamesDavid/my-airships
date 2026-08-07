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
  x.font = 'bold 30px Georgia, serif';
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  PLACARDS[text] = t;
  return t;
}

/** Hang a placard beside a fitting, facing the pilot. */
function placard(parent, text, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0375),
    new THREE.MeshLambertMaterial({ map: makePlacard(text), emissive: 0x4a453c,
      side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = -Math.PI / 2;
  parent.add(m);
  return m;
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
    this.pitch = 0; this.pitchTarget = 0;
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
    const addRail = (y, dz, len, r) => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), wood);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, y, dz);
      this.pitchGroup.add(rail);
    };
    if (K.type === 'truss' || K.type === 'saddle' || K.type === 'double') {
      // triangular truss (Nos. 4-7, 10) — thin open girder of pine and piano wire
      const r = K.type === 'saddle' ? 0.06 : 0.09;
      addRail(-drop, -0.7, K.length, r);
      addRail(-drop, 0.7, K.length, r);
      addRail(-drop + 1.1, 0, K.length, r);
    } else if (K.type === 'minimal') {
      // the No. 9's little frame — "the keel barely longer than the basket" —
      // a light pair of rails with cross-pieces, carrying basket and motor.
      // Without them her gear hung in mid-air under the egg.
      addRail(-drop, -0.5, K.length, 0.05);
      addRail(-drop, 0.5, K.length, 0.05);
      addRail(-drop + 0.55, 0, K.length * 0.8, 0.04);
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
    }

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
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, HALF * 2, 6), wood);
      bar.rotation.x = Math.PI / 2;          // lying across the ship, along Z
      this.wheel.add(bar);
      for (const sz of [-1, 1]) {            // a turned grip at either end
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 6), wood);
        grip.rotation.x = Math.PI / 2;
        grip.position.z = sz * (HALF - 0.05);
        this.wheel.add(grip);
      }
      this.wheel.position.set(bx + 0.74, -drop + 0.26, 0);
      this.pitchGroup.add(this.wheel);
      this.tillerHalf = HALF;
      // AN EXTENSION, reaching back to the hand.
      //
      // The bar belongs at the front of the basket, where it is clear of
      // everything and out of the eye-line; but that is 0.81 m from the pilot,
      // past the end of an arm. Bringing the bar itself back put it through the
      // middle of the ship. So it gets what a dinghy's tiller gets: a stick
      // jointed at the middle of the bar and lying back toward the helmsman,
      // which you hold and swing across to put the helm over.
      const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.34, 6), wood);
      ext.geometry.translate(-0.17, 0, 0);        // jointed at the bar's centre
      ext.rotation.z = 0.20;                      // lying back and a little up
      this.wheel.add(ext);
      const eknob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
      eknob.position.set(-0.34, 0, 0);
      ext.add(eknob);
      this.tillerExt = ext;
      this.tillerExtLen = 0.34;
      // The grab point is carried by a marker hung DIRECTLY under pitchGroup
      // and moved each frame, rather than by the stick itself. Two reasons: the
      // stick is two levels deep and swings with the helm, and a fitting whose
      // world position can only be had by walking a matrix chain is a fitting
      // nothing here can check — tools/sim.mjs measured this one at 7.99 m from
      // the eye and was believed for about a minute.
      this.tillerGrip = new THREE.Object3D();
      this.tillerGrip.position.set(bx + 0.74 - 0.34, -drop + 0.26, 0);
      this.pitchGroup.add(this.tillerGrip);
      this.tillerAt = { x: bx + 0.74, y: -drop + 0.26 };
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
    baro.position.set(bx + 0.5, -drop + 0.3, -0.2);
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
    compass.position.set(bx + 0.5, -drop + 0.3, 0.2);
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
        // A SINGLE LETTER. LEST and SOUPAPE are the right words and the wrong
        // size: at arm's length on a plate the width of a hand they are a
        // smudge. B for ballast, V for the valve, big enough to read at a
        // glance while you are busy flying.
        placard(this.pitchGroup, id === 'ballast' ? 'B' : 'V',
          bot.x + 0.10, bot.y + 0.20, bot.z);
        this.pullCords.push({ id, mesh: tog, rest: bot.clone(), pulled: 0 });
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
      slate.position.set(bx + 0.30, -drop - 0.03, 0);
      slate.rotation.y = -Math.PI / 2;
      this.pitchGroup.add(slate);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.19),
        new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true }));
      pm.rotation.x = -0.55;                 // tipped up toward the eye
      pm.position.z = 0.004;                 // ...and proud of its own frame
      slate.add(pm);
      this.panelMesh = slate;
      slate.visible = false;                 // only in a headset
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.22, 0.012),
        new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
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
        wirePts.push(ex, h.y, sz * h.z, fx, -drop, 0);
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
      mkEngine(x + facing * 1.35, facing);      // her motor, right behind the screw
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
  drawPanel(lines, note) {
    const key = JSON.stringify(lines) + '|' + (note || '');
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
    let y = 42;
    for (const [label, value] of lines) {
      g.fillStyle = '#a99878';
      g.font = '22px Georgia, serif';
      g.fillText(String(label).toUpperCase(), 26, y);
      g.fillStyle = '#f0e2c2';
      g.font = 'bold 30px Georgia, serif';
      g.textAlign = 'right';
      g.fillText(String(value), c.width - 26, y);
      g.textAlign = 'left';
      y += 42;
    }
    if (note) {
      g.fillStyle = '#e8c477';
      g.font = 'italic 20px Georgia, serif';
      const words = String(note).split(' ');
      let line = '', ly = Math.max(y + 14, c.height - 76);
      for (const wd of words) {
        if (g.measureText(line + wd).width > c.width - 52) {
          g.fillText(line, 26, ly); line = ''; ly += 26;
          if (ly > c.height - 20) break;
        }
        line += wd + ' ';
      }
      if (ly <= c.height - 20) g.fillText(line, 26, ly);
    }
    this.panelTex.needsUpdate = true;
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
    this.rudderInput = input.rudder;
    this.pitchTarget = input.pitch * P.pitchMax;
    // a folding hull answers the shifting weights sluggishly
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, 1.6 * dt * (1 - (this.fold || 0) * 0.6));
    // impact-induced rotation, decaying
    this.pitchKick = (this.pitchKick || 0) * Math.pow(0.15, dt);
    this.pitch += this.pitchKick * dt * 12;

    // (B8 gas-rush rearing lives in the structural section below,
    //  where fullness is known)

    // the pennant reads the apparent wind (true wind minus our own motion)
    const appWind = windAt(wind, this.pos.y).sub(this.vel);
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
    const airspeedV = this.vel.clone().sub(windAt(wind, this.pos.y));
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
    // rope ground drag (B4: the brake)
    acc.addScaledVector(fwdFlat, -this.groundedFrac * 0.06 * vf * Math.abs(vf));

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

    // B5: tangage — bob in the 25-45 km/h airspeed band, worse against the wind
    const kmh = airspeed * 3.6;
    const band = Math.max(0, 1 - Math.abs(kmh - 33) / 18);
    const headwind = Math.max(0, -airspeedV.clone().normalize().dot(windAt(wind, this.pos.y).normalize() || 0)) || 0;
    acc.y += Math.sin(this._t * 2.1) * band * (0.25 + 0.25 * headwind);

    // integrate
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // yaw — the rudder works on the airflow over the tail: sternway REVERSES
    // the helm, and only a stern propeller's slipstream steers you at rest
    const wash = this.motorOn && (this.spec.prop === 'stern' || this.spec.prop === 'both')
      ? this.throttle * this.motorHealth * 4 : 0;
    const steerAuth = clamp((vf + wash) / 9, -1, 1) * (1 - this.fold * 0.55);
    this.yawVel += input.rudder * P.yawRate * steerAuth * dt * 1.1;
    this.yawVel *= Math.pow(0.25, dt);
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
    this.carbLever.rotation.z = -0.55 + this.throttle * 0.9; // carburating lever = throttle
    // POIDS reads the ship's own trim, so it moves whether the setting came
    // from the keyboard, the touch slider or a hand in a headset — one state,
    // one lever, and no way for the indicator to disagree with the ship
    // the tiller stick swings with the helm, and its grab point with it
    if (this.tillerGrip && this.tillerAt) {
      const a = this.wheel ? this.wheel.rotation.y : 0;
      const L = this.tillerExtLen * Math.cos(0.20);
      this.tillerGrip.position.set(this.tillerAt.x - L * Math.cos(a),
        this.tillerAt.y + this.tillerExtLen * Math.sin(0.20),
        L * Math.sin(a));
    }
    if (this.trimLever) {
      const pm = this.spec.physics.pitchMax || 1;
      this.trimLever.rotation.z = -Math.max(-1, Math.min(1, this.pitch / pm)) * 0.55;
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
    const h = this.tillerHalf, a = this.wheel.rotation.y;
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
