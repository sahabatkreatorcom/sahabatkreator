"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    RefreshCw,
    Search,
    Plus,
    Trash2,
    Check,
    X,
    Tag,
    AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ListeningMonitor {
    id: string;
    name: string;
    keywords: string[];
    platforms: string[];
    isActive: boolean;
    createdAt: string;
    lastRunAt: string | null;
}

interface ListeningItem {
    id: string;
    monitorId: string;
    monitorName?: string;
    sourceType: string;
    sourceId: string;
    authorName: string;
    authorAvatar: string | null;
    content: string;
    sentiment: string;
    matchedKeywords: string[];
    occurredAt: string;
    isRead: boolean;
}

interface DashboardData {
    monitors: ListeningMonitor[];
    items: ListeningItem[];
    unreadCount: number;
    sentiment: {
        positive: number;
        neutral: number;
        negative: number;
        question: number;
    };
}

const SENTIMENT_COLORS = {
    positive: "text-emerald-500",
    negative: "text-accent-red",
    question: "text-amber-500",
    neutral: "text-muted-foreground",
};

const SENTIMENT_LABELS = {
    positive: "Positif",
    negative: "Negatif",
    question: "Pertanyaan",
    neutral: "Netral",
};

const SOURCE_LABELS = {
    comment: "Komentar",
    mention: "Disebut",
    review: "Ulasan",
    dm: "DM",
};

