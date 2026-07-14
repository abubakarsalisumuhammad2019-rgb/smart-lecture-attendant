import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { hasPyFaceConfig, pyFaceFetch } from "./_shared/pythonFaceApi.ts";

// LBPH distance -- lower is a better match (opposite of Luxand's 0-100
// higher-is-better scale it replaces). Starting point only, needs
// calibration against real capture conditions -- same situation every prior
// threshold in this codebase has been in before real-world tuning.
const rawThreshold = Number(Deno.env.get("FACE_VERIFY_THRESHOLD"));
const THRESHOLD = Number.isFinite(rawThreshold) ? rawThreshold : 70;

// Student-only. Identity is derived from the caller's own JWT-resolved
// profile, not a client-supplied body field -- a logged-in student can't
// claim to verify as someone else. caller.matric_number (never client
// input) tells the Python service which student's enrolled photos to
// compare against -- the actual accept/reject decision (THRESHOLD) is made
// here, not in the Python service, so it's tunable without a redeploy.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (!hasPyFaceConfig()) return json({ error: "face_api_not_configured" }, 500);

    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);
    if (caller.role !== "student") return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { image } = body;
    if (!image) return json({ error: "missing_fields" }, 400);

    const { ok, data, raw } = await pyFaceFetch("/verify", { matric_number: caller.matric_number, image });

    if (!ok) {
      return json({ error: data?.error ?? "face_api_verify_failed", detail: data?.detail ?? raw }, 502);
    }

    if (data.reason) {
      return json({ verified: false, confidence: null, threshold: THRESHOLD, reason: data.reason }, 200);
    }

    const distance = data.distance;
    const verified = typeof distance === "number" && distance <= THRESHOLD;
    return json({ verified, confidence: distance, threshold: THRESHOLD }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
