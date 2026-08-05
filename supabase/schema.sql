-- My Airships — the record office.
-- Paste this whole file into the Supabase SQL editor and run it.
--
-- Two setups are supported, and the game degrades cleanly through both:
--   QUICK      table only. Anyone may enter a time; rows are marked
--              verified = false, because only the pilot's own machine
--              checked the run.
--   VERIFIED   deploy supabase/functions/submit-time as well, then run the
--              "lock the door" block at the bottom. The Edge Function replays
--              every submitted barograph before inserting, and only its rows
--              (verified = true) can exist.

create table if not exists public.times (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  track_id       text not null,
  ship_id        text not null,
  pilot          text not null,
  pilot_id       uuid not null,          -- anonymous, kept in the browser
  t              double precision not null,
  splits         jsonb not null,
  ghost          jsonb not null,         -- the barograph trace: {t, dt, p[]}
  wind_day       date,
  client_version text,
  verified       boolean not null default false,

  -- the crude checks the database itself can make
  constraint times_t_range      check (t > 8 and t < 3600),
  constraint times_pilot_len    check (char_length(pilot) between 1 and 24),
  -- accents are welcome (the register is French); control characters are not
  constraint times_pilot_clean  check (pilot !~ '[[:cntrl:]]' and pilot !~ '[<>&"''\\]'),
  constraint times_ids_len      check (char_length(track_id) < 64 and char_length(ship_id) < 32),
  constraint times_ghost_size   check (pg_column_size(ghost) < 700000),
  -- one row per pilot per course per ship class
  constraint times_one_per_pilot unique (track_id, ship_id, pilot_id)
);

create index if not exists times_board_idx on public.times (track_id, ship_id, t);
create index if not exists times_day_idx   on public.times (track_id, wind_day, t);

alter table public.times enable row level security;

-- everyone may read the ledger (but never the heavy ghost column by default —
-- the client asks for it a row at a time)
drop policy if exists times_read on public.times;
create policy times_read on public.times for select to anon, authenticated using (true);

-- QUICK setup: allow anonymous entries, but they can never claim verification
drop policy if exists times_insert_anon on public.times;
create policy times_insert_anon on public.times
  for insert to anon, authenticated with check (verified = false);

-- a pilot may replace their own row (the client only submits personal bests,
-- and this keeps the faster of the two)
drop policy if exists times_update_anon on public.times;
create policy times_update_anon on public.times
  for update to anon, authenticated
  using (verified = false) with check (verified = false);

-- keep the ledger honest about improvements: never let an update make a
-- pilot's own time slower, and never let it flip the verified flag.
create or replace function public.times_keep_best() returns trigger as $$
begin
  if new.t >= old.t then
    return old;                       -- a slower "best" is simply ignored
  end if;
  new.verified := old.verified and new.verified;
  return new;
end;
$$ language plpgsql;

drop trigger if exists times_keep_best_trg on public.times;
create trigger times_keep_best_trg before update on public.times
  for each row execute function public.times_keep_best();

-- ---------------------------------------------------------------------------
-- VERIFIED setup — run this AFTER deploying the submit-time function.
-- It closes the anonymous write door; the function writes with the service
-- role, which bypasses RLS.
--
--   drop policy if exists times_insert_anon on public.times;
--   drop policy if exists times_update_anon on public.times;
--
-- To clear the boards later:
--   delete from public.times where track_id = 'gymkhana';


-- ---------------------------------------------------------------------------
-- The fault book: what pilots report when something goes wrong.
--
-- Optional, like everything else here. Without this table the "Report a fault"
-- button still appears (the office is reachable) but the insert answers 404 and
-- the pilot is told the office has no ledger for it. Create it and reports land.
create table if not exists public.bug_reports (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  pilot          text,
  pilot_id       uuid,
  body           text not null,
  state          jsonb,                       -- ship, course, room, browser, recent errors
  shot           text,                        -- a data: URL, or null
  client_version text,
  handled        boolean not null default false,
  constraint bug_body_len  check (char_length(body) between 1 and 4000),
  constraint bug_shot_len  check (shot is null or char_length(shot) <= 400000),
  constraint bug_state_len check (state is null or pg_column_size(state) <= 60000)
);

create index if not exists bug_reports_new on public.bug_reports (created_at desc)
  where not handled;

alter table public.bug_reports enable row level security;

-- Anyone may file one. Nobody may read them back: a report carries whatever the
-- pilot typed and a picture of their screen, and that is for the works alone.
-- Read them in the Supabase dashboard, or with the service role.
drop policy if exists bug_insert_anon on public.bug_reports;
create policy bug_insert_anon on public.bug_reports
  for insert to anon with check (
    char_length(body) between 1 and 4000
    and (shot is null or char_length(shot) <= 400000)
  );

-- To read the unhandled ones (dashboard SQL editor):
--   select id, created_at, pilot, body, state->'page'->>'ua' as browser,
--          state->'faults' as errors
--     from public.bug_reports where not handled order by created_at desc;
--
-- The picture, if any, is in `shot` as a data: URL — paste it into a browser
-- address bar to look at it. To close one off:
--   update public.bug_reports set handled = true where id = 42;


-- ---------------------------------------------------------------------------
-- Flight records: how attempts END, and nothing else.
--
-- Deliberately narrow. There is no session trail, no positions, no free text,
-- no names — one row when an attempt finishes, carrying what was flown, where,
-- and how it went. `pilot_id` is the same per-machine UUID the leaderboard
-- uses and is the ONLY identifier. It is here so that "forty people gave up on
-- the Deutsch" can be told from "one person gave up forty times", which is the
-- whole difference between a hard course and a bored pilot.
--
-- Optional, like everything else. No table, no records, no complaints.
create table if not exists public.flights (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  pilot_id       uuid,
  place          text,                       -- paris | monaco | stlouis
  kind           text,                       -- scenario | trial | game
  ref            text,                       -- which scenario, course or game
  ship_id        text,
  outcome        text,                       -- complete | finished | failed | wrecked | abandoned
  secs           real,                       -- how long the attempt lasted
  detail         jsonb,                      -- a few numbers: gate reached, lap, gems found
  client_version text,
  constraint flights_kind    check (kind    in ('scenario','trial','game')),
  constraint flights_outcome check (outcome in ('complete','finished','failed','wrecked','abandoned','stopped')),
  constraint flights_secs    check (secs is null or (secs >= 0 and secs < 86400)),
  constraint flights_detail_len check (detail is null or pg_column_size(detail) <= 2000)
);

create index if not exists flights_what on public.flights (kind, ref, outcome);

alter table public.flights enable row level security;

-- Anyone may file one; nobody may read them back over the wire.
drop policy if exists flights_insert_anon on public.flights;
create policy flights_insert_anon on public.flights
  for insert to anon with check (true);

-- Reading them (dashboard SQL editor, or the service role):
--   select ref, outcome, count(*), round(avg(secs)) as avg_secs
--     from public.flights where kind = 'scenario'
--    group by ref, outcome order by ref, count(*) desc;
--
-- How many DIFFERENT pilots gave up on a thing, versus how many attempts:
--   select ref, count(*) as attempts, count(distinct pilot_id) as pilots
--     from public.flights where outcome = 'abandoned' group by ref;
