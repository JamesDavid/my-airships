// The enemy of the submarine boat.
//
// From the last chapter of the book, and it is a design brief rather than a
// flourish:
//
//   "I cannot abandon this topic, however, without referring to one unique
//    maritime advantage of the air-ship. This is its navigator's ability to
//    perceive bodies moving beneath the surface of the water. Cruising at the
//    end of its guide rope, the air-ship will carry its navigator here and
//    there at will at the right height above the waves. Any submarine boat,
//    stealthily pursuing its course underneath them, will be beautifully
//    visible to him, while from a warship's deck it would be quite invisible.
//    This is a well-observed fact, and depends on certain optical laws."
//
// Four things are asserted there and all four are the game:
//
//   MOVING       they are under way, not lying on the bottom to be collected.
//   THE RIGHT    not the greatest height. There is a band, and it is low.
//    HEIGHT
//   OPTICAL LAWS he is right, and they are Fresnel's. Looking straight down
//                through water you see into it; looking along it you see the
//                sky in it. That is why the deck of a warship — an eye a few
//                metres up, looking almost flat along the surface — sees
//                nothing, and it is the whole reason the air-ship can.
//   SIGNAL THEM  "follow all its movements, and signal them to the warships."
//                Finding one is not the task. Holding her is.
//
// So there is nothing to fly through here. You quarter the bay low, you catch a
// shadow under the swell, and you hold station over her while she is reported.
//
// WHY THE BOATS ARE DRAWN ON THE WATER AND NOT UNDER IT. The Mediterranean here
// is three.js's `Water`, which is a mirror: opaque, depth-writing, and with no
// notion of anything beneath it. A hull placed at its true -7 m would be hidden
// completely and at every angle, which is the one thing the passage says it is
// not. So the shape is laid just over the surface and its OPACITY carries the
// whole of the optics — which is, as it happens, exactly what the eye is given
// in the real case: not a solid object, but a stain of contrast in the water
// that comes and goes with the angle you look at it.

import * as THREE from 'three';

// ---------------------------------------------------------------- the optics
//
// Every number here is either measured physics or a stated choice, and the
// stated ones are marked. legibility() is pure so that check_monaco can walk
// the whole curve instead of taking a screenshot and squinting at it.

/** Refractive index of sea water is 1.34; Schlick's R0 = ((n-1)/(n+1))². */
export const R0 = 0.021;

/**
 * How much brighter the sky reflected off the surface is than the boat seen
 * through it. CHOSEN, at the bright end of plausible: a Mediterranean noon
 * against a dark hull seven metres down. This is the term that makes a grazing
 * look useless — it is not that no light comes up from the boat, it is that
 * the glare on the surface drowns it.
 */
export const GLARE = 5;

/** Attenuation of clear coastal water, per metre. Measured, roughly 0.05. */
export const K_WATER = 0.055;

/** A Narval-class boat of 1899 is 34 m long. */
export const SUB_LEN = 34;

/**
 * How large she must LOOK, and this is the term that answers "the right height
 * above the waves". CHOSEN, and tuned against a measurement rather than picked.
 *
 * Fresnel alone rewards CLIMBING: the angle stays steep further out the higher
 * you are, so the strip of water you can see into gets wider and wider. That is
 * true, and it is how aircraft actually hunted submarines forty years later
 * with binoculars — but it is not what the book says, twice, and the reason it
 * is not is the naked eye. She is not an object up there, she is a smudge of
 * low contrast, and a smudge stops being resolvable long before a sharp thing
 * of the same size would. This term is that limit.
 *
 * Tuned so the searchable strip is widest at about the length of the guide
 * rope. Half-width of the strip in which she reads at all, by height:
 *
 *      20 m →  78 m      120 m → 198 m      350 m → nothing
 *      60 m → 154 m      180 m → 194 m      500 m → nothing
 *      90 m → 182 m      250 m → 136 m
 *
 * So there is a band, it is low, and both flying on the deck and going upstairs
 * lose you the bay. Which is the passage.
 */
export const GOOD_SUBTEND = 0.28;      // radians: SUB_LEN at 121 m
export const MIN_SUBTEND = 0.055;      // radians: SUB_LEN at 618 m

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How plainly a submerged boat shows, 0 to 1.
 *
 * @param {number} eyeY   the pilot's height above the water, metres
 * @param {number} flat   how far off she is on the flat, metres
 * @param {number} depth  how deep she is running, metres
 */
