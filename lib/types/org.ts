export type Organization = {
  id: string;
  created_at: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  invite_code: string;
  billing_status: "trial" | "active" | "suspended";
};

export type OrgMember = {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  profile?: import("./profile").Profile;
};

export type OrgWithGroups = Organization & {
  groups: import("./group").Group[];
  member_count: number;
};
