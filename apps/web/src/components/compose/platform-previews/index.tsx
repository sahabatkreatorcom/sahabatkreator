"use client";

import { type Platform, PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platform-config";
import { PlatformIcon } from "@/components/ui/platform-icon";
import type { ComposeMediaItem } from "@/hooks/use-compose";

interface PlatformPreviewProps {
    platform: Platform;
    postType: string;
    caption: string;
    media: ComposeMediaItem[];
    accountName: string;
    accountAvatar?: string | null;
    videoTitle?: string;
}

function InstagramPreview({ caption, media, accountName, accountAvatar }: PlatformPreviewProps) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
                    {accountAvatar ? <img src={accountAvatar} alt="" className="h-full w-full rounded-full object-cover" /> : accountName[0]}
                </div>
                <div>
                    <p className="text-xs font-semibold">{accountName}</p>
                    <p className="text-[10px] text-muted-foreground">Sponsored</p>
                </div>
            </div>
            {media.length > 0 && (
                <div className="aspect-square bg-muted">
                    {media[0].type === "video" ? (
                        <video src={media[0].url} poster={media[0].thumbnailUrl} className="h-full w-full object-cover" muted />
                    ) : (
                        <img src={media[0].thumbnailUrl || media[0].url} alt="" className="h-full w-full object-cover" />
                    )}
                </div>
            )}
            <div className="p-3">
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg">❤️</span>
                    <span className="text-lg">💬</span>
                    <span className="text-lg">📤</span>
                    <span className="ml-auto text-lg">🔖</span>
                </div>
                <p className="text-xs font-semibold mb-1">{accountName}</p>
                <p className="text-xs whitespace-pre-wrap">{caption || "Caption akan muncul di sini..."}</p>
            </div>
        </div>
    );
}

function TikTokPreview({ caption, media, accountName, accountAvatar }: PlatformPreviewProps) {
    return (
        <div className="relative rounded-xl border border-border bg-black overflow-hidden aspect-[9/16] max-h-[400px]">
            {media.length > 0 ? (
                <video src={media[0].url} poster={media[0].thumbnailUrl} className="absolute inset-0 h-full w-full object-cover" muted />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
            )}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                        {accountAvatar ? <img src={accountAvatar} alt="" className="h-full w-full object-cover" /> : accountName[0]}
                    </div>
                    <span className="text-xs font-semibold text-white">@{accountName.toLowerCase().replace(/\s+/g, "")}</span>
                </div>
                <p className="text-xs text-white whitespace-pre-wrap line-clamp-3">{caption || "Caption akan muncul di sini..."}</p>
            </div>
        </div>
    );
}

function YouTubePreview({ caption, media, accountName, accountAvatar, videoTitle }: PlatformPreviewProps) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            {media.length > 0 ? (
                <div className="aspect-video bg-muted">
                    {media[0].type === "video" ? (
                        <video src={media[0].url} poster={media[0].thumbnailUrl} className="h-full w-full object-cover" muted />
                    ) : (
                        <img src={media[0].thumbnailUrl || media[0].url} alt="" className="h-full w-full object-cover" />
                    )}
                </div>
            ) : (
                <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground text-sm">Preview video</div>
            )}
            <div className="p-3">
                <div className="flex gap-2">
                    <div className="h-8 w-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                        {accountAvatar ? <img src={accountAvatar} alt="" className="h-full w-full object-cover" /> : accountName[0]}
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold line-clamp-2">{videoTitle || caption || "Judul video"}</p>
                        <p className="text-[10px] text-muted-foreground">{accountName}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GenericPreview({ platform, caption, media, accountName, accountAvatar }: PlatformPreviewProps) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: PLATFORM_COLORS[platform] }}>
                    {accountAvatar ? <img src={accountAvatar} alt="" className="h-full w-full rounded-full object-cover" /> : <PlatformIcon platform={platform} size={12} />}
                </div>
                <div>
                    <p className="text-xs font-semibold">{accountName}</p>
                    <p className="text-[10px] text-muted-foreground">{PLATFORM_LABELS[platform]}</p>
                </div>
            </div>
            {media.length > 0 && (
                <div className="aspect-square bg-muted">
                    <img src={media[0].thumbnailUrl || media[0].url} alt="" className="h-full w-full object-cover" />
                </div>
            )}
            <div className="p-3">
                <p className="text-xs whitespace-pre-wrap line-clamp-4">{caption || "Caption akan muncul di sini..."}</p>
            </div>
        </div>
    );
}

export function PlatformPreview(props: PlatformPreviewProps) {
    switch (props.platform) {
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE":
            return <InstagramPreview {...props} />;
        case "TIKTOK":
            return <TikTokPreview {...props} />;
        case "YOUTUBE":
            return <YouTubePreview {...props} />;
        default:
            return <GenericPreview {...props} />;
    }
}
