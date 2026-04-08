export type Profile = {
  id: string;
  display_name: string;
  email: string;
  forwarder_token: string;
  onesignal_player_id: string | null;
};

export type Group = {
  id: string;
  name: string;
  invite_code: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  profile?: Profile;
};

export type TeeTime = {
  id: string;
  created_at: string;
  created_by: string;
  group_id: string;
  course_name: string;
  tee_datetime: string;
  holes: 9 | 18;
  max_players: number;
  notes: string | null;
  confirmation_number: string | null;
  source: "manual" | "email_parse";
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
};

export type Rsvp = {
  id: string;
  tee_time_id: string;
  user_id: string;
  status: "pending" | "accepted" | "declined";
  updated_at: string;
  profile?: Profile;
};

export type GuestInvite = {
  id: string;
  tee_time_id: string;
  invited_by: string;
  token: string;
  invitee_name: string | null;
  accepted_name: string | null;
  status: "pending" | "accepted" | "expired";
  created_at: string;
  accepted_at: string | null;
};

export type TeeTimeWithDetails = TeeTime & {
  rsvps: (Rsvp & { profile: Profile })[];
  guest_invites: GuestInvite[];
  open_spots: number;
  my_rsvp: Rsvp | null;
};
