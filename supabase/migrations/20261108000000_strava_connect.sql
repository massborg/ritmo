-- Strava (OAuth 2.0 + push webhook). Switched on per account with the 'strava' feature flag. Additive only.
-- Strava's API agreement: Strava data is shown only to the runner it belongs to and is never used with AI. The app
-- enforces that (no Hub posts or share images of Strava runs; the AI coach is told nothing derived from them).

alter table public.feature_flags drop constraint if exists feature_flags_flag_check;
alter table public.feature_flags add constraint feature_flags_flag_check
  check (flag in ('run_tab', 'hub', 'share_cards', 'body', 'garmin', 'strava'));

-- One Strava connection per Ritmo account. Tokens are server-only: row-level security on, no policies.
create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users on delete cascade,
  athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  scope text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.strava_connections enable row level security;

-- Short-lived state while the runner is on Strava's consent page (protects against forged callbacks). Server-only.
create table if not exists public.strava_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.strava_oauth_states enable row level security;

-- Runs from Strava waiting to be turned into Ritmo runs by the runner's app (and deletions to apply). The runner
-- can read and delete only their own rows; only the server functions insert.
create table if not exists public.strava_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  activity_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (user_id, activity_id)
);
create index if not exists strava_inbox_user_idx on public.strava_inbox (user_id, received_at);
alter table public.strava_inbox enable row level security;
create policy "own strava inbox select" on public.strava_inbox for select to authenticated using ((select auth.uid()) = user_id);
create policy "own strava inbox delete" on public.strava_inbox for delete to authenticated using ((select auth.uid()) = user_id);

-- Whether this account is connected, without exposing tokens to the app
create or replace function public.strava_status()
returns table (connected boolean, connected_at timestamptz, scope text)
language sql security definer set search_path = public stable as $$
  select true, c.connected_at, c.scope from public.strava_connections c where c.user_id = auth.uid()
$$;
revoke all on function public.strava_status() from public;
grant execute on function public.strava_status() to authenticated;