export function legibility(eyeY, flat, depth) {
  const drop = Math.max(0.1, eyeY) + depth;          // eye to boat, vertically
  const theta = Math.atan2(drop, Math.max(0, flat)); // look-down angle from flat
  const s = Math.sin(theta);

  // Fresnel, unpolarised, by Schlick. The angle of incidence is measured from
  // the surface NORMAL, which is the vertical — so cos(incidence) = sin(theta),
  // and a flat look (theta -> 0) reflects everything.
  const R = R0 + (1 - R0) * Math.pow(1 - s, 5);
  const T = 1 - R;
  const contrast = T / (T + GLARE * R);

  // What is left of her after the slant path up through the water, twice over
  // is not modelled: the sun comes down near enough vertically at noon here.
  const clarity = Math.exp(-K_WATER * (depth / Math.max(s, 1e-3)));

  const range = Math.hypot(flat, drop);
  const size = clamp01((SUB_LEN / Math.max(range, 1) - MIN_SUBTEND)
    / (GOOD_SUBTEND - MIN_SUBTEND));

  return clamp01(contrast * clarity * size);
}

/** Below this she is a trick of the light and does not count as seen. */
export const SEEN = 0.16;

/** "follow all its movements, and signal them" — metres, and seconds. */
export const SIGNAL_R = 90;
export const SIGNAL_T = 4;

// ---------------------------------------------------------------- the boats

function makeHull(colour) {
  const g = new THREE.Group();
  // Basic, not Lambert: she is a stain of contrast, not a lit object, and the
  // sun must not put a highlight on something that is under the water.
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true,
    opacity: 0, depthWrite: false, fog: true });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8), mat);
  hull.scale.set(SUB_LEN, 3.6, 4.4);
  g.add(hull);
  const tower = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat);
  tower.scale.set(7, 3, 3.6);
  tower.position.set(-1.5, 0.1, 0);
  g.add(tower);
  g.userData.mat = mat;
  // over the mirror, never in it — see the note at the top of the file
  g.position.y = 0.07;
  g.renderOrder = 3;
  return g;
}

/**
 * The water a boat is somewhere in.
 *
 * The bay is five kilometres across and a boat reads at two hundred metres, so
 * quartering it blind is an hour of mowing the lawn — which is not the skill the
 * chapter is about. The skill is the LOOKING: low, steep, and patient. So the
 * search is given away and the finding is not.
 *
 * A ring lies flat on the water round the whole of one boat's patrol leg, so she
 * is certainly inside it and certainly moving. It is drawn faintly and it goes
 * out the moment she is signalled, which also makes it the tally: what is left
 * on the water is what is left to find.
 */
function makeArea(leg) {
  const R = leg.len / 2 + 140;
  const g = new THREE.Mesh(
    new THREE.RingGeometry(R - 26, R, 96),
    new THREE.MeshBasicMaterial({ color: 0xe8c66a, transparent: true, opacity: 0.22,
      depthWrite: false, side: THREE.DoubleSide, fog: true }));
  g.rotation.x = -Math.PI / 2;                 // flat, on the sea
  g.position.set((leg.ax + leg.bx) / 2, 0.15, (leg.az + leg.bz) / 2);
  g.renderOrder = 2;                           // under the boats, over the water
  return g;
}

/**
 * Lay a straight patrol leg that is water from end to end.
 *
 * Walked outwards in both directions from a seed point until the sea runs out,
 * rather than picking two points and hoping — the bay of Monaco is a crescent
 * with a rock in the middle of it, and two points a kilometre apart can both be
 * afloat with the Prince's palace between them.
 */
function layLeg(rng, sea, box, tries = 300) {
  for (let n = 0; n < tries; n++) {
    const x = box.x0 + rng() * (box.x1 - box.x0);
    const z = box.z0 + rng() * (box.z1 - box.z0);
    if (!sea(x, z)) continue;
    const a = rng() * Math.PI * 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    const run = (sign) => {
      let d = 0;
      while (d < 1100) {
        const nx = x + ux * (d + 20) * sign, nz = z + uz * (d + 20) * sign;
        if (!sea(nx, nz) || nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) break;
        d += 20;
      }
      return d;
    };
    const fwd = run(1), back = run(-1);
    if (fwd + back < 420) continue;                  // too cramped to patrol
    return { ax: x - ux * back, az: z - uz * back,
             bx: x + ux * fwd, bz: z + uz * fwd, len: fwd + back };
  }
  return null;
}

