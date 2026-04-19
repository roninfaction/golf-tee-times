"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Calendar, Plus, Users, User } from "lucide-react";

const navItems = [
  { href: "/upcoming", label: "Schedule", icon: Calendar },
  { href: "/tee-times/new", label: "Add", icon: Plus, accent: true },
  { href: "/group", label: "Group", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending indicator once navigation completes
  useEffect(() => {
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
        background: "rgba(7,21,16,0.94)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "0.5px solid rgba(80,200,110,0.22)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 30px)",
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
