import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";

// Cancels or reschedules a lecture. A Jitsi room isn't an external created
// resource the way a Zoom meeting was, so there's nothing to call out to --
// this just updates the lecture's own schedule/status fields.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const { lecture_id, action } = body; // action: 'reschedule' | 'cancel' | 'end' | 'reopen'

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

    if (action === "end") {
      if (lecture.status === "cancelled" || lecture.status === "completed") {
        return json({ error: "already_ended_or_cancelled" }, 400);
      }

      const { data: updated, error: updateErr } = await service
        .from("lectures")
        .update({ status: "completed" })
        .eq("id", lecture_id)
        .select()
        .single();

      if (updateErr) return json({ error: "update_failed", detail: updateErr.message }, 500);
      return json({ lecture: updated }, 200);
    }

    if (action === "reopen") {
      if (lecture.status !== "completed") {
        return json({ error: "not_ended" }, 400);
      }

      const { data: updated, error: updateErr } = await service
        .from("lectures")
        .update({ status: "scheduled" })
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
