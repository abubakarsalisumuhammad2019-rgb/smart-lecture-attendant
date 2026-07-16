import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";

// Student-only. Called from the student's own already-authenticated browser
// (JoinLecture.jsx) when a Zoom join window opens/closes -- Zoom's free plan
// has no server-side join/leave webhook available without paid registration,
// so attendance is client-reported instead. Identity is always the caller's
// own JWT-resolved profile, never client-supplied, and event_time is always
// server-stamped at receipt (never taken from the client) so a student can't
// inflate their duration by lying about the clock.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (caller.role !== "student") return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { lecture_id, event_type } = body;

    if (!lecture_id || (event_type !== "joined" && event_type !== "left")) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: lecture, error: lectureErr } = await service
      .from("lectures")
      .select("*")
      .eq("id", lecture_id)
      .single();

    if (lectureErr || !lecture) {
      return json({ error: "lecture_not_found" }, 404);
    }

    const { data: enrollment } = await service
      .from("enrollments")
      .select("id")
      .eq("student_id", caller.id)
      .eq("course_id", lecture.course_id)
      .eq("academic_session", lecture.academic_session)
      .maybeSingle();

    if (!enrollment) {
      return json({ error: "not_enrolled" }, 403);
    }

    if (lecture.status === "cancelled") {
      return json({ error: "lecture_cancelled" }, 400);
    }

    const eventTime = new Date().toISOString();

    await service.from("lecture_attendance_events").insert({
      lecture_id,
      student_id: caller.id,
      event_type,
      event_time: eventTime,
    });

    const { data: existing } = await service
      .from("lecture_attendance")
      .select("*")
      .eq("lecture_id", lecture_id)
      .eq("student_id", caller.id)
      .maybeSingle();

    if (event_type === "joined") {
      // Don't downgrade a status the student already earned (e.g. rejoining
      // after already meeting the minimum earlier in this same lecture).
      // Otherwise sit at "registered" -- a join alone doesn't earn "attended"
      // anymore, only meeting the admin's minimum duration does (checked on
      // "left", below, since that's the only point the final duration for
      // this session is known).
      const status = existing?.status === "attended" ? "attended" : "registered";

      await service.from("lecture_attendance").upsert(
        {
          lecture_id,
          student_id: caller.id,
          status,
          first_joined_at: existing?.first_joined_at ?? eventTime,
          last_joined_at: eventTime,
        },
        { onConflict: "lecture_id,student_id" }
      );
    } else {
      // Guard against a duplicate "left" double-counting duration: only
      // accumulate more time if this join period hasn't already been closed
      // out (last_left_at already at/after last_joined_at).
      const alreadyClosed =
        existing?.last_left_at &&
        existing?.last_joined_at &&
        new Date(existing.last_left_at) >= new Date(existing.last_joined_at);

      const addedSeconds =
        existing?.last_joined_at && !alreadyClosed
          ? Math.max(
              0,
              Math.round(
                (new Date(eventTime).getTime() - new Date(existing.last_joined_at).getTime()) / 1000
              )
            )
          : 0;

      const totalDurationSeconds = (existing?.total_duration_seconds ?? 0) + addedSeconds;

      // Only credit "attended" once the admin-configured minimum duration is
      // actually met -- a student who joins for a few seconds and leaves
      // shouldn't be indistinguishable from one who stayed the whole
      // lecture. No minimum configured means no bar to clear.
      const { data: setting } = await service
        .from("app_settings")
        .select("value")
        .eq("key", "min_attendance_minutes")
        .maybeSingle();
      const minMinutes = setting?.value ? Number(setting.value) : null;
      const status = !minMinutes || totalDurationSeconds >= minMinutes * 60 ? "attended" : "registered";

      await service.from("lecture_attendance").upsert(
        {
          lecture_id,
          student_id: caller.id,
          status,
          last_left_at: eventTime,
          total_duration_seconds: totalDurationSeconds,
        },
        { onConflict: "lecture_id,student_id" }
      );
    }

    return json({ recorded: true }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
