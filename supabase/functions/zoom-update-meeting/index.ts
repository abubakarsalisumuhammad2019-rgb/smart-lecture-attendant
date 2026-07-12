import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { zoomFetch } from "./_shared/zoom.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const { lecture_id, action } = body; // action: 'reschedule' | 'cancel'

    if (!lecture_id || !action) {
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

    const isAdmin = caller.role === "admin";
    const isOwningFacilitator = caller.role === "lecturer" && lecture.facilitator_id === caller.id;

    if (!isAdmin && !isOwningFacilitator) {
      return json({ error: "forbidden" }, 403);
    }

    if (action === "cancel") {
      const { cancel_reason } = body;
      if (!cancel_reason) return json({ error: "cancel_reason_required" }, 400);

      // No Zoom meeting to cancel yet if the facilitator hasn't set one up.
      if (lecture.zoom_meeting_id) {
        const zoomRes = await zoomFetch(`/meetings/${lecture.zoom_meeting_id}`, { method: "DELETE" });
        if (!zoomRes.ok && zoomRes.status !== 404) {
          return json({ error: "zoom_cancel_failed", detail: await zoomRes.text() }, 502);
        }
      }

      const { data: updated, error: updateErr } = await service
        .from("lectures")
        .update({ status: "cancelled", cancel_reason })
        .eq("id", lecture_id)
        .select()
        .single();

      if (updateErr) return json({ error: "update_failed", detail: updateErr.message }, 500);
      return json({ lecture: updated }, 200);
    }

    if (action === "reschedule") {
      const { start_time, duration_minutes } = body;
      if (!start_time || !duration_minutes) {
        return json({ error: "missing_reschedule_fields" }, 400);
      }

      // No Zoom meeting to reschedule yet if the facilitator hasn't set one up
      // -- this is a pure schedule change until then.
      if (lecture.zoom_meeting_id) {
        const zoomRes = await zoomFetch(`/meetings/${lecture.zoom_meeting_id}`, {
          method: "PATCH",
          body: JSON.stringify({ start_time, duration: duration_minutes, timezone: "UTC" }),
        });

        if (!zoomRes.ok) {
          return json({ error: "zoom_reschedule_failed", detail: await zoomRes.text() }, 502);
        }
      }

      const endTime = new Date(new Date(start_time).getTime() + duration_minutes * 60_000).toISOString();

      const { data: updated, error: updateErr } = await service
        .from("lectures")
        .update({
          status: "rescheduled",
          rescheduled_from: lecture.start_time,
          start_time,
          end_time: endTime,
        })
        .eq("id", lecture_id)
        .select()
        .single();

      if (updateErr) return json({ error: "update_failed", detail: updateErr.message }, 500);
      return json({ lecture: updated }, 200);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
