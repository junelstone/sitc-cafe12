-- Trigger-only functions must not be callable through the API.
revoke all on function public._number_sale() from public, anon, authenticated;
revoke all on function public._number_job() from public, anon, authenticated;
revoke all on function public._stations_limit() from public, anon, authenticated;

-- Café and role come from app_metadata, which only the server (service key) can set.
-- user_metadata can be chosen by anyone calling the public sign-up endpoint.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare b uuid := nullif(new.raw_app_meta_data->>'business_id','')::uuid;
begin
  if b is null then raise exception 'business_required'; end if;
  insert into profiles (id, full_name, role, business_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when new.raw_app_meta_data->>'role' = 'admin' then 'admin' else 'staff' end, b);
  return new;
end $$;
