"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Link2Off, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms";

interface Account {
    id: string;
    platform: Platform;
    name: string;
    username: string | null;
    avatar: string | null;
    tokenExpiry: string | null;
    lastRefreshError: string | null;
    isActive: boolean;
    createdAt: string;
}

export default function ConnectionsPage() {
    const searchParams = useSearchParams();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState<Platform | null>(null);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const activeOrgRef = useRef<string | null>(null);

    // Tangani parameter query dari callback OAuth
    useEffect(() => {
        const success = searchParams.get("success");
        const err = searchParams.get("error");
        if (success === "connected") setNotice("Akun berhasil dihubungkan.");
        else if (success === "reconnected") setNotice("Akun berhasil diperbarui.");
        else if (err) {
            const messages: Record<string, string> = {
                oauth_denied: "Koneksi dibatalkan di platform.",
                missing_params: "Callback tidak lengkap.",
                invalid_state: "State OAuth tidak valid.",
                expired_state: "Sesi OAuth kedaluwarsa. Coba lagi.",
                no_credentials: "Platform belum dikonfigurasi. Hubungi admin.",
                token_exchange_failed: "Gagal menukar kode akses.",
                profile_fetch_failed: "Gagal mengambil profil platform.",
                save_failed: "Gagal menyimpan akun.",
            };
            setError(messages[err] ?? `Gagal menghubungkan (${err}).`);
        }
    }, [searchParams]);

    const loadAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/accounts");
            const data = await res.json();
            if (res.ok) setAccounts(data.accounts ?? []);
            else setError(data.error || "Gagal memuat akun.");
        } catch {
            setError("Gagal terhubung ke server.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAccounts();
    }, [loadAccounts]);

    async function handleConnect(platform: Platform) {
        setConnecting(platform);
        setError(null);
        try {
            const res = await fetch("/api/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal memulai OAuth.");
                return;
            }
            window.location.href = data.authUrl;
        } catch {
            setError("Gagal memulai OAuth.");
        } finally {
            setConnecting(null);
        }
    }

    async function handleDisconnect(id: string) {
        if (!confirm("Putuskan koneksi akun ini?")) return;
        setDisconnecting(id);
        setError(null);
        try {
            const res = await fetch("/api/accounts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountId: id }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal memutus koneksi.");
                return;
            }
            setAccounts((prev) => prev.filter((a) => a.id !== id));
        } catch {
            setError("Gagal memutus koneksi.");
        } finally {
            setDisconnecting(null);
        }
    }

    const connected = new Set(accounts.map((a) => a.platform));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Koneksi akun</h1>
                <p className="text-sm text-muted-foreground">
                    Hubungkan akun sosial untuk menjadwalkan & menerbitkan konten.
                </p>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}
            {notice && <p className="rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">{notice}</p>}

            {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat akun…
                </div>
            ) : (
                <div className="space-y-4">
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
                        >
                            <PlatformAvatar platform={account.platform} avatar={account.avatar} name={account.name} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{account.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {PLATFORM_LABELS[account.platform]}
                                    {account.username ? ` · @${account.username}` : ""}
                                </p>
                                {account.lastRefreshError && (
                                    <p className="mt-0.5 text-xs text-accent-amber">{account.lastRefreshError}</p>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                loading={disconnecting === account.id}
                                onClick={() => handleDisconnect(account.id)}
                            >
                                <Link2Off className="h-4 w-4" />
                                Putus
                            </Button>
                        </div>
                    ))}

                    <div>
                        <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Hubungkan platform
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            {(["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "TIKTOK", "YOUTUBE", "THREADS", "PINTEREST", "LINKEDIN", "GOOGLE_BUSINESS"] as Platform[]).map((platform) => (
                                <div
                                    key={platform}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
                                >
                                    <div className="flex items-center gap-3">
                                        <PlatformAvatar platform={platform} name={PLATFORM_LABELS[platform]} />
                                        <span className="text-sm font-medium">{PLATFORM_LABELS[platform]}</span>
                                    </div>
                                    {connected.has(platform) ? (
                                        <span className="flex items-center gap-1.5 text-xs font-medium text-accent-green">
                                            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                                            Terhubung
                                        </span>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            loading={connecting === platform}
                                            onClick={() => handleConnect(platform)}
                                        >
                                            <Link2 className="h-4 w-4" />
                                            Hubungkan
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function PlatformAvatar({
    platform,
    avatar,
    name,
}: {
    platform: Platform;
    avatar?: string | null;
    name: string;
}) {
    const [failed, setFailed] = useState(false);
    if (avatar && !failed) {
        return (
            <img
                src={avatar}
                alt={name}
                onError={() => setFailed(true)}
                className="h-9 w-9 rounded-full object-cover"
            />
        );
    }
    return (
        <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: PLATFORM_COLORS[platform] }}
        >
            {name.slice(0, 2).toUpperCase()}
        </span>
    );
}