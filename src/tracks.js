// Time-trial circuits (the "aerial gymkhana"). Historical warrant, Ch. XII:
// "Ten times in succession I made the circuit of Longchamps, stopping each
// time at a point designed beforehand." Gates thread the world's drama —
// the Grande Roue, the Arc, the harbor, the Observation Wheel.
//
// A track: { id, name, sub, location, laps, gates: [{x,y,z,r}] }
// The lap starts and ends at gates[0]; the spawn point is computed behind it.

export const TRACKS = [
  {
    id: 'longchamps', location: 'paris', laps: 3,
    name: 'The Longchamps Circuit',
    sub: '“Ten times in succession I made the circuit of Longchamps” — 3 laps',
    gates: ellipse(-1250, 200, 300, 190, 6, 30, 20),
  },
  {
    id: 'gymkhana', location: 'paris', laps: 2,
    name: 'The Aerial Gymkhana',
    sub: 'skirt the Roue, the Tower’s shoulder, under the Arc — 2 laps',
    gates: [
      { x: 452, y: 35, z: 560, r: 16 },   // skirt the rim of the Grande Roue
      { x: 300, y: 25, z: 330, r: 18 },   // low over the Champ de Mars
      { x: 260, y: 35, z: 75, r: 18 },    // the Tower's shoulder — his one danger
      { x: 20, y: 50, z: 140, r: 18 },    // over the Trocadéro dome, between its towers
      { x: 640, y: 20, z: -335, r: 15 },  // down the Champs-Élysées canyon
      { x: 420, y: 13, z: -420, r: 5.5 }, // UNDER the Arc de Triomphe
    ],
  },
  {
    id: 'harbor', location: 'monaco', laps: 3,
    name: 'The Harbor Circuit',
    sub: 'low over the bay, round the Rock — 3 laps',
    gates: [
      { x: 100, y: 18, z: 40, r: 16 },
      { x: 280, y: 12, z: -200, r: 16 },  // wave-top, rope in the sea
      { x: 360, y: 22, z: 160, r: 16 },
      { x: 160, y: 30, z: 380, r: 18 },   // round Monaco rock
      { x: 40, y: 24, z: 150, r: 16 },
    ],
  },
  {
    id: 'basin', location: 'stlouis', laps: 3,
    name: 'The Basin Sprint',
    sub: 'skirt the Observation Wheel, skim the Grand Basin — 3 laps',
    gates: [
      { x: -288, y: 40, z: -330, r: 15 }, // skirt the great wheel's rim
      { x: -80, y: 18, z: -120, r: 16 },
      { x: 180, y: 16, z: 0, r: 14 },     // skim the Grand Basin (mind the water!)
      { x: 620, y: 62, z: 90, r: 18 },    // round Festival Hall
      { x: 100, y: 24, z: 130, r: 16 },   // the plaza gap between the palaces
      { x: -450, y: 16, z: 40, r: 16 },
    ],
  },
];

function ellipse(cx, cz, rx, rz, n, y, r) {
  const g = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.push({ x: cx + Math.cos(a) * rx, y, z: cz + Math.sin(a) * rz, r });
  }
  return g;
}

// spawn ~90 m behind gate 0, facing it, at gate height
export function trackSpawn(track) {
  const g0 = track.gates[0];
  const gLast = track.gates[track.gates.length - 1];
  let dx = g0.x - gLast.x, dz = g0.z - gLast.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  return {
    x: g0.x - dx * 90, y: Math.max(14, g0.y), z: g0.z - dz * 90,
    yaw: Math.atan2(-dz, dx),
  };
}

// ---------------------------------------------------------------- ghosts
// A run: positions sampled at fixed dt, quantized to decimeters.
export const GHOST_DT = 0.12;

export function encodeGhost(best) {
  return btoa(JSON.stringify(best));
}

export function decodeGhost(code) {
  try {
    const g = JSON.parse(atob(code.trim()));
    if (!Array.isArray(g.p) || typeof g.t !== 'number') return null;
    return g;
  } catch { return null; }
}

// custom tracks live in localStorage
export function loadCustomTracks() {
  try { return JSON.parse(localStorage.getItem('myairships_tracks') || '[]'); }
  catch { return []; }
}

export function saveCustomTrack(t) {
  const list = loadCustomTracks().filter((x) => x.id !== t.id);
  list.push(t);
  localStorage.setItem('myairships_tracks', JSON.stringify(list));
}
