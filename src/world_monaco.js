// Monaco, winter 1902 (docs/BOOK_REFERENCE.md A9, A11): the bay of Monaco
// "sheltered from behind against the wind and cold by mountains", the aerodrome
// of La Condamine with its giant doors, the landing-stage over the surf, and the
// coastal run toward Cap Martin. Over the sea the guide rope becomes the perfect
// stabilizer — and landing IN the sea ends the experiments (Ch. XX).
//
// THE GROUND IS REAL. It was hand-modelled cones until now — eight of them, and
// a Tete de Chien invented at a bearing the actual mountain does not stand on.
// It is now NASA's SRTM, screened back to 1902, at full scale: see
// monaco_geo.js for how, and what had to be undone (Monaco has grown a long way
// into the sea since). The streets are OpenStreetMap's, screened the same way.
// Nothing here is placed by eye; everything comes through place() or geo().

import * as THREE from 'three';
import { makeClouds, mulberry32, makePhysicalSky, makeShadowSun, makeWaterSurface,
         windify, windMats, generateFrontages, addBuildingMeshes,
         keepOutOfReflection } from './world.js';
import { STREETS_MC } from './monaco_streets.js';
import { HF, place, groundAt, groundRaw, isSea, slopeAt } from './monaco_geo.js';
import { inSiteMC } from './monaco_plan.js';

/** A named place as a point on the actual ground. */
function at(id, lift = 0) {
  const p = place(id);
  return new THREE.Vector3(p.x, groundAt(p.x, p.z) + lift, p.z);
}

