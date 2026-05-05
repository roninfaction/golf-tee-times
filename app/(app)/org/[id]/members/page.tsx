import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

type Params = { params: Promise<{ id: string }> };

export default async function OrgMembersPage({ params }: Params) {
  const { id: orgId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: myMembership } = await svc
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) redirect(`/org/${orgId}`);

  const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).single();

  const { data: members } = await svc
    .from("org_members")
    .select("id, role, joined_at, profile:profiles(id, display_name, email, avatar_url)")
    .eq("org_id", orgId)
    .order("joined_at", { ascending: true });

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href={`/org/${orgId}`} style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          {org?.name ?? "Org"}
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16">Members</h1>
      </div>

      <div className="px-4 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
          {(members ?? []).length} members
        </p>
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          {(members ?? []).map((m, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profile = m.profile as any;
            const name = profile?.display_name || profile?.email || "Unknown";
            const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
            const isLast = i === (members ?? []).length - 1;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {name}
                    {profile?.id === user.id && <span className="ml-1.5 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>you</span>}
                  </p>
                  <p className="text-xs mt-0.5 capitalize" style={{ color: m.role === "owner" ? GOLD : "rgba(255,255,255,0.35)" }}>
                    {m.role}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
