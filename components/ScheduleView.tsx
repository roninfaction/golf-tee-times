"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatTeeTime } from "@/lib/format";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type ScheduleRow = {
  id: string;
  course_name: string;
  tee_datetime: string;
  holes: number;
  max_players: number;
  accepted_count: number;
  my_rsvp: { status: string } | null;
  course_photo: string | null;
};

function getLocalDateStr(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function daysUntil(isoString: string, tz: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diff = Math.round(
    (new Date(getLocalDateStr(d, tz)).getTime() - new Date(getLocalDateStr(now, tz)).getTime()) / 86400000
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return `In ${diff} days`;
  return d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}

function getWeekDayStrs(referenceDate: Date, tz: string): string[] {
  const todayStr = getLocalDateStr(referenceDate, tz);
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(referenceDate);
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeek);
  const diff = dayIdx === 0 ? -6 : 1 - dayIdx;
  return Array.from({ length: 7 }, (_, i) => {
    const base = new Date(todayStr + "T12:00:00Z");
    base.setUTCDate(base.getUTCDate() + diff + i);
    return getLocalDateStr(base, tz);
  });
}

function getMonthDays(year: number, month: number): (string | null)[] {
  const firstDate = new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00Z`);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dow = firstDate.getUTCDay();
  const offset = (dow + 6) % 7;
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - offset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
  });
}

export function ScheduleView({ rows, groupTz }: { rows: ScheduleRow[]; groupTz: string }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => getLocalDateStr(today, groupTz), [today, groupTz]);
  const weekDayStrs = useMemo(() => getWeekDayStrs(today, groupTz), [today, groupTz]);
  const weekMonthLabel = useMemo(() =>
    new Date(weekDayStrs[0] + "T12:00:00Z").toLocaleDateString("en-US", {
      timeZone: groupTz, month: "long", year: "numeric",
    }), [weekDayStrs, groupTz]);

  const todayYear = parseInt(todayStr.slice(0, 4));
  const todayMonth = parseInt(todayStr.slice(5, 7));
  const rawMonth = todayMonth + monthOffset;
  const displayYear = todayYear + Math.floor((rawMonth - 1) / 12);
  const displayMonth = ((rawMonth - 1 + 120) % 12) + 1;
  const monthDays = useMemo(() => getMonthDays(displayYear, displayMonth), [displayYear, displayMonth]);
  const monthName = new Date(`${displayYear}-${String(displayMonth).padStart(2, "0")}-15T12:00:00Z`)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const visibleRows = view === "week"
    ? rows
    : selectedDay
      ? rows.filter(tt => getLocalDateStr(new Date(tt.tee_datetime), groupTz) === selectedDay)
      : rows;

  return (
    <>
      {/* View toggle */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: `0.5px solid ${CARD_BORDER}` }}>
        {(["week", "month"] as const).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setSelectedDay(null); }}
            className="flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: view === v ? "rgba(255,255,255,0.10)" : "transparent",
              color: view === v ? "white" : "rgba(255,255,255,0.38)",
            }}
          >
            {v === "week" ? "Week" : "Month"}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl p-4 mb-6" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
        {view === "week" ? (
          <>
            <p className="text-xs font-semibold mb-3 px-0.5 uppercase tracking-wide" style={{ color: GOLD }}>{weekMonthLabel}</p>
            <div className="grid grid-cols-7 gap-1">
              {weekDayStrs.map((dayStr, i) => {
                const isToday = dayStr === todayStr;
                const dayNum = parseInt(dayStr.slice(8), 10);
                const dayTimes = rows.filter(tt => getLocalDateStr(new Date(tt.tee_datetime), groupTz) === dayStr);
                return (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>{DAY_LABELS[i]}</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold" style={{
                      background: isToday ? "#30D158" : "transparent",
                      color: isToday ? "#000" : "rgba(255,255,255,0.8)",
                    }}>
                      {dayNum}
                    </div>
                    <div className="flex gap-0.5 justify-center min-h-[5px]">
                      {dayTimes.map(tt => {
                        const s = tt.my_rsvp?.status ?? "pending";
                        const dot = s === "accepted" ? "#30D158" : s === "declined" ? "#FF453A" : GOLD;
                        return <div key={tt.id} className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMonthOffset(o => o - 1)}
                disabled={monthOffset === 0}
                className="p-1 rounded-lg"
                style={{ color: monthOffset > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)" }}
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD }}>{monthName}</p>
              <button
                onClick={() => setMonthOffset(o => o + 1)}
                disabled={monthOffset === 2}
                className="p-1 rounded-lg"
                style={{ color: monthOffset < 2 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)" }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_LABELS.map(d => (
                <p key={d} className="text-center text-[10px] font-medium pb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {monthDays.map((dayStr, i) => {
                if (!dayStr) return <div key={i} />;
                const isToday = dayStr === todayStr;
                const isSelected = dayStr === selectedDay;
                const dayNum = parseInt(dayStr.slice(8), 10);
                const dayTimes = rows.filter(tt => getLocalDateStr(new Date(tt.tee_datetime), groupTz) === dayStr);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(isSelected ? null : dayStr)}
                    className="flex flex-col items-center gap-0.5 py-1 rounded-lg"
                    style={{ background: isSelected ? "rgba(48,209,88,0.12)" : "transparent" }}
                  >
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold" style={{
                      background: isToday ? "#30D158" : "transparent",
                      color: isToday ? "#000" : "rgba(255,255,255,0.8)",
                    }}>
                      {dayNum}
                    </span>
                    <div className="flex gap-0.5 justify-center min-h-[4px]">
                      {dayTimes.slice(0, 3).map(tt => {
                        const s = tt.my_rsvp?.status ?? "pending";
                        const dot = s === "accepted" ? "#30D158" : s === "declined" ? "#FF453A" : GOLD;
                        return <div key={tt.id} className="w-1 h-1 rounded-full" style={{ background: dot }} />;
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Tee time list */}
      {visibleRows.length === 0 ? (
        <div className="text-center py-14">
          {selectedDay ? (
            <>
              <p className="font-medium text-white mb-1">No tee times on this day</p>
              <button onClick={() => setSelectedDay(null)} className="text-sm mt-2" style={{ color: "#30D158" }}>
                Show all
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-white mb-1">No upcoming tee times</p>
              <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.4)" }}>Add one manually or forward a confirmation email</p>
              <Link href="/tee-times/new" className="font-semibold px-5 py-2.5 rounded-xl text-sm text-black" style={{ background: "#30D158" }}>
                Add tee time
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {selectedDay && (
            <div className="flex items-center justify-between px-1 mb-2">
              <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(selectedDay + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              </p>
              <button onClick={() => setSelectedDay(null)} className="text-xs font-medium" style={{ color: "#30D158" }}>
                Show all
              </button>
            </div>
          )}
          {visibleRows.map(tt => {
            const myStatus = tt.my_rsvp?.status ?? "pending";
            const badgeStyle = myStatus === "accepted"
              ? { background: "rgba(48,209,88,0.15)", color: "#30D158" }
              : myStatus === "declined"
              ? { background: "rgba(255,69,58,0.12)", color: "#FF453A" }
              : { background: "rgba(201,168,76,0.15)", color: GOLD };
            return (
              <Link
                key={tt.id}
                href={`/tee-times/${tt.id}`}
                className="block rounded-2xl overflow-hidden transition-opacity active:opacity-70"
                style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
              >
                {tt.course_photo && (
                  <div className="relative h-28 w-full">
                    <img src={tt.course_photo} alt={tt.course_name} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.65))" }} />
                    <p className="absolute bottom-2.5 left-4 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {daysUntil(tt.tee_datetime, groupTz)}
                    </p>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    {!tt.course_photo && (
                      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GOLD }}>
                        {daysUntil(tt.tee_datetime, groupTz)}
                      </p>
                    )}
                    <p className="font-semibold text-white text-[16px] truncate tracking-tight">{tt.course_name}</p>
                    <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {formatTeeTime(tt.tee_datetime, groupTz)} &middot; {tt.holes}H &middot; {tt.accepted_count}/{tt.max_players} going
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5" style={badgeStyle}>
                    {myStatus === "accepted" ? "Going" : myStatus === "declined" ? "Can't go" : "Pending"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
