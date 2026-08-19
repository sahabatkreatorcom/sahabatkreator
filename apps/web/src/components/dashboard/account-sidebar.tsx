"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_COLORS, type Platform } from "@/lib/platforms/constants";
import { cn } from "@/lib/utils";

interface Account {
    id: string;
    platform: Platform;
    name: string;
    username: string | null;
    avatar: string | null;
    isActive: boolean;
}

/**
 * Daftar akun sosial terhubung di sidebar dashboard (grup "Akun").
 * Avatar memakai data riil dari `/api/accounts` (fallback inisial/ikon platform).
 */
export function AccountSidebar() {
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(async () => {
        try {
            const res = await fetch("/api/accounts");
            const data = await res.json();
            if (res.ok) setAccounts(data.accounts ?? []);
        } catch {
            /* ignore — sidebar tetap tampil kosong */
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        load();
    }, [load]);

    return (
        <div>
            <div className="flex items-center justify-between px-2 pb-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Akun</p>
                <Link
                    href="/settings/connections"
                    className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    title="Kelola akun"
                >
                    Kelola
                    <ChevronRight className="h-3 w-3" />
                </Link>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Memuat akun...
                </div>
            ) : accounts.length === 0 ? (
                <Link
                    href="/settings/connections"
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Hubungkan akun pertama
                </Link>
            ) : (
                <ul className="space-y-0.5">
                    {accounts.map((acc) => (
                        <li key={acc.id}>
                            <Link
                                href="/settings/connections"
                                className={cn(
                                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                                    "hover:bg-muted",
                                    !acc.isActive && "opacity-60"
                                )}
                                title={`${acc.name} (${acc.username ? "@" + acc.username : acc.platform})`}
                            >
                                {acc.avatar ? (
                                    <img
                                        src={acc.avatar}
                                        alt=""
                                        className="h-5 w-5 shrink-0 rounded-full object-cover"
                                    />
                                ) : (
                                    <span
                                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                                        style={{ background: PLATFORM_COLORS[acc.platform] ?? "#6B7280" }}
                                    >
                                        <PlatformIcon platform={acc.platform} size={11} />
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                    {acc.name || acc.username || acc.platform}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <div className="px-2.5 pt-1.5">
                <Link
                    href="/settings/connections"
                    className="flex items-center gap-1.5 rounded-md px-0.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah akun
                </Link>
            </div>
        </div>
    );
}