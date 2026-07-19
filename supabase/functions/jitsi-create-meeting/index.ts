import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";

// Attaches a Jitsi meeting room to a lecture that admin already scheduled via
// create-lecture. Callable by admin or the lecture's own facilitator. No
// external API call needed -- a Jitsi room is just a name that springs into
// existence when someone joins it, so "creating" one is just generating an
// unguessable room name and storing it. Idempotent: calling this again on an
// already-configured lecture just returns it unchanged.
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

    if (lecture.meeting_web_url) {
      return json({ lecture }, 200);
    }

    // Server-generated and random -- not derived from lecture.id, which is
    // already exposed in the app's own URL and therefore guessable.
    const roomName = `slat-${crypto.randomUUID()}`;
    const meetingWebUrl = `https://meet.jit.si/${roomName}`;

    const { data: updated, error: updateErr } = await service
      .from("lectures")
      .update({
        jitsi_room_name: roomName,
        meeting_web_url: meetingWebUrl,
        meeting_platform: "jitsi",
      })
      .eq("id", lecture_id)
      .select()
      .single();

    if (updateErr) {
      return json({ error: "lecture_update_failed", detail: updateErr.message }, 500);
    }

    return json({ lecture: updated }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
