// Bagian media di Compose — thumbnail terpilih, upload, pilih dari pustaka,
// reorder (geser kiri/kanan), resize preset, dan image editor modal.
// State media tetap dipegang halaman Compose.
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImageIcon,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { type MediaItem, RESIZE_PRESETS } from "./compose-types";
import { type EditableMedia, ImageEditorModal } from "./image-editor-modal";
import { MediaLibraryPicker } from "./media-library-picker";

export function MediaSection({
  selectedMedia,
  uploadPending,
  resizePending,
  onUpload,
  onRemove,
  onReorder,
  onResize,
  onEdit,
  editingMedia,
  onCloseEditor,
  onEditorSaved,
  onSelectionChange,
}: {
  /** Item media terpilih (sudah di-filter dari katalog) */
  selectedMedia: MediaItem[];
  uploadPending: boolean;
  resizePending: boolean;
  onUpload: (file: File) => void;
  onRemove: (mediaId: string) => void;
  /** Geser media ke kiri/kanan satu posisi (-1 / +1) */
  onReorder: (mediaId: string, direction: -1 | 1) => void;
  onResize: (mediaId: string, preset: (typeof RESIZE_PRESETS)[number]) => void;
  onEdit: (media: EditableMedia) => void;
  editingMedia: EditableMedia | null;
  onCloseEditor: () => void;
  /** Dipanggil dengan media hasil edit — id dipakai menggantikan media lama */
  onEditorSaved: (media: { id: string; name: string; url: string; mimeType: string }) => void;
  /** Dipanggil dengan daftar id terpilih saat user konfirmasi di pustaka */
  onSelectionChange: (ids: string[]) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const firstImage = selectedMedia.find((m) => m.mimeType.startsWith("image/"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {selectedMedia.map((m, index) => {
          const isImage = m.mimeType.startsWith("image/");
          return (
            <div key={m.id} className="group relative">
              {isImage ? (
                <img
                  src={m.url}
                  alt={m.name ?? m.filename}
                  className="h-20 w-20 rounded-[var(--radius-md)] object-cover"
                />
              ) : m.thumbnailUrl ? (
                <img
                  src={m.thumbnailUrl}
                  alt={m.name ?? m.filename}
                  className="h-20 w-20 rounded-[var(--radius-md)] object-cover"
                />
              ) : m.mimeType.startsWith("video/") ? (
                <video
                  src={m.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-20 w-20 rounded-[var(--radius-md)] object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] text-xs">
                  audio
                </div>
              )}
              {/* Urutan lampiran */}
              <span className="absolute top-0.5 left-0.5 rounded-full bg-black/60 px-1.5 font-medium text-[10px] text-white">
                {index + 1}
              </span>
              {/* Aksi media (hover): geser, edit gambar, hapus */}
              <div className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-0.5 rounded-b-[var(--radius-md)] bg-black/60 px-1 py-1 group-hover:flex">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onReorder(m.id, -1)}
                  className="rounded-full bg-white/20 p-1 text-white hover:bg-white/40 disabled:opacity-30"
                  aria-label="Geser ke kiri"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                {isImage && (
                  <button
                    type="button"
                    onClick={() => onEdit({ id: m.id, name: m.name ?? m.filename, url: m.url })}
                    className="rounded-full bg-white/20 p-1 text-white hover:bg-white/40"
                    aria-label="Edit gambar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  className="rounded-full bg-white/20 p-1 text-white hover:bg-red-500"
                  aria-label="Hapus media"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={index === selectedMedia.length - 1}
                  onClick={() => onReorder(m.id, 1)}
                  className="rounded-full bg-white/20 p-1 text-white hover:bg-white/40 disabled:opacity-30"
                  aria-label="Geser ke kanan"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
        {/* Upload file baru */}
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-[var(--border)] border-dashed text-[var(--text-muted)] hover:border-[var(--accent-gold)]">
          {uploadPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImageIcon className="h-5 w-5" />
          )}
          <span className="text-[10px]">Upload</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/wave,audio/webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        {/* Pilih dari pustaka media */}
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-[var(--border)] border-dashed text-[var(--text-muted)] transition-colors hover:border-[var(--accent-gold)]"
          title="Pilih media dari pustaka"
        >
          <FolderOpen className="h-5 w-5" />
          <span className="text-[10px]">Pustaka</span>
        </button>
      </div>

      {/* Auto-resize gambar terpilih ke dimensi platform */}
      {firstImage && (
        <div className="space-y-2 border-[var(--border-light)] border-t pt-4">
          <p className="font-medium text-[var(--text-secondary)] text-xs">
            Resize Otomatis per Platform
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RESIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={resizePending}
                onClick={() => onResize(firstImage.id, preset)}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:border-[var(--accent-gold)] disabled:opacity-50"
                title={`Resize gambar pertama terpilih ke dimensi ${preset.label} — dibuat sebagai media baru`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Diterapkan ke gambar pertama terpilih. Membuat salinan baru — media asli tetap
            tersimpan.
          </p>
        </div>
      )}

      <ImageEditorModal media={editingMedia} onClose={onCloseEditor} onSaved={onEditorSaved} />

      {/* Pilih media dari pustaka (/media) */}
      <MediaLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        selectedIds={selectedMedia.map((m) => m.id)}
        onConfirm={onSelectionChange}
      />
    </div>
  );
}
