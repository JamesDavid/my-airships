// Dawn Paris, stylized after the book's descriptions (docs/BOOK_REFERENCE.md Part A):
// chimney-pot rooftops (A1), the Bois as an ocean of greenery (A2), the Eiffel Tower
// as omnipresent landmark and winning-post (A3), drifting clouds that shadow the
// ground (A4), and the red/white striped canvas aerodrome (A11).

import * as THREE from 'three';
import { geo, place, placeLegacy, SEINE, ORIGIN_XZ, LEGACY_ORIGIN, LEGACY_SCALE } from './paris_geo.js';
import { HF as PHF, groundAt as parisGroundASL, slopeAt as parisSlope,
         SEINE_XZ, riverNear, RIVER_HALF, RIVER_GAP } from './paris_terrain.js';

/**
 * Paris has relief, and it always did — the game simply had not measured it.
 *
 * The datum is the Eiffel Tower's own foot, 33.7 m above the sea, because that
 * is where the world's y = 0 has been all along: every gate, every scenario
 * height, every tuned number in this file is written against it. Keeping it
 * means the ground moves and nothing else has to.
 *
 * So the Champ de Mars stays at 0, the Seine runs about seven metres BELOW it
 * in its valley — which is why there are quays and steps down to them — the
 * Trocadero stands on the Chaillot bluff twenty-six metres up, and Montmartre
 * is a butte eighty-six metres over the Tower's feet.
 *
 * The barometer is left reading from the datum rather than from the ground
 * underneath, which is what a barometer does: it cannot see that there is a
 * hill below it.
 */
export const PARIS_DATUM = 33.7;
export function parisGround(x, z) { return parisGroundASL(x, z) - PARIS_DATUM; }
const placeLegacy0 = (lat, lon) => {
  const p = geo(lat, lon);
  return { x: LEGACY_ORIGIN.x + (p.x - ORIGIN_XZ.x) / LEGACY_SCALE,
           z: LEGACY_ORIGIN.z + (p.z - ORIGIN_XZ.z) / LEGACY_SCALE };
};
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { STREETS, SITES, inSite, distToStreets, streetClearance } from './paris_plan.js';
import { WALL_RUNS, WALL } from './paris_wall.js';
import { PONT, AVRE, CHURCH, PARK, LONGCHAMP as LC_REAL, AUTEUIL as AU_REAL } from './paris_stcloud.js';
import { LANDMARKS } from './paris_landmarks.js';
import { OSM_BUILDINGS } from './paris_buildings.js';

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
// The gradient is a BOUNDARY LAYER: it is set by the ground the air is
// scraping over, so it must be reckoned from that ground and not from the sea.
// Measuring it from datum put the calm bottom of it inside the hills — over the
// Passy plateau (ground +30 m) a pilot ten metres above the roofs already sat
// at 64% of the free wind with nowhere lower to go, and over Montmartre
// (+130 m) the whole gradient was underground and the streets blew full
// strength. That is what made "fly LOW, the wind is thinner near the ground"
// a promise the world would not keep (#97, #100).
//
// The upper current stays on absolute height — a different river of air at
// 180-320 m is a fact about the altitude, not about the roof below it.
export function windAt(wind, y, ground = 0) {
  const agl = Math.max(0, y - ground);
  const f = 0.42 + 0.58 * Math.min(Math.max(agl / 120, 0), 1);
  // slight surface veer as the gradient wind comes in
  const lowAng = 0.17 * Math.min(Math.max(agl / 120, 0), 1);
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

/**
 * Keep some objects out of a water surface's reflection.
 *
 * The reflection is a second pass over the whole scene from a mirrored camera,
 * and it is honest about what it finds — which is the trouble. Our clouds are
 * low-poly spheres with a flat tan underside, and reflected off a bright sea at
 * a grazing angle they do not read as clouds at all: they read as sandbanks,
 * lying in the water a few hundred metres out, with the waves rippling over
 * them. It looks exactly like z-fighting and it is not.
 *
 * So the reflection pass simply does not see them. Their shadow discs still
 * fall on the water, which is the cue that matters to a pilot.
 */
export function keepOutOfReflection(water, objects) {
  const inner = water.onBeforeRender;
  if (typeof inner !== 'function') return;
  water.onBeforeRender = function (renderer, scene, camera) {
    const was = objects.map((o) => o.visible);
    for (const o of objects) o.visible = false;
    inner.call(this, renderer, scene, camera);
    objects.forEach((o, i) => { o.visible = was[i]; });
  };
}

// Half real scale: St. Cloud to the Tower is ~2.5 km here (5.5 km in 1901),
// so climbing for the gradient wind genuinely pays on each leg.
const _twr = placeLegacy('eiffel');
export const TOWER_POS = new THREE.Vector3(_twr.x, 0, _twr.z);
/**
 * Old half-frame coordinates, carried to the full-scale world.
 *
 * Everything west of the city — the aerodrome and the Aéro-Club's ground, the
 * Pont de Saint-Cloud, the Avre aqueduct, the village and its church, Deutsch's
 * air-ship shed, Suresnes, the Moulin de Longchamp, Auteuil — was written by
 * hand in the frame that had the Tower at (260,150) and two real metres to the
 * game metre. When the world went to full scale those numbers stayed put and
 * the features were left standing three kilometres from the places they belong
 * to: a river crossing in open country with no river under it.
 *
 * Sizes double as well as positions: they were half-scale objects.
 */
const H2 = (x, z) => ({ x: ORIGIN_XZ.x + (x - 260) * 2, z: ORIGIN_XZ.z + (z - 150) * 2 });

/**
 * Put a crossing ON the water it crosses.
 *
 * The Saint-Cloud group — the bridge, the Avre aqueduct, the village, the
 * church — is laid out in the world's old HALF FRAME and converted by H2. That
 * conversion is still right; what is no longer right is the ground under it.
 * The aerodrome moved to the Aéro-Club's true position when the world was
 * re-surveyed, and the Seine moved to OpenStreetMap's, and these hand-placed
 * objects stayed where they were. Measured: the Pont de Saint-Cloud stood
 * 636 m from any water and the Avre aqueduct 564 m, NINE METRES from the centre
 * of Longchamps racecourse — which is what a pilot was looking at when he filed
 * "Longchamps racecourse has a bridge in the middle of it?"
 *
 * A bridge that is not over water is wrong under any reading, so both are
 * snapped to the nearest station of the surveyed river and turned across its
 * flow. Re-laying the whole Saint-Cloud scene against the real bank is a bigger
 * job and it is step 7 of docs/PARIS_1901.md.
 */
function onTheRiver(x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < SEINE_XZ.length; i++) {
    const d = Math.hypot(SEINE_XZ[i][0] - x, SEINE_XZ[i][1] - z);
    if (d < bd) { bd = d; bi = i; }
  }
  const a = SEINE_XZ[Math.max(0, bi - 1)], b = SEINE_XZ[Math.min(SEINE_XZ.length - 1, bi + 1)];
  const tx = b[0] - a[0], tz = b[1] - a[1];
  const tl = Math.hypot(tx, tz) || 1;
  // a deck whose long axis is local +x, laid across the flow
  return { x: SEINE_XZ[bi][0], z: SEINE_XZ[bi][1], ry: Math.atan2(tx / tl, -tz / tl), moved: bd };
}

const _sc = placeLegacy('stcloud');
// The Aéro-Club's ground lay on the FLAT beside the Seine, with the park of
// Saint-Cloud and its wooded hill rising behind it to the west — that is why
// the Deutsch runs started over the river and not over a hillside. The pad sat
// on the hill's own slope when the world went to full scale.
// Chosen by measurement, not by eye: dry, dead flat over a 200 m field, off
// the park's hill, and two hundred metres from the water — the Aéro-Club's
// ground lay on the plain between the hill and the Seine, which is why the
// Deutsch runs began by crossing the river.
// THE AERODROME IS ACROSS THE RIVER FROM LONGCHAMPS. It was +400 east of the
// anchor, and the anchor stands 131 m from the water — so the field was on the
// Bois bank, the same side as the racecourse. A pilot asked outright: "Was the
// aero club here or on the other side of the river?" (bug #49).
//
// The book answers it. Ch. XV, coming home from the Tower: "I passed above
// Longchamps, CROSSED THE SEINE, and continued on at full speed over the heads
// of the Commission and the spectators" — and Ch. XII calls St Cloud "a slope
// of the River Seine". Longchamps, then the water, then the field.
//
// Solved against the drawn river: this is the only quarter that is on the far
// bank (one crossing to Longchamps), 244 m from the water, flat enough to walk
// an air-ship out on (slope 0.028), and 772 m clear of the modelled hillside.
// It also sets the Deutsch course at 5.4 km each way, against the 4.9 km the
// old position gave, and the real St-Cloud-to-Tower distance is about 5.5.
export const PAD_POS = new THREE.Vector3(_sc.x - 300, 2.0, _sc.z - 800);
export const START_RING = new THREE.Vector3(PAD_POS.x + 220, 55, PAD_POS.z - 40);
/**
 * The Aéro-Club's balloon shed — where it stands, and how big it is.
 *
 * In one place because Deutsch's air-ship house is positioned RELATIVE to its
 * doors: "scarcely two air-ships' lengths in front of" them is the whole point
 * of that building, and two things written as separate coordinates drift apart
 * the moment either is touched. Doors face east, on to the field.
 */
export const SHED = { dx: -85, dz: 0, w: 52, d: 34, h: 15 };

// Neuilly St James: the radius of the walled lot, and the bearing of its
// gateway — the way the tent faces and the way the ships came out, which is
// toward Bagatelle and the river beyond it. Published so the scenario that
// starts inside the wall and the check that measures it read one number.
export const NEUILLY_R = 95;
export const NEUILLY_OUT = 2.294;         // atan2(z, x) toward Bagatelle
/**
 * The turn round the Eiffel Tower, cut to the tower.
 *
 * A 24 m hoop beside a 312 m tower reads as a bracelet on a lamp-post: it tells
 * the pilot nothing about the thing he is being asked to round. So the gate is
 * a rectangle the tower's own height, half that wide, standing off the ground
 * by a quarter of it — you fly through a doorway the size of the tower, which
 * is what rounding it actually feels like from the basket.
 *
 * 312 m is the tower as this world builds it (see TOWER_ANCH below, whose top
 * station is 312). Change one and change the other.
 */
export const TOWER_H = 312;
export const TOWER_RING = Object.assign(
  new THREE.Vector3(_twr.x + 340, TOWER_H / 4 + TOWER_H / 2, _twr.z),
  { gw: TOWER_H / 2, gh: TOWER_H },
);

// The racecourses, from their real ground (src/paris_stcloud.js) rather than a
// hand-typed ellipse. Longchamp was drawn 520 x 300; the real course is 418 by
// 705 — TALLER THAN IT IS WIDE, so the game had it turned through ninety
// degrees. That is why the western two thirds of the track fell outside every
// exclusion meant to keep buildings off it, and why six houses stood on it.
const LONGCHAMPS = { x: LC_REAL.x, z: LC_REAL.z, rx: LC_REAL.rx, rz: LC_REAL.rz };
const AUTEUIL = { x: AU_REAL.x, z: AU_REAL.z, rx: AU_REAL.rx, rz: AU_REAL.rz };

