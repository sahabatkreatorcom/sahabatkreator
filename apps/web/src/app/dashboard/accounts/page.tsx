"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    Plus,
    Trash2,
    RefreshCw,
    ExternalLink,
    AlertCircle,
    CheckCircle2,
    Link2,
    Link2Off,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
    PLATFORM_LABELS,
    PLATFORM_COLORS,
    CONNECTABLE_PLATFORMS,
    type Platform,
} from "@/lib/platforms/constants";
import { cn } from "@/lib/utils";

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

interface AuthUrlResult {
    authUrl: string;
    state: string;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);
    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);

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

    async function handleConnect(platform: Platform) {
        setSelectedPlatform(platform);
        setShowConnectDialog(true);
    }

    async function startConnect(platform: Platform) {
        setConnecting(platform);
        setError(null);
        try {
            const res = await fetch("/api/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memulai koneksi.");
            // Redirect ke halaman OAuth
            window.location.href = json.authUrl;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memulai koneksi.");
        } finally {
            setConnecting(null);
        }
    }

    async function handleDisconnect(accountId: string) {
        if (!confirm("Yakin ingin memutuskan akun ini?")) return;
        setDisconnecting(accountId);
        setError(null);
        try {
            const res = await fetch("/api/accounts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountId }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memutuskan akun.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memutuskan akun.");
        } finally {
            setDisconnecting(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Akun Terhubung</h1>
                    <p className="text-sm text-muted-foreground">
                        Kelola akun media sosial yang terhubung ke workspace.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        Muat ulang
                    </Button>
                    <Button size="sm" onClick={() => setShowConnectDialog(true)}>
                        <Plus className="h-4 w-4" />
                        Tambah Akun
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-12 text-sm text-muted-foreground">Memuat akun…</p>
            ) : accounts.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                    <Link2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {accounts.map((acc) => (
                        <div
                            key={acc.id}
                            className={cn(
                                "rounded-lg border border-border bg-card p-4",
                                !acc.isActive && "opacity-60"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-bold"
                                    style={{ background: PLATFORM_COLORS[acc.platform as Platform] ?? "#6B7280" }}
                                >
                                    {acc.platform.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-medium">
                                            {acc.name || acc.username || acc.platform}
                                        </p>
                                        {acc.isActive ? (
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                        ) : (
                                            <Link2Off className="h-4 w-4 text-muted-foreground shrink-0" />
                                        )}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                        @{acc.username || acc.name}
                                    </p>
                                </div>
                            </div>

                            {acc.lastRefreshError && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-accent-red">
                                    <AlertCircle className="h-3 w-3" />
                                    {acc.lastRefreshError}
                                </div>
                            )}

                            {acc.tokenExpiry && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Token berakhir: {new Date(acc.tokenExpiry).toLocaleDateString("id-ID")}
                                </p>
                            )}

                            <div className="mt-3 flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="flex-1 text-xs"
                                    disabled={disconnecting === acc.id}
                                    onClick={() => handleDisconnect(acc.id)}
                                >
                                    {disconnecting === acc.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Link2Off className="h-3 w-3" />
                                    )}
                                    Putuskan
                                </Button>
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
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            )}
                        </button>
                    ))}
                </div>
            </Dialog>
        </div>
    );
}