-- Students must register with their NOUN institutional email
-- (matric_number@noun.edu.ng). The frontend now derives this automatically
-- instead of accepting a free-typed email, but that's only a UX nicety --
-- both self-signup and admin-invited accounts ultimately insert into
-- auth.users, which fires this same trigger, so this is the actual
-- enforcement point (unbypassable via a direct API call, same reasoning as
-- the credit-cap trigger in migration 0021).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_role text;
  signup_matric text;
  expected_email text;
begin
  signup_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  if signup_role not in ('lecturer', 'student') then
    signup_role := 'student';
  end if;

  if signup_role = 'student' then
    signup_matric := nullif(trim(new.raw_user_meta_data->>'matric_number'), '');
    if signup_matric is null then
      raise exception 'matric_number_required: students must register with a matric number';
    end if;

    expected_email := lower(signup_matric) || '@noun.edu.ng';
    if lower(new.email) <> expected_email then
      raise exception 'invalid_student_email: students must register with their NOUN email (%)', expected_email;
    end if;
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
