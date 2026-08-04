// St. Louis, 1904 — the Louisiana Purchase Exposition (Ch. XXIV, PERIOD_NOTES).
// Santos-Dumont inspected the grounds in 1902 and proposed a short triangular
// course around three towers "so the Exposition public would see the flights
// from start to finish," with a grand prize of $100,000. Here it is: white
// Beaux-Arts palaces, the Grand Basin below Festival Hall, the Observation
// Wheel, and three flag pylons to round. Midday American summer light.

import * as THREE from 'three';
import { makeClouds, mulberry32, makePhysicalSky, makeShadowSun, makeWaterSurface, windify, windMats, makeFacadeTexture, makeStreamFlag } from './world.js';

const PAD = new THREE.Vector3(-900, 2, 60);
const START = new THREE.Vector3(-820, 55, 60);
// the three pylons you round (visual towers)…
const PYLONS = [
  new THREE.Vector3(-150, 0, -560),
  new THREE.Vector3(760, 0, -220),
  new THREE.Vector3(260, 0, 470),
];
// …and the race gates: rings set ~40 m OUTSIDE each pylon, so flying the
// hoop naturally rounds the tower (the ring is never on the pole itself)
const CENTROID = { x: 290, z: -103 };
const GATES = PYLONS.map((p) => {
  const dx = p.x - CENTROID.x, dz = p.z - CENTROID.z;
  const len = Math.hypot(dx, dz) || 1;
  return new THREE.Vector3(p.x + (dx / len) * 40, 58, p.z + (dz / len) * 40);
});

