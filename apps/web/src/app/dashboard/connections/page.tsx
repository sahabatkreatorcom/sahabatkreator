"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Link2Off, Loader2, ChevronDown, AlertTriangle, RefreshCw, Plus, Info } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";

const REFRESH_TOKEN_PLATFORMS: Platform[] = ["YOUTUBE", "GOOGLE_BUSINESS", "TIKTOK", "PINTEREST", "LINKEDIN"];

interface Account {
    id: string;
    platform: Platform;
    name: string;
    username: string | null;
    avatar: string | null;
    tokenExpiry: string | null;
    hasRefreshToken: boolean;
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

const PLATFORM_ORDER: Platform[] = [
    "BLUESKY",
    "PINTEREST",
    "TIKTOK",
    "INSTAGRAM",
    "INSTAGRAM_PAGE",
    "FACEBOOK",
    "YOUTUBE",
    "THREADS",
    "LINKEDIN",
    "GOOGLE_BUSINESS",
];

function tokenStatus(account: Pick<Account, "platform" | "tokenExpiry" | "hasRefreshToken" | "lastRefreshError">): {
    label: string;
    tone: "ok" | "warn" | "expired" | "none";
} {
    if (REFRESH_TOKEN_PLATFORMS.includes(account.platform) && account.hasRefreshToken && !account.lastRefreshError) {
        return { label: "Token aktif (refresh otomatis)", tone: "ok" };
    }
    if (account.lastRefreshError) {
        return { label: "Refresh gagal — hubungkan ulang", tone: "expired" };
    }
    if (!account.tokenExpiry) return { label: "Token tidak diketahui", tone: "none" };
    const expiry = new Date(account.tokenExpiry).getTime();
    const now = Date.now();
    if (expiry < now) return { label: "Token kedaluwarsa — hubungkan ulang", tone: "expired" };
    const daysLeft = (expiry - now) / 86_400_000;
    if (daysLeft < 7) return { label: `Token hampir kedaluwarsa (${Math.max(0, Math.floor(daysLeft))} hari)`, tone: "warn" };
    return { label: `Token valid hingga ${new Date(expiry).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`, tone: "ok" };
}

const TOKEN_TONE_STYLE: Record<string, string> = {
    ok: "text-accent-green",
    warn: "text-accent-amber",
    expired: "text-accent-red",
    none: "text-muted-foreground",
};

export default function ConnectionsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState<Platform | null>(null);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState<string | null>(null);
    const [autoRefreshing, setAutoRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [orgName, setOrgName] = useState<string>("");
    const activeOrgRef = useRef<string | null>(null);

    const [pendingChoices, setPendingChoices] = useState<{ platform: Platform; pages: PageChoice[] } | null>(null);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingSaving, setPendingSaving] = useState(false);

    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [showInfoDialog, setShowInfoDialog] = useState<Account | null>(null);

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
                router.replace("/connections");
                return;
            }
            setPendingChoices({ platform, pages: data.pages });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat pilihan halaman.");
            router.replace("/connections");
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
            router.replace("/connections");
            loadAccounts();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan akun.");
        } finally {
            setPendingSaving(false);
        }
    };

    const cancelPending = () => {
        setPendingChoices(null);
        router.replace("/connections");
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

    useEffect(() => {
        fetch("/api/organization")
            .then((res) => res.json())
            .then((data) => {
                if (data.organization?.name) setOrgName(data.organization.name);
            })
            .catch(() => {});
    }, []);

    const didAutoRefresh = useRef(false);
    useEffect(() => {
        if (didAutoRefresh.current) return;
        didAutoRefresh.current = true;
        if (accounts.length === 0) return;

        const needsRefresh = accounts.some(
            (a) =>
                a.lastRefreshError ||
                (a.tokenExpiry && new Date(a.tokenExpiry).getTime() < Date.now() + 7 * 86_400_000),
        );
        if (!needsRefresh) return;

        setAutoRefreshing(true);
        fetch("/api/accounts/refresh")
            .then((res) => res.json())
            .then((data) => {
                if (data.results?.some((r: { refreshed: boolean }) => r.refreshed)) {
                    setNotice("Token yang hampir kedaluwarsa berhasil diperbarui otomatis.");
                } else if (data.results?.some((r: { error?: string }) => r.error)) {
                    const failed = data.results.find((r: { error?: string }) => r.error);
                    setError(`Beberapa akun perlu dihubungkan ulang: ${failed?.error ?? "token tidak bisa diperbarui."}`);
                }
                loadAccounts();
            })
            .catch(() => {})
            .finally(() => setAutoRefreshing(false));
    }, [accounts, loadAccounts]);

    async function handleRefresh(id: string) {
        setRefreshing(id);
        setError(null);
        try {
            const res = await fetch("/api/accounts/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountId: id, force: true }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal memperbarui token.");
                loadAccounts();
                return;
            }
            setNotice(data.refreshed ? "Token berhasil diperbarui." : "Token masih valid, tidak perlu diperbarui.");
            loadAccounts();
        } catch {
            setError("Gagal memperbarui token.");
        } finally {
            setRefreshing(null);
        }
    }

    async function handleReconnect(platform: Platform) {
        await handleConnect(platform);
    }

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
    const connectedPlatformCount = connected.size;
    const accountsWithIssue = accounts.filter((a) => {
        if (a.lastRefreshError) return true;
        const st = tokenStatus(a);
        return st.tone === "expired" || st.tone === "warn" || st.tone === "none";
    }).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Koneksi akun</h1>
                    <p className="text-sm text-muted-foreground">
                        Hubungkan akun sosial untuk menjadwalkan & menerbitkan konten.
                    </p>
                </div>
                <Button onClick={() => setShowConnectDialog(true)}>
                    <Plus className="h-4 w-4" />
                    Hubungkan
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}
            {notice && <p className="rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">{notice}</p>}
            {autoRefreshing && (
                <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memeriksa & memperbarui token secara otomatis…
                </p>
            )}

            {loading ? (
                <div className="grid gap-4 md:grid-cols-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
                    ))}
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Ringkasan */}
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-2xl font-semibold">{accounts.length}</p>
                            <p className="text-xs text-muted-foreground">Total akun terhubung</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-2xl font-semibold">{connectedPlatformCount}</p>
                            <p className="text-xs text-muted-foreground">Platform aktif</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className={`text-2xl font-semibold ${accountsWithIssue > 0 ? "text-accent-amber" : ""}`}>
                                {accountsWithIssue}
                            </p>
                            <p className="text-xs text-muted-foreground">Akun perlu perhatian (token / error)</p>
                        </div>
                    </div>

                    {/* Daftar akun per platform */}
                    {accounts.length > 0 && (
                        <div>
                            <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Akun terhubung
                            </p>
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                {accounts.map((account) => {
                                    const status = tokenStatus(account);
                                    const needsReconnect = status.tone === "expired" || account.lastRefreshError;
                                    return (
                                        <div
                                            key={account.id}
                                            className="flex flex-col rounded-lg border border-border bg-card p-4"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2">
                                                    <PlatformIconRow platform={account.platform} />
                                                    <div>
                                                        <p className="text-sm font-medium">{PLATFORM_LABELS[account.platform]}</p>
                                                        <span
                                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                                                needsReconnect
                                                                    ? "bg-accent-amber/10 text-accent-amber"
                                                                    : "bg-accent-green/10 text-accent-green"
                                                            }`}
                                                        >
                                                            {needsReconnect ? "Needs reconnection" : "connected"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setShowInfoDialog(account)}
                                                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                                                >
                                                    <Info className="h-4 w-4" />
                                                </button>
                                            </div>

                                            {needsReconnect && (
                                                <p className="mt-2 flex items-center gap-1 text-xs text-accent-amber">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Needs reconnection
                                                </p>
                                            )}

                                            <div className="mt-3 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {account.username ? `@${account.username}` : account.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(account.createdAt).toLocaleDateString("id-ID", {
                                                        day: "numeric",
                                                        month: "numeric",
                                                        year: "numeric",
                                                        timeZone: "Asia/Jakarta",
                                                    })}
                                                </p>
                                            </div>

                                            <div className="mt-3 border-t border-border pt-3">
                                                <p className="mb-2 text-[10px] text-muted-foreground">{orgName} Profile Update</p>
                                                <div className="flex gap-2">
                                                    {needsReconnect ? (
                                                        <>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                loading={connecting === account.platform}
                                                                onClick={() => handleReconnect(account.platform)}
                                                                className="flex-1"
                                                            >
                                                                Reconnect
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => handleDisconnect(account.id)}
                                                                loading={disconnecting === account.id}
                                                            >
                                                                Disconnect
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            className="w-full"
                                                            onClick={() => handleDisconnect(account.id)}
                                                            loading={disconnecting === account.id}
                                                        >
                                                            Disconnect
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Dialog Hubungkan Platform */}
            <Dialog
                open={showConnectDialog}
                onClose={() => setShowConnectDialog(false)}
                title="Hubungkan platform"
                description="Pilih platform yang ingin dihubungkan ke akun Anda."
            >
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {PLATFORM_ORDER.map((platform) => (
                        <button
                            key={platform}
                            onClick={() => {
                                setShowConnectDialog(false);
                                handleConnect(platform);
                            }}
                            disabled={connecting === platform}
                            className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            <PlatformIconRow platform={platform} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{PLATFORM_LABELS[platform]}</p>
                                <p className="text-xs text-muted-foreground">
                                    {countByPlatform[platform] > 0
                                        ? `${countByPlatform[platform]} akun terhubung`
                                        : "Belum terhubung"}
                                </p>
                            </div>
                            {connecting === platform ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                            )}
                        </button>
                    ))}
                </div>
            </Dialog>

            {/* Dialog Info Akun */}
            <Dialog
                open={showInfoDialog !== null}
                onClose={() => setShowInfoDialog(null)}
                title="Detail akun"
                description={showInfoDialog ? `${PLATFORM_LABELS[showInfoDialog.platform]}` : ""}
            >
                {showInfoDialog && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <PlatformAvatar platform={showInfoDialog.platform} avatar={showInfoDialog.avatar} name={showInfoDialog.name} />
                            <div>
                                <p className="font-medium">{showInfoDialog.name}</p>
                                {showInfoDialog.username && (
                                    <p className="text-sm text-muted-foreground">@{showInfoDialog.username}</p>
                                )}
                            </div>
                        </div>
                        <div className="rounded-md bg-muted p-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Status</span>
                                <span className={TOKEN_TONE_STYLE[tokenStatus(showInfoDialog).tone]}>
                                    {tokenStatus(showInfoDialog).label}
                                </span>
                            </div>
                            <div className="mt-1 flex justify-between">
                                <span className="text-muted-foreground">Terhubung sejak</span>
                                <span>
                                    {new Date(showInfoDialog.createdAt).toLocaleDateString("id-ID", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                        timeZone: "Asia/Jakarta",
                                    })}
                                </span>
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => setShowInfoDialog(null)}
                        >
                            Tutup
                        </Button>
                    </div>
                )}
            </Dialog>

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

function PlatformIconRow({ platform }: { platform: Platform }) {
    return (
        <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-white"
            style={{ background: PLATFORM_COLORS[platform] }}
        >
            <PlatformIcon platform={platform} size={16} />
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
