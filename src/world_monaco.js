// Monaco, winter 1902 (docs/BOOK_REFERENCE.md A9, A11): the bay of Monaco
// "sheltered from behind against the wind and cold by mountains", the aerodrome
// of La Condamine with its giant doors, the landing-stage over the surf, and the
// coastal run toward Cap Martin. Over the sea the guide rope becomes the perfect
// stabilizer — and landing IN the sea ends the experiments (Ch. XX).

import * as THREE from 'three';
import { makeClouds, mulberry32, makePhysicalSky, makeShadowSun, makeWaterSurface, windify, windMats, makeFacadeTexture, generateFrontages, addBuildingMeshes } from './world.js';
import { STREETS_MC, inSiteMC } from './monaco_plan.js';

const PAD = new THREE.Vector3(40, 2, 0);
const START = new THREE.Vector3(120, 42, 0);
// Cap Martin at half real scale — held far enough off the headland that the
// whole ring is over open water (the massif's collider reaches x 550, z -2570)
const TURN = new THREE.Vector3(620, 58, -2520);
const SHORE_X = 26;

export function buildWorldMonaco(scene) {
  windMats.length = 0;
  // ---------- sky, light, fog (brighter, bluer Mediterranean morning) ----------
  scene.fog = new THREE.FogExp2(0xdfd4bc, 0.00038);
  const sunDir = new THREE.Vector3(0.9, 0.22, -0.35).normalize();
  const sky = makePhysicalSky(scene, sunDir, { rayleigh: 1.8, turbidity: 4 });
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

  // the Tete de Chien — the great promontory that overlooks the principality
  const tete = new THREE.Group();
  const teteBase = new THREE.Mesh(new THREE.ConeGeometry(420, 520, 16), rockMat);
  teteBase.position.y = 260; tete.add(teteBase);
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(90, 130, 190, 10),
    new THREE.MeshLambertMaterial({ color: 0x8a8874 }));
  cliff.position.set(140, 330, 0); tete.add(cliff);
  tete.position.set(-620, 0, -60);
  tete.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  scene.add(tete);
  buildings.push({ x: -620, z: -60, w: 620, d: 620, h: 300, top: 300 });

  // Monaco rock (south headland) and Cap Martin (down the coast)
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(120, 160, 60, 12), rockMat);
  rock.position.set(-30, 30, 420); scene.add(rock);
  buildings.push({ x: -30, z: 420, w: 220, d: 220, h: 62, top: 62 });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(240, 100, 12), rockMat);
  cap.position.set(400, 50, -2720); scene.add(cap);
  buildings.push({ x: 400, z: -2720, w: 300, d: 300, h: 66, top: 66 });

  // ---------- the town along its real streets (monaco_plan.js) ----------
  for (const st of STREETS_MC) {
    const col2 = st.rail ? 0x4a4238 : st.dirt ? 0x8f8a6a : 0x9a9285;
    for (let i = 0; i < st.pts.length - 1; i++) {
      const [ax, az] = st.pts[i], [bx2, bz2] = st.pts[i + 1];
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.hypot(bx2 - ax, bz2 - az), st.w),
        new THREE.MeshLambertMaterial({ color: col2 }));
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = -Math.atan2(bz2 - az, bx2 - ax);
      strip.position.set((ax + bx2) / 2, 0.12, (az + bz2) / 2);
      scene.add(strip);
    }
  }
  const cream = ['#e3d3b5', '#dcc4a8', '#e8dcc2', '#d9c8ae', '#e2c8b0'];
  const canPlaceMC = (x, z) => !inSiteMC(x, z) && x < 22;
  const town = generateFrontages(STREETS_MC, canPlaceMC, rand,
    { hMin: 9, hVar: 8, wMin: 14, wVar: 9, dMin: 12, dVar: 7 });
  // the old town packed on the Rock's shoulder
  for (let gx = -80; gx >= -190; gx -= 28) {
    for (let gz = 250; gz <= 560; gz += 28) {
      if (rand() < 0.35) continue;
      const x = gx + (rand() - 0.5) * 8, z = gz + (rand() - 0.5) * 8;
      if (inSiteMC(x, z)) continue;
      const w = 14 + rand() * 8, d = 14 + rand() * 8, h = 8 + rand() * 6, r = rand();
      town.push({ x, z, w, d, h, rw: w, rd: d, ry: rand() * 0.5, r, nChim: 1 });
    }
  }
  addBuildingMeshes(scene, town, (b, col3) => col3.set(cream[Math.floor(b.r * cream.length) % cream.length]));
  for (const b of town) buildings.push(b);

  // the Prince's Palace on the Rock, the Cathedral, and Sainte-Dévote
  const palace = new THREE.Group();
  const pMat = new THREE.MeshLambertMaterial({ color: 0xe6d9c0 });
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(46, 14, 30), pMat);
  pBody.position.y = 7; palace.add(pBody);
  for (const [tx, tz] of [[-20, -12], [20, -12], [-20, 12], [20, 12]]) {
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 20, 8), pMat);
    tw.position.set(tx, 10, tz); palace.add(tw);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.8, 5, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a3a28 }));
    cap.position.set(tx, 22.5, tz); palace.add(cap);
  }
  palace.position.set(-55, 60, 400);
  palace.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(palace);
  const cath = new THREE.Group();
  const cBody2 = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 16), pMat);
  cBody2.position.y = 6; cath.add(cBody2);
  const cDome = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xb9ad93 }));
  cDome.position.y = 14; cDome.scale.y = 1.1; cath.add(cDome);
  cath.position.set(0, 60, 455);
  cath.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(cath);
  const chapel = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 7),
    new THREE.MeshLambertMaterial({ color: 0xe8dcc2 }));
  chapel.position.set(-95, 4, 42);
  chapel.castShadow = true;
  scene.add(chapel);
  buildings.push({ x: -95, z: 42, w: 10, d: 7, h: 8, top: 9 });

  // the first jetty works of Port Hercule
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 90),
    new THREE.MeshLambertMaterial({ color: 0xa39a86 }));
  jetty.position.set(90, 1, 330);
  jetty.rotation.y = -0.5;
  scene.add(jetty);
  buildings.push({ x: 90, z: 330, w: 50, d: 90, h: 3, top: 4 });

  // the Casino (Garnier) — cream palace, seaside cupola towers, the 1900 clock
  const casino = new THREE.Group();
  const creamMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc2 });
  const copper = new THREE.MeshPhongMaterial({ color: 0x5f8a74, shininess: 60 });
  const cBase = new THREE.Mesh(new THREE.BoxGeometry(54, 18, 32), creamMat);
  cBase.position.y = 9; casino.add(cBase);
  for (const s of [-1, 1]) {
    const twr = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 26, 10), creamMat);
    twr.position.set(20, 13, s * 13); casino.add(twr);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(5.5, 10, 8), copper);
    cup.position.set(20, 28, s * 13); cup.scale.y = 1.25; casino.add(cup);
  }
  const cRoof = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 24), copper);
  cRoof.position.y = 20; casino.add(cRoof);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 12),
    new THREE.MeshLambertMaterial({ color: 0xf4eee0, emissive: 0x5a5648 }));
  clock.position.set(27.1, 12, 0); clock.rotation.y = Math.PI / 2; casino.add(clock);
  casino.position.set(-130, 0, -300);
  casino.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(casino);
  buildings.push({ x: -130, z: -300, w: 54, d: 32, h: 24, top: 24 });

  // terraced hotels stepping down the Monte Carlo height to the port
  for (let tI = 0; tI < 3; tI++) {
    const terr = new THREE.Mesh(new THREE.BoxGeometry(20, 8 + tI * 6, 130), creamMat);
    terr.position.set(-38 - tI * 26, (8 + tI * 6) / 2, -240);
    terr.castShadow = terr.receiveShadow = true;
    scene.add(terr);
    buildings.push({ x: terr.position.x, z: -240, w: 20, d: 130, h: 8 + tI * 6, top: 8 + tI * 6 });
  }

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

  // "It will be enough to build a landing-stage on the sea side of the wall at
  // the level of the boulevard" — twelve days' work, after the first launch
  // nearly pitched him out of the basket over the wall's four-metre drop
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

  // ---------- the waterfront as the book describes it ----------
  // "The new aerodrome rose on the Boulevard de la Condamine, just across the
  // electric tramcar tracks from the sea wall… From the side walk it was only
  // waist high, but on the other side of it the surf rolled over pebbles from
  // four to five metres below."
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xbdb3a0 });
  const seaWall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.4, 300), wallMat);
  seaWall.position.set(SHORE_X - 1, 1.6, 0);      // waist high above the boulevard…
  seaWall.castShadow = true;
  scene.add(seaWall);
  // …and the pebble beach four to five metres below it, on the sea side
  const pebbles = new THREE.Mesh(new THREE.PlaneGeometry(16, 300),
    new THREE.MeshLambertMaterial({ color: 0x9b9384 }));
  pebbles.rotation.x = -Math.PI / 2;
  pebbles.position.set(SHORE_X + 7, 0.2, 0);
  scene.add(pebbles);

  // the electric tramway along the Condamine, between hangar and wall
  const railMat = new THREE.MeshPhongMaterial({ color: 0x6b6459, shininess: 80 });
  for (const rz of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 300), railMat);
    rail.position.set(SHORE_X - 6 + rz, 0.28, 0);
    scene.add(rail);
  }
  for (let z = -148; z <= 148; z += 4) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x5b4a34 }));
    sleeper.position.set(SHORE_X - 6, 0.16, z);
    scene.add(sleeper);
  }

  // ---------- yachts in the bay — anchored head-to-wind, a pilot's wind vane ----------
  const WINDB = new THREE.Vector3(0.5, 0, 3.9);
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
  // ---------- the escort ----------
  // "One steam chaloupe and two petroleum launches, all three of them swift
  // goers, together with three well-manned row-boats, had been stationed at
  // intervals down the coast to pick me up in case of accident."
  const escort = [];
  for (let i = 0; i < 3; i++) {
    const boat = makeYacht(0, 0, 0.35 + i * 0.1, 0);
    boat.userData.leg = 900 + i * 700;            // how far down the coast it runs
    boat.userData.ph = i * 0.37;
    boat.userData.speed = 0.055 - i * 0.012;
    scene.add(boat);
    escort.push(boat);
  }
  const tick = (dt, t, wind) => {
    const wLen = Math.hypot(wind.x, wind.z) || 1;
    const wx = wind.x / wLen, wz = wind.z / wLen;
    // the escort runs up and down the coast, as it did on the 12th of February
    for (const b of escort) {
      const u = (t * b.userData.speed + b.userData.ph) % 2;
      const f = u < 1 ? u : 2 - u;                 // out, then back
      b.position.set(150 + f * 260, 0.6, 120 - f * b.userData.leg);
      b.rotation.y = u < 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
    }
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
  const m = new THREE.Matrix4();
  scrub.forEach((t, i) => {
    m.makeScale(t.s, t.s * 0.8, t.s).setPosition(t.x, 0, t.z);
    sMesh.setMatrixAt(i, m);
  });
  scene.add(sMesh);

  const clouds = makeClouds(scene, WINDB);

  return {
    name: 'Monaco, winter 1902',
    sun, sunDir, sky, waters: [sea], flags: [], tick,
    buildings, clouds, trees: scrub,
    towerPos: null, padPos: PAD,
    startRing: START, turnRing: TURN,
    gates: [TURN],
    towSpots: [{ name: 'the far quay of the port', pos: new THREE.Vector3(-10, 0, 180) }],
    limitNote: 'the historic 30:00 at half scale',
    vistaPos: new THREE.Vector3(-160, 120, -320), // from the Monte Carlo terraces
    windBase: WINDB,                              // down the coast: headwind out, flying home
    raceLimit: 900, raceRecord: 885,
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
