-- Zoom is being fully removed in favor of embedded Jitsi Meet (meet.jit.si).
-- A Jitsi room needs no create/cancel/reschedule API call -- it's just a
-- name that springs into existence when someone joins it, so there's no
-- equivalent to zoom_meeting_id as an external resource id.
alter table public.lectures add column jitsi_room_name text unique;

-- Any existing Zoom join URL is dead -- Jitsi rooms aren't retrofittable onto
-- it, so affected lectures go back to "pending meeting setup".
update public.lectures set meeting_web_url = null where zoom_meeting_id is not null;

alter table public.lectures drop column zoom_meeting_id;

update public.lectures set meeting_platform = 'jitsi';
alter table public.lectures alter column meeting_platform set default 'jitsi';

-- No separate host-secret concept for Jitsi's public rooms -- moderator
-- status isn't gated behind a second, privileged URL the way Zoom's
-- start_url was.
drop table public.lecture_host_secrets;

-- Orphaned since the webhook/registrant-based flow (zoom-register-participant,
-- zoom-webhook) was already replaced by client-reported attendance events
-- earlier -- zero readers/writers left.
drop table public.lecture_registrations;

-- Only ever populated by the now-deleted zoom-webhook; record-attendance-event
-- never writes it.
alter table public.lecture_attendance_events drop column raw_payload;
