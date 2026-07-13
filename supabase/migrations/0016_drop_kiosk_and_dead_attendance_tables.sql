-- The kiosk (frontpage.jsx, /kiosk) was a leftover from the pre-RBAC
-- walk-up-face-scan system. It had no attendance-marking side effect anymore
-- (period-wise attendance was already retired), no login, and no role in the
-- current lecture-based attendance flow (student login -> pick lecture ->
-- 1:1 face-verify before joining Zoom). Removing it also closes a real
-- exposure: it let any unauthenticated caller resolve a scanned face to a
-- real student's name.
drop function if exists public.kiosk_roster();

-- Both empty (0 rows) and referenced by zero application code -- the
-- period-wise attendance-marking feature these backed was already removed
-- earlier in the project, but the tables themselves were never dropped.
drop table if exists public.attendance_logs;
drop table if exists public.periodwise_attendance_logs;
