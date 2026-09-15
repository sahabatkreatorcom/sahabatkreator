// Command Palette (Ctrl+K / Cmd+K) — pencarian cepat navigasi & aksi dashboard.
// Filter fuzzy sederhana: semua kata query harus ada di label (case-insensitive).

import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Command as CommandIcon,
  CreditCard,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  Loader2,
  LogOut,
  type LucideIcon,
  MessageCircle,
  Moon,
  Package,
  PenSquare,
  Plus,
  Radar,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { meQueryOptions } from "@/layouts/require-auth";
import { authClient } from "@/lib/auth-client";
import { useCommandPalette } from "@/lib/command-palette-store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type PaletteCommand = {
  id: string;
  label: string;
  /** Kata kunci tambahan untuk pencarian (sinonim) */
  keywords?: string[];
  icon: LucideIcon;
  group: "Navigasi" | "Aksi";
  /** Jalankan aksi — palette otomatis ditutup setelahnya */
  run: (navigate: ReturnType<typeof useNavigate>) => void | Promise<void>;
};

/** Daftar navigasi dashboard — sesuai route di router.tsx */
const NAVIGATION_COMMANDS: PaletteCommand[] = [
  {
    id: "nav-dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    group: "Navigasi",
    run: (n) => n("/dashboard"),
  },
  {
    id: "nav-calendar",
    label: "Kalender",
    icon: CalendarDays,
    group: "Navigasi",
    run: (n) => n("/calendar"),
  },
  {
    id: "nav-queue",
    label: "Antrian Post",
    keywords: ["queue"],
    icon: ListChecks,
    group: "Navigasi",
    run: (n) => n("/queue"),
  },
  {
    id: "nav-compose",
    label: "Buat Konten",
    keywords: ["compose", "post"],
    icon: PenSquare,
    group: "Navigasi",
    run: (n) => n("/compose"),
  },
  {
    id: "nav-engagement",
    label: "Engagement",
    icon: MessageCircle,
    group: "Navigasi",
    run: (n) => n("/engagement"),
  },
  {
    id: "nav-inbox",
    label: "Inbox DM",
    keywords: ["dm", "pesan"],
    icon: Inbox,
    group: "Navigasi",
    run: (n) => n("/inbox"),
  },
  {
    id: "nav-automation",
    label: "Automation",
    keywords: ["otomasi"],
    icon: Zap,
    group: "Navigasi",
    run: (n) => n("/automation"),
  },
  {
    id: "nav-performance",
    label: "Performa",
    keywords: ["analitik", "analytics", "laporan", "report", "goal", "target", "statistik"],
    icon: BarChart3,
    group: "Navigasi",
    run: (n) => n("/performance"),
  },
  {
    id: "nav-research",
    label: "Riset",
    keywords: ["listening", "kompetitor", "pesaing", "tren"],
    icon: Radar,
    group: "Navigasi",
    run: (n) => n("/research"),
  },
  {
    id: "nav-assistant",
    label: "AI Asisten",
    keywords: ["coach", "seb", "strategi", "ai"],
    icon: Sparkles,
    group: "Navigasi",
    run: (n) => n("/assistant"),
  },
  {
    id: "nav-media",
    label: "Media",
    keywords: ["pustaka", "galeri"],
    icon: ImageIcon,
    group: "Navigasi",
    run: (n) => n("/media"),
  },
  {
    id: "nav-products",
    label: "Katalog Produk",
    keywords: ["produk"],
    icon: Package,
    group: "Navigasi",
    run: (n) => n("/products"),
  },
  {
    id: "nav-accounts",
    label: "Akun Sosmed",
    keywords: ["akun", "sosmed"],
    icon: Link2,
    group: "Navigasi",
    run: (n) => n("/accounts"),
  },
  { id: "nav-team", label: "Tim", icon: Users, group: "Navigasi", run: (n) => n("/team") },
  {
    id: "nav-settings",
    label: "Pengaturan",
    keywords: ["settings"],
    icon: Settings,
    group: "Navigasi",
    run: (n) => n("/settings"),
  },
  {
    id: "nav-billing",
    label: "Billing",
    keywords: ["tagihan", "paket", "upgrade"],
    icon: CreditCard,
    group: "Navigasi",
    run: (n) => n("/settings/billing"),
  },
];

