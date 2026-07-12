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

-- No write policy for anyone: written only by the zoom-register-participant Edge
-- Function (service role), which is what actually calls Zoom's registrants API.
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

-- Derived summary row per (lecture, student) -- there can be more than one join/leave
-- per student per lecture (rejoins), so this holds first/last timestamps and an
-- accumulated duration, not "the" join time and "the" leave time.
create table public.lecture_attendance (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'attended', 'no_show')),
  first_joined_at timestamptz,
  last_joined_at timestamptz,
  last_left_at timestamptz,
  total_duration_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (lecture_id, student_id)
);

create trigger lecture_attendance_set_updated_at
  before update on public.lecture_attendance
  for each row execute function public.set_updated_at();

alter table public.lecture_attendance enable row level security;

-- No write policy for anyone: written by zoom-register-participant (initial
-- 'registered' row) and zoom-webhook (join/leave updates), both service role.
create policy "lecture_attendance_select_own" on public.lecture_attendance
  for select using (student_id = auth.uid());

create policy "lecture_attendance_select_facilitator" on public.lecture_attendance
  for select using (
    exists (
      select 1 from public.lectures l
      where l.id = lecture_attendance.lecture_id and l.facilitator_id = auth.uid()
    )
  );

create policy "lecture_attendance_select_admin" on public.lecture_attendance
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Append-only raw webhook log (audit trail behind the derived lecture_attendance
-- summary above). Not shown to students -- raw payloads aren't meaningful to them.
create table public.lecture_attendance_events (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('joined', 'left')),
  event_time timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.lecture_attendance_events enable row level security;

create policy "lecture_attendance_events_select_facilitator" on public.lecture_attendance_events
  for select using (
    exists (
      select 1 from public.lectures l
      where l.id = lecture_attendance_events.lecture_id and l.facilitator_id = auth.uid()
    )
  );

create policy "lecture_attendance_events_select_admin" on public.lecture_attendance_events
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
