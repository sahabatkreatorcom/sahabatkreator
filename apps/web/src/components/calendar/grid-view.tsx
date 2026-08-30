"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";
import { mediaFileUrl } from "@/lib/media-file-url";
import type { CalendarPost } from "./types";

const STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    scheduled: "Terjadwal",
    publishing: "Menerbitkan...",
    published: "Terbit",
    failed: "Gagal",
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-muted/80", text: "text-muted-foreground" },
    scheduled: { bg: "bg-blue-500/80", text: "text-white" },
    publishing: { bg: "bg-amber-500/80", text: "text-white" },
    published: { bg: "bg-green-500/80", text: "text-white" },
    failed: { bg: "bg-red-500/80", text: "text-white" },
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
                {gridPosts.map((p, i) => {
                    const platform = p.account?.platform || p.platform;
                    const platformLabel = PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] || platform;
                    const platformColor = PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS] || "#6B7280";
                    const statusBadge = STATUS_BADGE[p.status] || STATUS_BADGE.draft;

                    return (
                        <div
                            key={p.id}
                            className={cn(
                                "aspect-square relative cursor-pointer group overflow-hidden",
                                i >= 18 ? "border-b-0" : "",
                                "border border-border/30"
                            )}
                            onClick={() => setDetailPost(p)}
                        >
                            {p.media?.[0]?.thumbnailUrl ? (
                                <img
                                    src={mediaFileUrl(p.media[0].thumbnailUrl)}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${platformColor}15` }}>
                                    <PlatformIcon platform={platform} size={24} />
                                </div>
                            )}

                            {/* Platform badge — top left */}
                            <div
                                className="absolute top-1 left-1 w-5 h-5 rounded-md flex items-center justify-center shadow-sm"
                                style={{ background: platformColor }}
                            >
                                <PlatformIcon platform={platform} size={12} />
                            </div>

                            {/* Status badge — top right */}
                            <div className={cn(
                                "absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-medium uppercase tracking-wide",
                                statusBadge.bg,
                                statusBadge.text
                            )}>
                                {STATUS_LABEL[p.status]}
                            </div>

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-end justify-between p-1 opacity-0 group-hover:opacity-100">
                                <span className="text-white text-[9px] font-medium truncate max-w-[90%]">
                                    {p.account?.name || platformLabel}
                                </span>
                                {p.viralityScore !== null && (
                                    <div className={cn(
                                        "rounded px-1 py-0.5 text-[8px] font-bold",
                                        getViralityLevel(p.viralityScore).bg,
                                        getViralityLevel(p.viralityScore).color
                                    )}>
                                        {p.viralityScore}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
