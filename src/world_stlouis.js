// St. Louis, 1904 — the Louisiana Purchase Exposition (Ch. XXIV, PERIOD_NOTES).
//
// Santos-Dumont inspected the grounds in 1902 and proposed a short triangular
// course around three towers "so the Exposition public would see the flights
// from start to finish," with a grand prize of $100,000. Here it is.
//
// EVERYTHING IN THIS FILE COMES FROM TWO PLACES AND NEITHER OF THEM IS MEMORY.
//
//   src/stlouis_geo.js and src/stlouis_plan.js — WHERE and HOW BIG. Generated
//   by tools/gen_stlouis_geo.py from the fair's own 1904 ground plan (Buxton &
//   Skinner), georeferenced against the two things the fair built that are
//   still standing: the Palace of Fine Arts, now the Saint Louis Art Museum,
//   and the Smithsonian's flight cage, now in the zoo. Steps 3 and 4 of
//   docs/STLOUIS_PLAT.md.
//
//   docs/STLOUIS_PALACES.md — WHAT THEY LOOKED LIKE. Read out of the fair's own
//   Official Guide, line by line, with every figure cited. Step 2 of the same,
//   and the reason this file no longer builds eight identical boxes: the guide
//   identifies each palace to the visitor BY WHAT STOOD ON ITS ROOF, and every
//   one of those things is below.
//
// The one correction with the most picture in it: the guide says "The color of
// the exhibit buildings is ivory white, WITH DASHES OF COLOR ON THE ROOFS."
// The walls were already right. The roofs were all one grey, and they should
// never have been — Machinery's were red with green tower caps, Mines was
// "distinguished by a lavish use of color," and the rest carried their own.

import * as THREE from 'three';
import { makeClouds, mulberry32, makePhysicalSky, makeShadowSun, makeWaterSurface, windify, windMats, makeStreamFlag } from './world.js';
import { PLACES, groundAt, HILL } from './stlouis_geo.js';
import { SITES, SITE, CONCOURSE, BASIN } from './stlouis_plan.js';

const at = (id) => PLACES[id];

// ---------------------------------------------------------------- the course
// "I suggested that three great towers or flagstaffs be erected in the grounds
// at the corners of an EQUAL-SIDED triangle. The comparatively short course
// around them — between 10 and 20 miles — would afford a decisive test of
// dirigibility no matter in what way the wind might blow; while as for speed,
// the necessary average might be increased 50 per cent. over that fixed for the
// Deutsch prize" (Ch. XXIV).
//
// So: a true equilateral triangle, flown three times, on the open ground
// between the Aeronautic Concourse and the main picture — which is where the
// fair actually had room, and which brings the near leg down over the Pike,
// where the crowds were, rather than over the palace roofs.
//
// These three numbers are not taste. tools/check_stlouis.py sweeps the centre,
// the radius and the rotation against EVERY built thing in this file — the
// palaces' rotated footprints, Festival Hall, both Colonnade kiosks, the
// monument, the wheel and the whole length of the Pike — and reports the
// clearance and the resulting course length. This is the best of them: 222 m
// clear of anything standing, and 9,297 m of course against the 9,054 the
// race limit was tuned on, so the limit only had to move by three per cent.
const PYLON_H = 76;
const TRI_C = { x: 60, z: 1480 }, TRI_R = 500, TRI_ROT = 0.2793;
const PYLONS = [0, 1, 2].map((i) => {
  const a = -Math.PI / 2 + TRI_ROT + i * 2 * Math.PI / 3;
  const x = TRI_C.x + Math.cos(a) * TRI_R, z = TRI_C.z + Math.sin(a) * TRI_R;
  return new THREE.Vector3(x, groundAt(x, z), z);
});
// …and the race gates: set ~40 m OUTSIDE each pylon, so flying the gate
// naturally rounds the tower (it is never on the pole itself). Each gate is a
// rectangle cut to the pylon it stands off — as tall as the pylon, half that
// wide, its sill a quarter of the pylon's height off the ground.
const GATES = PYLONS.map((p) => {
  const dx = p.x - TRI_C.x, dz = p.z - TRI_C.z;
  const len = Math.hypot(dx, dz) || 1;
  const x = p.x + (dx / len) * 40, z = p.z + (dz / len) * 40;
  return Object.assign(
    new THREE.Vector3(x, PYLON_H / 4 + PYLON_H / 2, z),
    { gw: PYLON_H / 2, gh: PYLON_H },
  );
});
const PAD = new THREE.Vector3(at('concourse').x, 2, at('concourse').z);
const START = new THREE.Vector3(PAD.x - 8, 55, PAD.z - 90);

