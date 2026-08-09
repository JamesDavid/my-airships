// The record office: nothing is ever filed anonymously.
//
// Thirty flights since the name was added carry no name at all, and a nameless
// row cannot be told from a stranger's — so "how many people have played this"
// had a floor of thirteen unknowns under it. Worse, and nobody had noticed: with
// an unwritable localStorage, pilotId() returned a FRESH UUID ON EVERY CALL, so
// one afternoon in a private window is one new "pilot" per flight.
//
// Both faults are of a shape the browser hides from you: store.set swallows its
// failure on purpose, because a blocked write must never interrupt a flight. So
// they cannot be found by flying, and this is the only place they can be caught.
//
// Use: node tools/check_log.mjs
import '../src/net_config.js';

let fails = 0;
const ok = (m, ...a) => console.log('   ok   ' + m, ...a);
const bad = (m, ...a) => { console.log('   FAIL ' + m, ...a); fails++; };

// ---------------------------------------------------------------- the world
// net.js wants a browser. It gets one, of exactly the size it uses — and the
// point of the exercise is that the drawer can be made to jam.
const filed = [];
let jammed = false;
const cupboard = new Map();

globalThis.localStorage = {
  getItem(k) { if (jammed) throw new Error('storage is blocked'); return cupboard.has(k) ? cupboard.get(k) : null; },
  setItem(k, v) { if (jammed) throw new Error('storage is blocked'); cupboard.set(k, String(v)); },
  removeItem(k) { if (jammed) throw new Error('storage is blocked'); cupboard.delete(k); },
};
globalThis.fetch = async (url, opts) => {
  filed.push({ url, body: JSON.parse(opts.body) });
  return { ok: true, status: 201, headers: { get: () => null }, text: async () => '' };
};
globalThis.AbortController = globalThis.AbortController || class { abort() {} signal = null; };

const net = await import('../src/net.js');

const FLIGHT = { place: 'paris', kind: 'free', ref: 'paris', shipId: 'no6',
                 outcome: 'abandoned', secs: 61 };
const settle = () => new Promise((r) => setTimeout(r, 0));

async function file(n = 1) {
  filed.length = 0;
  for (let i = 0; i < n; i++) net.logFlight(FLIGHT);
  await settle();
  return filed.map((f) => f.body);
}

console.log('');
console.log('NOTHING IS FILED ANONYMOUSLY');
console.log('   A flight row says who flew it. Both halves of that — a name, and an id');
console.log('   that is the SAME id all afternoon — have to survive a browser that');
console.log('   will not remember anything, because that browser exists and has been');
console.log('   flying since the fifth of August.');
console.log('');

// ---- with a cupboard that works
{
  const rows = await file(3);
  if (rows.length !== 3) bad('three flights were filed but %d arrived', rows.length);
  else if (rows.some((r) => !r.pilot)) bad('a flight was filed with no pilot on it');
  else if (new Set(rows.map((r) => r.pilot_id)).size !== 1) bad('three flights, three different pilot ids');
  else ok('with storage: signed "%s", one id across three flights', rows[0].pilot);
}

// ---- and with one that is jammed shut
{
  jammed = true;
  const rows = await file(4);
  if (rows.length !== 4) {
    bad('blocked storage lost %d of 4 flights outright', 4 - rows.length);
  } else if (rows.some((r) => !r.pilot || !String(r.pilot).trim())) {
    bad('BLOCKED STORAGE FILES ANONYMOUSLY: %d of 4 rows carry no pilot',
      rows.filter((r) => !r.pilot).length);
  } else if (new Set(rows.map((r) => r.pilot_id)).size !== 1) {
    bad('BLOCKED STORAGE MINTS A NEW PILOT PER FLIGHT: %d ids for 4 flights of one session',
      new Set(rows.map((r) => r.pilot_id)).size);
  } else {
    ok('blocked storage: still signed "%s", still one id across four flights', rows[0].pilot);
  }
  jammed = false;
}

// ---- the id is a real uuid however it was made
{
  const rows = await file(1);
  const id = rows[0] && rows[0].pilot_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
    bad('the pilot id is not a uuid: %s', id);
  } else {
    ok('the id is a uuid, so two strangers never share one');
  }
}

// ---- and a name is never one of the things a name may not be
{
  const rows = await file(1);
  const n = String((rows[0] || {}).pilot || '');
  if (!n || n.length > 24 || /[<>&"'\\]/.test(n)) bad('the name is not fit to store: "%s"', n);
  else ok('the name is plain, short and not empty');
}

// ---- NAMES ARE NOT IDENTITIES, and the pool says how badly
{
  // 21 firsts x 19 lasts, counted from the source so that growing one list and
  // not the other cannot quietly make clashes likelier than anyone thinks.
  const src = await (await import('node:fs/promises')).readFile('src/net.js', 'utf8');
  const first = (src.match(/const FIRST = \[([\s\S]*?)\];/) || [])[1] || '';
  const last = (src.match(/const LAST = \[([\s\S]*?)\];/) || [])[1] || '';
  const nF = (first.match(/'/g) || []).length / 2, nL = (last.match(/'/g) || []).length / 2;
  const pool = nF * nL;
  // the birthday sum, at the number of pilots there actually are
  const n = 57;
  let pNone = 1;
  for (let i = 0; i < n; i++) pNone *= (pool - i) / pool;
  const chance = 1 - pNone;
  if (pool < 300) {
    bad('the name pool is only %d — clashes would be constant', pool);
  } else {
    ok('the name pool is %d (%d x %d): at %d pilots, %s%% chance two share a name — '
      + 'which is why nothing groups by name', pool, nF, nL, n, (chance * 100).toFixed(1));
  }
}

console.log('');
console.log(fails === 0 ? 'ALL CHECKS PASS' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