export function buildWorld(scene) {
  windMats.length = 0;
  // ---------- sky, light, fog ----------
  scene.fog = new THREE.FogExp2(0xeccfa8, 0.00021);   // half the density: twice the distances

  const sunDir = new THREE.Vector3(1, 0.14, 0.16).normalize();
  const sky = makePhysicalSky(scene, sunDir, { rayleigh: 2.6, turbidity: 7 });
  // the sky sits at the origin and is ten kilometres across: never cull it.
  // Culling it by distance from the pilot turned the heavens black everywhere
  // except within 900 m of the Eiffel Tower, which is where the origin is.
  farSeen(sky);
  const hemi = new THREE.HemisphereLight(0xfde3bd, 0x6b6b52, 0.75);
  scene.add(hemi);
  const sun = makeShadowSun(scene, sunDir, 2.6);

  // ---------- the ground, as surveyed ----------
  // It was a flat disc nine kilometres across. It is now IGN's bare-earth model
  // (src/paris_terrain.js) at twice the survey's resolution, with the same
  // patchwork texture over it so the open country still reads as country.
  // Beyond the survey a flat skirt carries on to the horizon at the datum.
  // The one level the Seine is drawn at, wanted by the terrain below and by the
  // water sheet further down. Published on the world so a check can measure the
  // bed against it rather than working it out again for itself.
  const RIVER_Y = seinePoints()[0].y;
  {
    const SUB = 2;
    const gx = (PHF.nx - 1) * SUB, gz = (PHF.nz - 1) * SUB;
    const st = PHF.step / SUB;
    const g = new THREE.PlaneGeometry(gx * st, gz * st, gx, gz);
    g.rotateX(-Math.PI / 2);
    const cx = PHF.x0 + (gx * st) / 2, cz = PHF.z0 + (gz * st) / 2;
    const a = g.attributes.position;
    // THE BED IS HELD UNDER THE WATER, and it was not.
    //
    // The Seine is one flat sheet 140 m wide following the survey, and the
    // terrain generator carves a bed for it — but the heightfield is on a 50 m
    // grid and the carve is a distance test, so between a carved station and an
    // uncarved one the ground interpolates back up. Measured across the whole
    // river: 3.8% of the ground under the water sheet stood at or above it, the
    // worst by 2.92 m, and those are the bright rippling patches lying on the
    // bank and flickering as the eye moves — the z-fighting reported from the
    // headset over Saint-Cloud.
    //
    // Narrowing the sheet does not cure it: even at 92 m wide, which is far
    // narrower than the Seine, samples still touch. So the MESH is held clear
    // instead, exactly as Monaco's seabed is: any vertex inside the river
    // corridor is pushed to at least a metre under the surface. Only the
    // drawing moves — parisGround still answers what the survey says, so the
    // guide rope, the landing and isWater are all unchanged.
    const BED_CLEAR = 1.0;
    for (let i = 0; i < a.count; i++) {
      const wx = a.getX(i) + cx, wz = a.getZ(i) + cz;
      let y = parisGround(wx, wz);
      const near = riverNear(wx, wz);
      if (near && near.dist < RIVER_HALF && y > RIVER_Y - BED_CLEAR) y = RIVER_Y - BED_CLEAR;
      a.setY(i, y);
    }
    g.computeVertexNormals();
    const tex = makeGroundTexture();
    tex.repeat.set(gx * st / 256, gz * st / 256);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
    terrain.name = 'paris-terrain';        // asked for by name, not by being biggest
    terrain.position.set(cx, 0, cz);
    terrain.receiveShadow = true;
    terrain.userData.noLift = true;
    scene.add(terrain);

    // FOUR APRONS along the survey's four edges — not a disc, and not a ring.
    //
    // A disc laid at a single height under the whole world buries anything the
    // ground dips below it, and the Seine runs seven metres down in its valley,
    // so the river disappeared under its own horizon filler. That was fixed by
    // making it a ring — but the ring's inner radius was half the survey's
    // DIAGONAL, 6,424 m, while the survey is a rectangle whose nearest edge is
    // only 3,150 m out. Between the two there was nothing at all: fly south
    // past z = 2500 and the world stopped, which is what a pilot filed as
    // "paris just ends on a void?" (bug_reports #27).
    //
    // An apron per edge cannot have that fault, because each one starts exactly
    // where the survey stops. And the inner row of each is sampled from the
    // ground itself rather than laid flat, so the join has no step in it: the
    // apron carries the survey's own edge profile out to the horizon.
    const x0 = PHF.x0, x1 = PHF.x0 + gx * st;
    const z0 = PHF.z0, z1 = PHF.z0 + gz * st;
    const OUT = 12000, N = 64;
    const apronMat = new THREE.MeshLambertMaterial({ map: makeGroundTexture() });
    // north and south run the full width PLUS the overhang, so the corners are
    // covered; east and west only span the survey, and tuck in behind them.
    for (const [ax0, ax1, az, dir, horiz] of [
      [x0 - OUT, x1 + OUT, z0, -1, true], [x0 - OUT, x1 + OUT, z1, 1, true],
      [z0, z1, x0, -1, false], [z0, z1, x1, 1, false]]) {
      const pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = ax0 + ((ax1 - ax0) * i) / N;
        const ex = horiz ? t : az, ez = horiz ? az : t;
        const y = parisGround(Math.min(x1, Math.max(x0, ex)),
          Math.min(z1, Math.max(z0, ez)));
        pos.push(ex, y, ez);
        pos.push(horiz ? t : az + dir * OUT, y, horiz ? az + dir * OUT : ez);
        if (i > 0) {
          const a = (i - 1) * 2;
          if (dir * (horiz ? 1 : -1) > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          else idx.push(a + 2, a + 1, a, a + 2, a + 3, a + 1);
        }
      }
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      faceUp(pos, idx);
      ag.setIndex(idx);
      ag.computeVertexNormals();
      const apron = new THREE.Mesh(ag, apronMat);
      apron.userData.noLift = true;
      scene.add(apron);
    }
  }

  // ---------- the Thiers fortifications ----------
  // Paris was a WALLED CITY until 1919, and this world has never had an edge:
  // it simply thinned out into countryside. The enceinte was a bastioned
  // rampart with a ditch and a quarter-kilometre of cleared glacis outside it
  // on which building was forbidden — the zone non aedificandi — which is why
  // it reads as a green belt in every period photograph. See src/paris_wall.js
  // for where the line comes from, and docs/PARIS_1901.md for why.
  for (const run of WALL_RUNS) {
    if (run.length < 4) continue;
    const pos = [], idx = [];
    // the cross-section, across the wall and up it: outer toe, outer crest,
    // parapet, terreplein, inner toe. Outward is +v.
    const SEC = [
      [WALL.base / 2, 0], [WALL.base / 2 - 7, WALL.rampart],
      [WALL.base / 2 - 10, WALL.rampart + WALL.parapet],
      [WALL.base / 2 - 13, WALL.rampart], [-WALL.base / 2, 0],
    ];
    for (let i = 0; i < run.length; i++) {
      const [x, z] = run[i];
      const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)];
      const tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const g0 = parisGround(x, z);
      for (const [v, up] of SEC) pos.push(x + nx * v, g0 + up, z + nz * v);
      if (i > 0) {
        const a0 = (i - 1) * SEC.length, b0 = i * SEC.length;
        for (let k = 0; k < SEC.length - 1; k++) {
          idx.push(a0 + k, a0 + k + 1, b0 + k, a0 + k + 1, b0 + k + 1, b0 + k);
        }
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    faceUp(pos, idx);
    wg.setIndex(idx);
    // The OUTER FACE AND PARAPET IN MASONRY, the rest in earth. Built all in
    // one grass-green it read as a berm — "you said paris was a walled city yet
    // i don't see the city walls" — and it was not a berm: the Thiers enceinte
    // was a stone-faced escarp above its ditch, with the earth rampart behind.
    // The quads come off the cross-section in order, so the first two of every
    // four are the outer face and the parapet.
    const perStation = (SEC.length - 1) * 6;
    for (let i = 0; i < idx.length; i += perStation) {
      wg.addGroup(i, 12, 0);                       // outer face + parapet: stone
      wg.addGroup(i + 12, perStation - 12, 1);     // terreplein + inner slope: earth
    }
    wg.computeVertexNormals();
    // DoubleSide, which is how this project sidesteps the winding trap rather
    // than guessing at it — see the Monaco roads and the Seine ribbon.
    const wall = new THREE.Mesh(wg, [
      new THREE.MeshLambertMaterial({ color: 0xa9a294, side: THREE.DoubleSide }),
      new THREE.MeshLambertMaterial({ color: 0x7c8558, side: THREE.DoubleSide }),
    ]);
    wall.receiveShadow = true;
    wall.castShadow = true;
    wall.userData.noLift = true;                 // already draped, station by station
    scene.add(wall);
  }

  // paved city base (east of the Seine)
  // The "paved city base" was a single rectangular slab laid under the whole
  // city, from the days when there were no streets and something had to stop it
  // reading as open country. With fifty-five kilometres of surveyed road on top
  // of it, it does the opposite — a hard-edged brown field with a visible seam
  // across the map, which is a good part of why Paris looked like dirt. Gone.
  // The Champ de Mars runs from the Tower down to the École Militaire, on that
  // axis — it is not a rectangle lying square to the compass, which is why the
  // Tower and its park did not line up. Drawn as a strip between the two.
  {
    const t = placeLegacy('eiffel'), e = placeLegacy('ecolemil');
    addStrip(scene, t.x, t.z, e.x, e.z, 224, 0x7f9159, 0.12);
  }
  // Longchamps pelouse
  addOval(scene, LONGCHAMPS.x, LONGCHAMPS.z, LONGCHAMPS.rx, LONGCHAMPS.rz, 0x86a05e, 0.12);

  // the gardens' turf — the Champ de Mars already has its strip above
  for (const g of GARDENS.map(gardenGeom)) {
    if (g.turfed) continue;
    addStrip(scene, g.a.x, g.a.z, g.b.x, g.b.z, g.half * 2, 0x7f9159, 0.11);
  }
  // aerodrome grounds
  // 320 m square, not 500. At 500 the flying ground reached a quarter of a
  // kilometre in every direction and hung out over the Seine — "there is a
  // field on top of the sine river that we launch from at the aero club... the
  // guide rope touches the water underneath the land" — and no site on this
  // bank could hold it without either the water or the hillside. It is a club's
  // park, not an aerodrome in the modern sense: 320 m is ample to walk an
  // air-ship out on and leaves 84 m of bank between the turf and the river.
  addFlat(scene, PAD_POS.x, PAD_POS.z, 320, 320, 0x84925f, 0.1);   // the flying ground

  // ---------- the Seine: stone quays and living, reflecting water ----------
  const riverPts = seinePoints();
  // TWO bands, one per bank, and nothing across the middle.
  //
  // It used to be a single 184 m ribbon, which was fine on a flat plain and is
  // not on a real one: a ribbon carries two vertices per station, one at each
  // edge, so once the ground had a valley in it the quad between them ran
  // straight from bank to bank — a stone sheet a few centimetres over the
  // surface, paving the Seine from Austerlitz to Suresnes.
  for (const side of [-1, 1]) {
    const q = makeBankRibbon(riverPts, RIVER_HALF - 4, 92, side, 0xa39a86, 0.18);
    q.userData.noLift = true;                     // already draped, vertex by vertex
    scene.add(q);
  }
  const seine = makeWaterSurface(ribbonGeoXY(riverPts, 140), sunDir, 0x24405a);
  seine.rotation.x = -Math.PI / 2;
  // One flat sheet, and the terrain generator lays the river flat to match it
  // (the measured fall is 3.4 m over 23 km — one part in seven thousand). The
  // bed is carved 1.4 m under the surface, so the sheet is never below its own
  // river bed and the quays are never left standing proud of the water.
  seine.position.y = RIVER_Y;            // the surface is one level — see paris_terrain.js
  seine.userData.noLift = true;
  scene.add(seine);

  // The western reach used to be a SECOND, invented river: a straight
  // north-south line at x ~ -2000, standing in for the loop round the Bois. The
  // real trace now carries the whole Seine, loop and all, so that second river
  // is gone — it was running straight through the Longchamps racecourse once the
  // racecourse was put where it belongs.
  //
  // Out here the Seine has grass banks and a towpath rather than the cut-stone
  // quays of the city reaches: the last third of the trace is banked in green.
  const westPts = riverPts.slice(Math.floor(riverPts.length * 0.62));
  { const banks = makeRibbon(westPts, 176, 0x6d7a4d, 0.16, true);
    banks.userData.noLift = true;
    scene.add(banks); }
  // the Pont de St-Cloud: a stone road bridge, well clear of the Avre aqueduct
  // downstream of it (the two stood a few hundred metres apart in life, and
  // sat one on top of the other here)
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0xa8a094 });
  // A BRIDGE HAS TO REACH THE OTHER BANK.
  //
  // This one was written as a 96 m deck with its abutments at +-41, which is a
  // handsome crossing of a river 82 m wide. The Seine here is 144: RIVER_HALF
  // is 72 to each side. So the deck stopped 24 m short of the water's edge on
  // both banks and the abutments — fourteen metres of solid masonry apiece —
  // stood out in the open stream with the river running past them: "the closer
  // one looks like one ramp was in the middle of the Seine."
  //
  // It is measured off the river now. The deck spans the water with eight
  // metres to spare at each end, the abutments sit on the bank with their inner
  // faces at the waterline, and the ramps carry the road down from there. Every
  // other part follows the span, so the piers stay in the stream and the arches
  // stay between the piers whatever the river turns out to be.
  const wb = new THREE.Group();
  const HALF = RIVER_HALF + 8;                     // the deck reaches this far
  const SPAN = HALF * 2;
  const roadway = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 2.2, 13), bridgeMat);
  roadway.position.y = 6.5;
  wb.add(roadway);
  const PIERS = 5;                                 // in the stream, evenly spaced
  for (let i = 0; i < PIERS; i++) {
    const px = -HALF * 0.72 + (i / (PIERS - 1)) * HALF * 1.44;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(7, 6.5, 11), bridgeMat);
    pier.position.set(px, 3.25, 0);
    wb.add(pier);
  }
  for (let i = 0; i < PIERS - 1; i++) {            // and the vaults between them
    const gap = (HALF * 1.44) / (PIERS - 1);
    const px = -HALF * 0.72 + (i + 0.5) * gap;
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(gap * 0.5, gap * 0.5, 12, 14, 1, false, 0, Math.PI), bridgeMat);
    arch.rotation.x = -Math.PI / 2;                // axis across the roadway, crown up
    arch.position.set(px, 5.4, 0);
    arch.scale.set(0.95, 1, 0.52);
    wb.add(arch);
  }
  for (const sz of [-1, 1]) {                      // parapets down both sides
    const par = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 1.4, 1.1), bridgeMat);
    par.position.set(0, 8.3, sz * 6);
    wb.add(par);
  }
  // abutments ON THE BANK, and ramps carrying the roadway down from them —
  // without those the deck simply stopped five metres above the grass
  const RAMP = 34, DECKY = 6.5, ABUT = 14;
  for (const sx of [-1, 1]) {
    const abut = new THREE.Mesh(new THREE.BoxGeometry(ABUT, DECKY, 13), bridgeMat);
    // its INNER face on the waterline: the masonry stands on dry ground
    abut.position.set(sx * (RIVER_HALF + ABUT / 2), DECKY / 2, 0);
    abut.castShadow = abut.receiveShadow = true;
    wb.add(abut);
    // The ramp must fall AWAY from the bridge. Rotating by +θ on the +x side
    // lifts the far end instead — which built a pair of takeoff ramps rising
    // into the air at both ends of the crossing.
    const slope = Math.atan2(DECKY - 0.6, RAMP);
    const midY = (DECKY + 0.6) / 2;
    const midX = sx * (RIVER_HALF + ABUT + RAMP / 2);   // beyond the abutment
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
  const roadH = (x1, z1, x2, z2, w) => {
    const a = H2(x1, z1), b = H2(x2, z2);
    road(a.x, a.z, b.x, b.z, w);
  };
  // the Paris-Versailles road over the Pont de Saint-Cloud: out of the town,
  // across the river, and on into the Bois toward Longchamp
  roadH(-2330, 440, -2080, 400, 26);            // through Saint-Cloud to the bridge
  roadH(-1908, 400, -1600, 330, 26);            // and away on the Bois bank
  roadH(-1600, 330, -1250, 200, 24);            // the allée to the racecourse
  roadH(-2330, 440, -2340, 90, 22);             // the village street to the church
  roadH(-2080, 400, -2150, 150, 20);            // the lane down toward the field gate
  // At the real Pont de Saint-Cloud (src/paris_stcloud.js), not 636 m from any
  // water where the old half-frame coordinate had left it.
  wb.position.set(PONT.x, 0, PONT.z);
  wb.rotation.y = onTheRiver(PONT.x, PONT.z).ry;
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
    const paved = new THREE.Color(0xd9d2c2), dirt = new THREE.Color(0xb4ab88);
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
          pos.push(px, parisGround(px, pz) + 0.16, pz);
          col.push(c.r, c.g, c.b);
        }
        // Wound so the normals point UP. Written the other way round the whole
        // network faced the ground: back-face culled, invisible from the air,
        // and the city looked like grass and dirt with houses standing in rows
        // along avenues that were not there. (n x d is +Y, so (-n) x d is -Y —
        // the same winding trap the Seine ribbon fell into.)
        idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
      }
    }
    // A disc at every vertex. Segments are drawn as separate quads, so at a
    // junction, a bend or a change of width they met at a point and left a
    // notch — reported as the roads being disjointed and broken up. The cap
    // fills the corner whatever angle the streets meet at.
    for (const st of STREETS) {
      const c = st.dirt ? dirt : paved;
      for (const [vx, vz] of st.pts) {
        const b = pos.length / 3, r = st.w / 2, N = 8;
        pos.push(vx, parisGround(vx, vz) + 0.16, vz); col.push(c.r, c.g, c.b);
        for (let k = 0; k <= N; k++) {
          const a2 = (k / N) * Math.PI * 2;
          pos.push(vx + Math.cos(a2) * r, 0.16, vz + Math.sin(a2) * r);
          col.push(c.r, c.g, c.b);
          if (k > 0) idx.push(b, b + k, b + k + 1);
        }
      }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    faceUp(pos, idx);
    g2.setIndex(idx);
    g2.computeVertexNormals();
    // the street network is a decal like any other — laid 0.16 m over ground it
    // is coplanar with, and fighting the parks it runs through
    const roads = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    roads.userData.noLift = true;                 // every vertex is already on the ground
    roads.receiveShadow = true;
    scene.add(roads);
  }
  addOval(scene, arcPos.x, arcPos.z, 128, 128, 0x9a9285, 0.08);   // the Étoile
  { const c = placeLegacy('concorde'); addOval(scene, c.x, c.z, 170, 170, 0x9a9285, 0.08); }
  scene.add(farSeen(makeArc(arcPos)));
  scene.add(makeConcorde());
  scene.add(makeMadeleine());

  // ---------- the city: buildings along their real street frontages ----------
  const buildings = buildCity(scene, riverPts);

  let bridgeCount = 0;
  const isWaterAt = (x, z) => !onPuteaux(x, z) && nearPolyline(riverPts, x, z, 71, RIVER_GAP);
  // ---------- the bridges of the city ----------
  // Placed WHERE THE ROADS ACTUALLY CROSS THE WATER, not by name. Listing the
  // bridges by their real positions put them near the right places but not
  // necessarily under a road, so a street ran into the Seine and a bridge stood
  // beside it carrying nothing. Every street segment is tested against the
  // river's centreline; each crossing gets a deck laid along the ROAD, so the
  // two always meet.
  {
    const stone = new THREE.MeshLambertMaterial({ color: 0xb0a894 });
    const dark2 = new THREE.MeshLambertMaterial({ color: 0x8a8272 });
    const seg = (ax, az, bx, bz, cx, cz, dx2, dz2) => {
      const r1x = bx - ax, r1z = bz - az, r2x = dx2 - cx, r2z = dz2 - cz;
      const den = r1x * r2z - r1z * r2x;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
      const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return { x: ax + r1x * t, z: az + r1z * t, dx: r1x, dz: r1z };
    };
    const found = [];
    for (const st of STREETS) {
      for (let i2 = 0; i2 < st.pts.length - 1; i2++) {
        const [ax, az] = st.pts[i2], [bx, bz] = st.pts[i2 + 1];
        for (let k = 0; k < riverPts.length - 1; k++) {
          const c = riverPts[k], d2 = riverPts[k + 1];
          if (c.distanceTo(d2) > RIVER_GAP) continue;   // a gap, not a reach
          const hit = seg(ax, az, bx, bz, c.x, c.z, d2.x, d2.z);
          if (!hit) continue;
          // A road that meets the water at a shallow angle is a QUAY running
          // along the bank, not a crossing: bridging it laid a deck almost
          // parallel to the river. Only take it if it cuts the water at more
          // than thirty-five degrees.
          const rl = Math.hypot(hit.dx, hit.dz) || 1;
          const wx = d2.x - c.x, wz = d2.z - c.z;
          const wl = Math.hypot(wx, wz) || 1;
          const cosA = Math.abs((hit.dx / rl) * (wx / wl) + (hit.dz / rl) * (wz / wl));
          if (cosA > 0.70) continue;                 // within 45 deg of the water's line
          if (found.some((f) => Math.hypot(f.x - hit.x, f.z - hit.z) < 150)) continue;
          found.push({ ...hit, w: st.w });
          break;
        }
      }
    }
    for (const f of found) {
      const L = Math.hypot(f.dx, f.dz) || 1;
      const ang = -Math.atan2(f.dz / L, f.dx / L);      // the deck follows the ROAD
      // how far the water reaches along the road, so the deck always spans it
      let span = 120;
      for (let m = 40; m < 400; m += 10) {
        if (!isWaterAt(f.x + (f.dx / L) * m, f.z + (f.dz / L) * m)
          && !isWaterAt(f.x - (f.dx / L) * m, f.z - (f.dz / L) * m)) { span = m * 2 + 90; break; }
      }
      const DECKW = Math.max(18, f.w), DECKY = 9;
      const g2 = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 2.4, DECKW), stone);
      deck.position.y = DECKY; g2.add(deck);
      for (const sz of [-1, 1]) {
        const para = new THREE.Mesh(new THREE.BoxGeometry(span, 1.7, 1.2), dark2);
        para.position.set(0, DECKY + 2, sz * (DECKW / 2 - 0.6)); g2.add(para);
      }
      // Piers with a river arch between each pair, springing from the water and
      // meeting the underside of the deck. The radius used to be a fraction of
      // the whole span — on a four-hundred-metre crossing that is an eighty
      // metre half-cylinder, which stood high above the roadway as a row of
      // quarter circles instead of sitting under it.
      const piers = Math.max(2, Math.round(span / 60));
      const bay = span / piers;
      // The arch springs from just above the water and its crown meets the
      // UNDERSIDE of the deck. Sizing it off the bay alone put the crown at
      // fifteen metres on a deck standing at nine, so a row of half-cylinders
      // stood proud of the roadway — the "dumb quarter circles" reported.
      const SPRING = 2.2, SOFFIT = DECKY - 1.4;
      const AR = Math.min(bay * 0.42, SOFFIT - SPRING);
      for (let i3 = 0; i3 <= piers; i3++) {
        const t2 = -0.5 + i3 / piers;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(7, DECKY, DECKW * 0.9), stone);
        pier.position.set(t2 * span, DECKY / 2, 0); g2.add(pier);
        if (i3 === piers) break;
        const arch = new THREE.Mesh(
          new THREE.CylinderGeometry(AR, AR, DECKW * 0.9, 14, 1, false, 0, Math.PI), dark2);
        arch.rotation.x = Math.PI / 2;
        arch.rotation.z = Math.PI;                        // the opening downward
        arch.position.set((t2 + 0.5 / piers) * span, SPRING, 0); g2.add(arch);
      }
      g2.position.set(f.x, 0, f.z);
      g2.rotation.y = ang;
      g2.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(g2);
      buildings.push({ x: f.x, z: f.z, w: span * 0.7, d: span * 0.7, h: DECKY, top: DECKY + 3 });
    }
    bridgeCount = found.length;
  }

  // ---------- Eiffel Tower ----------
  const tower = makeTower();
  // She is square to the Champ de Mars, not to the compass: a face looks down
  // the park to the École Militaire and the opposite one across the river to
  // the Trocadéro. Taken from the two real positions so it cannot drift.
  {
    const t = placeLegacy('eiffel'), e = placeLegacy('ecolemil');
    tower.rotation.y = -Math.atan2(e.z - t.z, e.x - t.x);
  }
  tower.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(farSeen(tower));

  // ---------- landmarks ----------
  const lm = addLandmarks(scene);
  buildings.push(...lm.lmColliders);
  // the places the memoir names, and the 1900 maps put on the ground
  const bookPlaces = addBookPlaces(scene, buildings);

  // ---------- the Bois, and the gardens ----------
  // AFTER the landmarks, not before. Planting ran here first and the landmark
  // colliders — the two Palais, the Trocadero's galleries, the Roue — were not
  // yet in `buildings`, so nothing could be tested against them: four trees
  // were growing inside the Petit Palais, which the gymkhana flies straight past.
  const trees = addTrees(scene, buildings);

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

  // ---------- the Aéro-Club de France's ground at Saint-Cloud ----------
  // Everything here hangs off PAD_POS, which is itself chosen by measurement,
  // so the field, the shed and the club buildings cannot drift apart from the
  // spot the ships actually stand on — which is what happened when they were
  // written as absolute numbers and the world changed scale under them.
  let hangar;                       // its flag is a wind vane the HUD streams
  {
    const field = new THREE.Group();
    field.position.set(PAD_POS.x, 0, PAD_POS.z);

    // THE WHOLE AERODROME WAS UNDERGROUND.
    //
    // liftToTerrain walks the scene's TOP-LEVEL children only, on purpose —
    // lifting a group and its children both would raise the hangar's flagpole
    // twice. So the field is raised by the ground under its own origin, the
    // pad, and every building inside it went up by that same amount whatever
    // was under it. The coteaux climb westward: the pad stands at 31 m and the
    // shed 85 m west of it at 42.7, so the shed was set 11.7 m into the hill —
    // twelve of its eighteen metres buried, which is "there was no hanger in
    // the headset". The club house was 27 m under, the secretary's office 29,
    // the gas plant 32 and the hydrogen cylinders 33: every one of them gone
    // entirely, in the flat game as much as in the headset.
    //
    // So each of them is set down on the ground beneath ITSELF, expressed as a
    // rise above the pad, which is exactly what the group's own lift will
    // afterwards add back.
    const gPad = parisGround(PAD_POS.x, PAD_POS.z);
    const sitOn = (dx, dz) => parisGround(PAD_POS.x + dx, PAD_POS.z + dz) - gPad;

    hangar = makeHangar();
    hangar.position.set(SHED.dx, sitOn(SHED.dx, SHED.dz), SHED.dz);   // the shed, west of the field
    hangar.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    field.add(hangar);
    scene.add(field);
    buildings.push({ x: PAD_POS.x + SHED.dx, z: PAD_POS.z + SHED.dz,
      w: SHED.w, d: SHED.d, h: SHED.h, top: SHED.h + 3 });

    // the club house, the gas plant and the sheds along the north side: the
    // Aéro-Club's park had a good deal more standing in it than one tent
    const clubW = new THREE.MeshLambertMaterial({ color: 0xe4dac1 });
    const clubR = new THREE.MeshLambertMaterial({ color: 0x6a5442 });
    const put = (dx, dz, w, d, h, ry) => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), clubW);
      body.position.y = h / 2; b.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 2.4, d * 1.1), clubR);
      roof.position.y = h + 1.2; b.add(roof);
      b.position.set(dx, sitOn(dx, dz), dz); b.rotation.y = ry || 0;
      b.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      field.add(b);
      buildings.push({ x: PAD_POS.x + dx, z: PAD_POS.z + dz, w, d, h, top: h + 2.4 });
    };
    put(-150, -110, 34, 20, 11);            // the club house
    put(-150, -60, 22, 16, 8);              // the secretary's office
    put(-190, 40, 26, 14, 7);               // the gas plant
    put(-190, 80, 26, 14, 7);
    put(-60, -150, 40, 18, 9, 0.2);         // the carriage sheds
    // the hydrogen cylinders, in their rows
    const cyl = new THREE.MeshLambertMaterial({ color: 0x5c6b52 });
    for (let i = 0; i < 14; i++) {
      const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 5.5, 8), cyl);
      const cx2 = -205 + (i % 7) * 4.5, cz2 = 120 + Math.floor(i / 7) * 6;
      c2.position.set(cx2, 2.75 + sitOn(cx2, cz2), cz2);
      c2.castShadow = true; field.add(c2);
    }
    // the paling that shut the ground off from the park
    const paleM = new THREE.MeshLambertMaterial({ color: 0x7d6a4c });
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const pale = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), paleM);
      const px2 = Math.cos(a) * 235, pz2 = Math.sin(a) * 235;
      pale.position.set(px2, 1.6 + sitOn(px2, pz2), pz2);
      field.add(pale);
    }
  }

  // ---------- Neuilly St James, "the first of the world's air-ship stations" ----------
  // A11: "a great square tent, striped red and white, set in the midst of a
  // vacant lot surrounded by a high stone wall", housing seven inflated ships,
  // and the way out of it is over the wall: "Mounting diagonally in the air
  // from my own open grounds I pass over my wall, the Boulevard de la Seine,
  // and turn when well above the river."
  //
  // The wall is the point. It is what makes the departure a manoeuvre instead
  // of a takeoff, and on 29 June 1903 a nineteen-year-old who had had three
  // lessons on the ground took the No. 9 over it alone.
  {
    const n = placeLegacy('neuilly');
    const yard = new THREE.Group();
    yard.position.set(n.x, 0, n.z);
    const gN = parisGround(n.x, n.z);
    const sitN = (dx, dz) => parisGround(n.x + dx, n.z + dz) - gN;

    const tent = makeHangar();
    tent.position.set(0, sitN(0, 0), 0);
    tent.rotation.y = NEUILLY_OUT;         // doors facing the way out, to the river
    tent.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    yard.add(tent);
    buildings.push({ x: n.x, z: n.z, w: 46, d: 30, h: 15, top: 18 });

    // the high stone wall round the vacant lot — a real obstacle, and the
    // thing you must climb over. Built as posts so the ground can roll under
    // it, and every one of them sits on the earth beneath ITSELF (the lesson
    // of the buried aerodrome above).
    const wallM = new THREE.MeshLambertMaterial({ color: 0xbdb3a0 });
    const R = NEUILLY_R, WALL_H = 4.2, N = 64;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // leave the gateway open on the river side, where the ships came out
      if (Math.abs(((a - NEUILLY_OUT + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.16) continue;
      const px2 = Math.cos(a) * R, pz2 = Math.sin(a) * R;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(R * 2 * Math.PI / N * 1.08, WALL_H, 1.1), wallM);
      seg.position.set(px2, WALL_H / 2 + sitN(px2, pz2), pz2);
      seg.rotation.y = -a;
      seg.castShadow = seg.receiveShadow = true;
      yard.add(seg);
    }
    scene.add(yard);
  }

  // ---------- put it all on the ground ----------
  // Everything above is placed flat, on the plain, exactly as it always was.
  // This is where Paris gets its hills. It must run BEFORE the clouds, which
  // belong in the sky and are not to be lifted with the houses.
  liftToTerrain(scene);
  for (const b of buildings) {
    b.y = parisGround(b.x, b.z);
    if (b.top !== undefined) b.top += b.y;
  }
  for (const t of trees) if (t && t.x !== undefined) t.y = parisGround(t.x, t.z);

  // ---------- clouds ----------
  const windB = new THREE.Vector3(4.2, 0, 0.8);
  const clouds = makeClouds(scene, windB, {
    box: { x0: PHF.x0, x1: PHF.x0 + (PHF.nx - 1) * PHF.step,
           z0: PHF.z0, z1: PHF.z0 + (PHF.nz - 1) * PHF.step },
    base: 260,                       // Montmartre stands 86 m over the datum
    ground: parisGround,
  });
  // never culled: they are the sky, and they are already few and large
  for (const c of clouds) farSeen(c.grp);
  keepOutOfReflection(seine, clouds.map((c) => c.grp));

  const LM = (id) => { const q = placeLegacy(id); return { x: q.x, z: q.z }; };
  return {
    name: 'Paris, 1901',
    sun, sunDir, sky, waters: [seine], tick,
    // the ground is no longer a plane: the ship, the guide rope and every
    // spawn measure their height from here
    groundAt: parisGround,
    riverY: RIVER_Y,                 // the one level the Seine is drawn at
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
      // over the west towers, which are 69 m now that she is built properly
      { id: 'notredame', name: 'Notre-Dame', ...LM('notredame'), y: 90, r: 45,
        clue: 'Two square towers and a spire, on the island in the river.' },
      { id: 'pantheon', name: 'the Panthéon', ...LM('pantheon'), y: 62, r: 45,
        clue: 'A dome on the hill of the left bank.' },
      { id: 'opera', name: 'the Opéra', ...LM('opera'), y: 58, r: 45,
        clue: 'A green dome over the grandest staircase in Paris.' },
      // OVER the wheel, not inside it. The rim is 46 m about a hub at 52, so it
      // stands from 6 m to 98 — and a gem at 64 turned in the open air between
      // the spokes with the wheel all round it: "gem is inside the Ferris wheel
      // on scavenger hunt". Nothing catches this by collision, because the
      // wheel deliberately has no collider: her own clue says the course
      // threads her. So the height is written clear of the rim by hand.
      { id: 'roue', name: 'the Grande Roue', ...LM('roue'), y: 116, r: 45,
        clue: 'A hundred metres of wheel, left over from the Exposition — the gymkhana threads it.' },
      { id: 'bagatelle', name: 'Bagatelle', ...LM('bagatelle'), y: 44, r: 55,
        clue: '“I had the No. 9 towed to the railing of Bagatelle.” A little château at the edge of the Bois.' },
      { id: 'longchamps', name: 'Longchamps', ...LM('longchamp'), y: 48, r: 90,
        clue: '“Ten times in succession I made the circuit of Longchamps.” The racecourse in the Bois.' },
      // ...and clear of the mill's own sails, which reach 47 m
      { id: 'moulin', name: 'the Moulin de Longchamp', x: -1010, z: 118, y: 66, r: 45,
        clue: 'The abbey’s old mill, standing alone on the pelouse.' },
      { id: 'puteaux', name: 'the Île de Puteaux', ...LM('puteaux'), y: 46, r: 100,
        clue: '“Beaten out with my Panama hat.” The island in the reach below the bridge.' },
      { id: 'stcloud', name: 'the hill of Saint-Cloud', ...LM('stcloud'), y: 170, r: 140,
        clue: 'The wooded park above the aerodrome, with its terraces and cascade.' },
      // clear of the tent's 18 m and well over the wall
      { id: 'neuilly', name: 'Neuilly St James', ...LM('neuilly'), y: 52, r: 70,
        clue: '“The first of the world’s air-ship stations” — a great tent striped red and white, in a walled lot by the river.' },
    ],
    towSpots: [
      { name: 'Bagatelle, by the Bois', pos: (() => { const b = placeLegacy('bagatelle');
        return new THREE.Vector3(b.x, 0, b.z); })() },
      { name: 'Longchamps racecourse', pos: new THREE.Vector3(LONGCHAMPS.x, 0, LONGCHAMPS.z) },
      // on the quay, not in the river — the Seine drowns a ship now
      { name: 'the Trocadéro bank', pos: (() => { const t = placeLegacy('trocadero');
        return new THREE.Vector3(t.x + 120, 0, t.z + 220); })() },
    ],
    limitNote: 'the historic half-hour, at full scale',
    // ABOVE her, not on her. This stood on the campanile gallery at 302 m,
    // 12.7 m off the axis — which is inside the ironwork, ten metres below a
    // 312 m tower, so the view out was through the girders and the lantern:
    // "tower voew should ve from just above the tower so view is mever
    // obstructed" (bug #50). On the axis and clear of the top, nothing of the
    // Tower can come between the lens and the ship. Tied to TOWER_H so it
    // cannot drift back inside when the Tower is re-cut.
    vistaPos: new THREE.Vector3(TOWER_POS.x, TOWER_H + 22, TOWER_POS.z),
    windBase: windB,
    raceLimit: 1800, raceRecord: 1771,
    hints: {
      idleNear: 'The Commission waits — call “Let go all!” when you are ready.',
      idleFar: 'Free flight — the Commission is convoked over the Aéro-Club at St. Cloud.',
      out: 'Round the Eiffel Tower — ride the wind high.',
      back: 'Home to St. Cloud — less wind down low.',
      turnMsg: '“I turned with a sudden movement of the rudder, round the Tower’s lightning conductor.” Now home — against the wind. Fly LOW.',
    },
    // the Seine is water like any other: "I should fall into the Seine" —
    // both reaches drown a ship that comes down on them
    // half-widths match the water ribbons exactly (70 m and 64 m wide), so the
    // river is wet right out to the bank you can see
    // …but the Île de Puteaux is dry land in the middle of the reach
    // makeBlocks is gone: the headset gets the real city in chunks now, not a
    // merged stand-in. See addBuildingMeshesChunked.
    isWater: (x, z) => !onPuteaux(x, z)
      && nearPolyline(riverPts, x, z, 71, RIVER_GAP),
    /**
     * The SURFACE of the water at (x, z), or null on dry land.
     *
     * The guide rope wants this and the ground will not do. The Seine's bed is
     * carved 1.4 m under its sheet so that the quays are not left standing in
     * the air, so a rope asking `groundAt` went to the BOTTOM: measured at
     * 1.2 m below the surface, dragging along the riverbed. "Over the sea it
     * lies on the water and becomes the true stabilisateur" is what the rope
     * code says it does, and over the Seine it did not.
     *
     * The ship itself still uses the ground, because the Seine is meant to
     * drown her — it is only the rope that floats.
     */
    waterY: (x, z) => (!onPuteaux(x, z)
      && nearPolyline(riverPts, x, z, 71, RIVER_GAP) ? riverPts[0].y : null),
    /**
     * The Bois de Boulogne — for the cool air under the trees, and for the
     * "soft and safe" landing a pilot gets among them.
     *
     * This box used to reach east to x = -680, which is PASSY AND AUTEUIL: with
     * the city surveyed, 1,823 real building footprints stood inside what the
     * game called woodland, and a pilot over the rooftops was told he was over
     * the Bois. The wood lies OUTSIDE THE FORTIFICATIONS — the same rule the
     * street screen uses — and the westernmost surveyed building stands at
     * x = -2410, so the edge belongs west of that and hard against the wall.
     */
    isInBois(x, z) {
      if (x < -3800 || x > -2420 || Math.abs(z) > 1120) return false;
      const dx = (x - LONGCHAMPS.x) / LONGCHAMPS.rx, dz = (z - LONGCHAMPS.z) / LONGCHAMPS.rz;
      if (dx * dx + dz * dz < 1) return false;
      if ((x - PAD_POS.x) ** 2 + (z - PAD_POS.z) ** 2 < 150 * 150) return false;
      return true;
    },
  };
}

