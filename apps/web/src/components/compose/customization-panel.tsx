"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { type Platform, PLATFORM_LABELS } from "@/lib/platform-config";
import { type ComposeMediaItem } from "@/hooks/use-compose";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface PlatformSettings {
    postType: string;
    callToAction?: string;
    captionOverride?: string;
    firstCommentOverride?: string;
    mediaOverride?: string[];
    autoPublish: boolean;
    location?: string;
    altText?: string;
    altTexts?: Record<string, string>;
    videoTitle?: string;
    privacy?: string;
    commentsEnabled?: boolean;
    category?: string;
    playlist?: string;
    videoTags?: string[];
    tiktokPrivacyLevel?: string;
    tiktokComments?: boolean;
    tiktokAutoAddMusic?: boolean;
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;
    linkedinVisibility?: string;
    threadsTopicTag?: string;
    threadsShareToIg?: boolean;
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
    instagramLocationId?: string;
    instagramUserTags?: { username: string; x: number; y: number }[];
    instagramCollaborators?: string[];
    [key: string]: unknown;
}

export function getDefaultPlatformSettings(platform: Platform): PlatformSettings {
    const base: PlatformSettings = { postType: "feed", autoPublish: true };
    switch (platform) {
        case "TIKTOK": return { ...base, tiktokPrivacyLevel: "SELF_ONLY", tiktokComments: true, tiktokAutoAddMusic: false };
        case "YOUTUBE": return { ...base, privacy: "private", commentsEnabled: true };
        case "LINKEDIN": return { ...base, linkedinVisibility: "PUBLIC" };
        case "THREADS": return { ...base, threadsShareToIg: false };
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE": return { ...base, instagramShareToFeed: true, instagramComments: true };
        default: return base;
    }
}

interface CustomizationPanelProps {
    platforms: Platform[];
    activePlatform: Platform;
    onActivePlatformChange: (platform: Platform) => void;
    settings: Record<Platform, PlatformSettings>;
    onSettingsChange: (platform: Platform, settings: Partial<PlatformSettings>) => void;
    caption: string;
    media: ComposeMediaItem[];
    onAddMedia?: () => void;
    onMediaChange?: (media: ComposeMediaItem[]) => void;
    firstComment?: string;
    onFirstCommentChange?: (value: string) => void;
    selectedAccounts?: Array<{ id: string; platform: string }>;
    isCarouselMode?: boolean;
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="border-b border-border px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            {children}
        </div>
    );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-sm text-foreground">{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    checked ? "bg-primary" : "bg-muted"
                )}
            >
                <span
                    className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out",
                        checked ? "translate-x-5" : "translate-x-0"
                    )}
                />
            </button>
        </div>
    );
}

