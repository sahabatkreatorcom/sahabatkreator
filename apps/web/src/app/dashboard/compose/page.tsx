"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ImagePlus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { StockMediaPicker } from "@/components/media/stock-media-picker";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface Account {
    id: string;
    platform: Platform;
    name: string;
    username: string | null;
    avatar: string | null;
}

interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    type: "image" | "video" | "audio";
}

interface MediaLibraryItem extends MediaItem {
    filename: string;
}

export default function ComposePage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState("");
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [scheduledAt, setScheduledAt] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const [stockPickerOpen, setStockPickerOpen] = useState(false);
    const [libraryMedia, setLibraryMedia] = useState<MediaLibraryItem[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);

    const loadAccounts = useCallback(async () => {
        setLoadingAccounts(true);
        try {
            const res = await fetch("/api/accounts");
            const data = await res.json();
            if (res.ok) setAccounts(data.accounts ?? []);
            else setError(data.error || "Gagal memuat akun.");
        } finally {
            setLoadingAccounts(false);
        }
    }, []);

    const loadLibrary = useCallback(async () => {
        try {
            const res = await fetch("/api/media?limit=100");
            const data = await res.json();
            if (res.ok) setLibraryMedia(data.media ?? []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        loadAccounts();
        loadLibrary();
    }, [loadAccounts, loadLibrary]);

    async function handleSave(action: "draft" | "schedule") {
        if (selectedAccountIds.length === 0) {
            setError("Pilih minimal satu akun.");
            return;
        }
        if (action === "schedule" && !scheduledAt) {
            setError("Pilih waktu jadwal.");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    caption,
                    platformAccountIds: selectedAccountIds,
                    mediaIds: media.map((m) => m.id),
                    scheduledAt: action === "schedule" ? new Date(scheduledAt).toISOString() : null,
                    autoPublish: action === "schedule",
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal menyimpan post.");
                return;
            }
            setSuccess(action === "schedule" ? "Post dijadwalkan." : "Draft disimpan.");
            setCaption("");
            setMedia([]);
            setScheduledAt("");
        } catch {
            setError("Gagal menyimpan post.");
        } finally {
            setSaving(false);
        }
    }

    const charCount = caption.length;

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <div>
                <h1 className="text-lg font-semibold">Buat konten baru</h1>
                <p className="text-sm text-muted-foreground">Tulis caption, pilih media, lalu jadwalkan atau terbitkan.</p>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}
            {success && <p className="rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">{success}</p>}

            {/* Account picker */}
            <div className="rounded-lg border border-border bg-card p-4">
                <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Akun tujuan</p>
                {loadingAccounts ? (
                    <p className="text-sm text-muted-foreground">Memuat akun…</p>
                ) : accounts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                        Belum ada akun terhubung.{" "}
                        <a href="/dashboard/settings/connections" className="font-medium text-primary hover:underline">
                            Hubungkan akun
                        </a>
                        .
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {accounts.map((account) => {
                            const selected = selectedAccountIds.includes(account.id);
                            return (
                                <button
                                    key={account.id}
                                    onClick={() => {
                                        setSelectedAccountIds((prev) =>
                                            selected ? prev.filter((id) => id !== account.id) : [...prev, account.id]
                                        );
                                    }}
                                    className={cn(
                                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                                        selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                                    )}
                                >
                                    {account.avatar ? (
                                        <img src={account.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                                    ) : (
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: PLATFORM_COLORS[account.platform] }}>
                                            {account.name.slice(0, 1).toUpperCase()}
                                        </span>
                                    )}
                                    <span className="font-medium">{account.name}</span>
                                    <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[account.platform]}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Caption */}
            <div className="rounded-lg border border-border bg-card p-4">
                <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Tulis caption kontenmu…"
                    rows={5}
                    className="w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">{charCount} karakter</span>
                </div>
            </div>

            {/* Media */}
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                    <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Media ({media.length})</p>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setStockPickerOpen(true)}>
                            <ImagePlus className="h-4 w-4" />
                            Stok
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setMediaPickerOpen(true)}>
                            Pustaka
                        </Button>
                    </div>
                </div>

                {media.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Belum ada media. Ambil dari pustaka atau koleksi stok.
                    </p>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {media.map((m) => (
                            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                                <img src={m.thumbnailUrl ?? m.url} alt="" className="h-full w-full object-cover" />
                                <button
                                    onClick={() => setMedia((prev) => prev.filter((x) => x.id !== m.id))}
                                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2">
                <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                    <CalendarClock className="h-4 w-4" />
                    {scheduledAt ? `Terjadwal: ${new Date(scheduledAt).toLocaleString("id-ID")}` : "Jadwalkan"}
                </Button>
                <div className="flex gap-2">
                    <Button variant="ghost" loading={saving} onClick={() => handleSave("draft")}>
                        Simpan draft
                    </Button>
                    <Button loading={saving} onClick={() => handleSave(scheduledAt ? "schedule" : "draft")}>
                        <Send className="h-4 w-4" />
                        {scheduledAt ? "Jadwalkan" : "Terbitkan"}
                    </Button>
                </div>
            </div>

            {/* Schedule dialog */}
            <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Jadwalkan posting" description="Pilih waktu publikasi.">
                <div className="space-y-3">
                    <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setScheduledAt(""); setScheduleOpen(false); }}>
                            Hapus jadwal
                        </Button>
                        <Button size="sm" onClick={() => setScheduleOpen(false)}>
                            Oke
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* Media library picker */}
            <MediaLibraryPicker
                open={mediaPickerOpen}
                onClose={() => setMediaPickerOpen(false)}
                items={libraryMedia}
                onSelect={(item) => {
                    setMedia((prev) => (prev.some((m) => m.id === item.id) ? prev : [...prev, item]));
                }}
            />

            <StockMediaPicker
                open={stockPickerOpen}
                onClose={() => setStockPickerOpen(false)}
                onImported={(mediaId) => {
                    setStockPickerOpen(false);
                    loadLibrary().then(() => {
                        const found = libraryMedia.find((m) => m.id === mediaId);
                        if (found) setMedia((prev) => (prev.some((m) => m.id === found.id) ? prev : [...prev, found]));
                    });
                }}
            />
        </div>
    );
}

function MediaLibraryPicker({
    open,
    onClose,
    items,
    onSelect,
}: {
    open: boolean;
    onClose: () => void;
    items: MediaLibraryItem[];
    onSelect: (item: MediaLibraryItem) => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} title="Pustaka media" description="Pilih media dari media library.">
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
                {items.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => {
                            onSelect(item);
                            onClose();
                        }}
                        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                    >
                        <img src={item.thumbnailUrl ?? item.url} alt={item.filename} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                ))}
                {items.length === 0 && (
                    <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">Belum ada media.</p>
                )}
            </div>
        </Dialog>
    );
}