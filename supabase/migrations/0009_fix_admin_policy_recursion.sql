-- Bug: every "admin" RLS policy so far used
--   exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
-- On the profiles table itself this is self-referential: evaluating
-- profiles_admin_all requires re-evaluating profiles' own RLS (including
-- profiles_admin_all again) for the subquery -- Postgres's recursion guard
-- trips and every query against profiles fails with a 500. This function
-- breaks the cycle: SECURITY DEFINER bypasses RLS for its own internal lookup.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

revoke execute on function public.is_admin() from anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- profiles (the one actually causing the recursion)
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- Every other "admin" policy queried profiles from a different table, so these
-- weren't recursive, but switch them to the same safe helper for consistency
-- and to remove any doubt.
drop policy if exists "students_legacy_admin_read" on public.students_legacy;
create policy "students_legacy_admin_read" on public.students_legacy
  for select using (public.is_admin());

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write" on public.courses
  for all using (public.is_admin());

drop policy if exists "lecturer_courses_admin_all" on public.lecturer_courses;
create policy "lecturer_courses_admin_all" on public.lecturer_courses
  for all using (public.is_admin());

drop policy if exists "enrollments_admin_all" on public.enrollments;
create policy "enrollments_admin_all" on public.enrollments
  for all using (public.is_admin());

drop policy if exists "lectures_select_admin" on public.lectures;
create policy "lectures_select_admin" on public.lectures
  for select using (public.is_admin());

drop policy if exists "lecture_host_secrets_select_admin" on public.lecture_host_secrets;
create policy "lecture_host_secrets_select_admin" on public.lecture_host_secrets
  for select using (public.is_admin());

drop policy if exists "lecture_registrations_select_admin" on public.lecture_registrations;
create policy "lecture_registrations_select_admin" on public.lecture_registrations
  for select using (public.is_admin());

drop policy if exists "lecture_attendance_select_admin" on public.lecture_attendance;
create policy "lecture_attendance_select_admin" on public.lecture_attendance
  for select using (public.is_admin());

drop policy if exists "lecture_attendance_events_select_admin" on public.lecture_attendance_events;
create policy "lecture_attendance_events_select_admin" on public.lecture_attendance_events
  for select using (public.is_admin());

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
  for all using (public.is_admin());
