"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { navItems, type NavItem } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

/**
 * Menandai nav item aktif dengan presisi:
 * - `/dashboard`            → aktif di /dashboard          (bukan di /dashboard/x)
 * - `/dashboard/settings`   → aktif di /dashboard/settings dan semua sub-halannya
 * - `/dashboard/calendar`   → aktif di /dashboard/calendar dan semua sub-halamanya
 *
 * Rumus: pathname === href, ATAU pathname.startsWith(href + "/").
 * Dengan kata lain, href harus menjadi prefix path saat ini, dan karakter
 * berikutnya (jada ada) HARUS slash — bukan sembarang huruf.
 */
function isActive(href: string, pathname: string): boolean {
    if (pathname === href) return true;
    return pathname.startsWith(href + "/");
}

export function Sidebar({ isPlatformAdmin }: { isPlatformAdmin?: boolean }) {
    const pathname = usePathname();
    const contentItems = navItems.filter((i) => i.group === "content");
    const teamItems = navItems.filter((i) => i.group === "team");

    return (
        <nav className="flex h-full flex-col gap-6 overflow-y-auto p-3">
            <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1">
                <Logo size={28} className="rounded-md" />
                <span className="text-sm font-semibold leading-tight">Sahabat Kreator</span>
            </Link>

            <div>
                <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Konten
                </p>
                <ul className="space-y-0.5">
                    {contentItems.map((item) => (
                        <NavItemRow key={item.href} item={item} active={isActive(item.href, pathname)} />
                    ))}
                </ul>
            </div>

            <div>
                <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pengaturan
                </p>
                <ul className="space-y-0.5">
                    {teamItems.map((item) => (
                        <NavItemRow key={item.href} item={item} active={isActive(item.href, pathname)} />
                    ))}
                </ul>
            </div>
        </nav>
    );
}

function NavItemRow({ item, active }: { item: NavItem; active: boolean }) {
    const Icon = item.icon;
    return (
        <li>
            <Link
                href={item.href as any}
                className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
            >
                <Icon className="h-4 w-4" />
                {item.label}
            </Link>
        </li>
    );
}