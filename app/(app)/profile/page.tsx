"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Copy, Check, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

const EMAIL_FORWARD_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_FORWARD_DOMAIN ?? "tee.yourdomain.com";

export default function ProfilePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [forwarderToken, setForwarderToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const forwardingEmail = forwarderToken
    ? `tee-${forwarderToken}@${EMAIL_FORWARD_DOMAIN}`
    : "";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setForwarderToken("__NO_SESSION__");
        setLoading(false);
        return;
      }
      fetch("/api/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(async (r) => {
          const text = await r.text();
          try {
            const data = JSON.parse(text);
            if (data.error) {
              setForwarderToken(`__ERR:${data.error}__`);
            } else {
              setDisplayName(data.display_name ?? "");
              setForwarderToken(data.forwarder_token ?? "__NO_TOKEN__");
              setEmail(data.email ?? "");
            }
          } catch {
            setForwarderToken(`__RAW:${text.slice(0, 120)}__`);
          }
          setLoading(false);
        })
        .catch((e) => { setForwarderToken(`__FETCH_ERR:${e}__`); setLoading(false); });
    });
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ display_name: displayName }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(forwardingEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-white mb-6">Profile</h1>

      {/* Display name */}
      <form onSubmit={saveProfile} className="mb-6">
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <label className="block text-xs text-slate-500 uppercase tracking-wide mb-3">
            Your name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 mb-3"
          />
          <p className="text-xs text-slate-600 mb-3">{email}</p>
          <button
            type="submit"
            disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {saved ? <Check size={14} /> : null}
            {saved ? "Saved!" : saving ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>

      {/* Email forwarding */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 mb-6">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
          📧 Email forwarding address
        </p>
        <p className="text-slate-400 text-sm mb-3 leading-relaxed">
          Forward any golf course confirmation email to this address and TeeUp will
          automatically create the tee time for your group.
        </p>
        {loading ? (
          <p className="text-slate-600 text-sm">Loading…</p>
        ) : forwardingEmail ? (
          <>
            <div className="bg-slate-800 rounded-xl px-4 py-3 mb-3">
              <p className="text-green-400 font-mono text-sm break-all">{forwardingEmail}</p>
            </div>
            <button
              onClick={copyEmail}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy address"}
            </button>
          </>
        ) : (
          <p className="text-slate-500 text-sm">No forwarding address found.</p>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="flex items-center gap-2 text-slate-500 hover:text-red-400 text-sm transition-colors"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </div>
  );
}
