-- Phase 1 of review #2 (applied 6 Nov 2026). Additive only.
-- Restore point before the run-loading changes. Only the service role can read it.
create table if not exists public.activities_backup_20261106 as select * from public.activities;
alter table public.activities_backup_20261106 enable row level security;
revoke all on public.activities_backup_20261106 from anon, authenticated;

-- derived: small per-run summary (best efforts, structure, heart-rate bands) so the app never needs streams
-- for the history. updated_at: lets the app fetch only rows changed since its last sync.
alter table public.activities add column if not exists derived jsonb;
alter table public.activities add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists activities_touch on public.activities;
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();
create index if not exists activities_user_start_idx on public.activities (user_id, start_time desc);
create index if not exists activities_user_updated_idx on public.activities (user_id, updated_at);

-- Deleted runs, so devices drop them on incremental sync
create table if not exists public.activity_deletions (user_id uuid not null references auth.users on delete cascade, id text not null, deleted_at timestamptz not null default now(), primary key (user_id, id));
alter table public.activity_deletions enable row level security;
create policy "own deletions select" on public.activity_deletions for select using (auth.uid() = user_id);
create or replace function public.log_activity_deletion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- When the whole account is being deleted the user row is already gone: log nothing.
  if not exists (select 1 from auth.users where id = old.user_id) then return old; end if;
  insert into public.activity_deletions (user_id, id) values (old.user_id, old.id) on conflict (user_id, id) do update set deleted_at = now();
  return old;
end $$;
revoke execute on function public.log_activity_deletion() from public, anon, authenticated;
drop trigger if exists activities_log_delete on public.activities;
create trigger activities_log_delete after delete on public.activities for each row execute function public.log_activity_deletion();
