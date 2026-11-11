-- Update 2, §7 and §10: profile photos on the Hub, and finding runners by name.
-- - hub_profiles.photo_path: the small (128 px) copy of the runner's photo, "<uid>/avatar-small.jpg"
-- - hub_profiles.photo_visibility: who can see the photo (Everyone by default, Followers, Only me)
-- - hub_profiles.search_name: the name in lower case without accents, so "zammit" finds "Żammit"
-- - other signed-in runners may read only the profile photo files (never shoe photos or anything else in the
--   bucket), and only when the owner's setting allows it and neither has blocked the other.

alter table public.hub_profiles
  add column if not exists photo_path text,
  add column if not exists photo_visibility text not null default 'everyone',
  add column if not exists search_name text;

do $$ begin
  alter table public.hub_profiles add constraint hub_profiles_photo_visibility_check check (photo_visibility in ('everyone', 'followers', 'only_me'));
exception when duplicate_object then null; end $$;

-- Existing rows: lower case for now; each runner's app adds the accent-free form the next time it opens the Hub
update public.hub_profiles set search_name = lower(display_name) where search_name is null;
create index if not exists hub_profiles_search_name_idx on public.hub_profiles (search_name);

-- Whether the signed-in runner may see this owner's profile photo
create or replace function public.can_see_avatar(owner_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner_folder = (select auth.uid())::text
    or exists (
      select 1 from public.hub_profiles h
      where h.user_id::text = owner_folder
        and not public.is_blocked_between(h.user_id, (select auth.uid()))
        and (h.photo_visibility = 'everyone'
          or (h.photo_visibility = 'followers' and exists (
            select 1 from public.follows f
            where f.follower_id = (select auth.uid()) and f.followee_id = h.user_id and f.status = 'accepted')))
    );
$$;
revoke execute on function public.can_see_avatar(text) from public, anon;
grant execute on function public.can_see_avatar(text) to authenticated;

drop policy if exists "avatars visible to others" on storage.objects;
create policy "avatars visible to others" on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and storage.filename(name) in ('avatar.jpg', 'avatar-small.jpg')
    and public.can_see_avatar((storage.foldername(name))[1])
  );
