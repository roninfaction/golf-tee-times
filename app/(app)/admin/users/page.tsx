"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Search, Shield } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

type User = {
  id: string;
  display_name: string;
  email: string;
  is_super_admin: boolean;
  created_at: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async (tok: string, q: string) => {
    setLoading(true);
    const url = `/api/admin/users?limit=50${q ? `&search=${encodeURIComponent(q)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setToken(session.access_token);

      // Verify super admin
      const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", session.user.id).maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(profile as any)?.is_super_admin) { router.push("/upcoming"); return; }

      fetchUsers(session.access_token, "");
    });
  }, [router, fetchUsers]);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => fetchUsers(token, search), 300);
    return () => clearTimeout(t);
  }, [search, token, fetchUsers]);

  async function toggleAdmin(userId: string, current: boolean) {
    setTogglingId(userId);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: userId, is_super_admin: !current }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_super_admin: !current } : u));
    setTogglingId(null);
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/admin" style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Admin
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16">Users</h1>
      </div>

      <div className="px-4 pt-4">
        {/* Search */}
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-4" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <Search size={16} className="text-white/30 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/20"
          />
        </div>

        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {users.length === 0 ? (
              <p className="text-sm px-4 py-4" style={{ color: "rgba(255,255,255,0.3)" }}>No users found.</p>
            ) : (
              users.map((u, i) => {
                const isLast = i === users.length - 1;
                const name = u.display_name || u.email.split("@")[0];
                return (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                        {name}
                        {u.is_super_admin && <Shield size={12} style={{ color: GOLD }} />}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{u.email}</p>
                    </div>
                    <button
                      onClick={() => toggleAdmin(u.id, u.is_super_admin)}
                      disabled={togglingId === u.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl shrink-0"
                      style={{
                        background: u.is_super_admin ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.07)",
                        color: u.is_super_admin ? GOLD : "rgba(255,255,255,0.4)",
                        opacity: togglingId === u.id ? 0.5 : 1,
                      }}
                    >
                      {u.is_super_admin ? "Admin" : "Make admin"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
