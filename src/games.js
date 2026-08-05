// Room games — the ones a child can be handed the controls for.
//
// A trial is a stopwatch and a set of gates; these are not. Nobody is knocked
// out, nobody has to read fast, and everything is decided by where the ships
// actually are, which is the one thing the room already agrees about.
//
// Everything here is DETERMINISTIC from (day, room code, round). Every pilot
// generates the same hunt, the same hidden place, the same order of turns,
// with nothing sent over the wire but "I have got number three". It is the same
// trick as the daily wind and the motor's caprice — see docs/PERIOD_NOTES.md.

import { mulberry32, skyDaySeed } from './world.js';

export const GAMES = [
  {
    id: 'tag',
    name: 'Tag',
    sub: 'one ship is “it” — touch another to pass it on',
    how: 'Whoever is IT must catch somebody. Fly into them — silk on silk, nobody is hurt — '
      + 'and they are IT instead. No tagging straight back.',
    minPilots: 2,
  },
  {
    id: 'postcards',
    name: 'The postcard hunt',
    sub: 'find the shining gems over the famous places',
    how: 'A gem turns in the air over each place on the list. Fly through it and a postcard '
      + 'is made of the place, with your ship in the picture. Everyone can collect every one — '
      + 'split up and call out what you find.',
    minPilots: 1,
  },
  {
    id: 'hotcold',
    name: 'Hot and cold',
    sub: 'one hidden place, and the bell rings faster as you near it',
    how: 'Something is hidden over one of the places. There is no list and nothing to read: '
      + 'the bell rings faster and the gauge climbs as you get warmer.',
    minPilots: 1,
  },
  {
    id: 'follow',
    name: 'Follow the leader',
    sub: 'stay with the ship in front',
    how: 'The pilot holding the room leads. Everyone else keeps within a hundred metres. '
      + 'The arrow in the roster points the way back if you lose her.',
    minPilots: 2,
  },
];

export function gameById(id) { return GAMES.find((g) => g.id === id) || null; }

/**
 * The wind for a children's game. It is not switched off — riding it high and
 * crawling home low against it is the whole lesson of the book, and a dead calm
 * teaches nothing. It is halved, so a small pilot can still get home.
 */
export const KID_WIND = 0.5;

/** The same book of numbers for every pilot in the room, this day, this round. */
export function roundRng(code, round) {
  const key = `${skyDaySeed()}|${code}|${round}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return mulberry32(h >>> 0);
}

/** Draw `n` places from this world, in an order the whole room agrees on. */
export function pickPlaces(world, code, round, n) {
  const all = (world && world.landmarks) || [];
  if (!all.length) return [];
  const rng = roundRng(code, round);
  const pool = all.slice();
  for (let i = pool.length - 1; i > 0; i--) {           // a shuffle, seeded
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, Math.min(n, pool.length)));
}

/**
 * Hot-and-cold walks through ONE shuffle rather than drawing afresh each round,
 * so the same place cannot come up twice running — which to a child looks like
 * the game is broken, or cheating.
 */
export function hiddenPlace(world, code, round) {
  const all = (world && world.landmarks) || [];
  if (!all.length) return null;
  const order = pickPlaces(world, code, 1, all.length);
  return order[(Math.max(1, round) - 1) % order.length];
}

/** How warm, 0 at the far side of the city and 1 on top of it. */
export function warmth(dist, near, far) {
  if (dist <= near) return 1;
  if (dist >= far) return 0;
  return 1 - (dist - near) / (far - near);
}

export const TAG_GRACE = 3.5;        // seconds before a tag can be given back
export const FOLLOW_RANGE = 100;     // metres you may trail the leader by
