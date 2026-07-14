const PYFACE_API_URL = Deno.env.get("PYFACE_API_URL") ?? "";
const FACE_API_KEY = Deno.env.get("FACE_API_KEY") ?? "";

export function hasPyFaceConfig(): boolean {
  return PYFACE_API_URL.length > 0 && FACE_API_KEY.length > 0;
}

export async function pyFaceFetch(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const res = await fetch(`${PYFACE_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Api-Key": FACE_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // not JSON
  }
  return { ok: res.ok, status: res.status, data, raw };
}
