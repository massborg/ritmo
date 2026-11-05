-- Accounts required: per-user coach chats, consent record, and account deletion covering every table.

-- Coach conversations, private to each runner
create table public.coach_messages (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index coach_messages_user_created_idx on public.coach_messages (user_id, created_at);

alter table public.coach_messages enable row level security;
create policy "own rows select" on public.coach_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on public.coach_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows update" on public.coach_messages for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows delete" on public.coach_messages for delete to authenticated using ((select auth.uid()) = user_id);

-- Anonymous (signed-out) clients get no table access at all; RLS already blocks them, this removes the grants too.
revoke all on public.profiles, public.activities, public.races, public.plans, public.session_feedback, public.sources, public.coach_messages from anon;

-- delete_my_data now includes coach chats. It runs as the caller (security invoker), so RLS limits it to their own rows.
create or replace function public.delete_my_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.coach_messages where user_id = (select auth.uid());
  delete from public.session_feedback where user_id = (select auth.uid());
  delete from public.plans where user_id = (select auth.uid());
  delete from public.races where user_id = (select auth.uid());
  delete from public.activities where user_id = (select auth.uid());
  delete from public.sources where user_id = (select auth.uid());
  delete from public.profiles where user_id = (select auth.uid());
$$;
revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
