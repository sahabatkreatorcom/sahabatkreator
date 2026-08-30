"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Loader2,
    Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";
import { MonthView } from "@/components/calendar/month-view";
import { DayView } from "@/components/calendar/day-view";
import { WeekView } from "@/components/calendar/week-view";
import { TimelineView } from "@/components/calendar/timeline-view";
import { GridView } from "@/components/calendar/grid-view";

import type { CalendarPost } from "@/components/calendar/types";

const STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    scheduled: "Terjadwal",
    publishing: "Menerbitkan...",
    published: "Terbit",
    failed: "Gagal",
};

type CalendarView = "month" | "day" | "week" | "timeline" | "grid";

export default function CalendarPage() {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [currentDate, setCurrentDate] = useState(today);
    const [posts, setPosts] = useState<CalendarPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
    const [detailPost, setDetailPost] = useState<CalendarPost | null>(null);
    const [view, setView] = useState<CalendarView>("month");

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
        setDetailPost(null);
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
        } catch { /* silent */ }
    }

    async function handleDelete(id: string) {
        setDetailPost(null);
        try {
            const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
            if (res.ok) loadPosts();
        } catch { /* silent */ }
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
        if (postId) handleReschedule(postId, dateKey);
        setDraggingId(null);
        setDragOverDate(null);
    }

    function toggleExpand(dateKey: string) {
        setExpandedDays((prev) => {
            const next = new Set(prev);
            if (next.has(dateKey)) next.delete(dateKey);
            else next.add(dateKey);
            return next;
        });
    }

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

    function changeMonth(delta: number) {
        const d = new Date(year, month + delta, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth());
    }

    const dayPosts = useMemo(() => {
        const key = currentDate.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        return (postsByDay.get(key) ?? []).sort(
            (a, b) => (a.scheduledAt ?? a.publishedAt ?? "") > (b.scheduledAt ?? b.publishedAt ?? "") ? 1 : -1
        );
    }, [currentDate, postsByDay]);

    const dayLabel = currentDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    function changeDay(delta: number) {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + delta);
        setCurrentDate(d);
    }

    const weekStart = useMemo(() => {
        const d = new Date(currentDate);
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        return d;
    }, [currentDate]);

    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [weekStart]);

    const weekLabel = `${weekStart.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;

    function changeWeek(delta: number) {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + delta * 7);
        setCurrentDate(d);
    }

    const timelinePosts = useMemo(() => {
        return [...posts]
            .filter((p) => p.scheduledAt || p.publishedAt)
            .sort((a, b) => {
                const da = a.scheduledAt ?? a.publishedAt ?? "";
                const db = b.scheduledAt ?? b.publishedAt ?? "";
                return da.localeCompare(db);
            })
            .slice(0, 100);
    }, [posts]);

    const gridPosts = useMemo(() => {
        return [...posts]
            .filter((p) => p.publishedAt)
            .slice(0, 21)
            .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    }, [posts]);

    const MAX_VISIBLE = 3;

    const viewTabs: { value: CalendarView; label: string }[] = [
        { value: "month", label: "Bulan" },
        { value: "day", label: "Hari" },
        { value: "week", label: "Minggu" },
        { value: "timeline", label: "Timeline" },
        { value: "grid", label: "Grid" },
    ];

    function getViralityLevel(score: number | null): { label: string; color: string; bg: string } {
        if (score === null) return { label: "—", color: "text-muted-foreground", bg: "bg-muted" };
        if (score >= 80) return { label: "Sangat Tinggi", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" };
        if (score >= 60) return { label: "Tinggi", color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" };
        if (score >= 40) return { label: "Sedang", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" };
        if (score >= 20) return { label: "Rendah", color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30" };
        return { label: "Sangat Rendah", color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" };
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Kalender konten</h1>
                    <p className="text-sm text-muted-foreground">Lihat jadwal & konten yang sudah terbit per hari. Seret post untuk menjadwalkan ulang.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-border bg-card p-0.5">
                        {viewTabs.map((v) => (
                            <button
                                key={v.value}
                                onClick={() => setView(v.value)}
                                className={cn(
                                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                                    view === v.value
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                    <Button size="sm" onClick={() => window.location.href = "/compose"}>
                        <Plus className="h-4 w-4" />
                        Post baru
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat kalender…
                </div>
            ) : (
                <>
                    {view === "month" && (
                        <MonthView
                            year={year} month={month} days={days} postsByDay={postsByDay}
                            today={today} dragOverDate={dragOverDate} draggingId={draggingId}
                            expandedDays={expandedDays}
                            toggleExpand={toggleExpand} handleDragStart={handleDragStart}
                            handleDragEnd={handleDragEnd} handleDragOver={handleDragOver}
                            handleDragLeave={handleDragLeave} handleDrop={handleDrop}
                            changeMonth={changeMonth} monthLabel={monthLabel}
                            setDetailPost={setDetailPost} getViralityLevel={getViralityLevel}
                            handlePublish={handlePublish} busyId={busyId} handleDelete={handleDelete}
                            PLATFORM_COLORS={PLATFORM_COLORS}
                        />
                    )}

                    {view === "day" && (
                        <DayView
                            currentDate={currentDate} dayLabel={dayLabel} dayPosts={dayPosts}
                            changeDay={changeDay} postsByDay={postsByDay} today={today}
                            setDetailPost={setDetailPost} getViralityLevel={getViralityLevel}
                            handlePublish={handlePublish} busyId={busyId} handleDelete={handleDelete}
                            PLATFORM_COLORS={PLATFORM_COLORS}
                        />
                    )}

                    {view === "week" && (
                        <WeekView
                            weekDays={weekDays} weekLabel={weekLabel} postsByDay={postsByDay}
                            changeWeek={changeWeek} today={today}
                            setDetailPost={setDetailPost} getViralityLevel={getViralityLevel}
                            handlePublish={handlePublish} busyId={busyId} handleDelete={handleDelete}
                            PLATFORM_COLORS={PLATFORM_COLORS}
                        />
                    )}

                    {view === "timeline" && (
                        <TimelineView
                            timelinePosts={timelinePosts} setDetailPost={setDetailPost}
                            getViralityLevel={getViralityLevel} handlePublish={handlePublish}
                            busyId={busyId} handleDelete={handleDelete} PLATFORM_COLORS={PLATFORM_COLORS}
                        />
                    )}

                    {view === "grid" && (
                        <GridView
                            gridPosts={gridPosts} setDetailPost={setDetailPost}
                            getViralityLevel={getViralityLevel} handlePublish={handlePublish}
                            busyId={busyId} handleDelete={handleDelete} PLATFORM_COLORS={PLATFORM_COLORS}
                        />
                    )}
                </>
            )}

            {busyId && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Menerbitkan...
                </p>
            )}

            {/* Detail post dialog */}
            <Dialog open={detailPost !== null} onClose={() => setDetailPost(null)} title="Detail post">
                {detailPost && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span
                                className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                                style={{ background: PLATFORM_COLORS[detailPost.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888" }}
                            >
                                <PlatformIcon platform={detailPost.account?.platform ?? ""} size={16} />
                            </span>
                            <div>
                                <p className="font-medium">{detailPost.account?.name || "Unknown"}</p>
                                <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[detailPost.account?.platform as keyof typeof PLATFORM_LABELS] ?? detailPost.account?.platform}</p>
                            </div>
                        </div>

                        <div className="rounded-md bg-muted p-3 text-sm">
                            <p className="whitespace-pre-wrap break-words">{detailPost.caption || "(tanpa caption)"}</p>
                        </div>

                        {detailPost.viralityScore !== null && (
                            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                                <span className="text-sm text-muted-foreground">Virality Score:</span>
                                <div className={cn("rounded px-2 py-0.5 text-xs font-medium", getViralityLevel(detailPost.viralityScore).bg)}>
                                    {detailPost.viralityScore} — {getViralityLevel(detailPost.viralityScore).label}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Status</span>
                                <span className="font-medium">{STATUS_LABEL[detailPost.status] ?? detailPost.status}</span>
                            </div>
                            {detailPost.scheduledAt && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Dijadwalkan</span>
                                    <span>
                                        {new Date(detailPost.scheduledAt).toLocaleDateString("id-ID", {
                                            day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                                            timeZone: "Asia/Jakarta",
                                        })}
                                    </span>
                                </div>
                            )}
                            {detailPost.publishedAt && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Diterbitkan</span>
                                    <span>
                                        {new Date(detailPost.publishedAt).toLocaleDateString("id-ID", {
                                            day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                                            timeZone: "Asia/Jakarta",
                                        })}
                                    </span>
                                </div>
                            )}
                            {detailPost.postUrl && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Link</span>
                                    <a href={detailPost.postUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                        <ExternalLink className="h-3 w-3" /> Lihat post
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            {(detailPost.status === "draft" || detailPost.status === "scheduled" || detailPost.status === "failed") && (
                                <Button size="sm" onClick={() => handlePublish(detailPost.id)} loading={busyId === detailPost.id}>
                                    Terbitkan sekarang
                                </Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(detailPost.id)}>
                                Hapus
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setDetailPost(null)}>
                                Tutup
                            </Button>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
