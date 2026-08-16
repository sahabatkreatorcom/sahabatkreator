"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { mobilePrimaryNav, mobileOverflowNav } from "@/lib/nav-config";
import { MoreSheet } from "@/components/dashboard/more-sheet";
import { cn } from "@/lib/utils";

/**
 * Bottom tab bar untuk mobile: 4 tab utama (dari mobilePrimaryNav di
 * nav-config.tsx) + 1 tab "Lainnya" yang membuka sheet berisi sisa menu.
 * Disembunyikan di layar >= lg, digantikan oleh Sidebar.
 */
/**
 * Cocokkan path dengan aturan yang sama seperti di sidebar: href harus menjadi
 * prefix path saat ini, dan karakter berikutnya (jika ada) HARUS slash.
 */
function isActive(href: string, pathname: string): boolean {
    if (pathname === href) return true;
    return pathname.startsWith(href + "/");
}

export function BottomNav({ isPlatformAdmin }: { isPlatformAdmin?: boolean }) {
    const pathname = usePathname();
    const [moreOpen, setMoreOpen] = React.useState(false);

    // tab "Lainnya" tetap tersorot kalau user sedang berada di salah satu
    // halaman overflow (mis. sedang di /dashboard/settings)
    const isOnOverflowPage =
        mobileOverflowNav.some((i) => isActive(i.href, pathname));

    return (
        <>
            <nav
                aria-label="Navigasi utama"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
            >
                <ul className="grid grid-cols-5">
                    {mobilePrimaryNav.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href, pathname);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href as any}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                        active ? "text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    {item.shortLabel}
                                </Link>
                            </li>
                        );
                    })}

                    <li>
                        <button
                            onClick={() => setMoreOpen(true)}
                            aria-haspopup="dialog"
                            aria-expanded={moreOpen}
                            className={cn(
                                "flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                isOnOverflowPage || moreOpen ? "text-primary" : "text-muted-foreground"
                            )}
                        >
                            <MoreHorizontal className="h-5 w-5" />
                            Lainnya
                        </button>
                    </li>
                </ul>
            </nav>

            <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} isPlatformAdmin={isPlatformAdmin} />
        </>
    );
}