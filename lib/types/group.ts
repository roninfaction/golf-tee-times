export type Group = {
  id: string;
  name: string;
  invite_code: string;
  timezone: string;
  photo_url: string | null;
  max_members: number | null;
  default_tee_interval: number;
  org_id: string | null;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  profile?: import("./profile").Profile;
};

export type GroupWithRole = Group & {
  role: "admin" | "member";
};
