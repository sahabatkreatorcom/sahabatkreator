"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    RefreshCw,
    CheckCircle,
    Clock,
    AlertCircle,
    Link as LinkIcon,
    RefreshCw as RefreshIcon,
    CalendarClock,
    Database,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/constants";
import { cn } from "@/lib/utils";

interface PlatformStat {
    platform: string;
    accountName: string | null;
    username: string | null;
    isActive: boolean;
    lastSyncedAt: string | null;
    lastError: string | null;
    postPublished: number;
    postsScheduled: number;
    postsFailed: number;
    hasError: boolean;
}

interface PostItem {
    id: string;
    caption: string;
    platform: string | null;
    status: string;
    publishedAt: string | null;
    scheduledAt: string | null;
    externalUrl: string | null;
    externalId: string | null;
}

interface PublishError {
    id: string;
    postId: string;
    platform: string | null;
    errorMessage: string;
    retryCount: number;
    createdAt: string;
}

interface Snapshot {
    totalPublished: number;
    totalScheduled: number;
    totalFailed: number;
    totalAccounts: number;
    days: number;
}

interface StatusData {
    platformStats: PlatformStat[];
    published: PostItem[];
    scheduled: PostItem[];
    failed: PostItem[];
    publishErrors: PublishError[];
    snapshot: Snapshot;
}

export default function StatusPage() {
    const [data, setData] = useState<StatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState(14);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/status?days=${days}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat status.");
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat status.");
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Status Publikasi</h1>
                    <p className="text-sm text-muted-foreground">Pantau postingan, akun, dan error publikasi.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-border bg-card p-0.5">
                        {[7, 14, 30].map((d) => (
                            <button
                                key={d}
                                onClick={() => setDays(d)}
                                className={cn(
                                    "rounded px-2.5 py-1 text-xs font-medium",
                                    days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {d} hari
                            </button>
                        ))}
                    </div>
                    <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
                        Muat ulang
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-12 text-sm text-muted-foreground">Memuat statusâ€¦</p>
            ) : !data ? null : (
                <>
                    <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <CheckCircle className="h-4 w-4" />
                                <p className="text-xs">Terbit</p>
                            </div>
                            <p className="mt-1 text-2xl font-semibold">{data.snapshot.totalPublished}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <p className="text-xs">Terjadwal</p>
                            </div>
                            <p className="mt-1 text-2xl font-semibold">{data.snapshot.totalScheduled}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <AlertCircle className="h-4 w-4" />
                                <p className="text-xs">Gagal</p>
                            </div>
                            <p className="mt-1 text-2xl font-semibold text-accent-red">{data.snapshot.totalFailed}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Users className="h-4 w-4" />
                                <p className="text-xs">Akun terhubung</p>
                            </div>
                            <p className="mt-1 text-2xl font-semibold">{data.snapshot.totalAccounts}</p>
                        </div>
                    </div>

                    {/* Platform status */}
                    <div className="rounded-lg border border-border bg-card">
                        <div className="border-b border-border px-4 py-3">
                            <h2 className="text-sm font-semibold">Status Platform</h2>
                        </div>
                        {data.platformStats.length === 0 ? (
                            <p className="p-6 text-sm text-muted-foreground">Belum ada akun terhubung.</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {data.platformStats.map((acc) => (
                                    <div key={acc.platform} className="flex items-center gap-4 px-4 py-3">
                                        <div
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                            style={{ background: PLATFORM_COLORS[acc.platform as Platform] ?? "#6B7280" }}
                                        >
                                            <PlatformIcon platform={acc.platform} size={14} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">
                                                    {PLATFORM_LABELS[acc.platform as Platform] ?? acc.platform}
                                                </p>
                                                {acc.isActive === false ? (
                                                    <span className="rounded bg-accent-red/10 px-1.5 py-0.5 text-[10px] text-accent-red">Nonaktif</span>
                                                ) : (
                                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                                                )}
                                                {acc.hasError && <AlertCircle className="h-3.5 w-3.5 text-accent-red" />}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {acc.accountName || acc.username || acc.platform}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-6 text-xs">
                                            <div className="text-center">
                                                <p className="font-semibold">{acc.postPublished}</p>
                                                <p className="text-muted-foreground">Terbit</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="font-semibold">{acc.postsScheduled}</p>
                                                <p className="text-muted-foreground">Terjadwal</p>
                                            </div>
                                            <div className="text-center">
                                                <p className={cn("font-semibold", acc.postsFailed > 0 ? "text-accent-red" : "")}>
                                                    {acc.postsFailed}
                                                </p>
                                                <p className="text-muted-foreground">Gagal</p>
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                <p>Terakhir sinkron</p>
                                                <p>
                                                    {acc.lastSyncedAt
                                                        ? new Date(acc.lastSyncedAt).toLocaleDateString("id-ID", {
                                                              day: "numeric",
                                                              month: "short",
                                                          })
                                                        : "â€”"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent published posts */}
                    {data.published.length > 0 && (
                        <div className="rounded-lg border border-border bg-card">
                            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                                <h2 className="text-sm font-semibold">Postingan terbaru</h2>
                            </div>
                            <ul className="divide-y divide-border">
                                {data.published.map((p) => (
                                    <li key={p.id} className="flex items-center gap-3 p-4">
                                        <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                                            {PLATFORM_LABELS[p.platform as Platform] ?? p.platform ?? "â€”"}
                                        </span>
                                        <span className="flex-1 truncate text-sm">{p.caption}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {p.publishedAt && new Date(p.publishedAt).toLocaleDateString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                            })}
                                        </span>
                                        {p.externalUrl && (
                                            <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                                <LinkIcon className="h-4 w-4" />
                                            </a>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Scheduled posts */}
                    {data.scheduled.length > 0 && (
                        <div className="rounded-lg border border-border bg-card">
                            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
                                <CalendarClock className="h-4 w-4 text-amber-500" />
                                <h2 className="text-sm font-semibold">Terjadwal</h2>
                            </div>
                            <ul className="divide-y divide-border">
                                {data.scheduled.map((p) => (
                                    <li key={p.id} className="flex items-center gap-3 p-4">
                                        <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                                            {PLATFORM_LABELS[p.platform as Platform] ?? p.platform ?? "â€”"}
                                        </span>
                                        <span className="flex-1 truncate text-sm">{p.caption}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {p.scheduledAt && new Date(p.scheduledAt).toLocaleString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Publish errors */}
                    {data.publishErrors.length > 0 && (
                        <div className="rounded-lg border border-accent-red/30 bg-card">
                            <div className="border-b border-accent-red/30 px-4 py-3 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-accent-red" />
                                <h2 className="text-sm font-semibold text-accent-red">Error Publikasi</h2>
                            </div>
                            <ul className="divide-y divide-accent-red/20">
                                {data.publishErrors.map((err) => (
                                    <li key={err.id} className="p-4">
                                        <div className="flex items-start gap-3">
                                            <AlertCircle className="h-4 w-4 text-accent-red mt-0.5 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-accent-red">
                                                    {PLATFORM_LABELS[err.platform as Platform] ?? err.platform ?? "Platform"}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{err.errorMessage}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    retry: {err.retryCount} Â· {new Date(err.createdAt).toLocaleString("id-ID")}
                                                </p>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}