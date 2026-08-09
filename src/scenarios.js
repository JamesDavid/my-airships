import { placeLegacy } from './paris_geo.js';
import { ROTHSCHILD } from './paris_stcloud.js';
import { inRiver } from './paris_terrain.js';
import { PAD_POS, NEUILLY_OUT, NEUILLY_TENT, NEUILLY_LONG, mulberry32 } from './world.js';
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
      // over the ground, not through the air: the tower gate's centre is 234 m
      // up, and a 3-D test against it would never fire — the rival would circle
      // the Eiffel Tower for ever and never round it.
      if (Math.hypot(target.x - s.pos.x, target.z - s.pos.z) < 45) {
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

/**
 * A SCRIPTED LEAK — the only way a scenario may touch the hydrogen.
 *
 * All three leaking scenarios used to be written
 *
 *     ctx.ship.gas = Math.max(FLOOR, ctx.ship.gas - RATE * dt);
 *
 * meaning to say "leak down to FLOOR and stop there". What it actually says is
 * "put the gas back to FLOOR", every tick, for ever — so the moment the pilot
 * pulled his valve below the floor the script re-inflated the balloon under
 * him. A pilot flying the No. 6 into Monaco reported the vent "broken, stuck at
 * 82%" (#70), which is exactly the floor written on that scenario's line, and
 * the same fault was sitting in scenario I at 34 and scenario II at 20.
 *
 * A leak may only ever REMOVE gas. If the pilot has already vented past the
 * floor, the leak has nothing left to take and does nothing.
 */
function leak(ctx, rate, floor, dt) {
  const g = ctx.ship.gas;
  if (g <= floor) return;
  ctx.ship.gas = Math.max(floor, g - rate * dt);
}

// "standing in my basket at the top of the tallest chestnut, the propeller
// touching the ground" — 13 July 1901. A little wide of the park's own hedge,
// because a chestnut on its edge is still its chestnut.
const inRothschild = (x, z) =>
  ((x - ROTHSCHILD.x) / (ROTHSCHILD.rx + 70)) ** 2
  + ((z - ROTHSCHILD.z) / (ROTHSCHILD.rz + 70)) ** 2 < 1;

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
      leak(ctx, 0.45, 34, dt);
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
    sub: 'No. 5 — the Tower rounded, the valve gone, and a head wind home',
    location: 'paris', shipId: 'no5',
    brief: 'You turned the Tower in the ninth minute and the timekeepers are waiting at St. Cloud. But the balloon has been bleeding hydrogen since before you got here, and the wind is dead against you going home. Fly WEST, and fly LOW — the wind is thinner near the ground. When the envelope sags far enough the suspension wires will reach the propeller, and then you must stop the motor at once or it will cut them through.',
    setup(ctx) {
      // 8 AUGUST 1901, BOTH HALVES OF IT.
      //
      // This began at the fall, with a dead motor and no account of why — and a
      // pilot who had read the chapter asked whether "in the book was he coming
      // from the opposite direction into a slight headwind after rounding the
      // tower over the river sine" (#66). He was. Ch. XIII:
      //
      //   "I turned the Tower at the end of nine minutes and TOOK MY WAY BACK
      //    TO ST CLOUD; but my balloon was losing hydrogen through one of its
      //    two automatic gas valves, whose spring had been accidentally
      //    weakened... By the time I had got back to the fortifications of
      //    Paris, near La Muette, it caused the suspension wires to sag so much
      //    that those nearest to the screw propeller caught in it as it
      //    revolved. I saw the propeller cutting and tearing at the wires. I
      //    stopped the motor instantly. Then, as a consequence, the air-ship
      //    was at once driven back toward the Tower by the wind, which was
      //    strong."
      //
      // So: round the Tower, fly home into the wind, losing gas as you go, and
      // at La Muette stop the motor YOURSELF or the screw cuts the suspension
      // through. Only then the drift back, and the ballast.
      const t = placeLegacy('trocadero'), e = placeLegacy('eiffel');
      const dx = e.x - t.x, dz = e.z - t.z;
      const L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;
      this.u = { x: ux, z: uz, L };
      this.tro = t;

      // beside the Tower, just rounded, pointing home
      ctx.place(t.x + ux * 300, 150, t.z + uz * 300, Math.atan2(uz, -ux));

      // The same wind as before — "the wind, which was strong" — and the same
      // 6.5 degrees off the line, because windAt() veers with height and a ship
      // coming down from 150 m follows a curve rather than a line. Going home
      // it is a head wind; the moment the motor stops it is the thing carrying
      // her back. It was always one wind. See docs/BOOK_REFERENCE.md A14.
      const TH = -6.5 * Math.PI / 180;
      const wx = ux * Math.cos(TH) + uz * Math.sin(TH);
      const wz = -ux * Math.sin(TH) + uz * Math.cos(TH);
      // THREE TIMES ASKED, SO: 10 km/h AT HEIGHT, AND LESS BELOW.
      //
      // "How many fucking times do I have to tell you to reduce the wind
      // gradient on this mission!!!!!!!! 10km/h at this height and lower down
      // lower." Twice before that (#97, #100), and both times I answered with
      // arithmetic showing the wind was what the scenario intended. It was.
      // That was not the point: it is too strong to fly, and the pilot is the
      // one flying it.
      //
      // 2.8 m/s base. windAt is full strength at 120 m and above, so at her
      // start altitude that is exactly 10 km/h, and the gradient takes it down
      // to 4.7 km/h near the housetops — which is what "lower down lower"
      // asks for and what the brief has always promised.
      ctx.setWind(wx * 2.8, wz * 2.8);
      ctx.ship.gas = 98;
      // THE GREEN RING IS NOT SHOWN UNTIL IT MEANS ANYTHING.
      //
      // It used to be set here, over the Trocadero hotels at -290 — which is
      // where the flight ENDS, but also squarely on the way to La Muette at
      // -650, which is what you have to reach first. So a pilot flew west, saw
      // the ring the brief had promised him, put her down in it, and was told
      // he had failed: "I landed in the green ring for the scenario 2 mission
      // and it gave me a failure message" (#109). He was 108 m inside a 170 m
      // ring and on a roof, which is the winning ground — only the wires had
      // not fouled yet, so the scenario judged him by the branch for coming
      // down early.
      //
      // Hoops mean GO THIS WAY and a ring means LAND HERE, so now the way home
      // is hooped and the ring is hung only when the motor stops and the wind
      // turns her round. Nothing here reads the zone — this scenario judges by
      // distance along the line — so the marker is free to say the true thing.
      ctx.setRoute([
        V(t.x - ux * 120, 60, t.z - uz * 120),
        V(t.x - ux * 400, 45, t.z - uz * 400),
        // 48 m, not 40: La Muette is built up with 53 m housetops and a hoop
        // at forty stood thirteen metres over one of them. Higher, not
        // elsewhere — this hoop marks where the wires foul, so it has to be
        // where that happens.
        V(t.x - ux * 540, 48, t.z - uz * 540),      // La Muette, where it goes wrong
      ]);
      ctx.setCenter('August 8th, 1901',
        'The Tower is rounded and the valve is gone. West for St. Cloud — and '
        + 'LOW, where the wind is thinner. (follow the hoops)');
      this.fouled = 0;
      this.dead = false;
      this.warned = false;
    },
    tick(ctx, dt) {
      // The weakened spring, letting go all the way home — slowly at first,
      // faster once the envelope has slackened enough to foul the screw. She
      // has to still be flying when she reaches La Muette, which is the whole
      // shape of the afternoon: he got there, and THEN it went wrong.
      leak(ctx, (this.dead ? 0.115 : 0.016), 20, dt);
      const u = this.u, t = this.tro;
      const rx = ctx.ship.pos.x - t.x, rz = ctx.ship.pos.z - t.z;
      const along = rx * u.x + rz * u.z;          // + is toward the Tower
      const wide = Math.abs(-rx * u.z + rz * u.x);

      // ---- the wires reach the screw, at La Muette ----
      //
      // 540 m out, not 650. The drift home is the WIND's doing, so cutting the
      // wind to the 10 km/h a pilot asked for three times shortened it, and
      // ballast untouched fell in the streets of Passy instead of on the hotel
      // roofs — losing the one ending the whole scenario is written around.
      // The outbound leg is shortened to match, so the same flight has the same
      // ending in a wind you can fly in. La Muette is a stretch of the
      // fortifications, not a milestone, and it takes the shortening honestly.
      if (!this.fouled && !this.dead && along < -540) {
        this.fouled = 0.0001;
        // the machine-readable form of the shout, for the HUD and for
        // tools/check_scenarios.mjs — a pilot sees the message, a test cannot
        ctx.ship.wiresFouled = true;
        ctx.addMsg('foul', 'The envelope sags — the suspension wires are in the propeller! STOP THE MOTOR: throttle right back.', 0);
        ctx.setCenter('The wires are in the screw!', 'Shut the motor off — now.');
      }
      if (this.fouled && !this.dead) {
        this.fouled += dt;
        if (ctx.ship.throttle < 0.06) {
          // "I stopped the motor instantly."
          this.dead = true;
          ctx.ship.motorDead = true;
          ctx.ship.wiresFouled = false;
          // now — and only now — there is somewhere to come down
          ctx.setRoute([]);
          ctx.setZone(V(t.x - u.x * 290, 40, t.z - u.z * 290), 170);
          ctx.setCenter('The motor is stopped',
            'And the wind has you — it is carrying you back onto the Tower. '
            + 'Ballast buys height and costs distance. (green ring — the hotel roofs)');
        } else if (this.fouled > 9) {
          ctx.ship.wreck('scripted');
          return ctx.fail('The propeller cut the wires through and the keel came away beneath you. He stopped his motor instantly; that is the whole of why he lived.');
        }
      }
      if (!this.warned && this.dead && ctx.ship.bags < ctx.ship.spec.physics.bags) {
        this.warned = true;
        // Asked of the ship, not typed. A pilot may change ships when landed,
        // and the No. 5's water in her keel is not the No. 9's sand in her bags
        // — this line used to say "water" whatever was actually going over the
        // side. The check that forbids it could not see it: its own regex had a
        // literal control character where a word boundary was meant, so it
        // matched nothing and passed on every scenario for as long as it ran.
        ctx.addMsg('sc2', (ctx.ship.spec.ballast === 'water'
          ? 'The water runs out of the keel'
          : 'The sand runs out of the bags')
          + ' and the fall eases — and the wind now has that much longer to carry you. The Tower is downwind.', 8);
      }

      if (ctx.ship.wrecked) {
        return ctx.fail(along > this.u.L - 220
          ? 'Onto the Tower — the thing he threw no ballast to avoid.'
          : 'Down hard. The keel was pine and piano wire, but not for this.');
      }
      if (!ctx.ship.landed) return;

      // down before the wires ever fouled: a failed attempt at the prize, and
      // not the accident this scenario is about
      if (!this.dead) {
        return ctx.fail('Down with the motor still turning and the wires still whole — but a long way from St. Cloud, and the day is lost.');
      }

      if (inRiver(ctx.ship.pos.x, ctx.ship.pos.z)) {
        return ctx.fail('Into the Seine — a few yards past the embankment he was aiming for.');
      }
      if (along > 380) {
        return ctx.fail('Carried on under the Tower itself — "the wind would have time to blow me back on the Eiffel Tower." He was right about that.');
      }
      // THE HOTELS, NOT THE PALACE. He came down "in the courtyard of the
      // Trocadero hotels" — the blocks on the Chaillot plateau, which his keel
      // had already cleared when the full end of the balloon "came slapping
      // down on the roof just before clearing it".
      if (along >= -430 && along <= -120 && wide < 200 && ctx.ship.restingOnRoof) {
        return ctx.complete('The full end of the balloon comes down on the roof just before clearing it, and bursts "exactly like a paper bag struck after being blown up" — the terrific explosion the newspapers described. You are left hanging in your basket high up in the courtyard of the Trocadero hotels, held on the keel braced between the courtyard wall and a lower roof. "The thin pine scantlings and piano wires of Nice had saved my life!" The firemen of Passy are already running.');
      }
      if (along >= 130 && wide < 150) {
        return ctx.complete('Down on the Seine embankment beyond the Trocadero, past the gardens — "I was expecting to land on the Seine embankment beyond the Trocadero." He missed it by a few yards. You did not.');
      }
      if (ctx.ship.restingOnRoof) {
        return ctx.complete('Down on the housetops, whole — not the roof he caught, but the same idea, and the same argument for keeping your ballast.');
      }
      return ctx.fail(along > -120
        ? 'You reached the ground in the Trocadero gardens. In 1901 that fall was not survivable — it was the roofs that saved him.'
        : 'Down in the streets of Passy, short of the hotels. The wind wanted more of your ballast, not less.');
    },
  },
  {
    id: 'no6-deutsch',
    title: 'III. Winning the Deutsch Prize (Oct 19, 1901)',
    sub: 'No. 6 — the Tower, the clock, the capricious motor',
    location: 'paris', shipId: 'no6',
    // this one tells the pilot to fly to the gold ring before calling the
    // Commission, so the ring has to be drawn for it
    usesStartRing: true,
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
      // and if she is simply DOWN, say so — but ONLY ONCE SHE HAS FLOWN.
      //
      // This scenario begins with the ship at rest at the aerodrome, which is
      // to say `landed`, so judging a landing from the first tick refused the
      // race before the pilot had touched anything: "Starting the deutsch prize
      // it said not this time I'm already on the ground" (bug #54). Mine, from
      // giving the scenario an ending last week without asking where it starts.
      if (!ctx.ship.landed) this.aloft = true;
      if (ctx.ship.wrecked) {
        ctx.fail('Down, and the Commission is still standing at St. Cloud with its watches out.');
      } else if (this.aloft && ctx.ship.landed) {
        ctx.fail('You are on the ground and the half-hour is running. “Errors do not count” — but neither do landings.');
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
      // THE WAY HE WENT, AND IT IS DOWN THE AVENUE.
      //
      // "Over the Bois, across the Seine, round the Arc to the right as the law
      // directs, and down the avenue at rooftop height." The hoops were struck
      // along the straight geometric line from Bagatelle to the door, which is
      // not a street and does not pretend to be: measured, they sat 93, 252 and
      // 464 m off the avenue's axis, and the middle one stood 3 m from a 48 m
      // block. "The rings should not be above the buildings they should be in
      // the wide street" (#110), and before that "the rings for the course
      // should be in the avenue and not over the buildings".
      //
      // So the last three are struck along the Étoile-to-door axis, which IS
      // the avenue — the door is defined as a point on it — and the approach
      // hoop is put where there is room. Clearance to the nearest house,
      // measured: 57 m on the approach, then 100, 66 and 44 m down the avenue,
      // against 3 m before.
      {
        const a = placeLegacy('etoile'), b = placeLegacy('bagatelle');
        const door = { x: a.x + 268, z: a.z + 134 };
        // along the avenue itself, from the Arc to his door
        const av = (f, y) => V(a.x + (door.x - a.x) * f, y, a.z + (door.z - a.z) * f);
        // and the run in to the Arc, on the line she is already flying
        const L = Math.hypot(a.x - b.x, a.z - b.z);
        const approach = (d, y) => {
          const f = (L - d) / L;
          return V(b.x + (a.x - b.x) * f, y, b.z + (a.z - b.z) * f);
        };
        ctx.setRoute([
          approach(450, 46),     // 450 m short of the Arc, over open ground
          av(0.30, 38),          // round it to the right, and into the avenue
          av(0.60, 30),
          av(0.85, 24),          // short final, at rooftop height
        ]);
      }
      ctx.setCenter('June 23rd, 1903, 4 a.m.', 'Your door is on the Champs-Élysées. (green ring — land gently in the avenue)');
    },
    tick(ctx) {
      const d = ctx.zoneDist();
      if (ctx.ship.wrecked) return ctx.fail('The chimney-pots claimed her. The avenue next time.');
      if (ctx.ship.landed && d < ctx.zoneR()) {
        ctx.complete('Two servants catch and steady the ship while you go up for coffee. “From my round bay window I looked down upon the air-ship.”');
      } else if (this.aloft && ctx.ship.landed) {
        ctx.fail('Down in the street, but not at your own door — which was the whole point of a runabout.');
      }
      if (!ctx.ship.landed) this.aloft = true;
    },
  },
  {
    id: 'no6-monaco',
    title: 'V. The Bay of Monaco (Feb 14, 1902)',
    sub: 'No. 6 — launched imperfectly inflated; get her home',
    location: 'monaco', shipId: 'no6',
    brief: 'The balloon left the aerodrome slack, and the sun is driving the gas to the up-pointed stem. She will rear like a steed. Nurse her back to the landing-stage — the bay is waiting to swallow her.',
    setup(ctx) {
      // Asked of the world rather than typed: the stage is where monaco_geo.js
      // says the Prince built it, and she starts out over the bay with the wind
      // at her back, wherever the wind happens to be blowing that day.
      const S = ctx.world.startRing;
      const w = ctx.world.windBase;
      const wl = Math.hypot(w.x, w.z) || 1;
      const px = S.x - (w.x / wl) * 900, pz = S.z - (w.z / wl) * 900;
      ctx.place(px, 90, pz, Math.atan2(-(S.z - pz), S.x - px));   // facing the stage
      ctx.ship.gas = 90;
      ctx.setZone(S.clone(), 55);
      ctx.setCenter('February 14th, 1902', ('Imperfectly inflated, sinking — the wind is behind you. Spend the '
        + (ctx.ship.spec.ballast === 'water' ? 'water' : 'sand')
        + ' and run for the stage.'));
    },
    tick(ctx, dt) {
      leak(ctx, 0.12, 82, dt);
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
      // THE WHOLE SCENARIO IS A VECTOR PROBLEM, and it was never solved.
      //
      // It used to start beside the Tower — 4,069 m from the aerodrome. The
      // No. 5 makes 39.3 km/h, so into the day's headwind that is 727 seconds
      // of flying, and the motor was scripted to quit after 34 to 60. You lost
      // power three and a half kilometres short and then drifted EAST, away
      // from the aerodrome AND away from the park. It could not be won by
      // anybody, ever, and two pilots said so on the same afternoon.
      //
      // So it is laid out from its own geography now. The aerodrome is upwind,
      // the park lies 549 m downwind of it, and the ship starts 900 m beyond
      // the park on that same line — so she flies UP the wind toward home, the
      // motor dies just short, and the wind carries her back down onto the
      // trees. That is the afternoon of 13 July 1901 in the right order.
      const sc = placeLegacy('stcloud');
      // THE AERODROME ITSELF, not a hand-measured offset from the village.
      // This was sc + (270, -240), which was the field's old position; when the
      // field moved across the river to the bank the book puts it on (bug #49)
      // the ring stayed behind, 800 m away and on the wrong side of the water.
      const zone = { x: PAD_POS.x, z: PAD_POS.z, r: 240 };
      const dx = zone.x - ROTHSCHILD.x, dz = zone.z - ROTHSCHILD.z;
      const L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;                 // park -> aerodrome: upwind
      ctx.place(ROTHSCHILD.x - ux * 900, 165, ROTHSCHILD.z - uz * 900,
        Math.atan2(-uz, ux));
      ctx.setZone(V(zone.x, 12, zone.z), zone.r);

      // The day's own weather, not today's. The shared daily wind is seeded by
      // the date so that every pilot flies the same sky — right for a
      // leaderboard, wrong for a scenario reconstructing one afternoon, because
      // today's sky can make the recorded outcome impossible. Blowing from the
      // aerodrome toward the park, at a strength the No. 5 can just fight: 4.4
      // m/s aloft is 16 km/h against her 39, and 42% of that at the surface —
      // which is why the world's own advice is to come home LOW.
      ctx.setWind(-ux * 4.4, -uz * 4.4);
      ctx.ship.motorHealth = 0.62;
      ctx.setCenter('July 13th, 1901', 'Home to St. Cloud against the wind — the motor is going. (green ring)');
      this.dead = false;
    },
    tick(ctx) {
      const d = ctx.zoneDist();
      // "just short of it": she gives out with the ring in sight and no more.
      // zoneDist() is to the CENTRE, so this is 180 m outside a 240 m ring —
      // and 129 m upwind of the park, which is the drift she has left.
      if (!this.dead && d < ctx.zoneR() + 180) {
        this.dead = true;
        ctx.ship.motorDead = true;
        ctx.ship.sputtering = true;
        ctx.addMsg('sc7', 'The motor stops for good — “the air-ship, bereft of its power, was carried off.” The wind has you now. Pick your tree.', 0);
      }
      if (ctx.ship.wrecked) {
        return ctx.fail('Down hard. The chestnut would have been kinder.');
      }
      if (ctx.ship.landed && d < ctx.zoneR()) {
        ctx.complete('Home to the timekeepers in the fortieth minute — "after a terrific struggle with the element."');
      } else if (ctx.ship.landed && inRothschild(ctx.ship.pos.x, ctx.ship.pos.z)) {
        // THE park, not "anywhere in the Bois". He came down in M. Edmond de
        // Rothschild's, and OpenStreetMap still knows where it is: the Parc de
        // Boulogne — Edmond de Rothschild (src/paris_stcloud.js).
        ctx.complete('You settle into the tree-tops of M. Edmond de Rothschild’s park, propeller touching the grass. Princess Isabel sends up your lunch, and a medal of St. Benedict follows by post.');
      } else if (ctx.ship.landed && ctx.world.isInBois(ctx.ship.pos.x, ctx.ship.pos.z)) {
        ctx.complete('Down among the trees of the Bois — whole, but a long walk from the timekeepers, and no lunch sent up.');
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
      // 'over', not 'land': you fly across the review, you do not come down in
      // the middle of it — the one ring in the game that is not a landing place
      { const L = placeLegacy('longchamp'); ctx.setZone(V(L.x, 10, L.z), 360, 'over'); }
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
      } else if (this.aloft && ctx.ship.landed) {
        ctx.fail('Down before the review was flown. The troops are still drawn up at Longchamps.');
      }
      if (!ctx.ship.landed) this.aloft = true;
    },
  },
  {
    id: 'no9-acosta',
    title: 'IX. Mlle. de Acosta Goes Up Alone (June 29, 1903)',
    sub: 'No. 9 — three lessons on the ground, and the polo at Bagatelle',
    location: 'paris', shipId: 'no9',
    // THIS IS THE ONE FLIGHT IN THE GAME THAT IS NOT HIS.
    //
    // Aida de Acosta, nineteen, of New Jersey, asked Santos-Dumont to teach her
    // and he did — three lessons, all of them on the ground, the ship held down
    // by his men while she worked the motor and the rudder. On the morning of
    // 29 June 1903 she took the No. 9 out of the walled lot at Neuilly by
    // herself and flew it to the polo ground at Bagatelle, where a match was in
    // play. He did not go with her. He could not: the No. 9 carries one. He
    // followed underneath on a bicycle, shouting up at her.
    //
    // She was the first woman to fly a powered aircraft, and the first person
    // of any sort to fly one alone in Europe — five months before Kitty Hawk.
    // Her family were appalled and made her promise not to let it be spoken of,
    // and she kept the promise for most of her life; the memoir, written the
    // next year, does not name her. Santos-Dumont kept her photograph on his
    // wall until he died.
    //
    // So the player is not Santos-Dumont here, and the instructions do not come
    // from a brief — they come up off the road, from a man on a bicycle, for
    // exactly as long as he can keep up with you.
    brief: 'You are Aida de Acosta, nineteen, and you have had three lessons — all of them on the ground, with the ship held down. Now the men let go. Take the No. 9 up out of the walled yard at Neuilly, over the wall, and fly her to the polo ground at Bagatelle. Santos-Dumont cannot come: she carries one. He is on a bicycle in the road below, shouting. Listen for him while he can still keep up.',
    /**
     * Where she turns: the nearest point of the Seine to the yard, which is
     * 623 m off the gateway. Asked of the world rather than typed, so the turn
     * cannot drift away from the water if the river is ever retraced.
     */
    riverTurn(world, n) {
      let best = null;
      for (const p of world.riverPts) {
        const d = Math.hypot(p.x - n.x, p.z - n.z);
        if (!best || d < best.d) best = { d, x: p.x, z: p.z };
      }
      return best || { x: n.x, z: n.z };
    },
    setup(ctx) {
      const n = placeLegacy('neuilly'), b = placeLegacy('bagatelle');
      this.n = n; this.b = b;
      // On the grass just outside the tent doors, pointing down the yard at
      // the gateway, with the whole lot in front of her to get up in. She was
      // first put down BEHIND the tent facing its blind side (#101).
      const ux = Math.cos(NEUILLY_OUT), uz = Math.sin(NEUILLY_OUT);
      const start = -NEUILLY_TENT + 50;        // 28 m clear of the doors
      ctx.place(n.x + ux * start, ctx.ship.spec.keel.drop + 1.2, n.z + uz * start,
        Math.atan2(-uz, ux));
      // "a fine, still morning" — the No. 9 is a runabout, not a racer, and
      // this was flown in the calm. A light air off the river, no more.
      ctx.setWind(0.9, -1.4);
      ctx.setZone(V(b.x, 4, b.z), 150);          // the polo ground

      // ---- THE WAY OUT IS THE BOOK'S WAY, AND IT IS ALSO THE KIND WAY ----
      //
      // "Mounting diagonally in the air from my own open grounds I pass over my
      // wall, the Boulevard de la Seine, and turn when well above the river"
      // (A11). The hoops used to be struck along the straight line to
      // Bagatelle, which runs slantwise across the roofs of Neuilly — a pilot
      // asked "the course goes diag thru the city? the rings are on different
      // streets. seems like it would have been an easier flight for first solo"
      // (#107). Measured: the straight line spends 42% of its length within
      // 45 m of a house. Out to the river and down is 0% and then 18%.
      //
      // So: over the wall, over the boulevard, turn above the water, and run
      // down to the polo ground. Longer — 2.2 km against 1.4 — and very much
      // easier, which is what you want under a girl with three lessons.
      const river = this.riverTurn(ctx.world, n);
      this.turn = river;
      ctx.setRoute([
        V(n.x + ux * (NEUILLY_LONG / 2 + 55), 30, n.z + uz * (NEUILLY_LONG / 2 + 55)),
        V(river.x, 40, river.z),                                  // above the Seine
        V(river.x + (b.x - river.x) * 0.45, 38, river.z + (b.z - river.z) * 0.45),
        // 0.72 and not 0.80: at 0.80 the hoop stood 17 m from a 17 m house and
        // only 9 m over its roof, which is the very thing #110 is about. The
        // leg was scanned and this is the open part of it.
        V(river.x + (b.x - river.x) * 0.72, 32, river.z + (b.z - river.z) * 0.72),
      ]);
      ctx.setCenter('June 29th, 1903, Neuilly St James',
        'Over the wall and the boulevard, turn above the Seine, then down to Bagatelle. (green ring — land on the polo ground)');
      this.said = {};
      this.t = 0;
      this.aloft = false;
      this.over = false;
      this.circled = 0;
      this.lastAng = null;
      this.bike = 0;                 // how far he has got, in metres of road
      this.lost = false;
    },
    tick(ctx, dt) {
      this.t += dt;
      const p = ctx.ship.pos, n = this.n, b = this.b;
      const say = (k, m, s) => {
        if (this.said[k]) return;
        this.said[k] = 1;
        ctx.addMsg(k, m, s || 7);
      };

      if (ctx.ship.wrecked) {
        return ctx.fail('Down hard, and a promise to her father broken twice over. Again — he is walking back for the bicycle.');
      }

      // ---- the man on the bicycle ----
      // He can do about 22 km/h on the road, which is a shade under what the
      // No. 9 does in still air. So he starts alongside and falls behind, and
      // when he is more than 250 m astern he cannot make himself heard. That is
      // the whole tutorial budget: fly slowly and you are coached the whole way;
      // fly fast and you finish it alone, which is what she in fact did.
      const road = Math.hypot(b.x - n.x, b.z - n.z);
      const along = ((p.x - n.x) * (b.x - n.x) + (p.z - n.z) * (b.z - n.z)) / road;
      if (this.aloft) this.bike = Math.min(road, this.bike + 6.1 * dt);
      const gap = along - this.bike;
      if (!this.lost && gap > 250 && this.aloft) {
        this.lost = true;
        ctx.addMsg('bike', 'The shouting stops. You have outrun the bicycle — the rest of the way is yours alone.', 7);
      }
      const heard = !this.lost;

      if (!this.aloft && !ctx.ship.landed) {
        this.aloft = true;
        say('up', '“Doucement! Gently — she is not a horse.” The men have let go and you are off the grass.');
      }
      if (!this.aloft) return;

      const clear = p.y - ctx.world.groundAt(p.x, p.z);
      const fromYard = Math.hypot(p.x - n.x, p.z - n.z);

      // ---- the wall ----
      if (heard && fromYard < NEUILLY_LONG / 2 + 30 && clear < 12) {
        say('wall', '“The wall! Up, up — mount her diagonally, do not try to turn in the yard!”');
      }
      if (fromYard > NEUILLY_LONG / 2 + 20 && !this.said.out) {
        this.said.out = 1;
        ctx.addMsg('out', 'Over the wall and over the Boulevard de la Seine, exactly as he does it — now turn when you are well above the river.', 6);
      }

      // ---- coaching down the road, while he is still under you ----
      if (heard && this.said.out) {
        if (clear > 90) say('high', '“Not so high! You cannot see the field from up there, and the wind is worse.”');
        if (clear < 14 && along > 200) say('low', '“Higher — the trees of the Bois are coming.”');
        const wantYaw = Math.atan2(-(b.z - p.z), b.x - p.x);
        let e = wantYaw - ctx.ship.yaw;
        while (e > Math.PI) e -= 2 * Math.PI;
        while (e < -Math.PI) e += 2 * Math.PI;
        if (Math.abs(e) > 0.9 && along > 150) {
          say('steer', '“The rudder — small movements! She answers slowly, so give her time to answer.”');
        }
      }

      // ---- the polo ground ----
      const d = ctx.zoneDist();
      if (d < ctx.zoneR() + 90 && !this.over) {
        this.over = true;
        ctx.addMsg('polo', 'The polo ground, and a match in play — the ponies scatter and the players pull up to watch you come over.', 8);
        ctx.setCenter('Bagatelle', 'Round the field once, then set her down on the grass.');
      }

      // one turn about the field, as she made, before landing
      if (this.over && d < ctx.zoneR() + 90 && !ctx.ship.landed) {
        const a = Math.atan2(p.z - b.z, p.x - b.x);
        if (this.lastAng !== null) {
          let da = a - this.lastAng;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          this.circled += da;
        }
        this.lastAng = a;
        if (!this.said.round && Math.abs(this.circled) > Math.PI * 1.85) {
          this.said.round = 1;
          ctx.addMsg('round', 'All the way round, with the whole field watching. Now bring her down.', 6);
        }
      }

      // ---- the verdict ----
      if (ctx.ship.landed && d < ctx.zoneR()) {
        if (Math.abs(this.circled) < Math.PI * 1.85) {
          return ctx.complete('Down on the polo ground at Bagatelle, and the players are running to you. You have flown a powered air-ship alone — the first woman anywhere to do it, five months before Kitty Hawk. (Round the field first, next time, as she did.)');
        }
        return ctx.complete('Down on the grass among the ponies, whole, and the match abandoned. Aida de Acosta, nineteen, three lessons — the first woman in the world to fly a powered air-ship alone. Her family made her promise never to speak of it. He kept her photograph on his wall for the rest of his life.');
      }
      if (ctx.ship.landed && d >= ctx.zoneR()) {
        return ctx.fail('Down somewhere in the Bois, safely enough — but the polo ground is still waiting, and so is he, pedalling.');
      }
    },
  },
  {
    id: 'no6-submarines',
    title: 'X. The Enemy of the Submarine (the last chapter)',
    sub: 'No. 6 — five boats under the bay of Monaco, found from the end of the guide rope',
    location: 'monaco', shipId: 'no6',
    brief: '“Any submarine boat, stealthily pursuing its course underneath them, will be beautifully visible to him, while from a warship’s deck it would be quite invisible… This is a well-observed fact, and depends on certain optical laws.” The one thing in this book that had not happened yet. Five boats are under the bay. Quarter it LOW — from a height you see only the sky in the water — and when you catch one, hold her while she is signalled.',
    setup(ctx) {
      if (this.fleet) this.fleet.dispose();          // a second run, not a second fleet
      // Not the daily seed: this is a solo scenario and flying the same five
      // legs all day would be learning the answer rather than the skill.
      this.fleet = ctx.world.makeSubmarines(mulberry32((Math.random() * 4294967296) >>> 0), 5);
      this.said = {};
      const S = ctx.world.startRing;
      ctx.place(S.x, 70, S.z, Math.atan2(-(ctx.world.turnRing.z - S.z), ctx.world.turnRing.x - S.x));
      ctx.clearZone();
      ctx.setCenter('The bay of Monaco — the twentieth century',
        'Five boats, under way, somewhere in the bay. Fly LOW and look straight down — '
        + 'at a flat angle the sea is only a mirror. Press C for “Over the side” to lean out and '
        + 'watch the water. Hold within ninety metres for four seconds to signal one.');
    },
    tick(ctx, dt) {
      const f = this.fleet;
      if (!f) return;
      const news = f.tick(dt, ctx.ship.pos, 0);
      if (news.sighted && !this.said.first) {
        this.said.first = 1;
        ctx.addMsg('sub-1', 'Something under the swell — hold her there. “Follow all its movements, and signal them.”', 6);
      }
      if (news.signalled) {
        const n = f.found();
        ctx.addMsg('sub-' + n, n < f.total
          ? `Boat ${news.signalled.name} signalled — ${n} of ${f.total}. Away and find the rest.`
          : 'The last of them.', 6);
      }
      if (ctx.ship.wrecked) {
        return ctx.fail('Into the bay of Monaco, which is where this ship goes when she is flown carelessly. The boats pass on, unreported.');
      }
      if (f.found() >= f.total && !this.said.done) {
        this.said.done = 1;
        return ctx.complete('All five reported, and not one of them ever knew. “The twentieth century air-ship must become from the beginning the great enemy of that other twentieth century marvel — the submarine boat — and not only its enemy but its master.” He wrote that in 1904. It took the Royal Navy until 1915 to agree with him.');
      }
    },
  },
];
