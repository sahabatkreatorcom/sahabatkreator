// Modal pilih media dari pustaka (/media) — grid thumbnail, pilih banyak,
// upload file baru langsung dari dalam modal. Dipakai MediaSection di Compose.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { generateVideoThumbnail } from "@/lib/media-thumbnail";
import { cn } from "@/lib/utils";

export type LibraryMedia = {
  id: string;
  name: string | null;
  url: string;
  mimeType: string;
  /** Thumbnail video (JPEG frame) — null bila video tanpa thumbnail/audio */
  thumbnailUrl?: string | null;
};

export function MediaLibraryPicker({
  open,
  onClose,
  selectedIds,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** Id media yang sudah terlampir — tercentang di grid */
  selectedIds: string[];
  /** Dipanggil dengan daftar id terpilih saat user menekan "Lampirkan" */
  onConfirm: (ids: string[]) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: LibraryMedia[] }>("/media"),
    enabled: open,
  });

  // Upload dari dalam modal — invalidasi daftar agar item baru muncul di grid
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const thumbnail = await generateVideoThumbnail(file);
      if (thumbnail) formData.append("thumbnail", thumbnail, "thumbnail.jpg");
      return api.upload<{ media: LibraryMedia }>("/media/upload", formData);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setChecked((prev) => new Set(prev).add(res.media.id));
    },
  });

  // Sinkronkan centangan dengan yang sudah terlampir tiap kali modal dibuka
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setChecked(new Set(selectedIds));
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const items = data?.items ?? [];

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pilih dari Pustaka Media"
      description="Centang media untuk dilampirkan ke post ini"
      size="xl"
      footer={
        <>
          <span className="mr-auto text-[var(--text-muted)] text-xs">{checked.size} dipilih</span>
          <button
            type="button"
            onClick={() => {
              onConfirm([...checked]);
              onClose();
            }}
            className="rounded-[var(--radius-md)] bg-[var(--accent-gold)] px-4 py-2 font-medium text-[var(--bg-primary)] text-sm transition-opacity hover:opacity-90"
          >
            Lampirkan ({checked.size})
          </button>
        </>
      }
    >
      {/* Upload baru di dalam modal */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[var(--text-muted)] text-xs">
          File yang diupload otomatis tercentang dan tersimpan di pustaka.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:border-[var(--accent-gold)] disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/wav"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-[var(--text-muted)] text-sm">
          Pustaka masih kosong — upload file pertama Anda.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {items.map((m) => {
            const isChecked = checked.has(m.id);
            const isImage = m.mimeType.startsWith("image/");
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-[var(--radius-md)] border-2 transition-colors",
                  isChecked
                    ? "border-[var(--accent-gold)]"
                    : "border-transparent hover:border-[var(--border)]",
                )}
                title={m.name ?? undefined}
              >
                {isImage ? (
                  <img
                    src={m.url}
                    alt={m.name ?? ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : m.thumbnailUrl ? (
                  <img
                    src={m.thumbnailUrl}
                    alt={m.name ?? ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : m.mimeType.startsWith("video/") ? (
                  <video
                    src={m.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-xs">
                    Audio
                  </div>
                )}
                {isChecked && (
                  <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-gold)] text-[var(--bg-primary)]">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
