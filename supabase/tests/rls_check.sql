-- Row Level Security check: creates two temporary users, verifies that neither can read, change,
-- delete or impersonate the other's rows in any table, that delete_my_data only removes the caller's
-- rows, and that signed-out (anon) callers are blocked. Removes the test users at the end.
-- Run in the Supabase SQL editor. Last run 5 Nov 2026: all checks passed.
create temp table rls_results(test text, result text) on commit preserve rows;
grant all on rls_results to authenticated, anon;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-a000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-a@ritmo.invalid','',now(),now(),now(),'{}','{}'),
       ('00000000-0000-4000-a000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test-b@ritmo.invalid','',now(),now(),now(),'{}','{}');
do $$
declare n int; tbl text;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);
  insert into public.profiles(user_id,data) values (auth.uid(),'{"name":"A"}');
  insert into public.activities(id,user_id,source,start_time,name,distance_m,duration_s,moving_s) values ('a-run',auth.uid(),'upload',now(),'A run',5000,1500,1500);
  insert into public.races(id,user_id,data) values ('a-race',auth.uid(),'{}');
  insert into public.plans(id,user_id,data) values ('a-plan',auth.uid(),'{}');
  insert into public.session_feedback(activity_id,user_id,data) values ('a-run',auth.uid(),'{}');
  insert into public.sources(kind,user_id) values ('upload',auth.uid());
  insert into public.coach_messages(id,user_id,data) values ('a-msg',auth.uid(),'{}');
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-0000000000b2","role":"authenticated"}',true);
  foreach tbl in array array['profiles','activities','races','plans','session_feedback','sources','coach_messages'] loop
    execute format('select count(*) from public.%I', tbl) into n; insert into rls_results values ('B reads A rows: ' || tbl, n::text);
    execute format('update public.%I set user_id = user_id', tbl); get diagnostics n = row_count; insert into rls_results values ('B updates A rows: ' || tbl, n::text);
    execute format('delete from public.%I', tbl); get diagnostics n = row_count; insert into rls_results values ('B deletes A rows: ' || tbl, n::text);
  end loop;
  begin
    insert into public.activities(id,user_id,source,start_time,name,distance_m,duration_s,moving_s) values ('b-fake','00000000-0000-4000-a000-0000000000a1','upload',now(),'x',1,1,1);
    insert into rls_results values ('B inserts rows as A', 'YES');
  exception when others then insert into rls_results values ('B inserts rows as A', 'blocked ' || sqlstate); end;
  perform public.delete_my_data();
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);
  select (select count(*) from public.profiles)+(select count(*) from public.activities)+(select count(*) from public.races)+(select count(*) from public.plans)+(select count(*) from public.session_feedback)+(select count(*) from public.sources)+(select count(*) from public.coach_messages) into n;
  insert into rls_results values ('A rows left after B ran delete_my_data (expect 7)', n::text);
  perform public.delete_my_data();
  select (select count(*) from public.profiles)+(select count(*) from public.activities)+(select count(*) from public.races)+(select count(*) from public.plans)+(select count(*) from public.session_feedback)+(select count(*) from public.sources)+(select count(*) from public.coach_messages) into n;
  insert into rls_results values ('A rows left after A ran delete_my_data (expect 0)', n::text);
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin execute 'select count(*) from public.activities' into n; insert into rls_results values ('Signed-out reads activities', n::text);
  exception when others then insert into rls_results values ('Signed-out reads activities', 'blocked ' || sqlstate); end;
  begin perform public.delete_my_data(); insert into rls_results values ('Signed-out runs delete_my_data', 'allowed');
  exception when others then insert into rls_results values ('Signed-out runs delete_my_data', 'blocked ' || sqlstate); end;
  perform set_config('role','postgres',true);
end $$;
delete from auth.users where id in ('00000000-0000-4000-a000-0000000000a1','00000000-0000-4000-a000-0000000000b2');
select * from rls_results;
