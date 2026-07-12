create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  facilitator_id uuid references public.profiles(id),
  topic text not null,
  venue text,
  meeting_platform text not null default 'zoom',
  zoom_meeting_id text,
  meeting_web_url text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'rescheduled', 'completed')),
  cancel_reason text,
  rescheduled_from timestamptz,
  semester text not null,
  academic_session text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lectures_set_updated_at
  before update on public.lectures
  for each row execute function public.set_updated_at();

alter table public.lectures enable row level security;

-- Deliberately no INSERT/UPDATE/DELETE policy for any role: a lecture row must
-- never exist without (or drift from) its real backing Zoom meeting, so all writes
-- go through the zoom-create-meeting / zoom-update-meeting Edge Functions using the
-- service-role connection, which bypasses RLS entirely.
create policy "lectures_select_admin" on public.lectures
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "lectures_select_facilitator" on public.lectures
  for select using (facilitator_id = auth.uid());

create policy "lectures_select_enrolled_student" on public.lectures
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.student_id = auth.uid()
        and e.course_id = lectures.course_id
        and e.academic_session = lectures.academic_session
    )
  );

-- Kept off `lectures` itself so a careless `select *` from student-facing code can
-- never leak the host-start link (which would let a student start the meeting as host).
create table public.lecture_host_secrets (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  meeting_start_url text not null
);

alter table public.lecture_host_secrets enable row level security;

-- Students get no policy on this table at all (default deny), including no SELECT.
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
