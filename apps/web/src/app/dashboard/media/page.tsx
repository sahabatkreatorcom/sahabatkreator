"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { FolderPlus, ImagePlus, Search, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { StockMediaPicker } from "@/components/media/stock-media-picker";
import { cn } from "@/lib/utils";

interface MediaFolder {
    id: string;
    name: string;
    color: string;
    mediaCount: number;
    createdAt: string;
}

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string | null;
    type: "image" | "video" | "audio";
    mimeType: string;
    size: number;
    dimensions: { width: number; height: number } | null;
    duration: number | null;
    tags: string[];
    altText: string | null;
    folder: { id: string; name: string; color: string } | null;
    createdAt: string;
}

export default function MediaLibraryPage() {
    const [folders, setFolders] = useState<MediaFolder[]>([]);
    const [activeFolder, setActiveFolder] = useState<string | null>("root");
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [uploading, setUploading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [stockPickerOpen, setStockPickerOpen] = useState(false);
    const [newFolderOpen, setNewFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const loadFolders = useCallback(async () => {
        try {
            const res = await fetch("/api/media/folders");
            const data = await res.json();
            if (res.ok) setFolders(data.folders ?? []);
        } catch { /* ignore */ }
    }, []);

    const loadMedia = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (activeFolder === "root") params.set("folderId", "root");
            else if (activeFolder) params.set("folderId", activeFolder);
            if (search.trim()) params.set("search", search.trim());
            const res = await fetch(`/api/media?${params}`);
            const data = await res.json();
            if (res.ok) setMedia(data.media ?? []);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [activeFolder, search]);

    useEffect(() => {
        loadFolders();
    }, [loadFolders]);

    useEffect(() => {
        const t = setTimeout(loadMedia, search ? 250 : 0);
        return () => clearTimeout(t);
    }, [loadMedia, search]);

    async function handleFiles(files: FileList | File[]) {
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const fd = new FormData();
                fd.set("file", file);
                if (activeFolder && activeFolder !== "root") fd.set("folderId", activeFolder);
                await fetch("/api/media", { method: "POST", body: fd });
            }
            await Promise.all([loadMedia(), loadFolders()]);
        } finally {
            setUploading(false);
        }
    }

    async function handleDelete() {
        if (selected.size === 0) return;
        if (!confirm(`Hapus ${selected.size} media?`)) return;
        const res = await fetch("/api/media", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: Array.from(selected) }),
        });
        if (res.ok) {
            setSelected(new Set());
            await Promise.all([loadMedia(), loadFolders()]);
        }
    }

    async function handleCreateFolder() {
        const name = newFolderName.trim();
        if (!name) return;
        const res = await fetch("/api/media/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (res.ok) {
            setNewFolderOpen(false);
            setNewFolderName("");
            await loadFolders();
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Media library</h1>
                    <p className="text-sm text-muted-foreground">
                        Upload & kelola aset konten. Tersimpan di Cloudflare R2.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setStockPickerOpen(true)}
                    >
                        <Search className="h-4 w-4" />
                        Koleksi stok
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setNewFolderOpen(true)}>
                        <FolderPlus className="h-4 w-4" />
                        Folder
                    </Button>
                    <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
                        <UploadCloud className="h-4 w-4" />
                        Upload
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        accept="image/*,video/*,audio/*"
                        onChange={(e) => {
                            if (e.target.files?.length) handleFiles(e.target.files);
                            e.target.value = "";
                        }}
                    />
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-48">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari file…"
                        className="pl-8"
                    />
                </div>
                {selected.size > 0 && (
                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4" />
                        Hapus ({selected.size})
                    </Button>
                )}
            </div>

            <div className="flex gap-4">
                {/* Folder sidebar */}
                <aside className="w-44 shrink-0 space-y-1">
                    <button
                        onClick={() => setActiveFolder("root")}
                        className={cn(
                            "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm",
                            activeFolder === "root"
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-muted-foreground hover:bg-muted"
                        )}
                    >
                        <span>Semua file</span>
                        <span className="text-xs">{folders.reduce((s, f) => s + f.mediaCount, 0)}</span>
                    </button>
                    {folders.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setActiveFolder(f.id)}
                            className={cn(
                                "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm",
                                activeFolder === f.id
                                    ? "bg-primary/10 font-medium text-primary"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <span className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                                <span className="truncate">{f.name}</span>
                            </span>
                            <span className="text-xs">{f.mediaCount}</span>
                        </button>
                    ))}
                </aside>

                {/* Media grid */}
                <div className="flex-1">
                    {loading ? (
                        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
                            {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
                            ))}
                        </div>
                    ) : media.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
                            <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
                            <p className="text-sm font-medium">Belum ada media</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Upload file atau cari dari koleksi stok.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
                            {media.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    item={item}
                                    selected={selected.has(item.id)}
                                    onToggle={() => {
                                        setSelected((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(item.id)) next.delete(item.id);
                                            else next.add(item.id);
                                            return next;
                                        });
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <StockMediaPicker
                open={stockPickerOpen}
                onClose={() => setStockPickerOpen(false)}
                onImported={() => {
                    setStockPickerOpen(false);
                    loadMedia();
                    loadFolders();
                }}
                folderId={activeFolder && activeFolder !== "root" ? activeFolder : undefined}
            />

            <Dialog
                open={newFolderOpen}
                onClose={() => setNewFolderOpen(false)}
                title="Folder baru"
                description="Buat folder untuk mengelompokkan aset."
            >
                <form
                    className="space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateFolder();
                    }}
                >
                    <Input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Nama folder…"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" type="button" onClick={() => setNewFolderOpen(false)}>
                            Batal
                        </Button>
                        <Button size="sm" type="submit" disabled={!newFolderName.trim()}>
                            Buat
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaCard({
    item,
    selected,
    onToggle,
}: {
    item: MediaItem;
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            onClick={onToggle}
            className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left",
                selected ? "border-primary ring-2 ring-primary" : "border-border"
            )}
        >
            {item.type === "video" ? (
                <video src={item.thumbnailUrl ?? item.url} className="h-full w-full object-cover" muted preload="metadata" />
            ) : item.type === "audio" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-card p-2">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">Audio</span>
                    <span className="line-clamp-2 text-center text-[11px]">{item.filename}</span>
                </div>
            ) : (
                <img
                    src={item.thumbnailUrl ?? item.url}
                    alt={item.altText ?? item.filename}
                    loading="lazy"
                    className="h-full w-full object-cover"
                />
            )}
            {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    ✓
                </span>
            )}
            <span className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-medium text-white">
                {item.filename}
            </span>
            <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">
                {formatBytes(item.size)}
            </span>
        </button>
    );
}