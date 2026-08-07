import { placeLegacy } from './paris_geo.js';
import { ROTHSCHILD } from './paris_stcloud.js';
import { inRiver } from './paris_terrain.js';
import { PAD_POS } from './world.js';
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
      ctx.setWind(wx * 7, wz * 7);
      ctx.ship.gas = 98;
      ctx.setZone(V(t.x - ux * 290, 40, t.z - uz * 290), 170);
      ctx.setCenter('August 8th, 1901',
        'The Tower is rounded and the valve is gone. West for St. Cloud — and '
        + 'LOW, where the wind is thinner. (green ring)');
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
      if (!this.fouled && !this.dead && along < -650) {
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
          ctx.setCenter('The motor is stopped',
            'And the wind has you — it is carrying you back onto the Tower. '
            + 'Ballast buys height and costs distance.');
        } else if (this.fouled > 9) {
          ctx.ship.wreck('scripted');
          return ctx.fail('The propeller cut the wires through and the keel came away beneath you. He stopped his motor instantly; that is the whole of why he lived.');
        }
      }
      if (!this.warned && this.dead && ctx.ship.bags < ctx.ship.spec.physics.bags) {
        this.warned = true;
        ctx.addMsg('sc2', 'The water runs out of the keel and the fall eases — and the wind now has that much longer to carry you. The Tower is downwind.', 8);
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
      } else if (this.aloft && ctx.ship.landed) {
        ctx.fail('Down before the review was flown. The troops are still drawn up at Longchamps.');
      }
      if (!ctx.ship.landed) this.aloft = true;
    },
  },
];
