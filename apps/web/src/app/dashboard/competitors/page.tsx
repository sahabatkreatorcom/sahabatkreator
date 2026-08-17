"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Users, TrendingUp, Hash, CalendarDays, ExternalLink, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface RecentPost {
    id: string;
    caption: string | null;
    mediaType: string | null;
    likes: number;
    comments: number;
    engagement: number;
    postedAt: string;
}

interface Competitor {
    id: string;
    platform: Platform;
    username: string;
    displayName: string | null;
    avatar: string | null;
    followers: number;
    followerGrowth: number;
    avgEngagement: number;
    postsPerWeek: number;
    isVerified: boolean;
    lastSyncedAt: string | null;
    createdAt: string;
    postCount: number;
    recentPosts: RecentPost[];
}

const TRACKABLE_PLATFORMS: Platform[] = ["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "TIKTOK", "YOUTUBE", "PINTEREST", "THREADS"];

export default function CompetitorsPage() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [addOpen, setAddOpen] = useState(false);
    const [newPlatform, setNewPlatform] = useState<Platform>("INSTAGRAM");
    const [newUsername, setNewUsername] = useState("");
    const [addSaving, setAddSaving] = useState(false);

    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/competitors");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat competitor.");
            setCompetitors(data.competitors ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat competitor.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function api(url: string, method: string, body?: unknown) {
        const res = await fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Gagal menyimpan.");
        return data;
    }

    async function addCompetitor() {
        if (!newUsername.trim()) return;
        setAddSaving(true);
        setError(null);
        try {
            const data = await api("/api/competitors", "POST", { platform: newPlatform, username: newUsername });
            if (data.warning) setError(data.warning);
            setAddOpen(false);
            setNewUsername("");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menambahkan competitor.");
        } finally {
            setAddSaving(false);
        }
    }

    async function sync(id: string) {
        setSyncingIds((prev) => new Set(prev).add(id));
        setError(null);
        try {
            const res = await fetch(`/api/competitors/sync?id=${id}`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi.");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal sinkronisasi.");
        } finally {
            setSyncingIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }

    async function remove(id: string) {
        if (!confirm("Hapus competitor dari pelacakan?")) return;
        setError(null);
        try {
            await api(`/api/competitors?id=${id}`, "DELETE");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus competitor.");
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Competitor & listening</h1>
                    <p className="text-sm text-muted-foreground">
                        Pantau akun kompetitor, benchmark performa, dan analisis konten mereka.
                    </p>
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Tambah competitor
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-8 text-sm text-muted-foreground">Memuat…</p>
            ) : competitors.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        Belum ada competitor yang dilacak. Tambahkan akun Instagram untuk memulai (perlu akun Instagram terhubung di Pengaturan).
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Tambah competitor
                    </Button>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {competitors.map((c) => (
                        <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    {c.avatar ? (
                                        <img src={c.avatar} alt={c.username} className="h-9 w-9 rounded-full object-cover" />
                                    ) : (
                                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                                            {c.username.slice(0, 1).toUpperCase()}
                                        </span>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium">
                                            {c.displayName || c.username}
                                            {c.isVerified && <span className="ml-1 text-primary">✓</span>}
                                        </p>
                                        <span
                                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                            style={{ background: PLATFORM_COLORS[c.platform] }}
                                        >
                                            {PLATFORM_LABELS[c.platform]}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={syncingIds.has(c.id)} onClick={() => sync(c.id)}>
                                        {syncingIds.has(c.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-accent-red" onClick={() => remove(c.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Users className="h-3.5 w-3.5" />
                                    <span>{c.followers.toLocaleString("id-ID")}</span>
                                </div>
                                <div className={cn("flex items-center gap-1.5", c.followerGrowth >= 0 ? "text-green-600" : "text-accent-red")}>
                                    <TrendingUp className={cn("h-3.5 w-3.5", c.followerGrowth < 0 && "rotate-180")} />
                                    <span>{Math.abs(c.followerGrowth).toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Hash className="h-3.5 w-3.5" />
                                    <span>{c.avgEngagement}% engagement</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    <span>{c.postsPerWeek} post/minggu</span>
                                </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                <span>@{c.username}</span>
                                <span>{c.postCount} post tercatat</span>
                            </div>

                            {c.lastSyncedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Terakhir sinkron: {new Date(c.lastSyncedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </p>
                            )}

                            <button
                                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {expandedId === c.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                Post terbaru
                            </button>

                            {expandedId === c.id && (
                                <div className="mt-2 space-y-1.5">
                                    {c.recentPosts.length === 0 && <p className="text-xs text-muted-foreground">Belum ada post tersinkron. Klik ikon refresh untuk mengambil data.</p>}
                                    {c.recentPosts.map((p) => (
                                        <div key={p.id} className="rounded border border-border bg-muted/40 p-2">
                                            <p className="line-clamp-2 text-xs">{p.caption || "(tanpa caption)"}</p>
                                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                                <span>♥ {p.likes}</span>
                                                <span>💬 {p.comments}</span>
                                                <span>{p.engagement} engagement</span>
                                                <span className="ml-auto">
                                                    {new Date(p.postedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Tambah competitor">
                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label>Platform</Label>
                        <select
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={newPlatform}
                            onChange={(e) => setNewPlatform(e.target.value as Platform)}
                        >
                            {TRACKABLE_PLATFORMS.map((p) => (
                                <option key={p} value={p}>
                                    {PLATFORM_LABELS[p]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-2">
                        <Label>Username</Label>
                        <Input
                            placeholder="mis. pesaing.kreator"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
                        />
                        <p className="text-xs text-muted-foreground">
                            Sinkronisasi live saat ini hanya mendukung Instagram (perlu akun Instagram terhubung). Platform lain tetap bisa ditambahkan dan disinkronkan nanti.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                            Batal
                        </Button>
                        <Button size="sm" disabled={addSaving || !newUsername.trim()} onClick={addCompetitor}>
                            {addSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            Tambahkan
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
