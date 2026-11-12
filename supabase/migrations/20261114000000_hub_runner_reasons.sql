-- Find runners: why a runner is suggested (update 2, §10). For a list of runners, as seen by the signed-in runner:
-- - mutuals: how many runners you follow also follow them (counting only runners with a public Hub profile, so no
--   one's private follows are revealed), and the most recent one, for "Followed by Ana" or "2 mutual followers"
-- - race_name / race_date: an upcoming race you both have (same date, same distance within 3%), shown with YOUR name
--   for it ("Also racing Safi 5K · 6 Dec"); only for runners whose Hub profile is public. Their race list itself
--   stays private.
-- Blocked runners in either direction get nothing.
create or replace function public.hub_runner_reasons(targets uuid[])
returns table (user_id uuid, mutuals integer, followed_by uuid, race_name text, race_date text)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  mine as (
    select f.followee_id as id from public.follows f, me
    where f.follower_id = me.id and f.status = 'accepted'
      and exists (select 1 from public.hub_profiles h where h.user_id = f.followee_id and h.private = false)
  ),
  t as (select distinct unnest(targets[1:60]) as id)
  select t.id,
    (select count(*)::int from public.follows f where f.followee_id = t.id and f.status = 'accepted' and f.follower_id in (select id from mine)),
    (select f.follower_id from public.follows f where f.followee_id = t.id and f.status = 'accepted' and f.follower_id in (select id from mine) order by f.created_at desc limit 1),
    rr.name, rr.date
  from t
  left join lateral (
    select r1.data->>'name' as name, r1.data->>'date' as date
    from public.races r1
    join public.races r2 on r2.user_id = t.id and r2.data->>'date' = r1.data->>'date'
    where r1.user_id = (select id from me)
      and r1.data->>'date' >= to_char(now(), 'YYYY-MM-DD')
      and abs(coalesce((r1.data->>'distanceM')::numeric, 0) - coalesce((r2.data->>'distanceM')::numeric, 0)) <= greatest(coalesce((r1.data->>'distanceM')::numeric, 0) * 0.03, 50)
      and exists (select 1 from public.hub_profiles h where h.user_id = t.id and h.private = false)
    order by r1.data->>'date'
    limit 1
  ) rr on true
  where t.id <> (select id from me)
    and not public.is_blocked_between(t.id, (select id from me));
$$;
revoke execute on function public.hub_runner_reasons(uuid[]) from public, anon;
grant execute on function public.hub_runner_reasons(uuid[]) to authenticated;
