import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BugReportsList } from "./BugReportsList";

const DIVIDER = "rgba(80,200,110,0.10)";

export default async function AdminBugReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) redirect("/upcoming");

  const params = await searchParams;
  const statusFilter = params?.status;

  let query = svc
    .from("bug_reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter && ["open", "in_progress", "resolved", "dismissed"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data: reports, count } = await query;

  // Generate signed URLs for screenshots
  const reportsWithUrls = await Promise.all(
    (reports ?? []).map(async (report) => {
      if (!report.screenshot_path) return { ...report, screenshot_url: null };
      const { data: signed } = await svc.storage
        .from("bug-report-screenshots")
        .createSignedUrl(report.screenshot_path, 600);
      return { ...report, screenshot_url: signed?.signedUrl ?? null };
    })
  );

  const { count: openCount } = await svc
    .from("bug_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/admin" style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Admin
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16 pointer-events-none">
          Bug Reports
          {(openCount ?? 0) > 0 && (
            <span
              className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full align-middle"
              style={{ background: "rgba(255,69,58,0.2)", color: "#FF453A" }}
            >
              {openCount}
            </span>
          )}
        </h1>
      </div>

      <BugReportsList
        reports={reportsWithUrls}
        total={count ?? 0}
        statusFilter={statusFilter}
      />
    </div>
  );
}
