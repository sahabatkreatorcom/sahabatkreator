"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    Plus,
    CheckCircle2,
    AlertCircle,
    Link2Off,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    PLATFORM_LABELS,
    PLATFORM_COLORS,
    CONNECTABLE_PLATFORMS,
    type Platform,
} from "@/lib/platforms/constants";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";

interface Account {
    id: string;
    platform: Platform;
    name: string;
    username: string;
    avatar: string | null;
    tokenExpiry: string | null;
    lastRefreshError: string | null;
    isActive: boolean;
    createdAt: string;
}

export function ConnectedAccountsSettings() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [connecting, setConnecting] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/accounts");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat akun.");
            setAccounts(json.accounts);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat akun.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function startConnect(platform: Platform) {
        setConnecting(platform);
        try {
            const res = await fetch("/api/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memulai koneksi.");
            window.location.href = json.authUrl;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memulai koneksi.");
        } finally {
            setConnecting(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold">Akun Terhubung</h2>
                    <p className="text-sm text-muted-foreground">
                        {accounts.length} akun terhubung ke workspace ini.
                    </p>
                </div>
                <Button size="sm" onClick={() => setShowConnectDialog(true)}>
                    <Plus className="h-4 w-4" />
                    Tambah Akun
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : accounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
                    <Link2Off className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm font-medium">Belum ada akun terhubung</p>
                    <p className="text-sm text-muted-foreground">
                        Hubungkan akun media sosial untuk mulai memposting.
                    </p>
                    <Button className="mt-4" size="sm" onClick={() => setShowConnectDialog(true)}>
                        <Plus className="h-4 w-4" />
                        Hubungkan Akun
                    </Button>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {accounts.map((acc) => (
                        <div
                            key={acc.id}
                            className={cn(
                                "flex items-center gap-3 rounded-lg border border-border bg-card p-3",
                                !acc.isActive && "opacity-60"
                            )}
                        >
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-bold text-sm"
                                style={{ background: PLATFORM_COLORS[acc.platform as Platform] ?? "#6B7280" }}
                            >
                                {acc.platform.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-medium">
                                        {PLATFORM_LABELS[acc.platform as Platform] ?? acc.platform}
                                    </p>
                                    {acc.isActive ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                                    )}
                                </div>
                                <p className="truncate text-xs text-muted-foreground">
                                    {acc.name || acc.username || acc.platform}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Connect Dialog */}
            <Dialog
                open={showConnectDialog}
                onClose={() => setShowConnectDialog(false)}
                title="Hubungkan Akun"
                description="Pilih platform yang ingin dihubungkan."
            >
                <div className="grid gap-2">
                    {CONNECTABLE_PLATFORMS.map((platform) => (
                        <button
                            key={platform}
                            onClick={() => startConnect(platform)}
                            disabled={connecting === platform}
                            className={cn(
                                "flex items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted",
                                connecting === platform && "opacity-50"
                            )}
                        >
                            <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ background: PLATFORM_COLORS[platform as Platform] ?? "#6B7280" }}
                            >
                                {platform.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    {PLATFORM_LABELS[platform as Platform] ?? platform}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    Hubungkan akun {platform.toLowerCase()}
                                </p>
                            </div>
                            {connecting === platform ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                                <Plus className="h-4 w-4 text-muted-foreground" />
                            )}
                        </button>
                    ))}
                </div>
            </Dialog>
        </div>
    );
}