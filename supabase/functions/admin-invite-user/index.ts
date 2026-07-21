import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, json } from "./_shared/cors.ts";
import { getServiceClient, getCallerProfile } from "./_shared/authContext.ts";
import { generatePassword } from "./_shared/password.ts";
import { sendPasswordEmail } from "./_shared/sendPasswordEmail.ts";

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
    // CSV) -- creates the account directly, pre-confirmed, no email. A single
    // "Invite" from the Users page omits password: a random one is generated
    // here and emailed directly via Brevo, since this app has no page to
    // catch Supabase's own invite-link redirect and let someone set a
    // password -- the account has to be usable the moment the email is read.
    const isBulkImport = Boolean(password);
    const finalPassword = isBulkImport ? password : generatePassword();

    const { data, error } = await service.auth.admin.createUser({
      email: finalEmail,
      password: finalPassword,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      return json({ error: "invite_failed", detail: error.message }, 500);
    }

    let emailWarning: string | undefined;
    if (!isBulkImport) {
      const emailResult = await sendPasswordEmail({
        fullName: metadata.full_name,
        role,
        email: finalEmail,
        password: finalPassword,
      });
      if (!emailResult.ok) {
        // The account was created successfully either way -- don't fail the
        // whole request over a delivery problem, but the admin needs the
        // password some other way since it's otherwise unrecoverable.
        emailWarning = emailResult.error;
      }
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

    // If the password email failed to send, hand the generated password back
    // in the response instead -- otherwise a delivery failure would create an
    // account nobody, including the admin who just created it, can get into.
    return json(
      emailWarning
        ? { user: data.user, email_warning: emailWarning, password: finalPassword }
        : { user: data.user },
      200,
    );
  } catch (err) {
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
