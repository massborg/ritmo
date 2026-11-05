-- Phase 1 checks, to run in the SQL editor after applying 20261106000000_phase1_avatars_and_coach_limits.sql.
-- Verifies: the avatars bucket is private; one user cannot see, add or remove another user's picture;
-- AI usage rows are private and cannot be added directly; the coach limit stops at 30 in an hour.
-- Every result should read 'ok'. Test users and rows are removed at the end.
create temp table p1(test text, result text) on commit preserve rows;
grant all on p1 to authenticated;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-a000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p1-a@ritmo.invalid','',now(),now(),now(),'{}','{}'),
       ('00000000-0000-4000-a000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p1-b@ritmo.invalid','',now(),now(),now(),'{}','{}');
insert into p1 select 'bucket is private', case when not public then 'ok' else 'FAIL' end from storage.buckets where id = 'avatars';
do $$
declare n int; ok boolean; i int;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);
  insert into storage.objects(bucket_id, name, owner_id) values ('avatars', '00000000-0000-4000-a000-0000000000a1/avatar.jpg', auth.uid()::text);
  insert into p1 values ('A adds own picture', 'ok');
  begin
    insert into storage.objects(bucket_id, name) values ('avatars', '00000000-0000-4000-a000-0000000000b2/avatar.jpg');
    insert into p1 values ('A adds picture in B folder', 'FAIL');
  exception when others then insert into p1 values ('A adds picture in B folder', 'ok'); end;
  perform public.take_coach_quota();
  begin
    insert into public.ai_usage(user_id) values (auth.uid());
    insert into p1 values ('A inserts usage directly', 'FAIL');
  exception when others then insert into p1 values ('A inserts usage directly', 'ok'); end;

  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-0000000000b2","role":"authenticated"}',true);
  select count(*) into n from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-4000-a000-0000000000a1/%';
  insert into p1 values ('B sees A picture', case when n = 0 then 'ok' else 'FAIL' end);
  begin
    delete from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-4000-a000-0000000000a1/%'; get diagnostics n = row_count;
    insert into p1 values ('B deletes A picture', case when n = 0 then 'ok' else 'FAIL' end);
  exception when others then insert into p1 values ('B deletes A picture', 'ok'); end;
  select count(*) into n from public.ai_usage;
  insert into p1 values ('B sees A usage', case when n = 0 then 'ok' else 'FAIL' end);
  for i in 1..30 loop ok := public.take_coach_quota(); end loop;
  insert into p1 values ('30 answers allowed in an hour', case when ok then 'ok' else 'FAIL' end);
  ok := public.take_coach_quota();
  insert into p1 values ('31st answer refused', case when not ok then 'ok' else 'FAIL' end);
  perform set_config('role','postgres',true);
end $$;
select * from p1;
-- newer Supabase versions block direct deletes from storage tables unless this is set for the session
select set_config('storage.allow_delete_query', 'true', false);
delete from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-4000-a000-0000000000%';
delete from auth.users where id in ('00000000-0000-4000-a000-0000000000a1','00000000-0000-4000-a000-0000000000b2');
