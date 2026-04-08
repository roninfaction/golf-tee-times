"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/upcoming";
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6">
      <div className="mb-10 text-center">
        <div className="text-5xl mb-3">⛳</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">TeeUp</h1>
        <p className="text-slate-400 mt-2 text-sm">Golf scheduling for your group</p>
      </div>

      <div className="w-full max-w-sm">
        {!sent ? (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-base"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-base transition-colors"
            >
              {loading ? "Sending…" : "Send code"}
            </button>
            <p className="text-slate-500 text-xs text-center">
              No password needed. We&apos;ll email you a 6-digit code.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="bg-green-950 border border-green-800 rounded-2xl p-4 text-center mb-2">
              <p className="text-green-300 text-sm">
                Code sent to <strong>{email}</strong>
              </p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5" htmlFor="code">
                Enter 6-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                maxLength={6}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-base text-center tracking-widest text-xl"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-base transition-colors"
            >
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              className="w-full text-slate-400 text-sm underline"
              onClick={() => { setSent(false); setCode(""); setError(""); }}
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="mt-10 p-4 bg-slate-900 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            📱 iPhone users
          </p>
          <p className="text-slate-400 text-xs leading-relaxed">
            To get push notifications, install TeeUp to your home screen:{" "}
            <strong className="text-slate-300">Safari → Share → Add to Home Screen</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
