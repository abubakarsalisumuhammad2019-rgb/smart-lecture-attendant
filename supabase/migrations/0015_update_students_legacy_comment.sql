-- python-face-api/faces/<usn>/ no longer exists -- face recognition moved to
-- Luxand.cloud (see profiles.luxand_person_id, supabase/LUXAND_SETUP.md).
-- Correcting the stale path reference left in 0002's table comment.
comment on table public.students_legacy is
  'Retired pre-RBAC roster. Superseded by profiles. To link a real legacy student to a login, create their auth.users/profiles row with the same usn, then re-enroll their face via face-enroll (Luxand.cloud).';
