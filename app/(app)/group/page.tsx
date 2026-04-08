import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyInviteButton } from "@/components/CopyInviteButton";
import type { GroupMember, Profile } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golf-tee-times.pages.dev";

export default async function GroupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id, role, group:groups(id, name, invite_code)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="px-4 pt-6 text-center py-16">
        <p className="text-slate-400">You&apos;re not in a group yet.</p>
        <Link href="/group/setup" className="text-green-400 underline text-sm mt-2 inline-block">
          Set up your group
        </Link>
      </div>
    );
  }

  const group = membership.group as unknown as { id: string; name: string; invite_code: string };
  const inviteUrl = `${APP_URL}/invite/${group.invite_code}`;

  const { data: members } = await supabase
    .from("group_members")
    .select("*, profile:profiles(id, display_name, email)")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-white mb-1">{group.name}</h1>
      <p className="text-slate-500 text-sm mb-6">{(members ?? []).length} members</p>

      {/* Members list */}
      <div className="space-y-2 mb-6">
        {(members ?? []).map((m: GroupMember & { profile: Profile }) => (
          <div
            key={m.id}
            className="flex items-center gap-3 bg-slate-900 rounded-xl px-4 py-3 border border-slate-800"
          >
            <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center text-sm font-medium text-slate-200">
              {m.profile?.display_name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">
                {m.profile?.display_name ?? m.profile?.email ?? "Unknown"}
                {m.user_id === user.id && <span className="text-slate-500 text-xs ml-1">(you)</span>}
              </p>
              {m.role === "admin" && (
                <p className="text-slate-600 text-xs">Admin</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite link */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
          👥 Invite to group
        </p>
        <p className="text-slate-400 text-sm mb-3">
          Share this link so others can join your group in TeeUp.
        </p>
        <div className="bg-slate-800 rounded-xl px-3 py-2.5 mb-3">
          <p className="text-slate-300 text-xs font-mono break-all">{inviteUrl}</p>
        </div>
        <CopyInviteButton url={inviteUrl} />
      </div>
    </div>
  );
}
