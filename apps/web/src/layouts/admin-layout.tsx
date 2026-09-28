// Shell admin — sidebar khusus panel admin platform
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  Bot,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  FlaskConical,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { meQueryOptions } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";

const NAV_ITEMS = [
  { to: "/admin", label: "Statistik", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Pengguna", icon: Users },
  { to: "/admin/organizations", label: "Organisasi", icon: Building2 },
  { to: "/admin/collabs", label: "Kolaborasi", icon: UsersRound },
  { to: "/admin/blog", label: "Blog", icon: FileText },
  { to: "/admin/holidays", label: "Hari Besar", icon: CalendarDays },
  { to: "/admin/plans", label: "Paket & Harga", icon: KeyRound },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/payment-config", label: "Konfigurasi Bayar", icon: Banknote },
  { to: "/admin/credentials", label: "Kredensial Platform", icon: KeyRound },
  { to: "/admin/api-access", label: "Pengajuan API", icon: ShieldCheck },
  { to: "/admin/api-tests", label: "Tes API", icon: FlaskConical },
  { to: "/admin/api-quota", label: "Kuota API", icon: Gauge },
  { to: "/admin/ai-usage", label: "Pemakaian AI", icon: Bot },
  { to: "/admin/contact", label: "Inbox Kontak", icon: Inbox },
  { to: "/admin/settings", label: "Pengaturan", icon: Settings },
  { to: "/admin/logs", label: "Log & Audit", icon: ScrollText },
  { to: "/admin/org-activity", label: "Log Aktivitas", icon: Activity },
  { to: "/admin/monitoring", label: "Monitoring", icon: Activity },
];

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await authClient.signOut();
    // Hapus cache ["me"] — sama seperti dashboard-layout (ghost dashboard fix)
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    navigate("/", { replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <Logo size={32} />
        <div className="leading-tight">
          <span className="block font-bold text-sm">Admin Panel</span>
          <span className="block text-[var(--text-muted)] text-xs">Sahabat Kreator</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-[var(--border-light)] border-t p-3">
        <NavLink to="/dashboard" className="block">
          <Button variant="outline" size="sm" className="w-full">
            Kembali ke Dashboard
          </Button>
        </NavLink>
        <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={handleSignOut}>
          <LogOut className="h-3.5 w-3.5" />
          Keluar
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-[var(--border-light)] border-r bg-[var(--bg-secondary)] lg:block">
        {sidebar}
      </aside>

      {/* Sidebar mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay — clik-outside menutup sidebar */}
          <div
            className="absolute inset-0 bg-black/50"
            role="presentation"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-[var(--border-light)] border-r bg-[var(--bg-secondary)]">
            <button
              type="button"
              className="absolute top-4 right-3 text-[var(--text-muted)]"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-[var(--border-light)] border-b bg-[var(--bg-primary)]/90 px-4 backdrop-blur">
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            aria-label="Ganti tema"
          >
            {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
