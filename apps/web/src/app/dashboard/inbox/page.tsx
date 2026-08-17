"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Send, Trash2, CheckCheck, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface AccountRef {
    id: string;
    platform: Platform;
    name: string;
    avatar: string | null;
    username: string | null;
}

interface PostRef {
    id: string;
    caption: string;
    platformPostId: string | null;
}

interface InboxComment {
    id: string;
    platformCommentId: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string | null;
    text: string;
    likeCount: number;
    isRead: boolean;
    isReplied: boolean;
    isHidden: boolean;
    createdAt: string;
    parentId: string | null;
    account: AccountRef;
    post: PostRef | null;
}

interface InboxData {
    comments: InboxComment[];
    unreadCount: number;
}

const PLATFORM_FILTERS = [
    { value: "all", label: "Semua" },
    { value: "INSTAGRAM", label: "Instagram" },
    { value: "INSTAGRAM_PAGE", label: "Instagram (Page)" },
    { value: "FACEBOOK", label: "Facebook" },
    { value: "TIKTOK", label: "TikTok" },
    { value: "YOUTUBE", label: "YouTube" },
    { value: "THREADS", label: "Threads" },
];

export default function InboxPage() {
    const [comments, setComments] = useState<InboxComment[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [platform, setPlatform] = useState<string>("all");
    const [q, setQ] = useState("");
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [replyFor, setReplyFor] = useState<InboxComment | null>(null);
    const [replyText, setReplyText] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ limit: "200" });
            if (platform !== "all") params.set("platform", platform);
            if (showUnreadOnly) params.set("isRead", "false");
            if (q.trim()) params.set("q", q.trim());

            const res = await fetch(`/api/inbox?${params}`);
            const data = await res.json();
            if (res.ok) {
                setComments(data.comments ?? []);
                setUnreadCount(data.unreadCount ?? 0);
            } else {
                setError(data.error || "Gagal memuat inbox.");
            }
        } catch {
            setError("Gagal terhubung ke server.");
        } finally {
            setLoading(false);
        }
    }, [platform, q, showUnreadOnly]);

    useEffect(() => {
        const t = setTimeout(load, q.trim() ? 300 : 0);
        return () => clearTimeout(t);
    }, [load]);

    async function handleSync() {
        setSyncing(true);
        setSyncResult(null);
        setError(null);
        try {
            const res = await fetch("/api/inbox/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal menyinkronkan.");
            } else {
                setSyncResult(
                    `Post dicek: ${data.postsChecked ?? 0} · baru: ${data.commentsAdded ?? 0} · diperbarui: ${data.commentsUpdated ?? 0} · gagal: ${data.failed ?? 0}`
                );
                load();
            }
        } catch {
            setError("Gagal menyinkronkan.");
        } finally {
            setSyncing(false);
        }
    }

    async function markRead(comment: InboxComment) {
        if (comment.isRead) return;
        setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, isRead: true } : c)));
        setUnreadCount((n) => Math.max(0, n - 1));
        await fetch("/api/inbox", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [comment.id], isRead: true }),
        }).catch(() => {});
    }

    async function handleReply(comment: InboxComment) {
        if (!replyText.trim()) return;
        setBusyId(comment.id);
        setError(null);
        try {
            const res = await fetch(`/api/inbox/${comment.id}/reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: replyText.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal membalas.");
            } else {
                setReplyFor(null);
                setReplyText("");
                load();
            }
        } catch {
            setError("Gagal membalas.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(comment: InboxComment) {
        if (!confirm("Hapus komentar dari inbox?")) return;
        setBusyId(comment.id);
        try {
            const res = await fetch(`/api/inbox/${comment.id}`, { method: "DELETE" });
            if (res.ok) setComments((prev) => prev.filter((c) => c.id !== comment.id));
        } finally {
            setBusyId(null);
        }
    }

    const grouped = useMemo(() => {
        const threads = comments.filter((c) => !c.parentId);
        const replies = new Map<string, InboxComment[]>();
        for (const c of comments) {
            if (!c.parentId) continue;
            const list = replies.get(c.parentId) ?? [];
            list.push(c);
            replies.set(c.parentId, list);
        }
        return threads.map((t) => ({ thread: t, replies: replies.get(t.id) ?? [] }));
    }, [comments]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Komentar & pesan</h1>
                    <p className="text-sm text-muted-foreground">Balas komentar dari semua platform.</p>
                </div>
                <Button variant="secondary" size="sm" loading={syncing} onClick={handleSync}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sinkronkan
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}
            {syncResult && <p className="rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">{syncResult}</p>}

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Cari komentar…"
                        className="h-8 w-48 rounded-md border border-border bg-card pl-8 pr-3 text-sm outline-none focus:border-primary"
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {PLATFORM_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setPlatform(f.value)}
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                platform === f.value
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
                    <input type="checkbox" checked={showUnreadOnly} onChange={(e) => setShowUnreadOnly(e.target.checked)} className="accent-primary" />
                    Belum dibaca ({unreadCount})
                </label>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat inbox…
                </div>
            ) : grouped.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-10 text-center">
                    <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">Belum ada komentar</p>
                    <p className="text-xs text-muted-foreground">
                        Hubungkan akun, terbitkan konten, lalu klik <span className="font-medium">Sinkronkan</span>.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {grouped.map(({ thread, replies }) => (
                        <div
                            key={thread.id}
                            className={cn("rounded-lg border border-border bg-card p-4", !thread.isRead && "border-primary/40")}
                        >
                            <div className="flex items-start gap-3">
                                <button onClick={() => markRead(thread)} className="shrink-0">
                                    {thread.authorAvatar ? (
                                        <img src={thread.authorAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                                    ) : (
                                        <span
                                            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                                            style={{ background: PLATFORM_COLORS[thread.account.platform] }}
                                        >
                                            {thread.authorUsername[0]?.toUpperCase() ?? "?"}
                                        </span>
                                    )}
                                </button>

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                            style={{ background: PLATFORM_COLORS[thread.account.platform] }}
                                        >
                                            {PLATFORM_LABELS[thread.account.platform]}
                                        </span>
                                        <span className="text-sm font-medium">{thread.authorUsername}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(thread.createdAt).toLocaleString("id-ID")}
                                        </span>
                                        {thread.isReplied && <span className="text-xs text-accent-green">Sudah dibalas</span>}
                                    </div>
                                    <p className="mt-1 text-sm text-foreground">{thread.text}</p>
                                    {thread.post?.caption && (
                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                            pada: {thread.post.caption}
                                        </p>
                                    )}

                                    {replies.map((r) => (
                                        <div key={r.id} className="mt-2 rounded-md bg-muted/50 p-2.5">
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="font-medium">
                                                    {r.authorId === "SELF" ? "Anda" : r.authorUsername}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {new Date(r.createdAt).toLocaleString("id-ID")}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-sm">{r.text}</p>
                                        </div>
                                    ))}

                                    {replyFor?.id === thread.id ? (
                                        <div className="mt-3 flex gap-2">
                                            <input
                                                autoFocus
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && handleReply(thread)}
                                                placeholder="Tulis balasan…"
                                                className="h-9 flex-1 rounded-md border border-border bg-muted/50 px-3 text-sm outline-none focus:border-primary"
                                            />
                                            <Button size="sm" loading={busyId === thread.id} onClick={() => handleReply(thread)}>
                                                <Send className="h-3.5 w-3.5" />
                                                Kirim
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => { setReplyFor(null); setReplyText(""); }}>
                                                Batal
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="mt-2 flex gap-1.5">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => { setReplyFor(thread); setReplyText(""); }}
                                            >
                                                <Send className="h-3.5 w-3.5" />
                                                Balas
                                            </Button>
                                            <Button variant="ghost" size="sm" disabled={busyId === thread.id} onClick={() => handleDelete(thread)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                            {!thread.isRead && (
                                                <Button variant="ghost" size="sm" onClick={() => markRead(thread)}>
                                                    <CheckCheck className="h-3.5 w-3.5" />
                                                    Tandai dibaca
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}