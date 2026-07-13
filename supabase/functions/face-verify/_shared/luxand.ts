const LUXAND_API_KEY = Deno.env.get("LUXAND_API_KEY") ?? "";
const LUXAND_BASE_URL = "https://api.luxand.cloud";

export async function luxandFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${LUXAND_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), token: LUXAND_API_KEY },
  });
}

export function hasLuxandKey(): boolean {
  return LUXAND_API_KEY.length > 0;
}

// WebcamCapture.capture() returns a "data:image/jpeg;base64,..." URL. Luxand's
// endpoints take multipart/form-data, not JSON+base64 -- this reshaping happens
// server-side so the frontend keeps sending the same JSON body it always has.
export function jpegDataUrlToBlob(dataUrl: string): Blob {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/jpeg" });
}

// Confirmed live: Luxand returns HTTP 200 even for logical failures (e.g. no
// face found), signaled instead via a body-level {"status":"failure",...}
// field -- res.ok alone is not a reliable success signal.
export async function parseLuxandResponse(res: Response): Promise<{ ok: boolean; data: any; raw: string }> {
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // not JSON
  }
  const ok = res.ok && !!data && data.status !== "failure";
  return { ok, data, raw };
}
