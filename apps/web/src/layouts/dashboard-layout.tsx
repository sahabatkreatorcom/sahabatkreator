// Shell dashboard — sidebar navigasi + topbar (org switcher, theme, user menu)
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  BarChart3,
  CalendarDays,
  Clapperboard,
  CreditCard,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Package,
  PenSquare,
  Plus,
  Radar,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ImpersonationBanner,
  impersonationStatusOptions,
} from "@/components/admin/impersonation-banner";
import { InstallBanner } from "@/components/layout/install-banner";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/ui/command-palette";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { Logo } from "@/components/ui/logo";
import { NotificationBell } from "@/components/ui/notification-bell";
import { RateLimitBanner } from "@/components/ui/rate-limit-banner";
import { authClient } from "@/lib/auth-client";
import { useCommandPalette } from "@/lib/command-palette-store";
import { useSeo } from "@/lib/seo";
import { useTheme } from "@/lib/theme";
import { meQueryOptions } from "./require-auth";

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Utama",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/activity", label: "Aktivitas", icon: ActivityIcon },
      { to: "/calendar", label: "Kalender", icon: CalendarDays },
      { to: "/queue", label: "Antrian Post", icon: ListChecks },
      { to: "/post-results", label: "Hasil Post", icon: BarChart3 },
      { to: "/compose", label: "Buat Konten", icon: PenSquare },
    ],
  },
  {
    label: "Interaksi",
    items: [
      { to: "/engagement", label: "Engagement", icon: MessageCircle },
      { to: "/inbox", label: "Inbox DM", icon: Inbox },
      { to: "/automation", label: "Automation", icon: Zap },
    ],
  },
  {
    label: "Intelijen",
    items: [
      { to: "/performance", label: "Performa", icon: BarChart3 },
      { to: "/research", label: "Riset", icon: Radar },
      { to: "/assistant", label: "AI Asisten", icon: Sparkles },
    ],
  },
  {
    label: "Generator AI",
    items: [
      { to: "/generator/repurpose", label: "Repurpose", icon: RefreshCcw },
      { to: "/generator/carousel", label: "Carousel", icon: GalleryHorizontalEnd },
    ],
  },
  {
    label: "Aset",
    items: [
      { to: "/media", label: "Media", icon: ImageIcon },
      { to: "/video", label: "Render Video", icon: Wand2 },
      { to: "/renders", label: "Video Renders", icon: Clapperboard },
      { to: "/products", label: "Katalog Produk", icon: Package },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { to: "/accounts", label: "Akun Sosmed", icon: Link2 },
      { to: "/team", label: "Tim", icon: Users },
      { to: "/settings", label: "Pengaturan", icon: Settings },
      { to: "/status", label: "Status Sistem", icon: ActivityIcon },
    ],
  },
];

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

