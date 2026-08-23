import {
    siBluesky,
    siFacebook,
    siGoogle,
    siInstagram,
    siMeta,
    siPinterest,
    siThreads,
    siTiktok,
    siYoutube,
    type SimpleIcon,
} from "simple-icons";
import type { Platform } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

/**
 * Pemetaan platform → ikon Simple Icons (path SVG, viewBox 0 0 24 24).
 *
 * Catatan: LinkedIn tidak tersedia di Simple Icons (logo dihapus atas permintaan
 * trademark owner), begitu juga MANUAL/META tanpa ikon brand. Platform tanpa
 * ikon di-render sebagai lingkaran berisi inisial (fallback).
 */
const ICONS: Partial<Record<Platform, SimpleIcon>> = {
    INSTAGRAM: siInstagram,
    INSTAGRAM_PAGE: siInstagram,
    FACEBOOK: siFacebook,
    META: siMeta,
    TIKTOK: siTiktok,
    YOUTUBE: siYoutube,
    PINTEREST: siPinterest,
    GOOGLE_BUSINESS: siGoogle,
    BLUESKY: siBluesky,
    THREADS: siThreads,
};

/** Platform yang mungkin masuk tapi tidak ada ikon - mapping ke fallback */
const ICON_FALLBACKS: Record<string, SimpleIcon | null> = {
    INSTAGRAM: siInstagram,
    FACEBOOK: siFacebook,
    META: siMeta,
    TIKTOK: siTiktok,
    YOUTUBE: siYoutube,
    PINTEREST: siPinterest,
    GOOGLE_BUSINESS: siGoogle,
    BLUESKY: siBluesky,
    THREADS: siThreads,
};

function fallbackLabel(platform: Platform): string {
    switch (platform) {
        case "LINKEDIN":
            return "in";
        case "MANUAL":
            return "✎";
        default:
            return platform.slice(0, 1).toUpperCase();
    }
}

interface PlatformIconProps {
    platform: Platform | string;
    /** Ukuran (px). Icon persegi, gunakan fill container. */
    size?: number;
    className?: string;
    /** Render fallback inisial dalam lingkaran berwarna brand. */
    showFallback?: boolean;
}

/**
 * Icon brand platform sosial media. Pakai path dari Simple Icons agar konsisten
 * & performa baik (tree-shaken, hanya ikon yang dipakai yang masuk bundle).
 * Untuk platform tanpa icon (LinkedIn, Manual) dirender lingkaran berisi inisial.
 */
export function PlatformIcon({ platform, size = 16, className, showFallback = true }: PlatformIconProps) {
    const p = platform as Platform;
    const icon = ICONS[p] ?? ICON_FALLBACKS[p];

    if (!icon) {
        if (!showFallback) return null;
        return (
            <span
                aria-hidden
                className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-white", className)}
                style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
            >
                {fallbackLabel(p)}
            </span>
        );
    }

    return (
        <svg
            role="img"
            aria-label={icon.title}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={cn("shrink-0 fill-current", className)}
        >
            <path d={icon.path} />
        </svg>
    );
}
