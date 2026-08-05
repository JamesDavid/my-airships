// Online features (world leaderboards + ghost sharing) are OPTIONAL.
// Leave these empty and the game runs fully offline — the online menu
// entries simply don't appear.
//
// The anon key is meant to be public: it is the browser's key, and row-level
// security in supabase/schema.sql is what protects the table. See docs/ONLINE.md
// for the schema and for deploying the server-side run validator.
//
// A single browser can point somewhere else without editing this file:
//   localStorage.setItem('myairships_supabase',
//     JSON.stringify({ url: 'https://xxxx.supabase.co', key: 'anon-key' }))

export const SUPABASE_URL = 'https://vsdzskrwzvibsnhspljl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZHpza3J3enZpYnNuaHNwbGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTUyMDEsImV4cCI6MjEwMTQ3MTIwMX0.2JxBCaJFHdow2RQOyTjAfg6urp7a2jQMpBXYihKB3PI';
