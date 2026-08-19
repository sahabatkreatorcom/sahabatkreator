import type { Platform } from "./config";

export type MediaType = "image" | "video" | "audio";

export interface PlatformRule {
    /** Nama singkat yang dipakai di UI. */
    label: string;
    /** Batas maksimal karakter caption. null = tanpa batas. */
    maxCaptionChars: number | null;
    /** Minimal jumlah media wajib untuk publish. */
    minMedia: number;
    /** Jenis media yang didukung platform. */
    mediaTypes: MediaType[];
    /** Butuh papan/board (Pinterest). */
    requiresBoard?: boolean;
}

/**
 * Aturan konten per platform — aman dipakai di client component.
 * Nilai mengikuti limit resmi masing-masing platform.
 */
export const PLATFORM_RULES: Record<Platform, PlatformRule> = {
    INSTAGRAM: { label: "Instagram", maxCaptionChars: 2200, minMedia: 1, mediaTypes: ["image", "video"] },
    INSTAGRAM_PAGE: { label: "Instagram", maxCaptionChars: 2200, minMedia: 1, mediaTypes: ["image", "video"] },
    FACEBOOK: { label: "Facebook", maxCaptionChars: 63206, minMedia: 0, mediaTypes: ["image", "video"] },
    META: { label: "Meta", maxCaptionChars: 63206, minMedia: 0, mediaTypes: ["image", "video"] },
    TIKTOK: { label: "TikTok", maxCaptionChars: 2200, minMedia: 1, mediaTypes: ["video"] },
    YOUTUBE: { label: "YouTube", maxCaptionChars: 5000, minMedia: 1, mediaTypes: ["video"] },
    PINTEREST: { label: "Pinterest", maxCaptionChars: 500, minMedia: 1, mediaTypes: ["image"] },
    GOOGLE_BUSINESS: { label: "Google Business", maxCaptionChars: 1500, minMedia: 0, mediaTypes: ["image"] },
    LINKEDIN: { label: "LinkedIn", maxCaptionChars: 3000, minMedia: 0, mediaTypes: ["image", "video"] },
    BLUESKY: { label: "Bluesky", maxCaptionChars: 300, minMedia: 0, mediaTypes: ["image"] },
    THREADS: { label: "Threads", maxCaptionChars: 500, minMedia: 0, mediaTypes: ["image", "video"] },
    MANUAL: { label: "Manual", maxCaptionChars: null, minMedia: 0, mediaTypes: ["image", "video", "audio"] },
};

export interface PlatformIssue {
    platform: Platform;
    label: string;
    severity: "error" | "warning";
    message: string;
}

/**
 * Validasi konten untuk satu platform: panjang caption, jumlah & jenis media.
 * Draft tidak wajib media — hanya jadi peringatan; publish/schedule wajib.
 */
export function validatePlatformContent(
    platform: Platform,
    caption: string,
    media: { type: MediaType }[],
    opts: { checkMediaRequired?: boolean } = {},
): PlatformIssue[] {
    const rule = PLATFORM_RULES[platform] ?? PLATFORM_RULES.MANUAL;
    const issues: PlatformIssue[] = [];
    const trimmed = caption.trim();

    if (rule.maxCaptionChars !== null && trimmed.length > rule.maxCaptionChars) {
        issues.push({
            platform,
            label: rule.label,
            severity: "error",
            message: `Caption ${trimmed.length.toLocaleString("id-ID")} karakter, melebihi batas ${rule.label} (${rule.maxCaptionChars.toLocaleString("id-ID")}).`,
        });
    }

    if (media.length === 0 && rule.minMedia > 0) {
        if (opts.checkMediaRequired) {
            issues.push({
                platform,
                label: rule.label,
                severity: "error",
                message: `${rule.label} wajib memiliki minimal ${rule.minMedia} media.`,
            });
        } else {
            issues.push({
                platform,
                label: rule.label,
                severity: "warning",
                message: `${rule.label} akan terbit tanpa media — tidak didukung untuk publish.`,
            });
        }
    }

    for (const m of media) {
        if (!rule.mediaTypes.includes(m.type)) {
            issues.push({
                platform,
                label: rule.label,
                severity: "error",
                message: `${rule.label} tidak mendukung media ${m.type}.`,
            });
            break;
        }
    }

    return issues;
}

/** Batas caption paling ketat di antara akun terpilih (untuk indikator). null = tanpa batas. */
export function strictestCaptionLimit(platforms: Platform[]): number | null {
    let limit: number | null = null;
    for (const p of platforms) {
        const r = PLATFORM_RULES[p];
        if (!r || r.maxCaptionChars === null) continue;
        limit = limit === null ? r.maxCaptionChars : Math.min(limit, r.maxCaptionChars);
    }
    return limit;
}