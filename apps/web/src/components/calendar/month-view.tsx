"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";
import type { CalendarPost } from "./types";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MAX_VISIBLE = 3;

interface Props {
    year: number;
    month: number;
    days: (Date | null)[];
    postsByDay: Map<string, CalendarPost[]>;
    today: Date;
    dragOverDate: string | null;
    draggingId: string | null;
    expandedDays: Set<string>;
    toggleExpand: (k: string) => void;
    handleDragStart: (e: React.DragEvent, id: string) => void;
    handleDragEnd: () => void;
    handleDragOver: (e: React.DragEvent, k: string) => void;
    handleDragLeave: () => void;
    handleDrop: (e: React.DragEvent, k: string) => void;
    changeMonth: (d: number) => void;
    monthLabel: string;
    setDetailPost: (p: CalendarPost | null) => void;
    getViralityLevel: (s: number | null) => { label: string; color: string; bg: string };
    handlePublish: (id: string) => void;
    busyId: string | null;
    handleDelete: (id: string) => void;
    PLATFORM_COLORS: Record<string, string>;
}

export function MonthView({
    year, month, days, postsByDay, today, dragOverDate, draggingId,
    expandedDays, toggleExpand, handleDragStart, handleDragEnd,
    handleDragOver, handleDragLeave, handleDrop, changeMonth, monthLabel,
    setDetailPost, getViralityLevel, handlePublish, busyId, handleDelete, PLATFORM_COLORS,
}: Props) {
    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <span className="text-sm font-medium">{monthLabel}</span>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(0)}>
                        Hari ini
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="rounded-lg border border-border bg-card">
                <div className="grid grid-cols-7 border-b border-border">
                    {WEEKDAYS.map((w) => (
                        <div key={w} className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">{w}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((date, i) => {
                        if (!date) return <div key={`empty-${i}`} className="min-h-24 border-b border-r border-border/60 bg-muted/30" />;
                        const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
                        const dayPosts = postsByDay.get(key) ?? [];
                        const isToday = date.toDateString() === today.toDateString();
                        const isDragOver = dragOverDate === key;
                        const isExpanded = expandedDays.has(key);
                        const visiblePosts = isExpanded ? dayPosts : dayPosts.slice(0, MAX_VISIBLE);
                        const hiddenCount = dayPosts.length - MAX_VISIBLE;
                        return (
                            <div
                                key={key}
                                className={cn(
                                    "min-h-24 border-b border-r border-border/60 p-1.5 transition-colors cursor-pointer",
                                    isToday && "bg-primary/5",
                                    isDragOver && "bg-primary/10 ring-2 ring-inset ring-primary/30"
                                )}
                                onDragOver={(e) => handleDragOver(e, key)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, key)}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={cn(
                                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                                        isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"
                                    )}>{date.getDate()}</span>
                                    {dayPosts.length > 0 && <span className="text-[10px] font-medium text-muted-foreground">{dayPosts.length}</span>}
                                </div>
                                <div className="mt-1 space-y-1">
                                    {visiblePosts.map((p) => {
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
                                                    p.status === "published" ? "bg-accent-green/10 text-accent-green"
                                                    : p.status === "failed" ? "bg-accent-red/10 text-accent-red"
                                                    : p.status === "publishing" ? "bg-primary/15 text-primary"
                                                    : "bg-muted text-foreground"
                                                )}
                                                title={p.caption || "(tanpa caption)"}
                                                onClick={() => setDetailPost(p)}
                                            >
                                                <span
                                                    className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full text-white"
                                                    style={{ background: PLATFORM_COLORS[p.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888" }}
                                                >
                                                    <PlatformIcon platform={p.account?.platform ?? ""} size={8} />
                                                </span>
                                                <span className="truncate">{p.caption || p.account?.name || "Post"}</span>
                                                {p.viralityScore !== null && (
                                                    <span className={cn("ml-auto text-[9px] font-medium", getViralityLevel(p.viralityScore).color)}>
                                                        {p.viralityScore}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!isExpanded && hiddenCount > 0 && (
                                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(key); }}
                                            className="flex w-full items-center gap-0.5 px-1 text-[10px] text-muted-foreground hover:text-foreground">
                                            <ChevronDown className="h-3 w-3" /> +{hiddenCount} lainnya
                                        </button>
                                    )}
                                    {isExpanded && dayPosts.length > MAX_VISIBLE && (
                                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(key); }}
                                            className="flex w-full items-center gap-0.5 px-1 text-[10px] text-muted-foreground hover:text-foreground">
                                            <ChevronUp className="h-3 w-3" /> Lebih sedikit
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
