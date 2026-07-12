alter table public.profiles add column department text;
alter table public.profiles add column programme text;
alter table public.profiles add column faculty text;

-- Extend auto-provisioning to capture the new stepped-signup fields.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_role text;
begin
  signup_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  if signup_role not in ('lecturer', 'student') then
    signup_role := 'student';
  end if;

  insert into public.profiles (id, email, full_name, role, status, matric_number, department, programme, faculty)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    signup_role,
    case when signup_role = 'lecturer' then 'pending' else 'active' end,
    nullif(new.raw_user_meta_data->>'matric_number', ''),
    nullif(new.raw_user_meta_data->>'department', ''),
    nullif(new.raw_user_meta_data->>'programme', ''),
    nullif(new.raw_user_meta_data->>'faculty', '')
  );
  return new;
end;
$$;
