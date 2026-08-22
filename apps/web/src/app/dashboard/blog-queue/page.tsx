"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    CalendarClock,
    CheckCircle2,
    Clock,
    ChevronLeft,
    ChevronRight,
    Eye,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

type BlogStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED";

interface BlogPost {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    status: BlogStatus;
    publishedAt: string | null;
    scheduledAt: string | null;
    createdAt: string;
    authorName: string;
    wordCount: number;
}

export default function BlogQueuePage() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [view, setView] = useState<"list" | "schedule">("list");

    const loadPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/blog-posts?status=all&limit=100");
            const data = await res.json();
            if (res.ok) setPosts(data.posts ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    async function handlePublish(id: string) {
        setBusyId(id);
        try {
            const res = await fetch(`/api/blog-posts/${id}/publish`, { method: "POST" });
            if (res.ok) loadPosts();
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch(`/api/blog-posts/${id}`, { method: "DELETE" });
            if (res.ok) loadPosts();
        } catch { /* silent */ }
    }

    async function handleSchedule(id: string, scheduledAt: string) {
        try {
            const res = await fetch(`/api/blog-posts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scheduledAt }),
            });
            if (res.ok) loadPosts();
        } catch { /* silent */ }
    }

    const filteredPosts = posts.filter((p) => {
        if (statusFilter === "all") return true;
        return p.status === statusFilter;
    });

    const scheduledPosts = filteredPosts
        .filter((p) => p.status === "SCHEDULED" || p.scheduledAt)
        .sort((a, b) => {
            const aTime = a.scheduledAt ?? a.publishedAt ?? a.createdAt;
            const bTime = b.scheduledAt ?? b.publishedAt ?? b.createdAt;
            return aTime.localeCompare(bTime);
        });

    const draftPosts = filteredPosts.filter((p) => p.status === "DRAFT");
    const publishedPosts = filteredPosts.filter((p) => p.status === "PUBLISHED");

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Blog Queue</h1>
                    <p className="text-sm text-muted-foreground">
                        Kelola artikel blog untuk SEO. Jadwalkan dan publish konten secara otomatis.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/admin/blog/new">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Post Baru
                        </Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={loadPosts} disabled={loading}>
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-2 sm:grid-cols-4">
                {[
                    { label: "Total", value: posts.length, color: "text-foreground" },
                    { label: "Draft", value: draftPosts.length, color: "text-amber-600" },
                    { label: "Terjadwal", value: scheduledPosts.length, color: "text-blue-600" },
                    { label: "Terbit", value: publishedPosts.length, color: "text-emerald-600" },
                ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-border bg-card p-3 text-center">
                        <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                {[
                    { value: "all", label: "Semua" },
                    { value: "DRAFT", label: "Draft" },
                    { value: "SCHEDULED", label: "Terjadwal" },
                    { value: "PUBLISHED", label: "Terbit" },
                ].map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setStatusFilter(f.value)}
                        className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            statusFilter === f.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {f.label} ({f.value === "all" ? posts.length : filteredPosts.length})
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat...
                </div>
            ) : filteredPosts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-12 text-center">
                    <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">Belum ada post blog.</p>
                    <Link href="/admin/blog/new">
                        <Button size="sm" className="mt-3">
                            <Plus className="h-4 w-4" />
                            Buat Post Pertama
                        </Button>
                    </Link>
                </div>
            ) : (
                <>
                    {/* Scheduled Posts */}
                    {scheduledPosts.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-semibold text-blue-600 flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Terjadwal ({scheduledPosts.length})
                            </h2>
                            <div className="space-y-2">
                                {scheduledPosts.map((post) => (
                                    <BlogPostCard
                                        key={post.id}
                                        post={post}
                                        busyId={busyId}
                                        onPublish={handlePublish}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Draft Posts */}
                    {draftPosts.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-semibold text-amber-600 flex items-center gap-2">
                                <Pencil className="h-4 w-4" />
                                Draft ({draftPosts.length})
                            </h2>
                            <div className="space-y-2">
                                {draftPosts.map((post) => (
                                    <BlogPostCard
                                        key={post.id}
                                        post={post}
                                        busyId={busyId}
                                        onPublish={handlePublish}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Published Posts */}
                    {publishedPosts.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-semibold text-emerald-600 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Terbit ({publishedPosts.length})
                            </h2>
                            <div className="space-y-2">
                                {publishedPosts.slice(0, 10).map((post) => (
                                    <BlogPostCard
                                        key={post.id}
                                        post={post}
                                        busyId={busyId}
                                        onPublish={handlePublish}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function BlogPostCard({
    post,
    busyId,
    onPublish,
    onDelete,
}: {
    post: BlogPost;
    busyId: string | null;
    onPublish: (id: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{post.title}</p>
                    <span
                        className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            post.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            post.status === "SCHEDULED" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        )}
                    >
                        {post.status}
                    </span>
                </div>
                {post.excerpt && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{post.excerpt}</p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{post.authorName}</span>
                    <span>·</span>
                    <span>{post.wordCount} kata</span>
                    <span>·</span>
                    <span>
                        {post.publishedAt
                            ? new Date(post.publishedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                            : post.createdAt
                            ? new Date(post.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                            : "-"}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Link href={`/blog/${post.slug}`} target="_blank">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Lihat">
                        <Eye className="h-3.5 w-3.5" />
                    </Button>
                </Link>
                <Link href={`/admin/blog/${post.id}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                </Link>
                {(post.status === "DRAFT" || post.status === "SCHEDULED") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Publish"
                        onClick={() => onPublish(post.id)}
                        disabled={busyId === post.id}
                    >
                        {busyId === post.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Hapus"
                    onClick={() => onDelete(post.id)}
                >
                    <Trash2 className="h-3.5 w-3.5 text-accent-red" />
                </Button>
            </div>
        </div>
    );
}
