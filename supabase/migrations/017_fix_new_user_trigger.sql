-- Fix "add staff" and café sign-up (broken since 013).
-- Supabase Auth first inserts the new user WITHOUT the custom app_metadata and only adds
-- business_id/role in a second UPDATE. The old trigger raised 'business_required' on the INSERT,
-- which aborted the whole creation. Now: create the profile as soon as business_id appears
-- (on insert or on that follow-up update). A user without business_id simply gets no profile
-- (and so no access), which keeps the café/role safe: only the server can set app_metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare b uuid := nullif(new.raw_app_meta_data->>'business_id','')::uuid;
begin
  if b is null then return new; end if;
  insert into profiles (id, full_name, role, business_id)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
          case when new.raw_app_meta_data->>'role' = 'admin' then 'admin' else 'staff' end, b)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_meta_set on auth.users;
create trigger on_auth_user_meta_set
  after update of raw_app_meta_data on auth.users
  for each row when (new.raw_app_meta_data->>'business_id' is not null
                     and old.raw_app_meta_data->>'business_id' is distinct from new.raw_app_meta_data->>'business_id')
  execute function public.handle_new_user();
