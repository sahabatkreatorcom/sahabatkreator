"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompose } from "@/hooks/use-compose";
import { useComposerDrop } from "@/hooks/use-composer-drop";
import type { Platform } from "@/lib/platform-config";

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

export function useComposeOrchestration(initialPostData?: unknown) {
    const compose = useCompose(initialPostData);

    const [showValidationDetails, setShowValidationDetails] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);

    const [autoResizeEnabled, setAutoResizeEnabled] = useState(() => {
        if (typeof window === "undefined") return true;
        try {
            return localStorage.getItem("compose-auto-resize") !== "false";
        } catch {
            return true;
        }
    });
    useEffect(() => {
        try { localStorage.setItem("compose-auto-resize", String(autoResizeEnabled)); } catch { /* ignore */ }
    }, [autoResizeEnabled]);

    const handleDropUpload = useCallback(
        async (uploaded: Array<{ id: string; url: string; type: string; size: number; mimeType: string; filename: string }>) => {
            compose.handleMediaUpload(uploaded);
        },
        [compose.handleMediaUpload],
    );
    const { dropHandlers, isDragOver, isUploading: isDropUploading, progress: dropProgress } = useComposerDrop(handleDropUpload);

    const validationContext = useMemo(() => ({
        caption: compose.caption,
        media: compose.media,
        platforms: compose.uniquePlatforms,
        selectedAccountCount: compose.selectedAccountIds.length,
    }), [compose.caption, compose.media, compose.uniquePlatforms, compose.selectedAccountIds.length]);

    const hasValidationErrors = useMemo(() => {
        if (compose.selectedAccountIds.length === 0) return true;
        if (compose.caption.length === 0 && compose.media.length === 0) return true;
        return false;
    }, [compose.caption, compose.media, compose.selectedAccountIds]);

    const validationSummary = useMemo(() => ({
        errors: hasValidationErrors ? 1 : 0,
        warnings: 0,
    }), [hasValidationErrors]);

    const normalizedStatus = compose.editPostStatus?.toLowerCase();
    const isPostPublishing = normalizedStatus === "publishing";
    const isPostFailed = normalizedStatus === "failed";

    const hasTranscodingMedia = useMemo(
        () => compose.media.some((m) => m.type === "video" && (m.transcodeStatus === "pending" || m.transcodeStatus === "processing")),
        [compose.media],
    );

    const isStuckPublishing = useMemo(() => {
        if (!isPostPublishing || !compose.editPostUpdatedAt) return false;
        return compose.editPostUpdatedAt.getTime() < Date.now() - 5 * 60 * 1000;
    }, [isPostPublishing, compose.editPostUpdatedAt]);

    const changeSnapshot = useMemo(() => stableStringify({
        caption: compose.caption,
        firstComment: compose.firstComment,
        selectedAccountIds: [...compose.selectedAccountIds].sort(),
        mediaIds: compose.media.map((item) => item.id),
        scheduledDate: compose.scheduledDate,
        scheduledTime: compose.scheduledTime,
    }), [
        compose.caption, compose.firstComment, compose.selectedAccountIds,
        compose.media, compose.scheduledDate, compose.scheduledTime,
    ]);

    const initialSnapshotRef = useRef<string | null>(null);
    useEffect(() => {
        if (!compose.editPostId || initialSnapshotRef.current) return;
        initialSnapshotRef.current = changeSnapshot;
    }, [compose.editPostId, changeSnapshot]);

    const hasChanges = compose.editPostId
        ? initialSnapshotRef.current !== null && initialSnapshotRef.current !== changeSnapshot
        : compose.caption.length > 0 || compose.media.length > 0;

    const resizedMedia = compose.media;
    const resizeAlerts: Array<{ mediaId: string; originalFilename: string; originalWidth: number; targetWidth: number }> = [];
    const isResizing = false;

    const onSaveDraft = useCallback(async () => {
        compose.setIsSaving(true);
        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    caption: compose.caption,
                    firstComment: compose.firstComment,
                    platformAccountIds: compose.selectedAccountIds,
                    mediaIds: compose.media.map((m) => m.id),
                    scheduledAt: null,
                    autoPublish: false,
                    platformSettings: compose.effectiveAccountSettings,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menyimpan draft");
            compose.router.back();
        } catch {
            // ignore
        } finally {
            compose.setIsSaving(false);
        }
    }, [compose]);

    const onScheduleConfirm = useCallback(async () => {
        compose.setIsScheduling(true);
        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    caption: compose.caption,
                    firstComment: compose.firstComment,
                    platformAccountIds: compose.selectedAccountIds,
                    mediaIds: compose.media.map((m) => m.id),
                    scheduledAt: new Date(`${compose.scheduledDate}T${compose.scheduledTime}`).toISOString(),
                    autoPublish: true,
                    platformSettings: compose.effectiveAccountSettings,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menjadwalkan post");
            compose.setIsScheduleModalOpen(false);
            compose.router.back();
        } catch {
            // ignore
        } finally {
            compose.setIsScheduling(false);
        }
    }, [compose]);

    const onPublishNow = useCallback(async () => {
        compose.setIsPublishing(true);
        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    caption: compose.caption,
                    firstComment: compose.firstComment,
                    platformAccountIds: compose.selectedAccountIds,
                    mediaIds: compose.media.map((m) => m.id),
                    scheduledAt: null,
                    autoPublish: true,
                    platformSettings: compose.effectiveAccountSettings,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal menerbitkan post");
            compose.router.back();
        } catch {
            // ignore
        } finally {
            compose.setIsPublishing(false);
        }
    }, [compose]);

    const onDiscardDraft = useCallback(async () => {
        compose.resetForm();
    }, [compose]);

    const onDeletePost = useCallback(async () => {
        if (!compose.editPostId) return;
        setIsDeleting(true);
        try {
            await fetch(`/api/posts/${compose.editPostId}`, { method: "DELETE" });
            compose.router.back();
        } catch {
            // ignore
        } finally {
            setIsDeleting(false);
        }
    }, [compose]);

    return {
        compose,
        isOnline: true,
        showValidationDetails, setShowValidationDetails,
        showDeleteConfirm, setShowDeleteConfirm,
        isDeleting,
        showActionMenu, setShowActionMenu,
        autoResizeEnabled, setAutoResizeEnabled,
        resizedMedia, resizeAlerts, isResizing,
        dropHandlers, isDragOver, isDropUploading, dropProgress,
        validationContext, validationSummary, hasValidationErrors,
        isPostPublishing, isPostFailed, isStuckPublishing, hasChanges, hasTranscodingMedia,
        onSaveDraft, onScheduleConfirm, onPublishNow, onDiscardDraft, onDeletePost,
    };
}
