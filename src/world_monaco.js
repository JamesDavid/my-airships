// Monaco, winter 1902 (docs/BOOK_REFERENCE.md A9, A11): the bay of Monaco
// "sheltered from behind against the wind and cold by mountains", the aerodrome
// of La Condamine with its giant doors, the landing-stage over the surf, and the
// coastal run toward Cap Martin. Over the sea the guide rope becomes the perfect
// stabilizer — and landing IN the sea ends the experiments (Ch. XX).

import * as THREE from 'three';
import { makeClouds, mulberry32, makePhysicalSky, makeShadowSun, makeWaterSurface, windify, windMats } from './world.js';

const PAD = new THREE.Vector3(40, 2, 0);
const START = new THREE.Vector3(120, 42, 0);
const TURN = new THREE.Vector3(430, 55, -1380);
const SHORE_X = 26;

export function buildWorldMonaco(scene) {
  windMats.length = 0;
  // ---------- sky, light, fog (brighter, bluer Mediterranean morning) ----------
  scene.fog = new THREE.FogExp2(0xdfd4bc, 0.00038);
  const sunDir = new THREE.Vector3(0.9, 0.22, -0.35).normalize();
  makePhysicalSky(scene, sunDir, { rayleigh: 1.8, turbidity: 4 });
  const hemi = new THREE.HemisphereLight(0xfdeccd, 0x5f6a5a, 0.8);
  scene.add(hemi);
  const sun = makeShadowSun(scene, sunDir, 2.8);

  // ---------- the Mediterranean, alive and reflecting ----------
  const sea = makeWaterSurface(new THREE.PlaneGeometry(6000, 6000), sunDir, 0x1c3a52);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SHORE_X + 3000, 0.1, 0);
  scene.add(sea);

  // ---------- the land: a rising Riviera shelf ----------
  const land = new THREE.Mesh(new THREE.PlaneGeometry(3200, 6000),
    new THREE.MeshLambertMaterial({ color: 0x968f6e }));
  land.rotation.x = -Math.PI / 2;
  land.position.set(SHORE_X - 1600, 0.05, 0);
  land.receiveShadow = true;
  scene.add(land);
  // pebble shore strip
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(18, 6000),
    new THREE.MeshLambertMaterial({ color: 0xb5aa8e }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(SHORE_X - 2, 0.14, 0);
  scene.add(shore);

  const buildings = [];

  // ---------- the mountains that shelter the bay ----------
  const rand = mulberry32(31);
  const mountains = [
    [-420, -500, 380, 300], [-520, 100, 460, 420], [-380, 600, 340, 260],
    [-650, -250, 520, 380], [-300, -900, 300, 220], [-350, 1000, 320, 240],
    [-700, 700, 540, 300], [-250, 260, 260, 200],
  ];
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x7b7f66 });
  for (const [x, z, r, h] of mountains) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), rockMat);
    cone.position.set(x, h / 2, z);
    cone.rotation.y = rand() * 3;
    cone.castShadow = cone.receiveShadow = true;
    scene.add(cone);
    buildings.push({ x, z, w: r * 0.9, d: r * 0.9, h: h * 0.55, top: h * 0.55 });
  }

  // Monaco rock (south headland) and Cap Martin (down the coast)
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(120, 160, 60, 12), rockMat);
  rock.position.set(-30, 30, 420); scene.add(rock);
  buildings.push({ x: -30, z: 420, w: 220, d: 220, h: 62, top: 62 });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(200, 90, 12), rockMat);
  cap.position.set(320, 45, -1520); scene.add(cap);
  buildings.push({ x: 320, z: -1520, w: 260, d: 260, h: 60, top: 60 });

  // ---------- Monte Carlo terraces ----------
  const cream = ['#e3d3b5', '#dcc4a8', '#e8dcc2', '#d9c8ae'];
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0);
  const town = [];
  for (let gx = -40; gx >= -260; gx -= 34) {
    for (let gz = -160; gz >= -620; gz -= 34) {
      if (rand() < 0.25) continue;
      const x = gx + (rand() - 0.5) * 8, z = gz + (rand() - 0.5) * 8;
      const w = 18 + rand() * 9, d = 18 + rand() * 9, h = 9 + rand() * 8;
      town.push({ x, z, w, d, h, top: h + 2.5, r: rand() });
    }
  }
  // old town on the south side too
  for (let gx = -60; gx >= -200; gx -= 30) {
    for (let gz = 220; gz <= 560; gz += 30) {
      if (rand() < 0.35) continue;
      const x = gx + (rand() - 0.5) * 8, z = gz + (rand() - 0.5) * 8;
      const w = 15 + rand() * 8, d = 15 + rand() * 8, h = 8 + rand() * 6;
      town.push({ x, z, w, d, h, top: h + 2, r: rand() });
    }
  }
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), town.length);
  const roof = new THREE.InstancedMesh(bodyGeo.clone(), new THREE.MeshLambertMaterial({ color: 0xa05a40 }), town.length);
  const m = new THREE.Matrix4(); const col = new THREE.Color();
  town.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    body.setMatrixAt(i, m);
    col.set(cream[Math.floor(b.r * cream.length)]);
    body.setColorAt(i, col);
    m.makeScale(b.w * 0.9, 2.5, b.d * 0.9).setPosition(b.x, b.h, b.z);
    roof.setMatrixAt(i, m);
    buildings.push(b);
  });
  body.instanceColor.needsUpdate = true;
  body.castShadow = body.receiveShadow = true;
  roof.castShadow = true;
  scene.add(body, roof);

  // the Casino, on the Monte Carlo height
  const casino = new THREE.Group();
  const cBase = new THREE.Mesh(new THREE.BoxGeometry(50, 16, 30), new THREE.MeshLambertMaterial({ color: 0xe8dcc2 }));
  cBase.position.y = 8; casino.add(cBase);
  for (const s of [-1, 1]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8),
      new THREE.MeshPhongMaterial({ color: 0x7a9c74, shininess: 60 }));
    dome.position.set(s * 16, 18, 0); dome.scale.y = 1.2; casino.add(dome);
  }
  casino.position.set(-130, 0, -300);
  scene.add(casino);
  buildings.push({ x: -130, z: -300, w: 50, d: 30, h: 22, top: 22 });

  // ---------- the aerodrome of La Condamine, with its giant doors ----------
  const hangar = new THREE.Group();
  const hMat = new THREE.MeshLambertMaterial({ color: 0xd8cfb8 });
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(58, 16, 13), hMat);
  hBody.position.set(-22, 8, 0); hangar.add(hBody);
  const hRoof = new THREE.Mesh(new THREE.BoxGeometry(60, 2.2, 15),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  hRoof.position.set(-22, 17, 0); hangar.add(hRoof);
  // the famous doors, each 15 m tall — rolled apart by two small princes
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 15, 5.6),
      new THREE.MeshLambertMaterial({ color: 0x4a3a2c }));
    door.position.set(7.5, 7.5, s * 5.6);
    hangar.add(door);
  }
  hangar.position.set(-30, 0, 0);
  scene.add(hangar);
  buildings.push({ x: -52, z: 0, w: 58, d: 13, h: 18, top: 18 });

  // the landing-stage, on piles out into the surf (built after 12 days' work)
  const stage = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 26),
    new THREE.MeshLambertMaterial({ color: 0x9a7d54 }));
  stage.position.set(38, 1.2, 0);
  scene.add(stage);
  for (let i = 0; i < 8; i++) {
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b5236 }));
    pile.position.set(24 + (i % 4) * 10, -0.5, i < 4 ? -11 : 11);
    scene.add(pile);
  }

  // ---------- yachts in the bay — anchored head-to-wind, a pilot's wind vane ----------
  const WINDB = new THREE.Vector3(0.4, 0, 3.2);
  const headToWind = Math.atan2(WINDB.z, -WINDB.x);
  for (let i = 0; i < 6; i++) {
    scene.add(makeYacht(120 + rand() * 220, -220 + rand() * 440, rand(), headToWind + (rand() - 0.5) * 0.3));
  }
  scene.add(makeSteamer(200, 160));

  // the steamer's smoke streams downwind (the book's own "Wind A / Wind B" cue)
  const smokeBase = new THREE.Vector3(202, 6.5, 158.5);
  const puffMatS = new THREE.MeshLambertMaterial({ color: 0x9a938a, transparent: true, opacity: 0.32, depthWrite: false });
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), puffMatS.clone());
    scene.add(s);
    puffs.push(s);
  }
  const tick = (dt, t, wind) => {
    const wLen = Math.hypot(wind.x, wind.z) || 1;
    const wx = wind.x / wLen, wz = wind.z / wLen;
    puffs.forEach((p, i) => {
      const u = ((t * 0.13 + i / 7) % 1);
      p.position.set(smokeBase.x + wx * u * 55, smokeBase.y + u * 20, smokeBase.z + wz * u * 55);
      p.scale.setScalar(0.9 + u * 4.5);
      p.material.opacity = 0.34 * (1 - u);
    });
  };

  // ---------- olive scrub on the slopes ----------
  const scrub = [];
  for (let i = 0; i < 300; i++) {
    const x = -30 - rand() * 300, z = -700 + rand() * 1500;
    if (town.some(b => Math.abs(b.x - x) < b.w * 0.7 && Math.abs(b.z - z) < b.d * 0.7)) continue;
    scrub.push({ x, z, s: 1.6 + rand() * 1.8 });
  }
  const sGeo = new THREE.SphereGeometry(1, 6, 5); sGeo.translate(0, 0.6, 0);
  const sMesh = new THREE.InstancedMesh(sGeo, windify(new THREE.MeshLambertMaterial({ color: 0x5d6b46 })), scrub.length);
  scrub.forEach((t, i) => {
    m.makeScale(t.s, t.s * 0.8, t.s).setPosition(t.x, 0, t.z);
    sMesh.setMatrixAt(i, m);
  });
  scene.add(sMesh);

  const clouds = makeClouds(scene);

  return {
    name: 'Monaco, winter 1902',
    sun, sunDir, waters: [sea], flags: [], tick,
    buildings, clouds, trees: scrub,
    towerPos: null, padPos: PAD,
    startRing: START, turnRing: TURN,
    vistaPos: new THREE.Vector3(-160, 120, -320), // from the Monte Carlo terraces
    windBase: new THREE.Vector3(0.4, 0, 3.2),     // down the coast: headwind out, flying home
    raceLimit: 300, raceRecord: 295,
    hints: {
      idleNear: 'Press ENTER for the flight to Cap Martin. (1-7, 9, 0, B change ships · L: Paris)',
      idleFar: 'Free flight — the start ring waits over the landing-stage of La Condamine.',
      out: 'Down the coast to Cap Martin — into the teeth of the breeze. Guide-rope low over the waves.',
      back: 'Home to the bay of Monaco — the wind behind you now.',
      turnMsg: 'Round Cap Martin! “The air-ship swung round like a boat” — now home on the wind, like an eagle.',
    },
    // the landing-stage rectangle is dry footing amid the surf
    isWater: (x, z) => x > SHORE_X + 2 && !(x < 64 && Math.abs(z) < 15),
    isInBois: () => false,
  };
}

