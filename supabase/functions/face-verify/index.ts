import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { luxandFetch, hasLuxandKey, jpegDataUrlToBlob, parseLuxandResponse } from "./_shared/luxand.ts";

// Luxand's similarity score is 0-100, higher = better match (opposite of the
// old LBPH distance metric). Starting point only -- needs calibration against
// real capture conditions, same as the LBPH threshold did.
const THRESHOLD = Number(Deno.env.get("LUXAND_VERIFY_THRESHOLD") ?? 90);

// Student-only. The actual attendance-verification gate before JoinLecture.jsx
// redirects to Zoom. Unlike the old Flask /verify, the identity being checked
// is derived from the caller's own JWT-resolved profile, not a client-supplied
// body field -- a logged-in student can no longer claim to be someone else.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (!hasLuxandKey()) return json({ error: "luxand_key_not_configured" }, 500);

    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (caller.role !== "student") return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { image } = body;
    if (!image) return json({ error: "missing_fields" }, 400);

    if (!caller.luxand_person_id) {
      return json({ verified: false, confidence: null, threshold: THRESHOLD, reason: "not_enrolled" }, 200);
    }

    const form = new FormData();
    form.append("photo", jpegDataUrlToBlob(image), "capture.jpg");

    const res = await luxandFetch(`/photo/verify/${caller.luxand_person_id}`, { method: "POST", body: form });
    const { data, raw } = await parseLuxandResponse(res);

    if (!data) {
      return json({ error: "luxand_unexpected_response", detail: raw }, 502);
    }

    // status:"failure" here is a normal, expected outcome (e.g. no face in the
    // submitted frame) -- not a service error, so it maps to a 200 "not
    // verified" response like any other rejection, not a 502.
    if (data.status === "failure") {
      return json({ verified: false, confidence: null, threshold: THRESHOLD, reason: "no_face_detected" }, 200);
    }

    // Field name unconfirmed against Luxand's real reference docs -- try the
    // plausible candidates. If none present, treat as "no face" rather than a
    // silent false-positive/negative.
    const rawScore = data.probability ?? data.confidence ?? data.similarity ?? data.score;
    if (rawScore === undefined) {
      return json({ verified: false, confidence: null, threshold: THRESHOLD, reason: "no_face_detected" }, 200);
    }

    // Normalize to a 0-100 scale in case Luxand returns a 0-1 fraction.
    const confidence = rawScore <= 1 ? rawScore * 100 : rawScore;
    const verified = confidence >= THRESHOLD;

    return json({ verified, confidence, threshold: THRESHOLD }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
