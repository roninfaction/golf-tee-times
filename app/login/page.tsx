"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup";

const inputStyle = "w-full px-4 py-3.5 text-white text-[15px] bg-transparent outline-none placeholder:text-white/20";
const dividerStyle = { borderBottom: "0.5px solid rgba(255,255,255,0.08)" } as React.CSSProperties;
const cardStyle = { background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.08)" };

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/upcoming";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    } else {
      window.location.href = next;
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error?.message?.toLowerCase().includes("already registered")) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInError) {
        setError("An account with this email already exists. Try signing in instead.");
      } else {
        window.location.href = next;
      }
      return;
    }

    if (error) { setLoading(false); setError(error.message); return; }

    if (data.session) {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ display_name: name.trim() }),
      });
      window.location.href = next;
    } else {
      setLoading(false);
      setError("Email confirmation required — disable it in Supabase Auth settings.");
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-[18px] flex items-center justify-center mx-auto mb-4 text-3xl" style={{ background: "rgba(48,209,88,0.15)" }}>
          ⛳
        </div>
        <h1 className="text-[28px] font-bold text-white tracking-tight">GolfPack</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Golf scheduling for your group</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl mb-6 p-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        {(["signin", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(""); }}
            className="flex-1 py-2 rounded-[10px] text-sm font-semibold transition-all"
            style={{
              background: mode === m ? "rgba(255,255,255,0.1)" : "transparent",
              color: mode === m ? "#fff" : "rgba(255,255,255,0.4)",
            }}
          >
            {m === "signin" ? "Sign In" : "Create Account"}
          </button>
        ))}
      </div>

      {mode === "signin" ? (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" className={inputStyle} style={dividerStyle} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required autoComplete="current-password" className={inputStyle} />
          </div>
          {error && <p className="text-sm px-1" style={{ color: "#FF453A" }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-4 rounded-2xl text-base font-semibold text-black" style={{ background: "#30D158", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (e.g. Matt)" required autoComplete="name" className={inputStyle} style={dividerStyle} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" className={inputStyle} style={dividerStyle} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" required minLength={6} autoComplete="new-password" className={inputStyle} />
          </div>
          {error && <p className="text-sm px-1" style={{ color: "#FF453A" }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-4 rounded-2xl text-base font-semibold text-black" style={{ background: "#30D158", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
      )}

      <div className="mt-8 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
        <p className="text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>📱 iPhone users</p>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
          For push notifications, install GolfPack to your home screen:{" "}
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Safari → Share → Add to Home Screen</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: "#000" }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
