import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { groupmates, type SideBet } from "@/lib/side-bets";
import { TabsView, type TabPerson, type TabEntry } from "./TabsView";

export default async function TabsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const [mates, { data: betRows }] = await Promise.all([
    groupmates(svc, user.id),
    svc
      .from("side_bets")
      .select("*, tee_time:tee_times(course_name)")
      .or(`winner_id.eq.${user.id},loser_id.eq.${user.id}`)
      .order("created_at", { ascending: false }),
  ]);
  const bets = (betRows ?? []) as (SideBet & { tee_time: { course_name: string } | null })[];

  // Anyone with history stays listed even if they've since left the group.
  const people = new Map<string, TabPerson>(mates.map(m => [m.id, { ...m, balance: 0 }]));
  const missing = [...new Set(bets.map(b => (b.winner_id === user.id ? b.loser_id : b.winner_id)))].filter(id => !people.has(id));
  if (missing.length) {
    const { data: profiles } = await svc.from("profiles").select("id, display_name, avatar_url, venmo_username").in("id", missing);
    for (const p of profiles ?? []) people.set(p.id, { id: p.id, name: p.display_name ?? "Player", avatarUrl: p.avatar_url ?? null, venmo: p.venmo_username ?? null, balance: 0 });
  }

  const entries: TabEntry[] = bets.map(b => {
    const other = b.winner_id === user.id ? b.loser_id : b.winner_id;
    const cents = b.winner_id === user.id ? b.amount_cents : -b.amount_cents;
    const person = people.get(other);
    if (person) person.balance += cents;
    return {
      id: b.id,
      otherId: other,
      cents,
      note: b.note,
      kind: b.kind,
      course: b.tee_time?.course_name ?? null,
      createdAt: b.created_at,
    };
  });

  return <TabsView people={[...people.values()]} entries={entries} />;
}
