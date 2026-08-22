"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_COLORS } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";
import type { CalendarPost } from "./types";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MAX_VISIBLE = 3;

interface Props {
    weekDays: Date[];
    weekLabel: string;
    postsByDay: Map<string, CalendarPost[]>;
    changeWeek: (d: number) => void;
    today: Date;
    setDetailPost: (p: CalendarPost | null) => void;
    getViralityLevel: (s: number | null) => { label: string; color: string; bg: string };
    handlePublish: (id: string) => void;
    busyId: string | null;
    handleDelete: (id: string) => void;
    PLATFORM_COLORS: Record<string, string>;
}

export function WeekView({
    weekDays, weekLabel, postsByDay, changeWeek, today,
    setDetailPost, getViralityLevel, handlePublish, busyId, handleDelete, PLATFORM_COLORS,
}: Props) {
    const [expandedDays, setExpandedDays] = React.useState<Set<string>>(new Set());

    function toggleExpand(key: string) {
        setExpandedDays(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <Button variant="secondary" size="sm" onClick={() => changeWeek(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{weekLabel}</span>
                <Button variant="secondary" size="sm" onClick={() => changeWeek(1)}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <div className="min-w-[600px]">
                    <div className="grid grid-cols-8 border-b border-border">
                        <div className="px-2 py-2 text-center text-xs font-medium text-muted-foreground w-16">Jam</div>
                        {weekDays.map((d, i) => {
                            const isToday = d.toDateString() === today.toDateString();
                            const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
                            const dayPosts = postsByDay.get(key) ?? [];
                            return (
                                <div key={i} className={cn(
                                    "px-2 py-2 text-center text-xs font-medium",
                                    isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"
                                )}>
                                    <div>{WEEKDAYS[d.getDay()]}</div>
                                    <div className={cn("text-lg font-semibold", isToday ? "text-primary" : "")}>{d.getDate()}</div>
                                    {dayPosts.length > 0 && (
                                        <div className="text-[10px] font-medium text-muted-foreground mt-0.5">
                                            {dayPosts.length} post
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {Array.from({ length: 12 }, (_, hourIdx) => {
                        const hour = hourIdx * 2;
                        return (
                            <div key={hour} className="grid grid-cols-8 border-b border-border/50">
                                <div className="px-2 py-1.5 text-center text-[10px] text-muted-foreground font-medium w-16">
                                    {hour.toString().padStart(2, "0")}:00
                                </div>
                                {weekDays.map((d, di) => {
                                    const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
                                    const dayPosts = (postsByDay.get(key) ?? []).filter(p => {
                                        const raw = p.scheduledAt ?? p.publishedAt ?? "";
                                        if (!raw) return false;
                                        const h = new Date(raw).getHours();
                                        return h === hour || h === hour + 1;
                                    });
                                    const isExpanded = expandedDays.has(key);
                                    const visiblePosts = isExpanded ? dayPosts : dayPosts.slice(0, MAX_VISIBLE);
                                    const hiddenCount = dayPosts.length - MAX_VISIBLE;

                                    return (
                                        <div key={di} className="border-l border-border/50 p-1 min-h-12">
                                            {visiblePosts.map(p => (
                                                <div key={p.id}
                                                    className="rounded px-1.5 py-1 text-[10px] leading-tight mb-1 cursor-pointer hover:bg-muted/80 truncate"
                                                    style={{ background: `${PLATFORM_COLORS[p.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888"}22` }}
                                                    onClick={() => setDetailPost(p)}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <PlatformIcon platform={p.account?.platform ?? ""} size={8} />
                                                        <span className="truncate">{p.caption?.slice(0, 20) || "Post"}</span>
                                                    </div>
                                                    {p.viralityScore !== null && (
                                                        <div className={cn("text-[9px] font-medium mt-0.5", getViralityLevel(p.viralityScore).color)}>
                                                            V:{p.viralityScore}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {!isExpanded && hiddenCount > 0 && hour === 0 && (
                                                <button onClick={(e) => { e.stopPropagation(); toggleExpand(key); }}
                                                    className="flex w-full items-center gap-0.5 px-1 text-[10px] text-muted-foreground hover:text-foreground mt-1">
                                                    <ChevronDown className="h-3 w-3" /> +{hiddenCount} lainnya
                                                </button>
                                            )}
                                            {isExpanded && dayPosts.length > MAX_VISIBLE && hour === 0 && (
                                                <button onClick={(e) => { e.stopPropagation(); toggleExpand(key); }}
                                                    className="flex w-full items-center gap-0.5 px-1 text-[10px] text-muted-foreground hover:text-foreground mt-1">
                                                    <ChevronUp className="h-3 w-3" /> Lebih sedikit
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
