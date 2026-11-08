-- Push reminders: the browsers that asked for notifications, and the server's keys.
-- Everything here is reached only by the push server function (service role); the app never reads it directly.

create table if not exists public.push_subscriptions (
  endpoint     text primary key,                      -- the browser's push address (Apple, Google, Mozilla, Microsoft)
  user_id      uuid not null references auth.users (id) on delete cascade,
  p256dh       text not null,                         -- the browser's public key, for encrypting messages to it
  auth         text not null,                         -- the browser's auth secret
  tz           text not null default 'UTC',           -- the device's time zone, so reminders arrive at local time
  last_morning text,                                  -- local date the morning reminder was last sent (YYYY-MM-DD)
  last_evening text,                                  -- local date the evening check-in was last sent
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- One row: the server's VAPID key pair (made by the function on first use) and the scheduler's token
create table if not exists public.push_config (
  id            int primary key default 1 check (id = 1),
  vapid_public  text,
  vapid_private text,
  cron_token    text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- Every 15 minutes, ask the push function to send whatever is due (each runner's own local time)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('push-reminders') where exists (select 1 from cron.job where jobname = 'push-reminders');
select cron.schedule('push-reminders', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://gujuzacfqxbwfpprkgrx.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ritmo-cron', (select cron_token from public.push_config where id = 1)),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
