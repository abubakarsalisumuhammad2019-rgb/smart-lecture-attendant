-- Resets the database to a clean slate: every admin account and app_settings
-- row is kept, everything else (courses, lecturers, students, lectures,
-- enrollments, attendance) is deleted. Safe to re-run.
--
-- Run this in the Supabase dashboard's SQL Editor (Project -> SQL Editor ->
-- New query -> paste this file's contents -> Run). It runs as one
-- transaction, so if anything fails partway through, nothing is deleted.
--
-- app_settings is intentionally left untouched, it holds configuration
-- (active academic session, join window, minimum attendance duration, etc.)
-- that should survive a data reset.

begin;

delete from public.lecture_attendance_events;
delete from public.lecture_attendance;
delete from public.lectures;
delete from public.enrollments;
delete from public.lecturer_courses;
delete from public.courses;
delete from public.students_legacy;

-- Order matters: profiles first, then the auth.users rows they point to.
delete from public.profiles where role <> 'admin';
delete from auth.users where email not in (
  select email from public.profiles where role = 'admin'
);

commit;

-- Verify: this should show 0 for every row except profiles/auth.users
-- (one row per admin account) and app_settings (untouched).
select
  (select count(*) from public.courses) as courses,
  (select count(*) from public.lectures) as lectures,
  (select count(*) from public.enrollments) as enrollments,
  (select count(*) from public.lecturer_courses) as lecturer_courses,
  (select count(*) from public.lecture_attendance) as lecture_attendance,
  (select count(*) from public.profiles) as remaining_profiles,
  (select count(*) from public.profiles where role = 'admin') as admin_profiles,
  (select count(*) from public.app_settings) as app_settings_untouched;
