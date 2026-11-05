-- Phase 1: private profile pictures and a usage limit for the AI coach.
-- NOT YET APPLIED. Review, then apply with approval.

-- ---------- Profile pictures ----------
-- Private bucket: files are only reachable with a short-lived signed link created by the owner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Each person can only read, add, change and delete files in their own folder: avatars/<their user id>/...
create policy "avatars own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- AI coach usage limit ----------
-- One row per AI answer. People can see their own usage but cannot add or remove rows directly.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index ai_usage_user_at on public.ai_usage (user_id, at desc);
alter table public.ai_usage enable row level security;
create policy "own rows select" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

-- Takes one unit of the caller's quota if they are under the limits. Limits are fixed here so the app cannot change them.
create or replace function public.take_coach_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  last_hour int;
  last_day int;
begin
  if me is null then return false; end if;
  select count(*) filter (where at > now() - interval '1 hour'), count(*)
    into last_hour, last_day
    from public.ai_usage where user_id = me and at > now() - interval '1 day';
  if last_hour >= 30 or last_day >= 100 then return false; end if;
  insert into public.ai_usage (user_id) values (me);
  -- keep the table small: usage older than two days is not needed
  delete from public.ai_usage where user_id = me and at < now() - interval '2 days';
  return true;
end;
$$;
revoke all on function public.take_coach_quota() from public, anon;
grant execute on function public.take_coach_quota() to authenticated;
-- AI usage rows are removed with the account (on delete cascade) and expire after two days.
