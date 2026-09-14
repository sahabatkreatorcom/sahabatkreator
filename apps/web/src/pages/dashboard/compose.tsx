// Halaman Compose — buat konten multi-platform dengan jadwal.
// Layout 3 zona ala Buffer:
//   1. Editor utama (kiri): pilih akun → caption/toolbar alat → media → pengaturan
//   2. Live preview sticky (kanan atas): tab per platform
//   3. Submit bar (kanan bawah): skor prediksi + tombol aksi
// Logic form ada di hook useComposeForm — halaman ini fokus presentasi.
import { CloudCheck, Eraser, Eye, Save, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccountSelector } from "@/components/compose/account-selector";
import { AiComposerPanel } from "@/components/compose/ai-panel";
import {
  PreviewEmptyState,
  PublishModeSelector,
  SubmitBar,
} from "@/components/compose/compose-actions";
import { type ComposeTool, ComposeTools } from "@/components/compose/compose-tools";
import { CHAR_LIMITS } from "@/components/compose/compose-types";
import { CsvImportPanel } from "@/components/compose/csv-import-panel";
import { EmojiPicker } from "@/components/compose/emoji-picker";
import { MediaSection } from "@/components/compose/media-section";
import { OptimalTimesPanel } from "@/components/compose/optimal-times-panel";
import { PlatformPreviews } from "@/components/compose/platform-previews";
import { PlatformSettingsPanel } from "@/components/compose/platform-settings-panel";
import { PredictScoreBadge } from "@/components/compose/predict-score-badge";
import { ProductPicker } from "@/components/compose/product-picker";
import { SoundPicker } from "@/components/compose/sound-picker";
import { StrategyAssetsPanel } from "@/components/compose/strategy-assets-panel";
import { UtmPanel } from "@/components/compose/utm-panel";
import { ValidationPanel } from "@/components/compose/validation-panel";
import { VariationsPanel } from "@/components/compose/variations-panel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useComposeForm } from "@/hooks/use-compose-form";
import { PLATFORMS } from "@/lib/platforms";

