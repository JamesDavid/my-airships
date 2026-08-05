// The Commission — server-side scrutineering for submitted times.
//
// It runs the SAME validator the browser runs — src/anticheat.js, mirrored
// into _shared/ by `node supabase/sync-shared.mjs` — so there is exactly one
// definition of a legal run; the difference is that this copy runs where the
// pilot cannot edit it. A row only reaches the ledger with verified = true if
// the barograph it carries actually threads every gate, in order, at speeds
// the ship could produce.
//
// Deploy:
//   node supabase/sync-shared.mjs
//   supabase functions deploy submit-time --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// @ts-ignore — plain ESM logic/data modules shared with the game client
import { validateRun, validateEntry } from '../_shared/anticheat.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// A crude gate on the door: no pilot needs to file more than a few runs a
// minute, and a flood is either a bug or an attack.
const recent = new Map<string, number[]>();
const RATE_WINDOW = 60_000, RATE_MAX = 12;
function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < RATE_WINDOW);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.clear();      // the instance is ephemeral anyway
  return hits.length > RATE_MAX;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let entry: any;
  try {
    entry = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad-json' }, 400);
  }

  const who = entry?.pilot_id || req.headers.get('x-forwarded-for') || 'anon';
  if (rateLimited(String(who))) return json({ ok: false, reason: 'too-many-entries' }, 429);

  // 1. the paperwork
  const e = validateEntry(entry);
  if (!e.ok) return json({ ok: false, reason: e.reason, detail: e.detail }, 400);

  // 2. the barograph — replayed against the course's own geometry
  const run = {
    t: entry.t,
    splits: entry.splits,
    dt: entry.ghost?.dt,
    p: entry.ghost?.p,
  };
  const v = validateRun({ trackId: entry.track_id, shipId: entry.ship_id, run });
  if (!v.ok) return json({ ok: false, reason: v.reason, detail: v.detail }, 422);

  // the claimed time and the ghost's own time must be the same run
  if (Math.abs((entry.ghost?.t ?? -1) - entry.t) > 0.001) {
    return json({ ok: false, reason: 'ghost-time-mismatch' }, 422);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,   // set for every function by default
    { auth: { persistSession: false } },
  );

  // 3. keep only a pilot's best run per course and class
  const { data: existing, error: readErr } = await supabase
    .from('times')
    .select('id,t')
    .eq('track_id', entry.track_id)
    .eq('ship_id', entry.ship_id)
    .eq('pilot_id', entry.pilot_id)
    .maybeSingle();
  if (readErr) return json({ ok: false, reason: 'ledger-unreadable' }, 500);

  const row = {
    track_id: entry.track_id,
    ship_id: entry.ship_id,
    pilot: entry.pilot,
    pilot_id: entry.pilot_id,
    t: entry.t,
    splits: entry.splits,
    ghost: entry.ghost,
    wind_day: entry.wind_day ?? null,
    client_version: entry.client_version ?? null,
    verified: true,
  };

  if (existing && existing.t <= entry.t) {
    const rank = await rankOf(supabase, entry.track_id, entry.ship_id, existing.t);
    return json({ ok: true, best: existing.t, improved: false, rank, stats: v.stats });
  }

  const write = existing
    ? await supabase.from('times').update(row).eq('id', existing.id)
    : await supabase.from('times').insert(row);
  if (write.error) return json({ ok: false, reason: write.error.message.slice(0, 120) }, 500);

  const rank = await rankOf(supabase, entry.track_id, entry.ship_id, entry.t);
  return json({ ok: true, best: entry.t, improved: true, rank, stats: v.stats });
});

async function rankOf(supabase: any, trackId: string, shipId: string, t: number) {
  const { count } = await supabase
    .from('times')
    .select('id', { count: 'exact', head: true })
    .eq('track_id', trackId)
    .eq('ship_id', shipId)
    .lt('t', t);
  return typeof count === 'number' ? count + 1 : null;
}
