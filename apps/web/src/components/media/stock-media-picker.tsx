"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type StockSource = "PIXABAY" | "PEXELS" | "UNSPLASH";

interface StockMediaResult {
    id: string;
    source: StockSource;
    thumbUrl: string;
    previewUrl: string;
    fullUrl: string;
    width: number;
    height: number;
    author: string;
    description: string;
    pageUrl: string;
    videoUrl?: string;
    mimeType: string;
}

const SOURCES: { id: StockSource; label: string }[] = [
    { id: "PIXABAY", label: "Pixabay" },
    { id: "PEXELS", label: "Pexels" },
    { id: "UNSPLASH", label: "Unsplash" },
];

const DEFAULT_QUERY = "indonesia";

interface StockMediaPickerProps {
    open: boolean;
    onClose: () => void;
    /** Dipanggil setelah media berhasil diimpor ke media library. */
    onImported: (mediaId: string) => void;
    folderId?: string;
}

export function StockMediaPicker({ open, onClose, onImported, folderId }: StockMediaPickerProps) {
    const [source, setSource] = useState<StockSource>("PEXELS");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [results, setResults] = useState<StockMediaResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const searchKey = useRef(0);

    const doSearch = useCallback(
        async (q: string, p: number) => {
            const key = ++searchKey.current;
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({ source, q, page: String(p), perPage: "24" });
                const res = await fetch(`/api/stock-media/search?${params}`);
                const data = await res.json();
                if (key !== searchKey.current) return; // response basi
                if (!res.ok) {
                    setError(data.error || "Gagal mencari media.");
                    setResults([]);
                    setHasMore(false);
                    return;
                }
                setResults((prev) => (p === 1 ? data.results : [...prev, ...data.results]));
                setHasMore(Boolean(data.hasMore));
            } catch {
                if (key === searchKey.current) {
                    setError("Gagal terhubung ke server.");
                    setResults([]);
                    setHasMore(false);
                }
            } finally {
                if (key === searchKey.current) setLoading(false);
            }
        },
        [source]
    );

    useEffect(() => {
        if (!open) return;
        setPage(1);
        setResults([]);
        setError(null);
        doSearch(query.trim() || DEFAULT_QUERY, 1);
    }, [open, source, doSearch]);

    async function handleImport(item: StockMediaResult) {
        setImporting(item.id);
        setError(null);
        try {
            const res = await fetch("/api/stock-media/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: item.source,
                    sourceId: item.id,
                    sourceUrl: item.fullUrl,
                    thumbUrl: item.thumbUrl,
                    description: item.description,
                    mimeType: item.mimeType,
                    folderId,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal mengimpor media.");
                return;
            }
            onImported(data.mediaId);
        } catch {
            setError("Gagal mengimpor media.");
        } finally {
            setImporting(null);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Koleksi media stok"
            description="Cari & impor foto dari Pixabay, Pexels, atau Unsplash langsung ke media library."
        >
            <div className="space-y-3">
                {/* Tab source */}
                <div className="flex gap-1.5">
                    {SOURCES.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => {
                                setSource(s.id);
                                setQuery("");
                            }}
                            className={cn(
                                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                                source === s.id
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setPage(1);
                        doSearch(query.trim() || DEFAULT_QUERY, 1);
                    }}
                >
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Cari mis. makanan, pantai, fashion…"
                            className="pl-8"
                        />
                    </div>
                    <Button type="submit" size="sm" loading={loading}>
                        Cari
                    </Button>
                </form>

                {error && (
                    <p className="rounded-md bg-accent-red/10 px-3 py-2 text-xs text-accent-red">{error}</p>
                )}

                {/* Grid */}
                <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1">
                    {results.map((item) => (
                        <button
                            key={`${item.source}-${item.id}`}
                            onClick={() => handleImport(item)}
                            disabled={importing !== null}
                            className={cn(
                                "group relative aspect-square overflow-hidden rounded-md border border-border bg-muted",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            )}
                        >
                            <img
                                src={item.thumbUrl}
                                alt={item.description || item.author}
                                loading="lazy"
                                className="h-full w-full object-cover transition-opacity group-hover:opacity-70"
                            />
                            {importing === item.id && (
                                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                </span>
                            )}
                            <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left">
                                <span className="line-clamp-1 text-[10px] font-medium text-white">
                                    {item.author}
                                </span>
                            </span>
                        </button>
                    ))}
                    {loading && results.length === 0 && (
                        <div className="col-span-3 space-y-2 py-6">
                            <div className="h-28 animate-pulse rounded-md bg-muted" />
                            <div className="h-28 animate-pulse rounded-md bg-muted" />
                        </div>
                    )}
                    {!loading && results.length === 0 && !error && (
                        <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                            Tidak ada hasil.
                        </p>
                    )}
                </div>

                {hasMore && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        loading={loading}
                        onClick={() => {
                            const next = page + 1;
                            setPage(next);
                            doSearch(query.trim() || DEFAULT_QUERY, next);
                        }}
                    >
                        Muat lebih banyak
                    </Button>
                )}
            </div>
        </Dialog>
    );
}