export function buildWorldMonaco(scene) {
  windMats.length = 0;
  const rand = mulberry32(31);

  const PAD = at('aerodrome');                       // the shed on the boulevard
  const START = at('stage', 40);                     // the ring over the stage

  /**
   * Open water off a point, at least `r` metres out and as near the wanted
   * bearing as the coast allows. Asked of the heightfield rather than guessed:
   * guessing put the Cap Martin turn on the headland itself.
   */
  function offshore(p, r, prefer) {
    let best = null;
    for (let ring = r; ring <= r * 2.6; ring += 40) {
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const x = p.x + Math.cos(a) * ring, z = p.z + Math.sin(a) * ring;
        if (!isSea(x, z)) continue;
        // it must be clear water, not a notch in the rocks
        let clear = true;
        for (let j = 0; j < 8 && clear; j++) {
          const b = (j / 8) * Math.PI * 2;
          if (!isSea(x + Math.cos(b) * 120, z + Math.sin(b) * 120)) clear = false;
        }
        if (!clear) continue;
        const score = Math.abs(((a - prefer + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (!best || score > best.score) best = { x, z, score };
      }
      if (best) break;
    }
    return best || { x: p.x, z: p.z };
  }

  const cm = place('capmartin');
  // the turn is held off the headland, over open water, where the escort ran
  const turnPt = offshore(cm, 320, Math.atan2(cm.z - START.z, cm.x - START.x));
  const TURN = new THREE.Vector3(turnPt.x, 58, turnPt.z);

  // ---------- sky, light, fog (a bright, blue Mediterranean morning) ----------
  scene.fog = new THREE.FogExp2(0xdfd4bc, 0.00026);
  const sunDir = new THREE.Vector3(0.9, 0.22, -0.35).normalize();
  const sky = makePhysicalSky(scene, sunDir, { rayleigh: 1.8, turbidity: 4 });
  scene.add(new THREE.HemisphereLight(0xfdeccd, 0x5f6a5a, 0.8));
  const sun = makeShadowSun(scene, sunDir, 2.8);

  // ---------- the Mediterranean ----------
  const sea = makeWaterSurface(new THREE.PlaneGeometry(24000, 24000), sunDir, 0x1c3a52);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(1600, 0.0, -1700);
  scene.add(sea);

  // ---------- the mountain ----------
  // One mesh over the whole heightfield, at twice its resolution so the cliffs
  // read as cliffs. It is built on groundRaw, which goes on down under the
  // water instead of stopping flat at zero: the shore then falls where the
  // interpolation crosses the waterline, rather than stepping round the grid in
  // fifty-metre blocks — and there is nothing left to z-fight the sea plane.
  const SUB = 2;
  const gx = (HF.nx - 1) * SUB, gz = (HF.nz - 1) * SUB;
  const step = HF.step / SUB;
  const terrGeo = new THREE.PlaneGeometry(gx * step, gz * step, gx, gz);
  terrGeo.rotateX(-Math.PI / 2);
  const tp = terrGeo.attributes.position;
  const colors = new Float32Array(tp.count * 3);
  const rock = new THREE.Color(0x8a8674), scrubC = new THREE.Color(0x6c7a4e);
  const highC = new THREE.Color(0x9a9382), shingle = new THREE.Color(0xb6ab8f);
  const seabed = new THREE.Color(0x2e4a52);
  const cx0 = HF.x0 + (gx * step) / 2, cz0 = HF.z0 + (gz * step) / 2;
  const c = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const wx = tp.getX(i) + cx0, wz = tp.getZ(i) + cz0;
    const h = groundRaw(wx, wz);
    tp.setY(i, h);
    if (h <= 0.02) c.copy(seabed);
    else {
      const s = Math.min(1, slopeAt(wx, wz) / 0.75);       // bare where it is steep
      // shingle only at the water's edge — a flat band up to seven metres made
      // the whole of La Condamine read as beach
      c.copy(shingle).lerp(scrubC, Math.min(1, Math.max(0, (h - 2.5) / 9)));
      c.lerp(rock, s);
      if (h > 300) c.lerp(highC, Math.min(1, (h - 300) / 500));
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  terrGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.position.set(cx0, 0, cz0);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // A skirt round the edge of the survey. Without it the world ends in a
  // vertical cliff of nothing at Cap d'Ail and under Mont Agel — the fog hides
  // it from a pilot at sea level, but not from anyone who climbs.
  {
    const x0 = HF.x0, x1 = HF.x0 + (HF.nx - 1) * HF.step;
    const z0 = HF.z0, z1 = HF.z0 + (HF.nz - 1) * HF.step;
    const pos = [], idx = [];
    const edge = [];
    const N = 90;
    for (let i = 0; i <= N; i++) edge.push([x0 + (x1 - x0) * (i / N), z0]);
    for (let i = 1; i <= N; i++) edge.push([x1, z0 + (z1 - z0) * (i / N)]);
    for (let i = 1; i <= N; i++) edge.push([x1 - (x1 - x0) * (i / N), z1]);
    for (let i = 1; i <= N; i++) edge.push([x0, z1 - (z1 - z0) * (i / N)]);
    for (const [ex, ez] of edge) {
      pos.push(ex, groundRaw(ex, ez), ez);
      pos.push(ex, -240, ez);
    }
    for (let i = 0; i < edge.length - 1; i++) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      color: 0x6d6a5c, side: THREE.DoubleSide })));
  }

  const buildings = [];

  // ---------- the streets, laid on the ground they climb ----------
  // One merged mesh, as in Paris. Every quad is DOUBLE-SIDED here rather than
  // wound by hand: a road draped over a hillside has no single "up", and this
  // project has twice lost an entire road network to reversed winding, once in
  // Paris and once in the Seine before it.
  {
    const pos = [], col = [], idx = [];
    const cRoad = new THREE.Color(0x9a9285), cDirt = new THREE.Color(0x8f8a6a);
    const cRail = new THREE.Color(0x4a4238);
    for (const st of STREETS_MC) {
      const tint = st.rail ? cRail : st.dirt ? cDirt : cRoad;
      const hw = st.w / 2;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const nx = -dz, nz = dx;
        // cut long runs up so the roadway follows the hill instead of spanning it
        const n = Math.max(1, Math.ceil(len / 12));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          for (const t of [t0, t1]) {
            const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
            for (const s of [-1, 1]) {
              const qx = px + nx * hw * s, qz = pz + nz * hw * s;
              pos.push(qx, groundAt(qx, qz) + 0.45, qz);
              col.push(tint.r, tint.g, tint.b);
            }
          }
          const b = pos.length / 3 - 4;
          idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const roads = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }));
    roads.receiveShadow = true;
    scene.add(roads);
  }

  // ---------- the town, along the streets it grew on ----------
  const cream = ['#e3d3b5', '#dcc4a8', '#e8dcc2', '#d9c8ae', '#e2c8b0'];
  const canPlaceMC = (x, z) =>
    !inSiteMC(x, z) && !isSea(x, z) && slopeAt(x, z) < 0.62;
  const town = generateFrontages(STREETS_MC, canPlaceMC, rand,
    { hMin: 9, hVar: 8, wMin: 14, wVar: 9, dMin: 12, dVar: 7 });
  for (const b of town) b.y = groundAt(b.x, b.z);
  addBuildingMeshes(scene, town, (b, c3) => c3.set(cream[Math.floor(b.r * cream.length) % cream.length]));
  for (const b of town) buildings.push(b);

  // ---------- what stood on the Rock ----------
  const pMat = new THREE.MeshLambertMaterial({ color: 0xe6d9c0 });
  const put = (grp, id, extra = 0) => {
    const p = at(id, extra);
    grp.position.copy(p);
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(grp);
    return p;
  };

  const palace = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(46, 14, 30), pMat);
  pBody.position.y = 7; palace.add(pBody);
  for (const [tx, tz] of [[-20, -12], [20, -12], [-20, 12], [20, 12]]) {
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 20, 8), pMat);
    tw.position.set(tx, 10, tz); palace.add(tw);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.8, 5, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a3a28 }));
    cap.position.set(tx, 22.5, tz); palace.add(cap);
  }
  const pPos = put(palace, 'rock');
  buildings.push({ x: pPos.x, z: pPos.z, w: 46, d: 30, y: pPos.y, h: 24, top: pPos.y + 27 });

  // the cathedral, still building — consecrated 1903, a year after he flew here
  const cath = new THREE.Group();
  const cBody = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 16), pMat);
  cBody.position.y = 6; cath.add(cBody);
  const cDome = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xb9ad93 }));
  cDome.position.y = 14; cDome.scale.y = 1.1; cath.add(cDome);
  const caPos = put(cath, 'cathedral');
  buildings.push({ x: caPos.x, z: caPos.z, w: 30, d: 16, y: caPos.y, h: 12, top: caPos.y + 20 });

  // Albert I's Musee oceanographique, begun 1899 and not finished until 1910 —
  // in 1902 the great sea-facing wall was rising out of the cliff in scaffold
  const oc = new THREE.Group();
  const ocBody = new THREE.Mesh(new THREE.BoxGeometry(34, 26, 20), pMat);
  ocBody.position.y = 13; oc.add(ocBody);
  for (let i = 0; i < 5; i++) {                       // the scaffold, still up
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 30, 5),
      new THREE.MeshLambertMaterial({ color: 0x7a6242 }));
    pole.position.set(-17 - 1.5, 15, -8 + i * 4); oc.add(pole);
  }
  const ocPos = put(oc, 'oceano');
  buildings.push({ x: ocPos.x, z: ocPos.z, w: 34, d: 20, y: ocPos.y, h: 26, top: ocPos.y + 28 });

  const chapel = new THREE.Group();
  chapel.add(new THREE.Mesh(new THREE.BoxGeometry(10, 8, 7),
    new THREE.MeshLambertMaterial({ color: 0xe8dcc2 })));
  const chPos = put(chapel, 'stedevote', 4);
  buildings.push({ x: chPos.x, z: chPos.z, w: 10, d: 7, y: chPos.y - 4, h: 8, top: chPos.y + 4 });

  // Fort Antoine on the Rock's north point, and the fort on the Tete de Chien
  for (const [id, r, h] of [['fortantoine', 16, 7], ['forttete', 26, 9]]) {
    const f = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 8),
      new THREE.MeshLambertMaterial({ color: 0x8f8574 }));
    ring.position.y = h / 2; f.add(ring);
    const p = put(f, id);
    buildings.push({ x: p.x, z: p.z, w: r * 2, d: r * 2, y: p.y, h, top: p.y + h });
  }

  // ---------- Monte Carlo ----------
  const creamMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc2 });
  const copper = new THREE.MeshPhongMaterial({ color: 0x5f8a74, shininess: 60 });
  // Garnier's Casino — cream palace, two seaside cupola towers, the clock
  const casino = new THREE.Group();
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
  const csPos = put(casino, 'casino');
  buildings.push({ x: csPos.x, z: csPos.z, w: 54, d: 32, y: csPos.y, h: 24, top: csPos.y + 24 });

  // the Salle Garnier alongside it, the Hotel de Paris and the Hermitage
  for (const [id, w, d, h] of [['opera', 30, 22, 20], ['hoteldeparis', 40, 26, 26],
                               ['hermitage', 36, 24, 24]]) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), creamMat);
    body.position.y = h / 2; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 3.5, d * 0.9), copper);
    roof.position.y = h + 1.6; g.add(roof);
    const p = put(g, id);
    buildings.push({ x: p.x, z: p.z, w, d, y: p.y, h, top: p.y + h + 3.5 });
  }

  // the Trophy of Augustus above La Turbie, standing there since 6 BC
  const troph = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 18, 12),
    new THREE.MeshLambertMaterial({ color: 0xc9bda0 }));
  drum.position.y = 17; troph.add(drum);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(26, 16, 26),
    new THREE.MeshLambertMaterial({ color: 0xbfb298 }));
  plinth.position.y = 8; troph.add(plinth);
  const trPos = put(troph, 'trophee');
  buildings.push({ x: trPos.x, z: trPos.z, w: 26, d: 26, y: trPos.y, h: 26, top: trPos.y + 26 });

  // ---------- the aerodrome of La Condamine, with its giant doors ----------
  const hangar = new THREE.Group();
  const hMat = new THREE.MeshLambertMaterial({ color: 0xd8cfb8 });
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(58, 16, 13), hMat);
  hBody.position.set(-22, 8, 0); hangar.add(hBody);
  const hRoof = new THREE.Mesh(new THREE.BoxGeometry(60, 2.2, 15),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  hRoof.position.set(-22, 17, 0); hangar.add(hRoof);
  // the famous doors, each fifteen metres tall, rolled apart by two small princes
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 15, 5.6),
      new THREE.MeshLambertMaterial({ color: 0x4a3a2c }));
    door.position.set(7.5, 7.5, s * 5.6);
    hangar.add(door);
  }
  // it faced the water, so she could be walked straight out to the stage
  const stagePos = place('stage');
  hangar.rotation.y = -Math.atan2(stagePos.z - PAD.z, stagePos.x - PAD.x);
  const hPos = put(hangar, 'aerodrome');
  buildings.push({ x: hPos.x - 22, z: hPos.z, w: 58, d: 15, y: hPos.y, h: 18, top: hPos.y + 18 });

  // "It will be enough to build a landing-stage on the sea side of the wall at
  // the level of the boulevard" — twelve days' work, after the first launch
  // nearly pitched him out of the basket over the wall's four-metre drop
  const stg = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 26),
    new THREE.MeshLambertMaterial({ color: 0x9a7d54 }));
  deck.position.y = 4.2; stg.add(deck);
  for (let i = 0; i < 12; i++) {
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b5236 }));
    pile.position.set(-20 + (i % 6) * 8, 0.4, i < 6 ? -11 : 11); stg.add(pile);
  }
  put(stg, 'stage');
  // the deck is dry footing amid the surf — see isWater below
  const STAGE = { x: stagePos.x, z: stagePos.z, w: 46, d: 26 };
  // AND IT IS SOMETHING TO STAND ON. isWater knew the deck was dry and nothing
  // else did: there was no collider within forty metres of it, so a ship that
  // came down on the landing-stage went straight through the planks and rested
  // on the sea below — "Completed the scenario but fell thru the landing
  // platform" (bug #53). Which is a poor reward for the one piece of ground in
  // this world built for the purpose: "It will be enough to build a
  // landing-stage on the sea side of the wall at the level of the boulevard."
  //
  // The deck is a box 1.6 m thick centred at 4.2, so its planking is at 5.0.
  buildings.push({ x: stagePos.x, z: stagePos.z, w: STAGE.w, d: STAGE.d,
    y: 3.4, h: 5.0, top: 5.0 });

  // the sea wall it was built over, and the electric tramcar tracks behind it —
  // "From the side walk it was only waist high, but on the other side of it the
  // surf rolled over pebbles from four to five metres below."
  {
    const bd = STREETS_MC.filter((s) => s.name === 'Boulevard Albert 1er');
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xbdb3a0 });
    const railMat = new THREE.MeshPhongMaterial({ color: 0x6b6459, shininess: 80 });
    for (const st of bd) {
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 2) continue;
        const ang = -Math.atan2(bz - az, bx - ax);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        // the wall stands on the seaward kerb — whichever side that is here
        const side = isSea(mx + nx * 22, mz + nz * 22) ? 1 : -1;
        const wx = mx + nx * (st.w / 2 + 1) * side, wz = mz + nz * (st.w / 2 + 1) * side;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 5.2, 1.6), wallMat);
        wall.position.set(wx, groundAt(wx, wz) + 0.4, wz);
        wall.rotation.y = ang; wall.castShadow = true;
        scene.add(wall);
        for (const off of [-0.9, 0.9]) {              // the tramway, two rails
          const rx = mx + nx * off * side * -1, rz = mz + nz * off * side * -1;
          const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.16), railMat);
          rail.position.set(rx, groundAt(rx, rz) + 0.6, rz);
          rail.rotation.y = ang; scene.add(rail);
        }
      }
    }
  }

  // ---------- olive scrub on the slopes ----------
  const scrub = [];
  for (let i = 0; i < 1400; i++) {
    const x = -1900 + rand() * 6800, z = -3600 + rand() * 4600;
    const h = groundAt(x, z);
    if (h < 3 || h > 620 || slopeAt(x, z) > 0.85) continue;
    if (town.some((b) => Math.abs(b.x - x) < b.w * 0.7 && Math.abs(b.z - z) < b.d * 0.7)) continue;
    scrub.push({ x, y: h, z, s: 1.8 + rand() * 2.4 });
  }
  const sGeo = new THREE.SphereGeometry(1, 6, 5); sGeo.translate(0, 0.6, 0);
  const sMesh = new THREE.InstancedMesh(sGeo,
    windify(new THREE.MeshLambertMaterial({ color: 0x5d6b46 })), scrub.length);
  {
    const m = new THREE.Matrix4();
    scrub.forEach((t, i) => {
      m.makeScale(t.s, t.s * 0.8, t.s).setPosition(t.x, t.y, t.z);
      sMesh.setMatrixAt(i, m);
    });
  }
  sMesh.castShadow = true;
  scene.add(sMesh);

  // ---------- yachts in the port, anchored head-to-wind ----------
  // down the coast: a headwind out to Cap Martin, and the wind behind coming home
  const WINDB = new THREE.Vector3(2.6, 0, 1.6);
  const headToWind = Math.atan2(WINDB.z, -WINDB.x);
  const anchorage = place('port');
  for (let i = 0; i < 7; i++) {
    let x, z, tries = 0;
    do { x = anchorage.x + (rand() - 0.5) * 210; z = anchorage.z + (rand() - 0.5) * 190; }
    while (!isSea(x, z) && ++tries < 20);
    scene.add(makeYacht(x, z, rand(), headToWind + (rand() - 0.5) * 0.3));
  }
  const steamerAt = { x: anchorage.x + 60, z: anchorage.z + 40 };
  scene.add(makeSteamer(steamerAt.x, steamerAt.z));

  // the steamer's smoke streams downwind (the book's own "Wind A / Wind B" cue)
  const smokeBase = new THREE.Vector3(steamerAt.x + 2, 6.5, steamerAt.z - 1.5);
  const puffMatS = new THREE.MeshLambertMaterial({ color: 0x9a938a, transparent: true, opacity: 0.32, depthWrite: false });
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), puffMatS.clone());
    scene.add(s); puffs.push(s);
  }

  // ---------- the escort ----------
  // "One steam chaloupe and two petroleum launches, all three of them swift
  // goers, together with three well-manned row-boats, had been stationed at
  // intervals down the coast to pick me up in case of accident."
  const KNOT = 0.5144;                            // metres a second
  const escort = [];
  for (let i = 0; i < 3; i++) {
    const boat = makeYacht(0, 0, 0.35 + i * 0.1, 0);
    boat.userData.leg = 0.18 + i * 0.17;          // how far down the coast it runs
    boat.userData.ph = i * 0.37;
    boat.userData.trim = -0.25 + i * 0.25;        // knots: one is better sailed
    scene.add(boat);
    escort.push(boat);
  }
  // They follow the line the ship flies — but nudged seaward wherever it cuts a
  // corner of the coast, because a launch cannot cross the Monte Carlo
  // headland and the shortest line from the stage to the cape does.
  //
  // The lane is then measured and walked by ARC LENGTH. Walking it by index
  // instead looks right and is not: the nudged waypoints are further apart than
  // the straight ones, so a boat covering "one index per second" surges through
  // the bends and dawdles on the straights.
  const LANE = [];
  {
    // every twenty-five metres: at ninety-metre spacing a boat could pass over
    // a thirteen-metre shoal standing a hand's breadth out of the water, with a
    // waypoint safely afloat on either side of it
    const N = Math.ceil(Math.hypot(TURN.x - START.x, TURN.z - START.z) / 25);
    const nx = -(TURN.z - START.z), nz = TURN.x - START.x;
    const nl = Math.hypot(nx, nz) || 1;
    const seaward = (x, z) => {
      for (let push = 0; push < 40 && !isSea(x, z); push++) {
        x += (nx / nl) * 30; z += (nz / nl) * 30;      // out to sea, thirty at a time
      }
      return { x, z };
    };
    // It begins a hundred and forty metres off the stage — they lie in the
    // roads, not alongside the planks the ship is caught on.
    const OFF = 140 / Math.hypot(TURN.x - START.x, TURN.z - START.z);
    for (let i = 0; i <= N; i++) {
      const f = OFF + (1 - OFF) * (i / N);
      LANE.push(seaward(START.x + (TURN.x - START.x) * f, START.z + (TURN.z - START.z) * f));
    }
    // A pair of waypoints can both be afloat with dry land between them. Any
    // segment whose middle is ashore gets that middle put to sea as well, until
    // the whole lane is water.
    for (let pass = 0; pass < 6; pass++) {
      let fixed = 0;
      for (let i = 0; i < LANE.length - 1; i++) {
        const mx = (LANE[i].x + LANE[i + 1].x) / 2, mz = (LANE[i].z + LANE[i + 1].z) / 2;
        if (isSea(mx, mz)) continue;
        LANE.splice(i + 1, 0, seaward(mx, mz)); i++; fixed++;
      }
      if (!fixed) break;
    }
  }
  // cumulative distance to each waypoint, so the lane can be walked in metres
  const LANE_S = [0];
  for (let i = 1; i < LANE.length; i++) {
    LANE_S.push(LANE_S[i - 1] + Math.hypot(LANE[i].x - LANE[i - 1].x, LANE[i].z - LANE[i - 1].z));
  }
  const LANE_LEN = LANE_S[LANE_S.length - 1];

  /** A point `s` metres along the lane from the stage. */
  function alongLane(s) {
    s = Math.max(0, Math.min(LANE_LEN, s));
    let lo = 0, hi = LANE_S.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (LANE_S[mid] <= s) lo = mid; else hi = mid; }
    const seg = Math.max(1e-6, LANE_S[lo + 1] - LANE_S[lo]);
    const f = (s - LANE_S[lo]) / seg;
    const a = LANE[lo], b = LANE[lo + 1];
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f,
             hx: (b.x - a.x) / seg, hz: (b.z - a.z) / seg };
  }

  const tick = (dt, t, wind) => {
    const wSpeed = Math.hypot(wind.x, wind.z);
    const wLen = wSpeed || 1;
    const wx = wind.x / wLen, wz = wind.z / wLen;
    // Five knots in a breath, seven with something behind her — and never
    // outside that, whichever of the three is best sailed. They were making
    // three hundred and forty kilometres an hour before this: the old code read
    // its "speed" as a fraction of the whole five-kilometre lane, per second.
    const knots = 5.25 + 1.5 * Math.min(1, wSpeed / 8);
    for (const b of escort) {
      const legLen = Math.max(1, LANE_LEN * b.userData.leg);   // metres, each way
      const mps = (knots + b.userData.trim) * KNOT;
      const u = ((t * mps) / legLen + b.userData.ph) % 2;
      const out = u < 1;
      const p = alongLane((out ? u : 2 - u) * legLen);          // out, then back
      b.position.set(p.x, 0.6, p.z);
      b.rotation.y = -Math.atan2(p.hz, p.hx) + (out ? 0 : Math.PI);
      // she heels away from the wind, and harder the more of it there is
      const rel = Math.cos(b.rotation.y - Math.atan2(wz, wx));
      b.rotation.z = -rel * Math.min(0.22, wSpeed * 0.03);
    }
    puffs.forEach((p, i) => {
      const u = ((t * 0.13 + i / 7) % 1);
      p.position.set(smokeBase.x + wx * u * 55, smokeBase.y + u * 20, smokeBase.z + wz * u * 55);
      p.scale.setScalar(0.9 + u * 4.5);
      p.material.opacity = 0.34 * (1 - u);
    });
  };

  // The cloud deck stands over the mountain, not in it: the Tete de Chien is
  // 573 m and Mont Agel above a thousand, so the base goes to eight hundred and
  // the field is stretched to the whole bay from Cap d'Ail to Cap Martin.
  const clouds = makeClouds(scene, WINDB, {
    box: { x0: HF.x0, x1: HF.x0 + (HF.nx - 1) * HF.step,
           z0: HF.z0, z1: HF.z0 + (HF.nz - 1) * HF.step },
    base: 800,
    ground: groundAt,
  });
  // ...and the sea does not reflect them. Reflected off a bright Mediterranean
  // at a grazing angle their flat tan undersides read as sandbanks lying a few
  // hundred metres offshore, with the waves rippling over them.
  keepOutOfReflection(sea, clouds.map((c) => c.grp));

  const LM = (id, name, up, r, clue) => {
    const p = place(id);
    return { id, name, x: p.x, z: p.z, y: groundAt(p.x, p.z) + up, r, clue };
  };

  return {
    name: 'Monaco, winter 1902',
    sun, sunDir, sky, waters: [sea], flags: [], tick,
    buildings, clouds, trees: scrub,
    landmarks: [
      LM('casino', 'the Casino terrace', 40, 60,
        '“A thousand handkerchiefs were fluttering.” The terraces of Monte Carlo.'),
      LM('rock', 'the Prince’s Palace', 45, 60,
        'On the Rock, above the harbour — the Prince who paid for the aerodrome lives here.'),
      LM('cathedral', 'the cathedral', 42, 50,
        'Beside the palace on the same rock, facing the sea. Finished the year after he flew here.'),
      LM('oceano', 'the Musée océanographique', 46, 50,
        'Albert I’s own museum, still in its scaffolding on the cliff face.'),
      LM('tetedechien', 'the Tête de Chien', 60, 170,
        'The great head of rock that stands over the whole principality — five hundred and seventy metres.'),
      LM('trophee', 'the Trophy of Augustus', 40, 90,
        'Up at La Turbie, on the Roman road. It has stood there since six years before Christ.'),
      LM('capmartin', 'Cap Martin', 55, 180,
        '“I was now well up the coast.” The point he turned at, out beyond the bay.'),
      LM('stage', 'the landing-stage', 34, 55,
        'The stage at La Condamine, where the ground crew wait to catch her.'),
    ],
    towerPos: null, padPos: PAD,
    startRing: START, turnRing: TURN,
    gates: [TURN],
    towSpots: [{ name: 'the quay of the Condamine', pos: at('condamine') }],
    limitNote: 'the coastal run to Cap Martin and back, eleven kilometres',
    vistaPos: at('boulingrins', 90),               // from above the Casino gardens
    windBase: WINDB,
    // The No. 6 does 22 km/h and the turn stands 5.6 km off the stage, so the
    // round trip is 11.1 km and cannot be flown in much under 1820 seconds in a
    // dead calm. The limit carries the same thirteen per cent over that as the
    // Deutsch does over its own course — earned, not given.
    raceLimit: 2100, raceRecord: 1900,
    limitNoteLong: 'Cap Martin and back: 11.1 km, and the No. 6 makes 22 km/h.',
    hints: {
      idleNear: 'The run to Cap Martin waits — call “Let go all!” when you are ready.',
      idleFar: 'Free flight — the run begins over the landing-stage of La Condamine.',
      out: 'Down the coast to Cap Martin — into the teeth of the breeze. Guide-rope low over the waves.',
      back: 'Home to the bay of Monaco — the wind behind you now.',
      turnMsg: 'Round Cap Martin! “The air-ship swung round like a boat” — now home on the wind, like an eagle.',
    },
    // the ground IS the map now: anything at or under the waterline is sea,
    // except the planks of the landing-stage
    groundAt,
    // the Mediterranean is at zero, which is what groundAt already returns out
    // there — so this changes nothing here, and keeps every world answering the
    // same question the same way
    waterY: (x, z) => (isSea(x, z) ? 0 : null),
    isWater: (x, z) => isSea(x, z)
      && !(Math.abs(x - STAGE.x) < STAGE.w / 2 && Math.abs(z - STAGE.z) < STAGE.d / 2),
    isInBois: () => false,
  };
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
