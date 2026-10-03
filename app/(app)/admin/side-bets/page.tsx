import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { money, FORMAT_LABELS } from "@/lib/game";
import type { SideBet } from "@/lib/side-bets";

const GOLD = "#C9A84C";
const GREEN = "#30D158";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const MUTED = "rgba(255,255,255,0.4)";

// Every side bet across the app: open balances between each pair, then the full ledger.
export default async function AdminSideBetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: me } = await svc.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) redirect("/upcoming");

  const { data: rows } = await svc
    .from("side_bets")
    .select("*, tee_time:tee_times(course_name, format)")
    .order("created_at", { ascending: false })
    .limit(500);
  const bets = (rows ?? []) as (SideBet & { tee_time: { course_name: string; format: string | null } | null })[];

  const ids = [...new Set(bets.flatMap(b => [b.winner_id, b.loser_id, b.created_by]))];
  const { data: profiles } = ids.length
    ? await svc.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map(p => [p.id, (p.display_name ?? "Player").trim()]));
  const name = (id: string) => nameOf.get(id) ?? "Player";

  // Open balance per pair. Key is the two ids sorted; positive = the first id is owed.
  const pairs = new Map<string, { a: string; b: string; cents: number }>();
  for (const bet of bets) {
    const [a, b] = [bet.winner_id, bet.loser_id].sort();
    const key = `${a}:${b}`;
    const pair = pairs.get(key) ?? { a, b, cents: 0 };
    pair.cents += bet.winner_id === a ? bet.amount_cents : -bet.amount_cents;
    pairs.set(key, pair);
  }
  const owing = [...pairs.values()]
    .filter(p => p.cents !== 0)
    .map(p => (p.cents > 0 ? { debtor: p.b, creditor: p.a, cents: p.cents } : { debtor: p.a, creditor: p.b, cents: -p.cents }))
    .sort((x, y) => y.cents - x.cents);

  const outstanding = owing.reduce((sum, o) => sum + o.cents, 0);
  const betCount = bets.filter(b => b.kind === "bet").length;
  const gamesSettled = new Set(bets.filter(b => b.kind === "game" && b.tee_time_id).map(b => b.tee_time_id)).size;

  function describe(b: (typeof bets)[number]) {
    // A settle row records the payer as winner_id (it offsets what they owed).
    if (b.kind === "settle") return { line: `${name(b.winner_id)} paid ${name(b.loser_id)} ${money(b.amount_cents)}`, sub: "Settled up" };
    const what = b.kind === "game"
      ? `${FORMAT_LABELS[b.tee_time?.format ?? ""] ?? "Game"}${b.tee_time ? ` at ${b.tee_time.course_name}` : ""}`
      : b.note || "Bet";
    return { line: `${name(b.winner_id)} won ${money(b.amount_cents)} from ${name(b.loser_id)}`, sub: b.kind === "game" ? `Game · ${what}` : what };
  }

  const stats = [
    { label: "Owed right now", value: money(outstanding) },
    { label: "Open tabs", value: String(owing.length) },
    { label: "Bets logged", value: String(betCount) },
    { label: "Games settled", value: String(gamesSettled) },
  ];

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium mb-3" style={{ color: GREEN }}>
          <ChevronLeft size={18} strokeWidth={2} />
          Dashboard
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#FF453A" }}>Admin</p>
        <h1 className="text-[28px] font-bold text-white tracking-tight">Side bets</h1>
      </div>

      <div className="px-4 pt-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl p-4" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs mt-0.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Who owes who</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {owing.length === 0 ? (
              <p className="px-4 py-4 text-sm" style={{ color: MUTED }}>{bets.length ? "Everyone's square." : "No side bets yet."}</p>
            ) : owing.map((o, i) => (
              <div key={`${o.debtor}:${o.creditor}`} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: i === owing.length - 1 ? "none" : `0.5px solid ${DIVIDER}` }}>
                <p className="flex-1 min-w-0 text-sm text-white truncate">
                  {name(o.debtor)} <span style={{ color: MUTED }}>owes</span> {name(o.creditor)}
                </p>
                <p className="text-sm font-semibold shrink-0" style={{ color: GOLD }}>{money(o.cents)}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
            Every entry{bets.length === 500 ? " (latest 500)" : ""}
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {bets.length === 0 ? (
              <p className="px-4 py-4 text-sm" style={{ color: MUTED }}>Nothing logged yet.</p>
            ) : bets.map((b, i) => {
              const d = describe(b);
              return (
                <div key={b.id} className="px-4 py-3" style={{ borderBottom: i === bets.length - 1 ? "none" : `0.5px solid ${DIVIDER}` }}>
                  <p className="text-sm text-white">{d.line}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {d.sub} · {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })} · logged by {name(b.created_by)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