/** Tombol pencarian cepat (Ctrl+K) di topbar navbar */
function SearchCommandButton() {
  const setOpen = useCommandPalette((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="hidden h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-[var(--text-muted)] text-sm transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--text-primary)] md:flex"
      aria-label="Pencarian cepat (Ctrl K)"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span>Cari perintah…</span>
      <kbd className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-medium text-[10px]">
        Ctrl K
      </kbd>
    </button>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
      aria-label="Ganti tema"
      title="Ganti tema terang/gelap"
    >
      {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function OrgSwitcher() {
  const { data } = useQuery(meQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const orgs = data?.organizations ?? [];
  const active = data?.organization;

  async function switchOrg(orgId: string) {
    const { error } = await authClient.organization.setActive({
      organizationId: orgId,
    });
    if (error) {
      toast.error("Gagal berpindah organisasi");
      return;
    }
    // Invalidate semua query data org
    queryClient.invalidateQueries();
    toast.success("Berpindah organisasi");
  }

  return (
    <Dropdown
      contentClassName="w-64"
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-left hover:border-[var(--accent-gold)]"
        >
          <Avatar
            name={active?.name ?? "?"}
            src={active?.logo ?? undefined}
            className="h-8 w-8 text-xs"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-sm">
              {active?.name ?? "Pilih Organisasi"}
            </span>
            <span className="block truncate text-[var(--text-muted)] text-xs">{active?.role}</span>
          </span>
        </button>
      }
    >
      <DropdownLabel>Organisasi Anda</DropdownLabel>
      {orgs.map((org) => (
        <DropdownItem
          key={org.id}
          onClick={() => {
            if (org.id !== active?.id) void switchOrg(org.id);
          }}
          className={org.id === active?.id ? "bg-[var(--bg-tertiary)]" : ""}
        >
          <Avatar name={org.name} src={org.logo ?? undefined} className="h-6 w-6 text-[10px]" />
          <span className="flex-1 truncate">{org.name}</span>
          {org.id === active?.id && (
            <Badge variant="secondary" className="text-[10px]">
              aktif
            </Badge>
          )}
        </DropdownItem>
      ))}
      <DropdownSeparator />
      <DropdownItem onClick={() => navigate("/create-organization")}>
        <Plus className="h-4 w-4" />
        Buat Organisasi Baru
      </DropdownItem>
    </Dropdown>
  );
}

function UserMenu() {
  const { data } = useQuery(meQueryOptions);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = data?.user;

  async function handleSignOut() {
    await authClient.signOut();
    // Hapus cache ["me"] — session sudah mati; cache authenticated:true lama
    // membuat RequireAuth salah izinkan (ghost dashboard) sampai refetch
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    navigate("/", { replace: true });
  }

  return (
    <Dropdown
      trigger={
        <button type="button" className="flex items-center" aria-label="Menu pengguna">
          <Avatar name={user?.name ?? "?"} src={user?.image ?? undefined} className="h-8 w-8" />
        </button>
      }
    >
      <div className="px-3 py-2">
        <p className="truncate font-medium text-sm">{user?.name}</p>
        <p className="truncate text-[var(--text-muted)] text-xs">{user?.email}</p>
      </div>
      <DropdownSeparator />
      <DropdownItem onClick={() => navigate("/settings")}>
        <Settings className="h-4 w-4" />
        Pengaturan
      </DropdownItem>
      <DropdownItem onClick={() => navigate("/settings/billing")}>
        <CreditCard className="h-4 w-4" />
        Billing
      </DropdownItem>
      {user?.role === "admin" && (
        <DropdownItem onClick={() => navigate("/admin")}>
          <ShieldCheck className="h-4 w-4" />
          Panel Admin
        </DropdownItem>
      )}
      <DropdownSeparator />
      <DropdownItem onClick={handleSignOut} className="text-red-500">
        <LogOut className="h-4 w-4" />
        Keluar
      </DropdownItem>
    </Dropdown>
  );
}

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Banner impersonasi aktif → geser seluruh layout ke bawah agar topbar
  // (sticky) tidak tertutup banner fixed
  const { data: impersonation } = useQuery(impersonationStatusOptions);
  const impersonating = impersonation?.active === true;

  // Halaman dashboard dilindungi auth → noindex global agar tidak terindeks
  useSeo({
    title: "Dashboard",
    description: "Dashboard Sahabat Kreator",
    path: "/dashboard",
    noIndex: true,
  });

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4">
        <Logo size={32} />
        <span className="font-bold">
          Sahabat <span className="text-gradient">Kreator</span>
        </span>
      </div>

      {/* Org switcher */}
      <div className="px-3 pb-3">
        <OrgSwitcher />
      </div>

      {/* Nav — dikelompokkan per bagian */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 font-semibold text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
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
            </div>
          </div>
        ))}
      </nav>

      {/* Upgrade card */}
      <div className="p-3">
        <div className="rounded-[var(--radius-lg)] bg-gradient p-4 text-white">
          <p className="font-semibold text-sm">Upgrade ke Pro</p>
          <p className="mt-1 text-white/80 text-xs">Buka akun tanpa batas & analitik lanjutan</p>
          <Link to="/settings/billing">
            <Button variant="secondary" size="sm" className="mt-3 w-full">
              <CreditCard className="h-3.5 w-3.5" />
              Lihat Paket
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[var(--bg-primary)] ${impersonating ? "pt-10" : ""}`}>
      {/* Banner impersonasi (fixed top) — hanya render bila sesi impersonasi aktif */}
      <ImpersonationBanner />

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

      {/* Main */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-[var(--border-light)] border-b bg-[var(--bg-primary)]/90 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <SearchCommandButton />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="p-4 pb-24 md:p-6 lg:p-8 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav mobile + install banner PWA */}
      <MobileBottomNav />
      <InstallBanner />

      {/* Banner rate-limit (429) global */}
      <RateLimitBanner />

      {/* Command palette global (Ctrl+K) */}
      <CommandPalette />
    </div>
  );
}
