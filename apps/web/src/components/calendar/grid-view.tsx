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
    gridPosts: CalendarPost[];
    setDetailPost: (p: CalendarPost | null) => void;
    getViralityLevel: (s: number | null) => { label: string; color: string; bg: string };
    handlePublish: (id: string) => void;
    busyId: string | null;
    handleDelete: (id: string) => void;
    PLATFORM_COLORS: Record<string, string>;
}

export function GridView({
    gridPosts, setDetailPost, getViralityLevel, handlePublish, busyId, handleDelete, PLATFORM_COLORS,
}: Props) {
    if (gridPosts.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">Belum ada post terbit. Grid ini menampilkan 21 post terbaru.</p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-sm font-medium mb-3 text-muted-foreground">Grid Preview (21 post terbaru)</h2>
            <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden border border-border">
                {gridPosts.map((p, i) => (
                    <div key={p.id}
                        className={cn(
                            "aspect-square relative cursor-pointer group",
                            i >= 18 ? "border-b-0" : "",
                            "border border-border/30"
                        )}
                        onClick={() => setDetailPost(p)}
                    >
                        <div className="absolute inset-0 bg-muted flex items-center justify-center">
                            <span className="text-[10px] text-muted-foreground text-center px-1">
                                {PLATFORM_LABELS[p.account?.platform as keyof typeof PLATFORM_LABELS] ?? p.platform}
                            </span>
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="text-white text-xs font-medium">{STATUS_LABEL[p.status]}</span>
                        </div>
                        {p.viralityScore !== null && (
                            <div className={cn(
                                "absolute bottom-1 right-1 rounded px-1 py-0.5 text-[9px] font-bold",
                                getViralityLevel(p.viralityScore).bg,
                                getViralityLevel(p.viralityScore).color
                            )}>
                                {p.viralityScore}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
