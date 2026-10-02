"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { money } from "@/lib/game";

const GREEN = "#30D158";
const RED = "#FF453A";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const MUTED = "rgba(255,255,255,0.4)";

export type TabPerson = { id: string; name: string; avatarUrl: string | null; balance: number };
export type TabEntry = { id: string; otherId: string; cents: number; note: string | null; kind: string; course: string | null; createdAt: string };

async function authHeaders() {
  const { data: { session } } = await createClient().auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

function Avatar({ person }: { person: TabPerson }) {
  if (person.avatarUrl) return <img src={person.avatarUrl} alt={person.name} className="w-9 h-9 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}>
      {person.name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function balanceLabel(cents: number) {
  if (cents > 0) return { text: `owes you ${money(cents)}`, color: GREEN };
  if (cents < 0) return { text: `you owe ${money(cents)}`, color: RED };
  return { text: "square", color: "rgba(255,255,255,0.35)" };
}

export function TabsView({ people, entries }: { people: TabPerson[]; entries: TabEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSettle, setConfirmSettle] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // New bet form
  const [who, setWho] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [iWon, setIWon] = useState<boolean | null>(null);

  const total = people.reduce((sum, p) => sum + p.balance, 0);
  const withHistory = new Set(entries.map(e => e.otherId));
  const listed = people
    .filter(p => withHistory.has(p.id))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name));

  function startAdding(personId?: string) {
    setWho(personId ?? "");
    setAmount("");
    setNote("");
    setIWon(null);
    setError(null);
    setAdding(true);
  }

  async function saveBet() {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!who) return setError("Pick who the bet is with.");
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter how much, like 5.");
    if (iWon === null) return setError("Say who won.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/side-bets", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ other_user_id: who, amount_cents: cents, note, i_won: iWon }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "Couldn't save the bet. Try again.");
    }
    setAdding(false);
    setOpen(who);
    router.refresh();
  }

  async function settleUp(personId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/side-bets/settle", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ other_user_id: personId }),
    });
    setBusy(false);
    setConfirmSettle(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't settle up. Try again.");
    }
    router.refresh();
  }

  async function deleteEntry(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/side-bets/${id}`, { method: "DELETE", headers: await authHeaders() });
    setBusy(false);
    setConfirmDelete(null);
    if (!res.ok) setError("Couldn't delete that. Try again.");
    router.refresh();
  }

  return (
    <div className="px-4 pt-12 pb-52">
      <Link href="/group" className="inline-flex items-center gap-1 text-sm font-medium mb-4" style={{ color: GREEN }}>
        <ChevronLeft size={18} strokeWidth={2} />
        Group
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Side bets</h1>
          <p className="text-sm mt-0.5" style={{ color: total > 0 ? GREEN : total < 0 ? RED : MUTED }}>
            {listed.length === 0 ? "A running tab with each friend" : total > 0 ? `You're up ${money(total)}` : total < 0 ? `You're down ${money(total)}` : "All square"}
          </p>
        </div>
        {!adding && people.length > 0 && (
          <button
            onClick={() => startAdding()}
            aria-label="New bet"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: GREEN }}
          >
            <Plus size={20} strokeWidth={2.5} className="text-black" />
          </button>
        )}
      </div>

      {/* New bet */}
      {adding && (
        <div className="rounded-2xl p-4 mb-6 space-y-4" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">New bet</p>
            <button onClick={() => setAdding(false)} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center" style={{ color: MUTED }}>
              <X size={18} />
            </button>
          </div>

          <div>
            <p className="text-xs mb-2" style={{ color: MUTED }}>With</p>
            <div className="flex flex-wrap gap-2">
              {people.map(p => (
                <button
                  key={p.id}
                  onClick={() => setWho(p.id)}
                  className="px-3 py-2 rounded-xl text-sm font-medium"
                  style={{
                    background: who === p.id ? GREEN : "rgba(255,255,255,0.05)",
                    color: who === p.id ? "#000" : "rgba(255,255,255,0.7)",
                    border: who === p.id ? "none" : `0.5px solid ${CARD_BORDER}`,
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 px-3 rounded-xl w-28 shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: `0.5px solid ${CARD_BORDER}` }}>
              <span className="text-sm" style={{ color: MUTED }}>$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                aria-label="Amount"
                className="w-full py-3 bg-transparent text-sm text-white outline-none placeholder:text-white/20"
              />
            </div>
            <input
              value={note}
              maxLength={120}
              onChange={e => setNote(e.target.value)}
              placeholder="What for? (closest to pin)"
              className="flex-1 min-w-0 px-3 py-3 rounded-xl bg-transparent text-sm text-white outline-none placeholder:text-white/25"
              style={{ background: "rgba(255,255,255,0.04)", border: `0.5px solid ${CARD_BORDER}` }}
            />
          </div>

          <div className="flex rounded-xl overflow-hidden" style={{ border: `0.5px solid ${CARD_BORDER}` }}>
            {[{ v: true, l: "I won" }, { v: false, l: "They won" }].map(o => (
              <button
                key={o.l}
                onClick={() => setIWon(o.v)}
                className="flex-1 py-2.5 text-sm font-semibold"
                style={{
                  background: iWon === o.v ? (o.v ? GREEN : "rgba(255,69,58,0.9)") : "transparent",
                  color: iWon === o.v ? (o.v ? "#000" : "#fff") : "rgba(255,255,255,0.55)",
                }}
              >
                {o.l}
              </button>
            ))}
          </div>

          {error && <p className="text-sm" style={{ color: RED }}>{error}</p>}

          <button
            onClick={saveBet}
            disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-semibold text-black"
            style={{ background: GREEN, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Saving…" : "Add to the tab"}
          </button>
        </div>
      )}

      {!adding && error && <p className="text-sm mb-4 px-1" style={{ color: RED }}>{error}</p>}

      {/* Tabs */}
      {listed.length === 0 && !adding ? (
        <div className="text-center py-14 px-4">
          <p className="font-medium text-white mb-1">No bets yet</p>
          <p className="text-sm mb-7 leading-relaxed" style={{ color: MUTED }}>
            Log a bet when someone loses one on the course. GolfPack keeps the running tab, and games with money on them land here too.
          </p>
          {people.length > 0 ? (
            <button onClick={() => startAdding()} className="font-semibold px-5 py-2.5 rounded-xl text-sm text-black" style={{ background: GREEN }}>
              Log a bet
            </button>
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>Invite friends to your group first.</p>
          )}
        </div>
      ) : listed.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          {listed.map((p, i) => {
            const b = balanceLabel(p.balance);
            const isOpen = open === p.id;
            const history = entries.filter(e => e.otherId === p.id);
            return (
              <div key={p.id} style={{ borderBottom: i === listed.length - 1 ? "none" : `0.5px solid ${DIVIDER}` }}>
                <button onClick={() => setOpen(isOpen ? null : p.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70">
                  <Avatar person={p} />
                  <span className="flex-1 min-w-0 text-sm font-medium text-white truncate">{p.name}</span>
                  <span className="text-sm font-semibold shrink-0" style={{ color: b.color }}>{b.text}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                      {history.map((e, j) => (
                        <div key={e.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderBottom: j === history.length - 1 ? "none" : `0.5px solid ${DIVIDER}` }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {e.kind === "settle" ? "Settled up" : e.note || (e.kind === "game" ? "Game" : "Bet")}
                            </p>
                            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                              {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {e.course && e.kind !== "game" ? ` · ${e.course}` : ""}
                            </p>
                          </div>
                          <span className="text-sm font-semibold shrink-0" style={{ color: e.kind === "settle" ? MUTED : e.cents > 0 ? GREEN : RED }}>
                            {e.cents > 0 ? "+" : "−"}{money(e.cents)}
                          </span>
                          {confirmDelete === e.id ? (
                            <button onClick={() => deleteEntry(e.id)} disabled={busy} className="text-xs font-semibold shrink-0 px-2 py-1.5" style={{ color: RED }}>
                              Delete
                            </button>
                          ) : (
                            <button onClick={() => setConfirmDelete(e.id)} aria-label="Delete entry" className="w-8 h-8 -mr-2 flex items-center justify-center shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => startAdding(p.id)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)" }}
                      >
                        New bet
                      </button>
                      {p.balance !== 0 && (
                        confirmSettle === p.id ? (
                          <button
                            onClick={() => settleUp(p.id)}
                            disabled={busy}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black"
                            style={{ background: GREEN, opacity: busy ? 0.6 : 1 }}
                          >
                            {busy ? "Settling…" : `Paid ${money(p.balance)}?`}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmSettle(p.id)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                            style={{ background: "rgba(48,209,88,0.12)", color: GREEN }}
                          >
                            Settle up
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {listed.length > 0 && (
        <p className="text-xs text-center mt-4 px-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
          Only you and the other person can see a tab. Settling up keeps the history.
        </p>
      )}
    </div>
  );
}
