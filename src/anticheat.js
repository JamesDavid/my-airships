// Run validation — "the Commission examines the sealed barograph."
//
// A submitted time is only as good as the ghost that carries it: the ghost IS
// the barograph trace. This module replays a submitted run against the track's
// own geometry and the ship's own physics and decides whether it could have
// been flown. It imports only pure data modules (tracks.js, ships.js), so the
// SAME file runs in the browser before submitting and inside the Supabase Edge
// Function before inserting. One definition of a legal run, both sides.
//
// Philosophy: be conservative. A false rejection punishes an honest pilot for
// a rare wind gust; a false acceptance costs one silly row on a leaderboard.
// Every threshold below is therefore generous against the physics, and only
// gross impossibilities (teleports, ghosts that never pass the gates, times
// the ship could not fly in still air) are refused.

import { TRACKS, GHOST_DT, gateHeadings } from './tracks.js';
import { SHIPS } from './ships.js';

export const LIMITS = {
  maxGhostBytes: 600000,   // the slowest ship round the longest circuit still fits
  minTime: 8,              // no circuit here can be flown in less
  maxTime: 3600,
  maxSamples: 20000,       // ~40 minutes of trace, inside maxGhostBytes
  maxAltitude: 3000,       // the book's ceiling talk, with room to spare
  minAltitude: -8,
  windAllowance: 12,       // m/s of tailwind the daily seed can hand you
  diveAllowance: 6,        // m/s bought by trading height for speed
  speedMargin: 1.2,        // slack on top of all of that
  gateSlack: 8,            // m of extra ring radius, for 0.12 s sampling
  timeSlack: 0.9,          // s of tolerance between splits and the replay
  maxNameLength: 24,
};

