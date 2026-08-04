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
      ctx.place(-1150, 270, -120, 0);
      ctx.ship.gas = 90;
      ctx.setZone(V(-450, 12, -140), 90);
      ctx.setCenter('September 1898', 'The cylinder is folding — make for Bagatelle! (green ring)');
      this.warned = false;
    },
    tick(ctx, dt) {
      ctx.ship.gas = Math.max(34, ctx.ship.gas - 0.45 * dt);
      if (!this.warned && ctx.ship.gas < 70) {
        this.warned = true;
        ctx.addMsg('sc', '“The balloon began to fold in the middle like a pocket knife…” Throttle DOWN, nose down, ride her in.', 0);
      }
      const d = Math.hypot(ctx.ship.pos.x + 450, ctx.ship.pos.z + 140);
      if (ctx.ship.wrecked) return ctx.fail('“I was saved for the first time”… but not this time.');
      if (ctx.ship.landed && d < 90) {
        ctx.complete('The kite-flying boys grasp your guide rope and run against the wind — “They were bright young fellows!”');
      } else if (ctx.ship.landed && d >= 90) {
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
      ctx.place(330, 150, 160, Math.PI);
      ctx.ship.gas = 80;
      ctx.setZone(V(20, 40, 140), 70);
      ctx.setCenter('August 8th, 1901', 'The valve is gone. The Trocadéro roof or nothing. (green ring)');
    },
    tick(ctx, dt) {
      ctx.ship.gas = Math.max(55, ctx.ship.gas - 0.35 * dt);
      const d = Math.hypot(ctx.ship.pos.x - 20, ctx.ship.pos.z - 140);
      const onRoof = d < 70 && ctx.ship.pos.y > 12 && ctx.ship.pos.y < 45;
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
      ctx.setCenter('October 19th, 1901', 'Fly to the gold ring and the trial begins.');
      ctx.startRace();
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
      ctx.place(-450, 14, -140, 0); // towed to Bagatelle overnight
      ctx.setZone(V(700, 10, -280), 30);
      ctx.setCenter('June 23rd, 1903, 4 a.m.', 'Your door is on the Champs-Élysées. (green ring — land gently in the avenue)');
    },
    tick(ctx) {
      const d = Math.hypot(ctx.ship.pos.x - 700, ctx.ship.pos.z + 280);
      if (ctx.ship.wrecked) return ctx.fail('The chimney-pots claimed her. The avenue next time.');
      if (ctx.ship.landed && d < 30) {
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
      const d = Math.hypot(ctx.ship.pos.x - 40, ctx.ship.pos.z);
      if (ctx.ship.wrecked) return ctx.fail('“Balloon, keel, and motor were fished up the next day.” History repeats — unless you fly it better.');
      if (ctx.ship.landed && d < 45) {
        ctx.complete('Home dry — the ending the real February 14th never had. The maritime experiments continue.');
      }
    },
  },
  {
    id: 'no7-stlouis',
    title: 'VI. The Grand Prize (St. Louis, 1904)',
    sub: 'No. 7 — three pylons, two rivals, $100,000',
    location: 'stlouis', shipId: 'no7',
    brief: 'The race that never happened: the triangular course you proposed to the Exposition, flown in the racing No. 7 against La Ville de Paris and a No. 6. Beat the clock — and beat them.',
    setup(ctx) {
      ctx.setCenter('St. Louis, 1904', 'The rivals are inflating. Fly to the gold ring and begin.');
      ctx.startRace();
      this.done = false;
    },
    tick(ctx) {
      if (this.done) return;
      const r = ctx.raceResult();
      if (r) {
        this.done = true;
        if (r.won && r.beatRivals) ctx.complete('The grand prize is yours — “Por mares nunca d’antes navegados!”');
        else if (r.won) ctx.fail('Within the time — but a rival crossed first. The prize divides by speed. Again!');
        else ctx.fail('The time limit passes. The $100,000 stays in the treasury.');
      }
    },
  },
];
