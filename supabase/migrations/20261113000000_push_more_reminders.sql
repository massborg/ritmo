-- Update 2, §15: more reminder types.
-- - push_subscriptions.sent: what this device was already sent and when (local dates), so each reminder goes once:
--   { training: "2026-11-12", noRun: "<date of the last run>", race: ["<race id>:7", ...], weekly: "2026-11-15",
--     feel: ["<run id>", ...], shoes: ["<shoe id>", ...] }
-- - notifications.pushed_at: when a Hub notification (follow request, new follower, Fuego, comment) was pushed, so
--   each is pushed once, and only those that arrive after this change
alter table public.push_subscriptions add column if not exists sent jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists pushed_at timestamptz;
update public.notifications set pushed_at = coalesce(read_at, created_at) where pushed_at is null;
create index if not exists notifications_unpushed_idx on public.notifications (user_id) where pushed_at is null;
