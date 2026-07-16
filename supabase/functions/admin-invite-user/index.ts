import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const service = getServiceClient();
    const caller = await getCallerProfile(req, service);
    if (!caller || caller.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }

    const body = await req.json();
    const { email, role, full_name, password, department, faculty, matric_number } = body;

    // Only one admin account is intended to exist -- it's seeded once, not
    // created through this invite path. Only lecturer/student invites here.
    if (!role || !["lecturer", "student"].includes(role)) {
      return json({ error: "invalid_fields" }, 400);
    }

    // Students must sign in with their NOUN institutional email
    // (matric_number@noun.edu.ng) -- the handle_new_user DB trigger enforces
    // this unconditionally for every new auth.users row, so an admin invite
    // that didn't derive it the same way would just fail at the trigger with
    // a much less friendly error. Deriving it here server-side (rather than
    // trusting a client-supplied email) is also what closes the gap that used
    // to leave admin-invited students with no matric_number at all, stuck
    // permanently at onboarding since face-enroll requires one.
    let finalEmail = email;
    let finalMatric: string | null = null;
    if (role === "student") {
      const matric = (matric_number ?? "").trim();
      if (!matric) {
        return json({ error: "matric_number_required" }, 400);
      }
      finalMatric = matric;
      finalEmail = `${matric.toLowerCase().replace(/\s+/g, "")}@noun.edu.ng`;
    } else if (!email) {
      return json({ error: "invalid_fields" }, 400);
    }

    const metadata = {
      role,
      full_name: full_name ?? "",
      department: department ?? null,
      faculty: faculty ?? null,
      matric_number: finalMatric,
    };

    // Bulk imports pass a preset password (e.g. for lecturers onboarded from a
    // CSV) -- creates the account directly, pre-confirmed, no magic-link email.
    // A single "Invite" from the Users page omits password and falls back to
    // the normal invite-by-email flow (Supabase emails a "set your password" link).
    const { data, error } = password
      ? await service.auth.admin.createUser({
          email: finalEmail,
          password,
          email_confirm: true,
          user_metadata: metadata,
        })
      : await service.auth.admin.inviteUserByEmail(finalEmail, { data: metadata });

    if (error) {
      return json({ error: "invite_failed", detail: error.message }, 500);
    }

    // Admin-invited/created users skip the pending-approval step regardless of
    // role, since an admin is the one vouching for them at invite time.
    if (data?.user?.id) {
      const { error: statusErr } = await service
        .from("profiles")
        .update({ status: "active" })
        .eq("id", data.user.id);
      if (statusErr) {
        // The account was created (and is usable once approved), but
        // couldn't be auto-activated -- surface this as a real error rather
        // than a silent partial success. A non-2xx status makes the existing
        // frontend error-toast handling (which only checks the transport
        // error, not the response body) actually show it.
        return json(
          { error: "status_update_failed", detail: statusErr.message },
          500,
        );
      }
    }

    return json({ user: data.user }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
