"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActivityItem {
    id: string;
    action: string;
    userName: string | null;
    resourceName: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
}

interface Summary {
    total: number;
    post: number;
    media: number;
    account: number;
    team: number;
    settings: number;
    organization: number;
    automation: number;
    comment: number;
}

interface ActivityResponse {
    items: ActivityItem[];
    total: number;
    limit: number;
    offset: number;
    summary: Summary;
}

const FILTERS: { value: string; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "post", label: "Post" },
    { value: "comment", label: "Komentar" },
    { value: "automation", label: "Automation" },
    { value: "account", label: "Akun" },
    { value: "media", label: "Media" },
    { value: "team", label: "Tim" },
];

function formatAction(action: string): { icon: string; label: string } {
    const map: Record<string, { icon: string; label: string }> = {
        "post.created": { icon: "📝", label: "Post dibuat" },
        "post.scheduled": { icon: "⏰", label: "Post dijadwalkan" },
        "post.published": { icon: "🚀", label: "Post diterbitkan" },
        "post.failed": { icon: "⚠️", label: "Post gagal terbit" },
        "post.updated": { icon: "✏️", label: "Post diperbarui" },
        "post.deleted": { icon: "🗑️", label: "Post dihapus" },
        "comment.replied": { icon: "💬", label: "Komentar dibalas" },
        "automation.created": { icon: "⚡", label: "Automation dibuat" },
        "automation.updated": { icon: "⚙️", label: "Automation diperbarui" },
        "automation.deleted": { icon: "❌", label: "Automation dihapus" },
        "account.connected": { icon: "🔗", label: "Akun terhubung" },
        "account.refreshed": { icon: "🔄", label: "Akun disegarkan" },
        "account.disconnected": { icon: "🔌", label: "Akun diputus" },
        "media.uploaded": { icon: "📤", label: "Media diunggah" },
        "media.deleted": { icon: "🧹", label: "Media dihapus" },
    };
    return map[action] ?? { icon: "🔹", label: action };
}

export default function ActivityPage() {
    const [filter, setFilter] = useState("all");
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(50);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ type: filter, limit: String(limit), offset: "0" });
            const res = await fetch(`/api/activity?${params}`);
            const data = (await res.json()) as ActivityResponse & { error?: string };
            if (!res.ok) throw new Error(data.error || "Gagal memuat activity log.");
            setItems(data.items ?? []);
            setTotal(data.total ?? 0);
            setSummary(data.summary);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat activity log.");
        } finally {
            setLoading(false);
        }
    }, [filter, limit]);

    useEffect(() => {
        load();
    }, [load]);

    function loadMore() {
        setLimit((l) => l + 50);
    }

    const summaryCards: { label: string; value: number; className: string }[] = [
        { label: "Total aktivitas", value: summary?.total ?? 0, className: "" },
        { label: "Post", value: summary?.post ?? 0, className: "" },
        { label: "Komentar", value: summary?.comment ?? 0, className: "" },
        { label: "Automation", value: summary?.automation ?? 0, className: "" },
        { label: "Akun", value: summary?.account ?? 0, className: "" },
        { label: "Media", value: summary?.media ?? 0, className: "" },
    ];

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">Activity log</h1>
                <p className="text-sm text-muted-foreground">Jejak semua aktivitas di workspace ini.</p>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {summaryCards.map((c) => (
                    <div key={c.label} className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <p className="mt-1 text-xl font-semibold">{c.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                            filter === f.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="py-8 text-sm text-muted-foreground">Memuat…</p>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
                    <History className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => {
                        const { icon, label } = formatAction(item.action);
                        return (
                            <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-base">
                                    {icon}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm">
                                        <span className="font-medium">{item.userName ?? "Sistem"}</span>
                                        {" · "}
                                        <span>{label}</span>
                                        {item.resourceName && <span className="text-muted-foreground"> — {item.resourceName}</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(item.createdAt).toLocaleString("id-ID", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    {total > items.length && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={loadMore}>
                            Muat lebih banyak ({items.length}/{total})
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}