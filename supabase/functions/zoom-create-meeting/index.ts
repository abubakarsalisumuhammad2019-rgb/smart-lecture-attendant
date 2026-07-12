import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { zoomFetch, hostUserId } from "./_shared/zoom.ts";

// Attaches a real Zoom meeting to a lecture that admin already scheduled via
// create-lecture. Callable by admin or the lecture's own facilitator -- this
// is deliberately the facilitator's action, not admin's, in the normal case:
// admin decides WHEN a lecture happens, the facilitator is the one who sets
// up the actual Zoom session for it. Idempotent: calling this again on an
// already-configured lecture just returns it unchanged instead of creating a
// second Zoom meeting.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const { lecture_id } = body;

    if (!lecture_id) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: lecture, error: lectureErr } = await service
      .from("lectures")
      .select("*, courses(course_code, course_title)")
      .eq("id", lecture_id)
      .single();

    if (lectureErr || !lecture) {
      return json({ error: "lecture_not_found" }, 404);
    }

    const isAdmin = caller.role === "admin";
    const isOwningFacilitator = caller.role === "lecturer" && lecture.facilitator_id === caller.id;

    if (!isAdmin && !isOwningFacilitator) {
      return json({ error: "forbidden" }, 403);
    }

    if (lecture.meeting_web_url) {
      return json({ lecture }, 200);
    }

    const durationMinutes = Math.round(
      (new Date(lecture.end_time).getTime() - new Date(lecture.start_time).getTime()) / 60_000
    );

    // approval_type: 0 both requires registration AND auto-approves it --
    // approval_type: 2 would mean "no registration required" (the wrong choice
    // here), and manual approval (1) would block the verify-then-join UX.
    const zoomRes = await zoomFetch(`/users/${hostUserId()}/meetings`, {
      method: "POST",
      body: JSON.stringify({
        topic: lecture.topic,
        type: 2,
        start_time: lecture.start_time,
        duration: durationMinutes,
        timezone: "UTC",
        settings: {
          approval_type: 0,
          waiting_room: true,
          join_before_host: false,
          registrants_email_notification: false,
        },
      }),
    });

    if (!zoomRes.ok) {
      return json({ error: "zoom_create_meeting_failed", detail: await zoomRes.text() }, 502);
    }

    const zoomMeeting = await zoomRes.json();

    const { data: updated, error: updateErr } = await service
      .from("lectures")
      .update({
        zoom_meeting_id: String(zoomMeeting.id),
        meeting_web_url: zoomMeeting.join_url,
      })
      .eq("id", lecture_id)
      .select()
      .single();

    if (updateErr) {
      return json({ error: "lecture_update_failed", detail: updateErr.message }, 500);
    }

    await service.from("lecture_host_secrets").insert({
      lecture_id: updated.id,
      meeting_start_url: zoomMeeting.start_url,
    });

    return json({ lecture: updated }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
