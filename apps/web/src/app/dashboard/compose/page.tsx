"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, ImagePlus, Send, X, LayoutTemplate, Hash, FolderTree, AlertCircle, Plus, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    const [firstComment, setFirstComment] = useState("");
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
    const [platformSettings, setPlatformSettings] = useState<Record<string, Record<string, string | boolean | string[] | { username: string; x: number; y: number }[]>>>({});
    const [pinterestBoards, setPinterestBoards] = useState<Record<string, { id: string; name: string; url: string; pinCount: number }[]>>({});
    const [pinterestBoardsLoading, setPinterestBoardsLoading] = useState<Record<string, boolean>>({});
    const [pinterestCreateBoard, setPinterestCreateBoard] = useState<Record<string, boolean>>({});
    const [pinterestNewBoardName, setPinterestNewBoardName] = useState<Record<string, string>>({});
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleUploadFile = useCallback(async (files: FileList | File[]) => {
        const fileArray = Array.from(files).filter((f) => !media.some((m) => m.url === f.name));
        if (fileArray.length === 0) return;
        setUploading(true);
        setUploadError(null);
        try {
            const results = await Promise.all(
                fileArray.map(async (file) => {
                    const fd = new FormData();
                    fd.set("file", file);
                    const res = await fetch("/api/media", { method: "POST", body: fd });
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(String(err?.error || "Upload gagal."));
                    }
                    return res.json();
                })
            );
            const newMedia: MediaItem[] = results.map((item) => ({
                id: item.id,
                url: item.url,
                thumbnailUrl: item.thumbnailUrl ?? item.url,
                type: item.type,
            }));
            setMedia((prev) => [...prev, ...newMedia]);
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : "Gagal mengunggah file.");
        } finally {
            setUploading(false);
        }
    }, [media]);

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

    const loadedPinterestBoardsRef = useRef<Set<string>>(new Set());

    const loadPinterestBoards = useCallback(async (accountId: string, force = false) => {
        if (!force && loadedPinterestBoardsRef.current.has(accountId)) return;
        loadedPinterestBoardsRef.current.add(accountId);
        setPinterestBoardsLoading((prev) => ({ ...prev, [accountId]: true }));
        try {
            const res = await fetch(`/api/accounts/${accountId}/boards`);
            const data = await res.json();
            if (res.ok) setPinterestBoards((prev) => ({ ...prev, [accountId]: data.boards ?? [] }));
        } catch { /* ignore */ }
        setPinterestBoardsLoading((prev) => ({ ...prev, [accountId]: false }));
    }, []);

    const createPinterestBoard = useCallback(async (accountId: string) => {
        const name = pinterestNewBoardName[accountId]?.trim();
        if (!name) return;
        try {
            const res = await fetch(`/api/accounts/${accountId}/boards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (res.ok && data.board) {
                setPinterestBoards((prev) => ({
                    ...prev,
                    [accountId]: [...(prev[accountId] ?? []), data.board],
                }));
                setPlatformSettings((prev) => ({
                    ...prev,
                    [accountId]: { ...(prev[accountId] ?? {}), boardId: data.board.id },
                }));
                setPinterestCreateBoard((prev) => ({ ...prev, [accountId]: false }));
                setPinterestNewBoardName((prev) => ({ ...prev, [accountId]: "" }));
            }
        } catch { /* ignore */ }
    }, [pinterestNewBoardName]);

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
                    firstComment,
                    platformAccountIds: selectedAccountIds,
                    mediaIds: media.map((m) => m.id),
                    scheduledAt: isSchedule ? new Date(scheduledAt).toISOString() : null,
                    autoPublish: isPublish || isSchedule,
                    pillarId: pillarId || undefined,
                    platformSettings,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Gagal menyimpan post.");
                return;
            }
            setSuccess(isSchedule ? "Post dijadwalkan." : isPublish ? "Post diterbitkan." : "Draft disimpan.");
            setCaption("");
            setFirstComment("");
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

    // Auto-load Pinterest boards when Pinterest account is selected
    useEffect(() => {
        for (const account of selectedAccounts) {
            if (account.platform === "PINTEREST") {
                loadPinterestBoards(account.id);
            }
        }
    }, [selectedAccounts, loadPinterestBoards]);

    const selectedPlatforms = selectedAccounts.map((a) => a.platform);
    const captionLimit = strictestCaptionLimit(selectedPlatforms);

    /** Isu validasi per akun terpilih (live saat mengetik/menambah media). */
    const issues: { account: Account; issues: PlatformIssue[] }[] = selectedAccounts.map((account) => ({
        account,
        issues: validatePlatformContent(account.platform, caption, media, {
            settings: (platformSettings[account.id] ?? {}) as never,
        }),
    }));
    const hasErrors = issues.some(({ issues: list }) => list.some((i) => i.severity === "error"));

    /** Akun terpilih yang membutuhkan pengaturan tambahan. */
    const settingsAccounts = selectedAccounts.filter((a) =>
        ["TIKTOK", "YOUTUBE", "PINTEREST", "LINKEDIN", "THREADS", "INSTAGRAM", "INSTAGRAM_PAGE"].includes(a.platform)
    );
    const hasSettingsIssue = (account: Account) =>
        issues.find((x) => x.account.id === account.id)?.issues.some((i) => i.severity === "error") ?? false;

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
                                        setSelectedAccountIds((prev) => {
                                            const next = selected ? prev.filter((id) => id !== account.id) : [...prev, account.id];
                                            if (!selected) {
                                                const defaults: Record<string, string | boolean> =
                                                    account.platform === "TIKTOK"
                                                        ? { tiktokPrivacyLevel: "SELF_ONLY" }
                                                        : account.platform === "YOUTUBE"
                                                          ? { youtubePrivacy: "private" }
                                                          : account.platform === "LINKEDIN"
                                                            ? { linkedinVisibility: "PUBLIC" }
                                                            : account.platform === "THREADS"
                                                              ? { threadsShareToIg: false }
                                                              : {};
                                                setPlatformSettings((s) => ({ ...s, [account.id]: defaults }));
                                            } else {
                                                setPlatformSettings((s) => {
                                                    const next = { ...s };
                                                    delete next[account.id];
                                                    return next;
                                                });
                                            }
                                            return next;
                                        });
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

            {/* Komentar pertama (Instagram, Facebook, YouTube) */}
            {selectedAccounts.some((a) => ["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "META", "YOUTUBE"].includes(a.platform)) && (
                <div className="rounded-lg border border-border bg-card p-4">
                    <label className="flex items-center justify-between text-sm font-medium text-foreground">
                        Komentar pertama
                        <span className="text-xs font-normal text-muted-foreground">
                            Diposting otomatis setelah konten terbit
                        </span>
                    </label>
                    <textarea
                        value={firstComment}
                        onChange={(e) => setFirstComment(e.target.value)}
                        placeholder="Tulis komentar pertama yang otomatis muncul di bawah post…"
                        rows={2}
                        className="mt-2 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-muted-foreground">{firstComment.length} karakter</span>
                        {selectedAccounts.some((a) => ["INSTAGRAM", "INSTAGRAM_PAGE"].includes(a.platform)) && (
                            <span className="text-xs text-muted-foreground">Instagram: maks 2.196</span>
                        )}
                    </div>
                </div>
            )}

            {/* Platform settings (per akun) */}
            {settingsAccounts.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Pengaturan per platform
                    </p>
                    <div className="space-y-4">
                        {settingsAccounts.map((account) => {
                            const s = platformSettings[account.id] ?? {};
                            const set = (key: string, value: string | boolean | { username: string; x: number; y: number }[] | string[]) =>
                                setPlatformSettings((prev) => ({
                                    ...prev,
                                    [account.id]: { ...(prev[account.id] ?? {}), [key]: value },
                                }));
                            return (
                                <div key={account.id} className="rounded-md border border-border bg-muted/40 p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: PLATFORM_COLORS[account.platform] }}>
                                            <PlatformIcon platform={account.platform} size={12} />
                                        </span>
                                        <p className="text-sm font-medium">{account.name}</p>
                                        <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[account.platform]}</span>
                                    </div>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {account.platform === "TIKTOK" && (
                                            <>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Tingkat privasi *</Label>
                                                    <select
                                                        value={(s.tiktokPrivacyLevel as string) ?? ""}
                                                        onChange={(e) => set("tiktokPrivacyLevel", e.target.value)}
                                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <option value="SELF_ONLY">Hanya saya</option>
                                                        <option value="PRIVATE_TO_FRIENDS">Teman</option>
                                                        <option value="PUBLIC">Publik</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Komentar</Label>
                                                    <select
                                                        value={(s.tiktokComments as boolean) === false ? "off" : "on"}
                                                        onChange={(e) => set("tiktokComments", e.target.value === "on")}
                                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <option value="on">Diaktifkan</option>
                                                        <option value="off">Dimatikan</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Musik otomatis</Label>
                                                    <select
                                                        value={(s.tiktokAutoAddMusic as boolean) === false ? "off" : "on"}
                                                        onChange={(e) => set("tiktokAutoAddMusic", e.target.value === "on")}
                                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <option value="on">Aktif</option>
                                                        <option value="off">Nonaktif</option>
                                                    </select>
                                                </div>
                                            </>
                                        )}
                                        {account.platform === "YOUTUBE" && (
                                            <>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Status privasi *</Label>
                                                    <select
                                                        value={(s.youtubePrivacy as string) ?? ""}
                                                        onChange={(e) => set("youtubePrivacy", e.target.value)}
                                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <option value="private">Private</option>
                                                        <option value="unlisted">Unlisted</option>
                                                        <option value="public">Public</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Judul video</Label>
                                                    <Input
                                                        value={(s.videoTitle as string) ?? ""}
                                                        onChange={(e) => set("videoTitle", e.target.value)}
                                                        placeholder="Kosongkan untuk memakai caption"
                                                        className="h-9"
                                                    />
                                                </div>
                                            </>
                                        )}
                                        {account.platform === "PINTEREST" && (
                                            <div className="space-y-1 sm:col-span-2">
                                                <Label className="text-xs">Board *</Label>
                                                {pinterestBoardsLoading[account.id] ? (
                                                    <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Memuat boards...
                                                    </div>
                                                ) : pinterestCreateBoard[account.id] ? (
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={pinterestNewBoardName[account.id] ?? ""}
                                                            onChange={(e) => setPinterestNewBoardName((prev) => ({ ...prev, [account.id]: e.target.value }))}
                                                            placeholder="Nama board baru"
                                                            className="h-9 flex-1"
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    createPinterestBoard(account.id);
                                                                }
                                                            }}
                                                        />
                                                        <Button size="sm" onClick={() => createPinterestBoard(account.id)}>
                                                            Buat
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setPinterestCreateBoard((prev) => ({ ...prev, [account.id]: false }))}>
                                                            Batal
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={(s.boardId as string) ?? ""}
                                                            onChange={(e) => {
                                                                if (e.target.value === "__create_new__") {
                                                                    setPinterestCreateBoard((prev) => ({ ...prev, [account.id]: true }));
                                                                } else {
                                                                    set("boardId", e.target.value);
                                                                }
                                                            }}
                                                            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            onFocus={() => loadPinterestBoards(account.id)}
                                                        >
                                                            <option value="">Pilih board...</option>
                                                            {(pinterestBoards[account.id] ?? []).map((board) => (
                                                                <option key={board.id} value={board.id}>
                                                                    {board.name} ({board.pinCount} pin)
                                                                </option>
                                                            ))}
                                                            <option value="__create_new__">+ Buat board baru</option>
                                                        </select>
                                                        <Button size="sm" variant="ghost" onClick={() => loadPinterestBoards(account.id, true)} loading={pinterestBoardsLoading[account.id]}>
                                                            Muat ulang
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {account.platform === "LINKEDIN" && (
                                            <div className="space-y-1 sm:col-span-2">
                                                <Label className="text-xs">Visibilitas</Label>
                                                <select
                                                    value={(s.linkedinVisibility as string) ?? "PUBLIC"}
                                                    onChange={(e) => set("linkedinVisibility", e.target.value)}
                                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    <option value="PUBLIC">Publik</option>
                                                    <option value="CONNECTIONS">Hanya koneksi</option>
                                                </select>
                                            </div>
                                        )}
                                        {account.platform === "THREADS" && (
                                            <>
                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label className="text-xs">Topic tag (opsional)</Label>
                                                    <Input
                                                        value={(s.threadsTopicTag as string) ?? ""}
                                                        onChange={(e) => set("threadsTopicTag", e.target.value)}
                                                        placeholder="mis. teknologi, makanan"
                                                        className="h-9"
                                                    />
                                                </div>
                                                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={s.threadsShareToIg === true}
                                                        onChange={(e) => set("threadsShareToIg", e.target.checked)}
                                                        className="h-4 w-4 accent-primary"
                                                    />
                                                    <span>
                                                        Bagikan juga ke Instagram Story
                                                        <span className="block text-xs text-muted-foreground">
                                                            Membutuhkan akun Instagram tertaut & izin threads_share_to_instagram
                                                        </span>
                                                    </span>
                                                </label>
                                            </>
                                        )}
                                        {(account.platform === "INSTAGRAM" || account.platform === "INSTAGRAM_PAGE") && (
                                            <>
                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label className="text-xs">Lokasi (opsional)</Label>
                                                    <Input
                                                        value={(s.instagramLocationId as string) ?? ""}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.trim();
                                                            const match = raw.match(/instagram\.com\/explore\/locations\/(\d+)/) || raw.match(/^(\d+)$/);
                                                            set("instagramLocationId", match ? match[1] : raw);
                                                        }}
                                                        placeholder="Tempel URL lokasi Instagram (instagram.com/explore/locations/…) atau ID-nya"
                                                        className="h-9"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Hanya untuk foto feed & reel (bukan carousel/story).
                                                    </p>
                                                </div>
                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label className="text-xs">Tag pengguna (opsional)</Label>
                                                    <Input
                                                        value={((s.instagramUserTags as { username: string }[] | undefined) ?? [])
                                                            .map((t) => t.username)
                                                            .join(", ")}
                                                        onChange={(e) =>
                                                            set(
                                                                "instagramUserTags",
                                                                e.target.value
                                                                    .split(",")
                                                                    .map((u) => u.trim())
                                                                    .filter(Boolean)
                                                                    .map((username) => ({ username, x: 0.5, y: 0.5 })),
                                                            )
                                                        }
                                                        placeholder="username1, username2 (pisahkan dengan koma)"
                                                        className="h-9"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Hanya untuk foto feed & story. Koordinat default: tengah.
                                                    </p>
                                                </div>
                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label className="text-xs">Kolaborator (opsional, maks 3)</Label>
                                                    <Input
                                                        value={((s.instagramCollaborators as string[] | undefined) ?? []).join(", ")}
                                                        onChange={(e) =>
                                                            set(
                                                                "instagramCollaborators",
                                                                e.target.value
                                                                    .split(",")
                                                                    .map((u) => u.trim())
                                                                    .filter(Boolean)
                                                                    .slice(0, 3),
                                                            )
                                                        }
                                                        placeholder="username1, username2 (maks 3, pisahkan dengan koma)"
                                                        className="h-9"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Diundang sebagai kolaborator (foto, carousel, reel).
                                                    </p>
                                                </div>
                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label className="text-xs">Teks alternatif (alt text, opsional)</Label>
                                                    <Input
                                                        value={(s.altText as string) ?? ""}
                                                        onChange={(e) => set("altText", e.target.value)}
                                                        placeholder="Deskripsi aksesibilitas gambar (maks 100 karakter)"
                                                        maxLength={100}
                                                        className="h-9"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Hanya untuk foto feed (bukan reel/story/carousel).
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {hasSettingsIssue(account) && (
                                        <p className="mt-2 text-xs text-accent-red">
                                            Lengkapi setting wajib di atas untuk platform ini.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
                        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
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
                                if (e.target.files?.length) handleUploadFile(e.target.files);
                                e.target.value = "";
                            }}
                        />
                    </div>
                </div>

                {uploadError && (
                    <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{uploadError}</p>
                )}

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
                    {scheduledAt ? `Terjadwal: ${new Date(scheduledAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}` : "Jadwalkan"}
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
