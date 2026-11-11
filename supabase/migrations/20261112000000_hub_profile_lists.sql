-- Update 2, §12–§14: a Hub profile for every runner, their follower lists and the PBs they choose to show.
-- - hub_profiles.area: optional area shown under the name ("Sliema")
-- - hub_profiles.stats: what the runner's app publishes for the profile ({ runs, weekStreak, updatedAt }), never from
--   Strava runs (Strava's rules allow showing Strava data only to the runner)
-- - hub_profiles.pbs: the PBs the runner chose to show (off by default; null when hidden)
-- - hub_counts(): followers, following, requests (own profile only) and Fuego received, for any runner
-- - hub_follow_list(): a runner's followers or following, only when their privacy allows the viewer to see them
-- Follow rows themselves stay readable only by the two runners involved.

alter table public.hub_profiles
  add column if not exists area text,
  add column if not exists stats jsonb not null default '{}'::jsonb,
  add column if not exists pbs jsonb;

do $$ begin
  alter table public.hub_profiles add constraint hub_profiles_area_len check (area is null or char_length(area) <= 60);
exception when duplicate_object then null; end $$;

-- Whether the signed-in runner may see this runner's lists and runs: themselves, a public profile, or an accepted
-- follower; never across a block
create or replace function public.can_see_runner(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target = (select auth.uid())
    or (not public.is_blocked_between(target, (select auth.uid()))
      and (coalesce((select not h.private from public.hub_profiles h where h.user_id = target), false)
        or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = target and f.status = 'accepted')));
$$;

create or replace function public.hub_counts(target uuid)
returns table (followers integer, following integer, requests integer, fuego integer)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.follows f where f.followee_id = target and f.status = 'accepted'),
    (select count(*)::int from public.follows f where f.follower_id = target and f.status = 'accepted'),
    case when target = (select auth.uid()) then (select count(*)::int from public.follows f where f.followee_id = target and f.status = 'pending') else 0 end,
    (select coalesce(sum(p.ritmo_count), 0)::int from public.posts p where p.user_id = target)
  where not public.is_blocked_between(target, (select auth.uid()));
$$;

create or replace function public.hub_follow_list(target uuid, which text)
returns table (user_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select case when which = 'followers' then f.follower_id else f.followee_id end, f.created_at
  from public.follows f
  where public.can_see_runner(target)
    and f.status = 'accepted'
    and ((which = 'followers' and f.followee_id = target) or (which = 'following' and f.follower_id = target))
    and not public.is_blocked_between(case when which = 'followers' then f.follower_id else f.followee_id end, (select auth.uid()))
  order by f.created_at desc
  limit 500;
$$;

revoke execute on function public.can_see_runner(uuid) from public, anon;
revoke execute on function public.hub_counts(uuid) from public, anon;
revoke execute on function public.hub_follow_list(uuid, text) from public, anon;
grant execute on function public.can_see_runner(uuid) to authenticated;
grant execute on function public.hub_counts(uuid) to authenticated;
grant execute on function public.hub_follow_list(uuid, text) to authenticated;
