"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Sparkles, ListChecks, MessageSquare, BookOpen, RefreshCw, Loader2, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tab = "summary" | "recommendations" | "chat" | "brand";

interface Report {
    id: string;
    trigger: string;
    status: string;
    title: string;
    summary: string;
    overallScore: number | null;
    scoreBreakdown: Record<string, number>;
    confidence: number;
    createdAt: string;
    recommendations: Array<{
        id: string;
        category: string;
        priority: string;
        status: string;
        title: string;
    }>;
}

interface Recommendation {
    id: string;
    category: string;
    priority: string;
    status: string;
    title: string;
    advice: string;
    rationale: string | null;
    platform: string | null;
    account: { id: string; name: string } | null;
    createdAt: string;
}

interface Knowledge {
    websiteUrl: string | null;
    audience: string | null;
    positioning: string | null;
    products: string | null;
    offers: string | null;
    voiceRules: string | null;
    bannedTopics: string | null;
    websiteScannedAt: string | null;
    pendingInsights: {
        source: string;
        websiteUrl: string;
        scannedAt: string;
        pages: Array<{ url: string; title: string | null }>;
        audience: string | null;
        positioning: string | null;
        products: string | null;
        offers: string | null;
        voiceRules: string | null;
        bannedTopics: string | null;
        learnedInsights: string[];
        crawlSummary: string;
        confidence: number;
    } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
    CONTENT_STRATEGY: "Strategi konten",
    CAPTION: "Caption",
    CREATIVE: "Kreatif",
    VIDEO: "Video",
    TIMING: "Waktu posting",
    HASHTAG: "Hashtag",
    PLATFORM: "Platform",
    COMPETITOR: "Competitor",
    BRAND: "Brand",
};

const PRIORITY_COLORS: Record<string, string> = {
    HIGH: "bg-accent-red/10 text-accent-red",
    MEDIUM: "bg-amber-500/10 text-amber-600",
    LOW: "bg-muted text-muted-foreground",
};

