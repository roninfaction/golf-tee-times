import { createServiceClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Validate a Bearer token from an Authorization header and return the user. */
export async function getUserFromBearer(authHeader: string | null): Promise<User | null> {
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  const svc = createServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}
