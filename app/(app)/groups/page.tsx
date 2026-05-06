import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Users, Building2, ChevronLeft } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: memberships } = await svc
    .from("group_members")
    .select("role, group:groups(id, name, invite_code, photo_url, timezone, org_id, organizations(name))")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const groups = (memberships ?? []).map((m) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(m.group as any),
    role: m.role,
  }));

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/group" className="inline-flex items-center gap-0.5 text-sm font-medium mb-3" style={{ color: "#30D158" }}>
          <ChevronLeft size={18} strokeWidth={2} />
          Back
        </Link>
        <h1 className="text-[28px] font-bold text-white tracking-tight">Your Groups</h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {groups.length} group{groups.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="px-4 pt-5 space-y-3">
        {groups.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-medium text-white mb-1">No groups yet</p>
            <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.4)" }}>
              Create one for your crew or join with an invite link
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <Link
              key={g.id}
              href={`/group/${g.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl transition-opacity active:opacity-70"
              style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
            >
              {g.photo_url ? (
                <img src={g.photo_url} alt={g.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <Users size={22} className="text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{g.name}</p>
                {g.organizations?.name && (
                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: GOLD }}>
                    <Building2 size={10} />
                    {g.organizations.name}
                  </p>
                )}
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {g.role === "admin" ? "Admin" : "Member"}
                </p>
              </div>
            </Link>
          ))
        )}

        {/* Actions */}
        <div className="rounded-2xl overflow-hidden mt-4" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <Link
            href="/group/setup"
            className="flex items-center gap-3 px-4 py-3.5 transition-opacity active:opacity-70"
            style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(48,209,88,0.15)" }}>
              <Plus size={16} style={{ color: "#30D158" }} />
            </div>
            <p className="text-sm font-medium text-white">Create a new group</p>
          </Link>
          <Link
            href="/invite"
            className="flex items-center gap-3 px-4 py-3.5 transition-opacity active:opacity-70"
            style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(201,168,76,0.15)" }}>
              <Users size={16} style={{ color: GOLD }} />
            </div>
            <p className="text-sm font-medium text-white">Join with an invite link</p>
          </Link>
          <Link
            href="/org/new"
            className="flex items-center gap-3 px-4 py-3.5 transition-opacity active:opacity-70"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(201,168,76,0.15)" }}>
              <Building2 size={16} style={{ color: GOLD }} />
            </div>
            <p className="text-sm font-medium text-white">Create a club or organization</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
