"use client";

import { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarClock, ImagePlus, Bold, Italic, List, Hash, AtSign, Sparkles, Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useComposeOrchestration } from "@/hooks/use-compose-orchestration";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform, getCharacterLimit } from "@/lib/platform-config";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { mediaFileUrl } from "@/lib/media-file-url";
import { CharacterRingRow } from "@/components/compose/character-ring";
import { AICaptionGenerator } from "@/components/compose/ai-caption-generator";
import { MediaUploadModal } from "@/components/compose/media-upload-modal";
import { TemplatePicker } from "@/components/compose/template-picker";

interface ComposeMobileProps {
    orch: ReturnType<typeof useComposeOrchestration>;
}

const STEPS = ["Akun", "Konten", "Preview"];

export default function ComposeMobile({ orch }: ComposeMobileProps) {
    const { compose, onSaveDraft, onScheduleConfirm } = orch;
    const [step, setStep] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const canProceed = step === 0 ? compose.selectedAccountIds.length > 0 : true;

    const uniquePlatforms = [...new Set(compose.selectedAccounts.map((a) => a.platform))];
    const charCount = compose.caption.length;

    const insertText = useCallback(
        (text: string) => {
            const ta = textareaRef.current;
            if (!ta) { compose.setCaption(compose.caption + text); return; }
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const newValue = compose.caption.substring(0, start) + text + compose.caption.substring(end);
            compose.setCaption(newValue);
            setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + text.length; ta.focus(); }, 0);
        },
        [compose.caption, compose.setCaption],
    );

    return (
        <div className="flex h-dvh flex-col bg-background">
            <header className="shrink-0 border-b border-border bg-card px-4 py-3 safe-area-top">
                <div className="flex items-center justify-between">
                    <button onClick={() => compose.router.back()} className="p-1 -ml-1">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h1 className="text-sm font-semibold">{compose.editPostId ? "Edit Post" : "Post Baru"}</h1>
                    <div className="w-8" />
                </div>
                <div className="mt-3 flex gap-1">
                    {STEPS.map((_, i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
                    ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                    {STEPS.map((s, i) => (
                        <span key={s} className={i === step ? "font-medium text-primary" : ""}>{s}</span>
                    ))}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4">
                {step === 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Pilih akun</p>
                        {compose.accounts.map((account) => {
                            const selected = compose.selectedAccountIds.includes(account.id);
                            return (
                                <button
                                    key={account.id}
                                    onClick={() => compose.setSelectedAccountIds((prev) => selected ? prev.filter((id) => id !== account.id) : [...prev, account.id])}
                                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card"}`}
                                >
                                    <div className="relative shrink-0">
                                        <span
                                            className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                                            style={{ background: PLATFORM_COLORS[account.platform] }}
                                        >
                                            {account.avatar ? (
                                                <img src={account.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                                            ) : (
                                                <PlatformIcon platform={account.platform} size={20} />
                                            )}
                                        </span>
                                        {account.avatar && (
                                            <span
                                                className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background"
                                                style={{ background: PLATFORM_COLORS[account.platform] }}
                                            >
                                                <PlatformIcon platform={account.platform} size={10} />
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{account.name}</p>
                                        <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[account.platform]}</p>
                                    </div>
                                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                                        {selected && (
                                            <svg className="h-3.5 w-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-3">
                        <textarea
                            ref={textareaRef}
                            value={compose.caption}
                            onChange={(e) => compose.setCaption(e.target.value)}
                            placeholder="Tulis caption kontenmu..."
                            rows={6}
                            className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 px-1.5 py-1">
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
                            <div className="mx-0.5 h-4 w-px bg-border" />
                            <button onClick={() => compose.handleAIAssist()} className="rounded p-1 text-muted-foreground hover:bg-muted" title="AI Assist">
                                <Sparkles className="h-4 w-4" />
                            </button>
                            <button onClick={() => compose.handleAddMedia()} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Media">
                                <ImagePlus className="h-4 w-4" />
                            </button>
                            <button onClick={() => compose.handleOpenTemplates()} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Template">
                                <Bookmark className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <CharacterRingRow platforms={uniquePlatforms} currentLength={charCount} />
                        </div>
                        <button
                            onClick={() => compose.handleAddMedia()}
                            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-5 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
                        >
                            <ImagePlus className="h-5 w-5" />
                            <span className="text-sm font-medium">Tambah Media</span>
                        </button>
                        {compose.media.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                                {compose.media.map((m) => (
                                    <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                                        {m.type === "video" ? (
                                            <video src={mediaFileUrl(m.url)} poster={mediaFileUrl(m.thumbnailUrl)} className="h-full w-full object-cover" muted />
                                        ) : (
                                            <img src={mediaFileUrl(m.thumbnailUrl || m.url)} alt="" className="h-full w-full object-cover" />
                                        )}
                                        <button
                                            onClick={() => compose.setMedia(compose.media.filter((x) => x.id !== m.id))}
                                            className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Akun</p>
                            <div className="flex flex-wrap gap-2">
                                {compose.selectedAccounts.map((a) => (
                                    <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: PLATFORM_COLORS[a.platform] }}>
                                        <PlatformIcon platform={a.platform} size={12} />
                                        {a.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Caption</p>
                            <p className="text-sm whitespace-pre-wrap">{compose.caption || "(kosong)"}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Media</p>
                            <p className="text-sm">{compose.media.length} file</p>
                        </div>
                    </div>
                )}
            </main>

            <footer className="shrink-0 border-t border-border bg-card px-4 py-3 safe-area-bottom">
                <div className="flex gap-2">
                    {step > 0 && (
                        <Button variant="secondary" onClick={() => setStep((s) => s - 1)} className="flex-1">
                            <ChevronLeft className="mr-1 h-4 w-4" /> Kembali
                        </Button>
                    )}
                    {step < STEPS.length - 1 ? (
                        <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed} className="flex-1">
                            Lanjut <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={onSaveDraft} loading={compose.isSaving} className="flex-1">
                                Draft
                            </Button>
                            <Button onClick={onScheduleConfirm} loading={compose.isScheduling} className="flex-1">
                                <CalendarClock className="mr-1 h-4 w-4" /> Terbitkan
                            </Button>
                        </>
                    )}
                </div>
            </footer>

            {compose.isAIModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="relative max-h-[85vh] w-[92vw] max-w-lg overflow-y-auto rounded-xl bg-background shadow-2xl">
                        <button onClick={() => compose.setIsAIModalOpen(false)} className="absolute right-3 top-3 z-10 rounded-md bg-muted p-1 hover:bg-muted/80">
                            <X className="h-4 w-4" />
                        </button>
                        <AICaptionGenerator
                            onSelect={compose.handleAICaptionSelect}
                            platform={compose.aiPlatform || "INSTAGRAM"}
                            currentDraft={compose.caption}
                        />
                    </div>
                </div>
            )}

            <MediaUploadModal
                open={compose.isMediaModalOpen}
                onClose={() => compose.setIsMediaModalOpen(false)}
                onSelect={compose.handleMediaUpload}
            />

            <TemplatePicker
                open={compose.isTemplatePickerOpen}
                onClose={() => compose.setIsTemplatePickerOpen(false)}
                onSelect={compose.handleTemplateSelect}
            />
        </div>
    );
}
