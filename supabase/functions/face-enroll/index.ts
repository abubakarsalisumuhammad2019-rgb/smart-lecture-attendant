import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { luxandFetch, hasLuxandKey, jpegDataUrlToBlob, parseLuxandResponse } from "./_shared/luxand.ts";

// Admin (enrolling any student, e.g. via Addstudent.jsx) or a student enrolling
// their own face (Onboarding.jsx) -- not open to arbitrary matric_numbers like
// the old Flask /enroll was.
Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (!hasLuxandKey()) return json({ error: "luxand_key_not_configured" }, 500);

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
      .select("id, luxand_person_id")
      .eq("matric_number", matric_number)
      .single();

    if (targetErr || !target) return json({ error: "student_not_found" }, 404);

    const photoBlob = jpegDataUrlToBlob(image);
    let luxandPersonId = target.luxand_person_id;

    if (!luxandPersonId) {
      const form = new FormData();
      form.append("name", matric_number);
      form.append("store", "1");
      form.append("photos", photoBlob, "face.jpg");

      const res = await luxandFetch("/v2/person", { method: "POST", body: form });
      const { ok, data, raw } = await parseLuxandResponse(res);

      if (!ok) {
        return json({ error: "luxand_enroll_failed", detail: data?.message ?? raw }, 502);
      }

      luxandPersonId = data.uuid ?? data.id ?? data.person_id;
      if (!luxandPersonId) {
        return json({ error: "luxand_no_person_id_returned", detail: raw }, 502);
      }

      const { error: updateErr } = await service
        .from("profiles")
        .update({ luxand_person_id: String(luxandPersonId) })
        .eq("id", target.id);

      if (updateErr) return json({ error: "profile_update_failed", detail: updateErr.message }, 500);
    } else {
      const form = new FormData();
      form.append("photos", photoBlob, "face.jpg");

      const res = await luxandFetch(`/v2/person/${luxandPersonId}`, { method: "POST", body: form });
      const { ok, data, raw } = await parseLuxandResponse(res);

      if (!ok) {
        return json({ error: "luxand_add_face_failed", detail: data?.message ?? raw }, 502);
      }
    }

    return json({ message: `Student ${matric_number} enrolled successfully!` }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
