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
// "I suggested that three great towers or flagstaffs be erected in the grounds
// at the corners of an EQUAL-SIDED triangle. The comparatively short course
// around them — between 10 and 20 miles — would afford a decisive test of
// dirigibility no matter in what way the wind might blow; while as for speed,
// the necessary average might be increased 50 per cent. over that fixed for the
// Deutsch prize" (Ch. XXIV). So: a true equilateral triangle, 500 m to each
// corner from the centre of the open ground, flown three times — 11.1 miles at
// full scale — and a limit set by that 50-per-cent-faster average.
const TRI_C = { x: 230, z: 60 }, TRI_R = 500, TRI_ROT = 0.7;
const PYLONS = [0, 1, 2].map((i) => {
  const a = -Math.PI / 2 + TRI_ROT + i * 2 * Math.PI / 3;
  return new THREE.Vector3(TRI_C.x + Math.cos(a) * TRI_R, 0, TRI_C.z + Math.sin(a) * TRI_R);
});
// …and the race gates: set ~40 m OUTSIDE each pylon, so flying the gate
// naturally rounds the tower (it is never on the pole itself). Each gate is a
// rectangle cut to the pylon it stands off — as tall as the pylon, half that
// wide, its sill a quarter of the pylon's height off the ground — so the frame
// reads against the mast's whole length instead of hanging beside it as a hoop.
const PYLON_H = 76;                       // the flagstaffs built below
const CENTROID = TRI_C;
const GATES = PYLONS.map((p) => {
  const dx = p.x - CENTROID.x, dz = p.z - CENTROID.z;
  const len = Math.hypot(dx, dz) || 1;
  return Object.assign(
    new THREE.Vector3(p.x + (dx / len) * 40, PYLON_H / 4 + PYLON_H / 2, p.z + (dz / len) * 40),
    { gw: PYLON_H / 2, gh: PYLON_H },
  );
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
  // Art Hill is a truncated mound with a level crown — Festival Hall's flat
  // base needs ground under all of it, not the point of a cone. The flat crown
  // is real: measured off the terrain tiles along the fair's grand axis, the
  // ground climbs from the Grand Basin and then goes level, which is why a
  // building could stand there at all.
  //
  // The HEIGHT was not. This was 46 m, which is nearly four times the hill.
  // The measured rise is 12.1 m of ground over 417 m, the climb all in the
  // first 230; the figure usually quoted for Art Hill is sixty feet, and the
  // difference between that and the measured twelve is the basin's water
  // against the ground at its lip, plus the museum's own terracing. Sixteen
  // sits inside that, and everything below is fitted to it.
  const HILL_H = 16, HILL_R = 220, CROWN_R = 96, HILL_X = 620;
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(CROWN_R, HILL_R, HILL_H, 18, 1),
    new THREE.MeshLambertMaterial({ color: 0x74884f }));
  hill.position.set(HILL_X, HILL_H / 2, 0); hill.receiveShadow = true;
  scene.add(hill);
  const crown = new THREE.Mesh(new THREE.CircleGeometry(96, 18),
    new THREE.MeshLambertMaterial({ color: 0x7c9055 }));
  crown.rotation.x = -Math.PI / 2; crown.position.set(HILL_X, HILL_H + 0.05, 0);
  crown.receiveShadow = true;
  scene.add(crown);
  const fest = new THREE.Group();
  const festBase = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 26, 16), white);
  festBase.position.y = 13; fest.add(festBase);
  const festDome = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12),
    new THREE.MeshPhongMaterial({ color: 0xd9cfae, shininess: 70 }));
  festDome.position.y = 30; festDome.scale.y = 0.85; fest.add(festDome);
  const lantern = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 8), white);
  lantern.position.y = 62; fest.add(lantern);
  fest.position.set(HILL_X, HILL_H - 2, 0);   // its base bedded into the crown
  fest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(fest);
  // the hall itself, not the whole hill: crown, then its own 28 m of dome
  buildings.push({ x: HILL_X, z: 0, w: 110, d: 110, h: HILL_H + 24, top: HILL_H + 28 });

  // ---------- the fan plan of 1904 (official ground plan): the palaces
  // radiate from Festival Hall's apex around the Grand Basin ----------
  const palaceSites = [
    [250, -210], [80, -330], [-150, -400],   // northeast arc
    [250, 210], [80, 330], [-150, 400],      // southwest arc
    [-420, -230], [-420, 230],               // the outer pair
  ];
  for (const [px, pz] of palaceSites) {
    const w = 150 + rand() * 50, d = 80 + rand() * 25, h = 22 + rand() * 6;
    // long axis tangent to the fan: perpendicular to the ray from the apex
    const rayAng = Math.atan2(-(0 - pz), 620 - px);
    const ry = rayAng + Math.PI / 2;
    const grpP = new THREE.Group();
    const pal = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    pal.position.y = h / 2; grpP.add(pal);
    const roofP = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 5, d * 0.9),
      new THREE.MeshLambertMaterial({ color: 0xb9b2a0 }));
    roofP.position.y = h + 2.5; grpP.add(roofP);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8),
          new THREE.MeshLambertMaterial({ color: 0xd9cfae }));
        dome.position.set(sx * (w / 2 - 12), h + 4, sz * (d / 2 - 12));
        dome.scale.y = 0.9;
        grpP.add(dome);
      }
    }
    grpP.position.set(px, 0, pz);
    grpP.rotation.y = ry;
    grpP.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    scene.add(grpP);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    buildings.push({ x: px, z: pz, w: w * c + d * s, d: w * s + d * c, h: h + 6, top: h + 8 });
  }

  // the radiating lagoon avenues of the fan
  const lagoons = [];   // remembered so the water is as wet as it looks
  for (const sideZ of [-1, 1]) {
    const ax1 = 60, az1 = 40 * sideZ, ax2 = -560, az2 = 360 * sideZ;
    const len = Math.hypot(ax2 - ax1, az2 - az1);
    const ang = Math.atan2(az2 - az1, ax2 - ax1);
    const ave = new THREE.Mesh(new THREE.PlaneGeometry(len, 30),
      new THREE.MeshLambertMaterial({ color: 0xcfc9b8 }));
    ave.rotation.x = -Math.PI / 2; ave.rotation.z = -ang;
    ave.position.set((ax1 + ax2) / 2, 0.08, (az1 + az2) / 2);
    scene.add(ave);
    const lagoon = makeWaterSurface(new THREE.PlaneGeometry(len * 0.7, 22), sunDir, 0x2a4a5e);
    lagoon.rotation.x = -Math.PI / 2; lagoon.rotation.z = -ang;
    lagoon.position.set((ax1 + ax2) / 2 + 6, 0.3, (az1 + az2) / 2 + 24 * sideZ);
    scene.add(lagoon);
    lagoons.push({ x: lagoon.position.x, z: lagoon.position.z, ang, len: len * 0.7, w: 22 });
  }

  // THE PIKE: the mile of midway attractions along the north edge
  const pikeColors = ['#c9a437', '#a05a40', '#5f8a74', '#8a6a9c', '#b5442f', '#d9cfae'];
  for (const rowZ of [-300, -362]) {
    let px = -690;
    while (px < -140) {
      const w = 16 + rand() * 14, d = 12 + rand() * 6, h = 7 + rand() * 6;
      if (Math.abs(px - -350) > 44 && rand() > 0.15) { // clear of the wheel's legs
        const att = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: pikeColors[Math.floor(rand() * pikeColors.length)] }));
        att.position.set(px, h / 2, rowZ);
        att.castShadow = true;
        scene.add(att);
        if (rand() < 0.3) {
          const twr = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8, 6),
            new THREE.MeshLambertMaterial({ color: '#e9e2d0' }));
          twr.position.set(px, h + 4, rowZ);
          scene.add(twr);
        }
        buildings.push({ x: px, z: rowZ, w, d, h, top: h + 1 });
      }
      px += w + 5 + rand() * 8;
    }
  }
  // the Pike's entrance arch at its east end
  const pikeArch = new THREE.Group();
  for (const s2 of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 6), white);
    pil.position.set(0, 9, s2 * 20); pikeArch.add(pil);
  }
  const lint = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 46), white);
  lint.position.y = 20; pikeArch.add(lint);
  pikeArch.position.set(-120, 0, -331);
  pikeArch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(pikeArch);

  // the Louisiana Purchase Monument on the plaza
  const mon = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 38, 10), white);
  shaft.position.y = 19; mon.add(shaft);
  const fig = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 6),
    new THREE.MeshPhongMaterial({ color: 0xc9a437, shininess: 90 }));
  fig.position.y = 40.5; mon.add(fig);
  mon.position.set(-140, 0, 60);
  mon.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(mon);
  buildings.push({ x: -140, z: 60, w: 6, d: 6, h: 43, top: 43 });

  // The Cascades spilling from Festival Hall to the Grand Basin — fitted to the
  // hill's actual face rather than written out, so they cannot be left hanging
  // in the air the next time its height is corrected. They run from the crown's
  // edge down to the foot of the mound, and the plane is as long as that slope
  // measures and tilted to match it.
  {
    const top = { x: HILL_X - CROWN_R, y: HILL_H };     // where the crown breaks
    const foot = { x: HILL_X - HILL_R, y: 0 };          // where the mound meets the level
    const run = top.x - foot.x, drop = top.y - foot.y;
    for (const cz of [-26, 0, 26]) {
      const casc = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(run, drop), 8),
        new THREE.MeshPhongMaterial({ color: 0x7fb0c9, shininess: 120, specular: 0xffffff }));
      casc.rotation.x = -Math.PI / 2 + Math.atan2(drop, run);
      casc.position.set((top.x + foot.x) / 2, (top.y + foot.y) / 2 + 0.3, cz);
      scene.add(casc);
    }
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

  // ---------- the Aeronautic Concourse ----------
  // Roughly fourteen fenced acres at the western edge, leased from the newly
  // relocated Washington University: the airship sheds, the judges' stand, and
  // the paling that kept the crowd off the field (PERIOD_NOTES.md).
  const shedMat = new THREE.MeshLambertMaterial({ color: 0xd6cdb6 });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b5236 });
  const CONC = { x: -900, z: 60, w: 250, d: 210 };
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(CONC.w, CONC.d),
    new THREE.MeshLambertMaterial({ color: 0x8a9464 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(CONC.x, 0.07, CONC.z);
  apron.receiveShadow = true;
  scene.add(apron);
  // the paling fence
  for (let i = 0; i <= 26; i++) {
    for (const [fx, fz] of [[CONC.x - CONC.w / 2 + (i / 26) * CONC.w, CONC.z - CONC.d / 2],
      [CONC.x - CONC.w / 2 + (i / 26) * CONC.w, CONC.z + CONC.d / 2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), postMat);
      post.position.set(fx, 1.2, fz);
      scene.add(post);
    }
  }
  for (let i = 0; i <= 22; i++) {
    for (const fx of [CONC.x - CONC.w / 2, CONC.x + CONC.w / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), postMat);
      post.position.set(fx, 1.2, CONC.z - CONC.d / 2 + (i / 22) * CONC.d);
      scene.add(post);
    }
  }
  // three sheds for the competing ships, and a judges' stand with its timing flag
  for (let i = 0; i < 3; i++) {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(58, 16, 20), shedMat);
    const sz = CONC.z - 62 + i * 62;
    shed.position.set(CONC.x - 60, 8, sz);
    shed.castShadow = true;
    scene.add(shed);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 22),
      new THREE.MeshLambertMaterial({ color: 0xa89a7c }));
    roof.position.set(CONC.x - 60, 17, sz);
    scene.add(roof);
    buildings.push({ x: CONC.x - 60, z: sz, w: 60, d: 22, h: 17, top: 18 });
  }
  const judges = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 12), shedMat);
  judges.position.set(CONC.x + 70, 4.5, CONC.z - 70);
  judges.castShadow = true;
  scene.add(judges);
  buildings.push({ x: CONC.x + 70, z: CONC.z - 70, w: 22, d: 12, h: 9, top: 10 });

  // ---------- the three race pylons, each flying a big flag ----------
  const flags = [];
  for (const p of PYLONS) {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, PYLON_H, 8), white);
    pylon.position.set(p.x, PYLON_H / 2, p.z);
    pylon.castShadow = true;
    scene.add(pylon);
    const fl = makeStreamFlag(10, 5, 0xb5442f);
    fl.position.set(p.x, PYLON_H + 2, p.z);
    scene.add(fl);
    flags.push(fl.userData.flag);
    buildings.push({ x: p.x, z: p.z, w: 7, d: 7, h: PYLON_H, top: PYLON_H + 2 });
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
    landmarks: [
      { id: 'festival', name: 'Festival Hall', x: 620, z: 0, y: 62, r: 60,
        clue: 'The domed hall at the head of the cascades, on the hill above the basin.' },
      { id: 'basin', name: 'the Grand Basin', x: 280, z: 0, y: 46, r: 90,
        clue: 'The long water in front of the palaces, with the lagoons running off it.' },
      { id: 'wheel', name: 'the Observation Wheel', x: -350, z: -330, y: 120, r: 60,
        clue: 'A wheel bigger than the one in Paris — the Basin Sprint threads it.' },
      { id: 'pike', name: 'The Pike', x: -120, z: -331, y: 46, r: 60,
        clue: 'A mile of midway: the arch at its head is where the barkers stand.' },
      { id: 'concourse', name: 'the Aeronautic Concourse', x: -900, z: 60, y: 44, r: 110,
        clue: 'The sheds and the judges’ stand, where the hundred thousand dollars waits.' },
    ],
    towerPos: null, padPos: PAD,
    startRing: START, turnRing: GATES[0],
    gates: GATES,
    rivalSpecs: ['villedeparis', 'no6'],
    towSpots: [{ name: 'the Grand Basin plaza', pos: new THREE.Vector3(60, 0, 120) }],
    limitNote: 'three laps at the pace he asked for — half again the Deutsch',
    windBase: WINDB,
    raceLimit: 1030, raceRecord: 950, raceLaps: 3,
    vistaPos: new THREE.Vector3(620, 78, 60), // from Festival Hall, on its true hill
    hints: {
      idleNear: 'The grand prize waits — three pylons, two rivals.',
      idleFar: 'Free flight — the race begins over the Aeronautic Concourse.',
      out: 'Round the pylons before the grandstands',
      back: 'Home to the Concourse — the crowd is on its feet',
      turnMsg: 'The last pylon is rounded! Now home before your rivals.',
    },
    // the Grand Basin AND the lagoon avenues — every sheet of water on the
    // ground plan will take a ship that comes down on it
    isWater: (x, z) => {
      // wet right out to the edge you can see (the plane spans x 70…490, |z| ≤ 75)
      if (x > 69.5 && x < 490.5 && Math.abs(z) < 75.5) return true;
      for (const l of lagoons) {
        const c = Math.cos(-l.ang), s = Math.sin(-l.ang);
        const dx = x - l.x, dz = z - l.z;
        if (Math.abs(dx * c - dz * s) < l.len / 2 + 0.5 && Math.abs(dx * s + dz * c) < l.w / 2 + 0.5) return true;
      }
      return false;
    },
    isInBois: () => false,
  };
}
