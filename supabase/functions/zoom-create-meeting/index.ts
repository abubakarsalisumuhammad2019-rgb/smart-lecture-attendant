import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { zoomFetch, hostUserId } from "./_shared/zoom.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const { course_id, facilitator_id, topic, venue, start_time, duration_minutes } = body;

    if (!course_id || !topic || !start_time || !duration_minutes) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: course, error: courseErr } = await service
      .from("courses")
      .select("*")
      .eq("id", course_id)
      .single();

    if (courseErr || !course) {
      return json({ error: "course_not_found" }, 404);
    }

    let resolvedFacilitatorId: string;

    if (caller.role === "admin") {
      if (!facilitator_id) {
        return json({ error: "facilitator_id_required" }, 400);
      }
      const { data: assignment } = await service
        .from("lecturer_courses")
        .select("id")
        .eq("lecturer_id", facilitator_id)
        .eq("course_id", course_id)
        .maybeSingle();
      if (!assignment) {
        return json({ error: "facilitator_not_assigned_to_course" }, 400);
      }
      resolvedFacilitatorId = facilitator_id;
    } else if (caller.role === "lecturer") {
      const { data: assignment } = await service
        .from("lecturer_courses")
        .select("id")
        .eq("lecturer_id", caller.id)
        .eq("course_id", course_id)
        .maybeSingle();
      if (!assignment) {
        return json({ error: "not_assigned_to_course" }, 403);
      }
      resolvedFacilitatorId = caller.id;
    } else {
      return json({ error: "forbidden" }, 403);
    }

    // approval_type: 0 both requires registration AND auto-approves it --
    // approval_type: 2 would mean "no registration required" (the wrong choice
    // here), and manual approval (1) would block the verify-then-join UX.
    const zoomRes = await zoomFetch(`/users/${hostUserId()}/meetings`, {
      method: "POST",
      body: JSON.stringify({
        topic,
        type: 2,
        start_time,
        duration: duration_minutes,
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
    const endTime = new Date(new Date(start_time).getTime() + duration_minutes * 60_000).toISOString();

    const { data: lecture, error: insertErr } = await service
      .from("lectures")
      .insert({
        course_id,
        facilitator_id: resolvedFacilitatorId,
        topic,
        venue: venue ?? null,
        meeting_platform: "zoom",
        zoom_meeting_id: String(zoomMeeting.id),
        meeting_web_url: zoomMeeting.join_url,
        start_time,
        end_time: endTime,
        status: "scheduled",
        semester: course.semester,
        academic_session: course.academic_session,
      })
      .select()
      .single();

    if (insertErr) {
      return json({ error: "lecture_insert_failed", detail: insertErr.message }, 500);
    }

    await service.from("lecture_host_secrets").insert({
      lecture_id: lecture.id,
      meeting_start_url: zoomMeeting.start_url,
    });

    return json({ lecture }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