/**
 * A fleet of boats under the bay.
 *
 * @param scene   to add to
 * @param sea     (x, z) => is that open water
 * @param box     the water to hide them in, {x0,x1,z0,z1}
 * @param rng     seeded, so a whole room hunts the same five boats
 * @param n       how many
 */
export function makeSubmarineFleet(scene, sea, box, rng, n = 5) {
  const subs = [];
  for (let i = 0; i < n; i++) {
    const leg = layLeg(rng, sea, box);
    if (!leg) continue;
    const g = makeHull(0x14323a);
    scene.add(g);
    const area = makeArea(leg);
    scene.add(area);
    subs.push({
      mesh: g, area, leg,
      depth: 4.5 + rng() * 6.5,                      // 4.5 to 11 m
      mps: (5 + rng() * 3.5) * 0.5144,               // 5 to 8.5 knots
      phase: rng() * 2,
      seen: 0,                                        // best legibility so far
      held: 0,                                        // seconds held station
      signalled: false,
      name: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][i] || String(i + 1),
    });
  }

  let animT = 0;

  /**
   * @param dt      seconds
   * @param eye     the pilot, a Vector3-ish {x,y,z}, or null
   * @param waterY  the height of the sea, metres (0 here)
   * @returns what changed this tick, for whoever is keeping score
   */
  function tick(dt, eye, waterY = 0) {
    animT += dt;
    const news = { signalled: null, sighted: null };
    for (const s of subs) {
      // out and back along her leg, at her own steady pace
      const u = ((animT * s.mps) / s.leg.len + s.phase) % 2;
      const f = u < 1 ? u : 2 - u;
      const x = s.leg.ax + (s.leg.bx - s.leg.ax) * f;
      const z = s.leg.az + (s.leg.bz - s.leg.az) * f;
      s.mesh.position.x = x; s.mesh.position.z = z;
      s.x = x; s.z = z;
      const head = Math.atan2(s.leg.bz - s.leg.az, s.leg.bx - s.leg.ax);
      s.mesh.rotation.y = -(u < 1 ? head : head + Math.PI);

      if (!eye) { s.mesh.userData.mat.opacity = 0; continue; }

      const flat = Math.hypot(eye.x - x, eye.z - z);
      const v = legibility(eye.y - waterY, flat, s.depth);
      s.legible = v;
      if (v > s.seen) s.seen = v;

      // Signalled boats stay marked: you reported her, the fleet knows, and
      // hiding her again would only make the player fly the same water twice.
      s.mesh.userData.mat.opacity = s.signalled ? Math.max(v, 0.55) : v;
      s.mesh.userData.mat.color.setHex(s.signalled ? 0x2f6d4a : 0x14323a);
      // the ring goes out when she is reported, so the water still marked is
      // exactly the water still to search
      if (s.area) {
        s.area.visible = !s.signalled;
        // and it brightens as you come into it, which is the only encouragement
        // there is out here: no gem, no arrow, just warmer or colder
        const d = Math.hypot(eye.x - s.area.position.x, eye.z - s.area.position.z);
        const R = s.leg.len / 2 + 140;
        s.area.material.opacity = d < R ? 0.34 : 0.2;
      }

      if (!s.signalled && v >= SEEN && flat <= SIGNAL_R) {
        if (s.held === 0) news.sighted = s;
        s.held += dt;
        if (s.held >= SIGNAL_T) { s.signalled = true; news.signalled = s; }
      } else if (s.held > 0 && (flat > SIGNAL_R * 1.35 || v < SEEN * 0.6)) {
        s.held = 0;                                  // lost her; begin again
      }
    }
    return news;
  }

  return {
    subs, tick,
    total: subs.length,
    found: () => subs.filter((s) => s.signalled).length,
    /** The one being worked on, for the slate: {sub, part} or null. */
    holding() {
      let best = null;
      for (const s of subs) if (!s.signalled && s.held > 0 && (!best || s.held > best.held)) best = s;
      return best ? { sub: best, part: Math.min(1, best.held / SIGNAL_T) } : null;
    },
    dispose() {
      for (const s of subs) {
        scene.remove(s.mesh);
        if (s.area) {
          scene.remove(s.area);
          s.area.geometry.dispose();
          s.area.material.dispose();
        }
        s.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        s.mesh.userData.mat.dispose();
      }
      subs.length = 0;
    },
  };
}
