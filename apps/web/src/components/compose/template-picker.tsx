"use client";

import { useState, useEffect } from "react";
import { X, FileText, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CaptionTemplate {
    id: string;
    name: string;
    caption: string;
    category: string | null;
    hashtags: string[];
}

interface TemplatePickerProps {
    open: boolean;
    onClose: () => void;
    onSelect: (caption: string) => void;
}

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
    const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetch("/api/caption-templates")
            .then((r) => r.json())
            .then((data) => setTemplates(data.templates ?? []))
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, [open]);

    const filtered = search
        ? templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.caption.toLowerCase().includes(search.toLowerCase()))
        : templates;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative flex h-[70vh] w-[90vw] max-w-lg flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold">Template Caption</h2>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="border-b border-border px-4 py-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Cari template..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <FileText className="mb-2 h-8 w-8" />
                            <p className="text-sm">Belum ada template</p>
                            <p className="mt-1 text-xs">
                                Buat template di{" "}
                                <Link href="/dashboard/content-tools" onClick={onClose} className="text-primary underline hover:text-primary/80">
                                    Content Tools
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        const text = t.hashtags.length > 0
                                            ? `${t.caption}\n\n${t.hashtags.map((h) => `#${h}`).join(" ")}`
                                            : t.caption;
                                        onSelect(text);
                                        onClose();
                                    }}
                                    className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-sm font-medium truncate">{t.name}</p>
                                        {t.category && (
                                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t.category}</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{t.caption}</p>
                                    {t.hashtags.length > 0 && (
                                        <p className="mt-1 text-[10px] text-primary">
                                            {t.hashtags.slice(0, 5).map((h) => `#${h}`).join(" ")}
                                            {t.hashtags.length > 5 && ` +${t.hashtags.length - 5}`}
                                        </p>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
