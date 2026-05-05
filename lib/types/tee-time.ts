import type { Profile } from "./profile";
import type { GuestInvite, Rsvp } from "./rsvp";

export type TeeTime = {
  id: string;
  created_at: string;
  created_by: string;
  group_id: string;
  course_name: string;
  course_place_id: string | null;
  tee_datetime: string;
  holes: 9 | 18;
  max_players: number;
  notes: string | null;
  confirmation_number: string | null;
  source: "manual" | "email_parse";
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  parent_tee_time_id: string | null;
  slot_order: number | null;
};

export type TeeTimeWithDetails = TeeTime & {
  rsvps: (Rsvp & { profile: Profile })[];
  guest_invites: GuestInvite[];
  open_spots: number;
  my_rsvp: Rsvp | null;
};