// ---------------------------------------------------------------- the palaces
// One entry per palace, and every line of it is a quotation from the Official
// Guide by way of docs/STLOUIS_PALACES.md. `roof` is the colour of the "dashes
// of color on the roofs"; the walls are ivory for all of them.
//
//   cornice   25 m for all of them. The guide publishes no palace height
//             anywhere. This is inferred from the one building of the same
//             family it DID measure — the U.S. Government Building, "the height
//             from the bottom of the stylobate to the top of the attic is 82
//             feet" — and it is an inference, not a figure.
const CORNICE = 25.0;             // 82 ft, stylobate to top of attic
const IVORY = 0xefe9dc;
const CHAR = {
  education: {
    roof: 0xa8563f, order: 'corinthian', paired: true,   // "columns grouped in pairs"
    arch: 'triumphal', quadriga: true, colonnade: true,
    // "Quadriga over main entrances … 'Goldenrod' repeated six times over the
    // entrance colonnades" — Robert Bringhurst, all of it
  },
  electricity: {
    roof: 0x9c6a3c, order: 'corinthian', paired: true, colonnade: true,
    pyramids: 6, star: true, brokenEaves: true,
    // "The court pavilions are crowned by pyramidal towers. Surmounting each of
    // these is a beautiful nude figure of a woman, HOLDING ALOFT A STAR, by
    // which the building may be recognized."
  },
  mines: {
    roof: 0xb0783a, screen: true, obelisks: 4, polychrome: true,
    // "a lavish use of color … four stately entrances, each displaying a pair
    // of obelisks"; the side walls set back 20 ft behind a sculptured screen
  },
  liberal_arts: {
    roof: 0x8d6a4a, order: 'doric', arch: 'triumphal', arches: 3,
    quadriga: true, roundCorners: true, colonnade: true,
    // "three magnificent Roman triumphal arches … connected by a Doric
    // colonnade and the corners are treated in the form of round pavilions …
    // the most gigantic quadriga ever placed on any Exposition palace"
  },
  manufactures: {
    roof: 0x9a5a44, order: 'ionic', niche: true, cresting: true,
    quadriga: true, sphinx: true, colonnade: true,
    // "a colossal Roman niche that forms the main entrance … the Greek Sphinx,
    // on block pedestals, guarding all the entrances, and the rich cresting on
    // the roof"
  },
  varied_industries: {
    roof: 0x8a6a9c, order: 'ionic', dome: true, rotunda: true,
    cornerDomes: true, towers: 2, colonnade: true,
    // "an elaborate entrance thrown back behind a circular detached colonnade …
    // an ornate dome overlooks the open court thus formed … the square
    // pavilions at the corners are crowned by low domes"
  },
  machinery: {
    roof: 0xb5442f, pitched: true, towerCap: 0x4d7a52, atlas: true,
    // "can be easily identified by its RED SLOPING ROOFS and its GREEN CAPPED
    // TOWERS … 'Atlas with Globe,' colossal group, N. facade"
    notch: true,   // "with a rectangle cut out of the southwestern corner"
  },
  transportation: {
    roof: 0x7d5a3e, pylonsNotColumns: true, bigArches: true,
    roundTowers: true, eagleGlobe: true,
    // "each of the arched openings being 64 feet wide and 52 feet high. This is
    // the only building in the group that is not decorated with classic columns
    // … crowned by eagles holding on their backs the hollow, ribbed sphere of
    // the universe"
  },
  agriculture: { roof: 0x8a8f6a, glass: true, plain: true },
  //   "departs materially from the general ornate style … large areas of glass"
  steam_gas_fuels: { roof: 0x6a5f52, stacks: 4 },
  //   "the smokestacks of the boilers will readily locate it"
  us_government: { roof: 0x9a9488, order: 'ionic', dome: true, quadriga: true },
  //   the one building the guide measures: dome 100 ft, quadriga 175 ft up
  fine_arts: { roof: 0x8f8d86, stone: 0xb9b4a6, order: 'corinthian', colonnade: true },
  //   "built of Bedford stone … out of harmony with the general scheme of the
  //   Fair, it is screened from view by Festival Hall" — so it is GREY
  fine_arts_w: { roof: 0x8f8d86, stone: 0xa89c8a },
  fine_arts_e: { roof: 0x8f8d86, stone: 0xa89c8a },
  horticulture: { roof: 0x6f8f7a, glass: true, minarets: 2 },
  forestry: { roof: 0x7a6a4a },
};

