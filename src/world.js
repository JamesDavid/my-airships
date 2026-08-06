// Dawn Paris, stylized after the book's descriptions (docs/BOOK_REFERENCE.md Part A):
// chimney-pot rooftops (A1), the Bois as an ocean of greenery (A2), the Eiffel Tower
// as omnipresent landmark and winning-post (A3), drifting clouds that shadow the
// ground (A4), and the red/white striped canvas aerodrome (A11).

import * as THREE from 'three';
import { geo, place, placeLegacy, SEINE, ORIGIN_XZ, LEGACY_ORIGIN, LEGACY_SCALE } from './paris_geo.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { STREETS, SITES, inSite, distToStreets } from './paris_plan.js';

// procedural wave normal map (the three.js example texture isn't on the CDN).
// Many randomized-phase wave trains at mixed scales — no visible sine tiling.
let _waterNormals = null;
function makeWaterNormals(size = 512) {
  if (_waterNormals) return _waterNormals;
  const h = new Float32Array(size * size);
  const TAU = Math.PI * 2;
  const rand = mulberry32(2718);
  const waves = [];
  for (let i = 0; i < 26; i++) {
    const band = i < 8 ? 1 : i < 18 ? 2 : 3; // swell, chop, ripple
    const f = band === 1 ? 2 + Math.floor(rand() * 6)
      : band === 2 ? 9 + Math.floor(rand() * 16)
      : 28 + Math.floor(rand() * 34);
    const ang = rand() * TAU;
    waves.push({
      fx: Math.round(Math.cos(ang) * f), fy: Math.round(Math.sin(ang) * f),
      ph: rand() * TAU,
      amp: (band === 1 ? 0.5 : band === 2 ? 0.22 : 0.07) * (0.6 + rand() * 0.8),
    });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let s = 0;
      for (const w of waves) s += Math.sin((u * w.fx + v * w.fy) * TAU + w.ph) * w.amp;
      h[y * size + x] = s;
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

// ---------------------------------------------------------------- the wind
// "The air is full of varying currents... he can leave one current for
// another" (B1). Near the ground the gradient thins the wind (42% at the
// deck to full at 120 m, with a slight veer); above ~180 m a DIFFERENT
// river of air takes over — rotated well off the surface wind and stronger.
// Clouds ride the upper current; smoke and flags show the surface one.
export function windAt(wind, y) {
  const f = 0.42 + 0.58 * Math.min(Math.max(y / 120, 0), 1);
  // slight surface veer as the gradient wind comes in
  const lowAng = 0.17 * Math.min(Math.max(y / 120, 0), 1);
  // the upper current: blends in from 180 m to 320 m
  const t = Math.min(Math.max((y - 180) / 140, 0), 1);
  const ang = lowAng + 1.0 * t;         // up to ~67° off the surface wind aloft
  const mag = f * (1 + 0.3 * t);        // and stronger
  const c = Math.cos(ang), s = Math.sin(ang);
  return new THREE.Vector3(
    (wind.x * c + wind.z * s) * mag, 0,
    (-wind.x * s + wind.z * c) * mag);
}

// ---------------------------------------------------------------- vertical air
// The air does not only move sideways. Sun-warmed stone and dry ground send it
// up; water and the cool green of the Bois let it down; and a fair-weather
// cumulus is the visible top of a rising column — "I was being lifted by an
// enormous column of air rushing upward. While I fell in it I rose rapidly
// higher with it" (Ch. VIII, the Nice storm, at its gentler everyday strength).
//
// Returns metres per second, positive upward. The ship feels it through its own
// vertical drag, so a strong column will carry it up even with the valve open.
export function verticalAir(world, x, y, z, t) {
  if (y < 2) return 0;
  let v = 0;

  // the ground below decides whether air rises or settles
  if (world.isWater(x, z)) v -= 0.55;                       // cool water: subsidence
  else if (world.isInBois && world.isInBois(x, z)) v -= 0.40; // "the cool air from the trees"
  else v += 0.42;                                            // sunlit stone and dust

  // clouds: sinking in the shade under the cloud, lifting in the sunlit collar
  // just outside it, where the thermal that feeds the cloud actually climbs
  for (const c of world.clouds || []) {
    const g = c.grp;
    const dx = x - g.position.x, dz = z - g.position.z;
    const d = Math.hypot(dx, dz);
    const r = c.r;
    if (d > r * 2.1) continue;
    const strength = c.towering ? 1.9 : 1.0;
    if (d < r * 0.95) v -= 0.5 * strength * (1 - d / (r * 0.95));
    else {
      const u = (d - r * 0.95) / (r * 1.15);                // 0 at the rim, 1 far out
      v += 1.15 * strength * Math.sin(Math.PI * Math.min(1, u));
    }
  }

  // it is strongest in the middle air: nothing at the grass, fading out above
  // where the cumulus tops off
  const prof = Math.min(1, Math.max(0, (y - 8) / 70)) * Math.min(1, Math.max(0, (520 - y) / 200));
  // and it breathes, so no column is a steady lift you can simply park in
  const breathe = 0.72 + 0.28 * Math.sin(t * 0.31 + x * 0.0016 + z * 0.0021);
  return v * prof * breathe;
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
          // where this tree stands (instanced foliage carries it in its matrix)
          #ifdef USE_INSTANCING
            vec2 wpos = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
          #else
            vec2 wpos = vec2(0.0);
          #endif
          float mag = length(uWind);
          vec2 dir = mag > 0.001 ? uWind / mag : vec2(0.0);
          // gusts travel DOWNWIND across the wood: the phase lags with distance
          // along the wind, so a pilot sees the ripple sweep the way the air goes
          float gustPh = uTime * 1.15 - dot(wpos, dir) * 0.013;
          float gust = 0.62 + 0.38 * sin(gustPh);
          // each tree keeps its own quicker rustle on top of the travelling gust
          float rustle = 0.72 + 0.28 * sin(uTime * 2.4 + wpos.x * 0.7 + wpos.y * 0.5
                                           + position.x * 2.3 + position.z * 1.7);
          transformed.x += uWind.x * max(transformed.y, 0.0) * 0.13 * gust * rustle;
          transformed.z += uWind.y * max(transformed.y, 0.0) * 0.13 * gust * rustle;
        }`);
    mat.userData.shader = shader;
  };
  windMats.push(mat);
  return mat;
}

// NOTE: Sky renders on a box — keep it larger than the world and re-centered on
// the camera every frame (main.js) or the horizon goes black past its walls.
export function makePhysicalSky(scene, sunDir, { rayleigh = 2.2, turbidity = 6 } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(10000);
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
  // Patch the shader so the wave pattern streams with the LIVE wind (a real
  // pilot's cue) instead of the stock fixed diagonal drift. All four noise
  // layers drift downwind at slightly different rates for parallax shimmer.
  const mat = water.material;
  mat.uniforms.flowUv = { value: new THREE.Vector2(0, 0) };
  const fs = mat.fragmentShader
    .replace('uniform float time;', 'uniform float time;\nuniform vec2 flowUv;')
    .replace(/vec2 uv0 = .*?;/, 'vec2 uv0 = ( uv / 103.0 ) - flowUv / 103.0;')
    .replace(/vec2 uv1 = .*?;/, 'vec2 uv1 = uv / 107.0 - flowUv / 71.0;')
    .replace(/vec2 uv2 = .*?;/, 'vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) - flowUv / 2903.0;')
    .replace(/vec2 uv3 = .*?;/, 'vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - flowUv / 547.0;');
  if (fs.includes('flowUv / 71.0')) mat.fragmentShader = fs; // only if the patch matched
  return water;
}

// Half real scale: St. Cloud to the Tower is ~2.5 km here (5.5 km in 1901),
// so climbing for the gradient wind genuinely pays on each leg.
const _twr = placeLegacy('eiffel');
export const TOWER_POS = new THREE.Vector3(_twr.x, 0, _twr.z);
export const PAD_POS = new THREE.Vector3(-2140, 2.0, 0);
export const START_RING = new THREE.Vector3(-2065, 55, 0);
export const TOWER_RING = new THREE.Vector3(430, 70, 150);

const _lc = placeLegacy('longchamp');
const LONGCHAMPS = { x: _lc.x, z: _lc.z, rx: 260, rz: 150 };

export function buildWorld(scene) {
  windMats.length = 0;
  // ---------- sky, light, fog ----------
  scene.fog = new THREE.FogExp2(0xeccfa8, 0.00042);

  const sunDir = new THREE.Vector3(1, 0.14, 0.16).normalize();
  const sky = makePhysicalSky(scene, sunDir, { rayleigh: 2.6, turbidity: 7 });
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
  addFlat(scene, 665, 0, 970, 1700, 0x847d70, 0.05);
  // Champ de Mars green beside the tower
  addFlat(scene, 300, 330, 150, 320, 0x7f9159, 0.12);
  // Longchamps pelouse
  addOval(scene, LONGCHAMPS.x, LONGCHAMPS.z, LONGCHAMPS.rx, LONGCHAMPS.rz, 0x86a05e, 0.12);
  // aerodrome grounds
  addFlat(scene, -2140, 0, 240, 240, 0x84925f, 0.1);

  // ---------- the Seine: stone quays and living, reflecting water ----------
  const riverPts = seinePoints();
  scene.add(makeRibbon(riverPts, 92, 0xa39a86, 0.18));  // quays
  const seine = makeWaterSurface(ribbonGeoXY(riverPts, 70), sunDir, 0x24405a);
  seine.rotation.x = -Math.PI / 2;
  seine.position.y = 0.3;
  scene.add(seine);
  addBridges(scene, riverPts);

  // The western reach used to be a SECOND, invented river: a straight
  // north-south line at x ~ -2000, standing in for the loop round the Bois. The
  // real trace now carries the whole Seine, loop and all, so that second river
  // is gone — it was running straight through the Longchamps racecourse once the
  // racecourse was put where it belongs.
  //
  // Out here the Seine has grass banks and a towpath rather than the cut-stone
  // quays of the city reaches: the last third of the trace is banked in green.
  const westPts = riverPts.slice(Math.floor(riverPts.length * 0.62));
  scene.add(makeRibbon(westPts, 88, 0x6d7a4d, 0.16, true));
  // the Pont de St-Cloud: a stone road bridge, well clear of the Avre aqueduct
  // downstream of it (the two stood a few hundred metres apart in life, and
  // sat one on top of the other here)
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0xa8a094 });
  const wb = new THREE.Group();
  const roadway = new THREE.Mesh(new THREE.BoxGeometry(96, 2.2, 13), bridgeMat);
  roadway.position.y = 6.5;
  wb.add(roadway);
  for (const px of [-30, 0, 30]) {                 // piers standing in the stream
    const pier = new THREE.Mesh(new THREE.BoxGeometry(7, 6.5, 11), bridgeMat);
    pier.position.set(px, 3.25, 0);
    wb.add(pier);
  }
  for (const px of [-15, 15]) {                    // and the vaults between them
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 12, 14, 1, false, 0, Math.PI), bridgeMat);
    arch.rotation.x = -Math.PI / 2;                // axis across the roadway, crown up
    arch.position.set(px, 5.4, 0);
    arch.scale.set(0.95, 1, 0.52);
    wb.add(arch);
  }
  for (const sz of [-1, 1]) {                      // parapets down both sides
    const par = new THREE.Mesh(new THREE.BoxGeometry(96, 1.4, 1.1), bridgeMat);
    par.position.set(0, 8.3, sz * 6);
    wb.add(par);
  }
  // abutments at the ends, and ramps carrying the roadway down to the bank —
  // without them the deck simply stopped five metres above the grass
  const RAMP = 34, DECKY = 6.5;
  for (const sx of [-1, 1]) {
    const abut = new THREE.Mesh(new THREE.BoxGeometry(14, DECKY, 13), bridgeMat);
    abut.position.set(sx * 41, DECKY / 2, 0);
    abut.castShadow = abut.receiveShadow = true;
    wb.add(abut);
    // The ramp must fall AWAY from the bridge. Rotating by +θ on the +x side
    // lifts the far end instead — which built a pair of takeoff ramps rising
    // into the air at both ends of the crossing.
    const slope = Math.atan2(DECKY - 0.6, RAMP);
    const midY = (DECKY + 0.6) / 2;
    const midX = sx * (48 + RAMP / 2);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(RAMP, 2.4, 13),
      new THREE.MeshLambertMaterial({ color: 0x9a9285 }));
    ramp.position.set(midX, midY - 1.2, 0);
    ramp.rotation.z = -sx * slope;
    ramp.receiveShadow = true;
    wb.add(ramp);
    for (const sz of [-1, 1]) {                   // the ramp keeps its parapets
      const rp = new THREE.Mesh(new THREE.BoxGeometry(RAMP, 1.2, 1.1), bridgeMat);
      rp.position.set(midX, midY + 0.6, sz * 6);
      rp.rotation.z = -sx * slope;
      wb.add(rp);
    }
  }
  // the road the bridge carries: west into Saint-Cloud, east along the bank
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x9a9285 });
  const road = (x1, z1, x2, z2, width) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, width), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
    strip.position.set((x1 + x2) / 2, 0.15, (z1 + z2) / 2);
    strip.receiveShadow = true;
    scene.add(strip);
  };
  // the Paris-Versailles road over the Pont de Saint-Cloud: out of the town,
  // across the river, and on into the Bois toward Longchamp
  road(-2330, 440, -2080, 400, 13);            // through Saint-Cloud to the bridge
  road(-1908, 400, -1600, 330, 13);            // and away on the Bois bank
  road(-1600, 330, -1250, 200, 12);            // the allée to the racecourse
  road(-2330, 440, -2340, 90, 11);             // the village street to the church
  road(-2080, 400, -2150, 150, 10);            // the lane down toward the field gate
  wb.position.set(-1994, 0, 400);   // 250 m (0.5 km at full scale) upstream
  wb.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(wb);

  // river traffic: barges and a puffing steamer
  const bargeMat = new THREE.MeshLambertMaterial({ color: 0x33291f });
  for (const [bx, bz, ba] of [[-90, 260, 0.5], [60, 360, 0.6], [-160, -60, 0.2]]) {
    const barge = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 4.4), bargeMat);
    barge.position.set(bx, 1.1, bz); barge.rotation.y = ba;
    scene.add(barge);
  }

  // ---------- the real street plan of 1901 (src/paris_plan.js) ----------
  const _arc = placeLegacy('etoile');
  const arcPos = new THREE.Vector3(_arc.x, 0, _arc.z);
  // Every street in ONE mesh. There are close to three hundred of them now that
  // the network is surveyed rather than sketched, and a mesh per segment would
  // be seven hundred draw calls before a single building is put up.
  {
    const pos = [], col = [], idx = [];
    const paved = new THREE.Color(0xb9b0a0), dirt = new THREE.Color(0x9d9573);
    for (const st of STREETS) {
      const c = st.dirt ? dirt : paved;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [x1, z1] = st.pts[i], [x2, z2] = st.pts[i + 1];
        const dx = x2 - x1, dz = z2 - z1;
        const L = Math.hypot(dx, dz) || 1;
        // half-width across the line, and a little PAST each end so that
        // consecutive segments and crossings close up instead of showing gaps
        const nx = (-dz / L) * st.w / 2, nz = (dx / L) * st.w / 2;
        const ex = (dx / L) * st.w * 0.5, ez = (dz / L) * st.w * 0.5;
        const b = pos.length / 3;
        for (const [px, pz] of [[x1 - ex + nx, z1 - ez + nz], [x1 - ex - nx, z1 - ez - nz],
          [x2 + ex + nx, z2 + ez + nz], [x2 + ex - nx, z2 + ez - nz]]) {
          pos.push(px, 0.09, pz);
          col.push(c.r, c.g, c.b);
        }
        idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
      }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g2.setIndex(idx);
    g2.computeVertexNormals();
    const roads = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ vertexColors: true }));
    roads.receiveShadow = true;
    scene.add(roads);
  }
  addOval(scene, 420, -420, 64, 64, 0x9a9285, 0.08);   // the Étoile
  addOval(scene, 900, -180, 85, 85, 0x9a9285, 0.08);   // Place de la Concorde
  scene.add(makeArc(arcPos));
  scene.add(makeConcorde());
  scene.add(makeMadeleine());

  // ---------- the city: buildings along their real street frontages ----------
  const buildings = buildCity(scene, riverPts);

  // ---------- the Bois ----------
  const trees = addTrees(scene);

  // ---------- Eiffel Tower ----------
  const tower = makeTower();
  tower.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(tower);

  // ---------- landmarks ----------
  const lm = addLandmarks(scene);
  buildings.push(...lm.lmColliders);
  // the places the memoir names, and the 1900 maps put on the ground
  const bookPlaces = addBookPlaces(scene, buildings);

  // flags on the Tower and the Arc — wind vanes a pilot can see from afar
  const towerFlag = makeStreamFlag(9, 4.5, 0x2b4a8c);
  towerFlag.position.set(TOWER_POS.x, 316, TOWER_POS.z);
  scene.add(towerFlag);
  const arcFlag = makeStreamFlag(6, 3, 0xb5442f);
  arcFlag.position.set(arcPos.x, 40, arcPos.z);
  scene.add(arcFlag);

  // chimney smoke over the rooftops — the city itself shows the wind
  // A hundred thousand coal fires: the roofs of Paris smoke everywhere, and
  // every plume leans the same way — the surface wind, drawn across the city.
  const smokeGeo = new THREE.SphereGeometry(1, 7, 5);
  const plumes = [];
  const smokeRand = mulberry32(4711);
  // stride the WHOLE list, or every plume lands in whichever quarter happened
  // to be generated first and the rest of Paris sits with cold chimneys
  // each puff is its own transparent draw call, so a phone gets a thinner city
  const phone = matchMedia('(pointer: coarse)').matches && innerWidth < 1100;
  const WANT = phone ? 26 : 54;
  const stride = Math.max(1, Math.floor(buildings.length / (WANT * 1.6)));
  for (let i = 3; i < buildings.length && plumes.length < WANT; i += stride) {
    const b = buildings[i];
    if (b.top < 8) continue;                        // sheds and stalls have no chimneys
    const sooty = smokeRand() < 0.35;               // some fires burn dirtier than others
    const mat = new THREE.MeshLambertMaterial({
      color: sooty ? 0x6f6a63 : 0xb2aba0,
      transparent: true, opacity: 0.3, depthWrite: false, fog: true });
    const puffs = [];
    const n = phone ? 4 : 5;
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(smokeGeo, mat.clone());
      scene.add(s);
      puffs.push(s);
    }
    plumes.push({
      base: new THREE.Vector3(b.x + (smokeRand() - 0.5) * b.w * 0.5, b.top + 1.2,
        b.z + (smokeRand() - 0.5) * b.d * 0.5),
      puffs, n,
      ph: smokeRand(),
      rate: 0.075 + smokeRand() * 0.075,            // how fast the plume streams
      rise: 12 + smokeRand() * 12,                  // how buoyant this fire is
      op: (sooty ? 0.34 : 0.24) + smokeRand() * 0.1,
    });
  }
  const tick = (dt, t, wind) => {
    lm.roueWheel.rotation.z += dt * 0.025; // the Grande Roue turns
    // the old mill answers the wind too — faster when it blows harder
    if (bookPlaces.sails) bookPlaces.sails.rotation.x += dt * 0.05 * Math.hypot(wind.x, wind.z);
    const wLen = Math.hypot(wind.x, wind.z) || 1;
    const wx = wind.x / wLen, wz = wind.z / wLen;
    for (const pl of plumes) {
      pl.puffs.forEach((p, k) => {
        const u = (t * pl.rate + pl.ph + k / pl.n) % 1;
        // it leaves the pot straight up, then lies over as the wind takes it
        const lean = u * u;
        p.position.set(pl.base.x + wx * lean * 40 * wLen * 0.25,
          pl.base.y + u * pl.rise,
          pl.base.z + wz * lean * 40 * wLen * 0.25);
        p.scale.setScalar(0.9 + u * 5.2);          // it spreads as it cools
        p.material.opacity = pl.op * (1 - u) * (0.35 + u * 1.6);
      });
    }
  };

  // ---------- aerodrome ----------
  const hangar = makeHangar();
  hangar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(hangar);

  // ---------- clouds ----------
  const windB = new THREE.Vector3(4.2, 0, 0.8);
  const clouds = makeClouds(scene, windB);

  const LM = (id) => { const q = placeLegacy(id); return { x: q.x, z: q.z }; };
  return {
    name: 'Paris, 1901',
    sun, sunDir, sky, waters: [seine], tick,
    flags: [hangar.userData.flag, towerFlag.userData.flag, arcFlag.userData.flag],
    buildings, clouds, riverPts, trees,
    towerPos: TOWER_POS, padPos: PAD_POS,
    startRing: START_RING, turnRing: TOWER_RING,
    gates: [TOWER_RING],
    // ---- the places a hunt can send you to ----------------------------
    // positions come from the same true table the meshes are placed from, so a
    // hunt can never send a pilot to where a landmark used to be
    // One list, kept beside the meshes that draw them, so a game can never send
    // a pilot to something that is not there. `y` is a height she flies at
    // comfortably above it; `r` is how close counts as arriving.
    landmarks: [
      { id: 'eiffel', name: 'the Eiffel Tower', ...LM('eiffel'), y: 210, r: 90,
        clue: '“I had rounded the Tower.” Three hundred metres of iron, and the whole prize turns on it.' },
      { id: 'arc', name: 'the Arc de Triomphe', ...LM('etoile'), y: 62, r: 45,
        clue: 'The arch at the top of the great avenue — he rounded it “to the right, as the law directs”.' },
      { id: 'palais', name: 'the Grand Palais', ...LM('grandpalais'), y: 66, r: 45,
        clue: 'Stone below and a river of glass above: the exhibition palace of 1900.' },
      { id: 'trocadero', name: 'the Trocadéro', ...LM('trocadero'), y: 86, r: 55,
        clue: '“The No. 5 came down on its roof.” A rotunda and two slim towers across the water from the Tower.' },
      { id: 'invalides', name: 'the Invalides', ...LM('invalides'), y: 70, r: 45,
        clue: 'A gilded dome over the soldiers’ hospital.' },
      { id: 'montmartre', name: 'Montmartre', ...LM('montmartre'), y: 140, r: 60,
        clue: 'The white church on the highest hill in the city.' },
      { id: 'notredame', name: 'Notre-Dame', ...LM('notredame'), y: 62, r: 45,
        clue: 'Two square towers and a spire, on the island in the river.' },
      { id: 'pantheon', name: 'the Panthéon', ...LM('pantheon'), y: 62, r: 45,
        clue: 'A dome on the hill of the left bank.' },
      { id: 'opera', name: 'the Opéra', ...LM('opera'), y: 58, r: 45,
        clue: 'A green dome over the grandest staircase in Paris.' },
      { id: 'roue', name: 'the Grande Roue', ...LM('roue'), y: 64, r: 45,
        clue: 'A hundred metres of wheel, left over from the Exposition — the gymkhana threads it.' },
      { id: 'bagatelle', name: 'Bagatelle', ...LM('bagatelle'), y: 44, r: 55,
        clue: '“I had the No. 9 towed to the railing of Bagatelle.” A little château at the edge of the Bois.' },
      { id: 'longchamps', name: 'Longchamps', ...LM('longchamp'), y: 48, r: 90,
        clue: '“Ten times in succession I made the circuit of Longchamps.” The racecourse in the Bois.' },
      { id: 'moulin', name: 'the Moulin de Longchamp', x: -1010, z: 118, y: 42, r: 45,
        clue: 'The abbey’s old mill, standing alone on the pelouse.' },
      { id: 'puteaux', name: 'the Île de Puteaux', ...LM('puteaux'), y: 46, r: 100,
        clue: '“Beaten out with my Panama hat.” The island in the reach below the bridge.' },
      { id: 'stcloud', name: 'the hill of Saint-Cloud', ...LM('stcloud'), y: 170, r: 140,
        clue: 'The wooded park above the aerodrome, with its terraces and cascade.' },
    ],
    towSpots: [
      { name: 'Bagatelle, by the Bois', pos: new THREE.Vector3(-450, 0, -140) },
      { name: 'Longchamps racecourse', pos: new THREE.Vector3(LONGCHAMPS.x, 0, LONGCHAMPS.z) },
      // on the quay, not in the river — the Seine drowns a ship now
      { name: 'the Trocadéro bank', pos: new THREE.Vector3(-30, 0, 70) },
    ],
    limitNote: 'the historic 30:00 at half scale',
    vistaPos: new THREE.Vector3(TOWER_POS.x + 20, 215, TOWER_POS.z + 20),
    windBase: windB,
    raceLimit: 900, raceRecord: 885,
    hints: {
      idleNear: 'The Commission waits — call “Let go all!” when you are ready.',
      idleFar: 'Free flight — the start ring waits above the Aéro Club at St. Cloud.',
      out: 'Round the Eiffel Tower — ride the wind high.',
      back: 'Home to St. Cloud — less wind down low.',
      turnMsg: '“I turned with a sudden movement of the rudder, round the Tower’s lightning conductor.” Now home — against the wind. Fly LOW.',
    },
    // the Seine is water like any other: "I should fall into the Seine" —
    // both reaches drown a ship that comes down on them
    // half-widths match the water ribbons exactly (70 m and 64 m wide), so the
    // river is wet right out to the bank you can see
    // …but the Île de Puteaux is dry land in the middle of the reach
    isWater: (x, z) => !onPuteaux(x, z)
      && nearPolyline(riverPts, x, z, 35.5),
    isInBois(x, z) {
      if (x < -1900 || x > -340 || Math.abs(z) > 560) return false;
      const dx = (x - LONGCHAMPS.x) / LONGCHAMPS.rx, dz = (z - LONGCHAMPS.z) / LONGCHAMPS.rz;
      if (dx * dx + dz * dz < 1) return false;
      if ((x - PAD_POS.x) ** 2 + (z - PAD_POS.z) ** 2 < 150 * 150) return false;
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

// Haussmann facade: cream limestone, window rows, iron balcony lines at the
// 2nd and 5th floors, darker shopfront ground floor, cornice. One texture per
// building face; per-instance color still tints it.
let _facade = null;
export function makeFacadeTexture() {
  if (_facade) return _facade;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#e6dcc6'); grad.addColorStop(1, '#cfc2a8');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const rand = mulberry32(19);
  // ground floor: darker shopfronts
  g.fillStyle = '#8d8065'; g.fillRect(0, 214, 256, 42);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = rand() < 0.5 ? '#3c352a' : '#4a4236';
    g.fillRect(10 + i * 42, 222, 30, 30);
  }
  // five window floors
  for (let row = 0; row < 5; row++) {
    const y = 32 + row * 36;
    for (let col = 0; col < 7; col++) {
      const x = 12 + col * 35;
      g.fillStyle = '#332f28';
      g.fillRect(x, y, 16, 26);
      g.fillStyle = rand() < 0.08 ? '#d9a860' : '#4d4a42'; // a few lamps lit at dawn
      g.fillRect(x + 2, y + 2, 12, 10);
      g.fillStyle = '#b9ad93'; // stone lintel
      g.fillRect(x - 2, y - 4, 20, 3);
    }
    // iron balcony lines on the 2nd and 5th floors (rows 1 and 4)
    if (row === 1 || row === 4) {
      g.fillStyle = '#2e2b26';
      g.fillRect(4, y + 24, 248, 3);
      for (let b = 0; b < 62; b++) g.fillRect(6 + b * 4, y + 18, 1, 7);
    }
  }
  // cornice
  g.fillStyle = '#b9ad93'; g.fillRect(0, 0, 256, 10);
  _facade = new THREE.CanvasTexture(c);
  _facade.anisotropy = 4;
  return _facade;
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
  const lmColliders = [];
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
  { const _p = placeLegacy('invalides'); inv.position.set(_p.x, 0, _p.z); }
  scene.add(inv);

  // Sacre-Coeur on the Montmartre mound (it was rising over Paris in 1901)
  const mont = new THREE.Group();
  // the butte is a truncated cone, not a spike: the basilica needs level
  // ground to stand on, or its flat floor floats over a sloping point
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(74, 220, 55, 20, 1),
    new THREE.MeshLambertMaterial({ color: 0x86895f }));
  hill.position.y = 27.5; hill.receiveShadow = true; mont.add(hill);
  // and the crown itself, so the church sits on turf rather than a rim
  const crown = new THREE.Mesh(new THREE.CircleGeometry(74, 20),
    new THREE.MeshLambertMaterial({ color: 0x8d9065 }));
  crown.rotation.x = -Math.PI / 2; crown.position.y = 55.05; mont.add(crown);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 26), white); nave.position.y = 62; mont.add(nave);
  const dome1 = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 9), white); dome1.position.y = 76; dome1.scale.y = 1.35; mont.add(dome1);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), white);
    d.position.set(s * 14, 72, 0); d.scale.y = 1.4; mont.add(d);
  }
  { const _p = placeLegacy('montmartre'); mont.position.set(_p.x, 0, _p.z); }
  scene.add(mont);

  // Old Palais du Trocadero (1878): rotunda, two slim ~80 m towers, curved wings —
  // "the Trocadero was seen through the base of the Eiffel Tower"
  const troc = new THREE.Group();
  const trocC = new THREE.Mesh(new THREE.CylinderGeometry(17, 18, 30, 14), cream); trocC.position.y = 15; troc.add(trocC);
  const trocDome = new THREE.Mesh(new THREE.SphereGeometry(15, 12, 8), slate); trocDome.position.y = 32; trocDome.scale.y = 0.65; troc.add(trocDome);
  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 62, 8), cream);
    tower.position.set(0, 31, s * 21); troc.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8, 8), slate);
    cap.position.set(0, 66, s * 21); troc.add(cap);
    // The curved galleries. These used to be six detached boxes stepped round an
    // approximate arc, and from the street they read as blocks left lying about
    // rather than as a building — a pilot asked what they were. They follow a
    // true arc now, each bay meeting the next, with a cornice over them.
    const R = 58, A0 = 0.42, A1 = 1.72, BAYS = 11;
    const step = (A1 - A0) / BAYS;
    const chord = 2 * R * Math.sin(step / 2) + 0.4;    // so consecutive bays touch
    for (let w = 0; w < BAYS; w++) {
      const a = A0 + step * (w + 0.5);
      const px = Math.cos(a) * R, pz = s * Math.sin(a) * R;
      const bay = new THREE.Mesh(new THREE.BoxGeometry(chord, 15, 13), cream);
      bay.position.set(px, 7.5, pz);
      bay.rotation.y = s * (a - Math.PI / 2) * -1;     // tangent to the arc
      troc.add(bay);
      const corn = new THREE.Mesh(new THREE.BoxGeometry(chord, 1.6, 15), slate);
      corn.position.set(px, 15.6, pz);
      corn.rotation.y = bay.rotation.y;
      troc.add(corn);
      // a pavilion where the gallery meets the rotunda, and again at its end
      if (w === 0 || w === BAYS - 1) {
        const pav = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 21, 10), cream);
        pav.position.set(px, 10.5, pz);
        troc.add(pav);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(7.6, 6, 10), slate);
        cap.position.set(px, 24, pz);
        troc.add(cap);
      }
    }
  }
  { const _p = placeLegacy('trocadero'); troc.position.set(_p.x, 0, _p.z); }
  troc.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(troc);

  // La Grande Roue de Paris (1900) — the 100 m wheel by the Champ de Mars
  const roue = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x4a443c });
  const wheel = new THREE.Group();
  for (const dz of [-3.5, 3.5]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(46, 0.9, 8, 40), steel);
    rim.position.z = dz;
    wheel.add(rim);
  }
  for (let i = 0; i < 12; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 92, 5), steel);
    spoke.rotation.z = (i * Math.PI) / 12;
    wheel.add(spoke);
  }
  for (let i = 0; i < 16; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x7a4a34 }));
    const a = (i / 16) * Math.PI * 2;
    car.position.set(Math.cos(a) * 46, Math.sin(a) * 46, 0);
    wheel.add(car);
  }
  wheel.position.y = 52;
  roue.add(wheel);
  for (const sx of [-1, 1]) for (const dz of [-3.5, 3.5]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 60, 6), steel);
    leg.position.set(sx * 15, 26, dz);
    leg.rotation.z = sx * 0.5;
    roue.add(leg);
  }
  { const _p = placeLegacy('roue'); roue.position.set(_p.x, 0, _p.z); }
  roue.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(roue);
  lmColliders.push({ x: 400, z: 560, w: 10, d: 10, h: 30, top: 30 }); // wheel legs only

  // Grand Palais (1900): stone colonnade with the great glass barrel vault
  const gp = new THREE.Group();
  const gpBase = new THREE.Mesh(new THREE.BoxGeometry(78, 18, 44), cream); gpBase.position.y = 9; gp.add(gpBase);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 74, 16, 1, false, 0, Math.PI),
    new THREE.MeshPhongMaterial({ color: 0xbcd4d2, shininess: 140, specular: 0xfff2cc,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  // The nave runs the LENGTH of the palace. rotation.z alone lays the cylinder's
  // axis along X: 74 m of vault down a 78 m base, 40 m across a 44 m depth — the
  // two spare metres either way are what the numbers were chosen for. The extra
  // rotation.y that used to follow turned it a quarter round, so the vault lay
  // ACROSS the building, overhanging the ends by 15 m and covering half its length.
  glass.rotation.z = Math.PI / 2;
  glass.position.y = 18; glass.scale.y = 0.94; gp.add(glass);
  { const _p = placeLegacy('grandpalais'); gp.position.set(_p.x, 0, _p.z); }
  gp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(gp);

  // Notre-Dame, far down the river: twin towers and the nave
  const nd = new THREE.Group();
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(11, 42, 11), cream);
    t.position.set(0, 21, s * 8); nd.add(t);
  }
  const ndNave = new THREE.Mesh(new THREE.BoxGeometry(52, 20, 22), cream);
  ndNave.position.set(30, 10, 0); nd.add(ndNave);
  const fleche = new THREE.Mesh(new THREE.ConeGeometry(2, 22, 6), slate);
  fleche.position.set(34, 30, 0); nd.add(fleche);
  { const _p = placeLegacy('notredame'); nd.position.set(_p.x, 0, _p.z); }
  scene.add(nd);

  // Pantheon dome and the Opera
  const pan = new THREE.Group();
  const panBase = new THREE.Mesh(new THREE.BoxGeometry(34, 20, 34), cream); panBase.position.y = 10; pan.add(panBase);
  const panDrum = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 12, 12), cream); panDrum.position.y = 26; pan.add(panDrum);
  const panDome = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), slate); panDome.position.y = 33; panDome.scale.y = 1.05; pan.add(panDome);
  { const _p = placeLegacy('pantheon'); pan.position.set(_p.x, 0, _p.z); }
  scene.add(pan);
  const opera = new THREE.Group();
  const opBase = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 30), cream); opBase.position.y = 11; opera.add(opBase);
  const opDome = new THREE.Mesh(new THREE.SphereGeometry(11, 12, 8),
    new THREE.MeshPhongMaterial({ color: 0x5f7a64, shininess: 40 })); opDome.position.y = 26; opDome.scale.y = 0.7; opera.add(opDome);
  { const _p = placeLegacy('opera'); opera.position.set(_p.x, 0, _p.z); }
  scene.add(opera);

  // scattered church spires
  const spirePts = [[440, 300], [760, -120], [560, 620], [900, 180], [340, -620], [700, 680]];
  for (const [x, z] of spirePts) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 26, 12), cream);
    base.position.set(x, 13, z); scene.add(base);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 24, 6), slate);
    spire.position.set(x, 38, z); scene.add(spire);
  }

  return { roueWheel: wheel, lmColliders };
}

// a flag pivoted at its staff; world.flags holds the cloth mesh (main.js
// streams it downwind by setting rotation.y)
export function makeStreamFlag(w, h, color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, h * 2.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a3f30 }));
  g.add(pole);
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(w / 2, 0, 0);
  const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  flag.position.y = h * 0.9;
  g.add(flag);
  g.userData.flag = flag;
  return g;
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
  g.rotation.y = 1.107; // the archway spans the Champs-Élysées axis, as built
  return g;
}

// ---------------------------------------------------------- the book's places
// Everything here is named in "My Airships" or stands on the 1900 plans of the
// ground he flew over. See docs/PERIOD_NOTES.md for the map sources.
const _pt = placeLegacy('puteaux');
const PUTEAUX = { x: _pt.x, z: _pt.z, rx: 130, rz: 38 };   // below the Suresnes bridge   // the island in the reach

export function onPuteaux(x, z) {
  const dx = (x - PUTEAUX.x) / PUTEAUX.rx, dz = (z - PUTEAUX.z) / PUTEAUX.rz;
  return dx * dx + dz * dz < 1;
}

function stripedTentTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#b5442f' : '#efe7d6';
    x.fillRect(i * 16, 0, 16, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addBookPlaces(scene, buildings) {
  const iron = new THREE.MeshLambertMaterial({ color: 0x5d5a52 });
  const stone = new THREE.MeshLambertMaterial({ color: 0xa8a294 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b5236 });

  // ---- the Passerelle de l'Avre: Eiffel's iron aqueduct over the Seine,
  // built 1891-93, and the very structure of the plate captioned "Returning to
  // Aéro Club Grounds above Aqueduct". It crosses the reach beside the start.
  const aq = new THREE.Group();
  const SPAN = 150, DECK = 15;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 2.2, 9), iron);
  deck.position.y = DECK;
  aq.add(deck);
  for (const sz of [-1, 1]) {                       // lattice parapets
    for (let i = -SPAN / 2; i <= SPAN / 2; i += 7.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), iron);
      post.position.set(i, DECK + 3, sz * 4.2);
      aq.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 0.5, 0.5), iron);
    rail.position.set(0, DECK + 5, sz * 4.2);
    aq.add(rail);
  }
  // the two river piers, and the shallow bowstring arch between them
  for (const px of [-38, 38]) {
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, DECK, 10), stone);
    pier.position.set(px, DECK / 2, 0);
    aq.add(pier);
    buildings.push({ x: PUTEAUX.x * 0 + px, z: 0, w: 9, d: 9, h: DECK, top: DECK });
  }
  for (let i = 0; i <= 14; i++) {
    const u = i / 14, ang = Math.PI * u;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 1.1), iron);
    seg.position.set(-38 + u * 76, DECK - 5.5 + Math.sin(ang) * 5.5, 0);
    seg.rotation.z = Math.cos(ang) * 0.5;
    aq.add(seg);
  }
  // The ends have to land on something. A masonry abutment takes the deck's
  // weight at each bank, and beyond it an EARTH EMBANKMENT carries the conduit
  // down into the ground on a continuous slope — two blocks of different
  // heights just made a flight of stairs out of it.
  const EMB = 90;
  for (const sx of [-1, 1]) {
    const abut = new THREE.Mesh(new THREE.BoxGeometry(20, DECK + 1.5, 14), stone);
    abut.position.set(sx * (SPAN / 2 - 4), (DECK + 1.5) / 2 - 0.6, 0);
    abut.castShadow = abut.receiveShadow = true;
    aq.add(abut);
    // the bank itself: high at the abutment, running out to nothing
    const slope = Math.atan2(DECK - 0.5, EMB);
    const emb = new THREE.Mesh(new THREE.BoxGeometry(EMB, 8, 24),
      new THREE.MeshLambertMaterial({ color: 0x7b8a54 }));
    emb.position.set(sx * (SPAN / 2 + EMB / 2 - 6),
      (DECK - 0.5) / 2 - 3.4, 0);
    emb.rotation.z = -sx * slope;           // FAR end down: the near end meets the deck
    emb.receiveShadow = true;
    aq.add(emb);
  }

  // The reach here runs north and south, so the crossing runs east and west:
  // the deck's long axis is local +x and the group is NOT turned. (Rotating it
  // a quarter turn laid the whole aqueduct along the water instead of over it.)
  aq.position.set(-1985, 0, 150);   // clear of the aerodrome field, which reaches z 120
  aq.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(aq);
  buildings.length -= 2;                            // re-place the piers in world terms
  for (const px of [-38, 38]) {
    buildings.push({ x: -1985 + px, z: 150, w: 9, d: 9, h: DECK, top: DECK });
  }

  // ---- M. Henry Deutsch's air-ship house, a bare skeleton "scarcely two
  // air-ships' lengths" in front of Santos-Dumont's own doors: the hazard he
  // complained of, and passed high above coming home from the Tower.
  const skel = new THREE.Group();
  const SK_L = 62, SK_W = 16, SK_H = 21;
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= 6; i++) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, SK_H, 0.8), iron);
      col.position.set(-SK_L / 2 + (i / 6) * SK_L, SK_H / 2, sx * SK_W / 2);
      skel.add(col);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(SK_L, 0.8, 0.8), iron);
    beam.position.set(0, SK_H, sx * SK_W / 2);
    skel.add(beam);
  }
  for (let i = 0; i <= 6; i++) {                    // roof trusses, no cladding
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, SK_W), iron);
    t.position.set(-SK_L / 2 + (i / 6) * SK_L, SK_H + 0.4, 0);
    skel.add(t);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.6, 0.7), iron);
    ridge.position.set(t.position.x, SK_H + 2.2, 0);
    skel.add(ridge);
  }
  skel.position.set(-2062, 0, -46);
  skel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(skel);
  buildings.push({ x: -2062, z: -46, w: SK_L, d: SK_W, h: SK_H, top: SK_H + 4 });

  // ---- the foundation trenches that "began appearing here and there to the
  // right of my open doors": a metre deep, and his men forbidden to run across
  const trenchMat = new THREE.MeshLambertMaterial({ color: 0x4c4433 });
  const tr = mulberry32(77);
  for (let i = 0; i < 7; i++) {
    const len = 18 + tr() * 26;
    const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 2.4), trenchMat);
    t.position.set(-2115 + tr() * 90, 0.12, -95 + tr() * 60);
    t.rotation.y = tr() * Math.PI;
    scene.add(t);
  }

  // ---- Saint-Cloud itself: the Aéro-Club's ground lay on the coteaux, under
  // the wooded hillside of the park, with the village between. The château had
  // burned in 1870 and been pulled down in 1891, so what stands above the
  // grounds is the park's terraces, its cascade, and the trees. The hill is set
  // well back — its foot must not reach the aerodrome at x -2140.
  const scRand = mulberry32(1901);
  const HILL = { x: -2980, z: -60, rTop: 240, rBot: 520, h: 110 };
  const hillH = (x, z) => {
    const r = Math.hypot(x - HILL.x, z - HILL.z);
    if (r <= HILL.rTop) return HILL.h;
    return HILL.h * Math.max(0, (HILL.rBot - r) / (HILL.rBot - HILL.rTop));
  };
  const hillside = new THREE.Mesh(
    new THREE.CylinderGeometry(HILL.rTop, HILL.rBot, HILL.h, 24, 1),
    new THREE.MeshLambertMaterial({ color: 0x76854f }));
  hillside.position.set(HILL.x, HILL.h / 2, HILL.z);
  hillside.receiveShadow = true;
  scene.add(hillside);
  buildings.push({ x: HILL.x, z: HILL.z, w: HILL.rBot * 1.5, d: HILL.rBot * 1.5,
    h: HILL.h * 0.8, top: HILL.h * 0.8 });

  // The park's terraces. Each is a RETAINING structure standing from the
  // ground up to its own level, so its face meets the slope; flat slabs laid
  // at a height floated at the downhill edge and buried themselves at the
  // uphill one, which read as steps hanging in the hillside.
  const terrMat = new THREE.MeshLambertMaterial({ color: 0xb9b2a0 });
  for (let i = 0; i < 2; i++) {
    const tx = -2520 - i * 90;
    const ty = hillH(tx, -40) + 3;
    const terr = new THREE.Mesh(new THREE.BoxGeometry(80, ty, 230 - i * 60), terrMat);
    terr.position.set(tx, ty / 2, -40);
    terr.receiveShadow = terr.castShadow = true;
    scene.add(terr);
    // lawn on top, so it reads as the park it is and not a slab of masonry
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(78, 228 - i * 60),
      new THREE.MeshLambertMaterial({ color: 0x7f9152 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(tx, ty + 0.06, -40);
    lawn.receiveShadow = true;
    scene.add(lawn);
    // a line of clipped trees along the brink, and the balustrade
    for (let k = -3; k <= 3; k++) {
      const tree = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5),
        new THREE.MeshLambertMaterial({ color: 0x4f6338 }));
      const sc = 5.5;
      tree.scale.set(sc * 0.8, sc, sc * 0.8);
      tree.position.set(tx + 26, ty + sc * 0.9, -40 + k * (30 - i * 6));
      tree.castShadow = true;
      scene.add(tree);
    }
    const bal = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 230 - i * 60), terrMat);
    bal.position.set(tx + 39, ty + 1.1, -40);
    scene.add(bal);
    buildings.push({ x: tx, z: -40, w: 80, d: 230 - i * 60, h: ty, top: ty + 2.2 });
  }
  // the grande cascade spilling down between them
  const casc = new THREE.Mesh(new THREE.PlaneGeometry(20, 130),
    new THREE.MeshPhongMaterial({ color: 0x8fb6c9, shininess: 110, specular: 0xffffff }));
  casc.rotation.set(-Math.PI / 2 + 0.62, 0, Math.PI / 2);
  casc.position.set(-2478, 26, -40);
  scene.add(casc);

  // the village of Saint-Cloud, on the flat between the hill and the aerodrome
  const scWall = new THREE.MeshLambertMaterial({ color: 0xe0d6bd });
  const scRoof = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
  for (let i = 0; i < 34; i++) {
    const x = -2300 - scRand() * 110;
    const z = -400 + scRand() * 800;
    if (Math.hypot(x - PAD_POS.x, z - PAD_POS.z) < 170) continue;   // keep the field clear
    const w = 12 + scRand() * 10, d = 10 + scRand() * 8, h = 8 + scRand() * 7;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), scWall);
    house.position.set(x, h / 2, z);
    house.castShadow = house.receiveShadow = true;
    scene.add(house);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 2.2, d * 1.08), scRoof);
    roof.position.set(x, h + 1.1, z);
    scene.add(roof);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.8), scRoof);
    chim.position.set(x + (scRand() - 0.5) * w * 0.6, h + 3.2, z + (scRand() - 0.5) * d * 0.6);
    scene.add(chim);
    buildings.push({ x, z, w, d, h, top: h + 2.2 });
  }
  // the church, its spire over the village roofs
  const scChurch = new THREE.Group();
  const scNave = new THREE.Mesh(new THREE.BoxGeometry(28, 15, 14), scWall);
  scNave.position.y = 7.5; scChurch.add(scNave);
  const scSpire = new THREE.Mesh(new THREE.ConeGeometry(4.2, 24, 6), scRoof);
  scSpire.position.set(-10, 27, 0); scChurch.add(scSpire);
  scChurch.position.set(-2360, 0, 90);
  scChurch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(scChurch);
  buildings.push({ x: -2360, z: 90, w: 28, d: 14, h: 15, top: 39 });

  // and the wood of the park, standing on the slope at its own height
  for (let i = 0; i < 190; i++) {
    const x = -2460 - scRand() * 560, z = -560 + scRand() * 1000;
    const sc = 4 + scRand() * 4;
    const tr2 = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5),
      new THREE.MeshLambertMaterial({ color: 0x4d6135 }));
    tr2.scale.set(sc * 1.2, sc, sc * 1.2);
    tr2.position.set(x, hillH(x, z) + sc * 0.85, z);
    tr2.castShadow = true;
    scene.add(tr2);
  }

  // ---- the Pont de Suresnes, 1.5 km (750 m here) below the Avre passerelle,
  // where the succession of crossings on the map puts it
  const sur = new THREE.Group();
  const surDeck = new THREE.Mesh(new THREE.BoxGeometry(92, 2.2, 12), stone);
  surDeck.position.y = 6.2; sur.add(surDeck);
  for (const px of [-28, 0, 28]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(6.5, 6.2, 10), stone);
    pier.position.set(px, 3.1, 0); sur.add(pier);
  }
  for (const px of [-14, 14]) {
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 7.5, 11, 14, 1, false, 0, Math.PI), stone);
    arch.rotation.x = -Math.PI / 2;
    arch.position.set(px, 5.2, 0);
    arch.scale.set(0.95, 1, 0.52);
    sur.add(arch);
  }
  for (const sx of [-1, 1]) {
    const abut = new THREE.Mesh(new THREE.BoxGeometry(13, 6.2, 12), stone);
    abut.position.set(sx * 39, 3.1, 0); sur.add(abut);
    const slope = Math.atan2(5.6, 30);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(30, 2.2, 12),
      new THREE.MeshLambertMaterial({ color: 0x9a9285 }));
    ramp.position.set(sx * 61, 2.4, 0);
    ramp.rotation.z = -sx * slope;
    sur.add(ramp);
  }
  sur.position.set(-2036, 0, -600);
  sur.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(sur);

  // ---- the Île de Puteaux, where the No. 9 caught fire crossing the Seine,
  // and the far end of the No. 5's morning excursion from Longchamps
  const isle = new THREE.Mesh(new THREE.CircleGeometry(1, 26),
    new THREE.MeshLambertMaterial({ color: 0x7b8d55 }));
  isle.rotation.x = -Math.PI / 2;
  isle.scale.set(PUTEAUX.rx, PUTEAUX.rz, 1);
  isle.position.set(PUTEAUX.x, 0.42, PUTEAUX.z);
  scene.add(isle);
  const isleTrees = mulberry32(31);
  for (let i = 0; i < 26; i++) {
    const a = isleTrees() * Math.PI * 2, rr = Math.sqrt(isleTrees()) * 0.86;
    const s = 3 + isleTrees() * 2.5;
    const tree = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5),
      new THREE.MeshLambertMaterial({ color: 0x51663a }));
    tree.scale.set(s * 1.2, s, s * 1.2);
    tree.position.set(PUTEAUX.x + Math.cos(a) * rr * PUTEAUX.rx,
      s * 0.9, PUTEAUX.z + Math.sin(a) * rr * PUTEAUX.rz);
    tree.castShadow = true;
    scene.add(tree);
  }

  // ---- Neuilly St James: "the first of the world's air-ship stations" — a
  // great square tent striped red and white, in a walled lot by the river
  const station = new THREE.Group();
  const tent = new THREE.Mesh(new THREE.BoxGeometry(38, 17, 26),
    new THREE.MeshLambertMaterial({ map: stripedTentTexture() }));
  tent.position.y = 8.5;
  station.add(tent);
  const tentRoof = new THREE.Mesh(new THREE.ConeGeometry(26, 8, 4),
    new THREE.MeshLambertMaterial({ color: 0xefe7d6 }));
  tentRoof.rotation.y = Math.PI / 4;
  tentRoof.position.y = 21;
  station.add(tentRoof);
  for (const [wx, wz, ww, wd] of [[0, -34, 92, 1.6], [0, 34, 92, 1.6], [-46, 0, 1.6, 68], [46, 0, 1.6, 68]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 5, wd), stone);   // "my wall"
    wall.position.set(wx, 2.5, wz);
    station.add(wall);
  }
  station.position.set(-1930, 0, -1040);
  station.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(station);
  buildings.push({ x: -1930, z: -1040, w: 40, d: 28, h: 21, top: 25 });

  // ---- the Jardin d'Acclimatation's captive balloon, where the No. 1 was
  // inflated at one franc the cubic metre
  const capt = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(15, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xd8c79a }));
  ball.position.y = 96;
  capt.add(ball);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 3, 10), wood);
  basket.position.y = 78;
  capt.add(basket);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 76, 5),
    new THREE.MeshLambertMaterial({ color: 0x3a2f22 }));
  cable.position.y = 38;
  capt.add(cable);
  capt.position.set(-1560, 0, -470);
  scene.add(capt);

  // ---- the Moulin de Longchamp: the abbey's old mill, standing on the
  // racecourse he circled ten times in the No. 5
  const mill = new THREE.Group();
  const millTower = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 6, 16, 12), stone);
  millTower.position.y = 8;
  mill.add(millTower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(5.4, 5, 12),
    new THREE.MeshLambertMaterial({ color: 0x4a3d2c }));
  cap.position.y = 18;
  mill.add(cap);
  const sails = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 15, 0.4), wood);
    sail.position.y = 7.5;
    const arm = new THREE.Group();
    arm.add(sail);
    arm.rotation.z = i * Math.PI / 2;
    sails.add(arm);
  }
  sails.position.set(-5.6, 17, 0);
  mill.add(sails);
  mill.position.set(-1010, 0, 118);
  mill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(mill);
  buildings.push({ x: -1010, z: 118, w: 12, d: 12, h: 16, top: 23 });

  // ---- the Auteuil racecourse, whose crowd cheered him on the Deutsch run
  addOval(scene, -870, 430, 190, 120, 0x86a05e, 0.12);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(70, 12, 18),
    new THREE.MeshLambertMaterial({ color: 0xcfc4a8 }));
  stand.position.set(-870, 6, 566);
  stand.castShadow = true;
  scene.add(stand);
  buildings.push({ x: -870, z: 566, w: 70, d: 18, h: 12, top: 14 });

  // ---- the Parc d'Aérostation of Vaugirard: Lachambre's balloon works, where
  // he made his first ascent and started the Nos. 2 and 3
  const vg = new THREE.Group();
  const shed = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 20), stone);
  shed.position.y = 6;
  vg.add(shed);
  const gasHolder = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 16, 14),
    new THREE.MeshLambertMaterial({ color: 0x6f6a5e }));
  gasHolder.position.set(32, 8, 8);
  vg.add(gasHolder);
  vg.position.set(430, 0, 560);
  vg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(vg);
  buildings.push({ x: 430, z: 560, w: 36, d: 22, h: 12, top: 14 });
  buildings.push({ x: 462, z: 568, w: 28, d: 28, h: 16, top: 17 });

  return { sails };
}

// ---------------------------------------------------------------- Seine
// Is (x,z) within `half` metres of a river's centre line? Cheap enough to ask
// every frame: a bounding reject, then squared distance to each segment.
export function nearPolyline(pts, x, z, half) {
  const h2 = half * half;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (x < Math.min(a.x, b.x) - half || x > Math.max(a.x, b.x) + half) continue;
    if (z < Math.min(a.z, b.z) - half || z > Math.max(a.z, b.z) + half) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    let t = len2 ? ((x - a.x) * dx + (z - a.z) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ox = x - (a.x + dx * t), oz = z - (a.z + dz * t);
    if (ox * ox + oz * oz < h2) return true;
  }
  return false;
}

/**
 * The Seine, from its real centreline (paris_geo.SEINE): in at Austerlitz,
 * west under the bridges of the city, then the great loop north round the Bois
 * by Boulogne, Saint-Cloud, Suresnes and the Île de Puteaux.
 *
 * It used to be seven invented points running roughly north-south, which is
 * why the whole west end of the map — the aerodrome, the bridges, the island —
 * stood in the wrong relation to everything else.
 *
 * Traced at HALF the game frame here: buildWorld scales Paris to full size in
 * one pass at the end, so everything within it is laid out in the old frame and
 * doubled together. See fullScalePass().
 */
function seinePoints() {
  const curve = new THREE.CatmullRomCurve3(
    SEINE.map(([lat, lon]) => {
      const p = geo(lat, lon);
      return new THREE.Vector3(LEGACY_ORIGIN.x + (p.x - ORIGIN_XZ.x) / LEGACY_SCALE, 0,
        LEGACY_ORIGIN.z + (p.z - ORIGIN_XZ.z) / LEGACY_SCALE);
    }));
  return curve.getPoints(200);
}

function makeRibbon(pts, width, color, y, dull) {
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
  return new THREE.Mesh(geo, dull
    ? new THREE.MeshLambertMaterial({ color })
    : new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0xffe6c0 }));
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
      // wind the triangles so the face normal is +Z: once the ribbon is laid
      // flat (rotation.x = -90°) that becomes +Y, and the river faces the sky.
      // Wound the other way the whole Seine was back-facing — culled away, so
      // what you saw was the stone quay beneath it, and the river looked like dirt.
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
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
// Shared frontage generator: buildings along both sides of a street list,
// oriented to the street. Used by Paris and Monaco.
export function generateFrontages(streets, canPlace, rand, opts = {}) {
  const hMin = opts.hMin ?? 14, hVar = opts.hVar ?? 10;
  const list = [];
  const push = (x, z, w, d, h, ry, r) => {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    list.push({
      x, z, w: w * c + d * s, d: w * s + d * c, h,
      rw: w, rd: d, ry, r,
      nChim: 2 + Math.floor(r * 2),
    });
  };
  for (const st of streets) {
    if (!st.frontage) continue;
    for (let sIdx = 0; sIdx < st.pts.length - 1; sIdx++) {
      const [x1, z1] = st.pts[sIdx], [x2, z2] = st.pts[sIdx + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const dirx = (x2 - x1) / len, dirz = (z2 - z1) / len;
      const nx = -dirz, nz = dirx;
      const ry = Math.atan2(-dirz, dirx);
      let t = 12 + rand() * 12;
      while (t < len - 14) {
        const w = (opts.wMin ?? 18) + rand() * (opts.wVar ?? 14);
        const depth = (opts.dMin ?? 15) + rand() * (opts.dVar ?? 8);
        for (const side of [-1, 1]) {
          if (rand() < 0.12) continue;
          const off = st.w / 2 + depth / 2 + 1.5;
          const cx = x1 + dirx * (t + w / 2) + nx * off * side;
          const cz = z1 + dirz * (t + w / 2) + nz * off * side;
          if (!canPlace(cx, cz)) continue;
          let h = hMin + rand() * hVar;
          if (rand() < 0.05) h *= 1.5;
          push(cx, cz, w, depth, h, ry, rand());
        }
        t += w + 3 + rand() * 6;
      }
    }
  }
  return list;
}

// Buildings generate along their real street frontages (paris_plan.js),
// oriented to the street — plus an interior fill for the deep-city skyline
// and the Exposition pavilion rows along the river quays.
function buildCity(scene, riverPts) {
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
  const canPlace = (x, z) => !inSite(x, z) && distToRiver(x, z) > 58;

  const list = generateFrontages(STREETS, canPlace, rand);

  // interior fill: the deep-city backdrop east of the race line
  for (let gx = 480; gx <= 1240; gx += 54) {
    for (let gz = -760; gz <= 760; gz += 54) {
      const x = gx + (rand() - 0.5) * 14, z = gz + (rand() - 0.5) * 14;
      if (!canPlace(x, z)) continue;
      if (distToStreets(x, z) < 34) continue;
      if (rand() < 0.25) continue;
      const w = 30 + rand() * 14, d = 30 + rand() * 14, r = rand();
      list.push({ x, z, w, d, h: 13 + rand() * 9, rw: w, rd: d, ry: 0, r, nChim: 2 });
    }
  }

  addBuildingMeshes(scene, list);

  // the Exposition pavilions of 1900 line both quays near the Tower
  addExpoPavilions(scene, riverPts, list, rand);
  return list;
}

export function addBuildingMeshes(scene, list, colorOf) {
  const n = list.length;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0);
  const body = new THREE.InstancedMesh(bodyGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: makeFacadeTexture() }), n);
  const roof = new THREE.InstancedMesh(bodyGeo.clone(), new THREE.MeshLambertMaterial({ color: 0x4a4f57 }), n);
  let chimTotal = 0;
  for (const b of list) chimTotal += b.nChim;
  const chim = new THREE.InstancedMesh(bodyGeo.clone(), new THREE.MeshLambertMaterial({ color: 0x7a5a4a }), chimTotal);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const col = new THREE.Color();
  let ci = 0;
  const rand = mulberry32(7);
  list.forEach((b, i) => {
    const ry = b.ry || 0, rw = b.rw || b.w, rd = b.rd || b.d;
    q.setFromAxisAngle(yAxis, ry);
    m.compose(pos.set(b.x, 0, b.z), q, scl.set(rw, b.h, rd));
    body.setMatrixAt(i, m);
    if (colorOf) colorOf(b, col);
    else col.setHSL(0.09 + b.r * 0.02, 0.22, 0.66 + b.r * 0.1);
    body.setColorAt(i, col);
    const roofH = 3.5 + b.r * 1.5;
    m.compose(pos.set(b.x, b.h, b.z), q, scl.set(rw * 0.84, roofH, rd * 0.84));
    roof.setMatrixAt(i, m);
    b.top = b.h + roofH;
    const cR = Math.cos(ry), sR = Math.sin(ry);
    for (let k = 0; k < b.nChim; k++) {
      const lx = (rand() - 0.5) * rw * 0.6, lz = (rand() - 0.5) * rd * 0.6;
      const cx = b.x + lx * cR + lz * sR;
      const cz = b.z - lx * sR + lz * cR;
      m.compose(pos.set(cx, b.top - 0.5, cz), q, scl.set(1.2, 2.2 + rand() * 1.4, 1.2));
      chim.setMatrixAt(ci++, m);
    }
  });
  body.instanceColor.needsUpdate = true;
  body.castShadow = body.receiveShadow = true;
  roof.castShadow = roof.receiveShadow = true;
  chim.castShadow = true;
  scene.add(body, roof, chim);
}

// the white pavilions of the 1900 Exposition, domed, along the riverfront
function addExpoPavilions(scene, riverPts, list, rand) {
  const pav = [];
  for (let i = 60; i <= 94; i += 3) {
    const p = riverPts[i], q2 = riverPts[i + 1];
    const tx = q2.x - p.x, tz = q2.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    const ry = Math.atan2(-tz / tl, tx / tl);
    for (const side of [-1, 1]) {
      if (rand() < 0.2) continue;
      const cx = p.x + nx * 64 * side, cz = p.z + nz * 64 * side;
      if (inSite(cx, cz)) continue;
      pav.push({ x: cx, z: cz, ry, r: rand() });
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      list.push({ x: cx, z: cz, w: 28 * c + 16 * s, d: 28 * s + 16 * c, h: 14, top: 21, nChim: 0, r: 0 });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const bodyM = new THREE.InstancedMesh(geo,
    new THREE.MeshLambertMaterial({ color: 0xe9e2d0 }), pav.length);
  const domeM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9cfae }), pav.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  pav.forEach((b, i) => {
    q.setFromAxisAngle(yAxis, b.ry);
    m.compose(pos.set(b.x, 0, b.z), q, scl.set(28, 14, 16));
    bodyM.setMatrixAt(i, m);
    m.compose(pos.set(b.x, 14, b.z), q, scl.set(7, 6 + b.r * 3, 7));
    domeM.setMatrixAt(i, m);
  });
  bodyM.castShadow = bodyM.receiveShadow = true;
  domeM.castShadow = true;
  scene.add(bodyM, domeM);
}

// Place de la Concorde: the obelisk with its gilded cap
function makeConcorde() {
  const g = new THREE.Group();
  const ob = new THREE.Mesh(new THREE.BoxGeometry(2.6, 23, 2.6),
    new THREE.MeshLambertMaterial({ color: 0xc9b68a }));
  ob.position.y = 11.5; g.add(ob);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3, 4),
    new THREE.MeshPhongMaterial({ color: 0xc9a437, shininess: 90 }));
  cap.position.y = 24.5; g.add(cap);
  g.position.set(900, 0, -180);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// the Madeleine: the temple front at the head of the Rue Royale
function makeMadeleine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(38, 16, 22),
    new THREE.MeshLambertMaterial({ color: 0xd6cbb4 }));
  body.position.y = 8; g.add(body);
  const roofM = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 12),
    new THREE.MeshLambertMaterial({ color: 0x46505c }));
  roofM.position.y = 18; g.add(roofM);
  g.position.set(810, 0, -380);
  g.rotation.y = 0.5;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- Bois
function addTrees(scene) {
  const rand = mulberry32(99);
  const pts = [];
  for (let i = 0; i < 1250; i++) {
    const x = -1900 + rand() * 1560, z = -560 + rand() * 1120;
    const dx = (x - LONGCHAMPS.x) / (LONGCHAMPS.rx + 14), dz = (z - LONGCHAMPS.z) / (LONGCHAMPS.rz + 14);
    if (dx * dx + dz * dz < 1) continue;
    if ((x - PAD_POS.x) ** 2 + (z - PAD_POS.z) ** 2 < 160 * 160) continue;
    if (distToStreets(x, z) < 13) continue; // keep the carriage roads clear
    pts.push({ x, z, s: 3 + rand() * 3.4, r: rand() });
  }
  // Three instanced passes make a tree instead of a green ball: a rigid trunk,
  // the main crown, and a second smaller lobe that breaks the silhouette. Only
  // the foliage is windified — a trunk does not sway.
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const V = new THREE.Vector3(), S = new THREE.Vector3();
  const col = new THREE.Color();

  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.75, 1, 5);
  trunkGeo.translate(0, 0.5, 0);      // stand it on the ground
  const trunks = new THREE.InstancedMesh(trunkGeo,
    new THREE.MeshLambertMaterial({ color: 0x5b4a34 }), pts.length);

  const crownGeo = new THREE.SphereGeometry(1, 7, 5); crownGeo.translate(0, 0.6, 0);
  const foliageMat = windify(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const crowns = new THREE.InstancedMesh(crownGeo, foliageMat, pts.length);
  const lobes = new THREE.InstancedMesh(crownGeo, foliageMat, pts.length);

  pts.forEach((p, i) => {
    // trunk: slim, up into the crown
    S.set(p.s * 0.13, p.s * 1.0, p.s * 0.13);
    m.compose(V.set(p.x, 0, p.z), q.identity(), S);
    trunks.setMatrixAt(i, m);

    // the crown, exactly where it was before (the collision radius depends on it)
    m.makeScale(p.s * 1.25, p.s, p.s * 1.25).setPosition(p.x, p.s * 0.55, p.z);
    crowns.setMatrixAt(i, m);

    // a lesser lobe, leaning off to one side
    const a = p.r * Math.PI * 2, off = p.s * (0.28 + p.r * 0.16);
    m.makeScale(p.s * 0.72, p.s * 0.62, p.s * 0.72)
      .setPosition(p.x + Math.cos(a) * off, p.s * (0.95 + p.r * 0.25), p.z + Math.sin(a) * off);
    lobes.setMatrixAt(i, m);

    col.setHSL(0.25 + p.r * 0.06, 0.30 + p.r * 0.10, 0.28 + p.r * 0.14);
    crowns.setColorAt(i, col);
    col.offsetHSL(0.005, 0, 0.05);     // the sunward lobe sits a shade lighter
    lobes.setColorAt(i, col);
  });
  crowns.instanceColor.needsUpdate = true;
  lobes.instanceColor.needsUpdate = true;
  crowns.castShadow = lobes.castShadow = trunks.castShadow = true;
  scene.add(trunks, crowns, lobes);
  return pts; // {x, z, s}: crown center ~ y = s*0.55+0.6*s, radius ~ s*1.1
}

// ---------------------------------------------------------------- Eiffel Tower
// The Tower as she stood: four legs on a curve that bows in hard off the
// ground and straightens as it climbs, laced with cross-braces, four arches at
// the base, three platforms, the campanile and the lightning conductor he
// rounded "at a distance of about 50 metres". Every member goes into ONE
// instanced mesh — some four hundred of them for a single draw call.
const TOWER_ANCH = [[0, 52], [100, 21], [200, 9.5], [295, 2.4], [305, 2.0]];

// half-offset of a leg's centre line from the axis, at height y
function legHalf(y) {
  for (let i = 1; i < TOWER_ANCH.length; i++) {
    const [y0, r0] = TOWER_ANCH[i - 1], [y1, r1] = TOWER_ANCH[i];
    if (y <= y1) {
      const u = Math.max(0, (y - y0) / (y1 - y0));
      return r0 + (r1 - r0) * Math.pow(u, 0.75);   // bows inward, then straightens
    }
  }
  return 2.0;
}

function makeTower() {
  const g = new THREE.Group();
  const members = [];          // {a, b, w} — a girder from a to b, w metres thick
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const put = (x1, y1, z1, x2, y2, z2, w) => members.push({
    a: new THREE.Vector3(x1, y1, z1), b: new THREE.Vector3(x2, y2, z2), w });

  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const levels = [];
  for (let y = 0; y <= 300; y += 6) levels.push(y);

  // ---- the four legs, each a chain following the curve
  for (const [sx, sz] of corners) {
    for (let i = 1; i < levels.length; i++) {
      const y0 = levels[i - 1], y1 = levels[i];
      const h0 = legHalf(y0), h1 = legHalf(y1);
      const w = 3.4 - 2.6 * (y0 / 300);
      put(sx * h0, y0, sz * h0, sx * h1, y1, sz * h1, w);
    }
  }

  // ---- ties and cross-bracing on all four faces, between every other level
  for (let i = 2; i < levels.length; i += 2) {
    const y0 = levels[i - 2], y1 = levels[i];
    const h0 = legHalf(y0), h1 = legHalf(y1);
    const w = 1.0 - 0.55 * (y0 / 300);
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      put(ax * h1, y1, az * h1, bx * h1, y1, bz * h1, w);            // horizontal tie
      put(ax * h0, y0, az * h0, bx * h1, y1, bz * h1, w * 0.8);      // the X
      put(bx * h0, y0, bz * h0, ax * h1, y1, az * h1, w * 0.8);
    }
  }

  // ---- the four great arches under the first platform
  for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
    const N = 10;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const pt = (u) => {
        const h = legHalf(8 + u * 48);
        const x = (ax + (bx - ax) * u) * h, z = (az + (bz - az) * u) * h;
        return [x, 14 + Math.sin(Math.PI * u) * 44, z];
      };
      const [x0, y0, z0] = pt(u0), [x1, y1, z1] = pt(u1);
      put(x0, y0, z0, x1, y1, z1, 1.6);
    }
  }

  // ---- one instanced mesh for the whole lattice
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const latMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const lattice = new THREE.InstancedMesh(boxGeo, latMat, members.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  members.forEach((mem, i) => {
    dir.copy(mem.b).sub(mem.a);
    const len = dir.length() || 0.001;
    q.setFromUnitVectors(up, dir.normalize());
    A.copy(mem.a).add(mem.b).multiplyScalar(0.5);
    m.compose(A, q, B.set(mem.w, len, mem.w));
    lattice.setMatrixAt(i, m);
    // the real tower was painted in graded shades, darkest at the feet
    const t = Math.min(1, A.y / 300);
    col.setHSL(0.078, 0.26 - t * 0.08, 0.17 + t * 0.13);
    lattice.setColorAt(i, col);
  });
  lattice.instanceColor.needsUpdate = true;
  lattice.castShadow = true;
  g.add(lattice);

  // ---- platforms, with a railing course around each
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x4a3f31 });
  const platRail = new THREE.MeshLambertMaterial({ color: 0x2e2820 });
  const platform = (y, half, thick) => {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2.3, thick, half * 2.3), deckMat);
    deck.position.y = y; deck.castShadow = true; g.add(deck);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2.36, 2.4, half * 2.36), platRail);
    rail.position.y = y + thick / 2 + 1.2; g.add(rail);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(half * 2.1, 3, half * 2.1), deckMat);
    inner.position.y = y + thick / 2 + 1.2; g.add(inner);   // hollow it with an inset block
  };
  platform(100, legHalf(100) + 8, 5);
  platform(200, legHalf(200) + 5, 4);
  platform(292, legHalf(292) + 4, 3.4);

  // ---- the campanile, the lantern, and the conductor at the very top
  const capMat = new THREE.MeshLambertMaterial({ color: 0x5a4d3c });
  const campanile = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.6, 9, 10), capMat);
  campanile.position.y = 299; campanile.castShadow = true; g.add(campanile);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8c477, emissive: 0x6b5320 }));
  lantern.position.y = 306; g.add(lantern);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 14, 6), capMat);
  mast.position.y = 314; g.add(mast);   // "the Tower's lightning conductor"

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
  body.position.set(-2225, 7.5, 0);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 2.5, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a3a28 }));
  roof.position.set(-2225, 16.2, 0);
  g.add(roof);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(15, 12),
    new THREE.MeshLambertMaterial({ color: 0x241a12 }));
  door.rotation.y = Math.PI / 2;
  door.position.set(-2202.9, 6, 0);
  g.add(door);
  // flag mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
  mast.position.set(-2240, 11, 14); g.add(mast);
  const flagGeo = new THREE.PlaneGeometry(6, 3);
  flagGeo.translate(3, 0, 0); // pivot at the mast so it can stream downwind
  const flag = new THREE.Mesh(flagGeo,
    new THREE.MeshLambertMaterial({ color: 0xb5442f, side: THREE.DoubleSide }));
  flag.position.set(-2240, 20.5, 14); g.add(flag);
  g.userData.flag = flag;
  return g;
}

// ---------------------------------------------------------------- clouds
// Fair-weather cumulus: flat shaded bases, bright cauliflower tops; plus a
// veil of high cirrus streaks aligned with the gradient wind.
export function makeClouds(scene, windBase) {
  const clouds = [];
  const rand = mulberry32(1234);
  const topMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x4a453c, fog: true });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0xcbc0b0, emissive: 0x38332b, fog: true });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1e1812, transparent: true, opacity: 0.09, depthWrite: false });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 22; i++) {
    const grp = new THREE.Group();
    const towering = rand() < 0.28;                 // one in four builds upward
    const r = (58 + rand() * 90) * (towering ? 1.25 : 1);
    // shaded base row — a flat underside at the condensation level, wider than
    // the tops so the cloud sits on its own shelf of shadow
    const nBase = 6 + Math.floor(rand() * 4);
    for (let k = 0; k < nBase; k++) {
      const puff = new THREE.Mesh(puffGeo, baseMat);
      const u = k / (nBase - 1) - 0.5;
      const pr = r * (0.26 + rand() * 0.2) * (1 - Math.abs(u) * 0.45);
      puff.scale.set(pr * 1.6, pr * 0.3, pr * 1.15);
      puff.position.set(u * r * 1.8 + (rand() - 0.5) * r * 0.18,
        (rand() - 0.5) * r * 0.03, (rand() - 0.5) * r * 0.55);
      grp.add(puff);
    }
    // cauliflower: lobes stacked in tiers, each tier smaller and higher, so
    // the silhouette bubbles instead of reading as three loose balls
    const tiers = towering ? 4 : 3;
    for (let tier = 0; tier < tiers; tier++) {
      const f = tier / tiers;
      const nT = Math.max(2, Math.round((4 - tier) + rand() * 2));
      for (let k = 0; k < nT; k++) {
        const puff = new THREE.Mesh(puffGeo, topMat);
        const pr = r * (0.30 - f * 0.13 + rand() * 0.12);
        const spread = r * (0.95 - f * 0.6);
        puff.scale.set(pr * 1.15, pr * (0.8 + rand() * 0.3), pr);
        puff.position.set((rand() - 0.5) * spread * 2,
          r * (0.1 + f * (towering ? 0.85 : 0.5)) + rand() * r * 0.07,
          (rand() - 0.5) * spread);
        grp.add(puff);
      }
    }
    grp.rotation.y = rand() * Math.PI * 2;
    grp.position.set(-1800 + rand() * 3400,
      (towering ? 190 : 225) + rand() * 150, -1500 + rand() * 3000);
    scene.add(grp);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 20), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(grp.position.x, 0.45, grp.position.z);
    scene.add(shadow);
    // the seeded birthplace is kept: every position after it is measured from
    // here, so the sky can be computed for any instant rather than stepped to
    clouds.push({ grp, shadow, r, towering, drift: 0.4 + rand() * 0.5,
      home: { x: grp.position.x, z: grp.position.z } });
  }
  // cirrus veil, streaked along the prevailing wind
  const windAng = windBase ? Math.atan2(-windBase.z, windBase.x) : 0;
  const cirrusTex = makeCirrusTexture();
  for (let k = 0; k < 7; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(900 + rand() * 500, 150 + rand() * 90),
      new THREE.MeshBasicMaterial({ map: cirrusTex, transparent: true, opacity: 0.16 + rand() * 0.1,
        depthWrite: false, fog: true }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -windAng + (rand() - 0.5) * 0.3;
    m.position.set(-1500 + rand() * 3000, 620 + rand() * 160, -1200 + rand() * 2400);
    m.renderOrder = -5;
    scene.add(m);
  }
  return clouds;
}

let _cirrus = null;
function makeCirrusTexture() {
  if (_cirrus) return _cirrus;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const rand = mulberry32(77);
  g.clearRect(0, 0, 256, 64);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(255,252,246,${0.05 + rand() * 0.1})`;
    const y = 8 + rand() * 48, len = 40 + rand() * 150;
    g.beginPath();
    g.ellipse(rand() * 256, y, len, 1.2 + rand() * 2.4, 0, 0, 7);
    g.fill();
  }
  _cirrus = new THREE.CanvasTexture(c);
  return _cirrus;
}

