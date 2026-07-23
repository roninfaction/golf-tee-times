"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const inputStyle =
  "w-full px-4 py-3.5 text-white text-[15px] bg-transparent outline-none placeholder:text-white/20";
const cardStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "0.5px solid rgba(255,255,255,0.08)",
};

type Phase = "verifying" | "form" | "invalid" | "done";

function ResetForm() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const hasRecoveryLink = !!tokenHash && searchParams.get("type") === "recovery";
  // Derive the missing-token state at init so the effect never calls setState synchronously.
  const [phase, setPhase] = useState<Phase>(hasRecoveryLink ? "verifying" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Exchange the one-time recovery token for a session on mount.
  useEffect(() => {
    if (!hasRecoveryLink || !tokenHash) return;
    const supabase = createClient();
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error }) => setPhase(error ? "invalid" : "form"));
  }, [hasRecoveryLink, tokenHash]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPhase("done");
    setTimeout(() => {
      window.location.href = "/upcoming";
    }, 1200);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <div
          className="w-16 h-16 rounded-[18px] flex items-center justify-center mx-auto mb-4 text-3xl"
          style={{ background: "rgba(48,209,88,0.15)" }}
        >
          ⛳
        </div>
        <h1 className="text-[28px] font-bold text-white tracking-tight">
          {phase === "done" ? "All set" : "New password"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          {phase === "form" && "Choose a new password for your account"}
          {phase === "verifying" && "Checking your reset link…"}
          {phase === "invalid" && "This reset link is invalid or expired"}
          {phase === "done" && "Signing you in…"}
        </p>
      </div>

      {phase === "form" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputStyle}
              style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputStyle}
            />
          </div>
          {error && (
            <p className="text-sm px-1" style={{ color: "#FF453A" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl text-base font-semibold text-black"
            style={{ background: "#30D158", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}

      {phase === "invalid" && (
        <a
          href="/login"
          className="block w-full py-4 rounded-2xl text-base font-semibold text-black text-center"
          style={{ background: "#30D158" }}
        >
          Back to sign in
        </a>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ background: "#000" }}
    >
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
