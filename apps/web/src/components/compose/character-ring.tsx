"use client";

import { useMemo } from "react";
import { type Platform, getCharacterLimit, PLATFORM_COLORS } from "@/lib/platform-config";
import { PlatformIcon } from "@/components/ui/platform-icon";

interface CharacterRingRowProps {
    platforms: Platform[];
    currentLength: number;
}

function CharacterRing({ platform, currentLength }: { platform: Platform; currentLength: number }) {
    const limit = getCharacterLimit(platform);
    const ratio = Math.min(currentLength / limit, 1);
    const circumference = 2 * Math.PI * 10;
    const strokeDashoffset = circumference * (1 - ratio);

    const color = ratio > 1 ? "#ef4444" : ratio > 0.8 ? "#f59e0b" : PLATFORM_COLORS[platform];

    return (
        <div className="flex flex-col items-center gap-0.5" title={`${platform}: ${currentLength}/${limit}`}>
            <svg width="28" height="28" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
                <circle
                    cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="2"
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round" transform="rotate(-90 12 12)"
                    className="transition-all duration-300"
                />
            </svg>
            <span className="text-[8px] font-medium" style={{ color }}>{platform.slice(0, 2)}</span>
        </div>
    );
}

export function CharacterRingRow({ platforms, currentLength }: CharacterRingRowProps) {
    if (platforms.length === 0) return null;

    return (
        <div className="flex gap-1 rounded-lg bg-background/80 backdrop-blur-sm px-2 py-1.5 shadow-sm border border-border">
            {platforms.map((p) => (
                <CharacterRing key={p} platform={p} currentLength={currentLength} />
            ))}
        </div>
    );
}
