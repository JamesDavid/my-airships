import { placeLegacy } from './paris_geo.js';
// The campaign: historical scenarios from the memoir, and the AI rival ships.
// Each scenario gets a ctx from main.js: { ship, world, addMsg, setCenter,
// setZone, clearZone, complete, fail, startRace, place }.

import * as THREE from 'three';
import { Airship, windAt } from './airship.js';
import { SHIPS } from './ships.js';

// ---------------------------------------------------------------- AI rival
// A competitor dirigible flying the gate course with a simple autopilot.
export class Rival {
  constructor(scene, specId, world, delay) {
    this.ship = new Airship(scene, SHIPS[specId]);
    const y = this.ship.spec.keel.drop + 1.2;
    this.ship.reset(new THREE.Vector3(world.padPos.x, y, world.padPos.z + 40 + delay), 0);
    this.world = world;
    this.gate = 0;
    this.delay = delay;      // seconds before it sets off
    this.t = 0;
    this.finished = 0;       // finish time, or 0
  }

  update(dt, wind) {
    this.t += dt;
    const s = this.ship;
    s.sputtering = false;            // the rival's mechanic keeps her running
    const gates = this.world.gates;
    const homeward = this.gate >= gates.length;
    const target = homeward ? this.world.startRing : gates[this.gate];
    const input = { throttle: 0, rudder: 0, pitch: 0, vent: false, coax: false };

    if (this.t > this.delay && !this.finished) {
      input.throttle = 1;
      // steer for the target
      const a = Math.atan2(-(target.z - s.pos.z), target.x - s.pos.x);
      let err = a - s.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      input.rudder = Math.max(-1, Math.min(1, err * 2.5));
      // ride high downwind, hug the deck against it (the book's strategy)
      const w = windAt(wind, 140);
      const toT = new THREE.Vector3(target.x - s.pos.x, 0, target.z - s.pos.z).normalize();
      const downwind = (w.x * toT.x + w.z * toT.z) > 0;
      const targetAlt = downwind ? 135 : 45;
      input.pitch = Math.max(-1, Math.min(1, (targetAlt - s.pos.y) * 0.05));
      if (s.pos.distanceTo(target) < 45) {
        if (homeward) this.finished = this.t;
        else this.gate++;
      }
    } else if (this.finished) {
      input.throttle = 0.2;
      input.pitch = Math.max(-1, Math.min(1, (60 - s.pos.y) * 0.05));
    }
    s.update(dt, input, wind, { underCloud: false, inBois: false });
  }

  dispose() { this.ship.dispose(); }
}

