"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, RefreshCw, Users, MessageSquare, FileText } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";
import { PLATFORM_STORAGE_POLICIES } from "@/lib/analytics/policy";
import { cn } from "@/lib/utils";

interface SeriesPoint {
    date: string;
    followers: number;
    impressions: number;
    reach: number;
    postsPublished: number;
}

interface PerPlatform {
    platform: Platform;
    followers: number;
    followersChange: number;
    impressions: number;
    reach: number;
    engagementRate: number;
    postsPublished: number;
    accountName: string | null;
    accountAvatar: string | null;
}

interface Overview {
    totals: { followers: number; impressions: number; reach: number; postsPublished: number };
    perPlatform: PerPlatform[];
    series: SeriesPoint[];
    connectedAccounts: number;
    publishedPosts: number;
    days: number;
}

interface Account {
    platform: Platform;
    name: string;
}

const formatNumber = (n: number) => new Intl.NumberFormat("id-ID", { notation: n >= 100000 ? "compact" : "standard" }).format(n);

const formatCompact = (n: number) => new Intl.NumberFormat("id-ID", { notation: "compact" }).format(n);

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; stroke: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
            {payload.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 text-xs font-medium">
                    <span className="flex items-center gap-1.5 capitalize">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.stroke }} />
                        {entry.name}
                    </span>
                    <span className="font-mono tabular-nums">{formatCompact(entry.value)}</span>
                </div>
            ))}
        </div>
    );
}

function TrendChart({ data, color, metric, label }: { data: SeriesPoint[]; color: string; metric: "followers" | "impressions" | "reach"; label: string }) {
    const chartData = useMemo(() => data.map((p) => ({ ...p, dateLabel: new Date(p.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) })), [data]);

    if (data.length === 0) {
        return <p className="py-8 text-center text-xs text-muted-foreground">Belum ada data untuk rentang ini.</p>;
    }

    return (
        <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
                <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 11, opacity: 0.6 }} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 11, opacity: 0.6 }} tickFormatter={formatCompact} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.2, strokeDasharray: "4 4" }} />
                <Line type="monotone" dataKey={metric} name={label} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
        </ResponsiveContainer>
    );
}

export default function AnalyticsPage() {
    const [days, setDays] = useState(30);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [ovRes, accRes] = await Promise.all([
                fetch(`/api/analytics/overview?days=${days}`),
                fetch("/api/accounts"),
            ]);
            const [ov, acc] = await Promise.all([ovRes.json(), accRes.json()]);
            if (ovRes.ok) setOverview(ov);
            else setError(ov.error || "Gagal memuat data analitik.");
            if (accRes.ok) setAccounts(acc.accounts ?? []);
        } catch {
            setError("Gagal terhubung ke server.");
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleSync() {
        setSyncing(true);
        setSyncResult(null);
        setError(null);
        try {
            const res = await fetch("/api/analytics/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal menyinkronkan.");
            } else {
                setSyncResult(
                    `Tersinkron: ${data.synced ?? 0} akun · dilewati kebijakan: ${data.skippedByPolicy ?? 0} · gagal: ${data.failed ?? 0} · dihapus (retensi): ${data.purged ?? 0}`
                );
                load();
            }
        } catch {
            setError("Gagal menyinkronkan.");
        } finally {
            setSyncing(false);
        }
    }

    // Platform yang terhubung tetapi kebijakannya melarang penyimpanan â†’ tampilkan "live saja".
    const liveOnlyPlatforms = useMemo(
        () =>
            accounts
                .map((a) => a.platform)
                .filter((p, i, arr) => arr.indexOf(p) === i)
                .filter((p) => PLATFORM_STORAGE_POLICIES[p]?.storage === "NOT_ALLOWED"),
        [accounts]
    );

    const latestFollowersChange = overview?.perPlatform.reduce((a, p) => a + (p.followersChange ?? 0), 0) ?? 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Analitik</h1>
                    <p className="text-sm text-muted-foreground">Performa akun sosial workspace Anda.</p>
                </div>
                <div className="flex items-center gap-2">
                    {[7, 30, 90].map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={cn(
                                "rounded-full border px-3 py-1 text-sm transition-colors",
                                days === d
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                            )}
                        >
                            {d} hari
                        </button>
                    ))}
                    <Button variant="secondary" size="sm" loading={syncing} onClick={handleSync}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sinkronkan
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}
            {syncResult && <p className="rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">{syncResult}</p>}
            {liveOnlyPlatforms.length > 0 && (
                <p className="rounded-md bg-accent-amber/10 px-3 py-2 text-sm text-accent-amber">
                    Platform {liveOnlyPlatforms.map((p) => PLATFORM_LABELS[p]).join(", ")} tidak menyimpan metrik karena
                    kebijakan platform — data ditampilkan langsung (live) dari platform.
                </p>
            )}

            {loading && !overview ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat analitik…
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard label="Pengikut" value={formatNumber(overview?.totals.followers ?? 0)} />
                        <StatCard label="Tayangan" value={formatNumber(overview?.totals.impressions ?? 0)} />
                        <StatCard label="Jangkauan" value={formatNumber(overview?.totals.reach ?? 0)} />
                        <StatCard label="Post terbit" value={formatNumber(overview?.totals.postsPublished ?? 0)} />
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="mb-2 text-sm font-medium">Tren pengikut</p>
                            <TrendChart data={overview?.series ?? []} color="#1877F2" metric="followers" label="Pengikut" />
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="mb-2 text-sm font-medium">Tren tayangan</p>
                            <TrendChart data={overview?.series ?? []} color="#E4405F" metric="impressions" label="Tayangan" />
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
                            <p className="mb-2 text-sm font-medium">Tren jangkauan</p>
                            <TrendChart data={overview?.series ?? []} color="#0A66C2" metric="reach" label="Jangkauan" />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {overview?.perPlatform.map((p) => (
                            <div key={p.platform} className="rounded-lg border border-border bg-card p-4">
                                <div className="flex items-center gap-2">
                                    {p.accountAvatar ? (
                                        <img src={p.accountAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                                    ) : (
                                        <span
                                            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                            style={{ background: PLATFORM_COLORS[p.platform] }}
                                        >
                                            <PlatformIcon platform={p.platform} size={14} />
                                        </span>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{p.accountName ?? PLATFORM_LABELS[p.platform]}</p>
                                        <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[p.platform]}</p>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-mono tabular-nums">{formatNumber(p.followers)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-mono tabular-nums">{formatNumber(p.impressions)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-mono tabular-nums">{p.engagementRate}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-mono tabular-nums">{p.postsPublished}</span>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {liveOnlyPlatforms.map((p) => (
                            <div key={p} className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                        style={{ background: PLATFORM_COLORS[p] }}
                                    >
                                        <PlatformIcon platform={p} size={14} />
                                    </span>
                                    <p className="truncate text-sm font-medium">{PLATFORM_LABELS[p]}</p>
                                </div>
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Metrik tidak disimpan (kebijakan platform) — tampilkan langsung dari platform.
                                </p>
                            </div>
                        ))}

                        {!loading && overview?.perPlatform.length === 0 && liveOnlyPlatforms.length === 0 && (
                            <div className="col-span-full rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                                Belum ada data. Hubungkan akun sosial lalu klik <span className="font-medium">Sinkronkan</span>.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
