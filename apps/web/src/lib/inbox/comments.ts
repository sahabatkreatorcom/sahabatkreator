import { INSTAGRAM_GRAPH_URL, GRAPH_API_URL } from "@/lib/platforms";
import type { InboxAccount, PlatformComment } from "./types";

/**
 * Ambil komentar sebuah konten dari platform.
 * Base URL dipilih berdasarkan jenis akun (INSTAGRAM standalone vs
 * INSTAGRAM_PAGE/FACEBOOK yang tertaut Meta Graph).
 */
export async function fetchComments(
    account: InboxAccount,
    platformPostId: string,
): Promise<{ comments: PlatformComment[]; error?: string }> {
    switch (account.platform) {
        case "INSTAGRAM":
            return fetchInstagramComments(account.accessToken, platformPostId, INSTAGRAM_GRAPH_URL);
        case "INSTAGRAM_PAGE":
            return fetchInstagramComments(account.accessToken, platformPostId, GRAPH_API_URL);
        case "FACEBOOK":
            return fetchFacebookComments(account.accessToken, platformPostId);
        case "TIKTOK":
            return fetchTikTokComments(account.accessToken, platformPostId);
        case "YOUTUBE":
            return fetchYouTubeComments(account.accessToken, platformPostId);
        case "THREADS":
            return fetchThreadsComments(account.accessToken, platformPostId);
        default:
            return { comments: [], error: `Sinkronisasi komentar untuk ${account.platform} belum didukung.` };
    }
}

async function fetchInstagramComments(token: string, mediaId: string, base: string): Promise<{ comments: PlatformComment[]; error?: string }> {
    try {
        // NOTE: objek `from` komentar Instagram TIDAK mendukung profile_picture_url
        // (error: Tried accessing nonexisting field). Pakai from{id,username} saja.
        const res = await fetch(
            `${base}/${mediaId}/comments?fields=id,text,timestamp,like_count,from{id,username}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!res.ok) return { comments: [], error: data.error?.message || `Instagram API error ${res.status}` };

        const comments: PlatformComment[] = (data.data ?? []).map((c: Record<string, unknown>) => {
            const from = (c.from ?? {}) as Record<string, unknown>;
            return {
                platformCommentId: String(c.id),
                authorId: String(from.id ?? ""),
                authorUsername: String(from.username ?? "unknown"),
                authorAvatar: null,
                text: String(c.text ?? ""),
                createdAt: c.timestamp ? new Date(c.timestamp as string) : new Date(),
                likeCount: Number(c.like_count ?? 0),
            };
        });
        return { comments };
    } catch (e) {
        return { comments: [], error: e instanceof Error ? e.message : "Instagram comment fetch failed" };
    }
}

async function fetchFacebookComments(token: string, postId: string): Promise<{ comments: PlatformComment[]; error?: string }> {
    try {
        const res = await fetch(
            `${GRAPH_API_URL}/${postId}/comments?fields=id,message,created_time,like_count,from{id,name,picture{url}}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!res.ok) return { comments: [], error: data.error?.message || `Facebook API error ${res.status}` };

        const comments: PlatformComment[] = (data.data ?? []).map((c: Record<string, unknown>) => {
            const from = (c.from ?? {}) as Record<string, unknown>;
            const picture = (from.picture ?? {}) as { data?: { url?: string } };
            return {
                platformCommentId: String(c.id),
                authorId: String(from.id ?? ""),
                authorUsername: String(from.name ?? "unknown"),
                authorAvatar: picture.data?.url ?? null,
                text: String(c.message ?? ""),
                createdAt: c.created_time ? new Date(c.created_time as string) : new Date(),
                likeCount: Number(c.like_count ?? 0),
            };
        });
        return { comments };
    } catch (e) {
        return { comments: [], error: e instanceof Error ? e.message : "Facebook comment fetch failed" };
    }
}