export function ComposePage() {
  const compose = useComposeForm();
  // Tab aktif di kartu Konten: caption utama vs variasi per platform
  const [contentTab, setContentTab] = useState<"base" | "variations">("base");

  const {
    content,
    setContent,
    hashtags,
    setHashtags,
    selectedAccounts,
    toggleAccount,
    selectedMedia,
    soundTrack,
    setSoundTrack,
    productIds,
    setProductIds,
    variations,
    setVariations,
    hashtagVariations,
    setHashtagVariations,
    platformSettings,
    setPlatformSettings,
    scheduleMode,
    setScheduleMode,
    scheduledAt,
    setScheduledAt,
    editingMedia,
    setEditingMedia,
    accounts,
    aiPlatform,
    createPost,
    uploadMedia,
    resizeMedia,
    handleSubmit,
    replaceEditedMedia,
    clearAll,
    saveNow,
    handleClipboardPaste,
    dropZoneProps,
    isDragOver,
    savedAtLabel,
    validationIssues,
    hasValidationErrors,
    hasChanges,
  } = compose;

  // Platform yang dipilih user — untuk badge batas karakter.
  // instagram_standalone memakai limit instagram yang sama.
  const selectedPlatforms = new Set(
    selectedAccounts.map((id) =>
      accounts.find((a) => a.id === id)?.platform.replace("instagram_standalone", "instagram"),
    ),
  );

  // Preview hanya relevan saat ada akun terpilih & konten/media terisi
  const hasPreviewContent =
    selectedAccounts.length > 0 && (content.trim() !== "" || selectedMedia.length > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header halaman + indikator autosave + aksi bersihkan */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl">Buat Konten</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Tulis sekali, tayang di semua platform terpilih
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAtLabel && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-light)] px-2.5 py-1 text-[var(--text-muted)] text-xs"
              title={`Draft tersimpan otomatis pukul ${savedAtLabel} (lokal di perangkat ini)`}
            >
              <CloudCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Tersimpan {savedAtLabel}
            </span>
          )}
          <span
            className="hidden rounded-full border border-[var(--border-light)] px-2.5 py-1 text-[var(--text-muted)] text-xs md:inline-flex"
            title="Ctrl+Enter untuk publish, Ctrl+S untuk simpan draft"
          >
            <kbd className="mr-1 font-mono">Ctrl</kbd>+<kbd className="mx-1 font-mono">Enter</kbd>
            publish
          </span>
          <button
            type="button"
            onClick={() => {
              if (
                !hasChanges ||
                window.confirm(
                  "Bersihkan seluruh isi composer? Tindakan ini tidak bisa dibatalkan.",
                )
              ) {
                clearAll();
                toast.success("Composer dibersihkan");
              }
            }}
            disabled={!hasChanges}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text-secondary)] text-xs transition-colors hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            title="Reset form ke kondisi kosong"
          >
            <span className="flex items-center gap-1.5">
              <Eraser className="h-3.5 w-3.5" />
              Bersihkan
            </span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        {/* ============ Zona 1: Editor utama (dropzone file) ============ */}
        <div
          className={`min-w-0 space-y-6 rounded-[var(--radius-lg)] ${
            isDragOver ? "outline-dashed outline-2 outline-[var(--accent-gold)]" : ""
          }`}
          {...dropZoneProps}
        >
          {/* Overlay indikator saat file di-drag ke atas */}
          {isDragOver && (
            <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-black/30">
              <div className="card flex flex-col items-center gap-2 p-8">
                <Upload className="h-8 w-8 text-[var(--accent-gold)]" />
                <p className="font-semibold">Lepaskan file untuk melampirkan</p>
                <p className="text-[var(--text-muted)] text-xs">
                  Gambar atau video akan otomatis di-upload
                </p>
              </div>
            </div>
          )}
          {/* Pilih akun */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Pilih Akun</h2>
              {accounts.length > 0 && (
                <span className="text-[var(--text-muted)] text-xs">
                  {selectedAccounts.length}/{accounts.length} dipilih
                </span>
              )}
            </div>
            <AccountSelector
              accounts={accounts}
              selectedIds={selectedAccounts}
              onToggle={toggleAccount}
            />
          </div>

          {/* Konten — caption utama + tab variasi per platform */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Konten</h2>
              <span className="text-[var(--text-muted)] text-xs">{content.length} karakter</span>
            </div>

            {/* Tab: Caption Utama | Variasi per Platform */}
            <div className="mb-4 flex gap-1 border-[var(--border-light)] border-b">
              {(
                [
                  { value: "base", label: "Caption Utama" },
                  { value: "variations", label: "Variasi per Platform" },
                ] as const
              ).map((tab) => {
                const isActive = contentTab === tab.value;
                // Indikator dot pada tab Variasi bila ada caption custom terisi
                const hasCustom = Object.values(variations).some((v) => v?.trim());
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setContentTab(tab.value)}
                    className={`relative flex items-center gap-1.5 px-3 pb-2.5 text-sm transition-colors ${
                      isActive
                        ? "border-[var(--accent-gold)] border-b-2 font-medium"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {tab.label}
                    {tab.value === "variations" && hasCustom && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)]" />
                    )}
                  </button>
                );
              })}
            </div>

            {contentTab === "base" ? (
              <>
                <Textarea
                  placeholder="Tulis caption Anda di sini... gunakan {emoji} untuk menyemangati!"
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={handleClipboardPaste}
                />
                {/* Aksi cepat caption: emoji + simpan draft */}
                <div className="mt-2 flex items-center justify-between">
                  <EmojiPicker onPick={(emoji) => setContent((prev) => `${prev}${emoji}`)} />
                  <button
                    type="button"
                    onClick={() => {
                      const saved = saveNow();
                      if (saved) toast.success("Draft disimpan");
                      else toast.error("Belum ada konten untuk disimpan");
                    }}
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text-secondary)] text-xs transition-colors hover:border-[var(--accent-gold)]"
                    title="Simpan draft ke perangkat ini (Ctrl+S)"
                  >
                    <span className="flex items-center gap-1.5">
                      <Save className="h-3.5 w-3.5" />
                      Simpan Draft
                    </span>
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(CHAR_LIMITS)
                    .filter(([platform]) => selectedPlatforms.has(platform))
                    .map(([platform, limit]) => (
                      <Badge
                        key={platform}
                        variant={content.length > limit ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform}:{" "}
                        {content.length}/{limit}
                      </Badge>
                    ))}
                </div>
              </>
            ) : (
              <VariationsPanel
                selectedAccounts={selectedAccounts}
                accounts={accounts.map((a) => ({
                  id: a.id,
                  platform: a.platform,
                  username: a.username,
                }))}
                variations={variations}
                hashtagVariations={hashtagVariations}
                baseHashtags={hashtags}
                onChange={setVariations}
                onHashtagsChange={setHashtagVariations}
                baseContent={content}
              />
            )}

            <div className="mt-4 space-y-2">
              <Label htmlFor="hashtags">Hashtag</Label>
              <Input
                id="hashtags"
                placeholder="kontenkreator, tipsmarketing, sahabatkreator"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
              />
            </div>

            {/* Toolbar alat (AI, strategi, UTM, sound, produk, waktu, CSV) */}
            <div className="mt-5 border-[var(--border-light)] border-t pt-4">
              <ComposeTools>
                {(tool: ComposeTool) => {
                  switch (tool) {
                    case "ai":
                      return (
                        <AiComposerPanel
                          platform={aiPlatform}
                          content={content}
                          hashtags={hashtags}
                          onApplyContent={setContent}
                          onApplyHashtags={setHashtags}
                        />
                      );
                    case "strategy":
                      return (
                        <StrategyAssetsPanel
                          onApplyTemplate={(templateContent, templateHashtags) => {
                            setContent(templateContent);
                            const current = hashtags
                              .split(/[,\s]+/)
                              .map((t) => t.replace(/^#/, "").trim())
                              .filter(Boolean);
                            const merged = [...new Set([...current, ...templateHashtags])];
                            setHashtags(merged.join(", "));
                            toast.success("Template diterapkan");
                          }}
                          onApplyHashtags={(collectionTags) => {
                            const current = hashtags
                              .split(/[,\s]+/)
                              .map((t) => t.replace(/^#/, "").trim())
                              .filter(Boolean);
                            const merged = [...new Set([...current, ...collectionTags])];
                            setHashtags(merged.join(", "));
                          }}
                        />
                      );
                    case "utm":
                      return <UtmPanel content={content} onApplyContent={setContent} />;
                    case "sound":
                      return (
                        <SoundPicker
                          selectedTrackId={soundTrack?.id ?? null}
                          onSelect={setSoundTrack}
                        />
                      );
                    case "product":
                      return <ProductPicker selectedIds={productIds} onChange={setProductIds} />;
                    case "times":
                      return (
                        <OptimalTimesPanel
                          platform={aiPlatform}
                          onSelect={(localDateTime) => {
                            setScheduledAt(localDateTime);
                            toast.success("Jadwal diperbarui dari saran waktu terbaik");
                          }}
                        />
                      );
                    case "csv":
                      return <CsvImportPanel />;
                  }
                }}
              </ComposeTools>
            </div>
          </div>

          {/* Media */}
          <div className="card p-5">
            <h2 className="mb-4 font-semibold">Media</h2>
            <MediaSection
              selectedMedia={selectedMedia}
              uploadPending={uploadMedia.isPending}
              resizePending={resizeMedia.isPending}
              onUpload={(file) => uploadMedia.mutate(file)}
              onRemove={compose.removeMedia}
              onReorder={compose.reorderMedia}
              onSelectionChange={compose.setMediaIds}
              onResize={(mediaId, preset) => resizeMedia.mutate({ mediaId, preset })}
              onEdit={setEditingMedia}
              editingMedia={editingMedia}
              onCloseEditor={() => setEditingMedia(null)}
              onEditorSaved={replaceEditedMedia}
            />
          </div>

          {/* Pengaturan khusus per platform */}
          <PlatformSettingsPanel
            accounts={accounts}
            selectedAccountIds={selectedAccounts}
            settings={platformSettings}
            onChange={(accountId, next) =>
              setPlatformSettings((prev) => ({ ...prev, [accountId]: next }))
            }
          />

          {/* Mode publikasi */}
          <div className="card p-5">
            <h2 className="mb-4 font-semibold">Publikasi</h2>
            <PublishModeSelector
              mode={scheduleMode}
              scheduledAt={scheduledAt}
              onModeChange={setScheduleMode}
              onScheduledAtChange={setScheduledAt}
            />
          </div>

          {/* Panel validasi — error memblokir publish */}
          <ValidationPanel issues={validationIssues} />
        </div>

        {/* ============ Zona 2 & 3: Preview sticky + submit bar ============ */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="card max-h-[calc(100vh-260px)] overflow-y-auto p-5">
            <div className="mb-4 flex items-center gap-2">
              <Eye className="h-4 w-4 text-[var(--text-muted)]" />
              <h2 className="font-semibold">Preview</h2>
              {hasPreviewContent && (
                <span className="text-[var(--text-muted)] text-xs">
                  ({selectedAccounts.length} akun)
                </span>
              )}
            </div>
            {hasPreviewContent ? (
              <PlatformPreviews
                accounts={accounts}
                selectedAccountIds={selectedAccounts}
                content={content}
                variations={variations}
                media={selectedMedia}
              />
            ) : (
              <PreviewEmptyState hasAccounts={accounts.length > 0} />
            )}
          </div>

          <SubmitBar
            mode={scheduleMode}
            pending={createPost.isPending}
            disabled={hasValidationErrors}
            title={hasValidationErrors ? "Perbaiki error validasi sebelum publish" : undefined}
            score={
              <PredictScoreBadge
                content={content}
                hashtags={hashtags}
                platforms={selectedAccounts.map(
                  (id) => accounts.find((a) => a.id === id)?.platform ?? "instagram",
                )}
                hasMedia={selectedMedia.length > 0}
                scheduledHour={
                  scheduleMode === "schedule" && scheduledAt
                    ? new Date(scheduledAt).getHours()
                    : new Date().getHours()
                }
              />
            }
          />
        </div>
      </form>
    </div>
  );
}