// ======================================================================

/**
 * Put everything on the ground.
 *
 * Paris is built flat — every landmark, tree, house and shed is placed at y = 0
 * on the plain, as it has been since the first version — and then lifted here in
 * one pass. It is the same trick the world already used to go from half scale to
 * full: change one function, not two hundred call sites, and nothing can be
 * half-converted.
 *
 * Three cases, and they matter:
 *
 *   noLift     the terrain itself, the skirt, the sky, the river's own sheet.
 *              Already at their true heights.
 *   instanced  the city's houses, roofs and chimneys, and the trees. Thousands
 *              of them share one mesh at the origin, so each instance's own
 *              matrix has to be read, lifted at its own (x, z), and written back.
 *   the rest   a group or a mesh standing at a place — lift it by the ground
 *              under that place.
 *
 * Only the scene's top-level children are walked. Lifting a group AND its
 * children would raise the hangar's flagpole twice.
 */
// Seen from across Paris, and so never culled in a headset: the things a pilot
// takes his bearings from. src/vr.js hides the rest of the near-field scenery
// beyond 900 m, which is what makes the city affordable at ninety hertz.
function farSeen(o) { if (o) { o.userData = o.userData || {}; o.userData.vrFar = true; } return o; }

function liftToTerrain(scene) {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(), qt = new THREE.Quaternion(), scl = new THREE.Vector3();
  for (const o of scene.children) {
    if (o.userData && o.userData.noLift) continue;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        m.decompose(pos, qt, scl);
        pos.y += parisGround(pos.x, pos.z);
        o.setMatrixAt(i, m.compose(pos, qt, scl));
      }
      o.instanceMatrix.needsUpdate = true;
      if (o.boundingSphere) o.boundingSphere = null;
      o.computeBoundingSphere();
      continue;
    }
    o.position.y += parisGround(o.position.x, o.position.z);
  }
}

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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), decalMat(color));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  scene.add(m);
}

