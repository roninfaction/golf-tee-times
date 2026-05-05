import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// /group → redirect to the user's active group page (or /groups if none)
export default async function GroupRedirectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check cookie first for fast redirect
  const cookieStore = await cookies();
  const cookieGroupId = cookieStore.get("golfpack_active_group")?.value;

  if (cookieGroupId) {
    redirect(`/group/${cookieGroupId}`);
  }

  // Fall back to DB
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("active_group_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.active_group_id) {
    redirect(`/group/${profile.active_group_id}`);
  }

  // Find oldest membership
  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.group_id) {
    redirect(`/group/${membership.group_id}`);
  }

  redirect("/groups");
}
