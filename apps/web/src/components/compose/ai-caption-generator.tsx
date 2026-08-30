"use client";

import { useState, useCallback } from "react";
import { X, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Platform, PLATFORM_LABELS } from "@/lib/platform-config";

interface AICaptionGeneratorProps {
    onSelect: (caption: string) => void;
    platform: Platform;
    currentDraft: string;
}

interface GeneratedCaption {
    caption: string;
    score?: number;
}

export function AICaptionGenerator({ onSelect, platform, currentDraft }: AICaptionGeneratorProps) {
    const [mode, setMode] = useState<"improve" | "generate">("improve");
    const [prompt, setPrompt] = useState("");
    const [results, setResults] = useState<GeneratedCaption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generate = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResults([]);
        try {
            const body = mode === "improve"
                ? { action: "improve", draft: currentDraft, platform }
                : { action: "generate", prompt, platform };

            const res = await fetch("/api/ai/caption-analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal generate caption");

            if (data.captions && Array.isArray(data.captions)) {
                setResults(data.captions.map((c: string) => ({ caption: c })));
            } else if (data.suggestions && Array.isArray(data.suggestions)) {
                setResults(data.suggestions.map((s: string) => ({ caption: s })));
            } else if (data.caption) {
                setResults([{ caption: data.caption, score: data.score }]);
            } else {
                setResults([{ caption: data.result || data.text || JSON.stringify(data) }]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal generate caption");
        } finally {
            setLoading(false);
        }
    }, [mode, currentDraft, prompt, platform]);

    return (
        <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">AI Caption Assistant</h3>
                </div>
            </div>

            <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
                <button
                    onClick={() => setMode("improve")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "improve" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                    Perbaiki draft
                </button>
                <button
                    onClick={() => setMode("generate")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "generate" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                    Buat baru
                </button>
            </div>

            {mode === "improve" ? (
                <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Draft saat ini:</p>
                    <p className="text-sm line-clamp-3">{currentDraft || "(kosong)"}</p>
                </div>
            ) : (
                <div className="mb-4">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Deskripsikan konten yang ingin dibuat... mis. Post tentang tips produktivitas untuk pebisnis muda"
                        rows={3}
                        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            )}

            <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Target: {PLATFORM_LABELS[platform]}</span>
            </div>

            {error && <p className="mb-3 text-sm text-accent-red">{error}</p>}

            <Button onClick={generate} disabled={loading || (mode === "generate" && !prompt.trim())} className="w-full" loading={loading}>
                {!loading && <Sparkles className="mr-2 h-4 w-4" />}
                {loading ? "Generating..." : mode === "improve" ? "Perbaiki Draft" : "Generate Caption"}
            </Button>

            {results.length > 0 && (
                <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Hasil:</p>
                    {results.map((r, i) => (
                        <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="text-sm whitespace-pre-wrap mb-2">{r.caption}</p>
                            <div className="flex items-center justify-between">
                                {r.score !== undefined && (
                                    <span className="text-xs text-muted-foreground">Skor: {r.score}/100</span>
                                )}
                                <Button size="sm" variant="secondary" onClick={() => onSelect(r.caption)}>
                                    Gunakan
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