// ---------------------------------------------------------------- the gardens
// THE GREAT PUBLIC GARDENS OF 1901, which were bare ground until now.
//
// The Bois has 1,250 scattered trees and the Champ de Mars had a green strip
// laid down it, and that was the whole of Paris's greenery: the Tuileries, the
// Luxembourg, Monceau, the Plantes, the Esplanade and the Palais-Royal were
// mown grass at best and open dirt at worst, from the air indistinguishable
// from a building site. They are the shapes a pilot navigates by — "on the
// return trip I had kept my eyes fixed on the verdure of the Bois de Boulogne"
// (Ch. XV) — and half of them are directly under the courses.
//
// Each is given by the two ends of its LONG AXIS in real coordinates plus a
// half-width, so the shape and the angle come from the ground rather than from
// a guess. `formal` gardens (the French ones: allees flanking an open centre)
// get their trees in rows down both sides with the middle left clear; the rest
// are planted through.
const GARDENS = [
  // id, lat/lon of each end of the long axis, half-width, formal, already turfed
  ['champdemars', 48.8584, 2.2945, 48.8517, 2.3018, 108, true,  true],
  ['tuileries',   48.8637, 2.3227, 48.8630, 2.3345, 140, true,  false],
  ['luxembourg',  48.8478, 2.3350, 48.8443, 2.3378, 165, true,  false],
  ['monceau',     48.8805, 2.3075, 48.8792, 2.3110, 125, false, false],
  ['plantes',     48.8455, 2.3565, 48.8432, 2.3635, 115, true,  false],
  ['invalides',   48.8628, 2.3135, 48.8574, 2.3120, 112, true,  false],
  ['palaisroyal', 48.8659, 2.3370, 48.8648, 2.3380,  45, true,  false],
  // the wooded gardens flanking the lower Champs-Elysees, from the Concorde up
  // to the Rond-Point, with the two Palais standing in them. Gymkhana gate 4 is
  // flown down this, so it is the one a pilot sees closest.
  ['champselysees',48.8656, 2.3212, 48.8690, 2.3097, 168, false, false],
  ['vosges',      48.8558, 2.3648, 48.8552, 2.3662,  55, true,  false],
  ['observatoire',48.8437, 2.3372, 48.8362, 2.3372,  52, true,  false],
  ['temple',      48.8661, 2.3610, 48.8653, 2.3622,  45, false, false],
  ['ranelagh',    48.8620, 2.2705, 48.8607, 2.2735,  88, false, false],
  // the willow tip of the Ile de la Cite; the river filter takes most of it
  ['vertgalant',  48.8572, 2.3392, 48.8568, 2.3408,  28, false, false],
];

function gardenGeom(g) {
  const a = geo(g[1], g[2]), b = geo(g[3], g[4]);
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  return { id: g[0], a, b, L, ux: dx / L, uz: dz / L,
    half: g[5], formal: g[6], turfed: g[7] };
}

// Flat things laid ON other flat things — turf on grass, gravel on turf, a
// paved oval on gravel — are coplanar to within a few centimetres, and a few
// centimetres is nothing to a depth buffer. In a headset it is less than
// nothing. polygonOffset settles the argument in the rasteriser instead, where
// the answer does not depend on how far away you are or what the near plane is:
// "darker green grass park areas fight with lighter grass areas. paths fight
// with different ground also".
let decalLayer = 0;
function decalMat(color) {
  decalLayer++;
  return new THREE.MeshLambertMaterial({ color,
    polygonOffset: true,
    polygonOffsetFactor: -1 - decalLayer * 0.5,
    polygonOffsetUnits: -1 - decalLayer * 0.5 });
}

function addOval(scene, x, z, rx, rz, color, y) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), decalMat(color));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(rx, rz, 1);
  scene.add(m);
}

