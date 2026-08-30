"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Upload, Search, Loader2, Image as ImageIcon, Trash2, CheckSquare, Square, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaFileUrl } from "@/lib/media-file-url";

interface MediaUploadModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (media: Array<{ id: string; url: string; thumbnailUrl?: string; type: string; size: number }>) => void;
}

interface LibraryMedia {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    type: "image" | "video" | "audio";
    filename: string;
}

interface StockResult {
    id: string;
    source: string;
    thumbUrl: string;
    previewUrl: string;
    fullUrl: string;
    width: number;
    height: number;
    author: string;
    description: string;
    mimeType: string;
    videoUrl?: string;
}

type Tab = "library" | "upload" | "stock";
type StockSource = "PIXABAY" | "PEXELS" | "UNSPLASH";

const STOCK_SOURCES: { id: StockSource; label: string }[] = [
    { id: "PIXABAY", label: "Pixabay" },
    { id: "PEXELS", label: "Pexels" },
    { id: "UNSPLASH", label: "Unsplash" },
];

export function MediaUploadModal({ open, onClose, onSelect }: MediaUploadModalProps) {
    const [tab, setTab] = useState<Tab>("library");
    const [libraryItems, setLibraryItems] = useState<LibraryMedia[]>([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [stockSource, setStockSource] = useState<StockSource>("PEXELS");
    const [stockQuery, setStockQuery] = useState("");
    const [stockResults, setStockResults] = useState<StockResult[]>([]);
    const [loadingStock, setLoadingStock] = useState(false);
    const [importingStock, setImportingStock] = useState<string | null>(null);
    const [stockPage, setStockPage] = useState(1);
    const [stockHasMore, setStockHasMore] = useState(false);
    const [stockError, setStockError] = useState<string | null>(null);
    const stockKey = useRef(0);

    useEffect(() => {
        if (open && tab === "library") loadLibrary();
    }, [open, tab]);

    const loadLibrary = async () => {
        setLoadingLibrary(true);
        try {
            const res = await fetch(`/api/media?limit=100${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
            const data = await res.json();
            if (res.ok) setLibraryItems(data.media ?? []);
        } catch { /* ignore */ }
        setLoadingLibrary(false);
    };

    const toggleSelectItem = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        setDeleting(true);
        try {
            const res = await fetch("/api/media", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [...selectedIds] }),
            });
            if (res.ok) {
                setLibraryItems((prev) => prev.filter((m) => !selectedIds.has(m.id)));
                setSelectedIds(new Set());
                setSelectMode(false);
            }
        } catch { /* ignore */ }
        setDeleting(false);
    };

    const selectAll = () => {
        const allIds = filteredLibrary.map((m) => m.id);
        setSelectedIds((prev) => {
            if (prev.size === allIds.length) return new Set();
            return new Set(allIds);
        });
    };

    const searchStock = useCallback(async (q: string, p: number) => {
        const key = ++stockKey.current;
        setLoadingStock(true);
        setStockError(null);
        try {
            const params = new URLSearchParams({ source: stockSource, q, page: String(p), perPage: "24" });
            const res = await fetch(`/api/stock-media/search?${params}`);
            const data = await res.json();
            if (key !== stockKey.current) return;
            if (!res.ok) {
                setStockError(data.error || "Gagal mencari.");
                setStockResults([]);
                setStockHasMore(false);
                return;
            }
            setStockResults((prev) => (p === 1 ? data.results : [...prev, ...data.results]));
            setStockHasMore(Boolean(data.hasMore));
        } catch {
            if (key === stockKey.current) {
                setStockError("Gagal terhubung ke server.");
                setStockResults([]);
                setStockHasMore(false);
            }
        } finally {
            if (key === stockKey.current) setLoadingStock(false);
        }
    }, [stockSource]);

    useEffect(() => {
        if (tab !== "stock" || !open) return;
        setStockPage(1);
        setStockResults([]);
        setStockError(null);
        searchStock(stockQuery.trim() || "indonesia", 1);
    }, [tab, open, stockSource, searchStock]);

    async function handleImportStock(item: StockResult) {
        setImportingStock(item.id);
        setStockError(null);
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
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setStockError(data.error || "Gagal mengimpor.");
                return;
            }
            onSelect([{
                id: data.mediaId,
                url: data.url,
                thumbnailUrl: data.thumbnailUrl,
                type: item.mimeType.startsWith("video/") ? "video" : "image",
                size: 0,
            }]);
            onClose();
        } catch {
            setStockError("Gagal mengimpor.");
        } finally {
            setImportingStock(null);
        }
    }

    const handleUpload = useCallback(async (files: FileList | File[]) => {
        const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
        if (fileArray.length === 0) return;

        setUploading(true);
        setUploadProgress(0);
        try {
            const results = await Promise.all(
                fileArray.map(async (file, idx) => {
                    const fd = new FormData();
                    fd.set("file", file);
                    const res = await fetch("/api/media", { method: "POST", body: fd });
                    if (!res.ok) throw new Error("Upload gagal");
                    const data = await res.json();
                    setUploadProgress(((idx + 1) / fileArray.length) * 100);
                    return { id: data.id, url: data.url, thumbnailUrl: data.thumbnailUrl, type: data.type, size: data.size };
                }),
            );
            onSelect(results);
            onClose();
        } catch {
            // ignore
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    }, [onSelect, onClose]);

    const filteredLibrary = searchQuery
        ? libraryItems.filter((m) => m.filename.toLowerCase().includes(searchQuery.toLowerCase()))
        : libraryItems;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative flex h-[80vh] w-[90vw] max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold">Media</h2>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex gap-1 border-b border-border px-4 py-2">
                    {([["library", "Pustaka"], ["stock", "Stok"], ["upload", "Upload"]] as const).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === key ? "bg-muted" : "text-muted-foreground hover:bg-muted/50"}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {tab === "library" && (
                        <>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Cari media..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && loadLibrary()}
                                        className="h-9 w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                </div>
                                <Button
                                    variant={selectMode ? "primary" : "secondary"}
                                    size="sm"
                                    onClick={() => {
                                        setSelectMode(!selectMode);
                                        setSelectedIds(new Set());
                                    }}
                                >
                                    {selectMode ? <CheckSquare className="mr-1 h-3.5 w-3.5" /> : <Square className="mr-1 h-3.5 w-3.5" />}
                                    {selectMode ? "Batal" : "Pilih"}
                                </Button>
                            </div>

                            {selectMode && selectedIds.size > 0 && (
                                <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 mb-3">
                                    <p className="text-xs font-medium">{selectedIds.size} dipilih</p>
                                    <div className="flex gap-2">
                                        <Button variant="secondary" size="sm" onClick={selectAll}>
                                            {selectedIds.size === filteredLibrary.length ? "Batal Pilih" : "Pilih Semua"}
                                        </Button>
                                        <Button variant="destructive" size="sm" loading={deleting} onClick={deleteSelected}>
                                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Hapus
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {loadingLibrary ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredLibrary.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <ImageIcon className="mb-2 h-8 w-8" />
                                    <p className="text-sm">Belum ada media</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2">
                                    {filteredLibrary.map((item) => {
                                        const isSelected = selectedIds.has(item.id);
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    if (selectMode) {
                                                        toggleSelectItem(item.id);
                                                    } else {
                                                        onSelect([{ id: item.id, url: item.url, thumbnailUrl: item.thumbnailUrl ?? undefined, type: item.type, size: 0 }]);
                                                        onClose();
                                                    }
                                                }}
                                                className={`group relative aspect-square overflow-hidden rounded-lg border bg-muted ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
                                            >
                                                {item.type === "video" ? (
                                                    <video src={mediaFileUrl(item.url)} poster={mediaFileUrl(item.thumbnailUrl)} className="h-full w-full object-cover" muted preload="metadata" />
                                                ) : item.type === "audio" ? (
                                                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">Audio</div>
                                                ) : (
                                                    <img src={mediaFileUrl(item.thumbnailUrl ?? item.url)} alt={item.filename} loading="lazy" className="h-full w-full object-cover" />
                                                )}
                                                {selectMode && (
                                                    <span className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary text-white" : "border-white/60 bg-black/30 text-white"}`}>
                                                        {isSelected ? <Check className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {tab === "stock" && (
                        <>
                            <div className="flex gap-1.5 mb-3">
                                {STOCK_SOURCES.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => { setStockSource(s.id); setStockQuery(""); }}
                                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${stockSource === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            <form
                                className="flex gap-2 mb-3"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    setStockPage(1);
                                    searchStock(stockQuery.trim() || "indonesia", 1);
                                }}
                            >
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Cari mis. makanan, pantai…"
                                        value={stockQuery}
                                        onChange={(e) => setStockQuery(e.target.value)}
                                        className="h-9 w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                </div>
                                <Button type="submit" size="sm" loading={loadingStock}>
                                    Cari
                                </Button>
                            </form>

                            {stockError && (
                                <p className="mb-2 rounded-md bg-accent-red/10 px-3 py-2 text-xs text-accent-red">{stockError}</p>
                            )}

                            <div className="grid grid-cols-4 gap-2">
                                {stockResults.map((item) => (
                                    <button
                                        key={`${item.source}-${item.id}`}
                                        onClick={() => handleImportStock(item)}
                                        disabled={importingStock !== null}
                                        className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                                    >
                                        <img
                                            src={item.thumbUrl}
                                            alt={item.description || item.author}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition-opacity group-hover:opacity-70"
                                        />
                                        {importingStock === item.id && (
                                            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                <Loader2 className="h-5 w-5 animate-spin text-white" />
                                            </span>
                                        )}
                                        <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left">
                                            <span className="line-clamp-1 text-[10px] font-medium text-white">{item.author}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {loadingStock && stockResults.length === 0 && (
                                <div className="grid grid-cols-4 gap-2 mt-0">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
                                    ))}
                                </div>
                            )}

                            {!loadingStock && stockResults.length === 0 && !stockError && (
                                <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada hasil.</p>
                            )}

                            {stockHasMore && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="mt-3 w-full"
                                    loading={loadingStock}
                                    onClick={() => {
                                        const next = stockPage + 1;
                                        setStockPage(next);
                                        searchStock(stockQuery.trim() || "indonesia", next);
                                    }}
                                >
                                    Muat lebih banyak
                                </Button>
                            )}
                        </>
                    )}

                    {tab === "upload" && (
                        <div className="flex flex-col items-center justify-center">
                            {uploading ? (
                                <div className="text-center">
                                    <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground">Mengunggah... {Math.round(uploadProgress)}%</p>
                                    <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                                        <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
                                >
                                    <Upload className="mb-3 h-8 w-8" />
                                    <p className="text-sm font-medium">Klik untuk upload</p>
                                    <p className="mt-1 text-xs">atau drag & drop file</p>
                                    <p className="mt-2 text-[10px]">JPEG, PNG, WebP, GIF, MP4 (maks 100MB)</p>
                                </button>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files?.length) handleUpload(e.target.files);
                                    e.target.value = "";
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
