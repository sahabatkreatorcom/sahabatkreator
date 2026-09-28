// Panel Video Processing (trim / speed / mirror / loop) + Overlay — dari
// pecahan video.tsx. Murni kontrol form yang menulis state bersama
// `videoProcessing`; tidak tahu kontrak server.
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MediaItem, VideoProcessingSettings } from "./video-types";

const LOOP_MODES = [
  { value: "sequential", label: "Sequential", desc: "Ulang dari awal ke akhir" },
  { value: "random", label: "Acak", desc: "Segmen random tiap loop" },
  { value: "reverse", label: "Reverse", desc: "Normal → balik → normal" },
] as const;

const OVERLAY_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "center",
  "random",
] as const;

export function VideoProcessingPanel({
  videoProcessing,
  setVideoProcessing,
  mediaItems,
}: {
  videoProcessing: VideoProcessingSettings;
  setVideoProcessing: (
    v: VideoProcessingSettings | ((prev: VideoProcessingSettings) => VideoProcessingSettings),
  ) => void;
  mediaItems: MediaItem[];
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <RotateCcw className="h-4 w-4" /> Video Processing
      </Label>
      <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
        {/* Trim */}
        <div className="space-y-1.5">
          <Label className="text-[var(--text-secondary)] text-xs">Trim (detik)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Mulai"
              min="0"
              step="0.5"
              value={videoProcessing.trimStart}
              onChange={(e) => setVideoProcessing((v) => ({ ...v, trimStart: e.target.value }))}
              className="w-full text-xs"
            />
            <Input
              type="number"
              placeholder="Akhir"
              min="0"
              step="0.5"
              value={videoProcessing.trimEnd}
              onChange={(e) => setVideoProcessing((v) => ({ ...v, trimEnd: e.target.value }))}
              className="w-full text-xs"
            />
          </div>
        </div>

        {/* Speed */}
        <div className="space-y-1.5">
          <Label className="text-[var(--text-secondary)] text-xs">
            Kecepatan — {videoProcessing.speed}x
          </Label>
          <input
            type="range"
            min={0.25}
            max={4.0}
            step={0.25}
            value={videoProcessing.speed}
            onChange={(e) =>
              setVideoProcessing((v) => ({ ...v, speed: Number.parseFloat(e.target.value) }))
            }
            className="w-full accent-[var(--accent-gold)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>0.25x (lambat)</span>
            <span>4x (cepat)</span>
          </div>
        </div>

        {/* Mirror */}
        <div className="flex items-end sm:col-span-2">
          <button
            type="button"
            onClick={() => setVideoProcessing((v) => ({ ...v, mirror: !v.mirror }))}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs transition",
              videoProcessing.mirror
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                : "border-[var(--border)] text-[var(--text-secondary)]",
            )}
          >
            <span
              className={cn(
                "h-3.5 w-6 rounded-full p-0.5 transition",
                videoProcessing.mirror ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
              )}
            >
              <span
                className={cn(
                  "block h-2.5 w-2.5 rounded-full bg-white transition",
                  videoProcessing.mirror ? "translate-x-2.5" : "translate-x-0",
                )}
              />
            </span>
            Mirror (reverse) — hindari deteksi duplikat
          </button>
        </div>

        {/* Loop Mode */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[var(--text-secondary)] text-xs">
            Mode Loop — saat video lebih pendek dari voiceover
          </Label>
          <div className="flex gap-1.5">
            {LOOP_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setVideoProcessing((v) => ({ ...v, loopMode: m.value }))}
                className={cn(
                  "flex-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-left text-xs transition",
                  videoProcessing.loopMode === m.value
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                    : "border-[var(--border)] text-[var(--text-secondary)]",
                )}
                title={m.desc}
              >
                <span className="block">{m.label}</span>
                <span className="mt-0.5 block font-normal text-[10px] text-[var(--text-muted)]">
                  {m.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <OverlayControls
        videoProcessing={videoProcessing}
        setVideoProcessing={setVideoProcessing}
        mediaItems={mediaItems}
      />
    </div>
  );
}