function addStrip(scene, x1, z1, x2, z2, w, color, y = 0.09) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), decalMat(color));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(dz, dx); // plane local +x along strip after x-rot
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.receiveShadow = true;
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
  { const _p = placeLegacy('invalides'); inv.position.set(_p.x, 0, _p.z); farSeen(inv); }
  scene.add(inv);

  // Sacre-Coeur on the Montmartre mound (it was rising over Paris in 1901)
  // The butte USED TO BE MODELLED here — a 55 m truncated cone with a turf
  // crown, from when the ground was flat and the hill had to come from
  // somewhere. The survey has the real butte now: 86 m above the Champ de Mars
  // at the summit, falling to 32 m half a kilometre out. The cone was standing
  // on top of that, so Montmartre rose 141 m instead of 86 and Sacre-Coeur
  // floated at 148 m — a hill on a hill.
  //
  // The cone's stated job was to give the basilica level ground. The real crown
  // is flat to 4 m over 80 m, so the hill can do its own job now.
  const mont = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 26), white); nave.position.y = 7; mont.add(nave);
  const dome1 = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 9), white); dome1.position.y = 21; dome1.scale.y = 1.35; mont.add(dome1);
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), white);
    d.position.set(s * 14, 17, 0); d.scale.y = 1.4; mont.add(d);
  }
  { const _p = placeLegacy('montmartre'); mont.position.set(_p.x, 0, _p.z); farSeen(mont); }
  scene.add(mont);

  // Old Palais du Trocadero (1878): rotunda, two slim ~80 m towers, curved wings —
  // "the Trocadero was seen through the base of the Eiffel Tower"
  // THE PALACE HAD NO COLLIDER. Not a small one, not a wrong one — none: you
  // could fly through the rotunda, through the towers and out the other side,
  // and scenario II asks you to come down on this roof. "Went thru the roof"
  // (bug #47) was this building. It is collided in its own shape below —
  // rotunda, towers, and every bay of both galleries — because it is an arc
  // 130 m across and one box round it would wall off the whole forecourt.
  // Written FLAT, like every other collider: the grounding pass at the end of
  // buildWorld sets b.y from the terrain and lifts `top` with it.
  const _tp = placeLegacy('trocadero');
  const troc = new THREE.Group();
  const trocC = new THREE.Mesh(new THREE.CylinderGeometry(17, 18, 30, 14), cream); trocC.position.y = 15; troc.add(trocC);
  lmColliders.push({ x: _tp.x, z: _tp.z, w: 34, d: 34, h: 30, top: 30 });
  const trocDome = new THREE.Mesh(new THREE.SphereGeometry(15, 12, 8), slate); trocDome.position.y = 32; trocDome.scale.y = 0.65; troc.add(trocDome);
  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 62, 8), cream);
    tower.position.set(0, 31, s * 21); troc.add(tower);
    lmColliders.push({ x: _tp.x, z: _tp.z + s * 21, w: 6, d: 6,
      h: 62, top: 70 });                                   // the 70 m towers
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
      lmColliders.push({ x: _tp.x + px, z: _tp.z + pz, w: chord, d: 13,
        ry: bay.rotation.y, h: 15, top: 16.4 });
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
  troc.position.set(_tp.x, 0, _tp.z);   // liftToTerrain puts it on the hill
  farSeen(troc);

  // The great cascade, which is what the gardens were FOR: water off the
  // terrace under the rotunda, down the Chaillot slope in steps, into a basin
  // at the bottom. The slope is real (26 m at the palace, below zero at the
  // quay), so each step is set to the ground it stands on, measured relative to
  // the group's own footing because liftToTerrain will add that back.
  {
    const _te = placeLegacy('eiffel');
    const cdx = _te.x - _tp.x, cdz = _te.z - _tp.z;
    const cL = Math.hypot(cdx, cdz) || 1;
    const cux = cdx / cL, cuz = cdz / cL;
    const base = parisGround(_tp.x, _tp.z);
    const casc = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xcfc6ae });
    const water = new THREE.MeshPhongMaterial({ color: 0x6f93a6, shininess: 90 });
    for (let a = 34; a < 210; a += 22) {
      const px = cux * a, pz = cuz * a;
      const gy = parisGround(_tp.x + px, _tp.z + pz) - base;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(34, 2.2, 20), stone);
      sill.position.set(px, gy + 1.1, pz);
      sill.rotation.y = -Math.atan2(cuz, cux);
      casc.add(sill);
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 17), water);
      sheet.position.set(px, gy + 2.4, pz);
      sheet.rotation.y = sill.rotation.y;
      casc.add(sheet);
    }
    // the basin at the foot, where the water gathers before the quay
    { const a = 232;
      const px = cux * a, pz = cuz * a;
      const gy = parisGround(_tp.x + px, _tp.z + pz) - base;
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 1.6, 24), water);
      basin.position.set(px, gy + 0.8, pz);
      casc.add(basin);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(30, 1.1, 6, 28), stone);
      rim.rotation.x = -Math.PI / 2; rim.position.set(px, gy + 1.2, pz);
      casc.add(rim);
    }
    casc.position.set(_tp.x, 0, _tp.z);
    casc.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(casc);
  }
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
  { const _p = placeLegacy('roue'); roue.position.set(_p.x, 0, _p.z); farSeen(roue); }
  roue.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(roue);
  // Collide with the LEGS only — daring pilots may thread the wheel. Taken from
  // where the wheel is actually drawn: this was written out as (400, 560) in the
  // old half frame and stayed there when the Roue moved onto its true
  // coordinates, so for a long while the wheel could be flown clean through and
  // there was an invisible obstacle 240 m away from it.
  { const _p = placeLegacy('roue');
    lmColliders.push({ x: _p.x, z: _p.z, w: 34, d: 12, h: 30, top: 30 }); }

  // ---------- the eleven that were only coordinates ----------
  // paris_geo.PLACES named twenty-seven landmarks and this file modelled
  // sixteen. The Louvre, the Madeleine, the Hôtel de Ville, the Gare d'Orsay,
  // both columns and the rest stood as nothing at all — the frontage generator
  // simply ran houses over the top of them. src/paris_landmarks.js carries the
  // footprints (see docs/PARIS_LANDMARKS.md for what each one was in 1901 and
  // where its figures come from); the massing is here.
  for (const L of LANDMARKS) {
    if (L.id === 'grandpalais' || L.id === 'opera') continue;   // already built
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xcfc6b0 });
    const roofM = new THREE.MeshLambertMaterial({ color: 0x5d6068 });
    const gold = new THREE.MeshPhongMaterial({ color: 0xc9a437, shininess: 110 });
    const hw = L.w / 2, hl = L.l / 2;

    if (L.kind === 'column') {
      // Vendôme and the Bastille: a shaft on a plinth with a figure on top —
      // the Little Corporal, and the Génie de la Liberté in gilt bronze.
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h * 0.12, L.l), stone);
      plinth.position.y = L.h * 0.06; g.add(plinth);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(L.w * 0.19, L.w * 0.22, L.h * 0.78, 16), stone);
      shaft.position.y = L.h * 0.51; g.add(shaft);
      const fig = new THREE.Mesh(new THREE.ConeGeometry(L.w * 0.16, L.h * 0.13, 8), gold);
      fig.position.y = L.h * 0.96; g.add(fig);
    } else if (L.kind === 'square') {
      // a place, not a building: paving and the bronze in the middle
      const pave = new THREE.Mesh(new THREE.PlaneGeometry(L.l, L.w),
        new THREE.MeshLambertMaterial({ color: 0xbdb6a4 }));
      pave.rotation.x = -Math.PI / 2; pave.position.y = 0.08; g.add(pave);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(9, 11, 9), stone);
      ped.position.y = 5.5; g.add(ped);
      const rep = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 8), gold);
      rep.position.y = 15.5; g.add(rep);
    } else if (L.kind === 'temple') {
      // the Madeleine: a Roman temple, fifty-two Corinthian columns ALL ROUND,
      // no dome, no tower — a colonnade and a pediment and nothing else.
      const cella = new THREE.Mesh(new THREE.BoxGeometry(L.l * 0.82, L.h * 0.72, L.w * 0.66), stone);
      cella.position.y = L.h * 0.36 + 3; g.add(cella);
      const base = new THREE.Mesh(new THREE.BoxGeometry(L.l, 6, L.w), stone);
      base.position.y = 3; g.add(base);
      const nx = Math.max(8, Math.round(L.l / 7.5)), nz = Math.max(4, Math.round(L.w / 7.5));
      for (let i = 0; i < nx; i++) {
        for (const sz of [-1, 1]) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, L.h * 0.66, 10), stone);
          c.position.set(-hl + 3 + (i / (nx - 1)) * (L.l - 6), L.h * 0.33 + 6, sz * (hw - 3));
          g.add(c);
        }
      }
      for (let i = 1; i < nz - 1; i++) {
        for (const sx of [-1, 1]) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, L.h * 0.66, 10), stone);
          c.position.set(sx * (hl - 3), L.h * 0.33 + 6, -hw + 3 + (i / (nz - 1)) * (L.w - 6));
          g.add(c);
        }
      }
      const ped = new THREE.Mesh(new THREE.ConeGeometry(L.w * 0.62, 9, 4), roofM);
      ped.rotation.y = Math.PI / 4;
      ped.scale.x = L.l / L.w;
      ped.position.y = L.h * 0.66 + 10; g.add(ped);
    } else if (L.kind === 'station') {
      // the Gare d'Orsay: a hotel front on the quay with the glazed barrel
      // vault of the train hall behind it, and the two great clocks.
      const front = new THREE.Mesh(new THREE.BoxGeometry(L.l, L.h, L.w * 0.42), stone);
      front.position.set(0, L.h / 2, -L.w * 0.29); g.add(front);
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(L.w * 0.29, L.w * 0.29, L.l * 0.92, 20, 1, false, 0, Math.PI),
        new THREE.MeshPhongMaterial({ color: 0x9fb6bd, shininess: 70 }));
      vault.rotation.z = Math.PI / 2;
      vault.position.set(0, L.h * 0.62, L.w * 0.2); g.add(vault);
      for (const sx of [-1, 1]) {
        const clock = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 1.2, 18), gold);
        clock.rotation.x = Math.PI / 2;
        clock.position.set(sx * L.l * 0.3, L.h * 0.78, -L.w * 0.5); g.add(clock);
      }
    } else if (L.kind === 'works') {
      // Lachambre's: a yard and a shed long enough to lay an envelope out in
      const shed = new THREE.Mesh(new THREE.BoxGeometry(L.l, L.h, L.w),
        new THREE.MeshLambertMaterial({ color: 0xb9ae95 }));
      shed.position.y = L.h / 2; g.add(shed);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(L.w * 0.52, L.w * 0.52, L.l, 12, 1, false, 0, Math.PI),
        new THREE.MeshLambertMaterial({ color: 0x7a6a52 }));
      roof.rotation.z = Math.PI / 2; roof.position.y = L.h; g.add(roof);
    } else {
      // a palace: a long mass with a mansard roof, and a pavilion at each end
      const body = new THREE.Mesh(new THREE.BoxGeometry(L.l, L.h * 0.78, L.w), stone);
      body.position.y = L.h * 0.39; g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(L.l * 0.97, L.h * 0.22, L.w * 0.9), roofM);
      roof.position.y = L.h * 0.89; g.add(roof);
      for (const sx of [-1, 1]) {
        const pav = new THREE.Mesh(new THREE.BoxGeometry(L.w * 0.6, L.h * 1.06, L.w * 1.02), stone);
        pav.position.set(sx * (hl - L.w * 0.3), L.h * 0.53, 0); g.add(pav);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(L.w * 0.44, L.h * 0.3, 4), roofM);
        cap.rotation.y = Math.PI / 4;
        cap.position.set(sx * (hl - L.w * 0.3), L.h * 1.2, 0); g.add(cap);
      }
      if (L.id === 'hoteldeville') {          // its belfry over the centre
        const bel = new THREE.Mesh(new THREE.BoxGeometry(16, L.h * 0.42, 16), stone);
        bel.position.y = L.h * 0.98; g.add(bel);
        const sp = new THREE.Mesh(new THREE.ConeGeometry(10, 22, 4), roofM);
        sp.rotation.y = Math.PI / 4; sp.position.y = L.h * 1.27; g.add(sp);
      }
      if (L.id === 'petitpalais') {           // the domed entrance pavilion
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshPhongMaterial({ color: 0x7d8a86, shininess: 40 }));
        dome.position.set(0, L.h * 0.9, -hw * 0.5); dome.scale.y = 1.2; g.add(dome);
      }
    }

    // at zero: liftToTerrain() puts every top-level child on its own ground at
    // the end of the build, so setting it here as well lifted these eleven
    // TWICE. Each stood at double its ground height — the Bastille column 4.4 m
    // above its own footing, and above its own collider, which is computed
    // from the ground once and was therefore in the right place all along.
    g.position.set(L.x, 0, L.z);
    g.rotation.y = L.ry;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(farSeen(g));      // the eleven are landmarks: seen from anywhere
    const ca = Math.abs(Math.cos(L.ry)), sa = Math.abs(Math.sin(L.ry));
    lmColliders.push({ x: L.x, z: L.z,
      w: L.l * ca + L.w * sa, d: L.l * sa + L.w * ca,
      h: L.h * 0.95, top: L.h * 1.3 });
  }

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
  { const _p = placeLegacy('grandpalais'); gp.position.set(_p.x, 0, _p.z); farSeen(gp); }
  gp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(gp);

  // Notre-Dame, far down the river: twin towers and the nave
  // NOTRE-DAME, at her real size and with the things you can only see from the
  // air. She was two boxes, a smaller box and a 22 m cone — "more detail for
  // note dame" — which from a basket over the Île de la Cité is a warehouse
  // with a pencil on it.
  //
  // The measurements are hers: 128 m long, 48 m across the nave and aisles, 69
  // to the top of the west towers, 43 to the ridge, 12 m rose window. The
  // flèche is Viollet-le-Duc's, rebuilt in 1859 and 96 m to the tip, so it was
  // standing over the crossing in 1901 exactly as drawn here. West front to the
  // west, apse to the east, which is +x.
  const nd = new THREE.Group();
  {
    const T_H = 69, NAVE_H = 43, EAVE = 33;
    const NAVE_W = 24, AISLE_W = 48;            // vault span, and the whole width
    const FRONT = 8;                            // the west front's own thickness
    const NAVE_L = 74, CROSS_X = FRONT + NAVE_L;
    // ---- the west front: two towers and the wall between them
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(14, T_H, 14), cream);
      t.position.set(FRONT / 2, T_H / 2, s * 14.5); nd.add(t);
      // the open belfry stage, which is what makes them towers and not chimneys
      const bel = new THREE.Mesh(new THREE.BoxGeometry(15, 3, 15), slate);
      bel.position.set(FRONT / 2, T_H - 1.5, s * 14.5); nd.add(bel);
    }
    const front = new THREE.Mesh(new THREE.BoxGeometry(FRONT, 45, AISLE_W - 10), cream);
    front.position.set(FRONT / 2, 22.5, 0); nd.add(front);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(6, 20),
      new THREE.MeshLambertMaterial({ color: 0x6b7f8c, emissive: 0x1c2a33 }));
    rose.rotation.y = -Math.PI / 2;
    rose.position.set(-0.2, 31, 0); nd.add(rose);
    // ---- the nave: aisles low on either side, the vault standing above them
    const aisles = new THREE.Mesh(new THREE.BoxGeometry(NAVE_L, 20, AISLE_W), cream);
    aisles.position.set(FRONT + NAVE_L / 2, 10, 0); nd.add(aisles);
    const nave = new THREE.Mesh(new THREE.BoxGeometry(NAVE_L, EAVE, NAVE_W), cream);
    nave.position.set(FRONT + NAVE_L / 2, EAVE / 2, 0); nd.add(nave);
    // the lead roof: a three-sided prism laid along her length, ridge up
    const ridge = (len, x, w, h, y) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.72, w * 0.72, len, 3), slate);
      r.rotation.z = Math.PI / 2;               // the prism's axis along x
      r.rotation.x = Math.PI / 2;               // ...and one flat face down
      r.position.set(x, y + h / 2, 0);
      r.scale.set(1, 1, h / (w * 0.72));
      nd.add(r);
      return r;
    };
    ridge(NAVE_L, FRONT + NAVE_L / 2, NAVE_W / 2, NAVE_H - EAVE, EAVE);
    // ---- the transept, crossing her a little east of the middle
    const tr = new THREE.Mesh(new THREE.BoxGeometry(22, EAVE, 62), cream);
    tr.position.set(CROSS_X, EAVE / 2, 0); nd.add(tr);
    for (const s of [-1, 1]) {                  // its two gables
      const gab = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 22, 3), slate);
      gab.rotation.x = Math.PI / 2;
      gab.position.set(CROSS_X, EAVE + 5, s * 26);
      gab.scale.set(1, 1, 1.2);
      nd.add(gab);
    }
    // ---- the choir and the apse: the round east end
    const choir = new THREE.Mesh(new THREE.BoxGeometry(30, EAVE, NAVE_W), cream);
    choir.position.set(CROSS_X + 26, EAVE / 2, 0); nd.add(choir);
    const chAisle = new THREE.Mesh(new THREE.BoxGeometry(30, 20, AISLE_W), cream);
    chAisle.position.set(CROSS_X + 26, 10, 0); nd.add(chAisle);
    ridge(30, CROSS_X + 26, NAVE_W / 2, NAVE_H - EAVE, EAVE);
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(AISLE_W / 2, AISLE_W / 2, 20, 14), cream);
    apse.position.set(CROSS_X + 41, 10, 0); nd.add(apse);
    const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(AISLE_W / 2, 12, 14), slate);
    apseRoof.position.set(CROSS_X + 41, 26, 0); nd.add(apseRoof);
    // ---- THE FLYING BUTTRESSES, which are the whole silhouette from above
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const bx2 = FRONT + 14 + i * 11;
        if (bx2 > CROSS_X - 8 && bx2 < CROSS_X + 12) continue;   // not across the transept
        const fly = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 15), cream);
        fly.position.set(bx2, 27, s * 15);
        fly.rotation.x = s * 0.42;              // springing down and out to the pier
        nd.add(fly);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3, 24, 3.4), cream);
        pier.position.set(bx2, 12, s * 22);
        nd.add(pier);
      }
    }
    // ---- the flèche over the crossing: 96 m to the tip
    const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.4, 8, 8), slate);
    spireBase.position.set(CROSS_X, NAVE_H + 4, 0); nd.add(spireBase);
    const fleche = new THREE.Mesh(new THREE.ConeGeometry(4.6, 45, 8), slate);
    fleche.position.set(CROSS_X, NAVE_H + 8 + 22.5, 0); nd.add(fleche);
  }
  nd.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  { const _p = placeLegacy('notredame'); nd.position.set(_p.x, 0, _p.z); farSeen(nd);
    // ...and she is SOLID, which she never was: two boxes and a cone stood on
    // the Île de la Cité with nothing to hit. Two colliders — the long mass at
    // roof height, and the west towers, which are 69 m and the tallest thing on
    // the island. The flèche is left out: it is four metres across and a ship
    // that threads it has earned it.
    lmColliders.push({ x: _p.x + 60, z: _p.z, w: 128, d: 48, h: 43, top: 45 });
    lmColliders.push({ x: _p.x + 4, z: _p.z, w: 20, d: 43, h: 69, top: 69 });
  }
  scene.add(nd);

  // Pantheon dome and the Opera
  const pan = new THREE.Group();
  const panBase = new THREE.Mesh(new THREE.BoxGeometry(34, 20, 34), cream); panBase.position.y = 10; pan.add(panBase);
  const panDrum = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 12, 12), cream); panDrum.position.y = 26; pan.add(panDrum);
  const panDome = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), slate); panDome.position.y = 33; panDome.scale.y = 1.05; pan.add(panDome);
  { const _p = placeLegacy('pantheon'); pan.position.set(_p.x, 0, _p.z); farSeen(pan); }
  scene.add(pan);
  const opera = new THREE.Group();
  const opBase = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 30), cream); opBase.position.y = 11; opera.add(opBase);
  const opDome = new THREE.Mesh(new THREE.SphereGeometry(11, 12, 8),
    new THREE.MeshPhongMaterial({ color: 0x5f7a64, shininess: 40 })); opDome.position.y = 26; opDome.scale.y = 0.7; opera.add(opDome);
  { const _p = placeLegacy('opera'); opera.position.set(_p.x, 0, _p.z); farSeen(opera); }
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
const PUTEAUX = { x: _pt.x, z: _pt.z, rx: 260, rz: 76 };   // below the Suresnes bridge   // the island in the reach

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
  // THE OTHER CROSSING, and it had the same fault as the Pont de Saint-Cloud.
  //
  // 150 m of deck is +-75, and the Seine here is 144 wide — so it cleared the
  // water by three metres and no more, its abutments straddled the waterline,
  // and the green embankments that carry the bank away from them began at +-69,
  // three metres INSIDE the river. Two reports, one minute apart, from a pilot
  // circling the same spot: "this bridge is weird and starts in the middle of
  // the sine", and "dark green in the water?" — which is that embankment,
  // standing in it.
  //
  // Measured off the river now, like the road bridge.
  const SPAN = (RIVER_HALF + 8) * 2, DECK = 15;
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
    const ABW = 20;
    const abut = new THREE.Mesh(new THREE.BoxGeometry(ABW, DECK + 1.5, 14), stone);
    // its inner face on the waterline, so the masonry stands on dry ground
    abut.position.set(sx * (RIVER_HALF + ABW / 2), (DECK + 1.5) / 2 - 0.6, 0);
    abut.castShadow = abut.receiveShadow = true;
    aq.add(abut);
    // the bank itself: high at the abutment, running out to nothing — and
    // starting BEYOND it, not three metres out in the stream
    const slope = Math.atan2(DECK - 0.5, EMB);
    const emb = new THREE.Mesh(new THREE.BoxGeometry(EMB, 8, 24),
      new THREE.MeshLambertMaterial({ color: 0x7b8a54 }));
    emb.position.set(sx * (RIVER_HALF + ABW + EMB / 2),
      (DECK - 0.5) / 2 - 3.4, 0);
    emb.rotation.z = -sx * slope;           // FAR end down: the near end meets the deck
    emb.receiveShadow = true;
    aq.add(emb);
  }

  let AQ;
  // The reach here runs north and south, so the crossing runs east and west:
  // the deck's long axis is local +x and the group is NOT turned. (Rotating it
  // a quarter turn laid the whole aqueduct along the water instead of over it.)
  // At the real Passerelle de l'Avre — the aqueduct's own crossing of the Seine
  // (src/paris_stcloud.js). It used to stand NINE METRES from the centre of
  // Longchamps racecourse and 564 m from any water.
  AQ = { x: AVRE.x, z: AVRE.z, ry: onTheRiver(AVRE.x, AVRE.z).ry };
  aq.position.set(AQ.x, 0, AQ.z);
  aq.rotation.y = AQ.ry;
  aq.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(aq);
  buildings.length -= 2;                            // re-place the piers in world terms
  for (const px of [-38, 38]) {
    buildings.push({ x: AQ.x + Math.cos(AQ.ry) * px, z: AQ.z - Math.sin(AQ.ry) * px,
      w: 18, d: 18, h: DECK, top: DECK });
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
  // "scarcely two air-ships' lengths" in front of Santos-Dumont's own doors —
  // which is a RELATIONSHIP, not a coordinate, so it is written as one. The
  // half-frame coordinate that used to be here left it 3.9 km from the
  // aerodrome, which is the opposite of the hazard he complained of.
  //
  // ...and then the relationship was written to the PAD rather than to the
  // doors, which put it behind the shed and a dozen metres off the secretary's
  // office, where the two read as one building stacked on another: "the hangar
  // under construction was on top of another building". Measured off the shed
  // now, as the sentence says: two lengths of the No. 6 out from the door face,
  // and set to one side of the doorway rather than square across it — "deutsch
  // air ship house should be off to the side and two airship lengths in front
  // of the other hangar".
  const SHIP_LEN = 33;                              // the No. 6, over all
  const skelAt = { x: PAD_POS.x + SHED.dx + SHED.w / 2 + 2 * SHIP_LEN,
    z: PAD_POS.z + SHED.dz + SHED.d / 2 + 41 };
  skel.position.set(skelAt.x, 0, skelAt.z);
  skel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(skel);
  buildings.push({ x: skelAt.x, z: skelAt.z, w: SK_L, d: SK_W, h: SK_H, top: SK_H + 4 });

  // ---- the foundation trenches that "began appearing here and there to the
  // right of my open doors": a metre deep, and his men forbidden to run across
  const trenchMat = new THREE.MeshLambertMaterial({ color: 0x4c4433 });
  const tr = mulberry32(77);
  for (let i = 0; i < 7; i++) {
    const len = 18 + tr() * 26;
    const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 2.4), trenchMat);
    // the drainage trenches "to the right of my open doors" — so they belong to
    // the aerodrome, and follow it rather than an old half-frame coordinate
    t.position.set(PAD_POS.x - 200 + tr() * 180, 0.12, PAD_POS.z - 160 + tr() * 120);
    t.rotation.y = tr() * Math.PI;
    scene.add(t);
  }

  // ---- Saint-Cloud itself: the Aéro-Club's ground lay on the coteaux, under
  // the wooded hillside of the park, with the village between. The château had
  // burned in 1870 and been pulled down in 1891, so what stands above the
  // grounds is the park's terraces, its cascade, and the trees. The hill is set
  // well back — its foot must not reach the aerodrome at x -2140.
  const scRand = mulberry32(1901);
  const _h = placeLegacy('stcloud');
  // west of the field, and no longer overrunning it
  // WELL BACK. Its foot has a radius of 820 m, and the club stood 772 m from
  // its axis — so the slope came down across the flying ground and stood in the
  // hangar's doorway: "there is a hill that is right in front of the hangar".
  // My own check for that measured to the AXIS and never added the foot.
  //
  // Pushed west and south, mostly beyond the survey's edge at x -5100, which is
  // what it is FOR: to be the Saint-Cloud hillside the heightfield stops short
  // of. 1,084 m from the field's centre now, against the 980 its foot and the
  // turf need between them.
  const HILL = { x: _h.x - 900, z: _h.z + 100, rTop: 330, rBot: 820, h: 95 };
  const hillH = (x, z) => {
    const r = Math.hypot(x - HILL.x, z - HILL.z);
    if (r <= HILL.rTop) return HILL.h;
    return HILL.h * Math.max(0, (HILL.rBot - r) / (HILL.rBot - HILL.rTop));
  };
  // A CONE ON A SLOPE HAS TO BE TOLD WHERE ITS FOOT IS. The survey's west edge
  // is x -5100, which catches the foot of the Saint-Cloud hill and no more, so
  // this cone is still the hillside beyond it. But it was placed like anything
  // on flat ground — base at local zero — and liftToTerrain then raised the
  // whole disc by the ground under its AXIS, which is 32 m up the slope. The
  // ground under its downhill edge is 5 m BELOW the river, so that edge hung
  // thirty-seven metres in the air over the aerodrome: "Wtf is that hill
  // floating above the aero club" (bug #48).
  //
  // Set from the LOWEST ground under its own footprint instead, and lifted by
  // nobody. It rises out of the valley floor and buries its uphill side in the
  // real slope, which is what a hill does.
  let hillFoot = Infinity;
  for (let a = 0; a < 12; a++) {
    const th = (a / 12) * Math.PI * 2;
    for (const rr of [HILL.rBot, HILL.rBot * 0.6, 0]) {
      hillFoot = Math.min(hillFoot,
        parisGround(HILL.x + Math.cos(th) * rr, HILL.z + Math.sin(th) * rr));
    }
  }
  const hillside = new THREE.Mesh(
    new THREE.CylinderGeometry(HILL.rTop, HILL.rBot, HILL.h, 24, 1),
    new THREE.MeshLambertMaterial({ color: 0x76854f }));
  hillside.position.set(HILL.x, hillFoot + HILL.h / 2, HILL.z);
  hillside.receiveShadow = true;
  hillside.userData.noLift = true;
  scene.add(hillside);
  // the collider's `top` is relative — the grounding pass adds the terrain under
  // the axis — so take that back out to land on the crown the cone really has
  buildings.push({ x: HILL.x, z: HILL.z, w: HILL.rBot * 1.5, d: HILL.rBot * 1.5,
    h: hillFoot + HILL.h * 0.8 - parisGround(HILL.x, HILL.z),
    top: hillFoot + HILL.h * 0.8 - parisGround(HILL.x, HILL.z) });

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
  // …round its church, on the WEST bank, where the town is. It used to be
  // scattered about a half-frame coordinate that put it across the river.
  for (let i = 0; i < 34; i++) {
    const x = CHURCH.x - 190 + scRand() * 380;
    const z = CHURCH.z - 260 + scRand() * 520;
    if (Math.hypot(x - PAD_POS.x, z - PAD_POS.z) < 340) continue;   // keep the field clear
    // ...and out of the Seine. The village is scattered across a rectangle and
    // was only ever asked to keep off the aerodrome, because the hand-drawn
    // river of the time did not come anywhere near it. The real one does: its
    // western loop runs right through here on its way past Suresnes, and four
    // of these houses were standing in it.
    {
      const near = riverNear(x, z);
      if (near && near.dist < RIVER_HALF + 20) continue;
    }
    const w = 24 + scRand() * 20, d = 20 + scRand() * 16, h = 8 + scRand() * 7;
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
  scChurch.position.set(CHURCH.x, 0, CHURCH.z);   // Église Saint-Clodoald
  scChurch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(scChurch);
  buildings.push({ x: CHURCH.x, z: CHURCH.z, w: 56, d: 28, h: 15, top: 39 });

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
  { const h = H2(-2036, -600); const q = onTheRiver(h.x, h.z);
    sur.position.set(q.x, 0, q.z); sur.rotation.y = q.ry; }   // over the water
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
  { const q = H2(-1930, -1040); station.position.set(q.x, 0, q.z); }
  station.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(station);
  { const q = H2(-1930, -1040); buildings.push({ x: q.x, z: q.z, w: 80, d: 56, h: 21, top: 25 }); }

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
  { const q = H2(-1010, 118); mill.position.set(q.x, 0, q.z); }
  mill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(mill);
  { const q = H2(-1010, 118); buildings.push({ x: q.x, z: q.z, w: 24, d: 24, h: 16, top: 23 }); }

  // ---- the Auteuil racecourse, whose crowd cheered him on the Deutsch run
  addOval(scene, AUTEUIL.x, AUTEUIL.z, AUTEUIL.rx, AUTEUIL.rz, 0x86a05e, 0.12);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(70, 12, 18),
    new THREE.MeshLambertMaterial({ color: 0xcfc4a8 }));
  stand.position.set(AUTEUIL.x, 6, AUTEUIL.z + AUTEUIL.rz * 0.72);   // on the rail
  stand.castShadow = true;
  scene.add(stand);
  buildings.push({ x: AUTEUIL.x, z: AUTEUIL.z + AUTEUIL.rz * 0.72,
    w: 140, d: 36, h: 12, top: 14 });

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
export function nearPolyline(pts, x, z, half, maxSeg = Infinity) {
  const h2 = half * half;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (x < Math.min(a.x, b.x) - half || x > Math.max(a.x, b.x) + half) continue;
    if (z < Math.min(a.z, b.z) - half || z > Math.max(a.z, b.z) + half) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    // a step far longer than the sampling is a gap in the data, not a reach of
    // whatever this polyline is: it is not water and you cannot land on it
    if (dx * dx + dz * dz > maxSeg * maxSeg) continue;
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
  // From src/paris_terrain.js, walked through OpenStreetMap's own ordered ways
  // — and carrying the water's real height with it, which falls 27.1 m to 23.7
  // across the map. The twenty-eight-point hand trace this replaces was out by
  // as much as 1.5 km and spent a fifth of its length on dry land.
  return SEINE_XZ.map(([x, z, y]) => new THREE.Vector3(x, y - PARIS_DATUM, z));
}

