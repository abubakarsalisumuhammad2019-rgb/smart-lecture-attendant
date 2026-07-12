import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";

// Admin-only: schedules a lecture (course + facilitator + time) without
// touching Zoom. The facilitator later calls zoom-create-meeting on this
// lecture_id to attach the real meeting -- see that function's comments.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (caller.role !== "admin") return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { course_id, facilitator_id, topic, venue, start_time, duration_minutes } = body;

    if (!course_id || !facilitator_id || !topic || !start_time || !duration_minutes) {
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

    const { data: assignment } = await service
      .from("lecturer_courses")
      .select("id")
      .eq("lecturer_id", facilitator_id)
      .eq("course_id", course_id)
      .maybeSingle();

    if (!assignment) {
      return json({ error: "facilitator_not_assigned_to_course" }, 400);
    }

    const endTime = new Date(new Date(start_time).getTime() + duration_minutes * 60_000).toISOString();

    const { data: lecture, error: insertErr } = await service
      .from("lectures")
      .insert({
        course_id,
        facilitator_id,
        topic,
        venue: venue ?? null,
        meeting_platform: "zoom",
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

    return json({ lecture }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
