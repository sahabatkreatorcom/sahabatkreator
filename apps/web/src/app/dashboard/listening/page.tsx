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
    positive: "正面",
    negative: "負面",
    question: "提問",
    neutral: "中性",
};

const SOURCE_LABELS = {
    comment: "留言",
    mention: "被提到",
    review: "評價",
    dm: "私訊",
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
            if (!res.ok) throw new Error(json.error || "載入失敗");
            setData(json);
            setSelectedIds([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "載入失敗");
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
            if (!res.ok) throw new Error(json.error || "同步失敗");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "同步失敗");
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
            if (!res.ok) throw new Error(json.error || "建立失敗");
            setNewName("");
            setNewKeywords("");
            setCreateOpen(false);
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "建立失敗");
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(monitorId: string) {
        if (!confirm("確定要刪除此監控？")) return;
        setError(null);
        try {
            const res = await fetch(`/api/listening?monitorId=${encodeURIComponent(monitorId)}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "刪除失敗");
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "刪除失敗");
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
                    <p className="text-sm text-muted-foreground">監控關鍵字、貼文、評論與情感分析。</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing || !data?.monitors?.length}>
                        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        同步
                    </Button>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        新增監控
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            {loading ? (
                <p className="py-12 text-sm text-muted-foreground">載入中…</p>
            ) : !data ? null : (
                <>
                    <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">活躍監控</p>
                            <p className="mt-1 text-2xl font-semibold">{data.monitors.filter((m) => m.isActive).length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">監聽結果</p>
                            <p className="mt-1 text-2xl font-semibold">{data.items.length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">未讀</p>
                            <p className="mt-1 text-2xl font-semibold text-primary">{data.unreadCount}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground">正面 sentiment</p>
                            <p className={cn("mt-1 text-2xl font-semibold", SENTIMENT_COLORS.positive)}>
                                {data.sentiment.positive}
                            </p>
                        </div>
                    </div>

                    {data.monitors.length === 0 ? (
                        <div className="rounded-lg border border-border bg-card p-8 text-center">
                            <Tag className="mx-auto h-8 w-8 text-muted-foreground/50" />
                            <p className="mt-2 text-sm font-medium">尚未建立監控</p>
                            <p className="text-sm text-muted-foreground">新增監控來開始追蹤關鍵字與討論。</p>
                            <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4" />
                                新增第一個監控
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
                                    <Tag className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">監控中：</span>
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
                                        <option value="all">全部 sentiment</option>
                                        <option value="positive">正面</option>
                                        <option value="negative">負面</option>
                                        <option value="question">提問</option>
                                        <option value="neutral">中性</option>
                                    </select>
                                    {selectedIds.length > 0 && (
                                        <Button size="sm" variant="secondary" onClick={markRead}>
                                            <Check className="h-4 w-4" />
                                            標記已讀 ({selectedIds.length})
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {filteredItems.length === 0 ? (
                                <div className="rounded-lg border border-border bg-card p-8 text-center">
                                    <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {data.items.length === 0
                                            ? "尚未有監聽結果。點擊「同步」來掃描現有資料。"
                                            : "沒有符合條件的結果。"}
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
                                                        {item.content || "(無內容)"}
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
                title="新增監控"
                description="設定關鍵字來追蹤相關討論。"
            >
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="monitor-name">名稱</Label>
                        <Input
                            id="monitor-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="例如：品牌名稱、產品名"
                        />
                    </div>
                    <div>
                        <Label htmlFor="monitor-keywords">關鍵字（逗號分隔）</Label>
                        <Input
                            id="monitor-keywords"
                            value={newKeywords}
                            onChange={(e) => setNewKeywords(e.target.value)}
                            placeholder="品牌, 產品名, 社群帳號"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">輸入多個關鍵字，用逗號分隔</p>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                            取消
                        </Button>
                        <Button
                            size="sm"
                            disabled={creating || !newName.trim() || !newKeywords.trim()}
                            onClick={handleCreate}
                        >
                            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                            建立監控
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}