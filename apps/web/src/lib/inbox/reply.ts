import { INSTAGRAM_GRAPH_URL, GRAPH_API_URL } from "@/lib/platforms";
import type { InboxAccount, ReplyResult } from "./types";

/**
 * Balas sebuah komentar di platform.
 * INSTAGRAM standalone memakai graph.instagram.com; INSTAGRAM_PAGE/FACEBOOK
 * memakai graph.facebook.com. TikTok dan YouTube punya endpoint sendiri.
 */
export async function replyToComment(
    account: InboxAccount,
    platformPostId: string,
    platformCommentId: string,
    text: string,
): Promise<ReplyResult> {
    switch (account.platform) {
        case "INSTAGRAM":
            return replyInstagram(account.accessToken, platformPostId, platformCommentId, text, INSTAGRAM_GRAPH_URL);
        case "INSTAGRAM_PAGE":
            return replyInstagram(account.accessToken, platformPostId, platformCommentId, text, GRAPH_API_URL);
        case "FACEBOOK":
            return replyFacebook(account.accessToken, platformPostId, platformCommentId, text);
        case "TIKTOK":
            return replyTikTok(account.accessToken, platformCommentId, text);
        case "YOUTUBE":
            return replyYouTube(account.accessToken, platformCommentId, text);
        case "THREADS":
            return replyThreads(account.accessToken, platformPostId, text);
        default:
            return { success: false, error: `Membalas komentar untuk ${account.platform} belum didukung.` };
    }
}

async function replyInstagram(token: string, mediaId: string, commentId: string, text: string, base: string): Promise<ReplyResult> {
    try {
        const res = await fetch(`${base}/${mediaId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error?.message || `Instagram API error ${res.status}` };
        return { success: true, platformCommentId: String(data.id) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Instagram reply failed" };
    }
}

async function replyFacebook(token: string, postId: string, commentId: string, text: string): Promise<ReplyResult> {
    try {
        const res = await fetch(`${GRAPH_API_URL}/${commentId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error?.message || `Facebook API error ${res.status}` };
        return { success: true, platformCommentId: String(data.id) };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Facebook reply failed" };
    }
}

async function replyTikTok(token: string, commentId: string, text: string): Promise<ReplyResult> {
    try {
        const res = await fetch("https://open.tiktokapis.com/v2/comment/reply/", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ comment_id: commentId, reply_text: text }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error?.message || `TikTok API error ${res.status}` };
        return { success: true, platformCommentId: String(data.data?.comment_id ?? "") };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "TikTok reply failed" };
    }
}

async function replyYouTube(token: string, commentId: string, text: string): Promise<ReplyResult> {
    try {
        const res = await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error?.message || `YouTube API error ${res.status}` };
        return { success: true, platformCommentId: String(data.id ?? "") };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "YouTube reply failed" };
    }
}

async function replyThreads(token: string, threadId: string, text: string): Promise<ReplyResult> {
    try {
        const res = await fetch(`https://graph.threads.net/v1.0/${threadId}/replies`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error?.message || `Threads API error ${res.status}` };
        return { success: true, platformCommentId: String(data.id ?? "") };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Threads reply failed" };
    }
}