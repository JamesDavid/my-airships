// Mirror the shared validation modules into supabase/functions/_shared/.
//
// The Supabase CLI only bundles files under supabase/functions/, so the Edge
// Function cannot import ../../src directly. Rather than write a second
// validator (which would drift from the game's), we copy the originals here
// before every deploy — the client and the Commission stay in lockstep.
//
//   node supabase/sync-shared.mjs
//   supabase functions deploy submit-time --no-verify-jwt

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
const out = join(here, 'functions', '_shared');
const FILES = ['anticheat.js', 'tracks.js', 'ships.js'];

const BANNER = `// GENERATED FILE — do not edit.
// Copied from src/%s by supabase/sync-shared.mjs. Edit the original.
`;

mkdirSync(out, { recursive: true });
for (const f of FILES) {
  const body = readFileSync(join(src, f), 'utf8');
  writeFileSync(join(out, f), BANNER.replace('%s', f) + body);
  console.log(`synced ${f} (${body.length} bytes)`);
}
console.log('now: supabase functions deploy submit-time --no-verify-jwt');
