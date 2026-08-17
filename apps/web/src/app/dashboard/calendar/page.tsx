"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_COLORS } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface AccountRef {
    id: string;
    platform: string;
    name: string;
    avatar: string | null;
}

interface CalendarPost {
    id: string;
    caption: string;
    status: "draft" | "scheduled" | "publishing" | "published" | "failed";
    scheduledAt: string | null;
    publishedAt: string | null;
    platform: string;
    account: AccountRef | null;
}

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function CalendarPage() {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [posts, setPosts] = useState<CalendarPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/posts?status=all&limit=500");
            const data = await res.json();
            if (res.ok) setPosts(data.posts ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    async function handlePublish(id: string) {
        setBusyId(id);
        try {
            const res = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
            if (res.ok) loadPosts();
        } finally {
            setBusyId(null);
        }
    }

    const monthLabel = new Date(year, month, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

    const days = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const startOffset = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: (Date | null)[] = [];
        for (let i = 0; i < startOffset; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
        return cells;
    }, [year, month]);

    const postsByDay = useMemo(() => {
        const map = new Map<string, CalendarPost[]>();
        for (const p of posts) {
            const key = p.scheduledAt ? p.scheduledAt.slice(0, 10) : p.publishedAt ? p.publishedAt.slice(0, 10) : "";
            if (!key) continue;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(p);
        }
        return map;
    }, [posts]);

    function changeMonth(delta: number) {
        const d = new Date(year, month + delta, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth());
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Kalender konten</h1>
                    <p className="text-sm text-muted-foreground">Lihat jadwal & konten yang sudah terbit per hari.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-40 text-center text-sm font-medium">{monthLabel}</span>
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat kalender…
                </div>
            ) : (
                <div className="rounded-lg border border-border bg-card">
                    <div className="grid grid-cols-7 border-b border-border">
                        {WEEKDAYS.map((w) => (
                            <div key={w} className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {w}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((date, i) => {
                            if (!date) return <div key={`empty-${i}`} className="min-h-24 border-b border-r border-border/60 bg-muted/30" />;
                            const key = date.toISOString().slice(0, 10);
                            const dayPosts = postsByDay.get(key) ?? [];
                            const isToday = date.toDateString() === today.toDateString();
                            return (
                                <div
                                    key={key}
                                    className={cn("min-h-24 border-b border-r border-border/60 p-1.5", isToday && "bg-primary/5")}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            className={cn(
                                                "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                                                isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"
                                            )}
                                        >
                                            {date.getDate()}
                                        </span>
                                        {dayPosts.length > 0 && (
                                            <span className="text-[10px] font-medium text-muted-foreground">{dayPosts.length}</span>
                                        )}
                                    </div>
                                    <div className="mt-1 space-y-1">
                                        {dayPosts.slice(0, 3).map((p) => (
                                            <div
                                                key={p.id}
                                                className={cn(
                                                    "group flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] leading-tight transition-colors",
                                                    p.status === "published"
                                                        ? "bg-accent-green/10 text-accent-green"
                                                        : p.status === "failed"
                                                          ? "bg-accent-red/10 text-accent-red"
                                                          : p.status === "publishing"
                                                            ? "bg-primary/15 text-primary"
                                                            : "bg-muted text-foreground"
                                                )}
                                                title={p.caption || "(tanpa caption)"}
                                                onClick={() => {
                                                    if (p.status === "draft" || p.status === "scheduled" || p.status === "failed") {
                                                        handlePublish(p.id);
                                                    }
                                                }}
                                            >
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-full"
                                                    style={{ background: PLATFORM_COLORS[p.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888" }}
                                                />
                                                <span className="truncate">{p.caption || p.account?.name || "Post"}</span>
                                            </div>
                                        ))}
                                        {dayPosts.length > 3 && (
                                            <p className="px-1 text-[10px] text-muted-foreground">+{dayPosts.length - 3} lainnya</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {busyId && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Menerbitkan…
                </p>
            )}
        </div>
    );
}
