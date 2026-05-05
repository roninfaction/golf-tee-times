import type { Profile } from "./profile";

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
