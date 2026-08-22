"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    AlertCircle,
    BarChart3,
    CheckCircle2,
    Clock,
    Download,
    ExternalLink,
    FileText,
    Globe,
    Info,
    Loader2,
    RefreshCw,
    Search,
    TrendingUp,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SeoIssue {
    category: string;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    suggestion: string;
    score: number;
}

interface SeoResult {
    url: string;
    timestamp: string;
    totalScore: number;
    issues: SeoIssue[];
    summary: {
        total: number;
        critical: number;
        warnings: number;
        info: number;
    };
    metrics: {
        titleLength: number;
        metaDescriptionLength: number;
        hasH1: boolean;
        wordCount: number;
        images: number;
        imagesWithAlt: number;
        links: number;
        internalLinks: number;
        externalLinks: number;
        loadTimeMs: number;
    };
}

const CATEGORY_LABELS: Record<string, string> = {
    meta: "Meta Tag",
    content: "Konten",
    technical: "Teknis",
    performance: "Performa",
    accessibility: "Aksesibilitas",
    mobile: "Mobile-Friendly",
};

export default function AdminSeoAuditPage() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SeoResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [auditHistory, setAuditHistory] = useState<SeoResult[]>([]);
    const [filterCategory, setFilterCategory] = useState("all");
    const [filterSeverity, setFilterSeverity] = useState("all");

    // Load history from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem("admin_seo_audit_history");
            if (stored) setAuditHistory(JSON.parse(stored));
        } catch { /* ignore */ }
    }, []);

    async function runAudit() {
        const trimmed = url.trim();
        if (!trimmed) return;

        let targetUrl = trimmed;
        if (!targetUrl.startsWith("http")) {
            targetUrl = `https://${targetUrl}`;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/seo/audit?url=${encodeURIComponent(targetUrl)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            let data: SeoResult | null = null;
            try {
                data = await res.json();
            } catch { /* empty body */ }
            const err = data ? (data as unknown as Record<string, unknown>)?.error : undefined;
            if (!res.ok) throw new Error(typeof err === "string" ? err : `HTTP ${res.status}`);
            if (data) {
                setResult(data);
                const newHistory = [data, ...auditHistory.filter((h) => h.url !== data.url)].slice(0, 20);
                setAuditHistory(newHistory);
                localStorage.setItem("admin_seo_audit_history", JSON.stringify(newHistory));
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
        } finally {
            setLoading(false);
        }
    }

    function clearHistory() {
        setAuditHistory([]);
        localStorage.removeItem("admin_seo_audit_history");
    }

    function filteredIssues() {
        if (!result) return [];
        return result.issues.filter((issue) => {
            if (filterCategory !== "all" && issue.category !== filterCategory) return false;
            if (filterSeverity !== "all" && issue.severity !== filterSeverity) return false;
            return true;
        });
    }

    function exportToCsv() {
        if (!result) return;
        const headers = ["Kategori", "Tingkat", "Judul", "Deskripsi", "Saran", "Skor"];
        const rows = result.issues.map((i) => [
            CATEGORY_LABELS[i.category] ?? i.category,
            i.severity,
            `"${i.title}"`,
            `"${i.description}"`,
            `"${i.suggestion}"`,
            i.score,
        ]);
        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `seo-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    }

    function getSeverityColor(severity: string) {
        switch (severity) {
            case "critical":
                return "text-accent-red";
            case "warning":
                return "text-amber-500";
            default:
                return "text-muted-foreground";
        }
    }

    function getSeverityBadge(severity: string) {
        switch (severity) {
            case "critical":
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-accent-red/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-red">
                        <XCircle className="h-3 w-3" /> Kritis
                    </span>
                );
            case "warning":
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" /> Peringatan
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Info className="h-3 w-3" /> Info
                    </span>
                );
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">SEO Audit</h1>
                    <p className="text-sm text-muted-foreground">
                        Analisis halaman web untuk menemukan masalah SEO dan optimasi performa.
                    </p>
                </div>
            </div>

            {/* Search bar */}
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Masukkan URL website (mis. example.com atau https://...)"
                            className="pl-9"
                            onKeyDown={(e) => e.key === "Enter" && runAudit()}
                        />
                    </div>
                    <Button onClick={runAudit} disabled={loading || !url.trim()}>
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <BarChart3 className="h-4 w-4" />
                        )}
                        Audit Sekarang
                    </Button>
                </div>
                {error && <p className="mt-2 text-sm text-accent-red">{error}</p>}
            </div>

            {loading && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Menganalisis halaman...</p>
                    <p className="text-xs text-muted-foreground">Membaca meta tag, konten, performa, dan lebih.</p>
                </div>
            )}

            {result && (
                <>
                    {/* Score overview */}
                    <div className="grid gap-3 sm:grid-cols-4">
                        <div className={cn(
                            "rounded-lg border border-border bg-card p-4 text-center",
                            result.totalScore >= 80 ? "border-emerald-500/30" :
                            result.totalScore >= 50 ? "border-amber-500/30" : "border-red-500/30"
                        )}>
                            <div className={cn(
                                "mx-auto flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold",
                                result.totalScore >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                result.totalScore >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            )}>
                                {result.totalScore}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">Skor SEO</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-accent-red">
                                <XCircle className="h-4 w-4" />
                                <p className="text-2xl font-semibold">{result.summary.critical}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">Kritis</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-amber-500">
                                <AlertCircle className="h-4 w-4" />
                                <p className="text-2xl font-semibold">{result.summary.warnings}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">Peringatan</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Info className="h-4 w-4" />
                                <p className="text-2xl font-semibold">{result.summary.info}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">Info</p>
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="rounded-lg border border-border bg-card p-4">
                        <h2 className="mb-3 text-sm font-semibold">Metrik Halaman</h2>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                                ["Judul", `${result.metrics.titleLength} karakter`, result.metrics.titleLength > 0 && result.metrics.titleLength <= 60],
                                ["Meta Deskripsi", `${result.metrics.metaDescriptionLength} karakter`, result.metrics.metaDescriptionLength > 0 && result.metrics.metaDescriptionLength <= 160],
                                ["Artikel", `${result.metrics.wordCount} kata`, result.metrics.wordCount >= 300],
                                ["Waktu Muat", `${result.metrics.loadTimeMs}ms`, result.metrics.loadTimeMs < 2000],
                            ].map(([label, value, ok], i) => (
                                <div key={i} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">{label}</span>
                                    <span className={cn("text-xs font-medium", ok ? "text-emerald-600" : "text-amber-600")}>
                                        {value}
                                        {ok ? <CheckCircle2 className="ml-1 inline h-3 w-3" /> : <AlertCircle className="ml-1 inline h-3 w-3" />}
                                    </span>
                                </div>
                            ))}
                            {[
                                ["Gambar", result.metrics.images],
                                ["Gambar + Alt", result.metrics.imagesWithAlt],
                                ["Link", result.metrics.links],
                                ["Link Internal", result.metrics.internalLinks],
                            ].map(([label, value], i) => (
                                <div key={i} className="rounded-md bg-muted/50 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">{label}</span>
                                    <p className="text-lg font-semibold">{value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">URL: {result.url}</p>
                            <a
                                href={result.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                                Buka di tab baru <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    </div>

                    {/* Filter & issues */}
                    <div className="rounded-lg border border-border bg-card">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
                            <h2 className="text-sm font-semibold">
                                Temuan ({filteredIssues().length})
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                                >
                                    <option value="all">Semua Kategori</option>
                                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <select
                                    value={filterSeverity}
                                    onChange={(e) => setFilterSeverity(e.target.value)}
                                    className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                                >
                                    <option value="all">Semua Tingkat</option>
                                    <option value="critical">Kritis</option>
                                    <option value="warning">Peringatan</option>
                                    <option value="info">Info</option>
                                </select>
                                <Button variant="outline" size="sm" onClick={exportToCsv}>
                                    <Download className="h-3.5 w-3.5" />
                                    Export CSV
                                </Button>
                                <Button variant="outline" size="sm" onClick={runAudit} disabled={loading}>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Audit Ulang
                                </Button>
                            </div>
                        </div>

                        <div className="divide-y divide-border">
                            {filteredIssues().length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                                    <p className="mt-2">Tidak ada temuan untuk filter ini.</p>
                                </div>
                            ) : (
                                filteredIssues().map((issue, i) => (
                                    <div key={i} className="p-4 hover:bg-muted/30">
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                "mt-0.5 h-5 w-5 shrink-0",
                                                issue.severity === "critical" ? "text-accent-red" :
                                                issue.severity === "warning" ? "text-amber-500" : "text-muted-foreground"
                                            )}>
                                                {issue.severity === "critical" ? <XCircle className="h-5 w-5" /> :
                                                 issue.severity === "warning" ? <AlertCircle className="h-5 w-5" /> :
                                                 <Info className="h-5 w-5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-medium">{issue.title}</span>
                                                    {getSeverityBadge(issue.severity)}
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                        {CATEGORY_LABELS[issue.category] ?? issue.category}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                                                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 p-2">
                                                    <span className="text-xs font-medium text-muted-foreground">Saran:</span>
                                                    <p className="text-xs text-foreground">{issue.suggestion}</p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <span className={cn(
                                                    "text-lg font-bold",
                                                    issue.score >= 70 ? "text-emerald-600" :
                                                    issue.score >= 40 ? "text-amber-600" : "text-red-600"
                                                )}>
                                                    {issue.score}
                                                </span>
                                                <p className="text-[10px] text-muted-foreground">skor</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* History */}
            {auditHistory.length > 0 && !result && (
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Riwayat Audit
                        </h2>
                        <Button variant="ghost" size="sm" onClick={clearHistory}>
                            Hapus Riwayat
                        </Button>
                    </div>
                    <ul className="mt-3 space-y-2">
                        {auditHistory.map((item, i) => (
                            <li key={i} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className={cn(
                                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                        item.totalScore >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                        item.totalScore >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    )}>{item.totalScore}</span>
                                    <span className="truncate text-sm">{item.url}</span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                    <span className="flex items-center gap-1">
                                        <XCircle className="h-3 w-3 text-accent-red" /> {item.summary.critical}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3 text-amber-500" /> {item.summary.warnings}
                                    </span>
                                    <span>{new Date(item.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
                                        onClick={() => setResult(item)}
                                    >
                                        Lihat
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