async function fetchTikTokComments(token: string, videoId: string): Promise<{ comments: PlatformComment[]; error?: string }> {
    try {
        const res = await fetch("https://open.tiktokapis.com/v2/video/comment/list/", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ video_id: videoId, max_count: 50 }),
        });
        let data: Record<string, unknown> = {};
        try {
            data = (await res.json()) as Record<string, unknown>;
        } catch {
            return { comments: [], error: `TikTok API mengembalikan respons non-JSON (status ${res.status}).` };
        }
        if (!res.ok) return { comments: [], error: (data.error as { message?: string })?.message || `TikTok API error ${res.status}` };

        const rawComments = (data.data as { comments?: unknown[] } | undefined)?.comments ?? [];
        const comments: PlatformComment[] = rawComments.map((cRaw) => {
            const c = cRaw as Record<string, unknown>;
            const user = (c.user ?? {}) as Record<string, unknown>;
            return {
                platformCommentId: String(c.comment_id),
                authorId: String(user.user_id ?? ""),
                authorUsername: String(user.display_name ?? "unknown"),
                authorAvatar: user.avatar_url ? String(user.avatar_url) : null,
                text: String(c.text ?? ""),
                createdAt: c.create_time ? new Date(Number(c.create_time) * 1000) : new Date(),
                likeCount: Number(c.like_count ?? 0),
            };
        });
        return { comments };
    } catch (e) {
        return { comments: [], error: e instanceof Error ? e.message : "TikTok comment fetch failed" };
    }
}

async function fetchYouTubeComments(token: string, videoId: string): Promise<{ comments: PlatformComment[]; error?: string }> {
    try {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        let data: Record<string, unknown> = {};
        try {
            data = (await res.json()) as Record<string, unknown>;
        } catch {
            return { comments: [], error: `YouTube API mengembalikan respons non-JSON (status ${res.status}).` };
        }
        if (!res.ok) return { comments: [], error: (data.error as { message?: string })?.message || `YouTube API error ${res.status}` };

const comments: PlatformComment[] = ((data.items as unknown[] | undefined) ?? []).map((tRaw) => {
            const t = tRaw as Record<string, unknown>;
            const top = (t.snippet ?? {}) as { id?: string; snippet?: Record<string, unknown> };
            const cs = (top.snippet ?? {}) as Record<string, unknown>;
            const channel = (cs.authorChannelId ?? {}) as { value?: string };
            const author = (cs.authorDisplayName ?? "unknown") as string;
            return {
                platformCommentId: String(top.id ?? t.id),
                authorId: String(channel.value ?? ""),
                authorUsername: author,
                authorAvatar: cs.authorProfileImageUrl ? String(cs.authorProfileImageUrl) : null,
                text: String(cs.textDisplay ?? ""),
                createdAt: cs.publishedAt ? new Date(cs.publishedAt as string) : new Date(),
                likeCount: Number(cs.likeCount ?? 0),
            };
        });
        return { comments };
    } catch (e) {
        return { comments: [], error: e instanceof Error ? e.message : "YouTube comment fetch failed" };
    }
}

async function fetchThreadsComments(token: string, threadId: string): Promise<{ comments: PlatformComment[]; error?: string }> {
    try {
        const res = await fetch(
            `https://graph.threads.net/v1.0/${threadId}/replies?fields=id,text,timestamp,username`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        let data: Record<string, unknown> = {};
        try {
            data = (await res.json()) as Record<string, unknown>;
        } catch {
            return { comments: [], error: `Threads API mengembalikan respons non-JSON (status ${res.status}).` };
        }
        if (!res.ok) return { comments: [], error: (data.error as { message?: string })?.message || `Threads API error ${res.status}` };

        const comments: PlatformComment[] = ((data.data as unknown[] | undefined) ?? []).map((cRaw) => {
            const c = cRaw as Record<string, unknown>;
            return {
                platformCommentId: String(c.id),
                authorId: String(c.id),
                authorUsername: String(c.username ?? "unknown"),
                authorAvatar: null,
                text: String(c.text ?? ""),
                createdAt: c.timestamp ? new Date(c.timestamp as string) : new Date(),
            };
        });
        return { comments };
    } catch (e) {
        return { comments: [], error: e instanceof Error ? e.message : "Threads comment fetch failed" };
    }
}