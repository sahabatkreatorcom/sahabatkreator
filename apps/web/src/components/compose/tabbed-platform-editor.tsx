"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Bold, Italic, List, Hash, AtSign, Smile, Image, Sparkles, Bookmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Platform, getCharacterLimit } from "@/lib/platform-config";
import { type SocialAccount } from "@/components/compose/profile-selector";
import type { ComposeMediaItem } from "@/hooks/use-compose";
import { CharacterRingRow } from "@/components/compose/character-ring";
import { mediaFileUrl } from "@/lib/media-file-url";

type EditorTab = "all" | Platform;

interface TabbedPlatformEditorProps {
    caption: string;
    onCaptionChange: (caption: string) => void;
    platformCaptions?: Partial<Record<Platform, string>>;
    onPlatformCaptionChange?: (platform: Platform, caption: string) => void;
    selectedPlatforms: Platform[];
    selectedAccounts?: SocialAccount[];
    media: ComposeMediaItem[];
    onMediaChange: (media: ComposeMediaItem[]) => void;
    onAIAssist?: (platform?: Platform | null) => void;
    onAddMedia?: () => void;
    onOpenTemplates?: () => void;
    firstComment?: string;
    onFirstCommentChange?: (value: string) => void;
    platformFirstComments?: Partial<Record<Platform, string>>;
    onPlatformFirstCommentChange?: (platform: Platform, value: string) => void;
    onActivePlatformChange?: (platform: Platform) => void;
    isAIRewriting?: boolean;
}

export function TabbedPlatformEditor({
    caption,
    onCaptionChange,
    platformCaptions,
    onPlatformCaptionChange,
    selectedPlatforms,
    media,
    onMediaChange,
    onAIAssist,
    onAddMedia,
    onOpenTemplates,
    firstComment,
    onFirstCommentChange,
    onActivePlatformChange,
    isAIRewriting,
}: TabbedPlatformEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>("all");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const currentCaption = useMemo(() => {
        if (activeTab === "all") return caption;
        return platformCaptions?.[activeTab] || caption;
    }, [activeTab, caption, platformCaptions]);

    const handleCaptionChange = useCallback(
        (value: string) => {
            if (activeTab === "all") onCaptionChange(value);
            else onPlatformCaptionChange?.(activeTab, value);
        },
        [activeTab, onCaptionChange, onPlatformCaptionChange],
    );

    const insertText = useCallback(
        (text: string) => {
            const ta = textareaRef.current;
            if (!ta) { handleCaptionChange(currentCaption + text); return; }
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newValue = currentCaption.substring(0, start) + text + currentCaption.substring(end);
            handleCaptionChange(newValue);
            setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + text.length; ta.focus(); }, 0);
        },
        [currentCaption, handleCaptionChange],
    );

    const charCount = currentCaption.length;
    const platformsToShow = activeTab === "all" ? selectedPlatforms : [activeTab];

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="flex gap-1">
                    <button
                        onClick={() => { setActiveTab("all"); onActivePlatformChange?.(selectedPlatforms[0]); }}
                        className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", activeTab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                    >
                        Semua
                    </button>
                    {selectedPlatforms.map((p) => (
                        <button
                            key={p}
                            onClick={() => { setActiveTab(p); onActivePlatformChange?.(p); }}
                            className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", activeTab === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                        >
                            {p}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    {onOpenTemplates && (
                        <button onClick={onOpenTemplates} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Template">
                            <Bookmark className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={currentCaption}
                        onChange={(e) => handleCaptionChange(e.target.value)}
                        placeholder="Tulis caption kontenmu..."
                        rows={8}
                        className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                        <button onClick={() => insertText("**")} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Bold">
                            <Bold className="h-4 w-4" />
                        </button>
                        <button onClick={() => insertText("_")} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Italic">
                            <Italic className="h-4 w-4" />
                        </button>
                        <button onClick={() => insertText("\n- ")} className="rounded p-1 text-muted-foreground hover:bg-muted" title="List">
                            <List className="h-4 w-4" />
                        </button>
                        <button onClick={() => insertText("#")} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Hashtag">
                            <Hash className="h-4 w-4" />
                        </button>
                        <button onClick={() => insertText("@")} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Mention">
                            <AtSign className="h-4 w-4" />
                        </button>
                        <div className="mx-1 h-4 w-px bg-border" />
                        {onAIAssist && (
                            <button onClick={() => onAIAssist(activeTab === "all" ? null : activeTab)} className="rounded p-1 text-muted-foreground hover:bg-muted" title="AI Assist">
                                {isAIRewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            </button>
                        )}
                        {onAddMedia && (
                            <button onClick={onAddMedia} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Media">
                                <Image className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <CharacterRingRow platforms={platformsToShow} currentLength={charCount} />
                </div>

                {media.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {media.map((m) => (
                            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                                {m.type === "video" ? (
                                    <video src={mediaFileUrl(m.url)} poster={mediaFileUrl(m.thumbnailUrl)} className="h-full w-full object-cover" muted preload="metadata" />
                                ) : (
                                    <img src={mediaFileUrl(m.thumbnailUrl || m.url)} alt="" className="h-full w-full object-cover" />
                                )}
                                <button
                                    onClick={() => onMediaChange(media.filter((x) => x.id !== m.id))}
                                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                    <span className="sr-only">Hapus</span>×
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
