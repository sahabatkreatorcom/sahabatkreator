"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ImagePlus, Send, X, LayoutTemplate, Hash, FolderTree, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { StockMediaPicker } from "@/components/media/stock-media-picker";
import { PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/platforms/config";
import { validatePlatformContent, strictestCaptionLimit, type PlatformIssue } from "@/lib/platforms/validation";
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

interface Pillar {
    id: string;
    name: string;
    color: string;
}

interface CaptionTemplate {
    id: string;
    name: string;
    caption: string;
    hashtags: string[];
    category: string | null;
}

interface HashtagCollection {
    id: string;
    name: string;
    hashtags: string[];
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
    const [pillars, setPillars] = useState<Pillar[]>([]);
    const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
    const [collections, setCollections] = useState<HashtagCollection[]>([]);
    const [pillarId, setPillarId] = useState<string>("");
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
    const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

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

    const loadContentTools = useCallback(async () => {
        try {
            const [p, t, c] = await Promise.all([
                fetch("/api/pillars").then((r) => r.json()),
                fetch("/api/caption-templates").then((r) => r.json()),
                fetch("/api/hashtag-collections").then((r) => r.json()),
            ]);
            setPillars((p.pillars ?? []).map((x: Pillar) => ({ id: x.id, name: x.name, color: x.color })));
            setTemplates(t.templates ?? []);
            setCollections(c.collections ?? []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        loadAccounts();
        loadLibrary();
        loadContentTools();
    }, [loadAccounts, loadLibrary, loadContentTools]);

    function applyTemplate(t: CaptionTemplate) {
        setCaption(t.caption);
        if (t.hashtags.length > 0) setCaption((prev) => prev + (prev ? "\n\n" : "") + t.hashtags.map((h) => `#${h}`).join(" "));
        setTemplatePickerOpen(false);
    }

    function applyCollection(c: HashtagCollection) {
        const tags = c.hashtags.map((h) => `#${h}`).join(" ");
        setCaption((prev) => (prev ? `${prev}\n\n${tags}` : tags));
        setCollectionPickerOpen(false);
    }

    async function handleSave(action: "draft" | "schedule" | "publish") {
        if (selectedAccountIds.length === 0) {
            setError("Pilih minimal satu akun.");
            return;
        }
        if (action === "schedule" && !scheduledAt) {
            setError("Pilih waktu jadwal.");
            return;
        }

        if (action === "schedule" || action === "publish") {
            const blockers = issues.flatMap(({ account, issues: list }) =>
                list.filter((i) => i.severity === "error").map((i) => `${account.name}: ${i.message}`)
            );
            if (blockers.length > 0) {
                setError(blockers[0]);
                return;
            }
        }

        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const isPublish = action === "publish";
            const isSchedule = action === "schedule";
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    caption,
                    platformAccountIds: selectedAccountIds,
                    mediaIds: media.map((m) => m.id),
                    scheduledAt: isSchedule ? new Date(scheduledAt).toISOString() : null,
                    autoPublish: isPublish || isSchedule,
                    pillarId: pillarId || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal menyimpan post.");
                return;
            }
            setSuccess(isSchedule ? "Post dijadwalkan." : isPublish ? "Post diterbitkan." : "Draft disimpan.");
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

    const selectedAccounts = accounts.filter((a) => selectedAccountIds.includes(a.id));
    const selectedPlatforms = selectedAccounts.map((a) => a.platform);
    const captionLimit = strictestCaptionLimit(selectedPlatforms);

    /** Isu validasi per akun terpilih (live saat mengetik/menambah media). */
    const issues: { account: Account; issues: PlatformIssue[] }[] = selectedAccounts.map((account) => ({
        account,
        issues: validatePlatformContent(account.platform, caption, media),
    }));
    const hasErrors = issues.some(({ issues: list }) => list.some((i) => i.severity === "error"));

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
                        <a href="/connections" className="font-medium text-primary hover:underline">
                            Hubungkan akun
                        </a>
                        .
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {accounts.map((account) => {
                            const selected = selectedAccountIds.includes(account.id);
                            const accountIssues = issues.find((x) => x.account.id === account.id)?.issues ?? [];
                            const hasIssue = accountIssues.some((i) => i.severity === "error");
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
                                            <PlatformIcon platform={account.platform} size={12} />
                                        </span>
                                    )}
                                    <span className="font-medium">{account.name}</span>
                                    <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[account.platform]}</span>
                                    {selected && hasIssue && <AlertCircle className="h-3.5 w-3.5 text-accent-red" />}
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
                    {captionLimit !== null && (
                        <span
                            className={cn(
                                "text-xs font-medium",
                                caption.length > captionLimit ? "text-accent-red" : "text-muted-foreground"
                            )}
                        >
                            {caption.length.toLocaleString("id-ID")}/{captionLimit.toLocaleString("id-ID")}
                            {caption.length > captionLimit && " — melebihi batas"}
                        </span>
                    )}
                </div>
                {issues.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {issues.map(({ account, issues: list }) =>
                            list.length > 0 ? (
                                <div key={account.id} className="text-xs">
                                    <p className="font-medium text-muted-foreground">{account.name}</p>
                                    <ul className="mt-0.5 space-y-1">
                                        {list.map((issue, i) => (
                                            <li
                                                key={i}
                                                className={cn(
                                                    "flex items-start gap-1.5",
                                                    issue.severity === "error" ? "text-accent-red" : "text-amber-600"
                                                )}
                                            >
                                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                <span>{issue.message}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null
                        )}
                    </div>
                )}
            </div>

            {/* Content tools: pilar + template + hashtag */}
            <div className="rounded-lg border border-border bg-card p-4">
                <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Content tools</p>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1.5">
                        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
                        <select
                            value={pillarId}
                            onChange={(e) => setPillarId(e.target.value)}
                            className="bg-transparent text-sm outline-none"
                        >
                            <option value="">Tanpa pilar</option>
                            {pillars.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    <Button variant="secondary" size="sm" disabled={templates.length === 0} onClick={() => setTemplatePickerOpen(true)}>
                        <LayoutTemplate className="h-3.5 w-3.5" />
                        Template caption
                    </Button>
                    <Button variant="secondary" size="sm" disabled={collections.length === 0} onClick={() => setCollectionPickerOpen(true)}>
                        <Hash className="h-3.5 w-3.5" />
                        Koleksi hashtag
                    </Button>
                    {templates.length === 0 && collections.length === 0 && (
                        <a href="/content-tools" className="text-xs font-medium text-primary hover:underline">
                            Kelola di Content tools
                        </a>
                    )}
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
                    <Button loading={saving} onClick={() => handleSave(scheduledAt ? "schedule" : "publish")}>
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

            {/* Template caption picker */}
            <Dialog open={templatePickerOpen} onClose={() => setTemplatePickerOpen(false)} title="Template caption" description="Pilih template untuk mengisi caption.">
                <div className="max-h-80 space-y-2 overflow-y-auto">
                    {templates.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => applyTemplate(t)}
                            className="w-full rounded-md border border-border bg-muted/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{t.name}</span>
                                {t.category && <span className="text-xs text-muted-foreground">{t.category}</span>}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.caption}</p>
                        </button>
                    ))}
                    {templates.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada template. Buat di Content tools.</p>
                    )}
                </div>
            </Dialog>

            {/* Hashtag collection picker */}
            <Dialog open={collectionPickerOpen} onClose={() => setCollectionPickerOpen(false)} title="Koleksi hashtag" description="Pilih koleksi untuk menambah hashtag ke caption.">
                <div className="max-h-80 space-y-2 overflow-y-auto">
                    {collections.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => applyCollection(c)}
                            className="w-full rounded-md border border-border bg-muted/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted"
                        >
                            <span className="text-sm font-medium">{c.name}</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {c.hashtags.slice(0, 6).map((h) => (
                                    <span key={h} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">#{h}</span>
                                ))}
                                {c.hashtags.length > 6 && <span className="text-xs text-muted-foreground">+{c.hashtags.length - 6}</span>}
                            </div>
                        </button>
                    ))}
                    {collections.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada koleksi. Buat di Content tools.</p>
                    )}
                </div>
            </Dialog>
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
