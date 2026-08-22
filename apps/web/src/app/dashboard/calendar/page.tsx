"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
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
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);

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

    async function handleReschedule(id: string, newDate: string) {
        try {
            const res = await fetch(`/api/posts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scheduledAt: new Date(`${newDate}T09:00:00`).toISOString() }),
            });
            if (res.ok) loadPosts();
        } catch {
            // silent
        }
    }

    function handleDragStart(e: React.DragEvent, postId: string) {
        e.dataTransfer.setData("text/plain", postId);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(postId);
    }

    function handleDragEnd() {
        setDraggingId(null);
        setDragOverDate(null);
    }

    function handleDragOver(e: React.DragEvent, dateKey: string) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverDate(dateKey);
    }

    function handleDragLeave() {
        setDragOverDate(null);
    }

    function handleDrop(e: React.DragEvent, dateKey: string) {
        e.preventDefault();
        const postId = e.dataTransfer.getData("text/plain");
        if (postId) {
            handleReschedule(postId, dateKey);
        }
        setDraggingId(null);
        setDragOverDate(null);
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
            const raw = p.scheduledAt ?? p.publishedAt ?? "";
            if (!raw) continue;
            const key = new Date(raw).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
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
                    <p className="text-sm text-muted-foreground">Lihat jadwal & konten yang sudah terbit per hari. Seret post untuk menjadwalkan ulang.</p>
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
                    Memuat kalenderâ€¦
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
                            const isDragOver = dragOverDate === key;
                            return (
                                <div
                                    key={key}
                                    className={cn(
                                        "min-h-24 border-b border-r border-border/60 p-1.5 transition-colors",
                                        isToday && "bg-primary/5",
                                        isDragOver && "bg-primary/10 ring-2 ring-inset ring-primary/30"
                                    )}
                                    onDragOver={(e) => handleDragOver(e, key)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, key)}
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
                                        {dayPosts.slice(0, 3).map((p) => {
                                            const isDragging = draggingId === p.id;
                                            const canDrag = p.status === "draft" || p.status === "scheduled" || p.status === "failed";
                                            return (
                                                <div
                                                    key={p.id}
                                                    draggable={canDrag}
                                                    onDragStart={(e) => handleDragStart(e, p.id)}
                                                    onDragEnd={handleDragEnd}
                                                    className={cn(
                                                        "flex items-center gap-1 rounded px-1.5 py-1 text-[11px] leading-tight transition-all",
                                                        canDrag && "cursor-grab active:cursor-grabbing",
                                                        isDragging && "opacity-40 scale-95",
                                                        p.status === "published"
                                                            ? "bg-accent-green/10 text-accent-green cursor-default"
                                                            : p.status === "failed"
                                                              ? "bg-accent-red/10 text-accent-red"
                                                              : p.status === "publishing"
                                                                ? "bg-primary/15 text-primary cursor-default"
                                                                : "bg-muted text-foreground"
                                                    )}
                                                    title={canDrag ? `${p.caption || "(tanpa caption)"} \u2014 seret untuk jadwalkan ulang` : p.caption || "(tanpa caption)"}
                                                    onClick={() => {
                                                        if (p.status === "draft" || p.status === "scheduled" || p.status === "failed") {
                                                            handlePublish(p.id);
                                                        }
                                                    }}
                                                >
                                                    <span
                                                        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full text-white"
                                                        style={{ background: PLATFORM_COLORS[p.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888" }}
                                                    >
                                                        <PlatformIcon platform={p.account?.platform ?? ""} size={8} />
                                                    </span>
                                                    <span className="truncate">{p.caption || p.account?.name || "Post"}</span>
                                                </div>
                                            );
                                        })}
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Menerbitkanâ€¦
                </p>
            )}
        </div>
    );
}
