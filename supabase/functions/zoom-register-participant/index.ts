import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { zoomFetch } from "./_shared/zoom.ts";

// Student-only. Registers the caller with Zoom for a lecture that already has
// a real meeting set up (via zoom-create-meeting), and stores the resulting
// personal join_url + registrant_id -- the registrant_id is what lets
// zoom-webhook later match join/leave events back to this student. Idempotent:
// re-calling on an already-registered lecture just returns the stored join_url
// instead of registering twice.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (caller.role !== "student") return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { lecture_id, face_verification_confidence } = body;

    if (!lecture_id) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: existing } = await service
      .from("lecture_registrations")
      .select("*")
      .eq("lecture_id", lecture_id)
      .eq("student_id", caller.id)
      .maybeSingle();

    if (existing) {
      return json({ personal_join_url: existing.personal_join_url }, 200);
    }

    const { data: lecture, error: lectureErr } = await service
      .from("lectures")
      .select("*")
      .eq("id", lecture_id)
      .single();

    if (lectureErr || !lecture) {
      return json({ error: "lecture_not_found" }, 404);
    }

    if (lecture.status === "cancelled") {
      return json({ error: "lecture_cancelled" }, 400);
    }

    // Authorization (are you even allowed near this lecture) before resource
    // state (is Zoom set up yet) -- an unenrolled student should see
    // "not_enrolled", not a confusing "zoom_not_set_up".
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

    if (!lecture.zoom_meeting_id) {
      return json({ error: "zoom_not_set_up" }, 400);
    }

    const nameParts = (caller.full_name || "Student").trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || nameParts[0];

    const zoomRes = await zoomFetch(`/meetings/${lecture.zoom_meeting_id}/registrants`, {
      method: "POST",
      body: JSON.stringify({
        email: caller.email,
        first_name: firstName,
        last_name: lastName,
      }),
    });

    if (!zoomRes.ok) {
      return json({ error: "zoom_registration_failed", detail: await zoomRes.text() }, 502);
    }

    const zoomRegistrant = await zoomRes.json();

    const { data: registration, error: insertErr } = await service
      .from("lecture_registrations")
      .insert({
        lecture_id,
        student_id: caller.id,
        zoom_registrant_id: String(zoomRegistrant.registrant_id),
        personal_join_url: zoomRegistrant.join_url,
        face_verification_confidence: face_verification_confidence ?? null,
      })
      .select()
      .single();

    if (insertErr) {
      // Unique violation on (lecture_id, student_id) -- a concurrent duplicate
      // request (e.g. a double-click) already won the race and registered
      // with Zoom first. Return that row's URL instead of erroring; the Zoom
      // registrant call above is otherwise wasted but harmless.
      if (insertErr.code === "23505") {
        const { data: raced } = await service
          .from("lecture_registrations")
          .select("personal_join_url")
          .eq("lecture_id", lecture_id)
          .eq("student_id", caller.id)
          .single();
        if (raced) return json({ personal_join_url: raced.personal_join_url }, 200);
      }
      return json({ error: "registration_insert_failed", detail: insertErr.message }, 500);
    }

    await service.from("lecture_attendance").upsert(
      {
        lecture_id,
        student_id: caller.id,
        status: "registered",
      },
      { onConflict: "lecture_id,student_id" }
    );

    return json({ personal_join_url: registration.personal_join_url }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