export function buildWorldStLouis(scene) {
  windMats.length = 0;
  // ---------- high summer noon: white light, blue sky ----------
  scene.fog = new THREE.FogExp2(0xdfe6e8, 0.00034);
  const sunDir = new THREE.Vector3(0.45, 0.8, -0.3).normalize();
  const sky = makePhysicalSky(scene, sunDir, { rayleigh: 0.9, turbidity: 3 });
  const hemi = new THREE.HemisphereLight(0xeaf2f6, 0x6f7a5c, 0.85);
  scene.add(hemi);
  const sun = makeShadowSun(scene, sunDir, 2.6);

  // ---------- fair grounds ----------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4500, 48),
    new THREE.MeshLambertMaterial({ color: 0x7e9159 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // white gravel plaza spine
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(1700, 220),
    new THREE.MeshLambertMaterial({ color: 0xcfc9b8 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.06, 0);
  scene.add(plaza);

  const buildings = [];
  const rand = mulberry32(1904);

  // ---------- the Grand Basin ----------
  const basin = makeWaterSurface(new THREE.PlaneGeometry(420, 150), sunDir, 0x2a4a5e);
  basin.rotation.x = -Math.PI / 2;
  basin.position.set(280, 0.32, 0);
  scene.add(basin);
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(450, 180),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }));
  rim.rotation.x = -Math.PI / 2; rim.position.set(280, 0.18, 0);
  scene.add(rim);

  // ---------- Festival Hall on Art Hill, at the basin's head ----------
  const white = new THREE.MeshLambertMaterial({ color: 0xefe9dc });
  const hill = new THREE.Mesh(new THREE.ConeGeometry(220, 46, 18),
    new THREE.MeshLambertMaterial({ color: 0x74884f }));
  hill.position.set(620, 23, 0); hill.receiveShadow = true;
  scene.add(hill);
  const fest = new THREE.Group();
  const festBase = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 26, 16), white);
  festBase.position.y = 13; fest.add(festBase);
  const festDome = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12),
    new THREE.MeshPhongMaterial({ color: 0xd9cfae, shininess: 70 }));
  festDome.position.y = 30; festDome.scale.y = 0.85; fest.add(festDome);
  const lantern = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 8), white);
  lantern.position.y = 62; fest.add(lantern);
  fest.position.set(620, 44, 0);
  fest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(fest);
  buildings.push({ x: 620, z: 0, w: 260, d: 260, h: 70, top: 70 });

  // ---------- the great white palaces, flanking the spine ----------
  const palaceSites = [
    [40, -220], [-260, -240], [420, -260], [40, 220], [-260, 240], [420, 260],
    [-560, -200], [-560, 210],
  ];
  for (const [px, pz] of palaceSites) {
    const w = 150 + rand() * 60, d = 80 + rand() * 30, h = 22 + rand() * 6;
    const pal = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    pal.position.set(px, h / 2, pz);
    pal.castShadow = pal.receiveShadow = true;
    scene.add(pal);
    const roofP = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 5, d * 0.9),
      new THREE.MeshLambertMaterial({ color: 0xb9b2a0 }));
    roofP.position.set(px, h + 2.5, pz);
    scene.add(roofP);
    // corner pavilion domes
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xd9cfae }));
      dome.position.set(px + sx * (w / 2 - 12), h + 4, pz + sz * (d / 2 - 12));
      dome.scale.y = 0.9;
      scene.add(dome);
    }
    buildings.push({ x: px, z: pz, w, d, h: h + 6, top: h + 8 });
  }

  // ---------- the Observation Wheel (the rebuilt 1893 giant) ----------
  const steel = new THREE.MeshLambertMaterial({ color: 0x4a443c });
  const wheel = new THREE.Group();
  for (const dz of [-4, 4]) {
    const rimW = new THREE.Mesh(new THREE.TorusGeometry(50, 1, 8, 40), steel);
    rimW.position.z = dz; wheel.add(rimW);
  }
  for (let i = 0; i < 14; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 100, 5), steel);
    spoke.rotation.z = (i * Math.PI) / 14;
    wheel.add(spoke);
  }
  for (let i = 0; i < 18; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 7),
      new THREE.MeshLambertMaterial({ color: 0x6a4a34 }));
    const a = (i / 18) * Math.PI * 2;
    car.position.set(Math.cos(a) * 50, Math.sin(a) * 50, 0);
    wheel.add(car);
  }
  wheel.position.y = 56;
  const roueGrp = new THREE.Group();
  roueGrp.add(wheel);
  for (const sx of [-1, 1]) for (const dz of [-4, 4]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 64, 6), steel);
    leg.position.set(sx * 16, 28, dz);
    leg.rotation.z = sx * 0.5;
    roueGrp.add(leg);
  }
  roueGrp.position.set(-350, 0, -330);
  roueGrp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(roueGrp);
  // collide only with the support legs — daring pilots may thread the wheel
  buildings.push({ x: -350, z: -330, w: 10, d: 12, h: 30, top: 30 });

  // ---------- the aeronautic concourse (start) ----------
  const hangar = new THREE.Group();
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(48, 15, 20),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }));
  hBody.position.set(-985, 7.5, 60); hangar.add(hBody);
  const hRoof = new THREE.Mesh(new THREE.BoxGeometry(50, 2.4, 22),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  hRoof.position.set(-985, 16, 60); hangar.add(hRoof);
  hangar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(hangar);
  buildings.push({ x: -985, z: 60, w: 48, d: 20, h: 17, top: 17 });

  // ---------- the three race pylons, each flying a big flag ----------
  const flags = [];
  for (const p of PYLONS) {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 76, 8), white);
    pylon.position.set(p.x, 38, p.z);
    pylon.castShadow = true;
    scene.add(pylon);
    const fl = makeStreamFlag(10, 5, 0xb5442f);
    fl.position.set(p.x, 78, p.z);
    scene.add(fl);
    flags.push(fl.userData.flag);
    buildings.push({ x: p.x, z: p.z, w: 7, d: 7, h: 76, top: 78 });
  }
  const homeFlag = makeStreamFlag(8, 4, 0x2b4a8c);
  homeFlag.position.set(PAD.x, 26, PAD.z + 30);
  scene.add(homeFlag);
  flags.push(homeFlag.userData.flag);

  // ---------- park trees ----------
  const trees = [];
  for (let i = 0; i < 500; i++) {
    const x = -1200 + rand() * 2300, z = -900 + rand() * 1800;
    if (Math.abs(z) < 140 && x > -700 && x < 550) continue; // spine + basin
    if (buildings.some((b) => Math.abs(b.x - x) < b.w * 0.7 && Math.abs(b.z - z) < b.d * 0.7)) continue;
    trees.push({ x, z, s: 2.6 + rand() * 3 });
  }
  const tGeo = new THREE.SphereGeometry(1, 7, 5); tGeo.translate(0, 0.6, 0);
  const tMesh = new THREE.InstancedMesh(tGeo, windify(new THREE.MeshLambertMaterial({ color: 0xffffff })), trees.length);
  const m = new THREE.Matrix4(); const col = new THREE.Color();
  trees.forEach((t, i) => {
    m.makeScale(t.s * 1.2, t.s, t.s * 1.2).setPosition(t.x, t.s * 0.5, t.z);
    tMesh.setMatrixAt(i, m);
    col.setHSL(0.29 + t.s * 0.008, 0.4, 0.32);
    tMesh.setColorAt(i, col);
  });
  tMesh.instanceColor.needsUpdate = true;
  tMesh.castShadow = true;
  scene.add(tMesh);

  const WINDB = new THREE.Vector3(2.6, 0, -1.7);
  const clouds = makeClouds(scene, WINDB);

  const tick = (dt) => { wheel.rotation.z += dt * 0.02; };

  return {
    name: 'St. Louis, 1904 — the World’s Fair',
    sun, sunDir, sky, waters: [basin], flags, tick,
    buildings, clouds, trees,
    towerPos: null, padPos: PAD,
    startRing: START, turnRing: GATES[0],
    gates: GATES,
    rivalSpecs: ['villedeparis', 'no6'],
    towSpots: [{ name: 'the Grand Basin plaza', pos: new THREE.Vector3(60, 0, 120) }],
    limitNote: 'the $100,000 grand prize',
    windBase: WINDB,
    raceLimit: 600, raceRecord: 540,
    vistaPos: new THREE.Vector3(620, 120, 60), // from Festival Hall
    hints: {
      idleNear: 'Press ENTER for the grand prize — three pylons, two rivals. (ships 1-7, 9, 0, B · L travels)',
      idleFar: 'Free flight — the start ring waits over the Aeronautic Concourse.',
      out: 'Round the pylons before the grandstands',
      back: 'Home to the Concourse — the crowd is on its feet',
      turnMsg: 'The last pylon is rounded! Now home before your rivals.',
    },
    isWater: (x, z) => x > 70 && x < 490 && Math.abs(z) < 75,
    isInBois: () => false,
  };
}
