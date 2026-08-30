"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type Platform, sortPlatformsByOrder } from "@/lib/platform-config";
import { type SocialAccount } from "@/components/compose/profile-selector";
import {
    getDefaultPlatformSettings,
    type PlatformSettings,
} from "@/components/compose/customization-panel";

export interface AccountSettings extends PlatformSettings {
    accountId: string;
    captionOverride?: string;
    firstCommentOverride?: string;
    mediaOverride?: string[];
}

export interface ComposeMediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    customThumbnailUrl?: string;
    type: "image" | "video";
    width?: number;
    height?: number;
    duration?: number;
    size: number;
    filename?: string;
    mimeType?: string;
    transcodeStatus?: string | null;
    transcodeProgress?: number;
}

function getDefaultDate(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
}

export function useCompose(initialPostData?: unknown) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editPostId = searchParams.get("edit");

    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [accountsError, setAccountsError] = useState<string | null>(null);

    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState("");
    const [media, setMedia] = useState<ComposeMediaItem[]>([]);
    const [firstComment, setFirstComment] = useState("");
    const [accountSettings, setAccountSettings] = useState<Record<string, AccountSettings>>({});
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [aiPlatform, setAiPlatform] = useState<Platform | null>(null);
    const [pillarId, setPillarId] = useState<string | null>(null);
    const [hashtagCollectionIds, setHashtagCollectionIds] = useState<string[]>([]);

    const [editPostStatus, setEditPostStatus] = useState<string | null>(null);
    const [editPostUpdatedAt, setEditPostUpdatedAt] = useState<Date | null>(null);
    const [editPostLatestError, setEditPostLatestError] = useState<{ message: string; suggestion: string | null } | null>(null);

    const [selectedDate, setSelectedDate] = useState<Date>(getDefaultDate);
    const [scheduledTime, setScheduledTime] = useState("09:00");
    const scheduledDate = useMemo(() => {
        if (!selectedDate) return "tomorrow";
        return selectedDate.toISOString().split("T")[0];
    }, [selectedDate]);

    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    const isSubmitting = isSaving || isScheduling || isPublishing || isRetrying;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setIsLoadingAccounts(true);
            try {
                const res = await fetch("/api/accounts");
                const data = await res.json();
                if (!cancelled) {
                    if (res.ok) {
                        const mapped: SocialAccount[] = (data.accounts ?? []).map((a: Record<string, unknown>) => ({
                            id: a.id as string,
                            platform: (a.platform as string).toUpperCase() as Platform,
                            name: a.name as string,
                            username: a.username as string | null,
                            avatar: a.avatar as string | null,
                            isActive: a.isActive !== false,
                            organizationId: a.organizationId as string | null,
                            organization: a.organization as { id: string; name: string; logo: string | null } | null,
                        }));
                        mapped.sort((a, b) => {
                            const diff = getPlatformSortIndex(a.platform) - getPlatformSortIndex(b.platform);
                            if (diff !== 0) return diff;
                            return a.name.localeCompare(b.name);
                        });
                        setAccounts(mapped);
                    } else {
                        setAccountsError(data.error || "Gagal memuat akun.");
                    }
                }
            } catch {
                if (!cancelled) setAccountsError("Gagal memuat akun.");
            } finally {
                if (!cancelled) setIsLoadingAccounts(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const retryPublish = useCallback(async () => {
        if (!editPostId || isRetrying) return;
        setIsRetrying(true);
        try {
            const res = await fetch(`/api/posts/${editPostId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "retry" }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Gagal retry post");
            setEditPostStatus("publishing");
        } catch {
            // ignore
        } finally {
            setIsRetrying(false);
        }
    }, [editPostId, isRetrying]);

    const selectedAccounts = useMemo(
        () => accounts.filter((a) => selectedAccountIds.includes(a.id)),
        [accounts, selectedAccountIds],
    );

    const uniquePlatforms = useMemo((): Platform[] => {
        const platforms = new Set<Platform>();
        selectedAccounts.forEach((a) => platforms.add(a.platform));
        return sortPlatformsByOrder(Array.from(platforms));
    }, [selectedAccounts]);

    const activeAccount = useMemo(() => {
        if (!activeAccountId) return selectedAccounts[0] || null;
        return selectedAccounts.find((a) => a.id === activeAccountId) || selectedAccounts[0] || null;
    }, [activeAccountId, selectedAccounts]);

    const effectiveAccountSettings = useMemo(() => {
        const settings = { ...accountSettings };
        selectedAccounts.forEach((account) => {
            if (!settings[account.id]) {
                settings[account.id] = {
                    ...getDefaultPlatformSettings(account.platform),
                    accountId: account.id,
                };
            }
        });
        return settings;
    }, [accountSettings, selectedAccounts]);

    const activePlatformSettings = useMemo((): Record<Platform, PlatformSettings> => {
        const result = {} as Record<Platform, PlatformSettings>;
        uniquePlatforms.forEach((platform) => {
            const acc = selectedAccounts.find((a) => a.platform === platform);
            if (acc) {
                const s = effectiveAccountSettings[acc.id];
                if (s) result[platform] = s;
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    const activeCaption = useMemo(() => {
        if (activeAccount) {
            const s = effectiveAccountSettings[activeAccount.id];
            return s?.captionOverride || caption;
        }
        return caption;
    }, [activeAccount, effectiveAccountSettings, caption]);

    const platformCaptions = useMemo((): Partial<Record<Platform, string>> => {
        const result: Partial<Record<Platform, string>> = {};
        uniquePlatforms.forEach((platform) => {
            const acc = selectedAccounts.find((a) => a.platform === platform);
            if (acc) {
                const s = effectiveAccountSettings[acc.id];
                if (s?.captionOverride) result[platform] = s.captionOverride;
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    const platformFirstComments = useMemo((): Partial<Record<Platform, string>> => {
        const result: Partial<Record<Platform, string>> = {};
        uniquePlatforms.forEach((platform) => {
            const acc = selectedAccounts.find((a) => a.platform === platform);
            if (acc) {
                const s = effectiveAccountSettings[acc.id];
                if (s?.firstCommentOverride) result[platform] = s.firstCommentOverride;
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    const handleAccountSettingsChange = useCallback(
        (accountId: string, updates: Partial<AccountSettings>) => {
            setAccountSettings((prev) => {
                const account = accounts.find((a) => a.id === accountId);
                const platform = account?.platform || "INSTAGRAM";
                return {
                    ...prev,
                    [accountId]: {
                        ...(prev[accountId] || { ...getDefaultPlatformSettings(platform), accountId }),
                        ...updates,
                    },
                };
            });
        },
        [accounts],
    );

    const handlePlatformSettingsChange = useCallback(
        (_platform: Platform, updates: Partial<PlatformSettings>) => {
            if (activeAccount) handleAccountSettingsChange(activeAccount.id, updates);
        },
        [activeAccount, handleAccountSettingsChange],
    );

    const handlePlatformCaptionChange = useCallback(
        (platform: Platform, newCaption: string) => {
            const acc = selectedAccounts.find((a) => a.platform === platform);
            if (acc) handleAccountSettingsChange(acc.id, { captionOverride: newCaption });
        },
        [selectedAccounts, handleAccountSettingsChange],
    );

    const handlePlatformFirstCommentChange = useCallback(
        (platform: Platform, newFirstComment: string) => {
            const acc = selectedAccounts.find((a) => a.platform === platform);
            if (acc) handleAccountSettingsChange(acc.id, { firstCommentOverride: newFirstComment });
        },
        [selectedAccounts, handleAccountSettingsChange],
    );

    const handleActivePlatformChange = useCallback(
        (platform: Platform) => {
            const acc = selectedAccounts.find((a) => a.platform === platform);
            if (acc) setActiveAccountId(acc.id);
        },
        [selectedAccounts],
    );

    const handleTemplateSelect = useCallback((templateCaption: string) => {
        setCaption(templateCaption);
    }, []);

    const handleOpenTemplates = useCallback(() => setIsTemplatePickerOpen(true), []);

    const handleOpenScheduleModal = useCallback(() => setIsScheduleModalOpen(true), []);

    const handleScheduleConfirm = useCallback((date: string, time: string) => {
        setSelectedDate(new Date(date));
        setScheduledTime(time);
        setIsScheduleModalOpen(false);
    }, []);

    const handleAIAssist = useCallback((platform?: Platform | null) => {
        setAiPlatform(platform || activeAccount?.platform || "INSTAGRAM");
        setIsAIModalOpen(true);
    }, [activeAccount]);

    const handleAICaptionSelect = useCallback((newCaption: string) => {
        setCaption(newCaption);
        setIsAIModalOpen(false);
    }, []);

    const resetForm = useCallback(() => {
        setCaption("");
        setMedia([]);
        setSelectedAccountIds([]);
        setFirstComment("");
        setAccountSettings({});
        setActiveAccountId(null);
    }, []);

    const autoSelectDone = useRef(false);
    useEffect(() => {
        if (editPostId || isLoadingAccounts || accounts.length === 0) return;
        if (autoSelectDone.current) return;
        if (selectedAccountIds.length > 0) { autoSelectDone.current = true; return; }
        autoSelectDone.current = true;
    }, [editPostId, isLoadingAccounts, accounts, selectedAccountIds]);

    return {
        router,
        isLoadingAccounts, isLoadingEditPost: false, isEditPostLoaded: true, accountsError, editPostError: null,
        editPostId, editPostStatus, editPostUpdatedAt, editPostLatestError,

        isSaving, setIsSaving, isScheduling, setIsScheduling,
        isPublishing, setIsPublishing, isSubmitting, isRetrying, retryPublish,

        accounts, selectedAccountIds, setSelectedAccountIds, selectedAccounts,

        caption, setCaption, media, setMedia, firstComment, setFirstComment,

        accountSettings, setAccountSettings, effectiveAccountSettings,
        handleAccountSettingsChange, handlePlatformSettingsChange,

        activeAccountId, setActiveAccountId, activeAccount,
        activePlatformSettings, activeCaption,
        platformCaptions, platformFirstComments,
        handleActivePlatformChange, handlePlatformCaptionChange, handlePlatformFirstCommentChange,
        uniquePlatforms,

        isCarouselMode: media.length > 1,
        incompatiblePlatforms: [] as Platform[],
        isYouTubeShortMode: false,

        selectedDate, setSelectedDate, scheduledTime, setScheduledTime, scheduledDate,
        optimalTimes: null,

        mediaFolders: [],

        isAIRewriting: false,

        isAIModalOpen, setIsAIModalOpen, aiPlatform,
        isTemplatePickerOpen, setIsTemplatePickerOpen,
        isMediaModalOpen, setIsMediaModalOpen,
        isScheduleModalOpen, setIsScheduleModalOpen,

        handleAIAssist, handleAICaptionSelect, handleTemplateSelect,
        handleOpenTemplates,
        handleScheduleConfirm,
        handleAddMedia: () => setIsMediaModalOpen(true),
        handleMediaUpload: (uploaded: Array<{ id: string; url: string; thumbnailUrl?: string; type: string; size: number }>) => {
            const items: ComposeMediaItem[] = uploaded
                .filter((m) => m.type === "image" || m.type === "video")
                .map((m) => ({
                    id: m.id,
                    url: m.url,
                    thumbnailUrl: m.thumbnailUrl,
                    type: m.type as "image" | "video",
                    size: m.size,
                }));
            if (items.length > 0) setMedia((prev) => [...prev, ...items]);
        },
        handleOpenScheduleModal, resetForm,

        pillarId, setPillarId,
        hashtagCollectionIds, setHashtagCollectionIds,
    };
}

function getPlatformSortIndex(platform: Platform): number {
    const order: Platform[] = [
        "GOOGLE_BUSINESS", "FACEBOOK", "INSTAGRAM", "THREADS",
        "YOUTUBE", "TIKTOK", "PINTEREST", "BLUESKY", "LINKEDIN", "MANUAL",
    ];
    const idx = order.indexOf(platform);
    return idx === -1 ? 999 : idx;
}
