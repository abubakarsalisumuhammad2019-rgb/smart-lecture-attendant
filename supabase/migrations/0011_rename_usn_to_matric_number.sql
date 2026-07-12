-- NOUN (the actual institution this app now serves) uses "Matric Number", not
-- "USN" (a Karnataka/VTU term left over from whatever template this was
-- originally built from). Rename the column everywhere it appears.
alter table public.profiles rename column usn to matric_number;
alter table public.attendance_logs rename column usn to matric_number;
alter table public.periodwise_attendance_logs rename column usn to matric_number;

drop function public.kiosk_roster();

create function public.kiosk_roster()
returns table (matric_number text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select matric_number, full_name from public.profiles where role = 'student' and matric_number is not null;
$$;

revoke execute on function public.kiosk_roster() from public;
grant execute on function public.kiosk_roster() to anon, authenticated;
