import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public endpoint -- Zoom can't send a Supabase JWT, so this function is
// deployed with verify_jwt: false and authenticates the caller entirely via
// Zoom's HMAC-SHA256 webhook signature (x-zm-signature / x-zm-request-timestamp).
// That signature check is the whole auth boundary here.

const WEBHOOK_SECRET = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN") ?? "";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    if (!WEBHOOK_SECRET) {
      return json({ error: "webhook_secret_not_configured" }, 500);
    }

    // Read as raw text first -- the signature is computed over the exact bytes
    // Zoom sent, so we can't JSON.parse-then-reserialize before verifying.
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    // Zoom's one-time endpoint validation handshake, sent unsigned when you first
    // save the Event Subscription URL in the Marketplace. Must echo back the
    // encrypted token or the URL never validates.
    if (body.event === "endpoint.url_validation") {
      const plainToken = body.payload?.plainToken;
      if (!plainToken) return json({ error: "missing_plain_token" }, 400);
      const encryptedToken = await hmacSha256Hex(WEBHOOK_SECRET, plainToken);
      return json({ plainToken, encryptedToken }, 200);
    }

    // All other (real) events must carry a valid signature.
    const timestamp = req.headers.get("x-zm-request-timestamp") ?? "";
    const signature = req.headers.get("x-zm-signature") ?? "";
    const expected = `v0=${await hmacSha256Hex(WEBHOOK_SECRET, `v0:${timestamp}:${rawBody}`)}`;
    if (!signature || signature !== expected) {
      return json({ error: "invalid_signature" }, 401);
    }

    const eventType = body.event as string;
    if (eventType !== "meeting.participant_joined" && eventType !== "meeting.participant_left") {
      // Ack anything we don't care about so Zoom doesn't retry it.
      return json({ received: true }, 200);
    }

    const participant = body.payload?.object?.participant;
    const registrantId = participant?.registrant_id;
    // No registrant_id means this isn't a registered student (e.g. the host
    // joining under the institutional Zoom account) -- nothing to correlate.
    if (!registrantId) return json({ received: true }, 200);

    const service = getServiceClient();

    const { data: registration } = await service
      .from("lecture_registrations")
      .select("lecture_id, student_id")
      .eq("zoom_registrant_id", registrantId)
      .maybeSingle();

    if (!registration) return json({ received: true }, 200);

    const eventTime =
      (eventType === "meeting.participant_joined" ? participant.join_time : participant.leave_time) ??
      new Date(body.event_ts ?? Date.now()).toISOString();

    await service.from("lecture_attendance_events").insert({
      lecture_id: registration.lecture_id,
      student_id: registration.student_id,
      event_type: eventType === "meeting.participant_joined" ? "joined" : "left",
      event_time: eventTime,
      raw_payload: body,
    });

    const { data: existing } = await service
      .from("lecture_attendance")
      .select("*")
      .eq("lecture_id", registration.lecture_id)
      .eq("student_id", registration.student_id)
      .maybeSingle();

    if (eventType === "meeting.participant_joined") {
      await service.from("lecture_attendance").upsert(
        {
          lecture_id: registration.lecture_id,
          student_id: registration.student_id,
          status: "attended",
          first_joined_at: existing?.first_joined_at ?? eventTime,
          last_joined_at: eventTime,
        },
        { onConflict: "lecture_id,student_id" }
      );
    } else {
      const addedSeconds = existing?.last_joined_at
        ? Math.max(0, Math.round((new Date(eventTime).getTime() - new Date(existing.last_joined_at).getTime()) / 1000))
        : 0;

      await service.from("lecture_attendance").upsert(
        {
          lecture_id: registration.lecture_id,
          student_id: registration.student_id,
          status: "attended",
          last_left_at: eventTime,
          total_duration_seconds: (existing?.total_duration_seconds ?? 0) + addedSeconds,
        },
        { onConflict: "lecture_id,student_id" }
      );
    }

    return json({ received: true }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
