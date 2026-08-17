"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    CalendarClock,
    TrendingUp,
    UserPlus,
    MessageCircle,
    AtSign,
    MessageSquare,
    RefreshCw,
    Inbox as InboxIcon,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { PLATFORM_LABELS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface Stats {
    scheduledPosts: number;
    todayScheduled: number;
    engagementRate: number;
    newFollowers: number;
    accountsConnected: number;
    published7d: number;
}

interface InboxStats {
    unansweredComments: number;
    unreadMentions: number;
    unreadMessages: number;
}

interface QueueItem {
    id: string;
    platform: string | null;
    title: string;
    time: string | null;
    status: "SCHEDULED" | "PUBLISHED";
}

interface ActivityItem {
    id: string;
    action: string;
    description: string;
    details: string | null;
    userName: string | null;
    createdAt: string;
}

interface OverviewData {
    stats: Stats;
    inbox: InboxStats;
    queue: QueueItem[];
    activities: ActivityItem[];
}

const statusStyle: Record<string, string> = {
    SCHEDULED: "bg-accent-amber/15 text-accent-amber",
    PUBLISHED: "bg-accent-green/15 text-accent-green",
};

const statusLabel: Record<string, string> = {
    SCHEDULED: "Terjadwal",
    PUBLISHED: "Terbit",
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    "post": <CalendarClock className="h-3.5 w-3.5" />,
    "analytics": <TrendingUp className="h-3.5 w-3.5" />,
    "comment": <MessageCircle className="h-3.5 w-3.5" />,
    "seb": <TrendingUp className="h-3.5 w-3.5" />,
    "team": <UserPlus className="h-3.5 w-3.5" />,
};

function activityActionLabel(action: string): string {
    if (action.startsWith("post.")) return action.split(".")[1]?.replace(/_/g, " ") ?? action;
    if (action.startsWith("comment.")) return action.split(".")[1]?.replace(/_/g, " ") ?? action;
    if (action.startsWith("seb.")) return action.split(".")[1]?.replace(/_/g, " ") ?? action;
    if (action.startsWith("team.")) return action.split(".")[1]?.replace(/_/g, " ") ?? action;
    return action.replace(/_/g, " ");
}

export default function DashboardPage() {
    const [data, setData] = useState<OverviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/dashboard/overview");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat ringkasan.");
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat ringkasan.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (loading && !data) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat ringkasan…</p>;
    }

    const s = data?.stats;
    const inbox = data?.inbox;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Ringkasan</h1>
                    <p className="text-sm text-muted-foreground">Aktivitas workspace 7 hari terakhir.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Muat ulang
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                    label={s && s.todayScheduled > 0 ? `Post terjadwal (${s.todayScheduled} hari ini)` : "Post terjadwal"}
                    value={String(s?.scheduledPosts ?? 0)}
                    delta={s ? `${s.published7d} terbit 7 hari` : undefined}
                    trend={s && s.published7d > 0 ? "up" : undefined}
                />
                <StatCard
                    label="Engagement rate"
                    value={`${s?.engagementRate ?? 0}%`}
                    delta={s ? `dari ${s.accountsConnected} akun` : undefined}
                    trend="up"
                />
                <StatCard
                    label="Followers baru (7 hari)"
                    value={(s?.newFollowers ?? 0).toLocaleString("id-ID")}
                    delta="7 hari terakhir"
                    trend={s && s.newFollowers > 0 ? "up" : "down"}
                />
                <StatCard
                    label="Komentar belum dibalas"
                    value={String(inbox?.unansweredComments ?? 0)}
                    delta={`${inbox?.unreadMentions ?? 0} sebutan · ${inbox?.unreadMessages ?? 0} pesan`}
                    trend={inbox && inbox.unansweredComments > 0 ? "down" : "up"}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border p-4">
                        <h2 className="text-sm font-semibold">Antrean konten</h2>
                        <a href="/dashboard/calendar" className="text-xs font-medium text-primary hover:underline">
                            Lihat kalender
                        </a>
                    </div>
                    {!data?.queue?.length ? (
                        <p className="p-6 text-sm text-muted-foreground">
                            Belum ada konten. Buat jadwal di Kalender konten.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {data.queue.map((item) => (
                                <li key={item.id} className="flex items-center gap-3 p-4">
                                    <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                                        {item.platform ? PLATFORM_LABELS[item.platform as Platform] ?? item.platform : "—"}
                                    </span>
                                    <span className="flex-1 truncate text-sm">{item.title}</span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {item.time
                                            ? new Date(item.time).toLocaleString("id-ID", {
                                                  day: "numeric",
                                                  month: "short",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                              })
                                            : ""}
                                    </span>
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusStyle[item.status])}>
                                        {statusLabel[item.status]}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border p-4">
                        <h2 className="text-sm font-semibold">Aktivitas terbaru</h2>
                        <a href="/dashboard/activity" className="text-xs font-medium text-primary hover:underline">
                            Lihat semua
                        </a>
                    </div>
                    {!data?.activities?.length ? (
                        <p className="p-6 text-sm text-muted-foreground">Belum ada aktivitas.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {data.activities.map((a) => (
                                <li key={a.id} className="flex items-start gap-3 p-4">
                                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        {ACTIVITY_ICONS[a.action.split(".")[0]] ?? <InboxIcon className="h-3.5 w-3.5" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm">
                                            <span className="font-medium capitalize">{activityActionLabel(a.action)}</span>
                                            {a.description ? <span className="text-muted-foreground"> · {a.description}</span> : null}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {a.userName ?? "Sistem"} ·{" "}
                                            {new Date(a.createdAt).toLocaleString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}