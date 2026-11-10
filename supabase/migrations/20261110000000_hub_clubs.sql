-- Hub clubs (brief §9.4). Additive only: four new tables, three helper functions and a leaderboard function.
-- Not applied until approved.
--
-- Rules (row-level security):
-- - Anyone signed in can find a club (name, area, about, member count).
-- - Members, group runs, who is going and the leaderboard are visible to club members only.
-- - Anyone can join a club as a member. Nobody can make themselves an admin; the club's creator is its first admin.
-- - Only admins create, edit and delete group runs. Admins can remove members.
-- - The leaderboard lists only members who chose to be on it (asked when they join), never counts Strava runs,
--   and skips runners either side has blocked. It only looks back up to 35 days.

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  area text check (char_length(area) <= 60),
  about text check (char_length(about) <= 500),
  created_by uuid not null references auth.users (id) on delete cascade,
  member_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index clubs_name_idx on public.clubs (lower(name));

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  on_leaderboard boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

create table public.group_runs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  starts_at timestamptz not null,
  meeting_point text check (char_length(meeting_point) <= 120),
  distance_m integer check (distance_m between 0 and 100000),
  pace_group text check (char_length(pace_group) <= 40),
  created_by uuid references auth.users (id) on delete set null,
  going_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index group_runs_club_idx on public.group_runs (club_id, starts_at);

create table public.group_run_going (
  group_run_id uuid not null references public.group_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_run_id, user_id)
);

-- Helpers (security definer so policies can ask without recursing into club_members' own policy)
create or replace function public.is_club_member(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members where club_id = c and user_id = u);
$$;
create or replace function public.is_club_admin(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members where club_id = c and user_id = u and role = 'admin');
$$;
create or replace function public.group_run_club(g uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select club_id from public.group_runs where id = g;
$$;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.group_runs enable row level security;
alter table public.group_run_going enable row level security;

create policy "clubs findable" on public.clubs for select to authenticated using (true);
create policy "start a club" on public.clubs for insert to authenticated with check (created_by = (select auth.uid()));
create policy "admins edit club" on public.clubs for update to authenticated using (public.is_club_admin(id, (select auth.uid()))) with check (public.is_club_admin(id, (select auth.uid())));
create policy "admins delete club" on public.clubs for delete to authenticated using (public.is_club_admin(id, (select auth.uid())));

create policy "members see members" on public.club_members for select to authenticated using (user_id = (select auth.uid()) or public.is_club_member(club_id, (select auth.uid())));
create policy "join as member" on public.club_members for insert to authenticated with check (user_id = (select auth.uid()) and role = 'member');
create policy "my leaderboard choice" on public.club_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "leave or remove" on public.club_members for delete to authenticated using (user_id = (select auth.uid()) or public.is_club_admin(club_id, (select auth.uid())));
-- Members may only change their leaderboard choice, never their role
revoke update on public.club_members from authenticated, anon;
grant update (on_leaderboard) on public.club_members to authenticated;
-- Counts are kept by triggers only
revoke update on public.clubs from authenticated, anon;
grant update (name, area, about) on public.clubs to authenticated;
revoke update on public.group_runs from authenticated, anon;
grant update (title, starts_at, meeting_point, distance_m, pace_group) on public.group_runs to authenticated;

create policy "members see group runs" on public.group_runs for select to authenticated using (public.is_club_member(club_id, (select auth.uid())));
create policy "admins add group runs" on public.group_runs for insert to authenticated with check (created_by = (select auth.uid()) and public.is_club_admin(club_id, (select auth.uid())));
create policy "admins edit group runs" on public.group_runs for update to authenticated using (public.is_club_admin(club_id, (select auth.uid()))) with check (public.is_club_admin(club_id, (select auth.uid())));
create policy "admins delete group runs" on public.group_runs for delete to authenticated using (public.is_club_admin(club_id, (select auth.uid())));

create policy "members see who is going" on public.group_run_going for select to authenticated using (public.is_club_member(public.group_run_club(group_run_id), (select auth.uid())));
create policy "say I am going" on public.group_run_going for insert to authenticated with check (user_id = (select auth.uid()) and public.is_club_member(public.group_run_club(group_run_id), (select auth.uid())));
create policy "not going after all" on public.group_run_going for delete to authenticated using (user_id = (select auth.uid()));

-- The creator becomes the first admin
create or replace function public.club_add_creator() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.club_members (club_id, user_id, role, on_leaderboard) values (new.id, new.created_by, 'admin', true);
  return new;
end $$;
create trigger club_add_creator after insert on public.clubs for each row execute function public.club_add_creator();

-- Member and going counts
create or replace function public.club_member_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.clubs set member_count = (select count(*) from public.club_members where club_id = coalesce(new.club_id, old.club_id)) where id = coalesce(new.club_id, old.club_id);
  return null;
end $$;
create trigger club_member_count after insert or delete on public.club_members for each row execute function public.club_member_count();

create or replace function public.group_run_going_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.group_runs set going_count = (select count(*) from public.group_run_going where group_run_id = coalesce(new.group_run_id, old.group_run_id)) where id = coalesce(new.group_run_id, old.group_run_id);
  return null;
end $$;
create trigger group_run_going_count after insert or delete on public.group_run_going for each row execute function public.group_run_going_count();

-- Leaderboard: distance per member since a date, members only
create or replace function public.club_leaderboard(c uuid, since timestamptz)
returns table (user_id uuid, display_name text, distance_m double precision, runs integer)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(h.display_name, 'Runner'), coalesce(sum(a.distance_m), 0)::double precision, count(a.id)::integer
  from public.club_members m
  left join public.hub_profiles h on h.user_id = m.user_id
  left join public.activities a on a.user_id = m.user_id
    and a.start_time >= greatest(since, now() - interval '35 days')
    and a.source not in ('strava', 'sample')
  where m.club_id = c
    and m.on_leaderboard
    and public.is_club_member(c, auth.uid())
    and not public.is_blocked_between(m.user_id, auth.uid())
  group by m.user_id, h.display_name
  order by 3 desc
  limit 50;
$$;
revoke execute on function public.club_leaderboard(uuid, timestamptz) from anon, public;
grant execute on function public.club_leaderboard(uuid, timestamptz) to authenticated;
revoke execute on function public.is_club_member(uuid, uuid), public.is_club_admin(uuid, uuid), public.group_run_club(uuid) from anon, public;
grant execute on function public.is_club_member(uuid, uuid), public.is_club_admin(uuid, uuid), public.group_run_club(uuid) to authenticated;
