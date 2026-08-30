"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { type Platform, platformSupportsMultipleMedia } from "@/lib/platform-config";
import { type SocialAccount } from "@/components/compose/profile-selector";
import { type AccountSettings } from "@/hooks/use-compose";
import { getDefaultPlatformSettings } from "@/components/compose/customization-panel";
import type { ComposeMediaItem } from "@/hooks/use-compose";

interface UseComposeMediaOptions {
    accounts: SocialAccount[];
    selectedAccountIds: string[];
    setSelectedAccountIds: React.Dispatch<React.SetStateAction<string[]>>;
    media: ComposeMediaItem[];
    setMedia: React.Dispatch<React.SetStateAction<ComposeMediaItem[]>>;
    setAccountSettings: React.Dispatch<React.SetStateAction<Record<string, AccountSettings>>>;
    selectedAccounts: SocialAccount[];
}

export function useComposeMedia({
    accounts,
    selectedAccountIds,
    setSelectedAccountIds,
    media,
    setMedia,
    setAccountSettings,
    selectedAccounts,
}: UseComposeMediaOptions) {
    const isCarouselMode = useMemo(() => media.length > 1, [media.length]);

    const incompatiblePlatforms = useMemo((): Platform[] => {
        if (!isCarouselMode) return [];
        return ["TIKTOK", "YOUTUBE", "GOOGLE_BUSINESS"].filter(
            (p) => !platformSupportsMultipleMedia(p as Platform),
        ) as Platform[];
    }, [isCarouselMode]);

    const prevCarouselMode = useRef(isCarouselMode);
    useEffect(() => {
        const wasCarousel = prevCarouselMode.current;
        prevCarouselMode.current = isCarouselMode;
        if (!isCarouselMode || wasCarousel) return;

        const incompatibleAccountIds = selectedAccountIds.filter((accountId) => {
            const account = accounts.find((a) => a.id === accountId);
            return account && !platformSupportsMultipleMedia(account.platform);
        });

        if (incompatibleAccountIds.length > 0) {
            setSelectedAccountIds((prev) => prev.filter((id) => !incompatibleAccountIds.includes(id)));
        }

        setAccountSettings((prev) => {
            const updated = { ...prev };
            selectedAccountIds.forEach((accountId) => {
                const account = accounts.find((a) => a.id === accountId);
                if (account && platformSupportsMultipleMedia(account.platform)) {
                    const current = updated[accountId] || {
                        ...getDefaultPlatformSettings(account.platform),
                        accountId,
                    };
                    updated[accountId] = {
                        ...current,
                        postType: account.platform === "BLUESKY" ? "feed" : "carousel",
                    };
                }
            });
            return updated;
        });
    }, [isCarouselMode, selectedAccountIds, accounts, setSelectedAccountIds, setAccountSettings]);

    const isYouTubeShortMode = useMemo(() => {
        if (media.length !== 1 || media[0].type !== "video") return false;
        const duration = media[0].duration;
        if (!duration || duration >= 60) return false;
        return selectedAccounts.some((a) => a.platform === "YOUTUBE");
    }, [media, selectedAccounts]);

    const prevShortMode = useRef(isYouTubeShortMode);
    useEffect(() => {
        const was = prevShortMode.current;
        prevShortMode.current = isYouTubeShortMode;
        if (!isYouTubeShortMode || was) return;

        setAccountSettings((prev) => {
            const updated = { ...prev };
            selectedAccountIds.forEach((accountId) => {
                const account = accounts.find((a) => a.id === accountId);
                if (account && account.platform === "YOUTUBE") {
                    const current = updated[accountId] || {
                        ...getDefaultPlatformSettings(account.platform),
                        accountId,
                    };
                    if (current.postType !== "reel") {
                        updated[accountId] = { ...current, postType: "reel" };
                    }
                }
            });
            return updated;
        });
    }, [isYouTubeShortMode, selectedAccountIds, accounts, setAccountSettings]);

    const handleMediaUpload = useCallback(
        (uploaded: Array<{ id: string; url: string; thumbnailUrl?: string; type: string; size: number; width?: number; height?: number; duration?: number }>) => {
            const items: ComposeMediaItem[] = uploaded
                .filter((m) => m.type === "image" || m.type === "video")
                .map((m) => ({
                    id: m.id,
                    url: m.url,
                    thumbnailUrl: m.thumbnailUrl,
                    type: m.type as "image" | "video",
                    size: m.size,
                    width: m.width,
                    height: m.height,
                    duration: m.duration,
                }));
            if (items.length > 0) setMedia((prev) => [...prev, ...items]);
        },
        [setMedia],
    );

    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

    return {
        isCarouselMode,
        incompatiblePlatforms,
        isYouTubeShortMode,
        isMediaModalOpen,
        setIsMediaModalOpen,
        handleMediaUpload,
        handleAddMedia: () => setIsMediaModalOpen(true),
    };
}
