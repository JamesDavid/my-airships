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
  for (const [ch, deg] of [['NE', 45], ['SE', 135], ['SO', 225], ['NO', 315]]) {
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
    this.wrecked = false;
    this.landed = true;
    this.foulTime = 0;
    this.fold = 0;
    this.gasPool = 0;
    this.fullness = 1;
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
    } else {
      const big = K.type === 'basket-long' ? 1.15 : 1;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.2 * big, 1.1 * big, 1.0 * big), wicker);
      basket.position.set(bx, -drop - 0.5, 0);
      this.pitchGroup.add(basket);
      this.basketMesh = basket;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.34 * big, 0.1, 1.14 * big),
        new THREE.MeshLambertMaterial({ color: 0x6f5a3a }));
      rim.position.set(bx, -drop + 0.05 * big, 0);
      this.pitchGroup.add(rim);
    }

    // ---- the operating position (B7: wheel, carburating lever, spark lever;
    //      plus barometer, compass, and the ballast sacks on the rim) ----
    // Laid out around the pilot's eye in "Aboard" view: eye ~(bx+0.1, -drop+0.5).
    const cream = new THREE.MeshLambertMaterial({ color: 0xf2ead6, emissive: 0x6b6355 });
    const needleMat = new THREE.MeshLambertMaterial({ color: 0x22180f });

    // steering wheel on a raked column, dead ahead at chest height (motored ships)
    this.wheel = new THREE.Group();
    if (prop !== 'none') {
      const colMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), dark);
      colMesh.position.set(bx + 0.72, -drop + 0.0, 0);
      colMesh.rotation.z = -0.5;
      this.pitchGroup.add(colMesh);
      const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 18), wood);
      this.wheel.add(wheelRing);
      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 4), wood);
        spoke.rotation.z = (i * Math.PI) / 4;
        this.wheel.add(spoke);
      }
      this.wheel.position.set(bx + 0.82, -drop + 0.17, 0);
      this.wheel.rotation.y = Math.PI / 2; // face the navigator
      this.pitchGroup.add(this.wheel);
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
      const quadrant = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.2), wood);
      quadrant.position.set(bx + 0.48, -drop + 0.18, 0.38);
      this.pitchGroup.add(quadrant);
      // the engraved plate naming the two levers, facing the operator
      if (!LEVER_PLATE) LEVER_PLATE = makeLeverPlate();
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.04),
        new THREE.MeshLambertMaterial({ map: LEVER_PLATE, emissive: 0x4a453c }));
      plate.rotation.y = -Math.PI / 2;
      plate.position.set(bx + 0.398, -drop + 0.18, 0.38);
      this.pitchGroup.add(plate);
      this.carbLever.position.set(bx + 0.48, -drop + 0.2, 0.33);
      this.pitchGroup.add(this.carbLever);
      this.sparkLever.position.set(bx + 0.48, -drop + 0.2, 0.43);
      this.pitchGroup.add(this.sparkLever);
    }
    this.sparkT = 0;

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

    // the shifting weight — a sack hauled fore/aft along the keel (Figs. 3, 8-9)
    this.weightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x83704f }));
    this.weightMesh.scale.y = 1.3;
    // runs on a cord outboard of the keel rail, clear of the basket
    this.weightMesh.position.set(0, -drop - 0.35, 0.85);
    this.pitchGroup.add(this.weightMesh);
    const motor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.8), dark);
    if (K.type === 'basket-long') motor.position.set(-1.05, -drop - 0.35, 0); // slung at the basket (Nos. 1-2)
    else motor.position.set(K.type === 'minimal' ? -1.6 : 2.2, -drop + 0.15, 0);
    if (prop === 'none') motor.visible = false; // the "Brazil" carries no motor
    this.pitchGroup.add(motor);

    // suspension wires
    const wirePts = [];
    const n = K.type === 'minimal' ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const fx = -K.length / 2 + (K.length / (n - 1)) * i;
      const ex = fx * 0.85;
      const eBottom = -this.envAt(ex) + 0.2;
      wirePts.push(ex, eBottom, 0, fx, -drop, 0);
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
    this.wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2119, transparent: true, opacity: 0.75 }));
    this.pitchGroup.add(this.wires);

    // propeller(s)
    this.props = [];
    const mkProp = (x) => {
      const holder = new THREE.Group();
      holder.position.set(x, -drop + 0.15, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.4, 0.5), new THREE.MeshLambertMaterial({ color: 0xd8cdb2 }));
      holder.add(blade);
      this.pitchGroup.add(holder);
      this.props.push(holder);
    };
    const sternX = K.type === 'basket-long' ? -1.95 : -K.length / 2 - 0.8; // Nos. 1-2: prop right at the basket
    if (prop === 'stern' || prop === 'both') mkProp(sternX);
    if (prop === 'bow' || prop === 'both') mkProp(K.length / 2 + 0.8);

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

    // pennant: "Por mares nunca d'antes navegados!" — it streams downwind
    const penGeo = new THREE.PlaneGeometry(2.6, 0.7);
    penGeo.translate(1.3, 0, 0); // pivot at the staff
    this.pennant = new THREE.Mesh(penGeo,
      new THREE.MeshLambertMaterial({ color: 0xb5442f, side: THREE.DoubleSide }));
    this.pennant.position.set(this.spec.envelope.length / 2 - 1, this.spec.envelope.diameter / 2 + 0.8, 0);
    this.pitchGroup.add(this.pennant);

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
      // rope rests on whatever is beneath it — pavement or rooftops (A1, B4)
      let floor = 0.15;
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

  // ------------------------------------------------------------ controls
  dropBallast() {
    if (this.bags > 0 && !this.wrecked) { this.bags--; this.events.push('ballast'); }
    else if (this.bags === 0) this.events.push('noballast');
  }

  // ------------------------------------------------------------ physics
  update(dt, input, wind, env) {
    const P = this.spec.physics;
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
      // the wreck settles on its own keel, and once down it IS down: `landed`
      // must become true or the pilot can never leave the ship again
      const rest = Math.max(1.5, -this.keelY * 0.4);
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
    this.motorOn = P.thrust > 0 && this.fuel > 0;
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

    // pressure (B6): fullness x heat x altitude expansion, + tail suction with speed
    const airspeedV = this.vel.clone().sub(windAt(wind, this.pos.y));
    const airspeed = Math.hypot(airspeedV.x, airspeedV.z);
    const fullness = (this.gas / 100) * this.heat;
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

    // ground contact (B9)
    const keelClear = -this.keelY + 1.2;
    if (this.pos.y < keelClear) {
      if (this.vel.y < -6) { this.wreck('hardLanding'); return; }
      if (this.vel.y < -2.5) this.events.push('roughLanding');
      this.pos.y = keelClear;
      this.vel.y = Math.max(0, this.vel.y);
      this.vel.x *= Math.pow(0.2, dt); this.vel.z *= Math.pow(0.2, dt);
      this.landed = true;
    } else this.landed = this.pos.y < keelClear + 0.5;

    // broadphase for the rope: buildings near the ship (rooftop draping)
    if (env.buildings) {
      this._nearBuildings = [];
      for (const b of env.buildings) {
        if (Math.abs(b.x - this.pos.x) < 90 && Math.abs(b.z - this.pos.z) < 90) this._nearBuildings.push(b);
      }
    }

    this.updateRope(dt);
    this.updateTransforms(dt);
  }

  updateTransforms(dt) {
    this.group.rotation.y = this.yaw;
    this.pitchGroup.rotation.z = this.pitch;
    // visible shifting weight: hauled AFT to point the nose up, and vice versa
    const P = this.spec.physics;
    this.weightMesh.position.x = -(this.pitch / (P.pitchMax || 1)) * this.spec.keel.length * 0.38;
    // gentle roll around the ship's own axis in turns (smoothed)
    this.roll = this.roll || 0;
    this.roll += ((-this.rudderInput * 0.07) - this.roll) * Math.min(1, 3 * dt);
    this.pitchGroup.rotation.x = this.roll;

    // ---- cockpit instruments ----
    this.wheelA = (this.wheelA || 0) + ((this.rudderInput * 2.2) - (this.wheelA || 0)) * Math.min(1, 5 * dt);
    this.wheel.rotation.x = this.wheelA;                     // wheel spins with the rudder
    this.carbLever.rotation.z = -0.55 + this.throttle * 0.9; // carburating lever = throttle
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
    const so = clamp(0.26 * (1 - this.pos.y / 350), 0, 0.26);
    this.shadow.material.opacity = so;
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
