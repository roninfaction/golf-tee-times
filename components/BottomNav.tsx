"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Calendar, Clock, Plus, Users, User } from "lucide-react";

const navItems = [
  { href: "/upcoming", label: "Schedule", icon: Calendar },
  { href: "/past", label: "History", icon: Clock },
  { href: "/tee-times/new", label: "Add", icon: Plus, accent: true },
  { href: "/group", label: "Group", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending indicator once navigation completes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingHref(null);
  }, [pathname]);

  function isActive(href: string): boolean {
    // Show as active immediately on tap, before server responds
    if (pendingHref) return pendingHref === href;
    return pathname === href || (href !== "/tee-times/new" && pathname.startsWith(href));
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        // Plain opaque fixed bar. The "nav floats mid-page" bug was never this
        // element: iOS leaves the whole layout viewport parked above the screen
        // after the keyboard closes, and everything position:fixed goes with it.
        // lib/viewport-guard.ts + the html.vv-shifted rule in globals.css handle
        // that. Keep this element boring: no filter, no transform of its own.
        background: "#071510",
        borderTop: "0.5px solid rgba(80,200,110,0.22)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
      }}
    >
      <div className="flex items-center justify-around h-[58px]">
        {navItems.map(({ href, label, icon: Icon, accent }) => {
          const active = isActive(href);
          const color = active ? "#30D158" : "rgba(255,255,255,0.42)";
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setPendingHref(href)}
              className="flex flex-col items-center justify-center gap-[3px] flex-1 h-full active:opacity-50 transition-opacity duration-75"
            >
              {accent ? (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "#30D158" }}
                >
                  <Icon size={20} strokeWidth={2.5} className="text-black" />
                </div>
              ) : (
                <>
                  <Icon size={23} strokeWidth={active ? 2 : 1.5} style={{ color }} />
                  <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
