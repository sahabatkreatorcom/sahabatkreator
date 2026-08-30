"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Upload, Search, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function MediaUploadModal({ open, onClose, onSelect }: MediaUploadModalProps) {
    const [tab, setTab] = useState<"upload" | "library">("library");
    const [libraryItems, setLibraryItems] = useState<LibraryMedia[]>([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && tab === "library") loadLibrary();
    }, [open, tab]);

    const loadLibrary = async () => {
        setLoadingLibrary(true);
        try {
            const res = await fetch(`/api/media?limit=100${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`);
            const data = await res.json();
            if (res.ok) setLibraryItems(data.media ?? []);
        } catch { /* ignore */ }
        setLoadingLibrary(false);
    };

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
                    <button
                        onClick={() => setTab("library")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "library" ? "bg-muted" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        Pustaka
                    </button>
                    <button
                        onClick={() => setTab("upload")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === "upload" ? "bg-muted" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        Upload
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {tab === "library" && (
                        <>
                            <div className="relative mb-3">
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
                                    {filteredLibrary.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                onSelect([{ id: item.id, url: item.url, thumbnailUrl: item.thumbnailUrl ?? undefined, type: item.type, size: 0 }]);
                                                onClose();
                                            }}
                                            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                                        >
                                            {item.type === "video" ? (
                                                <video src={item.url} poster={item.thumbnailUrl ?? undefined} className="h-full w-full object-cover" muted preload="metadata" />
                                            ) : item.type === "audio" ? (
                                                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">Audio</div>
                                            ) : (
                                                <img src={item.thumbnailUrl ?? item.url} alt={item.filename} loading="lazy" className="h-full w-full object-cover" />
                                            )}
                                        </button>
                                    ))}
                                </div>
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
