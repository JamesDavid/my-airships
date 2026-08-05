// The wire — world records and shared ghosts, over Supabase's REST endpoint.
//
// EVERYTHING here is optional. With no keys configured, `enabled()` is false,
// the online menu entries never appear, and the game is exactly what it was:
// a local simulator with local ghosts. Nothing awaits the network on a code
// path that matters, every request carries a timeout, and every failure is a
// toast rather than an exception.
//
// No SDK: two REST verbs and a function call is the whole protocol.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './net_config.js';
import { validateRun, validateEntry } from './anticheat.js';

const LS_CFG = 'myairships_supabase';
const LS_PILOT = 'myairships_pilot';
const LS_PID = 'myairships_pilot_id';
const TIMEOUT = 9000;
export const CLIENT_VERSION = '1.0';

let _cfg;
export function config() {
  if (_cfg !== undefined) return _cfg;
  let url = SUPABASE_URL, key = SUPABASE_ANON_KEY;
  try {                                    // a console override, so no rebuild is needed
    const o = JSON.parse(localStorage.getItem(LS_CFG) || 'null');
    if (o && o.url && o.key) { url = o.url; key = o.key; }
  } catch { /* ignore */ }
  _cfg = (url && key) ? { url: url.replace(/\/+$/, ''), key } : null;
  return _cfg;
}

export function enabled() { return !!config(); }

// ---------------------------------------------------------------- pilot
// Every pilot is entered in the register on their first flight, under a name
// of the period — theirs to keep or to change in the menu. It rides on your
// ghosts and on anything you send to the record office.
const FIRST = ['Alberto', 'Émile', 'Henri', 'Gaston', 'Léon', 'Auguste', 'Camille',
  'Édouard', 'Jules', 'Marcel', 'Lucien', 'Armand', 'Victor', 'Georges', 'Raymond',
  'Célestine', 'Blanche', 'Marguerite', 'Hélène', 'Suzanne', 'Adrienne'];
const LAST = ['Bruneau', 'Vasseur', 'Marchand', 'Lefèvre', 'Beaumont', 'Dufresne',
  'Chatelain', 'Roussel', 'Vaillant', 'Sauvage', 'Corbin', 'Mercier', 'Fontaine',
  'Boulanger', 'Perrault', 'Delaunay', 'Tissandier', 'Villeneuve', 'Aubert'];

export function pilotName() {
  return localStorage.getItem(LS_PILOT) || '';
}