/**
 * TURN EVERY TRIANGLE THE RIGHT WAY UP.
 *
 * Nine separate places in this file decide, by hand, which order to push three
 * indices in — and every one of them is a coin flip that depends on which way
 * the polyline happens to be running, or which bank it is, or which side of a
 * square. Getting one wrong makes a surface whose geometry faces the ground:
 * back-face culled if it is single-sided, and BLACK if it is not, because
 * computeVertexNormals reads the winding and a normal pointing into the earth
 * fails every lighting and shadow test there is.
 *
 * That is the "black triangles" this game has now been told about four times —
 * #51 on the river bank, #55 after I double-sided the wrong ribbon, and #57,
 * #87 and #89 out in the Bois and over the eastern reach. Each time it was
 * fixed by working out the right order for that one case by hand, which is how
 * you get four reports of one bug.
 *
 * Measured, with the harness finally able to read a hand-built geometry: of the
 * ten indexed ground meshes in Paris, six were face-down — the two bank ribbons
 * at 392 triangles each, the aerodrome's apron, and 134,544 of the street
 * network's 159,256.
 *
 * So no one decides it by hand any more. Every ground triangle is checked
 * against the sky and turned over if it is facing away from it, whatever order
 * it was pushed in. A flat quad cannot be wrong twice.
 */
function faceUp(pos, idx) {
  let flipped = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    // the +Y component of (b-a) x (c-a)
    if (uz * vx - ux * vz < 0) {
      const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t;
      flipped++;
    }
  }
  return flipped;
}

/**
 * One bank of a river: a band from `inner` to `outer` metres out on `side`,
 * laid on the ground. Deliberately NOT a full-width ribbon — see the Seine's
 * quays, where a full-width one paved the river.
 */
