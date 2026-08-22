"use client";

import * as React from "react";
import { Clock } from "lucide-react";
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
    timelinePosts: CalendarPost[];
    setDetailPost: (p: CalendarPost | null) => void;
    getViralityLevel: (s: number | null) => { label: string; color: string; bg: string };
    handlePublish: (id: string) => void;
    busyId: string | null;
    handleDelete: (id: string) => void;
    PLATFORM_COLORS: Record<string, string>;
}

export function TimelineView({
    timelinePosts, setDetailPost, getViralityLevel, handlePublish, busyId, handleDelete, PLATFORM_COLORS,
}: Props) {
    if (timelinePosts.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">Belum ada post terjadwal atau terbit.</p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-sm font-medium mb-3 text-muted-foreground">Timeline (100 post terbaru)</h2>
            <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                <div className="space-y-3">
                    {timelinePosts.map((p) => {
                        const timeStr = p.scheduledAt
                            ? new Date(p.scheduledAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
                            : p.publishedAt
                            ? new Date(p.publishedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
                            : "—";
                        return (
                            <div key={p.id} className="relative flex gap-3 pl-8">
                                <div className={cn(
                                    "absolute left-2.5 top-2 h-3 w-3 rounded-full border-2",
                                    p.status === "published" ? "bg-emerald-500 border-emerald-500" :
                                    p.status === "scheduled" ? "bg-amber-500 border-amber-500" :
                                    p.status === "failed" ? "bg-red-500 border-red-500" :
                                    "bg-muted border-border"
                                )} />
                                <div className="flex-1 rounded-lg border border-border bg-card p-3 hover:bg-muted/50 cursor-pointer"
                                    onClick={() => setDetailPost(p)}
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                                            style={{ background: PLATFORM_COLORS[p.account?.platform as keyof typeof PLATFORM_COLORS] ?? "#888" }}
                                        >
                                            <PlatformIcon platform={p.account?.platform ?? ""} size={10} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm truncate">{p.caption || "(tanpa caption)"}</p>
                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                                <span>{PLATFORM_LABELS[p.account?.platform as keyof typeof PLATFORM_LABELS] ?? p.platform}</span>
                                                <span>·</span>
                                                <span className={cn("font-medium",
                                                    p.status === "published" ? "text-emerald-600" :
                                                    p.status === "failed" ? "text-accent-red" :
                                                    p.status === "scheduled" ? "text-amber-600" : ""
                                                )}>{STATUS_LABEL[p.status]}</span>
                                                {p.viralityScore !== null && (
                                                    <span className={cn("font-medium", getViralityLevel(p.viralityScore).color)}>
                                                        V:{p.viralityScore}
                                                    </span>
                                                )}
                                                <span className="ml-auto">{timeStr}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
