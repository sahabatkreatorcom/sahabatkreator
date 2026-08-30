"use client";

import { useState, useCallback } from "react";

export function useComposeSubmission(editPostId: string | null, setEditPostStatus: (status: string) => void) {
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    const isSubmitting = isSaving || isScheduling || isPublishing || isRetrying;

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
    }, [editPostId, isRetrying, setEditPostStatus]);

    return {
        isSaving, setIsSaving,
        isScheduling, setIsScheduling,
        isPublishing, setIsPublishing,
        isRetrying, retryPublish,
        isSubmitting,
    };
}