function makeBankRibbon(pts, inner, outer, side, color, lift) {
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(side);
    for (const off of [inner, outer]) {
      const x = p.x + n.x * off, z = p.z + n.z * off;
      pos.push(x, parisGround(x, z) + lift, z);
    }
    if (i > 0 && p.distanceTo(pts[i - 1]) <= RIVER_GAP) {   // not across a gap
      const a = (i - 1) * 2;
      // WOUND THE RIGHT WAY UP, and that depends on the side. The offset normal
      // is `up x t` TIMES SIDE, so on one bank the quad comes out mirrored and
      // every triangle of it faces the riverbed: measured, 392 of 392 on the
      // south bank and none on the north.
      //
      // side: DoubleSide is not a cure for that, which is what this had. It
      // fixes the culling and leaves the LIGHTING wrong — the ribbon also
      // receives shadow, and a surface whose geometry faces away from the sun
      // fails the shadow test along its whole length and comes out black.
      // Reported twice: "What are these black triangles on the bank of the
      // river" (#51) and, after I double-sided the wrong ribbon, "Black
      // triangles on the bank what are they they look bad" (#55).
      if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a + 2, a + 1, a, a + 2, a + 3, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  faceUp(pos, idx);
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

function makeRibbon(pts, width, color, y, dull) {
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3().crossVectors(up, t).normalize();
    // `y` is a LIFT above whatever is underneath, not an absolute height: the
    // quays follow the river down into its valley and up the far bank.
    //
    // It must follow the GROUND and not be clamped up to the water: the quay
    // band is wider than the channel, so over the middle of the river a clamp
    // put the stone a few centimetres over the surface and paved the Seine.
    const ax = p.x + n.x * width / 2, az = p.z + n.z * width / 2;
    const bx = p.x - n.x * width / 2, bz = p.z - n.z * width / 2;
    pos.push(ax, parisGround(ax, az) + y, az);
    pos.push(bx, parisGround(bx, bz) + y, bz);
    // ...but not across a gap in the trace, which is a 3.3 km quad, exactly as
    // in makeBankRibbon. The city reach has one such gap today.
    if (i > 0 && p.distanceTo(pts[i - 1]) <= RIVER_GAP) {
      const a = (i - 1) * 2;
      // face UP: this ribbon is swept about `up x t` with no side flip, and in
      // that order every triangle came out facing the ground — all 150 of them
      idx.push(a + 2, a + 1, a, a + 2, a + 3, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  faceUp(pos, idx);
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // DOUBLE-SIDED, because this ribbon is wound face-DOWN — all hundred and
  // fifty of its triangles, measured. n = up x t and the quads are emitted in
  // the order that makes the normal come out underneath, so lit from above the
  // grass banks of the western Seine went black: "What are these black
  // triangles on the bank of the river" (bug #51).
  //
  // Double-siding rather than re-winding is what the rest of this file does
  // with ribbons — makeBankRibbon, the Seine's own sheet, the Monaco roads —
  // because the winding of a swept quad depends on the direction the trace
  // happens to run, and a ribbon that is right on one reach is inside out on
  // the next.
  return new THREE.Mesh(geo, dull
    ? new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
    : new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0xffe6c0,
      side: THREE.DoubleSide }));
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
    // …but never ACROSS a gap in the data. One step of this river is 3.3 km
    // long and runs over the hills of Meudon (paris_terrain.RIVER_GAP).
    if (i > 0 && p.distanceTo(pts[i - 1]) <= RIVER_GAP) {
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
  faceUp(pos, idx);
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * There used to be two bridges here, and they were placed BY INDEX.
 *
 *     for (const frac of [0.52, 0.62]) { const i = Math.floor(pts.length * frac); … }
 *
 * Fifty-two per cent of the way along an ARRAY is not a place. It is wherever
 * the station count happens to put it, so these two moved every time the river
 * was re-surveyed — and when repair_seine.py took the Seine from 246 stations
 * to 198 they moved again, one of them to within a kilometre of the Longchamps
 * racecourse, standing over dry ground. A pilot filed it: "Longchamps
 * racecourse has a bridge in the middle of it? I thought you cleaned this up."
 *
 * He was right to be exasperated, because this IS the fault that was cleaned up
 * once already — addExpoPavilions walked riverPts[60..94] and dropped four
 * pavilions in the water at Suresnes when the river changed under it.
 *
 * They are gone. The bridges of Paris are built where STREETS CROSS THE WATER
 * (see the crossing search in buildWorldParis): ten of them, each with a deck
 * spanning the actual width of the river at that point, each with a collider,
 * each at a place rather than at an index.
 */

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
        // How thickly this street builds. A trunk boulevard is built up almost
        // solid; a residential street off it gets a fraction, because the point
        // of the minor network is that the CITY reads as a city — six hundred
        // kilometres of street at boulevard density is fifty thousand buildings
        // and a frozen renderer.
        const skip = st.skip ?? 0.12;
        for (const side of [-1, 1]) {
          if (rand() < skip) continue;
          const off = st.w / 2 + depth / 2 + 1.5;
          const cx = x1 + dirx * (t + w / 2) + nx * off * side;
          const cz = z1 + dirz * (t + w / 2) + nz * off * side;
          if (!canPlace(cx, cz)) continue;
          // Clear of every OTHER street, not just the one it faces. Testing the
          // centre against a radius rejects the building against its own street
          // — it is set back from that one by construction — and threw away
          // three quarters of the city. The corners are what must not be in a
          // roadway, and the near ones sit a metre and a half outside the kerb.
          {
            const hw = w / 2, hd = depth / 2;
            const ux = dirx, uz = dirz;      // along the street; n is across it
            let intrudes = false;
            for (const su of [-1, 1]) for (const sv of [-1, 1]) {
              const px = cx + ux * hw * su + nx * hd * sv;
              const pz = cz + uz * hw * su + nz * hd * sv;
              if (streetClearance(px, pz) < 1) { intrudes = true; break; }
            }
            if (intrudes) continue;
          }
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
  // To the LINE, not to every second point on it.
  //
  // Sampling the vertices and taking the nearest is only right if you happen to
  // be near a vertex: halfway along a segment the nearest vertex is half the
  // spacing further off than the river is, and this walked every second point of
  // a ninety-metre polyline — so a house ninety metres out could measure a
  // hundred and eighty and be waved through. Thirteen of them ended up standing
  // in the Seine.
  const distToRiver = (x, z) => {
    let best = Infinity;
    for (let i = 0; i < riverPts.length - 1; i++) {
      const a = riverPts[i], b = riverPts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx * dx + dz * dz > RIVER_GAP * RIVER_GAP) continue;   // a gap, not a reach
      const L2 = dx * dx + dz * dz;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0;
      const qx = a.x + dx * t - x, qz = a.z + dz * t - z;
      const dd = qx * qx + qz * qz;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };
  // The Bois de Boulogne is woodland with two racecourses in it, not a suburb.
  // The frontage generator was building houses along every surveyed road that
  // runs through it — forty-six of them stood among the trees.
  //
  // This box said "plus the Longchamps and Auteuil grounds" and did not cover
  // them. It stops at x = -3800; LONGCHAMP'S CENTRE IS AT -3962, so the western
  // two thirds of the racecourse fell outside the exclusion and had houses
  // generated across the track. That is what a pilot was looking at when he
  // filed "Longchamps racecourse has a bridge in the middle of it? I thought
  // you cleaned this up" — and Longchamp is where the Deutsch runs began, so it
  // is the one field in this world that has to be empty.
  //
  // The grounds come from the PLACES table now instead of being typed, so they
  // cannot drift apart from the ovals that are actually drawn.
  const inOval = (o, x, z, pad = 60) =>
    ((x - o.x) / (o.rx + pad)) ** 2 + ((z - o.z) / (o.rz + pad)) ** 2 < 1;
  const inBois = (x, z) => (x >= -3800 && x <= -680 && Math.abs(z) <= 1120)
    || inOval(LONGCHAMPS, x, z) || inOval(AUTEUIL, x, z);

  // ---------- the real blocks, where there are real blocks ----------
  // src/paris_buildings.js holds 12,464 footprints off OpenStreetMap, covering
  // the theatre of every scenario. Inside that box the procedural frontage
  // generator is switched OFF entirely: two cities on the same ground would
  // interleave rows of invented houses through the real blocks.
  const OSM_BOX = { x0: -2410, x1: 2771, z0: -1935, z1: 1828 };
  const inSurveyedCity = (x, z) => x > OSM_BOX.x0 && x < OSM_BOX.x1
    && z > OSM_BOX.z0 && z < OSM_BOX.z1;
  const canPlace = (x, z) => !inSite(x, z) && !inBois(x, z)
    && !inSurveyedCity(x, z) && distToRiver(x, z) > 116;

  const list = generateFrontages(STREETS, canPlace, rand);

  // …and the surveyed blocks themselves. `w`/`d` are the world-axis extents the
  // collider wants; `rw`/`rd`/`ry` are the real ones the mesh is built from.
  for (const [bx, bz, bw, bl, bry, bh] of OSM_BUILDINGS) {
    if (inSite(bx, bz) || distToRiver(bx, bz) < 74) continue;
    const c = Math.abs(Math.cos(bry)), sn = Math.abs(Math.sin(bry));
    list.push({
      x: bx, z: bz, w: bl * c + bw * sn, d: bl * sn + bw * c, h: bh,
      rw: bl, rd: bw, ry: bry, r: ((bx * 7 + bz * 13) % 1000) / 1000,
      nChim: bw * bl > 220 ? 3 : 2,
    });
  }

  // interior fill: the deep-city backdrop east of the race line
  // Over the WHOLE city, not a box in the middle of it. The fill used to run
  // x 960..2480 and z -1520..1520 — a patch east of the Tower — so everything
  // beyond it had houses along the avenues and open ground behind them, which
  // is the "why is this area of city empty" a pilot reported. The clearance
  // test keeps them out of the roads and off the landmarks; the built-up bound
  // is what the fortifications enclosed.
  for (let gx = -700; gx <= 3500; gx += 96) {
    for (let gz = -2300; gz <= 2000; gz += 96) {
      const x = gx + (rand() - 0.5) * 22, z = gz + (rand() - 0.5) * 22;
      if (!canPlace(x, z)) continue;
      // the Bois and the western parks were not built over
      if (x < -560 && Math.abs(z) < 1700) continue;
      if (inSurveyedCity(x, z)) continue;      // the real blocks are there
      if (rand() < 0.25) continue;
      const w = 52 + rand() * 26, d = 52 + rand() * 26, r = rand();
      // the fill blocks are 52-78 m across, so a fixed margin on the CENTRE let
      // their corners sit well inside a roadway — clear the whole footprint
      if (streetClearance(x, z) < Math.hypot(w, d) * 0.5 + 3) continue;
      list.push({ x, z, w, d, h: 13 + rand() * 9, rw: w, rd: d, ry: 0, r, nChim: 2 });
    }
  }

  // ---- the city, in chunks ----
  //
  // ONE CITY, NOT TWO. The headset used to be given a different Paris: the
  // fifteen thousand footprints merged into five thousand block-sized boxes,
  // a third of the geometry for the same skyline. It was a good trade on paper
  // and it looked like what it was — "the giant buildings look bad in vr" — a
  // Haussmann block drawn as one sixty-metre slab, with no windows, no
  // roofline and no street between it and the next.
  //
  // The real buildings go in instead, cut into chunks, and a headset draws the
  // chunks near it and lets the rest go into the haze: "just do small
  // buildings but limit it to closeby ones then have ground fog further away".
  // Twelve thousand instanced boxes was never a draw-call problem — it is
  // ~600k vertices an eye at ninety hertz, and the overdraw of a thousand small
  // boxes standing behind one another. Both go away when only the near ones are
  // drawn, and neither comes back as a slab.
  const cityMeshes = addBuildingMeshesChunked(scene, list);

  // the Exposition pavilions of 1900 line both quays near the Tower
  addExpoPavilions(scene, riverPts, list, rand);
  return list;
}

/**
 * One box per CITY BLOCK, for the headset.
 *
 * FOUND BY CONNECTIVITY, NOT ON A GRID, because a grid cuts across the streets
 * and would pave over the Champs-Elysees. The buildings of a terrace touch each
 * other and a street is fifteen to twenty-five metres of nothing, so stamping
 * the footprints into a coarse raster and taking the connected components gives
 * back the block plan of the city.
 *
 * Each block becomes one box at the dominant angle of the buildings in it,
 * sized to enclose them and as tall as the tallest.
 */
export function mergeIntoBlocks(list) {
  const CELL = 3;                 // finer than a street, coarser than a party wall
  const cells = new Map();
  const corners = (b) => {
    const c = Math.cos(b.ry || 0), s2 = Math.sin(b.ry || 0);
    const hw = (b.rw !== undefined ? b.rw : b.w) / 2;
    const hd = (b.rd !== undefined ? b.rd : b.d) / 2;
    const out = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      out.push([b.x + sx * hw * c + sz * hd * s2, b.z - sx * hw * s2 + sz * hd * c]);
    }
    return out;
  };
  list.forEach((b, i) => {
    const cs = corners(b);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [px, pz] of cs) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
    }
    // ...stamping only the cells the building ACTUALLY covers. The axis-aligned
    // box of a long frontage at forty-five degrees is twice its area, and the
    // surplus reaches over the street and welds the next block on.
    const c = Math.cos(b.ry || 0), s2 = Math.sin(b.ry || 0);
    const hw = (b.rw !== undefined ? b.rw : b.w) / 2;
    const hd = (b.rd !== undefined ? b.rd : b.d) / 2;
    for (let gx = Math.floor(x0 / CELL) - 1; gx <= Math.ceil(x1 / CELL) + 1; gx++) {
      for (let gz = Math.floor(z0 / CELL) - 1; gz <= Math.ceil(z1 / CELL) + 1; gz++) {
        const px = (gx + 0.5) * CELL - b.x, pz = (gz + 0.5) * CELL - b.z;
        if (Math.abs(px * c - pz * s2) > hw || Math.abs(px * s2 + pz * c) > hd) continue;
        // a single integer key: string keys and split(',') were most of the
        // two and a half seconds this used to take at load
        const k = (gx + 32768) * 65536 + (gz + 32768);
        let a = cells.get(k);
        if (!a) { a = []; cells.set(k, a); }
        a.push(i);
      }
    }
  });

  const seen = new Set(), out = [];
  for (const key of cells.keys()) {
    if (seen.has(key)) continue;
    const queue = [key]; seen.add(key);
    const members = new Set();
    while (queue.length) {
      const k = queue.pop();
      for (const i of cells.get(k)) members.add(i);
      const gx = Math.floor(k / 65536), gz = k - gx * 65536;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const n = (gx + dx) * 65536 + (gz + dz);
        if (cells.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    if (!members.size) continue;
    // the block's angle is the dominant one of its buildings — they already
    // stand at whatever angle their street runs
    let ang = 0, bestW = -1, h = 0;
    for (const i of members) {
      const b = list[i];
      const wgt = (b.rw !== undefined ? b.rw : b.w) * (b.rd !== undefined ? b.rd : b.d);
      if (wgt > bestW) { bestW = wgt; ang = b.ry || 0; }
      if (b.h > h) h = b.h;
    }
    const c = Math.cos(-ang), s2 = Math.sin(-ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const i of members) {
      for (const [px, pz] of corners(list[i])) {
        const u = px * c - pz * s2, v = px * s2 + pz * c;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
    }
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    out.push({ x: cu * ca - cv * sa, z: cu * sa + cv * ca,
      w: u1 - u0, d: v1 - v0, h,
      rw: u1 - u0, rd: v1 - v0, ry: ang, r: (members.size % 10) / 10, nChim: 0 });
  }
  return out;
}

/**
 * The same city, cut into square chunks.
 *
 * THE HEADSET USED TO GET A DIFFERENT CITY. Fifteen thousand footprints were
 * merged into five thousand block-sized boxes, one per city block, which is a
 * third of the geometry for the same skyline — and looks like what it is: "the
 * giant buildings look bad in vr". A Haussmann block drawn as one 60 m slab has
 * no windows, no roofline and no street, and from the air Paris turns into a
 * bar chart.
 *
 * So the headset gets the REAL buildings, and gets fewer of them: "maybe we
 * should just do small buildings but limit it to closeby ones then have ground
 * fog further away". The city is built as one instanced set per chunk, and a
 * chunk whose nearest corner is beyond the fog is simply not drawn. Nothing is
 * merged, nothing is a stand-in, and what you fly over is what a pilot flying
 * flat sees.
 *
 * Each chunk carries where it is and how far its corner reaches, so the cull
 * can ask without measuring anything.
 */
export function addBuildingMeshesChunked(scene, list, colorOf, cell = 420) {
  const bins = new Map();
  for (const b of list) {
    const cx = Math.floor(b.x / cell), cz = Math.floor(b.z / cell);
    const k = cx + ',' + cz;
    let g = bins.get(k);
    if (!g) { g = { cx, cz, items: [] }; bins.set(k, g); }
    g.items.push(b);
  }
  const out = [];
  for (const g of bins.values()) {
    const meshes = addBuildingMeshes(scene, g.items, colorOf) || [];
    // the middle of the chunk, and the reach of its far corner
    const mid = { x: (g.cx + 0.5) * cell, z: (g.cz + 0.5) * cell };
    const r = Math.hypot(cell, cell) / 2;
    for (const m of meshes) {
      if (!m) continue;
      m.userData.chunkAt = mid;
      m.userData.chunkR = r;
    }
    out.push(...meshes);
  }
  return out;
}

/** Builds the instanced city and RETURNS its meshes, so a caller can swap them. */
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
    // b.y is the ground it stands on. Paris and St. Louis are flat and leave it
    // undefined; Monaco is a mountain and a house on the Boulevard des Moulins
    // has sixty metres of rock under it.
    const base = b.y || 0;
    q.setFromAxisAngle(yAxis, ry);
    m.compose(pos.set(b.x, base, b.z), q, scl.set(rw, b.h, rd));
    body.setMatrixAt(i, m);
    if (colorOf) colorOf(b, col);
    else col.setHSL(0.09 + b.r * 0.02, 0.22, 0.66 + b.r * 0.1);
    body.setColorAt(i, col);
    const roofH = 3.5 + b.r * 1.5;
    m.compose(pos.set(b.x, base + b.h, b.z), q, scl.set(rw * 0.84, roofH, rd * 0.84));
    roof.setMatrixAt(i, m);
    b.top = base + b.h + roofH;
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
  return [body, roof, chim];
}

// the white pavilions of the 1900 Exposition, domed, along the riverfront
function addExpoPavilions(scene, riverPts, list, rand) {
  const pav = [];
  // BY PLACE, not by index.
  //
  // This used to walk riverPts[60..94], which picked out the Champ de Mars
  // reach when the river was a hand-drawn curve sampled at two hundred points.
  // The Seine is the real one now — different points, different spacing — and
  // the same indices landed four pavilions in the water out by Suresnes, five
  // kilometres from the Exposition they belong to.
  //
  // They stand where the Exposition of 1900 stood: the riverfront either side
  // of the Pont d'Iena, under the Tower. So that is what is asked for.
  const twr = placeLegacy('eiffel');
  const REACH = 1300;                       // the Exposition's stretch of quay
  for (let i = 1; i < riverPts.length - 1; i += 3) {
    const p = riverPts[i];
    if (Math.hypot(p.x - twr.x, p.z - twr.z) > REACH) continue;
    const q2 = riverPts[i + 1];
    const tx = q2.x - p.x, tz = q2.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    const ry = Math.atan2(-tz / tl, tx / tl);
    for (const side of [-1, 1]) {
      if (rand() < 0.2) continue;
      const cx = p.x + nx * 128 * side, cz = p.z + nz * 128 * side;
      if (inSite(cx, cz)) continue;
      // A hundred and twenty-eight metres along ONE station's tangent is not
      // a hundred and twenty-eight metres from the river: on the inside of a
      // bend it is a good deal less, and on a tight one it is back in the
      // water. Ask the river how far off this actually is.
      const near = riverNear(cx, cz);
      if (near && near.dist < RIVER_HALF + 24) continue;
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
function addTrees(scene, standing) {
  // Nothing is planted through a wall or out in the river. The garden shapes
  // below are rectangles laid over their real axes, and a rectangle round the
  // Tuileries or the Esplanade catches the blocks along its edges and, at the
  // Plantes, the water: 81 trees were growing indoors and 8 midstream.
  const cell = 120, occupied = new Map();
  for (const b of (standing || [])) {
    const k = Math.floor(b.x / cell) + ',' + Math.floor(b.z / cell);
    if (!occupied.has(k)) occupied.set(k, []);
    occupied.get(k).push(b);
  }
  const indoors = (x, z) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
      for (const b of (occupied.get((gx + a) + ',' + (gz + c)) || [])) {
        const ry = b.ry || 0;
        const hw = (b.rw !== undefined ? b.rw : b.w) / 2 + 2;
        const hd = (b.rd !== undefined ? b.rd : b.d) / 2 + 2;
        const cs = Math.cos(ry), sn = Math.sin(ry);
        const px = x - b.x, pz = z - b.z;
        const lx = px * cs - pz * sn, lz = px * sn + pz * cs;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) return true;
      }
    }
    return false;
  };
  const plantable = (x, z) => {
    const n = riverNear(x, z);
    return !(n && n.dist < RIVER_HALF + 8) && !indoors(x, z);
  };
  const rand = mulberry32(99);
  const pts = [];
  for (let i = 0; i < 1250; i++) {
    const x = -3800 + rand() * 3120, z = -1120 + rand() * 2240;
    const dx = (x - LONGCHAMPS.x) / (LONGCHAMPS.rx + 14), dz = (z - LONGCHAMPS.z) / (LONGCHAMPS.rz + 14);
    if (dx * dx + dz * dz < 1) continue;
    if ((x - PAD_POS.x) ** 2 + (z - PAD_POS.z) ** 2 < 320 * 320) continue;
    if (distToStreets(x, z) < 26) continue; // keep the carriage roads clear
    if (!plantable(x, z)) continue;   // nor through the Bois's own walls
    pts.push({ x, z, s: 3 + rand() * 3.4, r: rand() });
  }

  // THE JARDINS DU TROCADERO. The scatter above covers the Bois and nothing
  // else, so the whole slope between the palace and the river — the showpiece
  // of the 1878 Exposition, terraced, planted, with the great cascade down the
  // middle — was bare ground. It is also the ground Santos-Dumont expected to
  // clear on 8 August 1901 ("I was expecting to land on the Seine embankment
  // beyond the Trocadero"), so it is under the flight path of scenario II.
  //
  // Planted in four rows flanking the cascade, thinning as the slope falls to
  // the quay, and kept off the central axis where the water runs.
  // THE GARDENS. Formal ones get allees down both flanks with the centre left
  // open — which is what a French garden IS from the air, and what makes the
  // Champ de Mars and the Esplanade read as avenues rather than as fields.
  // The English ones (Monceau) are planted through.
  for (const g of GARDENS.map(gardenGeom)) {
    const step = 26;
    for (let a = 30; a < g.L - 30; a += step) {
      const offs = g.formal
        ? [-g.half * 0.82, -g.half * 0.6, g.half * 0.6, g.half * 0.82]
        : [-g.half * 0.75, -g.half * 0.35, 0, g.half * 0.35, g.half * 0.75];
      for (const off of offs) {
        if (rand() < (g.formal ? 0.12 : 0.42)) continue;      // gaps, and glades
        const j = (rand() - 0.5) * (g.formal ? 7 : 34);
        const w = off + j;
        const x = g.a.x + g.ux * a - g.uz * w;
        const z = g.a.z + g.uz * a + g.ux * w;
        if (plantable(x, z)) pts.push({ x, z, s: 3.2 + rand() * 2.8, r: rand() });
      }
    }
  }

  {
    const t = placeLegacy('trocadero'), e = placeLegacy('eiffel');
    const dx = e.x - t.x, dz = e.z - t.z, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    for (let a = 55; a < 300; a += 15) {
      for (const side of [-1, 1]) {
        for (const off of [46, 74]) {
          const jitter = (rand() - 0.5) * 9;
          const wOff = side * (off + jitter);
          const px = t.x + ux * a - uz * wOff;
          const pz = t.z + uz * a + ux * wOff;
          if (rand() < 0.18) continue;               // gaps, not a plantation
          if (plantable(px, pz)) pts.push({ x: px, z: pz, s: 3.4 + rand() * 2.6, r: rand() });
        }
      }
    }
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
// Her real proportions. The platforms stand at 57, 115 and 276 metres — not the
// round 100/200/292 that were here — and she is 300 m to the top of the
// campanile, 312 with the conductor above it. The half-offsets are the leg
// centrelines: a 100 m square at the feet, 65 at the first platform, 30 at the
// second, 9 at the third.
const TOWER_ANCH = [[0, 50], [57, 32.5], [115, 15], [276, 4.5], [300, 3.2], [312, 2.2]];
const PLATFORMS = [57, 115, 276];

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

  // ---- the four legs ----
  // Each leg is a LATTICE COLUMN in its own right, not a single girder: four
  // uprights on a little square with cross-bracing on all four of its own
  // faces. That is the ironwork you see under the arches, and drawing the leg
  // as one line left the base looking like scaffolding poles. What stays open
  // below the first platform is the space BETWEEN the legs, which the arches
  // frame — see the face bracing further down.
  const legW = (y) => 15 - 11 * Math.min(1, y / 300);      // 15 m at the feet, 4 at the top
  for (const [sx, sz] of corners) {
    for (let i = 1; i < levels.length; i++) {
      const y0 = levels[i - 1], y1 = levels[i];
      const h0 = legHalf(y0), h1 = legHalf(y1);
      const w0 = legW(y0) / 2, w1 = legW(y1) / 2;
      const gird = 1.5 - 1.0 * (y0 / 300);
      // the four uprights of this leg
      for (const ox of [-1, 1]) for (const oz of [-1, 1]) {
        put(sx * h0 + ox * w0, y0, sz * h0 + oz * w0,
            sx * h1 + ox * w1, y1, sz * h1 + oz * w1, gird);
      }
      // and the X-bracing round the leg's own four faces, every other course
      if (i % 2 === 0) {
        const br = gird * 0.6;
        const P = (y, h, w, ox, oz) => [sx * h + ox * w, y, sz * h + oz * w];
        const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let c = 0; c < 4; c++) {
          const [ax2, az2] = ring[c], [bx2, bz2] = ring[(c + 1) % 4];
          const a0 = P(y0, h0, w0, ax2, az2), b0 = P(y0, h0, w0, bx2, bz2);
          const a1 = P(y1, h1, w1, ax2, az2), b1 = P(y1, h1, w1, bx2, bz2);
          put(a0[0], a0[1], a0[2], b1[0], b1[1], b1[2], br);
          put(b0[0], b0[1], b0[2], a1[0], a1[1], a1[2], br);
          put(a1[0], a1[1], a1[2], b1[0], b1[1], b1[2], br * 0.9);
        }
      }
    }
  }

  // ---- ties and cross-bracing, but NOT below the first platform ----
  // Under the platform she is four separate legs and the four great arches, and
  // nothing between them: that is the whole look of the thing, and it is why a
  // daring pilot can fly through her, which the collision code has always
  // allowed. Bracing every face from the ground up walled the base in.
  const FIRST_PLATFORM = PLATFORMS[0];
  for (let i = 2; i < levels.length; i += 2) {
    const y0 = levels[i - 2], y1 = levels[i];
    if (y1 <= FIRST_PLATFORM) continue;
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
        // the arch springs from the leg and rises to just under the platform:
        // its crown sits at about 39 m, as the real one does
        const h = legHalf(10 + u * 40);
        const x = (ax + (bx - ax) * u) * h, z = (az + (bz - az) * u) * h;
        return [x, 12 + Math.sin(Math.PI * u) * 27, z];
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
  platform(PLATFORMS[0], legHalf(PLATFORMS[0]) + 9, 5);
  platform(PLATFORMS[1], legHalf(PLATFORMS[1]) + 6, 4);
  platform(PLATFORMS[2], legHalf(PLATFORMS[2]) + 4, 3.4);

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
/**
 * The flight model's profile of her, taken FROM the shape she is drawn with
 * rather than written out beside it — the two used to be separate sets of
 * numbers and could drift apart. A leg centreline is legHalf from the axis, so
 * the corner is that by root two, and a little over for the girderwork.
 */
export function towerRadiusAt(y) {
  if (y > 318 || y < 0) return 0;
  return legHalf(y) * Math.SQRT2 + 3;
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
  body.position.set(0, 7.5, 0);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 2.5, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a3a28 }));
  roof.position.set(0, 16.2, 0);
  g.add(roof);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(15, 12),
    new THREE.MeshLambertMaterial({ color: 0x241a12 }));
  door.rotation.y = Math.PI / 2;
  door.position.set(22.1, 6, 0);
  g.add(door);
  // flag mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
  mast.position.set(-15, 11, 14); g.add(mast);
  const flagGeo = new THREE.PlaneGeometry(6, 3);
  flagGeo.translate(3, 0, 0); // pivot at the mast so it can stream downwind
  const flag = new THREE.Mesh(flagGeo,
    new THREE.MeshLambertMaterial({ color: 0xb5442f, side: THREE.DoubleSide }));
  flag.position.set(-15, 20.5, 14); g.add(flag);
  g.userData.flag = flag;
  return g;
}

// ---------------------------------------------------------------- clouds
// Fair-weather cumulus: flat shaded bases, bright cauliflower tops; plus a
// veil of high cirrus streaks aligned with the gradient wind.
/**
 * The weather deck. `opts` lets a world that is not a flat plain say so:
 * Monaco is seven kilometres across with a five-hundred-metre headland in the
 * middle of it and a thousand-metre mountain behind, and the Paris defaults put
 * every cloud inside the Tete de Chien.
 *
 *   box    {x0,x1,z0,z1}  where they may drift
 *   base   metres to the flat underside
 *   ground (x,z) => y     so the shadows lie on the hill and not through it
 */
export function makeClouds(scene, windBase, opts = {}) {
  const box = opts.box || { x0: -1800, x1: 1600, z0: -1500, z1: 1500 };
  const base = opts.base ?? 225;
  const ground = opts.ground || (() => 0);
  const bw = box.x1 - box.x0, bd = box.z1 - box.z0;
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
    grp.position.set(box.x0 + rand() * bw,
      base - (towering ? 35 : 0) + rand() * 150, box.z0 + rand() * bd);
    scene.add(grp);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 20), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(grp.position.x, ground(grp.position.x, grp.position.z) + 0.45, grp.position.z);
    scene.add(shadow);
    // the seeded birthplace is kept: every position after it is measured from
    // here, so the sky can be computed for any instant rather than stepped to
    clouds.push({ grp, shadow, r, towering, drift: 0.4 + rand() * 0.5,
      home: { x: grp.position.x, z: grp.position.z } });
  }
  // Where they wrap, and what they cast their shadows on. Both used to be
  // fixed: a 5.2 km field centred on the origin and a shadow at y=0.45. Over
  // Monaco, which runs seven kilometres east and stands a thousand metres up,
  // that lost half the sky over the sea and buried every shadow in the hill.
  clouds.field = { cx: (box.x0 + box.x1) / 2, cz: (box.z0 + box.z1) / 2,
                   span: Math.max(bw, bd) * 1.35, ground };
  // cirrus veil, streaked along the prevailing wind
  const windAng = windBase ? Math.atan2(-windBase.z, windBase.x) : 0;
  const cirrusTex = makeCirrusTexture();
  for (let k = 0; k < 7; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(900 + rand() * 500, 150 + rand() * 90),
      new THREE.MeshBasicMaterial({ map: cirrusTex, transparent: true, opacity: 0.16 + rand() * 0.1,
        depthWrite: false, fog: true }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -windAng + (rand() - 0.5) * 0.3;
    m.position.set(box.x0 + rand() * bw, base * 2.75 + rand() * 160, box.z0 + rand() * bd);
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

const CLOUD_SPAN = 5200;                        // Paris wraps over a 5.2 km field
function wrapField(v, c = 0, span = CLOUD_SPAN) {
  return ((v - c + span / 2) % span + span) % span - span / 2 + c;
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
  const f = clouds.field;
  for (const c of clouds) {
    const w = windAt(windBase, c.grp.position.y);
    c.grp.position.x = f ? wrapField(c.home.x + w.x * c.drift * t, f.cx, f.span)
                         : wrapField(c.home.x + w.x * c.drift * t);
    c.grp.position.z = f ? wrapField(c.home.z + w.z * c.drift * t, f.cz, f.span)
                         : wrapField(c.home.z + w.z * c.drift * t);
    const gy = f ? f.ground(c.grp.position.x, c.grp.position.z) : 0;
    c.shadow.position.set(c.grp.position.x, gy + 0.45, c.grp.position.z);
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
