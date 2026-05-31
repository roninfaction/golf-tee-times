import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// /group → redirect to the user's active group page (or /groups if none)
export default async function GroupRedirectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const cookieGroupId = cookieStore.get("golfpack_active_group")?.value;

  const svc = createServiceClient();

  // Load all memberships, pick cookie-matched group or oldest
  const { data: memberships } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const targetId = cookieGroupId && memberships?.some(m => m.group_id === cookieGroupId)
    ? cookieGroupId
    : memberships?.[0]?.group_id;

  if (targetId) redirect(`/group/${targetId}`);
  redirect("/groups");
}
