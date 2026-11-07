-- Garmin Connect (Activity API, push). Built ahead of Garmin's approval and switched on per account with the
-- 'garmin' feature flag. Additive only.

-- Allow the new flag
alter table public.feature_flags drop constraint if exists feature_flags_flag_check;
alter table public.feature_flags add constraint feature_flags_flag_check
  check (flag in ('run_tab', 'hub', 'share_cards', 'body', 'garmin'));

-- One Garmin connection per Ritmo account. Tokens are server-only: row-level security is on and there are no
-- policies, so only the service role (edge functions) can read or write this table.
create table if not exists public.garmin_connections (
  user_id uuid primary key references auth.users on delete cascade,
  garmin_user_id text not null unique,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  permissions text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.garmin_connections enable row level security;

-- Short-lived PKCE state while the runner is on Garmin's consent page. Server-only.
create table if not exists public.garmin_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now()
);
alter table public.garmin_oauth_states enable row level security;

-- Activities pushed by Garmin, waiting to be turned into Ritmo runs by the runner's app. The runner can read and
-- delete only their own rows; only the webhook (service role) inserts.
create table if not exists public.garmin_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  summary_id text not null,
  kind text not null check (kind in ('summary', 'details')),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (user_id, summary_id, kind)
);
create index if not exists garmin_inbox_user_idx on public.garmin_inbox (user_id, received_at);
alter table public.garmin_inbox enable row level security;
create policy "own garmin inbox select" on public.garmin_inbox for select to authenticated using ((select auth.uid()) = user_id);
create policy "own garmin inbox delete" on public.garmin_inbox for delete to authenticated using ((select auth.uid()) = user_id);

-- Whether this account is connected, without exposing tokens to the app
create or replace function public.garmin_status()
returns table (connected boolean, connected_at timestamptz, permissions text[])
language sql security definer set search_path = public stable as $$
  select true, c.connected_at, c.permissions from public.garmin_connections c where c.user_id = auth.uid()
$$;
revoke all on function public.garmin_status() from public;
grant execute on function public.garmin_status() to authenticated;
