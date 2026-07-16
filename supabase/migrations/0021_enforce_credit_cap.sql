-- The credit-unit cap (app_settings.max_credit_units) was previously enforced
-- only client-side in Onboarding.jsx and student/MyCourses.jsx -- a student
-- could bypass the UI and insert an over-cap enrollment directly, since
-- enrollments_student_own already grants students insert rights on their own
-- rows. This closes that gap at the database level.
create or replace function public.enforce_credit_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  course_units integer;
  existing_units integer;
begin
  select value::integer into cap from public.app_settings where key = 'max_credit_units';
  if cap is null then
    return new;
  end if;

  select credit_units into course_units from public.courses where id = new.course_id;
  course_units := coalesce(course_units, 0);

  -- Row-level BEFORE INSERT triggers see prior rows of the same multi-row
  -- INSERT statement (e.g. the batched inserts from Onboarding/MyCourses), so
  -- this correctly accumulates across a single "enroll in N courses" submit.
  select coalesce(sum(c.credit_units), 0) into existing_units
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  where e.student_id = new.student_id
    and e.academic_session = new.academic_session;

  if existing_units + course_units > cap then
    raise exception 'credit_cap_exceeded: enrolling in this course brings your total to % units, exceeding the %-unit semester maximum', existing_units + course_units, cap;
  end if;

  return new;
end;
$$;

create trigger enrollments_enforce_credit_cap
  before insert on public.enrollments
  for each row execute function public.enforce_credit_cap();

-- Zero-argument trigger function -- PostgREST would otherwise auto-expose it
-- as a public RPC endpoint (same reasoning as migration 0007).
revoke execute on function public.enforce_credit_cap() from anon, authenticated;
