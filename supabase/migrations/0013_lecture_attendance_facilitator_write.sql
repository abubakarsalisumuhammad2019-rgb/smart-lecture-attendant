-- Lecturer-side manual "mark attended" override (fallback for when face
-- verification fails for a legitimate reason, e.g. bad lighting/camera).
-- Unlike lectures/registrations, there's no external system (Zoom) to keep in
-- sync for this write, so a direct RLS policy is enough -- no Edge Function
-- needed, matching the pattern already used for enrollments' student-owned writes.
create policy "lecture_attendance_facilitator_write" on public.lecture_attendance
  for insert with check (
    exists (
      select 1 from public.lectures l
      where l.id = lecture_attendance.lecture_id and l.facilitator_id = auth.uid()
    )
  );

create policy "lecture_attendance_facilitator_update" on public.lecture_attendance
  for update using (
    exists (
      select 1 from public.lectures l
      where l.id = lecture_attendance.lecture_id and l.facilitator_id = auth.uid()
    )
  );
