-- Review #2 phase 3 (applied 6 Nov 2026). Additive only.
-- Features shipped behind flags. Each person can read only their own flags; only the service role or a
-- migration can grant them.
create table if not exists public.feature_flags (
  user_id uuid not null references auth.users on delete cascade,
  flag text not null check (flag in ('run_tab', 'hub', 'share_cards', 'body')),
  created_at timestamptz not null default now(),
  primary key (user_id, flag)
);
alter table public.feature_flags enable row level security;
create policy "own flags select" on public.feature_flags for select using (auth.uid() = user_id);
-- On for Ryan's account only, until he has reviewed them
insert into public.feature_flags (user_id, flag)
select 'c53c660e-f2f4-4c22-83f8-cf20a14a3e76', f from unnest(array['run_tab', 'hub', 'share_cards', 'body']) f
where exists (select 1 from auth.users where id = 'c53c660e-f2f4-4c22-83f8-cf20a14a3e76')
on conflict do nothing;

-- Run screenshots. Private: each person can only touch run-media/<their user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('run-media', 'run-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "run-media own read" on storage.objects for select to authenticated
  using (bucket_id = 'run-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "run-media own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'run-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "run-media own update" on storage.objects for update to authenticated
  using (bucket_id = 'run-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'run-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "run-media own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'run-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Screenshot reading is limited to 30 a day per person
create table if not exists public.lap_reads (id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade, at timestamptz not null default now());
alter table public.lap_reads enable row level security;
create index if not exists lap_reads_user_at on public.lap_reads (user_id, at);
create or replace function public.take_lap_read_quota() returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  select count(*) into n from public.lap_reads where user_id = auth.uid() and at > now() - interval '1 day';
  if n >= 30 then return false; end if;
  insert into public.lap_reads (user_id) values (auth.uid());
  return true;
end $$;
revoke execute on function public.take_lap_read_quota() from public, anon;
grant execute on function public.take_lap_read_quota() to authenticated;
