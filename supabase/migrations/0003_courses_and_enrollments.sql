create table public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null,
  course_title text not null,
  credit_units integer,
  programme text,
  level integer,
  semester text not null,
  academic_session text not null,
  color_hex text not null default '#1a9a5c',
  created_at timestamptz not null default now(),
  -- Not a bare unique on course_code: the same code recurs every semester/session.
  unique (course_code, academic_session, semester)
);

alter table public.courses enable row level security;

create policy "courses_select_authenticated" on public.courses
  for select using (auth.role() = 'authenticated');

create policy "courses_admin_write" on public.courses
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table public.lecturer_courses (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  academic_session text not null,
  assigned_at timestamptz not null default now(),
  unique (lecturer_id, course_id, academic_session)
);

alter table public.lecturer_courses enable row level security;

create policy "lecturer_courses_select_own" on public.lecturer_courses
  for select using (lecturer_id = auth.uid());

create policy "lecturer_courses_admin_all" on public.lecturer_courses
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Replaces the old free-text students.course column with real many-to-many.
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_code text not null,
  semester text not null,
  academic_session text not null,
  source text not null check (source in ('slip_upload', 'manual_admin', 'manual_student')),
  enrolled_at timestamptz not null default now(),
  unique (student_id, course_id, academic_session)
);

alter table public.enrollments enable row level security;

create policy "enrollments_student_own" on public.enrollments
  for all using (student_id = auth.uid());

create policy "enrollments_lecturer_read_own_courses" on public.enrollments
  for select using (
    exists (
      select 1 from public.lecturer_courses lc
      where lc.course_id = enrollments.course_id
        and lc.lecturer_id = auth.uid()
    )
  );

create policy "enrollments_admin_all" on public.enrollments
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
