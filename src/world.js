// Dawn Paris, stylized after the book's descriptions (docs/BOOK_REFERENCE.md Part A):
// chimney-pot rooftops (A1), the Bois as an ocean of greenery (A2), the Eiffel Tower
// as omnipresent landmark and winning-post (A3), drifting clouds that shadow the
// ground (A4), and the red/white striped canvas aerodrome (A11).

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

// procedural wave normal map (the three.js example texture isn't on the CDN)
let _waterNormals = null;
function makeWaterNormals(size = 256) {
  if (_waterNormals) return _waterNormals;
  const h = new Float32Array(size * size);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      h[y * size + x] =
        Math.sin((u * 7 + v * 3) * TAU) * 0.5 +
        Math.sin((u * 13 - v * 9) * TAU + 1.7) * 0.3 +
        Math.sin((u * 23 + v * 29) * TAU + 4.1) * 0.14 +
        Math.sin((u * 41 - v * 37) * TAU + 2.3) * 0.06;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  const s = 1.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * s;
      const dy = (at(x, y + 1) - at(x, y - 1)) * s;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _waterNormals = new THREE.CanvasTexture(c);
  _waterNormals.wrapS = _waterNormals.wrapT = THREE.RepeatWrapping;
  return _waterNormals;
}

// Materials whose vertices sway with the wind (trees, scrub). main.js feeds the
// uniforms each frame so a pilot can READ the wind in the foliage (A9/B1).
export const windMats = [];
export function windify(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = { value: new THREE.Vector2(0, 0) };
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uWind; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float swayPh = uTime * 1.9 + position.x * 2.3 + position.z * 1.7;
          float sway = 0.55 + 0.45 * sin(swayPh);
          transformed.x += uWind.x * max(transformed.y, 0.0) * 0.055 * sway;
          transformed.z += uWind.y * max(transformed.y, 0.0) * 0.055 * sway;
        }`);
    mat.userData.shader = shader;
  };
  windMats.push(mat);
  return mat;
}

export function makePhysicalSky(scene, sunDir, { rayleigh = 2.2, turbidity = 6 } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = turbidity;
  u.rayleigh.value = rayleigh;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  return sky;
}

export function makeShadowSun(scene, sunDir, intensity) {
  const sun = new THREE.DirectionalLight(0xffd9a0, intensity);
  sun.position.copy(sunDir).multiplyScalar(900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -300; c.right = 300; c.top = 300; c.bottom = -300;
  c.near = 1; c.far = 2600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

export function makeWaterSurface(geometry, sunDir, waterColor) {
  const water = new Water(geometry, {
    textureWidth: 512, textureHeight: 512,
    waterNormals: makeWaterNormals(),
    sunDirection: sunDir.clone(), sunColor: 0xfff0d0,
    waterColor, distortionScale: 1.8, fog: true,
  });
  return water;
}

export const TOWER_POS = new THREE.Vector3(260, 0, 150);
export const PAD_POS = new THREE.Vector3(-940, 2.0, 0);
export const START_RING = new THREE.Vector3(-870, 55, 0);
export const TOWER_RING = new THREE.Vector3(430, 70, 150);

const LONGCHAMPS = { x: -560, z: 180, rx: 170, rz: 110 };

export function buildWorld(scene) {
  windMats.length = 0;
  // ---------- sky, light, fog ----------
  scene.fog = new THREE.FogExp2(0xeccfa8, 0.00042);

  const sunDir = new THREE.Vector3(1, 0.14, 0.16).normalize();
  makePhysicalSky(scene, sunDir, { rayleigh: 2.6, turbidity: 7 });
  const hemi = new THREE.HemisphereLight(0xfde3bd, 0x6b6b52, 0.75);
  scene.add(hemi);
  const sun = makeShadowSun(scene, sunDir, 2.6);

  // ---------- ground (subtle patchwork texture so the plain isn't flat) ----------
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(4500, 48),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // paved city base (east of the Seine)
  addFlat(scene, 665, 0, 970, 1700, 0x9b9484, 0.05);
  // Champ de Mars green beside the tower
  addFlat(scene, 300, 330, 150, 320, 0x7f9159, 0.12);
  // Longchamps pelouse
  addOval(scene, LONGCHAMPS.x, LONGCHAMPS.z, LONGCHAMPS.rx, LONGCHAMPS.rz, 0x86a05e, 0.12);
  // aerodrome grounds
  addFlat(scene, -940, 0, 220, 220, 0x84925f, 0.1);

  // ---------- the Seine: stone quays and living, reflecting water ----------
  const riverPts = seinePoints();
  scene.add(makeRibbon(riverPts, 92, 0xa39a86, 0.18));  // quays
  const seine = makeWaterSurface(ribbonGeoXY(riverPts, 70), sunDir, 0x24405a);
  seine.rotation.x = -Math.PI / 2;
  seine.position.y = 0.3;
  scene.add(seine);
  addBridges(scene, riverPts);

  // ---------- avenues ----------
  const arcPos = new THREE.Vector3(420, 0, -420);
  addStrip(scene, arcPos.x, arcPos.z, 1020, -300, 26, 0x9a9285); // Champs-Elysees
  addStrip(scene, arcPos.x, arcPos.z, -240, -470, 24, 0x8f8d76); // Avenue du Bois
  scene.add(makeArc(arcPos));

  // ---------- city blocks ----------
  const buildings = layoutBuildings(riverPts, arcPos);
  addBuildingMeshes(scene, buildings);

  // ---------- the Bois ----------
  const trees = addTrees(scene);

  // ---------- Eiffel Tower ----------
  const tower = makeTower();
  tower.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(tower);

  // ---------- landmarks ----------
  addLandmarks(scene);

  // ---------- aerodrome ----------
  const hangar = makeHangar();
  hangar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(hangar);

  // ---------- clouds ----------
  const clouds = makeClouds(scene);

  return {
    name: 'Paris, 1901',
    sun, sunDir, waters: [seine], flags: [hangar.userData.flag],
    buildings, clouds, riverPts, trees,
    towerPos: TOWER_POS, padPos: PAD_POS,
    startRing: START_RING, turnRing: TOWER_RING,
    vistaPos: new THREE.Vector3(TOWER_POS.x + 20, 215, TOWER_POS.z + 20),
    windBase: new THREE.Vector3(3.4, 0, 0.7),
    raceLimit: 300, raceRecord: 295,
    hints: {
      idleNear: 'Press ENTER to convoke the Commission. (1-7, 9, 0, B change ships · L: Monaco)',
      idleFar: 'Free flight — the start ring waits above the Aéro Club at St. Cloud.',
      out: 'Round the Eiffel Tower — ride the wind high.',
      back: 'Home to St. Cloud — less wind down low.',
      turnMsg: '“I turned with a sudden movement of the rudder, round the Tower’s lightning conductor.” Now home — against the wind. Fly LOW.',
    },
    isWater: () => false,
    isInBois(x, z) {
      if (x < -820 || x > -280 || Math.abs(z) > 520) return false;
      const dx = (x - LONGCHAMPS.x) / LONGCHAMPS.rx, dz = (z - LONGCHAMPS.z) / LONGCHAMPS.rz;
      if (dx * dx + dz * dz < 1) return false;
      if ((x - PAD_POS.x) ** 2 + (z - PAD_POS.z) ** 2 < 130 * 130) return false;
      return true;
    },
  };
}

// ======================================================================

function makeSkyDome() {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0.0, '#f6d2a2');
  grad.addColorStop(0.35, '#e9c39b');
  grad.addColorStop(0.7, '#a9b3bd');
  grad.addColorStop(1.0, '#7f96b8');
  g.fillStyle = grad; g.fillRect(0, 0, 1, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 12), mat);
  dome.renderOrder = -10;
  return dome;
}

function makeSunSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,214,1)');
  grad.addColorStop(0.25, 'rgba(255,220,160,0.85)');
  grad.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, transparent: true,
  }));
  spr.position.set(3800, 700, 560);
  spr.scale.set(1500, 1500, 1);
  return spr;
}

function addFlat(scene, x, z, w, d, color, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  scene.add(m);
}

function addOval(scene, x, z, rx, rz, color, y) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(rx, rz, 1);
  scene.add(m);
}

function addStrip(scene, x1, z1, x2, z2, w, color) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(dz, dx); // plane local +x along strip after x-rot
  m.position.set((x1 + x2) / 2, 0.09, (z1 + z2) / 2);
  scene.add(m);
}

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8b9268'; g.fillRect(0, 0, 256, 256);
  const rand = mulberry32(5);
  for (let i = 0; i < 260; i++) {
    const shades = ['#838a5f', '#93986e', '#889165', '#7f8a62'];
    g.fillStyle = shades[Math.floor(rand() * shades.length)];
    g.globalAlpha = 0.5;
    const x = rand() * 256, y = rand() * 256, r = 6 + rand() * 26;
    g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rand() * 0.6), rand() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

// distant landmarks of the 1901 skyline
function addLandmarks(scene) {
  const cream = new THREE.MeshLambertMaterial({ color: 0xd6cbb4 });
  const white = new THREE.MeshLambertMaterial({ color: 0xe9e4d6 });
  const gold = new THREE.MeshPhongMaterial({ color: 0xc9a437, shininess: 80, specular: 0xffe9a0 });
  const slate = new THREE.MeshLambertMaterial({ color: 0x46505c });

  // Les Invalides — the gold dome
  const inv = new THREE.Group();
  const invBase = new THREE.Mesh(new THREE.BoxGeometry(46, 20, 46), cream); invBase.position.y = 10; inv.add(invBase);
  const invDrum = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 10, 12), cream); invDrum.position.y = 25; inv.add(invDrum);
  const invDome = new THREE.Mesh(new THREE.SphereGeometry(11, 14, 10), gold); invDome.position.y = 32; invDome.scale.y = 1.15; inv.add(invDome);
  const invSpike = new THREE.Mesh(new THREE.ConeGeometry(1.2, 12, 6), gold); invSpike.position.y = 48; inv.add(invSpike);
  inv.position.set(620, 0, 260);
  scene.add(inv);

  // Sacre-Coeur on the Montmartre mound (it was rising over Paris in 1901)
  const mont = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.ConeGeometry(220, 55, 20), new THREE.MeshLambertMaterial({ color: 0x86895f }));
  hill.position.y = 27; mont.add(hill);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 26), white); nave.position.y = 62; mont.add(nave);
  const dome1 = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 9), white); dome1.position.y = 76; dome1.scale.y = 1.35; mont.add(dome1);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), white);
    d.position.set(s * 14, 72, 0); d.scale.y = 1.4; mont.add(d);
  }
  mont.position.set(980, 0, -720);
  scene.add(mont);

  // Trocadero palace, across the river from the Tower
  const troc = new THREE.Group();
  const trocC = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 26, 12), cream); trocC.position.y = 13; troc.add(trocC);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 40), cream);
    wing.position.set(-6, 7, s * 32); wing.rotation.y = s * 0.5; troc.add(wing);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 34, 8), cream);
    tower.position.set(0, 17, s * 16); troc.add(tower);
  }
  troc.position.set(30, 0, 130);
  scene.add(troc);

  // scattered church spires
  const spirePts = [[420, 300], [760, -120], [560, 520], [900, 180], [340, -620], [700, 620]];
  for (const [x, z] of spirePts) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 26, 12), cream);
    base.position.set(x, 13, z); scene.add(base);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 24, 6), slate);
    spire.position.set(x, 38, z); scene.add(spire);
  }
}

// Arc de Triomphe — rounded "to the right, as the law directs" (A10)
function makeArc(pos) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xcfc3ad });
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(9, 22, 12), mat);
    pillar.position.set(s * 10.5, 11, 0);
    g.add(pillar);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(30, 11, 12), mat);
  top.position.y = 27.5;
  g.add(top);
  g.position.copy(pos);
  return g;
}

// ---------------------------------------------------------------- Seine
function seinePoints() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-380, 0, -1500),
    new THREE.Vector3(-260, 0, -700),
    new THREE.Vector3(-180, 0, -200),
    new THREE.Vector3(-60, 0, 120),
    new THREE.Vector3(120, 0, 380),
    new THREE.Vector3(140, 0, 800),
    new THREE.Vector3(40, 0, 1500),
  ]);
  return curve.getPoints(140);
}

function makeRibbon(pts, width, color, y) {
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3().crossVectors(up, t).normalize();
    pos.push(p.x + n.x * width / 2, y, p.z + n.z * width / 2);
    pos.push(p.x - n.x * width / 2, y, p.z - n.z * width / 2);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0xffe6c0 }));
}

// ribbon built in the XY plane (x, -z) so Water's reflector plane is correct
// after rotation.x = -PI/2
function ribbonGeoXY(pts, width) {
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3().crossVectors(up, t).normalize();
    pos.push(p.x + n.x * width / 2, -(p.z + n.z * width / 2), 0);
    pos.push(p.x - n.x * width / 2, -(p.z - n.z * width / 2), 0);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function addBridges(scene, pts) {
  for (const frac of [0.52, 0.62]) {
    const i = Math.floor(pts.length * frac);
    const p = pts[i];
    const t = pts[i + 1].clone().sub(p).normalize();
    const m = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 96), new THREE.MeshLambertMaterial({ color: 0xa8a094 }));
    m.position.set(p.x, 2.4, p.z);
    m.rotation.y = Math.atan2(t.z, -t.x); // box long axis (z) perpendicular to river tangent
    scene.add(m);
  }
}

// ---------------------------------------------------------------- city
function layoutBuildings(riverPts, arcPos) {
  const out = [];
  const rand = mulberry32(42);
  const distToRiver = (x, z) => {
    let d = 1e9;
    for (let i = 0; i < riverPts.length; i += 2) {
      const p = riverPts[i];
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < d) d = dd;
    }
    return Math.sqrt(d);
  };
  const avenue = segDist2D(arcPos.x, arcPos.z, 1020, -300);
  const avenue2 = segDist2D(arcPos.x, arcPos.z, -240, -470);

  for (let gx = 180; gx <= 1150; gx += 47) {
    for (let gz = -840; gz <= 840; gz += 47) {
      const x = gx + (rand() - 0.5) * 10;
      const z = gz + (rand() - 0.5) * 10;
      if (distToRiver(x, z) < 62) continue;
      // Champ de Mars + tower plaza
      if (x > 180 && x < 400 && z > 40 && z < 500) continue;
      if ((x - arcPos.x) ** 2 + (z - arcPos.z) ** 2 < 55 * 55) continue;
      if (avenue(x, z) < 22 || avenue2(x, z) < 20) continue;
      if (rand() < 0.14) continue; // squares and gaps
      const w = 26 + rand() * 12, d = 26 + rand() * 12;
      let h = 14 + rand() * 11;
      if (rand() < 0.06) h *= 1.55; // an occasional grand hotel
      out.push({ x, z, w, d, h, nChim: 2 + Math.floor(rand() * 2), r: rand() });
    }
  }
  return out;
}

function segDist2D(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, len2 = dx * dx + dz * dz;
  return (x, z) => {
    let t = ((x - x1) * dx + (z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
  };
}

function addBuildingMeshes(scene, list) {
  const n = list.length;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0);
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const roof = new THREE.InstancedMesh(bodyGeo.clone(), new THREE.MeshLambertMaterial({ color: 0x4a4f57 }), n);
  let chimTotal = 0;
  for (const b of list) chimTotal += b.nChim;
  const chim = new THREE.InstancedMesh(bodyGeo.clone(), new THREE.MeshLambertMaterial({ color: 0x7a5a4a }), chimTotal);

  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  let ci = 0;
  const rand = mulberry32(7);
  list.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    body.setMatrixAt(i, m);
    col.setHSL(0.09 + b.r * 0.02, 0.22, 0.66 + b.r * 0.1);
    body.setColorAt(i, col);
    const roofH = 3.5 + b.r * 1.5;
    m.makeScale(b.w * 0.84, roofH, b.d * 0.84).setPosition(b.x, b.h, b.z);
    roof.setMatrixAt(i, m);
    b.top = b.h + roofH;
    for (let k = 0; k < b.nChim; k++) {
      const cx = b.x + (rand() - 0.5) * b.w * 0.6;
      const cz = b.z + (rand() - 0.5) * b.d * 0.6;
      m.makeScale(1.2, 2.2 + rand() * 1.4, 1.2).setPosition(cx, b.top - 0.5, cz);
      chim.setMatrixAt(ci++, m);
    }
  });
  body.instanceColor.needsUpdate = true;
  body.castShadow = body.receiveShadow = true;
  roof.castShadow = roof.receiveShadow = true;
  chim.castShadow = true;
  scene.add(body, roof, chim);
}

// ---------------------------------------------------------------- Bois
function addTrees(scene) {
  const rand = mulberry32(99);
  const pts = [];
  for (let i = 0; i < 650; i++) {
    const x = -820 + rand() * 540, z = -520 + rand() * 1040;
    const dx = (x - LONGCHAMPS.x) / (LONGCHAMPS.rx + 14), dz = (z - LONGCHAMPS.z) / (LONGCHAMPS.rz + 14);
    if (dx * dx + dz * dz < 1) continue;
    if ((x - PAD_POS.x) ** 2 + (z - PAD_POS.z) ** 2 < 140 * 140) continue;
    pts.push({ x, z, s: 3 + rand() * 3.4, r: rand() });
  }
  const geo = new THREE.SphereGeometry(1, 7, 5); geo.translate(0, 0.6, 0);
  const mesh = new THREE.InstancedMesh(geo, windify(new THREE.MeshLambertMaterial({ color: 0xffffff })), pts.length);
  const m = new THREE.Matrix4(); const col = new THREE.Color();
  pts.forEach((p, i) => {
    m.makeScale(p.s * 1.25, p.s, p.s * 1.25).setPosition(p.x, p.s * 0.55, p.z);
    mesh.setMatrixAt(i, m);
    col.setHSL(0.26 + p.r * 0.05, 0.32, 0.3 + p.r * 0.12);
    mesh.setColorAt(i, col);
  });
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  scene.add(mesh);
  return pts; // {x, z, s}: crown center ~ y = s*0.55+0.6*s, radius ~ s*1.1
}

// ---------------------------------------------------------------- Eiffel Tower
function makeTower() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3b3128 });
  const beam = (x1, y1, z1, x2, y2, z2, r) => {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    g.add(mesh);
  };
  // stage 1: four legs, 0 -> 100
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    beam(sx * 52, 0, sz * 52, sx * 21, 100, sz * 21, 3.2);
    beam(sx * 52, 0, 0, sx * 21, 100, 0, 1.2);       // face lattice hint
    beam(0, 0, sz * 52, 0, 100, sz * 21, 1.2);
  }
  // arches
  for (const s of [-1, 1]) {
    beam(s * 52, 12, -40, s * 30, 58, 0, 1.4); beam(s * 30, 58, 0, s * 52, 12, 40, 1.4);
    beam(-40, 12, s * 52, 0, 58, s * 30, 1.4); beam(0, 58, s * 30, 40, 12, s * 52, 1.4);
  }
  const plat1 = new THREE.Mesh(new THREE.BoxGeometry(62, 6, 62), mat); plat1.position.y = 100; g.add(plat1);
  // stage 2: 100 -> 200
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(sx * 21, 100, sz * 21, sx * 9.5, 200, sz * 9.5, 2.2);
  for (const sx of [-1, 1]) { beam(sx * 21, 100, -21, sx * 9.5, 200, 9.5, 0.9); beam(sx * 21, 100, 21, sx * 9.5, 200, -9.5, 0.9); }
  const plat2 = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 30), mat); plat2.position.y = 200; g.add(plat2);
  // stage 3: 200 -> 295
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(sx * 9.5, 200, sz * 9.5, sx * 2.4, 295, sz * 2.4, 1.6);
  const plat3 = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 12), mat); plat3.position.y = 296; g.add(plat3);
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 6, 8), mat); dome.position.y = 301; g.add(dome);
  beam(0, 303, 0, 0, 318, 0, 0.5); // lightning conductor — round it at 50 m!
  g.position.copy(TOWER_POS);
  return g;
}

// tower collision radius by height (0 at base widest)
export function towerRadiusAt(y) {
  if (y > 318) return 0;
  if (y < 100) return 55 - (y / 100) * 33;   // 55 -> 22
  if (y < 200) return 22 - ((y - 100) / 100) * 12; // -> 10
  return Math.max(3, 10 - ((y - 200) / 95) * 7);
}

// ---------------------------------------------------------------- aerodrome
function makeHangar() {
  const g = new THREE.Group();
  // striped canvas texture (A11: "a great square tent, striped red and white")
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#b5442f' : '#e8e0cf';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const body = new THREE.Mesh(new THREE.BoxGeometry(44, 15, 18),
    new THREE.MeshLambertMaterial({ map: tex }));
  body.position.set(-1025, 7.5, 0);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 2.5, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a3a28 }));
  roof.position.set(-1025, 16.2, 0);
  g.add(roof);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(15, 12),
    new THREE.MeshLambertMaterial({ color: 0x241a12 }));
  door.rotation.y = Math.PI / 2;
  door.position.set(-1002.9, 6, 0);
  g.add(door);
  // flag mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
  mast.position.set(-1040, 11, 14); g.add(mast);
  const flagGeo = new THREE.PlaneGeometry(6, 3);
  flagGeo.translate(3, 0, 0); // pivot at the mast so it can stream downwind
  const flag = new THREE.Mesh(flagGeo,
    new THREE.MeshLambertMaterial({ color: 0xb5442f, side: THREE.DoubleSide }));
  flag.position.set(-1040, 20.5, 14); g.add(flag);
  g.userData.flag = flag;
  return g;
}

// ---------------------------------------------------------------- clouds
export function makeClouds(scene) {
  const clouds = [];
  const rand = mulberry32(1234);
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x35302a, fog: true });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1e1812, transparent: true, opacity: 0.1, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const grp = new THREE.Group();
    const r = 60 + rand() * 80;
    const nPuff = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < nPuff; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), puffMat);
      const pr = r * (0.32 + rand() * 0.3);
      puff.scale.set(pr, pr * 0.42, pr);
      puff.position.set((rand() - 0.5) * r * 1.3, (rand() - 0.5) * r * 0.16, (rand() - 0.5) * r * 0.8);
      grp.add(puff);
    }
    grp.position.set(-1800 + rand() * 3400, 200 + rand() * 130, -1500 + rand() * 3000);
    scene.add(grp);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 20), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(grp.position.x, 0.45, grp.position.z);
    scene.add(shadow);
    clouds.push({ grp, shadow, r, drift: 0.4 + rand() * 0.5 });
  }
  return clouds;
}

export function updateClouds(clouds, wind, dt) {
  for (const c of clouds) {
    c.grp.position.x += wind.x * c.drift * dt;
    c.grp.position.z += wind.z * c.drift * dt;
    if (c.grp.position.x > 2200) c.grp.position.x = -2200;
    if (c.grp.position.x < -2200) c.grp.position.x = 2200;
    c.shadow.position.set(c.grp.position.x, 0.45, c.grp.position.z);
  }
}

export function underCloud(clouds, x, z) {
  for (const c of clouds) {
    const dx = x - c.grp.position.x, dz = z - c.grp.position.z;
    if (dx * dx + dz * dz < c.r * c.r * 0.81) return true;
  }
  return false;
}

// deterministic rng so the city is stable between sessions
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _LONGCHAMPS = LONGCHAMPS; // (exported via closure use above)