export default function SebPage() {
    const [tab, setTab] = useState<Tab>("summary");
    const [reports, setReports] = useState<Report[]>([]);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [expandedReport, setExpandedReport] = useState<string | null>(null);

    // chat state
    const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string }>>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);

    // brand form
    const [brandOpen, setBrandOpen] = useState(false);
    const [brandForm, setBrandForm] = useState<Record<string, string>>({});
    const [brandSaving, setBrandSaving] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [scanUrl, setScanUrl] = useState("");
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState<{ pages: Array<{ url: string; title: string | null }> } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [r, rec] = await Promise.all([
                fetch("/api/seb/report").then((res) => res.json()),
                fetch("/api/seb/recommendations").then((res) => res.json()),
            ]);
            setReports(r.reports ?? []);
            setRecommendations(rec.recommendations ?? []);
        } catch {
            setError("Gagal memuat data Seb.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        loadKnowledge();
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

    async function generate() {
        setGenerating(true);
        setError(null);
        try {
            const data = await api("/api/seb/report", "POST");
            setReports([data.report, ...reports]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal membuat laporan.");
        } finally {
            setGenerating(false);
        }
    }

    async function openReport(id: string) {
        if (expandedReport === id) {
            setExpandedReport(null);
            return;
        }
        try {
            const data = await api(`/api/seb/report/${id}`, "GET");
            const full = data.report;
            setReports((prev) => prev.map((r) => (r.id === id ? { ...r, recommendations: full.recommendations } : r)));
            setExpandedReport(id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat detail laporan.");
        }
    }

    async function sendChat() {
        const message = chatInput.trim();
        if (!message || chatLoading) return;
        setChatLoading(true);
        setError(null);
        setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "USER", content: message }]);
        setChatInput("");
        try {
            const data = await api("/api/seb/chat", "POST", { message });
            setMessages((prev) => [...prev, { id: data.messageId, role: "ASSISTANT", content: data.answer }]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mengirim pesan.");
            setMessages((prev) => prev.slice(0, -1));
        } finally {
            setChatLoading(false);
        }
    }

    async function loadKnowledge() {
        try {
            const data = await api("/api/seb/brand-knowledge", "GET");
            setKnowledge(data.knowledge);
        } catch {
            setKnowledge(null);
        }
    }

    async function saveBrand() {
        setBrandSaving(true);
        setError(null);
        try {
            await api("/api/seb/brand-knowledge", "PUT", brandForm);
            setBrandOpen(false);
            loadKnowledge();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan brand knowledge.");
        } finally {
            setBrandSaving(false);
        }
    }

    async function runScan() {
        if (!scanUrl.trim() || scanning) return;
        setScanning(true);
        setError(null);
        setScanResult(null);
        try {
            const data = await api("/api/seb/brand-knowledge", "POST", { websiteUrl: scanUrl });
            setScanResult({ pages: data.pages ?? [] });
            setScanOpen(false);
            loadKnowledge();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memindai website.");
        } finally {
            setScanning(false);
        }
    }

    async function updateRecStatus(id: string, status: string) {
        try {
            await api("/api/seb/recommendations", "PATCH", { id, status });
            setRecommendations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal mengubah status.");
        }
    }

    const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
        { value: "summary", label: "Ringkasan", icon: <Sparkles className="h-4 w-4" /> },
        { value: "recommendations", label: "Rekomendasi", icon: <ListChecks className="h-4 w-4" /> },
        { value: "chat", label: "Chat Seb", icon: <MessageSquare className="h-4 w-4" /> },
        { value: "brand", label: "Brand knowledge", icon: <BookOpen className="h-4 w-4" /> },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Seb — asisten media sosial</h1>
                    <p className="text-sm text-muted-foreground">
                        Laporan coaching, rekomendasi, chat, dan brand knowledge. Membutuhkan OPENROUTER_API_KEY.
                    </p>
                </div>
                <Button size="sm" onClick={generate} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Buat laporan
                </Button>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}

            <div className="flex flex-wrap gap-1.5">
                {TABS.map((t) => (
                    <button
                        key={t.value}
                        onClick={() => setTab(t.value)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                            tab === t.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {t.icon}
                        {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="py-8 text-sm text-muted-foreground">Memuat…</p>
            ) : tab === "summary" ? (
                <div className="space-y-3">
                    {reports.length === 0 && (
                        <div className="rounded-lg border border-dashed border-border py-12 text-center">
                            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
                            <p className="mt-2 text-sm text-muted-foreground">
                                Belum ada laporan. Klik "Buat laporan" untuk meminta Seb meninjau konten dan analitik Anda.
                            </p>
                        </div>
                    )}
                    {reports.map((r) => (
                        <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-medium">{r.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(r.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        {" · "}
                                        {r.trigger === "MANUAL" ? "Manual" : r.trigger === "PROACTIVE" ? "Otomatis" : "Chat"}
                                        {" · "}
                                        confidence {Math.round(r.confidence * 100)}%
                                    </p>
                                </div>
                                {r.overallScore !== null && (
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 text-lg font-semibold">
                                        {r.overallScore}
                                    </div>
                                )}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{r.summary}</p>

                            {r.scoreBreakdown && Object.keys(r.scoreBreakdown).length > 0 && (
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {Object.entries(r.scoreBreakdown).map(([key, value]) => (
                                        <div key={key} className="rounded border border-border bg-muted/40 p-2">
                                            <p className="text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</p>
                                            <p className="text-sm font-semibold">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => openReport(r.id)}
                                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {expandedReport === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                Rekomendasi ({r.recommendations?.length ?? 0})
                            </button>

                            {expandedReport === r.id && (
                                <div className="mt-2 space-y-1.5">
                                    {(r.recommendations ?? []).map((rec) => (
                                        <div key={rec.id} className="rounded border border-border bg-muted/40 p-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium">{rec.title}</span>
                                                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_COLORS[rec.priority])}>
                                                    {rec.priority}
                                                </span>
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                    {CATEGORY_LABELS[rec.category] ?? rec.category}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : tab === "recommendations" ? (
                <div className="space-y-2">
                    {recommendations.length === 0 && <p className="text-sm text-muted-foreground">Belum ada rekomendasi. Buat laporan untuk mendapatkannya.</p>}
                    {recommendations.map((rec) => (
                        <div key={rec.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{rec.title}</span>
                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_COLORS[rec.priority])}>
                                        {rec.priority}
                                    </span>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                        {CATEGORY_LABELS[rec.category] ?? rec.category}
                                    </span>
                                    {rec.platform && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{rec.platform}</span>}
                                </div>
                                <select
                                    value={rec.status}
                                    onChange={(e) => updateRecStatus(rec.id, e.target.value)}
                                    className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs outline-none"
                                >
                                    <option value="NEW">Baru</option>
                                    <option value="IN_PROGRESS">Dikerjakan</option>
                                    <option value="COMPLETED">Selesai</option>
                                    <option value="DISMISSED">Dilewati</option>
                                </select>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{rec.advice}</p>
                            {rec.rationale && <p className="mt-1 text-xs text-muted-foreground">Alasan: {rec.rationale}</p>}
                        </div>
                    ))}
                </div>
            ) : tab === "chat" ? (
                <div className="flex flex-col gap-3">
                    <div className="flex h-[420px] flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-card p-3">
                        {messages.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                Tanyakan apa saja tentang konten dan strategi media sosial Anda.
                            </p>
                        )}
                        {messages.map((m) => (
                            <div key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
                                <div
                                    className={cn(
                                        "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                                        m.role === "USER" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"
                                    )}
                                >
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div className="flex justify-start">
                                <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Input
                            placeholder="mis. Apa saran untuk meningkatkan engagement Reels?"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendChat()}
                        />
                        <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                            Kirim
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Konteks brand membantu Seb memberi saran yang lebih spesifik dan sesuai.
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    setScanUrl(knowledge?.websiteUrl ?? "");
                                    setScanResult(null);
                                    setScanOpen(true);
                                }}
                                disabled={scanning}
                            >
                                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                Scan website
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    setBrandForm({
                                        websiteUrl: knowledge?.websiteUrl ?? "",
                                        audience: knowledge?.audience ?? "",
                                        positioning: knowledge?.positioning ?? "",
                                        products: knowledge?.products ?? "",
                                        offers: knowledge?.offers ?? "",
                                        voiceRules: knowledge?.voiceRules ?? "",
                                        bannedTopics: knowledge?.bannedTopics ?? "",
                                    });
                                    setBrandOpen(true);
                                }}
                            >
                                Edit
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-4">
                        {knowledge ? (
                            <div className="space-y-3">
                                <Field label="Website" value={knowledge.websiteUrl} />
                                <Field label="Audience" value={knowledge.audience} />
                                <Field label="Positioning" value={knowledge.positioning} />
                                <Field label="Produk" value={knowledge.products} />
                                <Field label="Penawaran" value={knowledge.offers} />
                                <Field label="Aturan suara (voice)" value={knowledge.voiceRules} />
                                <Field label="Topik yang dihindari" value={knowledge.bannedTopics} />

                                {knowledge.pendingInsights && (
                                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                                        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
                                            <Sparkles className="h-4 w-4" />
                                            Insight dari scan website
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                {Math.round(knowledge.pendingInsights.confidence * 100)}% yakin
                                            </span>
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {new Date(knowledge.pendingInsights.scannedAt).toLocaleString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                            {" · "}
                                            {knowledge.pendingInsights.pages.length} halaman
                                        </p>
                                        {knowledge.pendingInsights.crawlSummary && (
                                            <p className="mt-2 text-sm text-muted-foreground">{knowledge.pendingInsights.crawlSummary}</p>
                                        )}
                                        <div className="mt-2 space-y-1.5">
                                            <Field label="Audience" value={knowledge.pendingInsights.audience} />
                                            <Field label="Positioning" value={knowledge.pendingInsights.positioning} />
                                            <Field label="Produk" value={knowledge.pendingInsights.products} />
                                            <Field label="Penawaran" value={knowledge.pendingInsights.offers} />
                                            <Field label="Aturan suara (voice)" value={knowledge.pendingInsights.voiceRules} />
                                            <Field label="Topik yang dihindari" value={knowledge.pendingInsights.bannedTopics} />
                                            {knowledge.pendingInsights.learnedInsights.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-medium text-muted-foreground">Insight lain</p>
                                                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                                                        {knowledge.pendingInsights.learnedInsights.map((insight, index) => (
                                                            <li key={index}>{insight}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Insight ini belum di-approve. Salin ke field brand knowledge di atas jika ingin menggunakannya.
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Belum ada brand knowledge. Klik Edit untuk mengisinya.</p>
                        )}
                    </div>

                    <Dialog open={brandOpen} onClose={() => setBrandOpen(false)} title="Brand knowledge">
                        <div className="space-y-3">
                            {[
                                ["websiteUrl", "Website (URL)"],
                                ["audience", "Audience"],
                                ["positioning", "Positioning"],
                                ["products", "Produk & layanan"],
                                ["offers", "Penawaran / promo"],
                                ["voiceRules", "Aturan suara (voice)"],
                                ["bannedTopics", "Topik yang dihindari"],
                            ].map(([key, label]) => (
                                <div key={key}>
                                    <Label htmlFor={`bk-${key}`}>{label}</Label>
                                    <textarea
                                        id={`bk-${key}`}
                                        rows={2}
                                        value={brandForm[key] ?? ""}
                                        onChange={(e) => setBrandForm((prev) => ({ ...prev, [key]: e.target.value }))}
                                        className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                                    />
                                </div>
                            ))}
                            <div className="flex justify-end gap-2 pt-1">
                                <Button variant="ghost" size="sm" onClick={() => setBrandOpen(false)}>Batal</Button>
                                <Button size="sm" disabled={brandSaving} onClick={saveBrand}>
                                    {brandSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Simpan
                                </Button>
                            </div>
                        </div>
                    </Dialog>

                    <Dialog open={scanOpen} onClose={() => setScanOpen(false)} title="Scan website untuk brand knowledge">
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Seb akan membuka hingga 5 halaman situs Anda (beranda + halaman tentang/produk), mengekstrak konteks brand,
                                lalu menyimpannya sebagai insight yang belum di-approve.
                            </p>
                            <div>
                                <Label htmlFor="scan-url">URL website</Label>
                                <Input
                                    id="scan-url"
                                    placeholder="mis. https://toko-kamu.com"
                                    value={scanUrl}
                                    onChange={(e) => setScanUrl(e.target.value)}
                                />
                            </div>
                            {scanResult && (
                                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                                    <p className="text-sm font-medium text-primary">Scan selesai</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {scanResult.pages.map((page) => page.title || page.url).join(" · ")}
                                    </p>
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-1">
                                <Button variant="ghost" size="sm" onClick={() => setScanOpen(false)}>Tutup</Button>
                                <Button size="sm" disabled={scanning || !scanUrl.trim()} onClick={runScan}>
                                    {scanning && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {scanning ? "Memindai…" : "Mulai scan"}
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </div>
            )}
        </div>
    );
}

function Field({ label, value }: { label: string; value: string | null }) {
    return (
        <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-sm">{value || "—"}</p>
        </div>
    );
}