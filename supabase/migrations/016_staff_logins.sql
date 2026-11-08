-- Staff page: show each person's login email, and let the café admin set a new password for staff.
create or replace function public.staff_logins()
returns table (id uuid, email text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text from auth.users u join public.profiles p on p.id = u.id
  where public.is_admin() and p.business_id = public.my_business()
$$;

create or replace function public.reset_staff_password(p_staff uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_password is null or length(p_password) < 8 then raise exception 'invalid_input'; end if;
  if not exists (select 1 from public.profiles where id = p_staff and business_id = public.my_business())
    then raise exception 'admin_only'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_staff;
end $$;

revoke all on function public.staff_logins() from public, anon;
revoke all on function public.reset_staff_password(uuid, text) from public, anon;
grant execute on function public.staff_logins() to authenticated;
grant execute on function public.reset_staff_password(uuid, text) to authenticated;
