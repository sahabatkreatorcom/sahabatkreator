"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "sahabat-kreator-compose";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const QUEUE_STORE = "publish-queue";

async function getDB(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(DRAFT_STORE)) {
                db.createObjectStore(DRAFT_STORE, { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
            }
        },
    });
}

export interface DraftData {
    key: string;
    caption: string;
    firstComment: string;
    selectedAccountIds: string[];
    mediaIds: string[];
    scheduledDate: string;
    scheduledTime: string;
    updatedAt: number;
}

export async function saveDraft(data: Omit<DraftData, "updatedAt">): Promise<void> {
    const db = await getDB();
    await db.put(DRAFT_STORE, { ...data, updatedAt: Date.now() });
}

export async function loadDraft(key: string): Promise<DraftData | null> {
    const db = await getDB();
    return (await db.get(DRAFT_STORE, key)) || null;
}

export async function deleteDraft(key: string): Promise<void> {
    const db = await getDB();
    await db.delete(DRAFT_STORE, key);
}

export interface OfflinePublishEntry {
    id?: number;
    caption: string;
    firstComment: string;
    platformAccountIds: string[];
    mediaIds: string[];
    scheduledAt: string | null;
    autoPublish: boolean;
    platformSettings: Record<string, unknown>;
    organizationId?: string;
    createdAt: number;
}

export async function queueOfflinePost(entry: OfflinePublishEntry): Promise<void> {
    const db = await getDB();
    await db.add(QUEUE_STORE, { ...entry, createdAt: Date.now() });
}

export async function getOfflineQueue(): Promise<OfflinePublishEntry[]> {
    const db = await getDB();
    return db.getAll(QUEUE_STORE);
}

export async function removeOfflinePost(id: number): Promise<void> {
    const db = await getDB();
    await db.delete(QUEUE_STORE, id);
}

export async function clearOfflineQueue(): Promise<void> {
    const db = await getDB();
    await db.clear(QUEUE_STORE);
}

export function useOnlineStatus(): boolean {
    if (typeof window === "undefined") return true;
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return isOnline;
}

export function useOfflinePublish(options: { organizationId?: string; isOnline: boolean }) {
    const publishOffline = useCallback(
        async (entry: Omit<OfflinePublishEntry, "createdAt">) => {
            await queueOfflinePost({ ...entry, organizationId: options.organizationId, createdAt: Date.now() });
        },
        [options.organizationId],
    );

    useEffect(() => {
        if (!options.isOnline) return;
        (async () => {
            const queue = await getOfflineQueue();
            if (queue.length === 0) return;
            for (const entry of queue) {
                try {
                    const res = await fetch("/api/posts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            caption: entry.caption,
                            firstComment: entry.firstComment,
                            platformAccountIds: entry.platformAccountIds,
                            mediaIds: entry.mediaIds,
                            scheduledAt: entry.scheduledAt,
                            autoPublish: entry.autoPublish,
                            platformSettings: entry.platformSettings,
                        }),
                    });
                    if (res.ok && entry.id) await removeOfflinePost(entry.id);
                } catch {
                    // will retry on next online event
                }
            }
        })();
    }, [options.isOnline]);

    return { publishOffline };
}

export function useDraftCache(options: {
    organizationId?: string;
    editPostId: string | null;
    caption: string;
    media: Array<{ id: string }>;
    selectedAccountIds: string[];
    scheduledDate: string;
    selectedDate: Date;
    setCaption: (v: string) => void;
    setSelectedAccountIds: (v: string[] | ((prev: string[]) => string[])) => void;
}) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (options.editPostId) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const key = `draft-${options.organizationId || "default"}`;
            saveDraft({
                key,
                caption: options.caption,
                firstComment: "",
                selectedAccountIds: options.selectedAccountIds,
                mediaIds: options.media.map((m) => m.id),
                scheduledDate: options.scheduledDate,
                scheduledTime: "09:00",
            });
        }, 3000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [options.caption, options.media, options.selectedAccountIds, options.scheduledDate, options.editPostId, options.organizationId]);

    useEffect(() => {
        if (options.editPostId) return;
        (async () => {
            const key = `draft-${options.organizationId || "default"}`;
            const draft = await loadDraft(key);
            if (draft) {
                if (draft.caption) options.setCaption(draft.caption);
                if (draft.selectedAccountIds.length > 0) options.setSelectedAccountIds(draft.selectedAccountIds);
            }
        })();
    }, [options.editPostId, options.organizationId]);
}
