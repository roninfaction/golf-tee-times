"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function NewTeeTiePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [courseName, setCourseName] = useState("");
  const [teeDate, setTeeDate] = useState("");
  const [teeTime, setTeeTime] = useState("08:00");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [notes, setNotes] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/tee-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_name: courseName,
        tee_datetime: `${teeDate}T${teeTime}:00`,
        holes,
        max_players: maxPlayers,
        notes: notes || null,
        confirmation_number: confirmationNumber || null,
      }),
    });

    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/tee-times/${data.id}`);
    } else {
      const err = await res.json();
      setError(err.error ?? "Something went wrong");
    }
  }

  // Default tee date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/upcoming" className="text-slate-400 hover:text-white p-1 -ml-1">
          <ChevronLeft size={24} />
        </Link>
        <h1 className="text-xl font-bold text-white">Add Tee Time</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Course name */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Course name *</label>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="Pine Valley Golf Club"
            required
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </div>

        {/* Date and time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Date *</label>
            <input
              type="date"
              value={teeDate}
              onChange={(e) => setTeeDate(e.target.value)}
              min={minDate}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 appearance-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Tee time *</label>
            <input
              type="time"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
          </div>
        </div>

        {/* Holes toggle */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Holes</label>
          <div className="flex gap-2">
            {([18, 9] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHoles(h)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  holes === h
                    ? "bg-green-600 text-white"
                    : "bg-slate-900 border border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {h} holes
              </button>
            ))}
          </div>
        </div>

        {/* Max players */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Max players</label>
          <div className="flex gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxPlayers(n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  maxPlayers === n
                    ? "bg-green-600 text-white"
                    : "bg-slate-900 border border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Confirmation number (optional) */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">
            Confirmation # <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="text"
            value={confirmationNumber}
            onChange={(e) => setConfirmationNumber(e.target.value)}
            placeholder="GN-12345"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </div>

        {/* Notes (optional) */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">
            Notes <span className="text-slate-600">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Cart included, check in 30 min early…"
            rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-base transition-colors mt-2"
        >
          {loading ? "Creating…" : "Add tee time"}
        </button>
      </form>

      {/* Email forward tip */}
      <div className="mt-6 p-4 bg-slate-900 rounded-xl border border-slate-800">
        <p className="text-slate-400 text-xs leading-relaxed">
          💡 <strong className="text-slate-300">Tip:</strong> Got a confirmation email from the course?
          Forward it to your personal GolfPack address in your{" "}
          <a href="/profile" className="text-green-400 underline">profile</a> and it&apos;ll
          auto-create the tee time for you.
        </p>
      </div>
    </div>
  );
}
