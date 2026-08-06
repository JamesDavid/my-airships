// The physics, flown headless. `npm` is not part of this project and never
// will be — the game takes three.js from the CDN importmap — but the flight
// model is plain arithmetic, so with a stub three (node_modules/three, which
// .gitignore keeps out of the repo) a scenario can be FLOWN and measured
// rather than argued about.
//
// Use: node tools/sim.mjs
import './headless.mjs';
import { Airship } from '../src/airship.js';
import { SHIPS } from '../src/ships.js';

export function makeShip(id) {
  const s = new Airship({ add() {}, remove() {} }, SHIPS[id]);
  return s;
}

export const NO_INPUT = { throttle: 0, rudder: 0, pitch: 0, vent: 0, coax: 0 };

// Fly one ship through a wind for `secs`, calling `pilot(ship, t)` each step.
// `env.groundAt` is whatever ground you want under her.
export function fly(ship, { wind, env, secs = 600, dt = 1 / 30, pilot }) {
  const track = [];
  let t = 0;
  for (let i = 0; i * dt < secs; i++) {
    t = i * dt;
    const input = pilot ? (pilot(ship, t) || NO_INPUT) : NO_INPUT;
    ship.update(dt, input, wind, env);
    if (i % Math.round(1 / dt) === 0) {
      track.push({ t, x: ship.pos.x, y: ship.pos.y, z: ship.pos.z,
        bags: ship.bags, gas: ship.gas,
        landed: ship.landed, wrecked: ship.wrecked });
    }
    if (ship.landed || ship.wrecked) break;
  }
  return { track, t, end: { x: ship.pos.x, y: ship.pos.y, z: ship.pos.z,
    landed: ship.landed, wrecked: ship.wrecked, bags: ship.bags } };
}