export function CustomizationPanel({
    platforms,
    activePlatform,
    onActivePlatformChange,
    settings,
    onSettingsChange,
    caption,
    media,
    firstComment,
    onFirstCommentChange,
}: CustomizationPanelProps) {
    const s = settings[activePlatform] || getDefaultPlatformSettings(activePlatform);
    const set = useCallback((updates: Partial<PlatformSettings>) => onSettingsChange(activePlatform, updates), [activePlatform, onSettingsChange]);

    const supportsFirstComment = ["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN"].includes(activePlatform);

    return (
        <div className="h-full overflow-y-auto">
            <div className="flex gap-1 border-b border-border px-4 py-2 overflow-x-auto">
                {platforms.map((p) => (
                    <button
                        key={p}
                        onClick={() => onActivePlatformChange(p)}
                        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors", activePlatform === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                        title={PLATFORM_LABELS[p]}
                    >
                        <PlatformIcon platform={p} size={16} />
                    </button>
                ))}
            </div>

            <SettingSection title="Jenis Post">
                <select
                    value={s.postType}
                    onChange={(e) => set({ postType: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <option value="feed">Feed Post</option>
                    <option value="reel">Reel</option>
                    <option value="story">Story</option>
                    <option value="carousel">Carousel</option>
                    {activePlatform === "PINTEREST" && <option value="pin">Pin</option>}
                    {activePlatform === "YOUTUBE" && <option value="video">Video</option>}
                </select>
            </SettingSection>

            {supportsFirstComment && (
                <SettingSection title="Komentar Pertama">
                    <textarea
                        value={firstComment || ""}
                        onChange={(e) => onFirstCommentChange?.(e.target.value)}
                        placeholder="Tulis komentar pertama..."
                        rows={2}
                        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">{(firstComment || "").length} karakter</p>
                </SettingSection>
            )}

            {activePlatform === "TIKTOK" && (
                <SettingSection title="TikTok">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Privasi *</Label>
                            <select value={s.tiktokPrivacyLevel || ""} onChange={(e) => set({ tiktokPrivacyLevel: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value="SELF_ONLY">Hanya saya</option>
                                <option value="MUTUAL_FOLLOW_FRIENDS">Teman</option>
                                <option value="PUBLIC_TO_EVERYONE">Publik</option>
                            </select>
                        </div>
                        <ToggleSwitch checked={s.tiktokComments !== false} onChange={(v) => set({ tiktokComments: v })} label="Izinkan komentar" />
                        <ToggleSwitch checked={s.tiktokAutoAddMusic === true} onChange={(v) => set({ tiktokAutoAddMusic: v })} label="Tambah musik otomatis" />
                    </div>
                </SettingSection>
            )}

            {activePlatform === "YOUTUBE" && (
                <SettingSection title="YouTube">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Privasi *</Label>
                            <select value={s.privacy || ""} onChange={(e) => set({ privacy: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value="private">Private</option>
                                <option value="unlisted">Unlisted</option>
                                <option value="public">Public</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Judul video</Label>
                            <Input value={s.videoTitle || ""} onChange={(e) => set({ videoTitle: e.target.value })} placeholder="Kosongkan untuk pakai caption" className="h-9" />
                        </div>
                    </div>
                </SettingSection>
            )}

            {activePlatform === "PINTEREST" && (
                <SettingSection title="Pinterest">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Judul Pin</Label>
                            <Input value={s.pinTitle || ""} onChange={(e) => set({ pinTitle: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Link</Label>
                            <Input value={s.pinLink || ""} onChange={(e) => set({ pinLink: e.target.value })} placeholder="https://..." className="h-9" />
                        </div>
                    </div>
                </SettingSection>
            )}

            {activePlatform === "LINKEDIN" && (
                <SettingSection title="LinkedIn">
                    <select value={s.linkedinVisibility || "PUBLIC"} onChange={(e) => set({ linkedinVisibility: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="PUBLIC">Publik</option>
                        <option value="CONNECTIONS">Hanya koneksi</option>
                    </select>
                </SettingSection>
            )}

            {activePlatform === "THREADS" && (
                <SettingSection title="Threads">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Topic tag</Label>
                            <Input value={s.threadsTopicTag || ""} onChange={(e) => set({ threadsTopicTag: e.target.value })} placeholder="mis. teknologi" className="h-9" />
                        </div>
                        <ToggleSwitch checked={s.threadsShareToIg === true} onChange={(v) => set({ threadsShareToIg: v })} label="Bagikan ke IG Story" />
                    </div>
                </SettingSection>
            )}

            {(activePlatform === "INSTAGRAM" || activePlatform === "INSTAGRAM_PAGE") && (
                <SettingSection title="Instagram">
                    <div className="space-y-3">
                        <ToggleSwitch checked={s.instagramShareToFeed !== false} onChange={(v) => set({ instagramShareToFeed: v })} label="Bagikan ke Feed" />
                        <ToggleSwitch checked={s.instagramComments !== false} onChange={(v) => set({ instagramComments: v })} label="Izinkan komentar" />
                        <div className="space-y-1">
                            <Label className="text-xs">Lokasi</Label>
                            <Input value={s.instagramLocationId || ""} onChange={(e) => set({ instagramLocationId: e.target.value })} placeholder="ID lokasi" className="h-9" />
                        </div>
                    </div>
                </SettingSection>
            )}

            {media.length > 0 && (
                <SettingSection title="Alt Text per Gambar">
                    <div className="space-y-2">
                        {media.map((item, idx) => (
                            <div key={item.id}>
                                <p className="text-[10px] text-muted-foreground mb-1">Gambar {idx + 1}</p>
                                <Input
                                    value={s.altTexts?.[item.id] || ""}
                                    onChange={(e) => {
                                        const newAltTexts = { ...(s.altTexts || {}), [item.id]: e.target.value };
                                        set({ altTexts: newAltTexts });
                                    }}
                                    placeholder={`Deskripsi gambar ${idx + 1}`}
                                    maxLength={100}
                                    className="h-8 text-xs"
                                />
                            </div>
                        ))}
                    </div>
                </SettingSection>
            )}
        </div>
    );
}
