-- The kiosk (frontpage.jsx) is a deliberately unauthenticated, walk-up face-scan
-- page. profiles RLS only allows a user to read their own row or an admin to read
-- all rows -- there is no anon policy. This narrow, read-only RPC exposes just
-- what the kiosk needs (usn + full_name, to resolve a scanned face to a display
-- name) without opening up the rest of the profiles table (email, phone, role...)
-- to anonymous callers.
create or replace function public.kiosk_roster()
returns table (usn text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select usn, full_name from public.profiles where role = 'student' and usn is not null;
$$;

grant execute on function public.kiosk_roster() to anon, authenticated;
