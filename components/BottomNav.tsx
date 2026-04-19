"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Plus, User, Users } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/upcoming", label: "Upcoming", icon: Calendar },
  { href: "/tee-times/new", label: "Add", icon: Plus, primary: true },
  { href: "/group", label: "Group", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe z-50">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ href, label, icon: Icon, primary }) => {
          const active = pathname === href || (href !== "/tee-times/new" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center gap-0.5 min-w-[60px] py-2 rounded-xl transition-colors",
                primary
                  ? "bg-green-600 text-white px-4 rounded-xl -mt-5 shadow-lg shadow-green-900/50 border-2 border-slate-900"
                  : active
                  ? "text-green-400"
                  : "text-slate-500"
              )}
            >
              <Icon size={primary ? 22 : 20} strokeWidth={primary ? 2.5 : 2} />
              {!primary && (
                <span className="text-[10px] font-medium">{label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
