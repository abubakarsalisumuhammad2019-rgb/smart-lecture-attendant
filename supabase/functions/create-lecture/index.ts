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

    const { data: assignment, error: assignmentErr } = await service
      .from("lecturer_courses")
      .select("id")
      .eq("lecturer_id", facilitator_id)
      .eq("course_id", course_id)
      .eq("academic_session", course.academic_session)
      .maybeSingle();

    if (assignmentErr) {
      return json({ error: "assignment_lookup_failed", detail: assignmentErr.message }, 500);
    }
    if (!assignment) {
      return json({ error: "facilitator_not_assigned_to_course" }, 400);
    }

    const endTime = new Date(new Date(start_time).getTime() + duration_minutes * 60_000).toISOString();

    // Upsert by natural key (course + facilitator + start_time) rather than a
    // plain insert -- re-running a bulk import over data that's already been
    // imported once (e.g. a corrected CSV) updates the existing lecture in
    // place instead of erroring or creating a duplicate. Also resets status
    // back to "scheduled" so a previously cancelled/rescheduled row imported
    // again reflects the CSV as the source of truth.
    const { data: existing } = await service
      .from("lectures")
      .select("id")
      .eq("course_id", course_id)
      .eq("facilitator_id", facilitator_id)
      .eq("start_time", start_time)
      .maybeSingle();

    const { data: lecture, error: writeErr } = existing
      ? await service
          .from("lectures")
          .update({
            topic,
            venue: venue ?? null,
            end_time: endTime,
            status: "scheduled",
            cancel_reason: null,
            rescheduled_from: null,
          })
          .eq("id", existing.id)
          .select()
          .single()
      : await service
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

    if (writeErr) {
      return json({ error: "lecture_write_failed", detail: writeErr.message }, 500);
    }

    return json({ lecture }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
