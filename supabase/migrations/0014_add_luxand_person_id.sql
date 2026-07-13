alter table public.profiles add column luxand_person_id text unique;
comment on column public.profiles.luxand_person_id is
  'Luxand.cloud v2/person UUID this student''s enrolled face template is stored under. Null until face-enroll succeeds.';
