"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Link2Off, Loader2, ChevronDown } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";

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

interface PageChoice {
    pageId: string;
    pageName: string;
    accountId?: string;
    accountName?: string;
    username?: string;
    avatar?: string | null;
}

export default function ConnectionsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState<Platform | null>(null);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const activeOrgRef = useRef<string | null>(null);

    // Pilihan halaman (dialog FACEBOOK / INSTAGRAM_PAGE)
    const [pendingChoices, setPendingChoices] = useState<{ platform: Platform; pages: PageChoice[] } | null>(null);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingSaving, setPendingSaving] = useState(false);

    // Tangani parameter query dari callback OAuth
    useEffect(() => {
        const success = searchParams.get("success");
        const err = searchParams.get("error");
        const pendingId = searchParams.get("pending");
        const pendingPlatform = searchParams.get("platform");
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
        } else if (pendingId && pendingPlatform) {
            loadPendingChoices(pendingId, pendingPlatform as Platform);
        }
    }, [searchParams]);

    const loadPendingChoices = async (pendingId: string, platform: Platform) => {
        setPendingLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/accounts/pending/${pendingId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat pilihan halaman.");
            if (data.pages.length === 0) {
                setError(
                    platform === "INSTAGRAM_PAGE"
                        ? "Tidak ada halaman dengan Instagram business account yang ditemukan."
                        : "Tidak ada halaman Facebook yang ditemukan.",
                );
                router.replace("/settings/connections");
                return;
            }
            setPendingChoices({ platform, pages: data.pages });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat pilihan halaman.");
            router.replace("/settings/connections");
        } finally {
            setPendingLoading(false);
        }
    };

    const savePendingChoice = async (pageId: string) => {
        const pendingId = searchParams.get("pending");
        if (!pendingId) return;
        setPendingSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/accounts/pending/${pendingId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pageId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menyimpan akun.");
            setPendingChoices(null);
            setNotice("Akun berhasil dihubungkan.");
            router.replace("/settings/connections");
            loadAccounts();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan akun.");
        } finally {
            setPendingSaving(false);
        }
    };

    const cancelPending = () => {
        setPendingChoices(null);
        router.replace("/settings/connections");
    };

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
    const countByPlatform = accounts.reduce<Record<string, number>>((acc, a) => {
        acc[a.platform] = (acc[a.platform] ?? 0) + 1;
        return acc;
    }, {});

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
                    Memuat akunâ€¦
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
                                    {account.username ? ` Â· @${account.username}` : ""}
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
                                        <div>
                                            <span className="text-sm font-medium">{PLATFORM_LABELS[platform]}</span>
                                            {countByPlatform[platform] > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    {countByPlatform[platform]} akun terhubung
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={connected.has(platform) ? "secondary" : "primary"}
                                        loading={connecting === platform}
                                        onClick={() => handleConnect(platform)}
                                    >
                                        <Link2 className="h-4 w-4" />
                                        {connected.has(platform) ? "Tambah akun" : "Hubungkan"}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog pilihan halaman (FACEBOOK / INSTAGRAM_PAGE) */}
            <Dialog
                open={pendingLoading || pendingChoices !== null}
                onClose={cancelPending}
                title={pendingChoices?.platform === "INSTAGRAM_PAGE" ? "Pilih halaman Instagram" : "Pilih halaman Facebook"}
                description={
                    pendingChoices?.platform === "INSTAGRAM_PAGE"
                        ? "Pilih halaman Facebook yang tertaut dengan Instagram business account untuk dihubungkan."
                        : "Pilih halaman Facebook yang ingin dihubungkan."
                }
            >
                {pendingLoading ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat pilihan halaman...
                    </div>
                ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {pendingChoices?.pages.map((page) => (
                            <button
                                key={`${page.pageId}-${page.accountId ?? "fb"}`}
                                onClick={() => savePendingChoice(page.pageId)}
                                disabled={pendingSaving}
                                className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                            >
                                {page.avatar ? (
                                    <img
                                        src={page.avatar}
                                        alt={page.accountName || page.pageName}
                                        className="h-9 w-9 rounded-full object-cover"
                                    />
                                ) : (
                                    <span
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                                        style={{ background: pendingChoices.platform === "INSTAGRAM_PAGE" ? "#E4405F" : "#1877F2" }}
                                    >
                                        <PlatformIcon platform={pendingChoices.platform === "INSTAGRAM_PAGE" ? "INSTAGRAM" : "FACEBOOK"} size={18} />
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                        {pendingChoices.platform === "INSTAGRAM_PAGE" ? page.accountName || page.pageName : page.pageName}
                                    </p>
                                    {pendingChoices.platform === "INSTAGRAM_PAGE" && page.username && (
                                        <p className="truncate text-xs text-muted-foreground">@{page.username}</p>
                                    )}
                                    <p className="truncate text-xs text-muted-foreground">
                                        {pendingChoices.platform === "INSTAGRAM_PAGE" ? `via halaman: ${page.pageName}` : "Halaman Facebook"}
                                    </p>
                                </div>
                                <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                )}
            </Dialog>
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
            className="flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{ background: PLATFORM_COLORS[platform] }}
        >
            <PlatformIcon platform={platform} size={18} />
        </span>
    );
}
