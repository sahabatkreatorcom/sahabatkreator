"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";
import type { CalendarPost } from "./types";

const STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    scheduled: "Terjadwal",
    publishing: "Menerbitkan...",
    published: "Terbit",
    failed: "Gagal",
};

interface Props {
    currentDate: Date;
    dayLabel: string;
    dayPosts: CalendarPost[];
    changeDay: (d: number) => void;
    postsByDay: Map<string, CalendarPost[]>;
    today: Date;
    setDetailPost: (p: CalendarPost | null) => void;
    getViralityLevel: (s: number | null) => { label: string; color: string; bg: string };
    handlePublish: (id: string) => void;
    busyId: string | null;
    handleDelete: (id: string) => void;
    PLATFORM_COLORS: Record<string, string>;
}

export function DayView({
    currentDate, dayLabel, dayPosts, changeDay, postsByDay, today,
    setDetailPost, getViralityLevel, handlePublish, busyId, handleDelete, PLATFORM_COLORS,
}: Props) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <Button variant="secondary" size="sm" onClick={() => changeDay(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{dayLabel}</span>
                <Button variant="secondary" size="sm" onClick={() => changeDay(1)}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                {currentDate.toDateString() === today.toDateString() && (
                    <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">Hari ini</span>
                )}
            </div>

            {dayPosts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-12 text-center">
                    <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Tidak ada post pada hari ini.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {dayPosts.map((p) => {
                        const timeStr = p.scheduledAt
                            ? new Date(p.scheduledAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
                            : p.publishedAt
                            ? new Date(p.publishedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
                            : "—";
                        return (
                            <div key={p.id}
                                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/50 cursor-pointer"
                                onClick={() => setDetailPost(p)}
                            >
                                <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">{timeStr}</span>
                                <span
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                                    style={{ background: PLATFORM_COLORS[p.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888" }}
                                >
                                    <PlatformIcon platform={p.account?.platform ?? ""} size={12} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm">{p.caption || "(tanpa caption)"}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-muted-foreground">{PLATFORM_LABELS[p.account?.platform as keyof typeof PLATFORM_LABELS] ?? p.platform}</span>
                                        <span className="text-[10px] text-muted-foreground">· {STATUS_LABEL[p.status]}</span>
                                        {p.viralityScore !== null && (
                                            <span className={cn("text-[10px] font-medium", getViralityLevel(p.viralityScore).color)}>
                                                V:{p.viralityScore}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {p.status === "draft" && (
                                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                                        onClick={(e) => { e.stopPropagation(); handlePublish(p.id); }}>
                                        Terbit
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
