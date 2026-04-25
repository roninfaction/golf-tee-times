import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyInviteButton } from "@/components/CopyInviteButton";
import { GroupPhotoUpload } from "@/components/GroupPhotoUpload";
import type { GroupMember, Profile } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";
const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default async function GroupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: membership } = await svc
    .from("group_members")
    .select("group_id, role, group:groups(id, name, invite_code, photo_url)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white mb-2 font-medium">You&apos;re not in a group yet.</p>
        <Link href="/group/setup" className="text-sm font-semibold" style={{ color: "#30D158" }}>
          Set up your group
        </Link>
      </div>
    );
  }

  const group = membership.group as unknown as { id: string; name: string; invite_code: string; photo_url: string | null };
  const inviteUrl = `${APP_URL}/invite/${group.invite_code}`;

  const { data: members } = await svc
    .from("group_members")
    .select("*, profile:profiles(id, display_name, email, avatar_url)")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });

  return (
    <div className="min-h-screen pb-52">
      {/* Full-bleed banner photo — sits under the status bar */}
      <div className="pt-12">
        <GroupPhotoUpload
          groupId={group.id}
          currentPhotoUrl={group.photo_url}
        />
      </div>

      {/* Header — sits below the banner */}
      <div className="px-4 pt-4 pb-5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <h1 className="text-[26px] font-bold text-white tracking-tight">{group.name}</h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {(members ?? []).length} members
        </p>
      </div>

      <div className="px-4 pt-6 space-y-6">

        {/* Members */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Members</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {(members ?? []).map((m: GroupMember & { profile: Profile & { avatar_url?: string | null } }, i) => {
              const isLast = i === (members ?? []).length - 1;
              const name = m.profile?.display_name || m.profile?.email || "Unknown";
              const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <div
                  key={m.id ?? i}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}
                >
                  {m.profile?.avatar_url ? (
                    <img
                      src={m.profile.avatar_url}
                      alt={name}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {name}
                      {m.user_id === user.id && <span className="ml-1.5 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>you</span>}
                    </p>
                    {m.role === "admin" && (
                      <p className="text-xs mt-0.5" style={{ color: GOLD }}>Admin</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite link */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Invite link</p>
          <div className="rounded-2xl p-4 space-y-3" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              Share this link to add someone to your group.
            </p>
            <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(201,168,76,0.10)", border: "0.5px solid rgba(201,168,76,0.22)" }}>
              <p className="text-xs font-mono break-all" style={{ color: GOLD }}>{inviteUrl}</p>
            </div>
            <CopyInviteButton url={inviteUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}