export function buildWorldStLouis(scene) {
  windMats.length = 0;
  // ---------- high summer noon: white light, blue sky ----------
  scene.fog = new THREE.FogExp2(0xdfe6e8, 0.00028);
  const sunDir = new THREE.Vector3(0.45, 0.8, -0.3).normalize();
  const sky = makePhysicalSky(scene, sunDir, { rayleigh: 0.9, turbidity: 3 });
  scene.add(new THREE.HemisphereLight(0xeaf2f6, 0x6f7a5c, 0.85));
  const sun = makeShadowSun(scene, sunDir, 2.6);

  const buildings = [];
  const rand = mulberry32(1904);
  const ivory = new THREE.MeshLambertMaterial({ color: IVORY });
  const gold = new THREE.MeshPhongMaterial({ color: 0xc9a437, shininess: 110, specular: 0xfff0c0 });

  // ---------- the ground, with Art Hill in it ----------
  // Not a disc and a cone any more: one mesh sampled from stlouis_geo's
  // groundAt, which is the hill fitted to the DEM and to the cascade face.
  {
    const N = 96, S = 5200;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, groundAt(a.getX(i), a.getZ(i)));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x7e9159 }));
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ---------- the Grand Basin ----------
  // "This Grand Basin is semi-circular in shape and 600 feet in diameter."
  // The flat side faces the cascades; the curve bulges away down the axis, and
  // the lagoon carries on from it to the Plaza of St. Louis.
  const head = at('basin_head');
  const waters = [];
  {
    const basin = makeWaterSurface(new THREE.CircleGeometry(BASIN.r, 40, Math.PI / 2, Math.PI),
      sunDir, 0x2a4a5e);
    basin.rotation.x = -Math.PI / 2;
    basin.position.set(head.x, 0.32, 0);
    scene.add(basin);
    waters.push(basin);
    const rim = new THREE.Mesh(new THREE.RingGeometry(BASIN.r, BASIN.r + 10, 40, 1, Math.PI / 2, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(head.x, 0.18, 0);
    scene.add(rim);
  }
  // the lagoon down the axis to the Plaza of St. Louis, and the fan's two arms
  // The lagoons are NOT reflectors. A three.js Water re-renders the whole scene
  // from a mirrored camera every frame, and the fan wants a dozen sheets of
  // water — a dozen extra scene passes, which both costs the frame rate and
  // renders them near-black as they mirror each other. The Grand Basin, the one
  // sheet anybody looks at, is the reflector; the lagoons are lit water.
  const lagoons = [];
  const lagoonMat = new THREE.MeshPhongMaterial({
    color: 0x3d6a7e, shininess: 90, specular: 0x9fd0e0,
  });
  const lagoon = (x1, z1, x2, z2, w) => {
    const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), lagoonMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -ang;
    m.position.set((x1 + x2) / 2, 0.3, (z1 + z2) / 2);
    scene.add(m);
    lagoons.push({ x: m.position.x, z: m.position.z, ang, len, w });
  };
  const mon = at('purchase_monument');
  lagoon(head.x - BASIN.r + 8, 0, mon.x + 60, 0, 82);
  // "It is ENTIRELY SURROUNDED BY LAGOONS, but by means of monumental bridges
  // we gain entrance" (Education); "The Lagoon surrounds it entirely, and six
  // bridges connect it with the main avenues" (Electricity). So they are moats,
  // set out from the footprint rather than drawn across the fan by eye — which
  // is how the old hand-drawn arm came to run through Electricity's corner.
  // The gap and the width are not free: Electricity's wall stands 41 m from
  // Machinery's, and the water has to fit between them. Eight metres of quay
  // and twenty-two of water leaves eleven clear on the far side.
  const moat = (site, gap = 8, lw = 22) => {
    const c = Math.cos(-site.rot), s = Math.sin(-site.rot);
    const to = (lx, lz) => [site.x + lx * c - lz * s, site.z + lx * s + lz * c];
    const hl = site.l / 2 + gap + lw / 2, hw = site.w / 2 + gap + lw / 2;
    const L = site.l + 2 * (gap + lw), W = site.w + 2 * (gap + lw);
    for (const sz of [-1, 1]) lagoon(...to(-L / 2, sz * hw), ...to(L / 2, sz * hw), lw);
    for (const sx of [-1, 1]) lagoon(...to(sx * hl, -W / 2), ...to(sx * hl, W / 2), lw);
  };
  moat(SITE.education);
  moat(SITE.electricity);

  // ---------- the palaces ----------
  for (const site of SITES) buildPalace(scene, site, buildings, ivory, gold, rand);

  // ---------- Festival Hall ----------
  // "the dome was 145 feet wide" on "a cylindrical base 200 feet wide", the
  // whole 200 feet high; and on the top of it "'Victory,' crowning dome,
  // GILDED" — the first Victory to take the form of a man, modelled by a woman.
  // A gold figure on a cream dome at the top of the hill: the single most
  // visible object at the fair, and it should read as gold.
  const fh = at('festival_hall');
  const fhY = groundAt(fh.x, fh.z);
  {
    const DRUM_R = 200 * 0.3048 / 2;        // 30.5 m
    const DOME_R = 145 * 0.3048 / 2;        // 22.1 m
    const TOP = 200 * 0.3048;               // 61.0 m to the top of the dome
    const fest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R, DRUM_R + 3, TOP - DOME_R * 1.7, 24), ivory);
    base.position.y = (TOP - DOME_R * 1.7) / 2;
    fest.add(base);
    // the colonnade round the drum — "deeply set oculus windows, and tall columns"
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 22, 7), ivory);
      col.position.set(Math.cos(a) * (DRUM_R + 1.2), 20, Math.sin(a) * (DRUM_R + 1.2));
      fest.add(col);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0xe4dcc4, shininess: 40 }));
    dome.position.y = TOP - DOME_R * 1.7;
    dome.scale.y = 1.7;
    fest.add(dome);
    const victory = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 8), gold);
    victory.position.y = TOP + 4.5;
    fest.add(victory);
    fest.position.set(fh.x, fhY, fh.z);
    fest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(fest);
    buildings.push({ x: fh.x, z: fh.z, w: DRUM_R * 2, d: DRUM_R * 2, h: fhY + TOP, top: fhY + TOP + 9 });
  }

  // ---------- the Colonnade of States ----------
  // "a peristyle swinging around the W. of the gardens and connecting Festival
  // Hall with two elaborately finished kiosks … At regular intervals along the
  // terrace, in front of the Colonnade, are SEATED FEMALE FIGURES, emblematic
  // of the FOURTEEN STATES developed from the Louisiana Purchase Territory",
  // the peristyle "formed of seven hemi-cycles on each side of Festival Hall."
  {
    const kw = at('colonnade_w'), ke = at('colonnade_e');
    const arc = new THREE.Group();
    const BAYS = 14, SEG = 7;
    for (let i = 0; i <= BAYS * SEG; i++) {
      const t = i / (BAYS * SEG);
      // a shallow arc from kiosk to kiosk, bulging back past Festival Hall
      const x = kw.x + (ke.x - kw.x) * t + Math.sin(Math.PI * t) * (fh.x - (kw.x + ke.x) / 2);
      const z = kw.z + (ke.z - kw.z) * t;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 13, 7), ivory);
      col.position.set(x, groundAt(x, z) + 6.5, z);
      arc.add(col);
      if (i % SEG === Math.floor(SEG / 2)) {         // one seated state per bay
        const fig = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 2.4), ivory);
        fig.position.set(x - 9, groundAt(x - 9, z) + 3.2, z);
        arc.add(fig);
      }
    }
    for (const k of [kw, ke]) {                       // the two kiosks
      const y = groundAt(k.x, k.z);
      const ki = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 17, 12), ivory);
      ki.position.set(k.x, y + 8.5, k.z);
      arc.add(ki);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0xd9cfae }));
      cap.position.set(k.x, y + 17, k.z); cap.scale.y = 0.7;
      arc.add(cap);
      buildings.push({ x: k.x, z: k.z, w: 24, d: 24, h: y + 24, top: y + 25 });
    }
    arc.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(arc);
  }

  // ---------- the Cascades ----------
  // "The water gushes forth from this fount TWENTY-FOUR FEET above the level of
  // the terrace, spreads out into a stream FORTY-FIVE FEET WIDE and fourteen
  // inches deep, and LEAPS FROM WEIR TO WEIR, down the long slope of ledges or
  // steps, SPREADING TO A WIDTH OF ONE HUNDRED AND FIFTY FEET as it takes its
  // final plunge into the Grand Basin."
  //
  // So it is a widening stepped wedge, not three parallel ribbons: 13.7 m at
  // the fount, 45.7 m where it enters the water, and stepped the whole way.
  {
    const TOP_W = 45 * 0.3048, BOT_W = 150 * 0.3048, FOUNT = 24 * 0.3048;
    const x0 = HILL.crown, x1 = head.x;               // terrace edge to water
    const STEPS = 14;
    const water = new THREE.MeshPhongMaterial({ color: 0x7fb0c9, shininess: 130, specular: 0xffffff });
    const stone = new THREE.MeshLambertMaterial({ color: 0xe4ddc9 });
    for (let i = 0; i < STEPS; i++) {
      const ta = i / STEPS, tb = (i + 1) / STEPS;
      const xa = x0 + (x1 - x0) * ta, xb = x0 + (x1 - x0) * tb;
      const ya = groundAt(xa, 0) + FOUNT * (1 - ta), yb = groundAt(xb, 0) + FOUNT * (1 - tb);
      const wa = TOP_W + (BOT_W - TOP_W) * ta, wb = TOP_W + (BOT_W - TOP_W) * tb;
      // the tread: a quad from (xa,ya,±wa/2) to (xb,yb,±wb/2)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        xa, ya, -wa / 2, xa, ya, wa / 2, xb, yb, wb / 2,
        xa, ya, -wa / 2, xb, yb, wb / 2, xb, yb, -wb / 2,
      ]), 3));
      g.computeVertexNormals();
      const tread = new THREE.Mesh(g, water);
      scene.add(tread);
      // and the riser under its lip, so it reads as a stair from below
      const riser = new THREE.Mesh(new THREE.BoxGeometry(1.6, Math.max(0.6, ya - yb), wb), stone);
      riser.position.set(xb, (ya + yb) / 2, 0);
      scene.add(riser);
    }
    // the hood the water issues from, in front of Festival Hall's door
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, FOUNT + 3, 14), ivory);
    hood.position.set(x0 + 8, groundAt(x0 + 8, 0) + (FOUNT + 3) / 2, 0);
    hood.castShadow = true;
    scene.add(hood);
    // the two side cascades, from the basins in front of the kiosks
    for (const s of [-1, 1]) {
      for (let i = 0; i < STEPS; i++) {
        const ta = i / STEPS, tb = (i + 1) / STEPS;
        const zc = s * (70 + 40 * ta);
        const xa = x0 + (x1 - x0) * ta, xb = x0 + (x1 - x0) * tb;
        const ya = groundAt(xa, zc) + 2, yb = groundAt(xb, s * (70 + 40 * tb)) + 2;
        const step = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) / STEPS * 1.1, 14), water);
        step.rotation.x = -Math.PI / 2;
        step.position.set((xa + xb) / 2, (ya + yb) / 2, zc);
        scene.add(step);
      }
    }
  }

  // ---------- the Louisiana Purchase Monument ----------
  // "the Louisiana Monument, ONE HUNDRED FEET HIGH, that rises from the center
  // of the Plaza of St. Louis … 'Peace,' crowning the shaft, by Karl Bitter."
  {
    const H = 100 * 0.3048;                            // 30.5 m, not the 43 it was
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, H - 4, 12), ivory);
    shaft.position.y = (H - 4) / 2; g.add(shaft);
    const peace = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5.2, 8), gold);
    peace.position.y = H - 1.4; g.add(peace);
    for (let i = 0; i < 4; i++) {                      // "four groups of statuary"
      const a = i * Math.PI / 2;
      const grp = new THREE.Mesh(new THREE.BoxGeometry(3, 4.4, 3), ivory);
      grp.position.set(Math.cos(a) * 6, 2.2, Math.sin(a) * 6);
      g.add(grp);
    }
    g.position.set(mon.x, groundAt(mon.x, mon.z), mon.z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    buildings.push({ x: mon.x, z: mon.z, w: 14, d: 14, h: H, top: H + 5 });
  }

  // ---------- The Pike ----------
  // "FORTY AMUSEMENTS, which cost $5,000,000" — a mile of it as this sheet
  // draws it, two rows of gaudy fronts either side of the concessions street.
  const pikeColors = ['#c9a437', '#a05a40', '#5f8a74', '#8a6a9c', '#b5442f', '#d9cfae'];
  {
    const a = at('pike_east'), b = at('pike_west');
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    const nx = -uz, nz = ux;
    for (const side of [-1, 1]) {
      let s = 20;
      while (s < len - 20) {
        const w = 18 + rand() * 16, d = 14 + rand() * 8, h = 8 + rand() * 8;
        const x = a.x + ux * s + nx * side * 31, z = a.z + uz * s + nz * side * 31;
        const y = groundAt(x, z);
        const att = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: pikeColors[Math.floor(rand() * pikeColors.length)] }));
        att.position.set(x, y + h / 2, z);
        att.rotation.y = -Math.atan2(uz, ux);
        att.castShadow = true;
        scene.add(att);
        if (rand() < 0.3) {
          const twr = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 6),
            new THREE.MeshLambertMaterial({ color: '#e9e2d0' }));
          twr.position.set(x, y + h + 5, z);
          scene.add(twr);
        }
        buildings.push({ x, z, w: w + 4, d: d + 4, h: y + h, top: y + h + 1 });
        s += w + 6 + rand() * 10;
      }
    }
    // the arch at the Lindell end, where the barkers stand
    const arch = new THREE.Group();
    for (const s2 of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(7, 20, 7), ivory);
      pil.position.set(0, 10, s2 * 22); arch.add(pil);
    }
    const lint = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 51), ivory);
    lint.position.y = 22.5; arch.add(lint);
    arch.position.set(a.x, groundAt(a.x, a.z), a.z);
    arch.rotation.y = -Math.atan2(uz, ux);
    arch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(arch);
  }

  // ---------- the Observation Wheel (the rebuilt 1893 giant) ----------
  const wheelPos = at('observation_wheel');
  const roueGrp = new THREE.Group();
  const wheel = new THREE.Group();
  {
    const steel = new THREE.MeshLambertMaterial({ color: 0x4a443c });
    const R = 264 * 0.3048 / 2;                        // the Ferris wheel, 264 ft
    for (const dz of [-5, 5]) {
      const rimW = new THREE.Mesh(new THREE.TorusGeometry(R, 1.2, 8, 44), steel);
      rimW.position.z = dz; wheel.add(rimW);
    }
    for (let i = 0; i < 18; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, R * 2, 5), steel);
      spoke.rotation.z = (i * Math.PI) / 18;
      wheel.add(spoke);
    }
    for (let i = 0; i < 18; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 8),
        new THREE.MeshLambertMaterial({ color: 0x6a4a34 }));
      const a = (i / 18) * Math.PI * 2;
      car.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(car);
    }
    wheel.position.y = R + 8;
    roueGrp.add(wheel);
    for (const sx of [-1, 1]) for (const dz of [-5, 5]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.7, R + 12, 6), steel);
      leg.position.set(sx * 18, (R + 12) / 2, dz);
      leg.rotation.z = sx * 0.45;
      roueGrp.add(leg);
    }
    roueGrp.position.set(wheelPos.x, groundAt(wheelPos.x, wheelPos.z), wheelPos.z);
    roueGrp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(roueGrp);
    // collide only with the support legs — daring pilots may thread the wheel
    buildings.push({ x: wheelPos.x, z: wheelPos.z, w: 12, d: 14, h: 30, top: 30 });
  }

  // ---------- the Aeronautic Concourse ----------
  // Fourteen fenced acres leased from the newly relocated Washington
  // University — 374 x 157 m off the plat, which is 14.5 acres against the
  // fourteen the record gives, and the closest thing to a scale check the sheet
  // contains. The paling round it was THIRTY FEET high, "ostensibly to shelter
  // the airships from the wind": that is why the field reads as an enclosure in
  // every photograph, and it is three storeys, not the waist-high posts that
  // used to stand here.
  const CONC = { x: PAD.x, z: PAD.z, w: CONCOURSE.w, d: CONCOURSE.d };
  {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(CONC.w, CONC.d),
      new THREE.MeshLambertMaterial({ color: 0x8a9464 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(CONC.x, 0.07, CONC.z);
    apron.receiveShadow = true;
    scene.add(apron);

    const paling = new THREE.MeshLambertMaterial({ color: 0xa8926a, side: THREE.DoubleSide });
    const H = CONCOURSE.fence;                         // 30 ft
    for (const [w, d, ang] of [[CONC.w, CONC.d / 2, 0], [CONC.w, -CONC.d / 2, 0],
      [CONC.d, CONC.w / 2, 1], [CONC.d, -CONC.w / 2, 1]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, H), paling);
      if (ang) { wall.rotation.y = Math.PI / 2; wall.position.set(CONC.x + d, H / 2, CONC.z); }
      else wall.position.set(CONC.x, H / 2, CONC.z + d);
      wall.castShadow = true;
      scene.add(wall);
    }
    // and the posts that carry it, so it reads as a paling and not a wall
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6b5236 });
    for (let i = 0; i <= 40; i++) {
      for (const [fx, fz] of [[CONC.x - CONC.w / 2 + (i / 40) * CONC.w, CONC.z - CONC.d / 2],
        [CONC.x - CONC.w / 2 + (i / 40) * CONC.w, CONC.z + CONC.d / 2]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, H + 0.6, 0.5), postMat);
        post.position.set(fx, (H + 0.6) / 2, fz);
        scene.add(post);
      }
    }
    // the sheds for the competing ships, and the judges' stand
    const shedMat = new THREE.MeshLambertMaterial({ color: 0xd6cdb6 });
    for (let i = 0; i < 3; i++) {
      const sz = CONC.z - 62 + i * 62;
      const shed = new THREE.Mesh(new THREE.BoxGeometry(58, 16, 20), shedMat);
      shed.position.set(CONC.x - 110, 8, sz);
      shed.castShadow = true;
      scene.add(shed);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 22),
        new THREE.MeshLambertMaterial({ color: 0xa89a7c }));
      roof.position.set(CONC.x - 110, 17, sz);
      scene.add(roof);
      buildings.push({ x: CONC.x - 110, z: sz, w: 60, d: 22, h: 17, top: 18 });
    }
    const judges = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 13), shedMat);
    judges.position.set(CONC.x + 120, 5, CONC.z - 60);
    judges.castShadow = true;
    scene.add(judges);
    buildings.push({ x: CONC.x + 120, z: CONC.z - 60, w: 24, d: 13, h: 10, top: 11 });
  }

  // ---------- the three race pylons, each flying a big flag ----------
  const flags = [];
  for (const p of PYLONS) {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, PYLON_H, 8), ivory);
    pylon.position.set(p.x, p.y + PYLON_H / 2, p.z);
    pylon.castShadow = true;
    scene.add(pylon);
    const fl = makeStreamFlag(10, 5, 0xb5442f);
    fl.position.set(p.x, p.y + PYLON_H + 2, p.z);
    scene.add(fl);
    flags.push(fl.userData.flag);
    buildings.push({ x: p.x, z: p.z, w: 7, d: 7, h: p.y + PYLON_H, top: p.y + PYLON_H + 2 });
  }
  const homeFlag = makeStreamFlag(8, 4, 0x2b4a8c);
  homeFlag.position.set(PAD.x, 26, PAD.z + 30);
  scene.add(homeFlag);
  flags.push(homeFlag.userData.flag);

  // ---------- park trees ----------
  const trees = [];
  for (let i = 0; i < 900; i++) {
    const x = -1400 + rand() * 3400, z = -1400 + rand() * 3600;
    if (isWater(x, z)) continue;
    if (Math.abs(z) < 120 && x > -400 && x < 470) continue;      // the grand court
    if (buildings.some((b) => Math.abs(b.x - x) < b.w * 0.7 && Math.abs(b.z - z) < b.d * 0.7)) continue;
    if (Math.abs(x - CONC.x) < CONC.w / 2 + 20 && Math.abs(z - CONC.z) < CONC.d / 2 + 20) continue;
    trees.push({ x, z, s: 2.6 + rand() * 3 });
  }
  const tGeo = new THREE.SphereGeometry(1, 7, 5); tGeo.translate(0, 0.6, 0);
  const tMesh = new THREE.InstancedMesh(tGeo, windify(new THREE.MeshLambertMaterial({ color: 0xffffff })), trees.length);
  const m4 = new THREE.Matrix4(); const col = new THREE.Color();
  trees.forEach((t, i) => {
    m4.makeScale(t.s * 1.2, t.s, t.s * 1.2).setPosition(t.x, groundAt(t.x, t.z) + t.s * 0.5, t.z);
    tMesh.setMatrixAt(i, m4);
    col.setHSL(0.29 + t.s * 0.008, 0.4, 0.32);
    tMesh.setColorAt(i, col);
  });
  tMesh.instanceColor.needsUpdate = true;
  tMesh.castShadow = true;
  scene.add(tMesh);

  const WINDB = new THREE.Vector3(2.6, 0, -1.7);
  const clouds = makeClouds(scene, WINDB);

  const tick = (dt) => { wheel.rotation.z += dt * 0.02; };

  function isWater(x, z) {
    const dx = x - head.x;
    if (dx <= 0 && dx * dx + z * z < (BASIN.r + 0.5) * (BASIN.r + 0.5)) return true;
    for (const l of lagoons) {
      const c = Math.cos(-l.ang), s = Math.sin(-l.ang);
      const ax = x - l.x, az = z - l.z;
      if (Math.abs(ax * c - az * s) < l.len / 2 + 0.5 && Math.abs(ax * s + az * c) < l.w / 2 + 0.5) return true;
    }
    return false;
  }

  return {
    name: 'St. Louis, 1904 — the World’s Fair',
    sun, sunDir, sky, waters, flags, tick,
    buildings, clouds, trees,
    groundAt,
    landmarks: [
      { id: 'festival', name: 'Festival Hall', x: fh.x, z: fh.z, y: fhY + 70, r: 70,
        clue: 'The domed hall at the head of the cascades, gold Victory on top.' },
      { id: 'basin', name: 'the Grand Basin', x: head.x - BASIN.r / 2, z: 0, y: 46, r: 95,
        clue: 'Six hundred feet of half-round water, with the lagoons running off it.' },
      { id: 'wheel', name: 'the Observation Wheel', x: wheelPos.x, z: wheelPos.z, y: 120, r: 65,
        clue: 'A wheel bigger than the one in Paris — the Basin Sprint threads it.' },
      { id: 'pike', name: 'The Pike', x: at('pike_east').x, z: at('pike_east').z, y: 46, r: 65,
        clue: 'A mile of midway: the arch at its head is where the barkers stand.' },
      { id: 'concourse', name: 'the Aeronautic Concourse', x: CONC.x, z: CONC.z, y: 44, r: 130,
        clue: 'Fourteen acres behind a thirty-foot paling, where the hundred thousand dollars waits.' },
    ],
    towerPos: null, padPos: PAD,
    startRing: START, turnRing: GATES[0],
    gates: GATES,
    rivalSpecs: ['villedeparis', 'no6'],
    towSpots: [{ name: 'the Grand Basin plaza', pos: new THREE.Vector3(head.x - 130, 0, 130) }],
    limitNote: 'three laps at the pace he asked for — half again the Deutsch',
    windBase: WINDB,
    raceLimit: 1060, raceRecord: 975, raceLaps: 3,
    vistaPos: new THREE.Vector3(fh.x, fhY + 62, fh.z + 60),
    hints: {
      idleNear: 'The grand prize waits — three pylons, two rivals.',
      idleFar: 'Free flight — the race begins over the Aeronautic Concourse.',
      out: 'Round the pylons before the grandstands',
      back: 'Home to the Concourse — the crowd is on its feet',
      turnMsg: 'The last pylon is rounded! Now home before your rivals.',
    },
    isWater,
    isInBois: () => false,
  };
}

