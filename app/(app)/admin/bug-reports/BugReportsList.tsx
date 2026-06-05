"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open:        { bg: "rgba(255,69,58,0.15)",   text: "#FF453A", label: "Open" },
  in_progress: { bg: "rgba(255,159,10,0.15)",  text: "#FF9F0A", label: "In Progress" },
  resolved:    { bg: "rgba(48,209,88,0.15)",   text: "#30D158", label: "Resolved" },
  dismissed:   { bg: "rgba(255,255,255,0.07)", text: "rgba(255,255,255,0.35)", label: "Dismissed" },
};

const TABS = [
  { label: "All",         value: "" },
  { label: "Open",        value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Resolved",    value: "resolved" },
  { label: "Dismissed",   value: "dismissed" },
];

type BugReport = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  title: string;
  description: string | null;
  status: string;
  admin_notes: string | null;
  screenshot_url: string | null;
  page_url: string | null;
  created_at: string;
};

function ReportCard({ report }: { report: BugReport }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(report.status);
  const [notes, setNotes] = useState(report.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const badge = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  const date = new Date(report.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  async function save() {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/admin/bug-reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ id: report.id, status, admin_notes: notes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: badge.bg, color: badge.text }}
            >
              {badge.label}
            </span>
            <p className="text-sm font-medium text-white truncate">{report.title}</p>
          </div>
          <p className="text-xs mt-1 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
            {report.user_name ?? report.user_email ?? "Unknown user"} · {date}
          </p>
        </div>
        {expanded
          ? <ChevronUp size={16} className="shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          : <ChevronDown size={16} className="shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }} />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: `0.5px solid ${DIVIDER}` }}>
          {/* User info */}
          <div className="pt-3 space-y-0.5">
            {report.user_name && <p className="text-xs text-white">{report.user_name}</p>}
            {report.user_email && <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{report.user_email}</p>}
            {report.page_url && (
              <a
                href={report.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs"
                style={{ color: "#30D158" }}
              >
                <ExternalLink size={10} />
                {report.page_url.replace(/^https?:\/\/[^/]+/, "")}
              </a>
            )}
          </div>

          {/* Description */}
          {report.description && (
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              {report.description}
            </p>
          )}

          {/* Screenshot */}
          {report.screenshot_url && (
            <a href={report.screenshot_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={report.screenshot_url}
                alt="Bug report screenshot"
                className="w-full rounded-xl object-cover max-h-56"
              />
            </a>
          )}

          {/* Status select */}
          <div style={{ borderTop: `0.5px solid ${DIVIDER}`, paddingTop: 12 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Status</p>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.07)", border: `0.5px solid ${CARD_BORDER}` }}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          {/* Admin notes */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Admin Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes…"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none placeholder:text-white/20"
              style={{ background: "rgba(255,255,255,0.07)", border: `0.5px solid ${CARD_BORDER}` }}
            />
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{
              background: saved ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.08)",
              color: saved ? "#30D158" : "rgba(255,255,255,0.7)",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

export function BugReportsList({
  reports,
  total,
  statusFilter,
}: {
  reports: BugReport[];
  total: number;
  statusFilter?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const active = statusFilter ?? "";

  function setTab(val: string) {
    const url = val ? `${pathname}?status=${val}` : pathname;
    router.push(url);
  }

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setTab(tab.value)}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: active === tab.value ? "rgba(80,200,110,0.15)" : "rgba(255,255,255,0.07)",
              color: active === tab.value ? "#30D158" : "rgba(255,255,255,0.4)",
              border: active === tab.value ? "0.5px solid rgba(80,200,110,0.3)" : "0.5px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: "rgba(255,255,255,0.3)" }}>
          No reports{active ? ` with status "${active}"` : ""}.
        </p>
      ) : (
        <>
          <p className="text-xs px-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            {total} report{total !== 1 ? "s" : ""}
          </p>
          <div className="space-y-3">
            {reports.map(r => <ReportCard key={r.id} report={r} />)}
          </div>
        </>
      )}
    </div>
  );
}
