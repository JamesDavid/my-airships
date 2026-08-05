# The record office — optional online leaderboards

The game is complete without this. Everything below adds **world records and
shared ghosts**: your best runs are entered in a public ledger, and you can
download the record-holder's barograph and fly against it.

**With no keys configured, none of it exists.** `src/net_config.js` ships empty,
`net.enabled()` returns false, the online menu entries are never built, and no
request is ever made. Nothing in the flight model, the scenarios or the local
time trials depends on it.

---

## Quick setup (about five minutes)

1. Create a project at [supabase.com](https://supabase.com) (the free tier is
   far more than this needs).
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](../supabase/schema.sql), run it.
3. Open **Project Settings → API** and copy the **Project URL** and the
   **anon public** key.
4. Put them in `src/net_config.js`:

   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi…';
   ```

   The anon key is *designed* to be published — it is the browser's key, and
   row-level security is what protects the table. Committing it is fine.

   To try it without editing files (or to point a single browser at a test
   project), set it from the console instead:

   ```js
   localStorage.setItem('myairships_supabase',
     JSON.stringify({ url: 'https://xxxx.supabase.co', key: 'eyJhbGciOi…' }))
   ```

5. Reload. **Esc → Time Trials** now offers *World records* and *Sign the
   register*. Set a name, fly a trial, and your best is entered automatically.

At this point times are marked **unverified**: only the pilot's own machine
checked the run, and a determined person can edit their own machine.

## Verified setup (the Commission)

Deploying the Edge Function moves scrutineering to the server, where the pilot
cannot reach it. Verified rows carry a **✓** on the board.

```sh
npm i -g supabase                       # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-ref>

node supabase/sync-shared.mjs           # mirror the validator into the function
supabase functions deploy submit-time --no-verify-jwt
```

Then close the anonymous write door — in the SQL editor:

```sql
drop policy if exists times_insert_anon on public.times;
drop policy if exists times_update_anon on public.times;
```

Now the only way into the ledger is through the function, which writes with the
service role. The client notices automatically: it always tries the function
first and only falls back to a direct insert if the function answers 404.

Re-run `node supabase/sync-shared.mjs` and redeploy whenever `src/anticheat.js`,
`src/tracks.js` or `src/ships.js` change — otherwise the Commission is judging
runs against last week's courses.

---

## What the Commission actually checks

The submitted ghost **is** the evidence — the barograph trace the 1901
Aéro-Club would have demanded. `src/anticheat.js` replays it:

| Check | What it catches |
|---|---|
| Splits present, ordered, ending at the finish | hand-edited timing cards |
| Ghost length matches the claimed duration | a good run relabelled with a better time |
| Every gate threaded, in order, the right way through the plane | shortcuts, reversed laps, missed rings |
| Each gate's replayed crossing matches its split (±~1 s) | a real trace bolted to a faked card |
| Peak ground speed ≤ ship's top speed + wind + dive allowance | teleports, spliced traces, thinned ghosts |
| **Mean** ground speed ≤ the ship's still-air pace + a little | a No. 9 posting a No. 7's trace — over a closed circuit the wind gives back what it lends, so the average is honest even when a single leg is not |
| Yaw rate within the rudder's authority | traces stitched from separate runs |
| Total time ≥ course length ÷ maximum possible speed | impossible times on any ship |
| Name, pilot id, payload size | injection, absurd uploads |

Thresholds are deliberately **generous against the physics**: a false rejection
punishes an honest pilot for a gust, a false acceptance costs one silly row.

What it does *not* do, by design: prove a human flew the run (a good bot could
produce a legal trace), or catch a modified client that flies the real physics
with, say, extra thrust — the ship's own published limits are the reference, so
such a run is caught only when it exceeds them. This is a leaderboard for a
period airship game, not a bank.

Run the bench test after touching any of it:

```sh
node supabase/test-anticheat.mjs
```

It flies an honest autopilot round every course in three ship classes (all must
be accepted), then submits ten forgeries — a scaled time, a thinned ghost, a
straight line, a class swap, a teleport, a short lap count — and expects each to
be refused with the right reason.

---

## Running it, day to day

- **Cost**: the free tier covers this comfortably. A ghost is ~90 KB of JSON for
  a six-minute run; only personal bests are uploaded, and only the row a pilot
  chooses to race is downloaded.
- **Boards**: per course, filterable by ship class and by *today's wind* (the
  daily seed means everyone flies the same sky, so a daily board is a fair fight).
- **One row per pilot** per course per class — a new best replaces the old, and
  the trigger in `schema.sql` refuses to make anyone's record slower.
- **Clearing a board**: `delete from public.times where track_id = 'gymkhana';`
- **Custom circuits** keep local times only; they are not on the boards, since
  the server has no geometry to validate them against. Share those with track
  codes and ghost codes as before.
- **The historic Deutsch/Monaco/St. Louis courses** are likewise local — those
  finish on a radius check at the aerodrome rather than a gate plane, so there
  is nothing for the replay to verify.

## When it breaks

Every failure surfaces as a toast in the game's own voice and nothing blocks:

| Toast | Meaning |
|---|---|
| *The telegraph office is closed* | no keys configured (expected, and silent in the menu) |
| *The record office has no ledger for this* | table missing — run `schema.sql` |
| *The record office refuses the entry* | RLS policy blocking the insert |
| *No word back / cannot be reached* | network, wrong URL, project paused |
| *Your own barograph refused the run* | the client's own check failed — usually a genuinely broken recording, worth reporting |

## The fault book

`bug_reports` collects what pilots send with **Report a fault** — the round
button above the menu, and the Options entry. Both are built only when
`net.enabled()` is true, so an offline copy of the game has no such button and
no such menu line: there is nowhere for a report to go, and nothing to explain.

A report carries:

- **what they typed** (`body`, capped at 4 000 characters)
- **a picture**, optional (`shot`, a `data:` URL, capped at ~280 KB). By default
  it is the rendered view. A pilot may instead send a picture of the whole
  window — instruments, menus and all — which goes through
  `getDisplayMedia()`, so the browser asks them which window or tab to share.
  If the picture is over the cap it is dropped and the words still go.
- **the state they were flying in** (`state`, jsonb): ship, place, course, race
  state, room, the instrument readings, viewport and user-agent, and the last
  25 errors thrown. That error ring is installed on the first line of
  `main.js`, before anything else can throw, so a pilot never has to reproduce
  a fault with the console open.

The table is **insert-only for `anon` and readable by nobody** — a report can
contain a picture of someone's screen. Read them from the dashboard or with the
service role:

```sql
select id, created_at, pilot, body,
       state->'page'->>'ua'   as browser,
       state->'ship'          as ship,
       state->'faults'        as errors
  from public.bug_reports
 where not handled
 order by created_at desc;
```

`shot` is a `data:` URL — paste it into an address bar to look at it. Close one
off with `update public.bug_reports set handled = true where id = 42;`.

Without the table the button still appears (the office is reachable) and the
insert answers 404, which the pilot sees as *the record office has no ledger
for this*.
