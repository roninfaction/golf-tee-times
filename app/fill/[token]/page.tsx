import { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { formatTeeDateLong, formatTeeTime } from "@/lib/format";
import { FillSpotClient } from "./FillSpotClient";

type PageProps = { params: Promise<{ token: string }> };

export type HubPlayer = { name: string; kind: "member" | "guest"; handicap: number | null };
export type HubScore = { name: string; gross: number; net: number | null; handicap: number | null };
export type HubCourse = {
  maps_url: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
};

async function fetchInviteData(token: string) {
  const svc = createServiceClient();

  const { data: invite } = await svc
    .from("guest_invites")
    .select("*, tee_time:tee_times(id, course_name, course_place_id, tee_datetime, holes, max_players, format, group_id), inviter:profiles!invited_by(display_name)")
    .eq("token", token)
    .single();

  if (!invite) return null;

  const teeTime = invite.tee_time as {
    id: string;
    course_name: string;
    course_place_id: string | null;
    tee_datetime: string;
    holes: number;
    max_players: number;
    format: string | null;
    group_id: string;
  };
  const teeTimeId = teeTime.id;

  // Members (accepted RSVPs), accepted guests, group, course, and round scores — all in parallel.
  const [
    { data: rsvpRows },
    { data: guestRows },
    { count: acceptedGroup },
    { count: acceptedGuests },
    { data: group },
    { data: courseRow },
    { data: scoreRows },
  ] = await Promise.all([
    svc.from("rsvps")
      .select("status, profile:profiles(display_name, ghin_handicap_index)")
      .eq("tee_time_id", teeTimeId)
      .eq("status", "accepted"),
    svc.from("guest_invites")
      .select("accepted_name, invitee_name, status")
      .eq("tee_time_id", teeTimeId)
      .eq("status", "accepted"),
    svc.from("rsvps").select("*", { count: "exact", head: true }).eq("tee_time_id", teeTimeId).eq("status", "accepted"),
    svc.from("guest_invites").select("*", { count: "exact", head: true }).eq("tee_time_id", teeTimeId).eq("status", "accepted"),
    svc.from("groups").select("name, timezone").eq("id", teeTime.group_id).single(),
    teeTime.course_place_id
      ? svc.from("courses").select("maps_url, address, phone, website, lat, lng").eq("place_id", teeTime.course_place_id).maybeSingle()
      : Promise.resolve({ data: null }),
    svc.from("round_scores")
      .select("gross_score, net_score, handicap_used, profile:profiles(display_name), guest_invite:guest_invites(accepted_name)")
      .eq("tee_time_id", teeTimeId)
      .order("gross_score", { ascending: true }),
  ]);

  const openSpots = teeTime.max_players - (acceptedGroup ?? 0) - (acceptedGuests ?? 0);

  const groupTimezone = (group as { name: string; timezone?: string } | null)?.timezone ?? "America/Los_Angeles";

  // "Past" = the tee time's calendar date (in group tz) is strictly before today.
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: groupTimezone });
  const teeDateStr = new Date(teeTime.tee_datetime).toLocaleDateString("en-CA", { timeZone: groupTimezone });
  const isPast = teeDateStr < todayStr;

  const players: HubPlayer[] = [
    ...((rsvpRows ?? []) as unknown as { profile: { display_name: string; ghin_handicap_index: number | null } | null }[]).map((r) => ({
      name: r.profile?.display_name ?? "Player",
      kind: "member" as const,
      handicap: r.profile?.ghin_handicap_index ?? null,
    })),
    ...((guestRows ?? []) as { accepted_name: string | null; invitee_name: string | null }[]).map((g) => ({
      name: g.accepted_name ?? g.invitee_name ?? "Guest",
      kind: "guest" as const,
      handicap: null,
    })),
  ];

  const scores: HubScore[] = ((scoreRows ?? []) as unknown as {
    gross_score: number;
    net_score: number | null;
    handicap_used: number | null;
    profile: { display_name: string } | null;
    guest_invite: { accepted_name: string } | null;
  }[]).map((s) => ({
    name: s.profile?.display_name ?? s.guest_invite?.accepted_name ?? "Guest",
    gross: s.gross_score,
    net: s.net_score,
    handicap: s.handicap_used,
  }));

  const course = (courseRow as HubCourse | null) ?? null;

  return {
    teeTimeId,
    invite: {
      status: invite.status as string,
      inviter_name: (invite.inviter as { display_name: string })?.display_name,
    },
    teeTime: {
      course_name: teeTime.course_name,
      tee_datetime: teeTime.tee_datetime,
      holes: teeTime.holes,
      max_players: teeTime.max_players,
      format: teeTime.format,
    },
    group_name: (group as { name: string; timezone?: string } | null)?.name ?? "Golf Group",
    group_timezone: groupTimezone,
    open_spots: openSpots,
    is_past: isPast,
    course,
    players,
    scores,
  };
}

export type HubData = NonNullable<Awaited<ReturnType<typeof fetchInviteData>>>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchInviteData(token);

  if (!data) return { title: "GolfPack Invite" };

  const dateStr = formatTeeDateLong(data.teeTime.tee_datetime, data.group_timezone);
  const timeStr = formatTeeTime(data.teeTime.tee_datetime, data.group_timezone);
  const title = `Tee time at ${data.teeTime.course_name}`;
  const description = data.scores.length > 0
    ? `${dateStr} · Round results with ${data.group_name}. Tap to view.`
    : `${dateStr} at ${timeStr} · ${data.teeTime.holes} holes · with ${data.group_name}.`;

  return {
    title,
    description,
    openGraph: { title, description, siteName: "GolfPack" },
    twitter: { card: "summary", title, description },
  };
}

export default async function FillSpotPage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let loggedInUser: { id: string; displayName: string } | null = null;
  if (user) {
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    loggedInUser = {
      id: user.id,
      displayName: (profile as { display_name: string } | null)?.display_name ?? user.email ?? "You",
    };
  }

  const data = await fetchInviteData(token);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">⛳</div>
        <h1 className="text-xl font-bold text-white mb-2">Invite not found</h1>
        <p className="text-slate-400 text-sm max-w-xs">This invite link is no longer valid.</p>
      </div>
    );
  }

  return <FillSpotClient token={token} data={data} groupTz={data.group_timezone} loggedInUser={loggedInUser} />;
}