function makeSky() {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, '#efd9b2');
  grad.addColorStop(0.4, '#cfd3c2');
  grad.addColorStop(1, '#7fa3c8');
  g.fillStyle = grad; g.fillRect(0, 0, 1, 256);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 12),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  return dome;
}

function makeYacht(x, z, r, heading) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 2.2),
    new THREE.MeshLambertMaterial({ color: r > 0.5 ? 0xe9e4d6 : 0x4a3b2e }));
  hull.position.y = 0.8; g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b5236 }));
  mast.position.y = 5.2; g.add(mast);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0); sailShape.lineTo(0, 7); sailShape.lineTo(3.2, 0.4); sailShape.lineTo(0, 0);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape),
    new THREE.MeshLambertMaterial({ color: 0xf2ead6, side: THREE.DoubleSide }));
  sail.position.set(0.1, 1.8, 0);
  g.add(sail);
  g.position.set(x, 0, z);
  g.rotation.y = heading !== undefined ? heading : r * 6.28;
  return g;
}

function makeSteamer(x, z) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 3.6),
    new THREE.MeshLambertMaterial({ color: 0x2e2620 }));
  hull.position.y = 1.1; g.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 1.8, 2.6),
    new THREE.MeshLambertMaterial({ color: 0xd8cfb8 }));
  cabin.position.set(-1, 2.9, 0); g.add(cabin);
  // the smoke-stack that belched red-hot sparks beneath his balloon
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3.4, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6a30 }));
  stack.position.set(2.5, 4.5, 0); g.add(stack);
  g.position.set(x, 0, z);
  g.rotation.y = 0.6;
  return g;
}
