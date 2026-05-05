import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Building2, Calendar, BarChart3 } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

async function getStats(token: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) redirect("/upcoming");

  // Fetch stats via the API so we reuse the guard logic
  const { data: { session } } = await supabase.auth.getSession();
  const stats = await getStats(session?.access_token ?? "");

  const statCards = [
    { label: "Total users", value: stats?.total_users ?? "—", icon: Users, sub: `+${stats?.recent_users_30d ?? 0} this month` },
    { label: "Organizations", value: stats?.total_orgs ?? "—", icon: Building2, sub: null },
    { label: "Tee times", value: stats?.total_tee_times ?? "—", icon: Calendar, sub: `+${stats?.recent_tee_times_30d ?? 0} this month` },
    { label: "Groups", value: stats?.total_groups ?? "—", icon: BarChart3, sub: null },
  ];

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#FF453A" }}>Admin</p>
        <h1 className="text-[28px] font-bold text-white tracking-tight">Dashboard</h1>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map(({ label, value, icon: Icon, sub }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              <Icon size={18} className="mb-2" style={{ color: GOLD }} />
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs mt-0.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</p>
              {sub && <p className="text-xs mt-1" style={{ color: "#30D158" }}>{sub}</p>}
            </div>
          ))}
        </div>

        {/* Nav links */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Manage</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {[
              { href: "/admin/orgs", label: "Organizations", desc: "View all clubs, manage billing status" },
              { href: "/admin/users", label: "Users", desc: "Search users, manage admin access" },
            ].map((item, i, arr) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between px-4 py-4 transition-opacity active:opacity-70"
                style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${DIVIDER}` : "none" }}
              >
                <div>
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{item.desc}</p>
                </div>
                <span className="text-white/20">›</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
