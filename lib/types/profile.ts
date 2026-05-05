export type Profile = {
  id: string;
  display_name: string;
  email: string;
  forwarder_token: string;
  onesignal_player_id: string | null;
  avatar_url: string | null;
  active_group_id: string | null;
  forwarding_group_id: string | null;
};