// Terminal airspeed in still air: thrust balances linear + quadratic drag.
export function shipTopSpeed(spec) {
  const P = spec.physics;
  if (!P || !P.thrust) return 0;               // the Brazil: wind is the only engine
  const a = P.dragQ, b = P.dragL, c = -P.thrust;
  if (a <= 0) return b > 0 ? P.thrust / b : 40;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

// The fastest the ship could conceivably cross the ground for an instant:
// full chat, the whole day's wind astern, and height being spent for speed.
export function maxGroundSpeed(spec) {
  return (shipTopSpeed(spec) + LIMITS.windAllowance + LIMITS.diveAllowance) * LIMITS.speedMargin;
}

// The fastest it could AVERAGE over a closed circuit. This is the honest
// check on ship class: a lap gives back on the upwind leg whatever the
// downwind leg lent you, so the mean pace is the still-air pace plus a little
// for diving. A No. 9 cannot post a No. 7's trace.
export function maxMeanSpeed(spec) {
  const top = shipTopSpeed(spec);
  return top ? top * 1.15 + 2.5 : LIMITS.windAllowance;   // the Brazil rides the wind alone
}

export function trackById(id, extra) {
  return (extra || []).concat(TRACKS).find((t) => t.id === id) || null;
}

// Course length: gate to gate, all laps, plus nothing for the run-up.
export function courseLength(track) {
  const g = track.gates;
  let len = 0;
  for (let lap = 0; lap < track.laps; lap++) {
    for (let i = 0; i < g.length; i++) {
      const a = g[i], b = g[(i + 1) % g.length];
      if (lap === track.laps - 1 && i === g.length - 1) break;  // stop at the flag
      len += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
  }
  return len;
}

const fin = (n) => typeof n === 'number' && Number.isFinite(n);
const bad = (reason, detail) => ({ ok: false, reason, detail: detail || '' });

/**
 * validateRun({ trackId, shipId, run })
 *   run = { t, splits:[…], dt, p:[x,y,z,yaw, x,y,z,yaw, …] }
 * → { ok, reason, detail, stats }
 */
export function validateRun({ trackId, shipId, run }, opts = {}) {
  // ---- the paperwork ------------------------------------------------
  const track = trackById(trackId, opts.tracks);
  if (!track) return bad('unknown-track', trackId);
  if (track.custom) return bad('custom-track', 'custom circuits keep local times only');
  const spec = SHIPS[shipId];
  if (!spec) return bad('unknown-ship', shipId);
  if (spec.ai) return bad('ai-ship', 'that ship is flown by a rival, not a pilot');
  if (!run || typeof run !== 'object') return bad('no-run');

  const { t, splits, p } = run;
  const dt = run.dt || GHOST_DT;
  if (!fin(t) || t < LIMITS.minTime || t > LIMITS.maxTime) return bad('time-range', String(t));
  if (!fin(dt) || Math.abs(dt - GHOST_DT) > 1e-6) return bad('bad-dt', String(dt));
  if (!Array.isArray(p) || p.length < 16 || p.length % 4 !== 0) return bad('bad-path');
  const n = p.length / 4;
  if (n > LIMITS.maxSamples) return bad('path-too-long', String(n));
  for (let i = 0; i < p.length; i++) if (!fin(p[i])) return bad('path-nan', 'index ' + i);

  const gates = track.gates;
  const expected = gates.length * track.laps;
  if (!Array.isArray(splits) || splits.length !== expected) {
    return bad('split-count', `${splits ? splits.length : 0} of ${expected}`);
  }
  for (let i = 0; i < splits.length; i++) {
    if (!fin(splits[i])) return bad('split-nan');
    if (i && splits[i] <= splits[i - 1]) return bad('splits-unordered', 'gate ' + i);
    if (splits[i] > t + 0.05) return bad('split-after-finish', 'gate ' + i);
  }
  if (Math.abs(splits[splits.length - 1] - t) > LIMITS.timeSlack) {
    return bad('finish-mismatch', 'the last gate is not the finish');
  }

  // The recording must span the run it claims: the ghost is the evidence.
  // (Trailing slack is harmless — the gate replay below still has to line up
  // with every split, so a padded trace buys nothing.)
  const recorded = (n - 1) * dt;
  if (recorded < t - 1.5 || recorded > t + 8) {
    return bad('length-mismatch', `${recorded.toFixed(1)}s of ghost for ${t.toFixed(1)}s of race`);
  }

  // ---- the flying ---------------------------------------------------
  const vMax = maxGroundSpeed(spec);
  let pathLen = 0, vPeak = 0, yawPeak = 0, yMin = Infinity, yMax = -Infinity;
  const yawRateMax = ((spec.physics && spec.physics.yawRate) || 0.5) * 4 + 1.2;

  for (let i = 0; i < n; i++) {
    const y = p[i * 4 + 1];
    if (y < LIMITS.minAltitude || y > LIMITS.maxAltitude) return bad('altitude', y.toFixed(0) + ' m');
    yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
    if (i === 0) continue;
    const j = (i - 1) * 4, k = i * 4;
    const d = Math.hypot(p[k] - p[j], p[k + 1] - p[j + 1], p[k + 2] - p[j + 2]);
    pathLen += d;
    const v = d / dt;
    if (v > vPeak) vPeak = v;
    if (v > vMax) return bad('impossible-speed', `${v.toFixed(1)} m/s (ship tops ~${vMax.toFixed(1)})`);
    let dyaw = Math.abs(p[k + 3] - p[j + 3]) % (Math.PI * 2);
    if (dyaw > Math.PI) dyaw = Math.PI * 2 - dyaw;
    yawPeak = Math.max(yawPeak, dyaw / dt);
  }
  if (yawPeak > yawRateMax) return bad('impossible-turn', `${yawPeak.toFixed(2)} rad/s`);

  // Mean pace over the whole run — the check that keeps the classes honest.
  const vMean = pathLen / t;
  const meanMax = maxMeanSpeed(spec);
  if (vMean > meanMax) {
    return bad('impossible-pace', `${vMean.toFixed(1)} m/s averaged, ${spec.name} makes ~${shipTopSpeed(spec).toFixed(1)}`);
  }

  // …and the course cannot be covered faster than its own length allows.
  const floor = courseLength(track) / vMax;
  if (t < floor) return bad('too-fast-for-course', `${t.toFixed(1)}s against a floor of ${floor.toFixed(1)}s`);

  // ---- the gates ----------------------------------------------------
  // Replay the ghost through every ring, in order, the right way round —
  // the same signed-plane crossing the live race uses.
  const headings = gateHeadings(gates);
  const norms = headings.map((h) => ({ x: Math.sin(h), z: Math.cos(h) }));
  const passes = [];
  let gi = 0, prevSd;

  for (let i = 0; i < n && passes.length < expected; i++) {
    const idx = gi % gates.length;
    const g = gates[idx], nm = norms[idx];
    const rx = p[i * 4] - g.x, ry = p[i * 4 + 1] - g.y, rz = p[i * 4 + 2] - g.z;
    const sd = rx * nm.x + rz * nm.z;
    if (prevSd !== undefined && prevSd < 0 && sd >= 0) {
      // interpolate to the instant of crossing and measure the miss distance
      const f = prevSd === sd ? 0 : -prevSd / (sd - prevSd);
      const q = (i - 1) * 4;
      const cx = p[q] + (p[q + 4] - p[q]) * f - g.x;
      const cy = p[q + 1] + (p[q + 5] - p[q + 1]) * f - g.y;
      const cz = p[q + 2] + (p[q + 6] - p[q + 2]) * f - g.z;
      const along = cx * nm.x + cz * nm.z;
      const lateral = Math.sqrt(Math.max(0, cx * cx + cy * cy + cz * cz - along * along));
      if (lateral < (g.r || 24) + 6 + LIMITS.gateSlack) {
        passes.push((i - 1 + f) * dt);
        gi++; prevSd = undefined;
        continue;
      }
    }
    prevSd = sd;
  }

  if (passes.length < expected) {
    return bad('gates-missed', `${passes.length} of ${expected} gates threaded`);
  }
  // On a stopping trial the station gate must be taken at rest — "stopping each
  // time at a point designed beforehand" — so the trace has to show her halted
  // there, not merely passing through.
  if (track.stops) {
    for (let i = 0; i < expected; i++) {
      if (i % gates.length !== 0) continue;
      const k = Math.max(1, Math.min(n - 1, Math.round(passes[i] / dt)));
      const j = (k - 1) * 4, q = k * 4;
      const v = Math.hypot(p[q] - p[j], p[q + 1] - p[j + 1], p[q + 2] - p[j + 2]) / dt;
      if (v > 3.6) return bad('did-not-stop', `${v.toFixed(1)} m/s through the station on lap ${Math.floor(i / gates.length) + 1}`);
    }
  }
  // …and the barograph must agree with the timing card, gate by gate.
  for (let i = 0; i < expected; i++) {
    if (Math.abs(passes[i] - splits[i]) > LIMITS.timeSlack + dt) {
      return bad('split-disagrees', `gate ${i + 1}: ghost says ${passes[i].toFixed(2)}s, card says ${splits[i].toFixed(2)}s`);
    }
  }

  return {
    ok: true, reason: '',
    stats: {
      pathLen: +pathLen.toFixed(1),
      meanSpeed: +(pathLen / t).toFixed(2),
      peakSpeed: +vPeak.toFixed(2),
      peakYawRate: +yawPeak.toFixed(2),
      lowest: +yMin.toFixed(1), highest: +yMax.toFixed(1),
      shipTopSpeed: +shipTopSpeed(spec).toFixed(2),
      courseFloor: +floor.toFixed(1),
      samples: n,
    },
  };
}

// A submission's non-run fields: names and identity.
export function validateEntry(e) {
  if (!e || typeof e !== 'object') return bad('no-entry');
  if (typeof e.pilot !== 'string' || !e.pilot.trim()) return bad('no-pilot-name');
  if (e.pilot.length > LIMITS.maxNameLength) return bad('name-too-long');
  if (/[<>&"'\\]|[\u0000-\u001F]/.test(e.pilot)) return bad('name-characters');
  if (typeof e.pilot_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(e.pilot_id)) return bad('bad-pilot-id');
  if (typeof e.track_id !== 'string' || typeof e.ship_id !== 'string') return bad('bad-ids');
  const bytes = JSON.stringify(e.ghost || {}).length;
  if (bytes > LIMITS.maxGhostBytes) return bad('ghost-too-large', bytes + ' bytes');
  return { ok: true, reason: '' };
}
