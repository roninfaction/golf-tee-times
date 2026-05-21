import { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { formatTeeDateLong, formatTeeTime } from "@/lib/format";
import { FillSpotClient } from "./FillSpotClient";

type PageProps = { params: Promise<{ token: string }> };

async function fetchInviteData(token: string) {
  const svc = createServiceClient();

  const { data: invite } = await svc
    .from("guest_invites")
    .select("*, tee_time:tee_times(course_name, tee_datetime, holes, max_players, group_id), inviter:profiles!invited_by(display_name)")
    .eq("token", token)
    .single();

  if (!invite) return null;

  const teeTime = invite.tee_time as { course_name: string; tee_datetime: string; holes: number; max_players: number; group_id: string };

  const { count: acceptedGroup } = await svc
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", invite.tee_time_id)
    .eq("status", "accepted");

  const { count: acceptedGuests } = await svc
    .from("guest_invites")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", invite.tee_time_id)
    .eq("status", "accepted");

  const openSpots = teeTime.max_players - (acceptedGroup ?? 0) - (acceptedGuests ?? 0);

  const { data: group } = await svc
    .from("groups")
    .select("name, timezone")
    .eq("id", teeTime.group_id)
    .single();

  return {
    invite: {
      status: invite.status as string,
      inviter_name: (invite.inviter as { display_name: string })?.display_name,
    },
    teeTime: {
      course_name: teeTime.course_name,
      tee_datetime: teeTime.tee_datetime,
      holes: teeTime.holes,
      max_players: teeTime.max_players,
    },
    group_name: (group as { name: string; timezone?: string } | null)?.name ?? "Golf Group",
    group_timezone: (group as { name: string; timezone?: string } | null)?.timezone ?? "America/Los_Angeles",
    open_spots: openSpots,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchInviteData(token);

  if (!data || data.invite.status !== "pending") {
    return { title: "GolfPack Invite" };
  }

  const dateStr = formatTeeDateLong(data.teeTime.tee_datetime, data.group_timezone);
  const timeStr = formatTeeTime(data.teeTime.tee_datetime, data.group_timezone);
  const title = `Tee time at ${data.teeTime.course_name}`;
  const description = `${dateStr} at ${timeStr} · ${data.teeTime.holes} holes · with ${data.group_name}. Tap to claim your spot.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "GolfPack",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
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

  if (data.invite.status !== "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">😬</div>
        <h1 className="text-xl font-bold text-white mb-2">This spot is taken</h1>
        <p className="text-slate-400 text-sm max-w-xs">
          Someone else accepted this invite first. Ask {data.invite.inviter_name ?? "your friend"} for a new link.
        </p>
      </div>
    );
  }

  if (data.open_spots <= 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">🏌️</div>
        <h1 className="text-xl font-bold text-white mb-2">Tee time is full</h1>
        <p className="text-slate-400 text-sm">{data.teeTime.course_name} is fully booked.</p>
      </div>
    );
  }

  return <FillSpotClient token={token} data={data} groupTz={data.group_timezone} loggedInUser={loggedInUser} />;
}
