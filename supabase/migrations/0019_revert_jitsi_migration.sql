-- Reverses 0017_jitsi_meeting_migration.sql -- restores the pre-Jitsi (Zoom)
-- schema so it matches the code as of commit 0e58a1f ("before refactoring
-- zoom to meet.jit.si"). Table/policy definitions copied verbatim from
-- 0004_lectures_and_host_secrets.sql and 0005_lecture_registrations_and_attendance.sql.

-- Any lecture currently holding a Jitsi room stops being resolvable once the
-- old Zoom-era code is running (it never reads jitsi_room_name) -- same kind
-- of deliberate reset 0017 did in the opposite direction, not something to
-- carry values out of.
update public.lectures set meeting_web_url = null where jitsi_room_name is not null;

alter table public.lectures add column zoom_meeting_id text;
alter table public.lectures drop column jitsi_room_name;
alter table public.lectures alter column meeting_platform set default 'zoom';

create table public.lecture_host_secrets (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  meeting_start_url text not null
);

alter table public.lecture_host_secrets enable row level security;

create policy "lecture_host_secrets_select_facilitator" on public.lecture_host_secrets
  for select using (
    exists (
      select 1 from public.lectures l
      where l.id = lecture_host_secrets.lecture_id and l.facilitator_id = auth.uid()
    )
  );

create policy "lecture_host_secrets_select_admin" on public.lecture_host_secrets
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table public.lecture_registrations (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  zoom_registrant_id text,
  personal_join_url text,
  face_verification_confidence numeric,
  registered_at timestamptz not null default now(),
  unique (lecture_id, student_id)
);

alter table public.lecture_registrations enable row level security;

create policy "lecture_registrations_select_own" on public.lecture_registrations
  for select using (student_id = auth.uid());

create policy "lecture_registrations_select_facilitator" on public.lecture_registrations
  for select using (
    exists (
      select 1 from public.lectures l
      where l.id = lecture_registrations.lecture_id and l.facilitator_id = auth.uid()
    )
  );

create policy "lecture_registrations_select_admin" on public.lecture_registrations
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