/** A gabled roof: a ridge down the long axis, two slopes and two ends. */
function gableGeometry(L, W, h) {
  const hl = L / 2, hw = W / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -hl, 0, -hw, hl, 0, -hw, hl, h, 0, -hl, 0, -hw, hl, h, 0, -hl, h, 0,
    -hl, 0, hw, -hl, h, 0, hl, h, 0, -hl, 0, hw, hl, h, 0, hl, 0, hw,
    -hl, 0, -hw, -hl, h, 0, -hl, 0, hw,
    hl, 0, -hw, hl, 0, hw, hl, h, 0,
  ]), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * One palace, from its plan footprint and its page of notes.
 *
 * The shape is the same for all of them because they really were the same kind
 * of building — a colossal order on a high base, an attic over the cornice,
 * sculpture on the attic. What differs is what the guide says differs, and
 * nothing else: the roof colour, the order, the entrance, the corner treatment
 * and the thing on the roof by which the visitor was told to recognise it.
 */
function buildPalace(scene, site, buildings, ivory, gold, rand) {
  const c = CHAR[site.id] || {};
  const g = new THREE.Group();
  const wall = c.stone ? new THREE.MeshLambertMaterial({ color: c.stone }) : ivory;
  // "ivory white, WITH DASHES OF COLOR on the roofs." A dash is not a coat: a
  // flat deck four hundred metres long carrying the roof colour at full
  // strength reads as a painted lid from the air. So the flat roofs are mixed
  // most of the way back to the ivory and only Machinery — the one the guide
  // calls RED outright — keeps its colour undiluted.
  const roofMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(c.roof || 0xa8926a).lerp(new THREE.Color(IVORY), 0.5),
  });
  const hw = site.w / 2, hl = site.l / 2;
  const H = c.stone ? CORNICE * 0.8 : CORNICE;

  // the mass, and the attic above the cornice — "an attic fifteen feet in
  // height, richly surmounted with statues, crowns the Ionic order". It is a
  // PARAPET, four bars round the rim rather than a solid cap, so the roof deck
  // sits down inside it: from the ground you see ivory and only a dash of the
  // roof's colour over the cornice, and from the air you look down into a
  // coloured tray. That is what "ivory white, with dashes of color on the
  // roofs" reads like from both ends, and a solid painted lid is not.
  const body = new THREE.Mesh(new THREE.BoxGeometry(site.l, H, site.w), wall);
  body.position.y = H / 2;
  g.add(body);
  const ATT = 4.6;                                    // 15 ft
  for (const [bw, bd, bx, bz] of [
    [site.l * 0.98, 5, 0, site.w * 0.49], [site.l * 0.98, 5, 0, -site.w * 0.49],
    [5, site.w * 0.98, site.l * 0.49, 0], [5, site.w * 0.98, -site.l * 0.49, 0]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, ATT, bd), wall);
    bar.position.set(bx, H + ATT / 2, bz);
    g.add(bar);
  }

  if (c.pitched) {
    // Machinery alone: "the German spirit shows itself in the HIGH SLOPING
    // ROOFS" — so its roof stands proud of the parapet, and it is red.
    //
    // A RIDGE, not a pyramid. A cone with four sides is a pyramid however you
    // scale it, and a pyramid over a thousand-foot hall is not a sloping roof,
    // it is a circus tent. Double-sided, which is how this project sidesteps
    // the winding trap rather than guessing at it (see the Monaco roads).
    const roof = new THREE.Mesh(gableGeometry(site.l * 0.95, site.w * 0.92, 17),
      new THREE.MeshLambertMaterial({ color: c.roof, side: THREE.DoubleSide }));
    roof.position.y = H + ATT - 1;
    g.add(roof);
  } else {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(site.l * 0.94, 2.2, site.w * 0.94), roofMat);
    roof.position.y = H + 1.6;                        // down inside the parapet
    g.add(roof);
    if (c.glass) {                        // Agriculture and Horticulture
      const sky = new THREE.Mesh(new THREE.BoxGeometry(site.l * 0.62, 1.4, site.w * 0.5),
        new THREE.MeshPhongMaterial({ color: 0x9fc0c4, shininess: 90 }));
      sky.position.y = H + 3.0;
      g.add(sky);
    }
  }

  // the colonnade: a screen of columns down both long facades
  if (c.colonnade || c.order) {
    const R = c.order === 'doric' ? 2.0 : 1.7;
    const n = Math.max(8, Math.round(site.l / 13));
    for (let i = 0; i <= n; i++) {
      const x = -hl + (i / n) * site.l;
      for (const s of [-1, 1]) {
        const bay = c.paired ? [-1.9, 1.9] : [0];     // "columns grouped in pairs"
        for (const off of bay) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H * 0.78, 8), wall);
          col.position.set(x + off, H * 0.39 + H * 0.16, s * (hw + R + 0.6));
          g.add(col);
        }
      }
    }
  }

  // the entrance, in the middle of each long facade
  for (const s of [-1, 1]) {
    if (c.bigArches) {
      // Transportation: three arches, each 64 ft wide and 52 ft high, "embracing
      // more than half of the entire facade", separated by massive pylons
      const AW = 64 * 0.3048, AH = 52 * 0.3048;
      for (const k of [-1, 0, 1]) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(AW, AH, 8), wall);
        port.position.set(k * (AW + 9), AH / 2, s * hw);
        g.add(port);
        const py = new THREE.Mesh(new THREE.BoxGeometry(9, AH + 9, 9), wall);
        py.position.set(k * (AW + 9) + (AW + 9) / 2, (AH + 9) / 2, s * hw);
        g.add(py);
      }
    } else if (c.niche) {
      const nch = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, H * 1.1, 16, 1, false, -Math.PI / 2, Math.PI), wall);
      nch.position.set(0, H * 0.55, s * hw);
      g.add(nch);
    } else {
      const port = new THREE.Mesh(new THREE.BoxGeometry(34, H * 1.08, 11), wall);
      port.position.set(0, H * 0.54, s * hw);
      g.add(port);
      if (c.arch === 'triumphal') {
        const att2 = new THREE.Mesh(new THREE.BoxGeometry(38, 9, 13), wall);
        att2.position.set(0, H * 1.08 + 4.5, s * hw);
        g.add(att2);
      }
    }
  }
  // Liberal Arts repeats its smaller arches near the ends of the facade
  if (c.arches === 3) {
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      const a2 = new THREE.Mesh(new THREE.BoxGeometry(20, H * 1.02, 9), wall);
      a2.position.set(k * hl * 0.62, H * 0.51, s * hw);
      g.add(a2);
    }
  }

  // the corners
  if (c.roundCorners || c.roundTowers) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, H + 12, 14), wall);
      t.position.set(sx * (hl - 13), (H + 12) / 2, sz * (hw - 13));
      g.add(t);
      if (c.eagleGlobe) {
        // "eagles holding on their backs the hollow, ribbed sphere of the
        // universe, containing the solid sphere of the earth, BY WHICH THE
        // BUILDING MAY BE RECOGNIZED"
        const globe = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8),
          new THREE.MeshPhongMaterial({ color: 0xbfae86, shininess: 60, wireframe: false }));
        globe.position.set(sx * (hl - 13), H + 12 + 7.5, sz * (hw - 13));
        g.add(globe);
      }
    }
  }
  if (c.cornerDomes) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(11, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0xd9cfae }));
      d.position.set(sx * (hl - 16), H + ATT, sz * (hw - 16));
      d.scale.y = 0.65;
      g.add(d);
    }
  }
  if (c.pyramids) {
    // Electricity's six pyramidal court towers, each with its star held aloft
    for (let i = 0; i < c.pyramids; i++) {
      const k = i < 3 ? -1 : 1;
      const x = (-1 + ((i % 3) / 2) * 2) * hl * 0.8;
      const py = new THREE.Mesh(new THREE.ConeGeometry(12, 26, 4), wall);
      py.rotation.y = Math.PI / 4;
      py.position.set(x, H + ATT + 13, k * (hw - 12));
      g.add(py);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(3.4), gold);
      star.position.set(x, H + ATT + 32, k * (hw - 12));
      g.add(star);
    }
  }
  if (c.towerCap) {
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(16, H + 18, 16), wall);
      t.position.set(sx * (hl - 12), (H + 18) / 2, 0);
      g.add(t);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(12, 14, 4),
        new THREE.MeshLambertMaterial({ color: c.towerCap }));     // GREEN CAPPED TOWERS
      cap.rotation.y = Math.PI / 4;
      cap.position.set(sx * (hl - 12), H + 18 + 7, 0);
      g.add(cap);
    }
  }
  if (c.towers === 2) {
    // "the east and north entrance have graceful towers in the style of the
    // Spanish Renaissance", in pairs above the centre of the long facades
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, H + 26, 10), wall);
      t.position.set(sx * 22, (H + 26) / 2, sz * (hw - 8));
      g.add(t);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(6.5, 12, 10),
        new THREE.MeshLambertMaterial({ color: c.roof }));
      sp.position.set(sx * 22, H + 26 + 6, sz * (hw - 8));
      g.add(sp);
    }
  }
  if (c.obelisks) {
    // "Four stately entrances pierce the facades, each displaying a PAIR OF
    // OBELISKS" — Mines is the one palace with no classical columns and no dome
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3, H + 14, 4), wall);
      ob.position.set(k * 15, (H + 14) / 2, s * (hw + 5));
      g.add(ob);
    }
    if (c.polychrome) {
      // "further distinguished by a lavish use of color"
      const band = new THREE.Mesh(new THREE.BoxGeometry(site.l * 1.005, 4, site.w * 1.005),
        new THREE.MeshLambertMaterial({ color: 0x9a5f3c }));
      band.position.y = H * 0.72;
      g.add(band);
    }
  }
  if (c.dome) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(18, 18, 11, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0xd9cfae, shininess: 45 }));
    d.position.y = H + ATT;
    d.scale.y = 1.15;
    g.add(d);
  }
  if (c.rotunda) {
    // "a circular detached colonnade of majestic proportions" in front of the
    // south entrance, with the dome overlooking the court it forms
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (i / 21) * Math.PI;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, H * 0.8, 8), wall);
      col.position.set(Math.sin(a) * 42, H * 0.4, -hw - 26 + Math.cos(a) * 42);
      g.add(col);
    }
  }
  if (c.quadriga) {
    // the four-horse chariot over the main entrances
    for (const s of [-1, 1]) {
      const q = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const horse = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 1.7), gold);
        horse.position.set(0, 0, (k - 1.5) * 2.1);
        q.add(horse);
      }
      const car = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 3.4), gold);
      car.position.set(-4, 0.6, 0);
      q.add(car);
      q.position.set(0, H * 1.08 + 9 + 2, s * hw);
      g.add(q);
    }
  }
  if (c.atlas) {
    // "'Atlas with Globe,' colossal group, N. facade"
    const atl = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), ivory);
    atl.position.set(0, H + ATT + 6, -hw - 4);
    g.add(atl);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 10),
      new THREE.MeshPhongMaterial({ color: 0xbfae86, shininess: 60 }));
    globe.position.set(0, H + ATT + 18, -hw - 4);
    g.add(globe);
  }
  if (c.sphinx) {
    // "the Greek Sphinx, on block pedestals, guarding all the entrances"
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 4), ivory);
      ped.position.set(k * 26, 3.5, s * (hw + 7));
      g.add(ped);
      const sph = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 5.4), ivory);
      sph.position.set(k * 26, 8.3, s * (hw + 7));
      g.add(sph);
    }
  }
  if (c.cresting) {
    // "the rich cresting on the roof"
    for (let i = 0; i < Math.round(site.l / 9); i++) {
      for (const s of [-1, 1]) {
        const cr = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4, 4), ivory);
        cr.position.set(-hl + (i + 0.5) * 9, H + ATT + 2, s * (hw * 0.47));
        g.add(cr);
      }
    }
  }
  if (c.stacks) {
    for (let i = 0; i < c.stacks; i++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 34, 10),
        new THREE.MeshLambertMaterial({ color: 0x6a5a48 }));
      st.position.set(-hl + 12 + i * 18, H + 17, 0);
      g.add(st);
    }
  }
  if (c.minarets) {
    for (const k of [-1, 1]) {
      const mi = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, H + 22, 10), ivory);
      mi.position.set(k * hl * 0.5, (H + 22) / 2, -hw - 4);
      g.add(mi);
    }
  }

  const y = groundAt(site.x, site.z);
  g.position.set(site.x, y, site.z);
  g.rotation.y = site.rot;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);

  // a world-axis box for the collider, from the rotated footprint
  const ca = Math.abs(Math.cos(site.rot)), sa = Math.abs(Math.sin(site.rot));
  const top = y + H + ATT + (c.pitched ? 16 : 4) + (c.quadriga || c.pyramids ? 14 : 0);
  buildings.push({
    x: site.x, z: site.z,
    w: site.l * ca + site.w * sa, d: site.l * sa + site.w * ca,
    h: y + H + 6, top,
  });
}
