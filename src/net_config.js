// Online features (world leaderboards + ghost sharing) are OPTIONAL.
// Leave these empty and the game runs fully offline — the online menu
// entries simply don't appear.
//
// To enable: create a Supabase project, run the SQL in docs/ONLINE.md,
// then fill these in (the anon key is safe to publish; RLS guards writes).
// Alternatively, without editing code, set it from the browser console:
//   localStorage.setItem('myairships_supabase',
//     JSON.stringify({ url: 'https://xxxx.supabase.co', key: 'anon-key' }))

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
