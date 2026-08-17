"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    RefreshCw,
    Search,
    MessageSquare,
    AtSign,
    Star,
    MessageCircle,
    Inbox as InboxIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AccountRef {
    id: string;
    platform: string;
    name: string;
    avatar: string | null;
    username: string | null;
}

interface Summary {
    unreadMentions: number;
    unreadMessages: number;
    unreadReviews: number;
    totalMentions: number;
    totalMessages: number;
    totalReviews: number;
    unansweredComments: number;
}

interface EngagementItem {
    id: string;
    [key: string]: unknown;
    isRead: boolean;
    createdAt: string;
    socialAccount: AccountRef;
}

type Tab = "mentions" | "messages" | "reviews";

const TAB_ORDER: Tab[] = ["mentions", "messages", "reviews"];

export default function EngagementPage() {
    const [tab, setTab] = useState<Tab>("mentions");
    const [summary, setSummary] = useState<Summary | null>(null);
    const [items, setItems] = useState<EngagementItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState("");
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ type: tab, limit: "100" });
            if (unreadOnly) params.set("unreadOnly", "true");
            const res = await fetch(`/api/engagement?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal memuat data.");
            setItems(data.items ?? []);
            setSummary(data.summary ?? null);
            setSelected([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data.");
        } finally {
            setLoading(false);
        }
    }, [tab, unreadOnly]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        fetch("/api/engagement?type=summary")
            .then((r) => r.json())
            .then((d) => setSummary(d.summary ?? null))
            .catch(() => undefined);
    }, []);

    async function markRead() {
        if (selected.length === 0) return;
        const res = await fetch("/api/engagement", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: tab, ids: selected, isRead: true }),
        });
        if (res.ok) {
            setSelected([]);
            load();
        }
    }

    const filtered = items.filter((item) => {
        if (!q) return true;
        const needle = q.toLowerCase();
        const text = String(item.text ?? item.replyText ?? "");
        const author = String(item.authorUsername ?? item.senderUsername ?? item.authorName ?? "");
        return text.toLowerCase().includes(needle) || author.toLowerCase().includes(needle);
    });

    const unreadKey = tab === "mentions" ? "unreadMentions" : tab === "messages" ? "unreadMessages" : "unreadReviews";
    const totalKey = tab === "mentions" ? "totalMentions" : tab === "messages" ? "totalMessages" : "totalReviews";

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Engagement</h1>
                    <p className="text-sm text-muted-foreground">Sebutan, pesan, dan ulasan dari semua platform.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Muat ulang
                    </Button>
                    <Button size="sm" onClick={markRead} disabled={selected.length === 0}>
                        Tandai terbaca ({selected.length})
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {summary && (
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {([
                        ["unreadMentions", "Sebutan belum dibaca", AtSign],
                        ["unreadMessages", "Pesan belum dibaca", MessageSquare],
                        ["unreadReviews", "Ulasan belum dibaca", Star],
                        ["unansweredComments", "Komentar belum dibalas", MessageCircle],
                        ["totalMentions", "Total sebutan", AtSign],
                        ["totalReviews", "Total ulasan", Star],
                    ] as const).map(([key, label, Icon]) => (
                        <div key={key} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Icon className="h-4 w-4" />
                                <p className="text-xs">{label}</p>
                            </div>
                            <p className="mt-1 text-2xl font-semibold">{summary[key]}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                    {TAB_ORDER.map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                            )}
                        >
                            {t === "mentions" ? "Sebutan" : t === "messages" ? "Pesan" : "Ulasan"}
                            {summary && summary[unreadKey] > 0 && t === tab && (
                                <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                                    {summary[unreadKey]}
                                </span>
                            )}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={unreadOnly}
                                onChange={(e) => setUnreadOnly(e.target.checked)}
                                className="accent-primary"
                            />
                            Belum dibaca
                        </label>
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Cari…"
                                className="h-9 w-48 rounded-md border border-input bg-card pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                    </div>
                </div>

                <div className="max-h-[70vh] overflow-auto">
                    {loading ? (
                        <p className="p-8 text-sm text-muted-foreground">Memuat…</p>
                    ) : filtered.length === 0 ? (
                        <div className="p-8 text-center">
                            <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                            <p className="mt-2 text-sm text-muted-foreground">
                                {q ? "Tidak ada hasil untuk pencarian." : "Belum ada data. Sinkronkan inbox di halaman Inbox."}
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {filtered.map((item) => (
                                <EngagementRow
                                    key={item.id}
                                    item={item}
                                    tab={tab}
                                    selected={selected.includes(item.id)}
                                    onToggle={() =>
                                        setSelected((prev) =>
                                            prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]
                                        )
                                    }
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

function EngagementRow({
    item,
    tab,
    selected,
    onToggle,
}: {
    item: EngagementItem;
    tab: Tab;
    selected: boolean;
    onToggle: () => void;
}) {
    const author = String(item.authorUsername ?? item.senderUsername ?? item.authorName ?? "unknown");
    const avatar = String(item.authorAvatar ?? item.senderAvatar ?? "");
    const text = String(item.text ?? item.replyText ?? "");
    const platform = item.socialAccount.platform;

    return (
        <li
            className={cn(
                "flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/50",
                !item.isRead && "bg-primary/[0.03]"
            )}
            onClick={onToggle}
        >
            <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 accent-primary"
            />
            {avatar ? (
                <img src={avatar} alt={author} className="h-9 w-9 rounded-full object-cover" />
            ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {author.slice(0, 2).toUpperCase()}
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{author}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {platform}
                    </span>
                    {tab === "reviews" && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-500">
                            {Array.from({ length: Math.min(Number(item.rating) ?? 0, 5) }).map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-current" />
                            ))}
                        </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                    </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{text || "(tanpa teks)"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Akun: {item.socialAccount.name}
                    {!item.isRead && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Baru</span>}
                </p>
            </div>
        </li>
    );
}
