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
