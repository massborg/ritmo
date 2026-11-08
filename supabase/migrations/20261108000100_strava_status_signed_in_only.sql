-- strava_status() is for signed-in runners only (it answers for the caller's own account). Supabase grants EXECUTE
-- to anon by default; the security advisor flagged it after 20261108000000_strava_connect.sql. Already applied.
revoke execute on function public.strava_status() from anon;
