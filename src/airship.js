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
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.088, 14), cream);
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
    const card = new THREE.Mesh(new THREE.CircleGeometry(0.088, 14), cream);
    card.rotation.y = -Math.PI / 2;
    card.position.x = -0.03;
    compass.add(card);
    this.compassNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.078, 0.02),
      new THREE.MeshLambertMaterial({ color: 0x8c2f1e, emissive: 0x3a130b }));
    this.compassNeedle.geometry.translate(0, 0.033, 0);
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
      this.rudder = new THREE.Mesh(new THREE.ShapeGeometry(rShape),
        new THREE.MeshLambertMaterial({ color: 0xefe8d6, side: THREE.DoubleSide }));
      this.rudder.rotation.x = Math.PI / 2;
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
      // deflate and settle
      this.envMesh.scale.y = Math.max(0.18 * this.envBaseScale.y, this.envMesh.scale.y - dt * 2.2);
      this.envMesh.scale.z = Math.max(0.25 * this.envBaseScale.z, this.envMesh.scale.z - dt * 1.8);
      this.vel.multiplyScalar(0.97);
      this.vel.y -= 6 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < 3) { this.pos.y = 3; this.vel.set(0, 0, 0); }
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
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, 1.6 * dt);
    // impact-induced rotation, decaying
    this.pitchKick = (this.pitchKick || 0) * Math.pow(0.15, dt);
    this.pitch += this.pitchKick * dt * 12;

    // B8: gas-rush rearing when starved + steeply pitched (no partitions)
    if (!P.partitions && this.gas < 70 && Math.abs(this.pitch) > 0.2) {
      const inst = ((70 - this.gas) / 70) * 0.3;
      this.pitch += Math.sign(this.pitch) * inst * dt;
      this.pitch = clamp(this.pitch, -0.9, 0.9);
      if (Math.abs(this.pitch) > P.pitchMax * 1.6) this.events.push('rearing');
    }

    // the pennant reads the apparent wind (true wind minus our own motion)
    const appWind = windAt(wind, this.pos.y).sub(this.vel);
    this._pennantAng = Math.atan2(-appWind.z, appWind.x);

    // heat: cloud shadow and forest cooling (A2, A4)
    let heatTarget = 1.0;
    if (env.underCloud) heatTarget = 0.93;
    else if (env.inBois && this.pos.y < 120) heatTarget = 0.955;
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

    // envelope sag visual + wire fouling (B6)
    const sagThresh = 0.78 - P.foldResist * 0.33;
    const sag = fullness < sagThresh;
    const rScale = 0.86 + 0.14 * clamp(fullness * 1.15, 0.4, 1);
    const wrinkle = sag ? 1 + Math.sin(this._t * 14) * 0.012 : 1;
    this.envMesh.scale.set(this.envBaseScale.x, this.envBaseScale.y * rScale * wrinkle, this.envBaseScale.z * rScale);
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
    acc.addScaledVector(fwdFlat, -(P.dragQ * vf * Math.abs(vf) + P.dragL * vf));
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

    // buoyancy
    const density = Math.max(0.55, 1 - this.pos.y / 4000);
    const lift = P.gasLift * (this.gas / 100) * this.heat * density
      + this.groundedFrac * P.ropeLift;                    // B4 auto-ballast
    // burning petroleum lightens the ship — the slow drift upward of a long flight
    const fuelWeight = P.fuel ? (this.fuel / P.fuel) * 0.06 : 0;
    const weight = P.weightBase + this.bags * P.bagLift + fuelWeight;
    let vAcc = lift - weight;
    vAcc -= 1.1 * airspeedV.y + 0.4 * airspeedV.y * Math.abs(airspeedV.y);
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
    const steerAuth = clamp((vf + wash) / 9, -1, 1);
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
    this.baroNeedle.rotation.x = -(Math.min(altM, 400) / 400) * 4.6; // barometer = altitude
    if (this._pennantAng !== undefined) {
      this.pennant.rotation.y = this._pennantAng - this.yaw + Math.sin(this._t * 4.2) * 0.1;
    }
    // needle points true north (-z). Dial reads clockwise-from-ahead:
    // facing east (yaw 0), north is 90° to port, so the needle leans left.
    this.compassNeedle.rotation.x = this.yaw - Math.PI / 2;
    for (let i = 0; i < this.sackMeshes.length; i++) this.sackMeshes[i].visible = i < this.bags;
    this.propAngle += (this.motorOn ? 4 + 40 * this.throttle * this.motorHealth : 0.3) * dt;
    for (const p of this.props) p.rotation.x = this.propAngle;
    if (this.rudder) this.rudder.rotation.z = this.rudderInput * 0.5;
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
    this.ropeLine = null;
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
