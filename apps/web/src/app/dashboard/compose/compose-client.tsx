"use client";

import { X, Save, Send, Loader2, Clock, Trash2, CloudOff, AlertCircle, ChevronDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { useComposeOrchestration } from "@/hooks/use-compose-orchestration";
import { ProfileSelector } from "@/components/compose/profile-selector";
import { TabbedPlatformEditor } from "@/components/compose/tabbed-platform-editor";
import { CustomizationPanel } from "@/components/compose/customization-panel";
import { PlatformPreview } from "@/components/compose/platform-previews";
import { AICaptionGenerator } from "@/components/compose/ai-caption-generator";
import { MediaUploadModal } from "@/components/compose/media-upload-modal";
import { TemplatePicker } from "@/components/compose/template-picker";
import { ScheduleModal } from "@/components/compose/schedule-modal";

interface ComposeClientProps {
    orch: ReturnType<typeof useComposeOrchestration>;
}

export function ComposeClient({ orch }: ComposeClientProps) {
    const {
        compose,
        showValidationDetails, setShowValidationDetails,
        showDeleteConfirm, setShowDeleteConfirm,
        isDeleting,
        showActionMenu, setShowActionMenu,
        dropHandlers, isDragOver, isDropUploading, dropProgress,
        hasValidationErrors, validationSummary,
        isPostPublishing, isPostFailed, isStuckPublishing, hasChanges, hasTranscodingMedia,
        onSaveDraft, onScheduleConfirm, onPublishNow, onDiscardDraft, onDeletePost,
    } = orch;

    if (compose.accountsError) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="text-accent-red">Gagal memuat akun</div>
                    <p className="text-sm text-muted-foreground">{compose.accountsError}</p>
                    <Button onClick={() => window.location.reload()}>Coba lagi</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="relative flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
                {...dropHandlers}
            >
                {isDragOver && (
                    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center rounded-2xl border-4 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
                        <Upload className="mb-3 h-12 w-12 text-primary animate-bounce" />
                        <p className="text-lg font-semibold text-primary">Drop file untuk upload</p>
                        <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG, WebP, GIF, MP4</p>
                    </div>
                )}
                {isDropUploading && (
                    <div className="absolute inset-x-0 top-0 z-[60]">
                        <div className="h-1 bg-primary transition-all duration-300" style={{ width: `${dropProgress}%` }} />
                    </div>
                )}

                <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold">{compose.editPostId ? "Edit Post" : "Post Baru"}</h1>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {compose.selectedAccountIds.length} akun dipilih
                        </span>
                        {hasChanges && <span className="rounded-full bg-accent-green/10 px-2 py-0.5 text-xs text-accent-green">Tersimpan</span>}
                        {!orch.isOnline && (
                            <span className="flex items-center gap-1 rounded-full bg-accent-amber/10 px-2 py-0.5 text-xs font-medium text-accent-amber">
                                <CloudOff className="h-3 w-3" />
                                Offline
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => compose.router.back()}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </header>

                {isPostPublishing && (
                    <div className="flex items-center gap-4 border-b border-accent-amber/20 bg-accent-amber/10 px-6 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-accent-amber" />
                        <span className="text-sm font-medium text-accent-amber">
                            {isStuckPublishing ? "Publishing macet" : "Sedang publish..."}
                        </span>
                    </div>
                )}
                {isPostFailed && (
                    <div className="flex items-center gap-4 border-b border-accent-red/20 bg-accent-red/10 px-6 py-3">
                        <AlertCircle className="h-4 w-4 text-accent-red" />
                        <span className="text-sm font-medium text-accent-red">Post gagal diterbitkan</span>
                    </div>
                )}

                <div className="flex flex-1 overflow-hidden">
                    <div className="w-[240px] flex-shrink-0 border-r border-border overflow-hidden">
                        <ProfileSelector
                            accounts={compose.accounts}
                            selected={compose.selectedAccountIds}
                            onSelectionChange={compose.setSelectedAccountIds}
                            groupBy="platform"
                        />
                    </div>

                    <div className="flex-1 min-w-[380px] max-w-[520px] overflow-hidden border-r border-border">
                        <TabbedPlatformEditor
                            caption={compose.caption}
                            onCaptionChange={compose.setCaption}
                            platformCaptions={compose.platformCaptions}
                            onPlatformCaptionChange={compose.handlePlatformCaptionChange}
                            selectedPlatforms={compose.uniquePlatforms}
                            selectedAccounts={compose.selectedAccounts}
                            media={compose.media}
                            onMediaChange={compose.setMedia}
                            onAIAssist={compose.handleAIAssist}
                            onAddMedia={compose.handleAddMedia}
                            onOpenTemplates={compose.handleOpenTemplates}
                            firstComment={compose.firstComment}
                            onFirstCommentChange={compose.setFirstComment}
                            platformFirstComments={compose.platformFirstComments}
                            onPlatformFirstCommentChange={compose.handlePlatformFirstCommentChange}
                            onActivePlatformChange={compose.handleActivePlatformChange}
                        />
                    </div>

                    {compose.selectedAccounts.length > 0 && compose.activeAccount && (
                        <div className="flex-1 min-w-[440px] max-w-[560px] border-r border-border overflow-y-auto">
                            <CustomizationPanel
                                platforms={compose.uniquePlatforms}
                                activePlatform={compose.activeAccount.platform}
                                onActivePlatformChange={compose.handleActivePlatformChange}
                                settings={compose.activePlatformSettings}
                                onSettingsChange={compose.handlePlatformSettingsChange}
                                caption={compose.activeCaption}
                                media={compose.media}
                                onAddMedia={compose.handleAddMedia}
                                onMediaChange={compose.setMedia}
                                firstComment={compose.firstComment}
                                onFirstCommentChange={compose.setFirstComment}
                                selectedAccounts={compose.selectedAccounts}
                                isCarouselMode={compose.isCarouselMode}
                                pillarId={compose.pillarId}
                                onPillarChange={compose.setPillarId}
                                hashtagCollectionIds={compose.hashtagCollectionIds}
                                onHashtagCollectionChange={compose.setHashtagCollectionIds}
                            />
                        </div>
                    )}

                    <div className="w-[280px] flex-shrink-0 overflow-y-auto bg-card">
                        <div className="p-3">
                            {compose.selectedAccounts.length > 0 && compose.activeAccount && (
                                <div>
                                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</h4>
                                    <PlatformPreview
                                        platform={compose.activeAccount.platform}
                                        postType={compose.effectiveAccountSettings[compose.activeAccount.id]?.postType || "feed"}
                                        caption={compose.activeCaption}
                                        media={compose.media}
                                        accountName={compose.activeAccount.name}
                                        accountAvatar={compose.activeAccount.avatar}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="border-t border-border bg-card px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            {compose.editPostId && (
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={compose.isSubmitting || isDeleting}
                                    className="text-accent-red hover:text-accent-red hover:bg-accent-red/10"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Hapus Post
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="secondary"
                                onClick={onSaveDraft}
                                loading={compose.isSaving}
                                disabled={compose.isSubmitting}
                            >
                                {!compose.isSaving && <Save className="mr-2 h-4 w-4" />}
                                Simpan Draft
                            </Button>
                            <div className="relative">
                                <div className="flex">
                                    <Button
                                        onClick={onPublishNow}
                                        disabled={compose.isSubmitting || hasValidationErrors || hasTranscodingMedia || (isPostPublishing && !isStuckPublishing)}
                                        className="rounded-r-none border-r border-white/20"
                                    >
                                        {hasTranscodingMedia ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memproses video...</>
                                        ) : hasValidationErrors ? (
                                            <><AlertCircle className="mr-2 h-4 w-4" />Perbaiki {validationSummary.errors} error</>
                                        ) : isPostPublishing && !isStuckPublishing ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing...</>
                                        ) : compose.editPostId ? "Simpan Perubahan" : "Terbitkan"}
                                    </Button>
                                    <Button
                                        onClick={() => setShowActionMenu(!showActionMenu)}
                                        disabled={compose.isSubmitting}
                                        className="rounded-l-none px-2"
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </div>
                                {showActionMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowActionMenu(false)} />
                                        <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[200px] rounded-lg border border-border bg-background py-1 shadow-xl">
                                            <button
                                                onClick={() => { setShowActionMenu(false); onPublishNow(); }}
                                                disabled={compose.isSubmitting || hasValidationErrors}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
                                            >
                                                {compose.isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                                Terbitkan sekarang
                                            </button>
                                            <button
                                                onClick={() => { setShowActionMenu(false); compose.handleOpenScheduleModal(); }}
                                                disabled={compose.isSubmitting}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
                                            >
                                                <Clock className="h-4 w-4" />
                                                Jadwalkan
                                            </button>
                                            <div className="my-1 border-t border-border" />
                                            <button
                                                onClick={() => { setShowActionMenu(false); onSaveDraft(); }}
                                                disabled={compose.isSubmitting}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
                                            >
                                                <Save className="h-4 w-4" />
                                                Simpan draft
                                            </button>
                                            <button
                                                onClick={() => { setShowActionMenu(false); onDiscardDraft(); }}
                                                disabled={compose.isSubmitting}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-accent-red hover:bg-muted disabled:opacity-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Buang perubahan
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </footer>

                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl mx-4">
                            <h2 className="text-lg font-semibold mb-2">Hapus Post?</h2>
                            <p className="text-sm text-muted-foreground mb-6">Post yang dijadwalkan akan dihapus secara permanen.</p>
                            <div className="flex gap-3 justify-end">
                                <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Batal</Button>
                                <Button variant="destructive" onClick={onDeletePost} loading={isDeleting}>Hapus Post</Button>
                            </div>
                        </div>
                    </div>
                )}

                {compose.isAIModalOpen && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background shadow-2xl">
                            <button
                                onClick={() => compose.setIsAIModalOpen(false)}
                                className="absolute right-3 top-3 z-10 rounded-md bg-muted p-1 hover:bg-muted/80"
                            >
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

                <ScheduleModal
                    open={compose.isScheduleModalOpen}
                    onClose={() => compose.setIsScheduleModalOpen(false)}
                    onConfirm={compose.handleScheduleConfirm}
                    loading={compose.isScheduling}
                />
            </div>
        </div>
    );
}
