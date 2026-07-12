import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export async function getCallerProfile(req: Request, service: SupabaseClient) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;

  const { data: userData, error: userErr } = await service.auth.getUser(jwt);
  if (userErr || !userData?.user) return null;

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  if (profileErr || !profile) return null;
  return profile;
}