// ---------------------------------------------------------------- the sky's clock
// The weather must be a function of the TIME, not of how long a page has been
// open. Integrating drift frame by frame meant two pilots who loaded the game a
// minute apart had their clouds a hundred metres apart, different gusts, and
// different lift — on a leaderboard that is not the same sky at all.
//
// UTC, deliberately: a local-date seed puts a pilot in Paris and a pilot in
// St. Louis under different weather on the same afternoon.
export function skyTime() {
  const d = new Date();
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
}
export function skyDay() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function skyDaySeed() {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

const CLOUD_SPAN = 5200;                        // they wrap over a 5.2 km field
function wrapField(v) {
  return ((v + CLOUD_SPAN / 2) % CLOUD_SPAN + CLOUD_SPAN) % CLOUD_SPAN - CLOUD_SPAN / 2;
}

/**
 * Where the clouds are at sky-time `t`. A closed form, not an integration, so
 * it does not matter when you arrived — and travelling between cities no longer
 * restarts the clouds while the gusts carry on.
 *
 * They ride the day's PREVAILING wind, not the gusting one: cumulus are carried
 * by the mean current, and it keeps the position a pure function of t.
 */
export function updateClouds(clouds, windBase, t) {
  for (const c of clouds) {
    const w = windAt(windBase, c.grp.position.y);
    c.grp.position.x = wrapField(c.home.x + w.x * c.drift * t);
    c.grp.position.z = wrapField(c.home.z + w.z * c.drift * t);
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
