"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinGroupButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setLoading(true);
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/upcoming");
    } else {
      const err = await res.json();
      setError(err.error ?? "Could not join group");
    }
  }

  return (
    <>
      <button
        onClick={join}
        disabled={loading}
        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold px-8 py-3.5 rounded-xl text-base transition-colors"
      >
        {loading ? "Joining…" : `Join ${groupName}`}
      </button>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </>
  );
}
