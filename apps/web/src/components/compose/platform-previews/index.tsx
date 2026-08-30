"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Platform, PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/platform-config";
import { PlatformIcon } from "@/components/ui/platform-icon";
import type { ComposeMediaItem } from "@/hooks/use-compose";
import { mediaFileUrl } from "@/lib/media-file-url";

interface PlatformPreviewProps {
    platform: Platform;
    postType: string;
    caption: string;
    media: ComposeMediaItem[];
    accountName: string;
    accountAvatar?: string | null;
    videoTitle?: string;
}

function StoryReelPreview({ caption, media, accountName, accountAvatar, platform, label }: PlatformPreviewProps & { label: string }) {
    return (
        <div className="relative rounded-xl border border-border bg-black overflow-hidden aspect-[9/16] max-h-[420px]">
            {media.length > 0 ? (
                media[0].type === "video" ? (
                    <video src={mediaFileUrl(media[0].url)} poster={mediaFileUrl(media[0].thumbnailUrl)} className="absolute inset-0 h-full w-full object-cover" muted />
                ) : (
                    <img src={mediaFileUrl(media[0].thumbnailUrl || media[0].url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">{label}</span>
                </div>
            )}
            <div className="absolute top-3 left-3 right-3 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                    {accountAvatar ? <img src={accountAvatar} alt="" className="h-full w-full object-cover" /> : accountName[0]}
                </div>
                <span className="text-xs font-semibold text-white drop-shadow">{accountName}</span>
                <span className="ml-auto rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white">{label}</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-xs text-white whitespace-pre-wrap line-clamp-4">{caption || "Caption akan muncul di sini..."}</p>
            </div>
            <div className="absolute bottom-3 right-3 flex flex-col gap-3">
                <span className="text-lg">❤️</span>
                <span className="text-lg">💬</span>
                <span className="text-lg">📤</span>
            </div>
        </div>
    );
}

function InstagramPreview({ caption, media, accountName, accountAvatar, postType, platform }: PlatformPreviewProps) {
    const [carouselIdx, setCarouselIdx] = useState(0);

    if (postType === "story" || postType === "reel") {
        return <StoryReelPreview caption={caption} media={media} accountName={accountName} accountAvatar={accountAvatar} platform={platform} postType={postType} label={postType === "reel" ? "Reel" : "Story"} />;
    }

    const isCarousel = postType === "carousel" && media.length > 1;
    const currentMedia = isCarousel ? media[carouselIdx] || media[0] : media[0];

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
            {media.length > 0 ? (
                <div className="relative group">
                    <div className="aspect-square">
                        {currentMedia.type === "video" ? (
                            <video src={mediaFileUrl(currentMedia.url)} poster={mediaFileUrl(currentMedia.thumbnailUrl)} className="h-full w-full object-cover" muted />
                        ) : (
                            <img src={mediaFileUrl(currentMedia.thumbnailUrl || currentMedia.url)} alt="" className="h-full w-full object-cover" />
                        )}
                    </div>
                    {isCarousel && (
                        <>
                            {carouselIdx > 0 && (
                                <button onClick={() => setCarouselIdx((i) => i - 1)} className="absolute left-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                            )}
                            {carouselIdx < media.length - 1 && (
                                <button onClick={() => setCarouselIdx((i) => i + 1)} className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            )}
                            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                                {media.slice(0, 5).map((_, i) => (
                                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === carouselIdx ? "bg-primary" : "bg-white/50"}`} />
                                ))}
                                {media.length > 5 && <span className="text-[8px] text-white">+{media.length - 5}</span>}
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="aspect-square bg-muted flex items-center justify-center text-muted-foreground text-sm">Tambah media</div>
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

function TikTokPreview({ caption, media, accountName, accountAvatar, postType, platform }: PlatformPreviewProps) {
    const [carouselIdx, setCarouselIdx] = useState(0);

    if (postType === "story") {
        return <StoryReelPreview caption={caption} media={media} accountName={accountName} accountAvatar={accountAvatar} platform={platform} postType={postType} label="Story" />;
    }

    const isCarousel = (postType === "carousel" || media.length > 1) && media.length > 1;
    const currentMedia = isCarousel ? media[carouselIdx] || media[0] : media[0];

    return (
        <div className="relative rounded-xl border border-border bg-black overflow-hidden aspect-[9/16] max-h-[420px]">
            {media.length > 0 ? (
                <div className="relative h-full w-full">
                    {currentMedia.type === "video" ? (
                        <video src={mediaFileUrl(currentMedia.url)} poster={mediaFileUrl(currentMedia.thumbnailUrl)} className="absolute inset-0 h-full w-full object-cover" muted />
                    ) : (
                        <img src={mediaFileUrl(currentMedia.thumbnailUrl || currentMedia.url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {isCarousel && (
                        <>
                            {carouselIdx > 0 && (
                                <button onClick={() => setCarouselIdx((i) => i - 1)} className="absolute left-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white z-10">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                            )}
                            {carouselIdx < media.length - 1 && (
                                <button onClick={() => setCarouselIdx((i) => i + 1)} className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white z-10">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            )}
                            <div className="absolute bottom-14 left-0 right-0 flex justify-center gap-1 z-10">
                                {media.slice(0, 7).map((_, i) => (
                                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === carouselIdx ? "bg-white" : "bg-white/40"}`} />
                                ))}
                                {media.length > 7 && <span className="text-[8px] text-white">+{media.length - 7}</span>}
                            </div>
                        </>
                    )}
                </div>
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
            <div className="absolute bottom-3 right-3 flex flex-col gap-3">
                <span className="text-lg">❤️</span>
                <span className="text-lg">💬</span>
                <span className="text-lg">🔖</span>
            </div>
        </div>
    );
}

function YouTubePreview({ caption, media, accountName, accountAvatar, videoTitle, postType, platform }: PlatformPreviewProps) {
    if (postType === "reel") {
        return <StoryReelPreview caption={caption} media={media} accountName={accountName} accountAvatar={accountAvatar} platform={platform} postType={postType} label="Short" />;
    }

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            {media.length > 0 ? (
                <div className="aspect-video bg-muted">
                    {media[0].type === "video" ? (
                        <video src={mediaFileUrl(media[0].url)} poster={mediaFileUrl(media[0].thumbnailUrl)} className="h-full w-full object-cover" muted />
                    ) : (
                        <img src={mediaFileUrl(media[0].thumbnailUrl || media[0].url)} alt="" className="h-full w-full object-cover" />
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

function GenericPreview({ platform, caption, media, accountName, accountAvatar, postType }: PlatformPreviewProps) {
    if (postType === "story" || postType === "reel") {
        return (
            <div className="relative rounded-xl border border-border bg-black overflow-hidden aspect-[9/16] max-h-[420px]">
                {media.length > 0 ? (
                    media[0].type === "video" ? (
                        <video src={mediaFileUrl(media[0].url)} poster={mediaFileUrl(media[0].thumbnailUrl)} className="absolute inset-0 h-full w-full object-cover" muted />
                    ) : (
                        <img src={mediaFileUrl(media[0].thumbnailUrl || media[0].url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
                )}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: PLATFORM_COLORS[platform] }}>
                        <PlatformIcon platform={platform} size={12} />
                    </span>
                    <span className="text-xs font-semibold text-white drop-shadow">{accountName}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-xs text-white whitespace-pre-wrap line-clamp-4">{caption || "Caption akan muncul di sini..."}</p>
                </div>
            </div>
        );
    }

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
                    <img src={mediaFileUrl(media[0].thumbnailUrl || media[0].url)} alt="" className="h-full w-full object-cover" />
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
