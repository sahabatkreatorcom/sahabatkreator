"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DropHandlers {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"];
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function useComposerDrop(onMediaUploaded: (files: Array<{ id: string; url: string; type: string; size: number; mimeType: string; filename: string }>) => void) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const dragCounterRef = useRef(0);

    const uploadFiles = useCallback(
        async (files: File[]) => {
            const valid = files.filter((f) => ACCEPTED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE);
            if (valid.length === 0) return;

            setIsUploading(true);
            setProgress(0);

            try {
                const results = await Promise.all(
                    valid.map(async (file, idx) => {
                        const fd = new FormData();
                        fd.set("file", file);
                        const res = await fetch("/api/media", { method: "POST", body: fd });
                        if (!res.ok) throw new Error("Upload gagal");
                        const data = await res.json();
                        setProgress(((idx + 1) / valid.length) * 100);
                        return {
                            id: data.id,
                            url: data.url,
                            type: data.type,
                            size: data.size,
                            mimeType: data.mimeType || file.type,
                            filename: data.filename || file.name,
                        };
                    }),
                );
                onMediaUploaded(results);
            } catch {
                // ignore
            } finally {
                setIsUploading(false);
                setProgress(0);
            }
        },
        [onMediaUploaded],
    );

    const handlers: DropHandlers = {
        onDragEnter: useCallback((e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current++;
            if (dragCounterRef.current === 1) setIsDragOver(true);
        }, []),
        onDragLeave: useCallback((e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current--;
            if (dragCounterRef.current === 0) setIsDragOver(false);
        }, []),
        onDragOver: useCallback((e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        }, []),
        onDrop: useCallback(
            (e: React.DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                dragCounterRef.current = 0;
                setIsDragOver(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) uploadFiles(files);
            },
            [uploadFiles],
        ),
    };

    return { dropHandlers: handlers, isDragOver, isUploading, progress };
}
