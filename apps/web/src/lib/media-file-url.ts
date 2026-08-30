/**
 * Ensure any media URL goes through our /api/media/file proxy.
 * New uploads already use proxy URLs; legacy R2 direct URLs get converted.
 */
export function mediaFileUrl(url: string | null | undefined): string {
    if (!url) return "";
    if (url.startsWith("/api/media/file")) return url;
    try {
        const u = new URL(url);
        if (u.protocol === "http:" || u.protocol === "https:") {
            return url;
        }
    } catch { /* relative or non-URL — return as-is */ }
    return url;
}
