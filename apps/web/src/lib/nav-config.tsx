import {
    LayoutDashboard,
    CalendarDays,
    BarChart3,
    MessageSquare,
    Image as ImageIcon,
    PenSquare,
    ListTodo,
    Users,
    Settings,
    FolderTree,
    Zap,
    History,
    Radar,
    Sparkles,
    type LucideIcon,
} from "lucide-react";

export interface NavItem {
    href: string;
    label: string;
    shortLabel: string; // dipakai di bottom nav, ruang sempit
    icon: LucideIcon;
    group: "content" | "team";
    /** Tampil sebagai salah satu dari 4 tab utama di bottom nav mobile. */
    mobileTab: boolean;
}

/**
 * SATU sumber kebenaran untuk semua navigasi dashboard.
 * Sidebar desktop merender semua item dikelompokkan per `group`.
 * Bottom nav mobile merender 4 item dengan `mobileTab: true` sebagai tab,
 * sisanya otomatis masuk ke tab "Lainnya" (lihat more-sheet.tsx).
 * Ubah navigasi cukup di satu tempat ini.
 */
export const navItems: NavItem[] = [
    {
        href: "/dashboard",
        label: "Ringkasan",
        shortLabel: "Ringkasan",
        icon: LayoutDashboard,
        group: "content",
        mobileTab: true,
    },
    {
        href: "/dashboard/calendar",
        label: "Kalender konten",
        shortLabel: "Kalender",
        icon: CalendarDays,
        group: "content",
        mobileTab: true,
    },
    {
        href: "/dashboard/analytics",
        label: "Analitik",
        shortLabel: "Analitik",
        icon: BarChart3,
        group: "content",
        mobileTab: true,
    },
    {
        href: "/dashboard/inbox",
        label: "Komentar & pesan",
        shortLabel: "Inbox",
        icon: MessageSquare,
        group: "content",
        mobileTab: true,
    },
    {
        href: "/dashboard/media",
        label: "Media library",
        shortLabel: "Media",
        icon: ImageIcon,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/compose",
        label: "Buat konten",
        shortLabel: "Buat",
        icon: PenSquare,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/content-tools",
        label: "Content tools",
        shortLabel: "Tools",
        icon: FolderTree,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/posts",
        label: "Semua post",
        shortLabel: "Post",
        icon: ListTodo,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/inbox-automation",
        label: "Automasi inbox",
        shortLabel: "Automasi",
        icon: Zap,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/competitors",
        label: "Competitor & listening",
        shortLabel: "Competitor",
        icon: Radar,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/seb",
        label: "Seb AI",
        shortLabel: "Seb",
        icon: Sparkles,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/team",
        label: "Anggota tim",
        shortLabel: "Tim",
        icon: Users,
        group: "team",
        mobileTab: false,
    },
    {
        href: "/dashboard/trends",
        label: "Tren",
        shortLabel: "Tren",
        icon: BarChart3,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/engagement",
        label: "Engagement",
        shortLabel: "Engagement",
        icon: MessageSquare,
        group: "content",
        mobileTab: false,
    },
    {
        href: "/dashboard/activity",
        label: "Activity log",
        shortLabel: "Log",
        icon: History,
        group: "team",
        mobileTab: false,
    },
    {
        href: "/dashboard/settings",
        label: "Pengaturan workspace",
        shortLabel: "Pengaturan",
        icon: Settings,
        group: "team",
        mobileTab: false,
    },
];

export const mobilePrimaryNav = navItems.filter((item) => item.mobileTab);
export const mobileOverflowNav = navItems.filter((item) => !item.mobileTab);

if (mobilePrimaryNav.length !== 4) {
    // Sinyal dini kalau suatu saat ada yang menambah/menghapus item tanpa
    // menjaga jumlah tab bottom-nav tetap 4 — cek nav-config.tsx.
    console.warn(
        `mobilePrimaryNav diharapkan 4 item, saat ini ${mobilePrimaryNav.length}. Periksa nav-config.tsx.`
    );
}