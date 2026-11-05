-- Ritmo initial schema. Every table is private to its owner via row-level security.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.activities (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_ids jsonb not null default '{}',
  start_time timestamptz not null,
  name text not null,
  distance_m double precision not null,
  duration_s double precision not null,
  moving_s double precision not null,
  elev_gain_m double precision,
  avg_hr double precision,
  max_hr double precision,
  avg_cadence double precision,
  is_race boolean not null default false,
  detail_score double precision not null default 0,
  laps jsonb,
  streams jsonb,
  imported_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index activities_user_start_idx on public.activities (user_id, start_time);

create table public.races (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table public.plans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.session_feedback (
  activity_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, activity_id)
);

create table public.sources (
  kind text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  connected boolean not null default false,
  last_sync_at timestamptz,
  last_error text,
  primary key (user_id, kind)
);

do $$
declare t text;
begin
  foreach t in array array['profiles','activities','races','plans','session_feedback','sources'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Delete everything the signed-in runner has stored (privacy: "Delete all my data").
create or replace function public.delete_my_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.session_feedback where user_id = (select auth.uid());
  delete from public.plans where user_id = (select auth.uid());
  delete from public.races where user_id = (select auth.uid());
  delete from public.activities where user_id = (select auth.uid());
  delete from public.sources where user_id = (select auth.uid());
  delete from public.profiles where user_id = (select auth.uid());
$$;
revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