/** The name a pilot flies under — assigned on the first flight if unset. */
export function ensurePilotName() {
  const have = pilotName();
  if (have) return have;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return setPilotName(`${pick(FIRST)} ${pick(LAST)}`);
}
export function setPilotName(name) {
  const clean = String(name || '').replace(/[<>&"'\\]|[\u0000-\u001F]/g, '').trim().slice(0, 24);
  if (clean) localStorage.setItem(LS_PILOT, clean);
  return clean;
}
export function pilotId() {
  let id = localStorage.getItem(LS_PID);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = (crypto.randomUUID && crypto.randomUUID()) || fallbackUuid();
    localStorage.setItem(LS_PID, id);
  }
  return id;
}
function fallbackUuid() {
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-4${h.slice(6, 8).join('').slice(1)}-a${h.slice(8, 10).join('').slice(1)}-${h.slice(10, 16).join('')}`;
}

// ---------------------------------------------------------------- transport
async function req(path, opts = {}) {
  const cfg = config();
  if (!cfg) throw new Error('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout || TIMEOUT);
  try {
    const r = await fetch(cfg.url + path, {
      method: opts.method || 'GET',
      signal: ctl.signal,
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { status: r.status, ok: r.ok, data, headers: r.headers };
  } finally { clearTimeout(timer); }
}

// today's wind seed, so a board can be read as "on today's sky"
export function windDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- reads
/** Top times for a course. shipId null = all classes together. */
export async function leaderboard(trackId, shipId, { limit = 12, today = false } = {}) {
  if (!enabled()) return { ok: false, reason: 'offline', rows: [] };
  let q = `/rest/v1/times?select=id,pilot,ship_id,t,verified,wind_day,created_at`
    + `&track_id=eq.${encodeURIComponent(trackId)}&order=t.asc&limit=${limit}`;
  if (shipId) q += `&ship_id=eq.${encodeURIComponent(shipId)}`;
  if (today) q += `&wind_day=eq.${windDay()}`;
  try {
    const r = await req(q);
    if (!r.ok) return { ok: false, reason: httpReason(r), rows: [] };
    return { ok: true, rows: Array.isArray(r.data) ? r.data : [] };
  } catch (e) { return { ok: false, reason: netReason(e), rows: [] }; }
}

/** The ghost behind one row — downloaded only when a pilot asks to race it. */
export async function fetchGhost(id) {
  if (!enabled()) return null;
  try {
    const r = await req(`/rest/v1/times?select=t,splits,ghost,pilot,ship_id&id=eq.${encodeURIComponent(id)}&limit=1`);
    const row = r.ok && Array.isArray(r.data) ? r.data[0] : null;
    if (!row || !row.ghost) return null;
    const g = row.ghost;
    if (!Array.isArray(g.p) || typeof g.t !== 'number') return null;
    return { t: g.t, dt: g.dt, p: g.p, splits: g.splits || row.splits || [], pilot: row.pilot, ship: row.ship_id };
  } catch { return null; }
}

/** Where a time places on the board: 1 + the number of faster runs. */
export async function rankOf(trackId, shipId, t) {
  if (!enabled()) return null;
  try {
    const r = await req(`/rest/v1/times?select=id&track_id=eq.${encodeURIComponent(trackId)}`
      + `&ship_id=eq.${encodeURIComponent(shipId)}&t=lt.${t}`,
      { headers: { Prefer: 'count=exact', Range: '0-0' } });
    if (!r.ok) return null;
    // PostgREST answers the count in Content-Range: "0-0/37"
    const cr = r.headers && r.headers.get('content-range');
    const total = cr && cr.includes('/') ? parseInt(cr.split('/')[1], 10) : NaN;
    return Number.isFinite(total) ? total + 1 : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- writes
/**
 * Submit a personal best. Validated HERE first (so an honest client never
 * uploads a broken run), then again on the server if the Edge Function is
 * deployed — that second check is the one that counts, since this one runs
 * on the cheat's own machine.
 */
export async function submitTime({ trackId, shipId, run }) {
  if (!enabled()) return { ok: false, reason: 'offline' };
  const pilot = pilotName();
  if (!pilot) return { ok: false, reason: 'no-name' };

  const entry = {
    track_id: trackId, ship_id: shipId, pilot, pilot_id: pilotId(),
    t: run.t, splits: run.splits, ghost: { t: run.t, dt: run.dt, p: run.p, splits: run.splits },
    wind_day: windDay(), client_version: CLIENT_VERSION,
  };
  const e = validateEntry(entry);
  if (!e.ok) return { ok: false, reason: 'local-' + e.reason, detail: e.detail };
  const v = validateRun({ trackId, shipId, run });
  if (!v.ok) return { ok: false, reason: 'local-' + v.reason, detail: v.detail };

  // 1. the validating Edge Function, if it is deployed
  try {
    const r = await req('/functions/v1/submit-time', { method: 'POST', body: entry, timeout: 14000 });
    if (r.status !== 404 && r.status !== 401 && r.status !== 403) {
      if (r.ok) return { ok: true, verified: true, rank: r.data && r.data.rank, best: r.data && r.data.best };
      return { ok: false, reason: (r.data && (r.data.reason || r.data.error)) || httpReason(r) };
    }
  } catch (e) {
    if (String(e).includes('abort')) return { ok: false, reason: 'timeout' };
    /* fall through — the function may simply not be deployed */
  }

  // 2. plain table insert (an unverified row; the table's own CHECKs still apply)
  try {
    const r = await req('/rest/v1/times?on_conflict=track_id,ship_id,pilot_id', {
      method: 'POST', body: entry, timeout: 14000,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    if (r.ok) return { ok: true, verified: false };
    return { ok: false, reason: httpReason(r) };
  } catch (e) { return { ok: false, reason: netReason(e) }; }
}

// ---------------------------------------------------------------- plumbing
function httpReason(r) {
  if (r.status === 404) return 'no-table';
  if (r.status === 401 || r.status === 403) return 'not-permitted';
  if (r.status === 409) return 'duplicate';
  const m = r.data && (r.data.message || r.data.hint);
  return m ? String(m).slice(0, 80) : 'http-' + r.status;
}
function netReason(e) {
  return String(e).includes('abort') ? 'timeout' : 'unreachable';
}

// human phrasing for the toasts, in the register of the rest of the game
export const REASONS = {
  offline: 'The telegraph office is closed — no records are being kept.',
  'no-name': 'Sign the register first: set your pilot name in the menu.',
  'no-table': 'The record office has no ledger for this — see docs/ONLINE.md.',
  'not-permitted': 'The record office refuses the entry (check the table policies).',
  timeout: 'No word back from the record office.',
  unreachable: 'The record office cannot be reached.',
  duplicate: 'That run is already on the books.',
};
export function phrase(reason) {
  if (REASONS[reason]) return REASONS[reason];
  if (reason && reason.startsWith('local-')) {
    return `Your own barograph refused the run (${reason.slice(6)}) — not submitted.`;
  }
  return `The record office refused the entry (${reason}).`;
}