function OverlayControls({
  videoProcessing,
  setVideoProcessing,
  mediaItems,
}: {
  videoProcessing: VideoProcessingSettings;
  setVideoProcessing: (
    v: VideoProcessingSettings | ((prev: VideoProcessingSettings) => VideoProcessingSettings),
  ) => void;
  mediaItems: MediaItem[];
}) {
  const overlay = videoProcessing.overlay;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">Overlay (gambar/video)</Label>
      <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
        {/* File picker */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[var(--text-secondary)] text-xs">File overlay (opsional)</Label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setVideoProcessing((v) => ({
                  ...v,
                  overlay: { ...v.overlay, file },
                }));
              }}
              className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--accent-gold)] file:px-2 file:py-1 file:font-medium file:text-white file:text-xs"
            />
            {overlay.file && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setVideoProcessing((v) => ({
                    ...v,
                    overlay: { ...v.overlay, file: null },
                  }))
                }
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          {overlay.file && (
            <p className="text-[10px] text-[var(--text-muted)]">{overlay.file.name}</p>
          )}

          {/* Pilih dari media library */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)]">atau pilih dari media:</span>
            <select
              className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs"
              value={overlay.mediaId ?? ""}
              onChange={(e) => {
                const mediaId = e.target.value || null;
                setVideoProcessing((v) => ({
                  ...v,
                  overlay: {
                    ...v.overlay,
                    mediaId,
                    // Clear file kalau pilih media (dan sebaliknya)
                    file: mediaId ? null : v.overlay.file,
                  },
                }));
              }}
            >
              <option value="">— Tidak dipilih —</option>
              {mediaItems
                .filter((m) => m.type === "image" || m.type === "video")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? "tanpa nama"} ({m.type})
                  </option>
                ))}
            </select>
          </div>
          {overlay.mediaId &&
            (() => {
              const m = mediaItems.find((x) => x.id === overlay.mediaId);
              return m ? (
                <div className="flex items-center gap-2">
                  <img
                    src={m.thumbnailUrl ?? m.url}
                    alt={m.name ?? "overlay"}
                    className="h-8 w-8 rounded border border-[var(--border)] object-cover"
                  />
                  <span className="truncate text-[10px] text-[var(--text-muted)]">
                    {m.name ?? "tanpa nama"}
                  </span>
                </div>
              ) : null;
            })()}
        </div>

        {/* Position */}
        <div className="space-y-1.5">
          <Label className="text-[var(--text-secondary)] text-xs">Posisi</Label>
          <div className="flex flex-wrap gap-1">
            {OVERLAY_POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setVideoProcessing((v) => ({
                    ...v,
                    overlay: { ...v.overlay, position: p },
                  }))
                }
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] transition",
                  overlay.position === p
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                    : "border-[var(--border)] text-[var(--text-secondary)]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Scale */}
        <div className="space-y-1.5">
          <Label className="text-[var(--text-secondary)] text-xs">
            Skala — {Math.round(overlay.scale * 100)}%
          </Label>
          <input
            type="range"
            min={0.05}
            max={0.5}
            step={0.01}
            value={overlay.scale}
            onChange={(e) =>
              setVideoProcessing((v) => ({
                ...v,
                overlay: { ...v.overlay, scale: Number.parseFloat(e.target.value) },
              }))
            }
            className="w-full accent-[var(--accent-gold)]"
          />
        </div>

        {/* Opacity */}
        <div className="space-y-1.5">
          <Label className="text-[var(--text-secondary)] text-xs">
            Opasitas — {Math.round(overlay.opacity * 100)}%
          </Label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={overlay.opacity}
            onChange={(e) =>
              setVideoProcessing((v) => ({
                ...v,
                overlay: { ...v.overlay, opacity: Number.parseFloat(e.target.value) },
              }))
            }
            className="w-full accent-[var(--accent-gold)]"
          />
        </div>
      </div>
    </div>
  );
}
