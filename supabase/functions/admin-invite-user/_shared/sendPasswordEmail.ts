// Sends the new account's real, generated password directly by email via
// Brevo's transactional API. This replaces Supabase's own invite-by-email
// flow for admin-invited users -- that flow's ConfirmationURL redirects to a
// page this app has never had (no route anywhere catches an invite/recovery
// token and lets someone set a password), so the account's password has to
// be usable the moment this email is read, not depend on a follow-up click.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const ROLE_LABEL: Record<string, string> = {
  lecturer: "Lecturer",
  student: "Student",
};

function buildHtml(fullName: string, role: string, email: string, password: string) {
  const appUrl = Deno.env.get("APP_URL");
  const signInButton = appUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-radius:12px;background-color:#1d4ed8;background-image:linear-gradient(90deg,#1d4ed8 0%,#2563eb 100%);">
            <a href="${appUrl}" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              Sign in
            </a>
          </td>
        </tr>
      </table>`
    : `<p style="margin:0;color:#4b5563;font-size:14px;">Sign in with the credentials below from the attendance system's login page.</p>`;

  return `<div style="background-color:#0f172a;padding:32px 16px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.25);">
    <tr>
      <td style="background-color:#1d4ed8;background-image:linear-gradient(180deg,#1d4ed8 0%,#1d4ed8 45%,#2563eb 100%);padding:32px 32px 24px 32px;">
        <p style="margin:0 0 20px 0;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">University Admin Panel</p>
        <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.35;font-weight:700;">
          You've been added to<br />
          <span style="color:#fde047;">National Open University</span>
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h2 style="margin:0 0 12px 0;color:#111827;font-size:20px;font-weight:700;">Your account is ready</h2>
        <p style="margin:0 0 20px 0;color:#4b5563;font-size:14px;line-height:1.6;">
          An administrator added you as a <strong>${ROLE_LABEL[role] || role}</strong> on the attendance system.
          Here are your sign-in details:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f7;border-radius:12px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Email</p>
              <p style="margin:0 0 12px 0;color:#111827;font-size:14px;font-family:monospace;">${email}</p>
              <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Password</p>
              <p style="margin:0;color:#111827;font-size:16px;font-family:monospace;font-weight:700;">${password}</p>
            </td>
          </tr>
        </table>
        ${signInButton}
        <p style="margin:24px 0 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
          For your security, sign in and change this password from Settings once you're in.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background-color:#f7f7f7;text-align:center;">
        <p style="margin:0;color:#6b7280;font-size:12px;">
          &copy; 2025, made with &#10084;&#65039; by <strong style="color:#374151;">National Open University</strong> for a better web.
        </p>
      </td>
    </tr>
  </table>
</div>`;
}

export async function sendPasswordEmail(
  { fullName, role, email, password }: { fullName: string; role: string; email: string; password: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "BREVO_API_KEY is not configured" };
  }

  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "no-reply@noun.edu.ng";
  const senderName = Deno.env.get("BREVO_SENDER_NAME") || "National Open University";

  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email, name: fullName || undefined }],
      subject: "Your attendance system account is ready",
      htmlContent: buildHtml(fullName, role, email, password),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `Brevo request failed (${res.status}): ${detail}` };
  }

  return { ok: true };
}
