-- The legacy unauthenticated walk-up face-scan page (frontpage.jsx) is a
-- deliberately unauthenticated page. profiles RLS only allows a user to read
-- their own row or an admin to read all rows -- there is no anon policy. This
-- narrow, read-only RPC exposes just what that page needs (usn + full_name,
-- to resolve a scanned face to a display name) without opening up the rest of
-- the profiles table (email, phone, role...) to anonymous callers.
create or replace function public.legacy_face_scan_roster()
returns table (usn text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select usn, full_name from public.profiles where role = 'student' and usn is not null;
$$;

grant execute on function public.legacy_face_scan_roster() to anon, authenticated;
