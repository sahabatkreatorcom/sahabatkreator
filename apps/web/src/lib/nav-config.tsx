import {
    LayoutDashboard,
    CalendarDays,
    BarChart3,
    MessageSquare,
    Image as ImageIcon,
    PenSquare,
    Users,
    Settings,
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