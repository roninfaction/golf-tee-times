import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { JoinGroupButton } from "@/components/JoinGroupButton";

type PageProps = { params: Promise<{ code: string }> };

export default async function InvitePage({ params }: PageProps) {
  const { code } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${code}`);
  }

  // Use service client so non-members can look up the group by invite code
  const svc = createServiceClient();
  const { data: group } = await svc
    .from("groups")
    .select("id, name")
    .eq("invite_code", code)
    .maybeSingle();

  if (!group) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">🏌️</div>
        <h1 className="text-xl font-bold text-white mb-2">Invalid invite link</h1>
        <p className="text-slate-400 text-sm">This invite code doesn&apos;t exist or has expired.</p>
      </div>
    );
  }

  // Check if already a member
  const { data: existing } = await svc
    .from("group_members")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    redirect("/upcoming");
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">⛳</div>
      <h1 className="text-2xl font-bold text-white mb-2">Join {group.name}</h1>
      <p className="text-slate-400 text-sm mb-8 max-w-xs">
        You&apos;ve been invited to join this golf group on GolfPack.
      </p>
      <JoinGroupButton groupId={group.id} groupName={group.name} />
    </div>
  );
}
