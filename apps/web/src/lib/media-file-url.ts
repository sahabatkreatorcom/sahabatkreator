/**
 * Ensure any media URL goes through our /api/media/file proxy.
 * New uploads already use proxy URLs; legacy R2 direct URLs get converted.
 */
export function mediaFileUrl(url: string | null | undefined): string {
    if (!url) return "";
    if (url.startsWith("/api/media/file")) return url;
    try {
        const u = new URL(url);
        const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
        if (key) return `/api/media/file?key=${encodeURIComponent(key)}`;
    } catch { /* relative or non-URL — return as-is */ }
    return url;
}
