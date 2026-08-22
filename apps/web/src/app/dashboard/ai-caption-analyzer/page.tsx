"use client";

import * as React from "react";
import { useState } from "react";
import {
    Brain,
    ChevronDown,
    ChevronUp,
    Copy,
    FileText,
    Hash,
    Loader2,
    Megaphone,
    MessageSquare,
    RefreshCw,
    Sparkles,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = [
    { id: "professional", label: "Profesional", desc: "Formal & berwibawa" },
    { id: "casual", label: "Santai", desc: "Akrab & friendly" },
    { id: "humorous", label: "Humoris", desc: "Lucu & menghibur" },
    { id: "inspirational", label: "Inspiratif", desc: "Memotivasi & membangkitkan" },
    { id: "educational", label: "Edukatif", desc: "Informatif & jelas" },
    { id: "urgent", label: "Urgent", desc: " Mendesak & calls-to-action" },
];

const PLATFORMS = [
    { id: "instagram", label: "Instagram", icon: "📷" },
    { id: "tiktok", label: "TikTok", icon: "🎵" },
    { id: "facebook", label: "Facebook", icon: "📘" },
    { id: "linkedin", label: "LinkedIn", icon: "💼" },
    { id: "twitter", label: "Twitter/X", icon: "🐦" },
    { id: "youtube", label: "YouTube", icon: "🎬" },
];

interface AnalysisResult {
    caption: string;
    hashtags: string[];
    hooks: string[];
    ctas: string[];
    scores: {
        engagement: number;
        clarity: number;
        emotional: number;
        seo: number;
    };
    suggestions: string[];
    characterCount: number;
}

export default function AiCaptionAnalyzerPage() {
    const [input, setInput] = useState("");
    const [tone, setTone] = useState("professional");
    const [platform, setPlatform] = useState("instagram");
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);

    async function analyze() {
        if (!input.trim()) return;
        setAnalyzing(true);
        setError(null);
        setResult(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/ai/caption-analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: input.trim(), tone, platform }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Analisis gagal.");
            setResult(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
        } finally {
            setAnalyzing(false);
        }
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    function handleSubmit() {
        const words = input.trim().split(/\s+/);
        if (words.length < 5) {
            setError("Masukkan minimal 5 kata untuk analisis yang baik.");
            return;
        }
        analyze();
    }

    function getScoreColor(score: number): string {
        if (score >= 80) return "text-emerald-600";
        if (score >= 60) return "text-green-600";
        if (score >= 40) return "text-amber-600";
        return "text-red-600";
    }

    function getScoreBg(score: number): string {
        if (score >= 80) return "bg-emerald-100 dark:bg-emerald-900/30";
        if (score >= 60) return "bg-green-100 dark:bg-green-900/30";
        if (score >= 40) return "bg-amber-100 dark:bg-amber-900/30";
        return "bg-red-100 dark:bg-red-900/30";
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">AI Caption Analyzer</h1>
                    <p className="text-sm text-muted-foreground">
                        Analisis caption media sosial Anda dengan AI. Dapatkan perbaikan, hashtag, hook, dan CTA.
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                    <Brain className="h-3.5 w-3.5" />
                    Powered by AI
                </div>
            </div>

            {/* Input section */}
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-3">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium">
                            Caption atau Konten
                            <span className="ml-1 text-xs text-muted-foreground">(masukkan teks yang ingin dianalisis)</span>
                        </label>
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Contoh: Hari ini saya mau sharing tips produktivitas buat kalian yang working from home..."
                            className="min-h-[160px] resize-none"
                            onKeyDown={(e) => e.key === "Enter" && e.ctrlKey && analyze()}
                        />
                        <div className="mt-1.5 text-right text-xs text-muted-foreground">
                            {input.trim().split(/\s+/).filter(Boolean).length} kata
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSubmit} disabled={analyzing || !input.trim()}>
                            {analyzing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4" />
                            )}
                            Analisis Sekarang
                        </Button>
                        {input && (
                            <Button variant="outline" onClick={() => { setInput(""); setResult(null); }}>
                                <RefreshCw className="h-4 w-4" />
                                Reset
                            </Button>
                        )}
                    </div>

                    {error && <p className="text-sm text-accent-red">{error}</p>}
                </div>

                {/* Options */}
                <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium">Nada (Tone)</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {TONES.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTone(t.id)}
                                    className={cn(
                                        "rounded-md border p-2 text-left transition-colors",
                                        tone === t.id
                                            ? "border-primary bg-primary/10"
                                            : "border-border hover:bg-muted"
                                    )}
                                >
                                    <p className={cn("text-xs font-medium", tone === t.id ? "text-primary" : "")}>{t.label}</p>
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">{t.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium">Platform</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {PLATFORMS.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setPlatform(p.id)}
                                    className={cn(
                                        "rounded-md border p-2 text-center transition-colors",
                                        platform === p.id
                                            ? "border-primary bg-primary/10"
                                            : "border-border hover:bg-muted"
                                    )}
                                >
                                    <span className="text-lg">{p.icon}</span>
                                    <p className={cn("mt-1 text-[10px] font-medium", platform === p.id ? "text-primary" : "text-muted-foreground")}>
                                        {p.label}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Results */}
            {analyzing && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Menganalisis caption Anda...</p>
                    <p className="text-xs text-muted-foreground">AI sedang membaca, scoring, dan memberikan saran.</p>
                </div>
            )}

            {result && !analyzing && (
                <>
                    {/* Overall Score */}
                    <div className="grid gap-3 sm:grid-cols-4">
                        <div className={cn("rounded-lg border border-border bg-card p-4 text-center", getScoreBg(result.scores.engagement))}>
                            <p className="text-xs text-muted-foreground">Engagement Score</p>
                            <p className={cn("mt-1 text-3xl font-bold", getScoreColor(result.scores.engagement))}>
                                {result.scores.engagement}
                            </p>
                            <div className="mt-2 h-1.5 rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all"
                                    style={{ width: `${result.scores.engagement}%` }}
                                />
                            </div>
                        </div>
                        <div className={cn("rounded-lg border border-border bg-card p-4 text-center", getScoreBg(result.scores.clarity))}>
                            <p className="text-xs text-muted-foreground">Keterbacaan</p>
                            <p className={cn("mt-1 text-3xl font-bold", getScoreColor(result.scores.clarity))}>
                                {result.scores.clarity}
                            </p>
                            <div className="mt-2 h-1.5 rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-green-500 transition-all"
                                    style={{ width: `${result.scores.clarity}%` }}
                                />
                            </div>
                        </div>
                        <div className={cn("rounded-lg border border-border bg-card p-4 text-center", getScoreBg(result.scores.emotional))}>
                            <p className="text-xs text-muted-foreground">Emosional</p>
                            <p className={cn("mt-1 text-3xl font-bold", getScoreColor(result.scores.emotional))}>
                                {result.scores.emotional}
                            </p>
                            <div className="mt-2 h-1.5 rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-amber-500 transition-all"
                                    style={{ width: `${result.scores.emotional}%` }}
                                />
                            </div>
                        </div>
                        <div className={cn("rounded-lg border border-border bg-card p-4 text-center", getScoreBg(result.scores.seo))}>
                            <p className="text-xs text-muted-foreground">SEO</p>
                            <p className={cn("mt-1 text-3xl font-bold", getScoreColor(result.scores.seo))}>
                                {result.scores.seo}
                            </p>
                            <div className="mt-2 h-1.5 rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-blue-500 transition-all"
                                    style={{ width: `${result.scores.seo}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Improved Caption */}
                    <div className="rounded-lg border border-border bg-card">
                        <div className="flex items-center justify-between border-b border-border p-4">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-primary" />
                                <h2 className="text-sm font-semibold">Caption yang Disempurnakan</h2>
                                <Badge variant="secondary" className="text-xs">{result.characterCount} karakter</Badge>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.caption)}>
                                <Copy className="h-3.5 w-3.5" />
                                Salin
                            </Button>
                        </div>
                        <div className="p-4">
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.caption}</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-border px-4 py-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Apakah AI menganalisis dengan benar?</span>
                            </div>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-7 text-xs", feedback === "positive" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30")}
                                    onClick={() => setFeedback(feedback === "positive" ? null : "positive")}
                                >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-7 text-xs", feedback === "negative" && "bg-red-100 text-red-700 dark:bg-red-900/30")}
                                    onClick={() => setFeedback(feedback === "negative" ? null : "negative")}
                                >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Hashtags */}
                    {result.hashtags.length > 0 && (
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Hash className="h-4 w-4 text-primary" />
                                <h2 className="text-sm font-semibold">Hashtag yang Direkomendasikan</h2>
                                <Badge variant="secondary" className="text-xs">{result.hashtags.length} hashtag</Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {result.hashtags.map((tag, i) => (
                                    <button
                                        key={i}
                                        onClick={() => copyToClipboard(tag)}
                                        className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium hover:border-primary hover:bg-primary/10 transition-colors"
                                        title="Klik untuk salin"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                            <Button variant="outline" size="sm" className="mt-3" onClick={() => copyToClipboard(result.hashtags.join(" "))}>
                                <Copy className="h-3.5 w-3.5" />
                                Salin Semua
                            </Button>
                        </div>
                    )}

                    {/* Hooks */}
                    {result.hooks.length > 0 && (
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Megaphone className="h-4 w-4 text-primary" />
                                <h2 className="text-sm font-semibold">Hook (Pembuka) Alternatif</h2>
                            </div>
                            <div className="space-y-2">
                                {result.hooks.map((hook, i) => (
                                    <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                                        <span className="text-xs font-medium text-muted-foreground w-6">#{i + 1}</span>
                                        <p className="flex-1 text-sm">{hook}</p>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(hook)}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* CTAs */}
                    {result.ctas.length > 0 && (
                        <div className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <FileText className="h-4 w-4 text-primary" />
                                <h2 className="text-sm font-semibold">CTA (Call-to-Action) yang Disarankan</h2>
                            </div>
                            <div className="space-y-2">
                                {result.ctas.map((cta, i) => (
                                    <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">CTA</span>
                                        <p className="flex-1 text-sm">{cta}</p>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(cta)}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Suggestions */}
                    {result.suggestions.length > 0 && (
                        <div className="rounded-lg border border-border bg-card p-4">
                            <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Saran Perbaikan
                            </h2>
                            <div className="space-y-2">
                                {result.suggestions.map((suggestion, i) => (
                                    <div key={i} className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
                                        <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                        <p className="text-sm">{suggestion}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={analyze}>
                            <RefreshCw className="h-4 w-4" />
                            Analisis Ulang
                        </Button>
                        <Button variant="outline" onClick={() => copyToClipboard(result.caption)}>
                            <Copy className="h-4 w-4" />
                            Salin Caption
                        </Button>
                        <Button variant="outline" onClick={() => {
                            const allText = result.caption + "\n\n" + result.hashtags.join(" ");
                            copyToClipboard(allText);
                        }}>
                            <Copy className="h-4 w-4" />
                            Salin Caption + Hashtag
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
