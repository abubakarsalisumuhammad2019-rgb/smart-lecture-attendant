import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { hasPyFaceConfig, pyFaceFetch } from "./_shared/pythonFaceApi.ts";

const CAPTURE_QUALITY_REASONS = new Set(["no_face_detected", "multiple_faces_detected"]);
const CAPTURE_QUALITY_MESSAGES: Record<string, string> = {
  no_face_detected: "No face detected -- make sure your face is clearly visible and try again.",
  multiple_faces_detected: "More than one face detected -- make sure you're alone in frame and try again.",
};

// Admin (enrolling any student, e.g. via Addstudent.jsx) or a student enrolling
// their own face (Onboarding.jsx) -- not open to arbitrary matric_numbers like
// the old Flask /enroll was. Face detection/cropping/storage now happens in
// the Python service (Render); this function only handles auth + proxying.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (!hasPyFaceConfig()) return json({ error: "face_api_not_configured" }, 500);

    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const { matric_number, image } = body;
    if (!matric_number || !image) {
      return json({ error: "missing_fields" }, 400);
    }

    const isAdmin = caller.role === "admin";
    const isSelf = caller.role === "student" && caller.matric_number === matric_number;
    if (!isAdmin && !isSelf) return json({ error: "forbidden" }, 403);

    const { data: target, error: targetErr } = await service
      .from("profiles")
      .select("id")
      .eq("matric_number", matric_number)
      .single();

    if (targetErr || !target) return json({ error: "student_not_found" }, 404);

    const { ok, data, raw } = await pyFaceFetch("/enroll", { matric_number, image });

    if (!ok) {
      // A bad capture (no face / multiple faces) is routine input, not a
      // service failure -- surfaced as 400 with a friendly message, not a 502.
      if (data?.error && CAPTURE_QUALITY_REASONS.has(data.error)) {
        return json({ error: CAPTURE_QUALITY_MESSAGES[data.error] }, 400);
      }
      return json({ error: data?.error ?? "face_api_enroll_failed", detail: data?.detail ?? raw }, 502);
    }

    return json({ message: `Student ${matric_number} enrolled successfully!` }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
