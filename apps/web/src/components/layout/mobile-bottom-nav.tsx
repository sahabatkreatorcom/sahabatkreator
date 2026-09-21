// Bottom nav mobile — 5 shortcut utama, muncul < md, sembunyi di mode standalone saat sudah terinstall? Tidak: tetap tampil (navigation PWA)

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Home, Inbox, PenSquare, User } from "lucide-react";
import { NavLink } from "react-router";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/dashboard", label: "Home", icon: Home, end: true },
  { to: "/calendar", label: "Kalender", icon: CalendarDays, end: false },
  { to: "/compose", label: "Buat", icon: PenSquare, end: false },
  { to: "/inbox", label: "DM", icon: Inbox, end: false },
  { to: "/settings", label: "Profil", icon: User, end: false },
];

export function MobileBottomNav() {
  const { data: dmData } = useQuery({
    queryKey: ["dm-unread-total"],
    queryFn: () => api.get<{ unreadCount: number }>("/dm/unread-count"),
    refetchInterval: 120_000,
  });
  const dmUnread = dmData?.unreadCount ?? 0;

  return (
    <nav
      className="sk-bottom-nav fixed inset-x-0 bottom-0 z-40 flex border-[var(--border-light)] border-t bg-[var(--bg-secondary)]/95 backdrop-blur lg:hidden"
      aria-label="Navigasi utama"
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-2 font-medium text-[10px] transition-colors",
              isActive
                ? "text-[var(--accent-gold)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
          {item.to === "/inbox" && dmUnread > 0 && (
            <span className="absolute top-1 right-1/2 flex h-4 min-w-4 translate-x-5 items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[9px] text-white">
              {dmUnread > 99 ? "99+" : dmUnread}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
