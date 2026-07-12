const ZOOM_ACCOUNT_ID = Deno.env.get("ZOOM_ACCOUNT_ID") ?? "";
const ZOOM_CLIENT_ID = Deno.env.get("ZOOM_CLIENT_ID") ?? "";
const ZOOM_CLIENT_SECRET = Deno.env.get("ZOOM_CLIENT_SECRET") ?? "";
const ZOOM_MEETING_HOST_USER_ID = Deno.env.get("ZOOM_MEETING_HOST_USER_ID") ?? "";

let cachedToken: { token: string; expiresAt: number } | null = null;

// Server-to-Server OAuth token exchange, cached in-memory for the life of this
// Edge Function instance (tokens last ~1hr) to avoid a round-trip on every call.
export async function getZoomAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const basicAuth = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`);
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Zoom OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export async function zoomFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getZoomAccessToken();
  return fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

// One institutional Zoom-licensed user hosts every meeting -- lecturers don't
// need their own Zoom accounts/licenses.
export function hostUserId(): string {
  return ZOOM_MEETING_HOST_USER_ID;
}
