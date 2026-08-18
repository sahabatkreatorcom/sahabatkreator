"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Loader2,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Flame,
    BarChart3,
    Eye,
    ThumbsUp,
    MessageCircle,
    Share2,
    Bookmark,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface SeriesPoint {
    date: string;
    followers: number;
    impressions: number;
    reach: number;
    engagementRate: number;
}

interface PlatformTrend {
    platform: string;
    accountName: string | null;
    accountAvatar: string | null;
    latest: { followers: number; impressions: number; reach: number; engagementRate: number };
    delta: {
        followers: number;
        followersPct: number;
        impressions: number;
        impressionsPct: number;
        reach: number;
        reachPct: number;
    };
    series: SeriesPoint[];
}

interface TopPost {
    postId: string;
    caption: string | null;
    platform: string | null;
    publishedAt: string | null;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
    score: number;
}

interface PlatformAvg {
    platform: string;
    avgEngagementRate: number;
    samples: number;
}

interface TrendsData {
    platformTrends: PlatformTrend[];
    topPosts: TopPost[];
    platformAvg: PlatformAvg[];
    days: number;
}

const DAY_OPTIONS = [7, 30, 90];
const METRIC_OPTIONS = [
    { key: "followers", label: "Pengikut", color: "#6366F1" },
    { key: "impressions", label: "Tayangan", color: "#E4405F" },
    { key: "reach", label: "Jangkauan", color: "#0EA5E9" },
    { key: "engagementRate", label: "Engagement rate", color: "#10B981" },
] as const;
type MetricKey = (typeof METRIC_OPTIONS)[number]["key"];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
            <p className="font-medium">{label}</p>
            {payload.map((p) => (
                <p key={p.name} style={{ color: p.color }}>
                    {p.name}: {Number(p.value).toLocaleString("id-ID")}
                </p>
            ))}
        </div>
    );
}

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + " jt";
    if (n >= 1000) return (n / 1000).toFixed(1) + " rb";
    return n.toLocaleString("id-ID");
}

export default function TrendsPage() {
    const [days, setDays] = useState(30);
    const [metric, setMetric] = useState<MetricKey>("followers");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<TrendsData | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/analytics/trends?days=${days}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat tren.");
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat tren.");
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        load();
    }, [load]);

    const bestGrower = useMemo(() => {
        if (!data?.platformTrends.length) return null;
        return [...data.platformTrends].sort((a, b) => b.delta.followersPct - a.delta.followersPct)[0];
    }, [data]);

    const bestEngagement = useMemo(() => {
        if (!data?.platformAvg.length) return null;
        return [...data.platformAvg].sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)[0];
    }, [data]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Tren</h1>
                    <p className="text-sm text-muted-foreground">Pertumbuhan & performa konten dari data analytics Anda.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-border bg-card p-0.5">
                        {DAY_OPTIONS.map((d) => (
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
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-12 text-sm text-muted-foreground">Memuatâ€¦</p>
            ) : !data || data.platformTrends.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                    <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                        Belum ada data analytics. Jalankan "Sinkronkan" di halaman Analitik untuk mulai melihat tren.
                    </p>
                </div>
            ) : (
                <>
                    {(bestGrower || bestEngagement) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {bestGrower && (
                                <div className="rounded-lg border border-border bg-card p-4">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Flame className="h-4 w-4" />
                                        <p className="text-xs">Pertumbuhan tercepat ({data.days} hari)</p>
                                    </div>
                                    <p className="mt-1 text-sm font-medium">
                                        {PLATFORM_LABELS[bestGrower.platform as Platform] ?? bestGrower.platform}
                                        {bestGrower.accountName ? ` Â· ${bestGrower.accountName}` : ""}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-primary">
                                        +{formatNumber(bestGrower.delta.followers)} pengikut
                                        <span className="ml-1 text-xs font-medium">(+{bestGrower.delta.followersPct}%)</span>
                                    </p>
                                </div>
                            )}
                            {bestEngagement && (
                                <div className="rounded-lg border border-border bg-card p-4">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <BarChart3 className="h-4 w-4" />
                                        <p className="text-xs">Engagement rate tertinggi</p>
                                    </div>
                                    <p className="mt-1 text-sm font-medium">
                                        {PLATFORM_LABELS[bestEngagement.platform as Platform] ?? bestEngagement.platform}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-emerald-500">
                                        {bestEngagement.avgEngagementRate}%<span className="ml-1 text-xs font-medium text-muted-foreground">rata-rata</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        {data.platformTrends.map((p) => (
                            <div key={p.platform} className="rounded-lg border border-border bg-card p-4">
                                <div className="flex items-center gap-2">
                                    {p.accountAvatar ? (
                                        <img src={p.accountAvatar} alt={p.accountName ?? p.platform} className="h-7 w-7 rounded-full object-cover" />
                                    ) : (
                                        <div
                                            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                                            style={{ background: PLATFORM_COLORS[p.platform as Platform] ?? "#6B7280" }}
                                        >
                                            <PlatformIcon platform={p.platform} size={14} />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium">{PLATFORM_LABELS[p.platform as Platform] ?? p.platform}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatNumber(p.latest.followers)} pengikut Â· {formatNumber(p.latest.impressions)} tayangan
                                        </p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-3 text-xs">
                                        <span
                                            className={cn(
                                                "flex items-center gap-1 font-medium",
                                                p.delta.followersPct >= 0 ? "text-emerald-500" : "text-accent-red"
                                            )}
                                        >
                                            {p.delta.followersPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                            {Math.abs(p.delta.followersPct)}% pengikut
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-3 h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                            data={p.series.map((s) => ({
                                                ...s,
                                                dateLabel: new Date(s.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
                                            }))}
                                            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                            <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={56} />
                                            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.2, strokeDasharray: "4 4" }} />
                                            <Line
                                                type="monotone"
                                                dataKey={metric}
                                                name={METRIC_OPTIONS.find((m) => m.key === metric)?.label}
                                                stroke={METRIC_OPTIONS.find((m) => m.key === metric)?.color}
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={{ r: 3 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {METRIC_OPTIONS.map((m) => (
                                        <button
                                            key={m.key}
                                            onClick={() => setMetric(m.key)}
                                            className={cn(
                                                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                                                metric === m.key
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border text-muted-foreground hover:bg-muted"
                                            )}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {data.topPosts.length > 0 && (
                        <div className="rounded-lg border border-border bg-card">
                            <div className="border-b border-border px-4 py-3">
                                <h2 className="text-sm font-semibold">Konten berperforma terbaik</h2>
                            </div>
                            <ul className="divide-y divide-border">
                                {data.topPosts.map((post) => (
                                    <li key={post.postId} className="flex flex-wrap items-center gap-3 p-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-1 text-sm font-medium">{post.caption || "(tanpa caption)"}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {post.platform ? PLATFORM_LABELS[post.platform as Platform] ?? post.platform : "â€”"}
                                                {post.publishedAt
                                                    ? ` Â· ${new Date(post.publishedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
                                                    : ""}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{formatNumber(post.impressions)}</span>
                                            <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{formatNumber(post.likes)}</span>
                                            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{formatNumber(post.comments)}</span>
                                            <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" />{formatNumber(post.shares)}</span>
                                            {post.saves > 0 && <span className="flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />{formatNumber(post.saves)}</span>}
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