// ---------------------------------------------------------------- scenarios
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SCENARIOS = [
  {
    id: 'no1-bagatelle',
    title: 'I. The First Air-Ship (1898)',
    sub: 'No. 1 — the fold over the Bois, and the kite-flying boys',
    location: 'paris', shipId: 'no1',
    brief: 'The balloon is losing gas and beginning to fold. Get down to the lawn at Bagatelle — the boys flying kites there will catch your rope. Land gently, or not at all.',
    setup(ctx) {
      { const b = placeLegacy('bagatelle'); ctx.place(b.x - 600, 270, b.z + 300, 0); }
      ctx.ship.gas = 90;
      { const b = placeLegacy('bagatelle'); ctx.setZone(V(b.x, 12, b.z), 180); }
      ctx.setCenter('September 1898', 'The cylinder is folding — make for Bagatelle! (green ring)');
      this.warned = false;
    },
    tick(ctx, dt) {
      ctx.ship.gas = Math.max(34, ctx.ship.gas - 0.45 * dt);
      if (!this.warned && ctx.ship.gas < 70) {
        this.warned = true;
        ctx.addMsg('sc', '“The balloon began to fold in the middle like a pocket knife…” Throttle DOWN, nose down, ride her in.', 0);
      }
      const d = ctx.zoneDist();
      if (ctx.ship.wrecked) return ctx.fail('“I was saved for the first time”… but not this time.');
      if (ctx.ship.landed && d < ctx.zoneR()) {
        ctx.complete('The kite-flying boys grasp your guide rope and run against the wind — “They were bright young fellows!”');
      } else if (ctx.ship.landed && d >= ctx.zoneR()) {
        ctx.fail('Down safely — but far from the boys at Bagatelle. Try again.');
      }
    },
  },
  {
    id: 'no5-trocadero',
    title: 'II. A Fall Before a Rise (Aug 8, 1901)',
    sub: 'No. 5 — the valve leaks; put her on the Trocadéro roof',
    location: 'paris', shipId: 'no5',
    brief: 'The balloon is losing hydrogen fast and you cannot make St. Cloud. The Tower stands between you and the Trocadéro hotels — round her, or dare the arch beneath her legs. The roof, not the street.',
    setup(ctx) {
      // Started UPWIND of the roof, as he was — he did not choose the Trocadéro,
      // the wind gave it to him. At half scale the crossing was short enough
      // that any breeze was survivable; at full scale a headwind on the slow
      // No. 5 with a leaking valve made it simply unwinnable, which a pilot
      // reported. Now the day's wind is always at her back.
      {
        const t = placeLegacy('trocadero');
        const w = ctx.wind || { x: 1, z: 0 };
        const L = Math.hypot(w.x, w.z) || 1;
        ctx.place(t.x - (w.x / L) * 620, 150, t.z - (w.z / L) * 620,
          Math.atan2(w.z / L, w.x / L) * -1);
      }
      ctx.ship.gas = 80;
      { const t = placeLegacy('trocadero'); ctx.setZone(V(t.x, 40, t.z), 140); }
      ctx.setCenter('August 8th, 1901', 'The valve is gone. The Trocadéro roof or nothing. (green ring)');
    },
    tick(ctx, dt) {
      ctx.ship.gas = Math.max(55, ctx.ship.gas - 0.35 * dt);
      const d = ctx.zoneDist();
      const onRoof = d < ctx.zoneR() && ctx.ship.pos.y > 12 && ctx.ship.pos.y < 45;
      if (onRoof && ctx.ship.vel.length() < 10) {
        ctx.ship.wreck('scripted');
        ctx.complete('The keel braces against the courtyard wall — “the thin pine scantlings and piano wires of Nice had saved my life!” The firemen of Passy are coming.');
        return;
      }
      if (ctx.ship.wrecked) ctx.fail('The explosion the newspapers described. Try the roof again.');
      else if (ctx.ship.landed) ctx.fail('You reached the ground — in 1901 that fall was not survivable. Aim for the rooftops.');
    },
  },
  {
    id: 'no6-deutsch',
    title: 'III. Winning the Deutsch Prize (Oct 19, 1901)',
    sub: 'No. 6 — the Tower, the clock, the capricious motor',
    location: 'paris', shipId: 'no6',
    brief: 'The Commission is assembled. Round the Eiffel Tower and return within the time limit. The motor WILL falter on the way home — work the spark lever and fly low against the wind.',
    setup(ctx) {
      // the Commission is convoked when the PILOT is ready over the ring —
      // starting the clock here would run it while the ship still sat on the pad
      ctx.setCenter('October 19th, 1901', 'Fly to the gold start ring and call “Let go all!” (Enter, or GO) — the clock starts then.');
      this.done = false;
    },
    tick(ctx) {
      if (this.done) return;
      const r = ctx.raceResult();
      if (r) {
        this.done = true;
        if (r.won) ctx.complete('The crowd cries back: “YES!” — 125,000 francs, most of it to the poor of Paris.');
        else ctx.fail('“Errors do not count.” Convoke the Commission again.');
      }
    },
  },
  {
    id: 'no9-door',
    title: 'IV. The Runabout (June 23, 1903)',
    sub: 'No. 9 — guide-rope the avenue, land at your own door',
    location: 'paris', shipId: 'no9',
    brief: 'Dawn, and the avenues are empty. Take the little No. 9 across the city at rooftop height and land in the Champs-Élysées at your own door, where the servants wait to catch her.',
    setup(ctx) {
      // He was towed to Bagatelle overnight and set out from there, and at full
      // scale that is 3.9 km — seven minutes of straight cruising on the little
      // No. 9 before the flight proper begins, which a pilot rightly called too
      // far. She starts on the same line but a third of the way along it, at
      // the edge of the Bois where the interesting part starts: over the roofs
      // and down the avenue.
      {
        const b = placeLegacy('bagatelle'), a = placeLegacy('etoile');
        const door = { x: a.x + 268, z: a.z + 134 };
        const f = 0.62;                       // along the line from Bagatelle to the door
        ctx.place(b.x + (door.x - b.x) * f, 60, b.z + (door.z - b.z) * f,
          Math.atan2(-(door.z - b.z), door.x - b.x));
      }
      // His door, at 114 Champs-Élysées. The ring used to sit at (581, -340),
      // which a pilot reported as buried in a building — and it was: the 18 m
      // block under its rim is the GRAND PALAIS, which carries no collider and
      // so was invisible to a check against the collider list. Raycasting the
      // avenue instead (paris_plan.js: a straight 30 m street from the Étoile
      // at (420,-420) to (900,-180)) gives the open stretches: the first one
      // clear of both the Étoile frontages and the Palais runs s=135..165 m
      // along it. This is its middle, and 28% down the avenue — about where
      // No. 114 stands. A 30 m street cannot hold a wider ring than this.
      { const a = placeLegacy('etoile');
        // 300 m down the avenue from the Étoile, on its axis — No. 114
        ctx.setZone(V(a.x + 268, 2, a.z + 134), 26); }
      // the way he went: over the Bois, across the Seine, round the Arc to the
      // right "as the law directs", and down the avenue at rooftop height
      // The hoops must lie AHEAD of where she starts. When the start was moved
      // up the line to save seven minutes of cruising, these stayed back in the
      // Bois, so the first mark was behind the pilot and the flight began by
      // turning round. They are struck off the same line, beyond the start.
      {
        const a = placeLegacy('etoile'), b = placeLegacy('bagatelle');
        const door = { x: a.x + 268, z: a.z + 134 };
        const on = (f) => V(b.x + (door.x - b.x) * f, 30, b.z + (door.z - b.z) * f);
        ctx.setRoute([on(0.74), on(0.86), on(0.95)]);   // start is at 0.62
      }
      ctx.setCenter('June 23rd, 1903, 4 a.m.', 'Your door is on the Champs-Élysées. (green ring — land gently in the avenue)');
    },
    tick(ctx) {
      const d = ctx.zoneDist();
      if (ctx.ship.wrecked) return ctx.fail('The chimney-pots claimed her. The avenue next time.');
      if (ctx.ship.landed && d < ctx.zoneR()) {
        ctx.complete('Two servants catch and steady the ship while you go up for coffee. “From my round bay window I looked down upon the air-ship.”');
      }
    },
  },
  {
    id: 'no6-monaco',
    title: 'V. The Bay of Monaco (Feb 14, 1902)',
    sub: 'No. 6 — launched imperfectly inflated; get her home',
    location: 'monaco', shipId: 'no6',
    brief: 'The balloon left the aerodrome slack, and the sun is driving the gas to the up-pointed stem. She will rear like a steed. Nurse her back to the landing-stage — the bay is waiting to swallow her.',
    setup(ctx) {
      ctx.place(260, 90, -320, -2.16); // facing the stage, wind at your back
      ctx.ship.gas = 90;
      ctx.setZone(V(40, 12, 0), 45);
      ctx.setCenter('February 14th, 1902', 'Imperfectly inflated, sinking — the wind is behind you. Spend the sand and run for the stage.');
    },
    tick(ctx, dt) {
      ctx.ship.gas = Math.max(82, ctx.ship.gas - 0.12 * dt);
      const d = ctx.zoneDist();
      if (ctx.ship.wrecked) return ctx.fail('“Balloon, keel, and motor were fished up the next day.” History repeats — unless you fly it better.');
      if (ctx.ship.landed && d < ctx.zoneR()) {
        ctx.complete('Home dry — the ending the real February 14th never had. The maritime experiments continue.');
      }
    },
  },
  {
    id: 'no7-stlouis',
    title: 'VI. The Grand Prize (St. Louis, 1904)',
    sub: 'No. 7 — three pylons, three laps, two rivals, $100,000',
    location: 'stlouis', shipId: 'no7',
    brief: 'The race that never happened: the equal-sided triangle you proposed to the Exposition — three laps of it, at half again the Deutsch pace — flown in the racing No. 7 against La Ville de Paris and a No. 6. Beat the clock, and beat them.',
    setup(ctx) {
      ctx.setCenter('St. Louis, 1904', 'The rivals are inflating. Fly to the gold ring and begin (Enter, or GO) — the clock starts then.');
      this.done = false;
    },
    tick(ctx) {
      if (this.done) return;
      const r = ctx.raceResult();
      if (r) {
        this.done = true;
        if (r.won && r.beatRivals) ctx.complete('The grand prize is yours — “Por ceos nunca d’antes navegados!”');
        else if (r.won) ctx.fail('Within the time — but a rival crossed first. The prize divides by speed. Again!');
        else ctx.fail('The time limit passes. The $100,000 stays in the treasury.');
      }
    },
  },
  {
    id: 'no5-chestnut',
    title: 'VII. The Tallest Chestnut (July 13, 1901)',
    sub: 'No. 5 — the Tower in the tenth minute, and a head wind coming home',
    location: 'paris', shipId: 'no5',
    brief: 'The Tower is rounded and the timekeepers are waiting at St. Cloud — but the wind has turned against you and the motor is failing. Get her home over the Bois, or come down in M. Edmond de Rothschild’s park as you really did, standing in your basket at the top of the tallest chestnut with the propeller touching the ground.',
    setup(ctx) {
      // homeward from the Tower, into the head wind, motor already sickening
      { const t = placeLegacy('eiffel'); ctx.place(t.x - 1040, 165, t.z - 220, Math.PI); }
      ctx.ship.motorHealth = 0.62;
      { const sc = placeLegacy('stcloud');
        ctx.setZone(V(sc.x + 270, 12, sc.z - 240), 240); }
      ctx.setCenter('July 13th, 1901', 'Home to St. Cloud against the wind — the motor is going. (green ring)');
      this.quit = 34 + Math.random() * 26;    // she stops somewhere over the Bois
      this.t = 0; this.told = false;
    },
    tick(ctx, dt) {
      this.t += dt;
      if (!this.told && this.t > this.quit) {
        this.told = true;
        ctx.ship.sputtering = true;
        ctx.addMsg('sc7', 'The capricious motor stops — "the air-ship, bereft of its power, was carried off." Work the levers, or pick your tree.', 0);
      }
      const d = ctx.zoneDist();
      if (ctx.ship.wrecked) {
        return ctx.fail('Down hard. The chestnut would have been kinder.');
      }
      if (ctx.ship.landed && d < ctx.zoneR()) {
        ctx.complete('Home to the timekeepers in the fortieth minute — "after a terrific struggle with the element."');
      } else if (ctx.ship.landed && ctx.world.isInBois(ctx.ship.pos.x, ctx.ship.pos.z)) {
        ctx.complete('You settle into the tree-tops of the park, propeller touching the grass. Princess Isabel sends up your lunch, and a medal of St. Benedict follows by post.');
      } else if (ctx.ship.landed) {
        ctx.fail('Down in the open, far from St. Cloud and from any kindly tree.');
      }
    },
  },
  {
    id: 'no9-review',
    title: 'VIII. The Review of the 14th of July (1903)',
    sub: 'No. 9 — over the massed army at Longchamps, and a salute to the President',
    location: 'paris', shipId: 'no9',
    brief: 'You lunched at the Cascade, and the officers marking out the troops asked whether you would come to the review in her. Fly the little No. 9 over the massed army at Longchamps, low and slow, then away to the polo ground. Ten minutes, no more — do not disturb the good order of the review.',
    setup(ctx) {
      { const L = placeLegacy('longchamp'); ctx.place(L.x + 540, 22, L.z + 200, -0.6); }  // the Cascade lawn
      { const L = placeLegacy('longchamp'); ctx.setZone(V(L.x, 10, L.z), 360); }  // the racecourse, full of troops
      ctx.setCenter('July 14th, 1903', 'Over the review at Longchamps — low, and under ten minutes. (green ring)');
      this.over = 0; this.saluted = false; this.done = false;
    },
    tick(ctx, dt) {
      if (this.done) return;
      const p = ctx.ship.pos;
      const d = Math.hypot(p.x + 1250, p.z - 200);
      if (ctx.ship.wrecked) return ctx.fail('An air-ship down among the troops. Not the impression intended.');
      if (d < ctx.zoneR() && p.y > 12 && p.y < 90) {
        this.over += dt;
        if (!this.saluted && this.over > 6) {
          this.saluted = true;
          ctx.addMsg('sal', 'Opposite the President you fire a salute of twenty-one blank cartridges!', 0);
        }
      }
      if (this.over > 24 && d > 240) {
        this.done = true;
        ctx.clearZone();
        ctx.complete('"It is practical, and will have to be taken account of in war," say the officers. You steer for the polo grounds, where your friends are waiting.');
      }
    },
  },
];
