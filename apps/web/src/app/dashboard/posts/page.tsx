"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, Send, Trash2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface AccountRef {
    id: string;
    platform: Platform;
    name: string;
    avatar: string | null;
}

interface MediaRef {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    type: "image" | "video";
}

interface Post {
    id: string;
    caption: string;
    status: "draft" | "scheduled" | "publishing" | "published" | "failed";
    scheduledAt: string | null;
    publishedAt: string | null;
    createdAt: string;
    platform: string;
    postUrl: string | null;
    account: AccountRef | null;
    media: MediaRef[];
    linkedGroupId: string | null;
}

const STATUS_FILTERS = [
    { value: "all", label: "Semua" },
    { value: "draft", label: "Draft" },
    { value: "scheduled", label: "Terjadwal" },
    { value: "published", label: "Terbit" },
    { value: "failed", label: "Gagal" },
] as const;

const STATUS_BADGE: Record<Post["status"], { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    scheduled: { label: "Terjadwal", className: "bg-accent-amber/15 text-accent-amber" },
    publishing: { label: "Menerbitkan…", className: "bg-primary/15 text-primary" },
    published: { label: "Terbit", className: "bg-accent-green/15 text-accent-green" },
    failed: { label: "Gagal", className: "bg-accent-red/15 text-accent-red" },
};

export default function PostsPage() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all");
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/posts?status=${filter}&limit=100`);
            const data = await res.json();
            if (res.ok) setPosts(data.posts ?? []);
            else setError(data.error || "Gagal memuat post.");
        } catch {
            setError("Gagal terhubung ke server.");
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    async function handlePublish(id: string) {
        setBusyId(id);
        setError(null);
        try {
            const res = await fetch(`/api/posts/${id}/publish`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal menerbitkan.");
            } else {
                loadPosts();
            }
        } catch {
            setError("Gagal menerbitkan.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Hapus post ini?")) return;
        setBusyId(id);
        setError(null);
        try {
            const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) setError(data.error || "Gagal menghapus.");
            else setPosts((prev) => prev.filter((p) => p.id !== id));
        } catch {
            setError("Gagal menghapus.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Posts</h1>
                    <p className="text-sm text-muted-foreground">Kelola konten yang dijadwalkan & diterbitkan.</p>
                </div>
                <a href="/compose">
                    <Button size="sm">+ Buat konten</Button>
                </a>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((s) => (
                    <button
                        key={s.value}
                        onClick={() => setFilter(s.value)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            filter === s.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat post…
                </div>
            ) : posts.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Belum ada post.</p>
            ) : (
                <div className="space-y-3">
                    {posts.map((post) => (
                        <div key={post.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {post.account && (
                                            <span
                                                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                                style={{ background: PLATFORM_COLORS[post.account.platform] }}
                                            >
                                                {post.account.avatar ? (
                                                    <img src={post.account.avatar} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                                                ) : (
                                                    <PlatformIcon platform={post.account.platform} size={14} />
                                                )}
                                                {post.account.name}
                                            </span>
                                        )}
                                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[post.status].className)}>
                                            {STATUS_BADGE[post.status].label}
                                        </span>
                                        {post.linkedGroupId && (
                                            <span className="text-xs text-muted-foreground">+ grup multi-platform</span>
                                        )}
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm text-foreground">{post.caption || "(tanpa caption)"}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span>{post.account ? PLATFORM_LABELS[post.account.platform] : post.platform}</span>
                                        {post.scheduledAt && (
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarClock className="h-3 w-3" />
                                                {new Date(post.scheduledAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                                            </span>
                                        )}
                                        {post.publishedAt && (
                                            <span className="inline-flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Terbit {new Date(post.publishedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                                            </span>
                                        )}
                                        {post.postUrl && (
                                            <a
                                                href={post.postUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                Lihat post
                                            </a>
                                        )}
                                    </div>
                                    {post.media.length > 0 && (
                                        <div className="mt-2 flex gap-1.5">
                                            {post.media.slice(0, 4).map((m) => (
                                                <img
                                                    key={m.id}
                                                    src={m.thumbnailUrl ?? m.url}
                                                    alt=""
                                                    className="h-12 w-12 rounded-md border border-border object-cover"
                                                />
                                            ))}
                                            {post.media.length > 4 && (
                                                <span className="flex h-12 w-12 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
                                                    +{post.media.length - 4}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    {(post.status === "draft" || post.status === "scheduled" || post.status === "failed") && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            loading={busyId === post.id}
                                            onClick={() => handlePublish(post.id)}
                                        >
                                            <Send className="h-3.5 w-3.5" />
                                            Terbitkan
                                        </Button>
                                    )}
                                    {post.status !== "published" && post.status !== "publishing" && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busyId === post.id}
                                            onClick={() => handleDelete(post.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
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
