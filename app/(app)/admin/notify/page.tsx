"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Check, BellOff } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const GREEN = "#30D158";

type User = {
  id: string;
  display_name: string;
  email: string;
  push_on: boolean;
};

type Result = { sent: string[]; failed: string[]; no_push: string[] };

function nameOf(u: User) {
  return u.display_name?.trim() || u.email.split("@")[0];
}

export default function AdminNotifyPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", session.user.id).maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(profile as any)?.is_super_admin) { router.push("/upcoming"); return; }
      setToken(session.access_token);
      const res = await fetch("/api/admin/users?limit=100", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const list: User[] = await res.json();
        list.sort((a, b) => Number(b.push_on) - Number(a.push_on) || nameOf(a).localeCompare(nameOf(b)));
        setUsers(list);
      } else {
        setError("Couldn't load the user list. Try refreshing.");
      }
      setLoading(false);
    });
  }, [router]);

  const reachable = users.filter(u => u.push_on);
  const recipientCount = mode === "all" ? reachable.length : picked.size;
  const canSend = message.trim().length > 0 && recipientCount > 0 && !sending;

  function togglePick(id: string) {
    setConfirming(false);
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    setSending(true);
    setError("");
    const res = await fetch("/api/admin/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: title.trim(),
        body: message.trim(),
        ...(mode === "all" ? { all: true } : { user_ids: [...picked] }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    setConfirming(false);
    if (!res.ok) {
      setError(data.error ?? "That didn't send. Try again.");
      return;
    }
    setResult(data as Result);
    setMessage("");
    setPicked(new Set());
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-safe-top pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/admin" style={{ color: GREEN }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Admin
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16 pointer-events-none">Send Notification</h1>
      </div>

      <div className="px-4 pt-4 space-y-5">
        {/* Message */}
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); setConfirming(false); }}
            maxLength={60}
            placeholder="GolfPack"
            className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/30 px-4 py-3.5"
            style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
          />
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setConfirming(false); setResult(null); }}
            maxLength={240}
            rows={3}
            placeholder="Don't forget to invite your friends to your GolfPack!"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/20 px-4 py-3.5 resize-none"
          />
          <p className="text-[11px] text-right px-4 pb-2" style={{ color: "rgba(255,255,255,0.25)" }}>{message.length}/240</p>
        </div>

        {/* Recipients */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Send to</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(["all", "pick"] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setConfirming(false); }}
                className="text-sm font-semibold py-2.5 rounded-xl"
                style={{
                  background: mode === m ? "rgba(48,209,88,0.15)" : CARD_BG,
                  color: mode === m ? GREEN : "rgba(255,255,255,0.5)",
                  border: `0.5px solid ${mode === m ? "rgba(48,209,88,0.4)" : CARD_BORDER}`,
                }}
              >
                {m === "all" ? "Everyone" : "Pick people"}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-center py-6" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
          ) : mode === "all" ? (
            <p className="text-xs px-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              {reachable.length} of {users.length} people have notifications on.
              {users.length > reachable.length && " The rest won't get this."}
            </p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {users.map((u, i) => {
                const on = picked.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => u.push_on && togglePick(u.id)}
                    disabled={!u.push_on}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ borderBottom: i === users.length - 1 ? "none" : `0.5px solid ${DIVIDER}`, opacity: u.push_on ? 1 : 0.45 }}
                  >
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: on ? GREEN : "transparent", border: `1.5px solid ${on ? GREEN : "rgba(255,255,255,0.25)"}` }}
                    >
                      {on && <Check size={13} strokeWidth={3} color="#000" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-white truncate">{nameOf(u)}</span>
                    {!u.push_on && (
                      <span className="text-xs flex items-center gap-1 shrink-0" style={{ color: "#FF9F0A" }}>
                        <BellOff size={11} /> Off
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm px-1" style={{ color: "#FF453A" }}>{error}</p>}

        {/* Send */}
        {confirming ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={sending}
              className="text-sm font-semibold py-3.5 rounded-2xl"
              style={{ background: CARD_BG, color: "rgba(255,255,255,0.6)", border: `0.5px solid ${CARD_BORDER}` }}
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending}
              className="text-sm font-bold py-3.5 rounded-2xl"
              style={{ background: GREEN, color: "#000", opacity: sending ? 0.5 : 1 }}
            >
              {sending ? "Sending…" : `Yes, send to ${recipientCount}`}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            className="w-full text-sm font-bold py-3.5 rounded-2xl"
            style={{ background: canSend ? GREEN : "rgba(255,255,255,0.08)", color: canSend ? "#000" : "rgba(255,255,255,0.3)" }}
          >
            {recipientCount === 0 ? "Pick who gets it" : `Send to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}`}
          </button>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <p className="text-sm font-semibold" style={{ color: GREEN }}>
              Sent to {result.sent.length} {result.sent.length === 1 ? "person" : "people"}
            </p>
            {result.sent.length > 0 && (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{result.sent.join(", ")}</p>
            )}
            {result.failed.length > 0 && (
              <p className="text-xs" style={{ color: "#FF453A" }}>
                Didn&apos;t go through: {result.failed.join(", ")}
              </p>
            )}
            {result.no_push.length > 0 && (
              <p className="text-xs" style={{ color: "#FF9F0A" }}>Notifications off: {result.no_push.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
