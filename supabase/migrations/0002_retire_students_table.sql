-- The old `students` table (face-recognition roster, no login) is superseded by
-- `profiles`. Its 2 rows are test data with no auth.users counterpart, so there's
-- nothing meaningful to auto-migrate. Rename and lock down rather than drop, so the
-- historical usn -> faces/<usn>/ mapping stays available for reference if ever needed.
alter table public.students rename to students_legacy;

drop policy if exists "allow all" on public.students_legacy;

create policy "students_legacy_admin_read" on public.students_legacy
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

comment on table public.students_legacy is
  'Retired pre-RBAC roster. Superseded by profiles. To link a real legacy student to a login, create their auth.users/profiles row with the same usn so python-face-api/faces/<usn>/ keeps resolving without moving files.';