/** Filter fuzzy sederhana: setiap kata query harus muncul di label/keyword */
function matchesCommand(command: PaletteCommand, query: string): boolean {
  const haystack =
    `${command.label} ${command.id} ${(command.keywords ?? []).join(" ")}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Aksi cepat — label tema & logout butuh state komponen
  const actionCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "action-new-post",
        label: "Buat post baru",
        keywords: ["baru", "post", "compose", "konten"],
        icon: PenSquare,
        group: "Aksi",
        run: (n) => n("/compose"),
      },
      {
        id: "action-upload-media",
        label: "Upload media",
        keywords: ["upload", "media", "file"],
        icon: Upload,
        group: "Aksi",
        run: (n) => n("/media?upload=1"),
      },
      {
        id: "action-new-org",
        label: "Buat organisasi baru",
        keywords: ["organisasi", "org", "baru"],
        icon: Plus,
        group: "Aksi",
        run: (n) => n("/create-organization"),
      },
      {
        id: "action-toggle-theme",
        label: resolved === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap",
        keywords: ["tema", "theme", "gelap", "terang", "dark", "light"],
        icon: resolved === "dark" ? Sun : Moon,
        group: "Aksi",
        run: () => toggle(),
      },
      {
        id: "action-logout",
        label: "Keluar",
        keywords: ["logout", "keluar", "signout"],
        icon: signingOut ? Loader2 : LogOut,
        group: "Aksi",
        run: async (n) => {
          setSigningOut(true);
          try {
            await authClient.signOut();
            // Sinkronkan cache ["me"] — hindari ghost dashboard setelah logout
            await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
            n("/", { replace: true });
          } finally {
            setSigningOut(false);
          }
        },
      },
    ],
    [resolved, toggle, signingOut, queryClient],
  );

  const allCommands = useMemo(() => [...actionCommands, ...NAVIGATION_COMMANDS], [actionCommands]);

  const results = useMemo(() => {
    const q = query.trim();
    return q ? allCommands.filter((c) => matchesCommand(c, q)) : allCommands;
  }, [allCommands, query]);

  // Reset state saat palette dibuka/tutup + kunci scroll body
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Reset index saat query berubah
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Global listener Ctrl+K / Cmd+K (buka & tutup)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useCommandPalette.getState().toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const execute = useCallback(
    (command: PaletteCommand) => {
      close();
      void command.run(navigate);
    },
    [close, navigate],
  );

  // Navigasi keyboard di dalam modal
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const command = results[activeIndex];
      if (command) execute(command);
      return;
    }
  }

  // Pastikan item aktif terlihat saat navigasi keyboard
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  // Kelompokkan hasil berurutan: Aksi dulu, lalu Navigasi
  const groups: {
    label: PaletteCommand["group"];
    items: { command: PaletteCommand; index: number }[];
  }[] = [];
  results.forEach((command, index) => {
    const last = groups[groups.length - 1];
    if (last && last.label === command.group) {
      last.items.push({ command, index });
    } else {
      groups.push({ label: command.group, items: [{ command, index }] });
    }
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian cepat"
        className="relative z-10 w-full max-w-xl animate-fade-in overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-[var(--border-light)] border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari halaman atau aksi…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
            aria-label="Ketik untuk mencari perintah"
          />
          <kbd className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-medium text-[10px] text-[var(--text-muted)]">
            Esc
          </kbd>
        </div>

        {/* Hasil */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[var(--text-muted)] text-sm">
              Tidak ada hasil untuk “{query}”
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-3 pt-2 pb-1 font-semibold text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  {group.label}
                </p>
                {group.items.map(({ command, index }) => {
                  const Icon = command.icon;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => execute(command)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          command.id === "action-logout" && active && "text-[var(--error)]",
                        )}
                      />
                      <span className="flex-1 truncate">{command.label}</span>
                      {active && (
                        <kbd className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-medium text-[10px] text-[var(--text-muted)]">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-[var(--border-light)] border-t px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <CommandIcon className="h-3 w-3" />
            Navigasi dengan ↑ ↓ · Enter pilih
          </span>
          <span>Sahabat Kreator</span>
        </div>
      </div>
    </div>
  );
}
