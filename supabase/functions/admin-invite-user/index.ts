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
    const { email, role, full_name, password, department, faculty } = body;

    // Only one admin account is intended to exist -- it's seeded once, not
    // created through this invite path. Only lecturer/student invites here.
    if (!email || !role || !["lecturer", "student"].includes(role)) {
      return json({ error: "invalid_fields" }, 400);
    }

    const metadata = {
      role,
      full_name: full_name ?? "",
      department: department ?? null,
      faculty: faculty ?? null,
    };

    // Bulk imports pass a preset password (e.g. for lecturers onboarded from a
    // CSV) -- creates the account directly, pre-confirmed, no magic-link email.
    // A single "Invite" from the Users page omits password and falls back to
    // the normal invite-by-email flow (Supabase emails a "set your password" link).
    const { data, error } = password
      ? await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: metadata,
        })
      : await service.auth.admin.inviteUserByEmail(email, { data: metadata });

    if (error) {
      return json({ error: "invite_failed", detail: error.message }, 500);
    }

    // Admin-invited/created users skip the pending-approval step regardless of
    // role, since an admin is the one vouching for them at invite time.
    if (data?.user?.id) {
      await service.from("profiles").update({ status: "active" }).eq("id", data.user.id);
    }

    return json({ user: data.user }, 200);
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