export default function ListeningPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newKeywords, setNewKeywords] = useState("");
    const [creating, setCreating] = useState(false);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [filterSentiment, setFilterSentiment] = useState<string>("all");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/listening");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat");
            setData(json);
            setSelectedIds([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleSync() {
        setSyncing(true);
        setError(null);
        try {
            const res = await fetch("/api/listening", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "sync" }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal sinkronisasi");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal sinkronisasi");
        } finally {
            setSyncing(false);
        }
    }

    async function handleCreate() {
        const keywords = newKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean);
        if (!newName.trim() || keywords.length === 0) return;

        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/listening", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create",
                    name: newName.trim(),
                    keywords,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal membuat");
            setNewName("");
            setNewKeywords("");
            setCreateOpen(false);
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal membuat");
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(monitorId: string) {
        if (!confirm("Hapus monitoring ini?")) return;
        setError(null);
        try {
            const res = await fetch(`/api/listening?monitorId=${encodeURIComponent(monitorId)}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal menghapus");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menghapus");
        }
    }

    async function markRead() {
        if (selectedIds.length === 0) return;
        setError(null);
        try {
            const res = await fetch("/api/listening", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selectedIds }),
            });
            if (res.ok) {
                setSelectedIds([]);
                load();
            }
        } catch {
            // ignore
        }
    }

    const filteredItems = data?.items.filter((item) => {
        if (filterSentiment !== "all" && item.sentiment !== filterSentiment) return false;
        return true;
    }) ?? [];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Social Listening</h1>
                    <p className="text-sm text-muted-foreground">Pantau kata kunci, postingan, komentar, dan analisis sentimen.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing || !data?.monitors?.length}>
                        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Sinkronisasi
                    </Button>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Tambah monitoring
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-12 text-sm text-muted-foreground">Memuat…</p>
            ) : !data ? null : (
                <>
                    <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Monitoring aktif</p>
                            <p className="mt-1 text-2xl font-semibold">{data.monitors.filter((m) => m.isActive).length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Hasil pantauan</p>
                            <p className="mt-1 text-2xl font-semibold">{data.items.length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Belum dibaca</p>
                            <p className="mt-1 text-2xl font-semibold text-primary">{data.unreadCount}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">Sentimen positif</p>
                            <p className={cn("mt-1 text-2xl font-semibold", SENTIMENT_COLORS.positive)}>
                                {data.sentiment.positive}
                            </p>
                        </div>
                    </div>

                    {data.monitors.length === 0 ? (
                        <div className="rounded-lg border border-border bg-card p-8 text-center">
                            <Tag className="mx-auto h-8 w-8 text-muted-foreground/50" />
                            <p className="mt-2 text-sm font-medium">Belum ada monitoring</p>
                            <p className="text-sm text-muted-foreground">Buat monitoring untuk mulai melacak kata kunci dan diskusi.</p>
                            <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4" />
                                Buat monitoring pertama
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
                                    <Tag className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">Dipantau:</span>
                                    {data.monitors.map((m) => (
                                        <span
                                            key={m.id}
                                            className={cn(
                                                "rounded-full px-2 py-0.5 text-xs",
                                                m.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                            )}
                                        >
                                            {m.name}
                                        </span>
                                    ))}
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                    <select
                                        value={filterSentiment}
                                        onChange={(e) => setFilterSentiment(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="all">Semua sentiment</option>
                                        <option value="positive">Positif</option>
                                        <option value="negative">Negatif</option>
                                        <option value="question">Pertanyaan</option>
                                        <option value="neutral">Netral</option>
                                    </select>
                                    {selectedIds.length > 0 && (
                                        <Button size="sm" variant="secondary" onClick={markRead}>
                                            <Check className="h-4 w-4" />
                                            Tandai sudah dibaca ({selectedIds.length})
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {filteredItems.length === 0 ? (
                                <div className="rounded-lg border border-border bg-card p-8 text-center">
                                    <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {data.items.length === 0
                                            ? "Belum ada hasil pantauan. Klik «Sinkronisasi» untuk memindai data yang ada."
                                            : "Tidak ada hasil yang cocok."}
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-border bg-card">
                                    <ul className="divide-y divide-border">
                                        {filteredItems.map((item) => (
                                            <li
                                                key={item.id}
                                                className={cn(
                                                    "flex items-start gap-3 p-4 transition-colors hover:bg-muted/50",
                                                    !item.isRead && "bg-primary/[0.03]"
                                                )}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(item.id)}
                                                    onChange={(e) => {
                                                        setSelectedIds((prev) =>
                                                            e.target.checked
                                                                ? [...prev, item.id]
                                                                : prev.filter((id) => id !== item.id)
                                                        );
                                                    }}
                                                    className="mt-1 accent-primary"
                                                />
                                                {item.authorAvatar ? (
                                                    <img
                                                        src={item.authorAvatar}
                                                        alt={item.authorName}
                                                        className="h-9 w-9 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                        {item.authorName.slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-medium">{item.authorName}</span>
                                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                                            {SOURCE_LABELS[item.sourceType as keyof typeof SOURCE_LABELS] ?? item.sourceType}
                                                        </span>
                                                        <span className={cn("text-xs font-medium", SENTIMENT_COLORS[item.sentiment as keyof typeof SENTIMENT_COLORS])}>
                                                            {SENTIMENT_LABELS[item.sentiment as keyof typeof SENTIMENT_LABELS] ?? item.sentiment}
                                                        </span>
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {new Date(item.occurredAt).toLocaleDateString("id-ID", {
                                                                day: "numeric",
                                                                month: "short",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                                        {item.content || "(tanpa konten)"}
                                                    </p>
                                                    {item.matchedKeywords && item.matchedKeywords.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {item.matchedKeywords.map((kw) => (
                                                                <span
                                                                    key={kw}
                                                                    className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                                                >
                                                                    {kw}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            <Dialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Tambah monitoring"
                description="Atur kata kunci untuk melacak diskusi terkait."
            >
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="monitor-name">Nama</Label>
                        <Input
                            id="monitor-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="mis. Nama brand, nama produk"
                        />
                    </div>
                    <div>
                        <Label htmlFor="monitor-keywords">Kata kunci (pisahkan dengan koma)</Label>
                        <Input
                            id="monitor-keywords"
                            value={newKeywords}
                            onChange={(e) => setNewKeywords(e.target.value)}
                            placeholder="brand, nama produk, akun sosial"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Masukkan beberapa kata kunci, pisahkan dengan koma</p>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                            Batal
                        </Button>
                        <Button
                            size="sm"
                            disabled={creating || !newName.trim() || !newKeywords.trim()}
                            onClick={handleCreate}
                        >
                            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                            Buat monitoring
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}