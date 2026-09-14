// Image editor ringan di Compose — crop rasio preset, rotate, flip, filter via canvas API vanilla.
// Pipeline render: (1) stage canvas terapkan rotate+flip pada gambar penuh,
// (2) output canvas crop-cover sesuai rasio + terapkan filter.
// Preview live meniru pipeline yang sama dengan CSS (wrapper dirotasi, img object-cover).
import { useMutation } from "@tanstack/react-query";
import { Crop, FlipHorizontal, FlipVertical, Loader2, RotateCw, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";

export type EditableMedia = {
  id: string;
  name: string;
  url: string;
};

type MediaUploadResult = {
  media: { id: string; name: string; url: string; mimeType: string };
};

/** Preset rasio crop (null = bebas, ikuti rasio asli gambar) */
const ASPECT_PRESETS = [
  { w: null, h: null, label: "Bebas" },
  { w: 1, h: 1, label: "1:1 (Kotak)" },
  { w: 4, h: 5, label: "4:5 (IG Feed)" },
  { w: 9, h: 16, label: "9:16 (Story/Reel)" },
  { w: 16, h: 9, label: "16:9 (YouTube)" },
] as const;

type AspectPreset = (typeof ASPECT_PRESETS)[number];

/** Nilai default filter (persen / px) */
const FILTER_DEFAULTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
} as const;

type Filters = typeof FILTER_DEFAULTS;

/** Rangkai string CSS filter dari nilai slider */
function buildCssFilter(f: Filters): string {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) blur(${f.blur}px)`;
}

/** Dimensi output maksimal agar file hasil edit tidak terlalu besar */
const MAX_DIM = 2160;

/**
 * Render gambar final ke Blob JPEG: rotate/flip → crop-cover rasio preset → filter.
 * Filter diaplikasikan via ctx.filter (didukung browser modern) saat menggambar.
 */
async function renderToBlob(
  img: HTMLImageElement,
  opts: {
    rotateDeg: number;
    flipH: boolean;
    flipV: boolean;
    aspect: AspectPreset;
    filters: Filters;
  },
): Promise<Blob> {
  // Dimensi gambar setelah rotasi 90/270 (swap lebar-tinggi)
  const rotated = opts.rotateDeg === 90 || opts.rotateDeg === 270;
  const srcW = rotated ? img.naturalHeight : img.naturalWidth;
  const srcH = rotated ? img.naturalWidth : img.naturalHeight;

  // --- Tahap 1: stage canvas — gambar penuh dengan rotate + flip ---
  const stage = document.createElement("canvas");
  stage.width = srcW;
  stage.height = srcH;
  const sctx = stage.getContext("2d");
  if (!sctx) throw new Error("Canvas 2D tidak didukung browser ini");
  sctx.translate(srcW / 2, srcH / 2);
  sctx.rotate((opts.rotateDeg * Math.PI) / 180);
  sctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
  sctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  // --- Hitung area crop cover di ruang rotated ---
  const effW = opts.aspect.w ?? srcW;
  const effH = opts.aspect.h ?? srcH;
  let cropW = srcW;
  let cropH = srcH;
  const targetRatio = effW / effH;
  const srcRatio = srcW / srcH;
  if (srcRatio > targetRatio) {
    cropW = srcH * targetRatio;
  } else if (srcRatio < targetRatio) {
    cropH = srcW / targetRatio;
  }
  const cropX = (srcW - cropW) / 2;
  const cropY = (srcH - cropH) / 2;

  // --- Tahap 2: output canvas — crop + filter ---
  const scale = Math.min(1, MAX_DIM / Math.max(cropW, cropH));
  const outW = Math.round(cropW * scale);
  const outH = Math.round(cropH * scale);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas 2D tidak didukung browser ini");
  octx.filter = buildCssFilter(opts.filters);
  octx.drawImage(stage, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal mengekspor gambar"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function ImageEditorModal({
  media,
  onClose,
  onSaved,
}: {
  media: EditableMedia | null;
  onClose: () => void;
  /** Dipanggil dengan media hasil edit yang baru diupload */
  onSaved: (media: { id: string; name: string; url: string; mimeType: string }) => void;
}) {
  // Elemen <img> (Image API) untuk membaca naturalWidth/Height & sumber render
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<AspectPreset>(ASPECT_PRESETS[0]);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [filters, setFilters] = useState<Filters>(FILTER_DEFAULTS);

  // Reset state tiap media berbeda dibuka
  useEffect(() => {
    if (media) {
      setAspect(ASPECT_PRESETS[0]);
      setRotateDeg(0);
      setFlipH(false);
      setFlipV(false);
      setFilters(FILTER_DEFAULTS);
      // Muat gambar (crossOrigin agar canvas tidak tainted saat URL beda origin)
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setImgEl(img);
      img.onerror = () => toast.error("Gagal memuat gambar untuk diedit");
      img.src = media.url;
    } else {
      setImgEl(null);
    }
  }, [media]);

  const save = useMutation({
    mutationFn: async () => {
      if (!imgEl || !media) throw new Error("Gambar belum siap");
      const blob = await renderToBlob(imgEl, {
        rotateDeg,
        flipH,
        flipV,
        aspect,
        filters,
      });
      const formData = new FormData();
      const baseName = media.name.replace(/\.[^.]+$/, "");
      formData.append("file", new File([blob], `${baseName}-edited.jpg`, { type: "image/jpeg" }));
      return api.upload<MediaUploadResult>("/media/upload", formData);
    },
    onSuccess: (data) => {
      toast.success("Hasil edit disimpan sebagai media baru");
      onSaved(data.media);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Preview: meniru pipeline canvas (rotate dulu, baru crop cover) ---
  const rotated = rotateDeg === 90 || rotateDeg === 270;
  const effW = aspect.w ?? imgEl?.naturalWidth ?? 1;
  const effH = aspect.h ?? imgEl?.naturalHeight ?? 1;
  // Wrapper dirotasi di tengah container; dimensinya swap agar pas setelah rotasi
  const wrapperStyle: React.CSSProperties = rotated
    ? {
        width: `${(effH / effW) * 100}%`,
        height: `${(effW / effH) * 100}%`,
        aspectRatio: `${effH} / ${effW}`,
      }
    : {
        width: "100%",
        height: "100%",
        aspectRatio: `${effW} / ${effH}`,
      };

  return (
    <Modal
      open={!!media}
      onClose={onClose}
      title="Edit Gambar"
      description="Crop, rotasi, flip, dan atur filter sebelum dipakai di konten"
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAspect(ASPECT_PRESETS[0]);
              setRotateDeg(0);
              setFlipH(false);
              setFlipV(false);
              setFilters(FILTER_DEFAULTS);
            }}
          >
            Reset
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="button" disabled={!imgEl || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Selesai
            </Button>
          </div>
        </div>
      }
    >
      {!imgEl ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
          {/* Preview — container rasio preset, wrapper dirotasi, img object-cover */}
          <div className="flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-4">
            <div
              className="relative mx-auto w-full overflow-hidden"
              style={{ aspectRatio: `${effW} / ${effH}`, maxWidth: 480 }}
            >
              <div
                className="absolute top-1/2 left-1/2"
                style={{
                  ...wrapperStyle,
                  transform: `translate(-50%, -50%) rotate(${rotateDeg}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                }}
              >
                <img
                  src={media?.url}
                  alt="Preview edit"
                  className="h-full w-full object-cover"
                  style={{ filter: buildCssFilter(filters) }}
                />
              </div>
            </div>
          </div>

          {/* Kontrol */}
          <div className="space-y-5">
            {/* Crop rasio */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 font-medium text-sm">
                <Crop className="h-3.5 w-3.5" />
                Rasio Crop
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAspect(p)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      aspect.label === p.label
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                        : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rotasi & flip */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 font-medium text-sm">
                <RotateCw className="h-3.5 w-3.5" />
                Rotasi & Flip
              </p>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRotateDeg((d) => (d + 90) % 360)}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  90°
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={flipH}
                  className={flipH ? "border-[var(--accent-gold)]" : ""}
                  onClick={() => setFlipH((v) => !v)}
                >
                  <FlipHorizontal className="h-3.5 w-3.5" />H
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={flipV}
                  className={flipV ? "border-[var(--accent-gold)]" : ""}
                  onClick={() => setFlipV((v) => !v)}
                >
                  <FlipVertical className="h-3.5 w-3.5" />V
                </Button>
              </div>
            </div>

            {/* Filter */}
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 font-medium text-sm">
                <Sun className="h-3.5 w-3.5" />
                Filter
              </p>
              {(
                [
                  { key: "brightness", label: "Kecerahan", min: 50, max: 150, step: 5 },
                  { key: "contrast", label: "Kontras", min: 50, max: 150, step: 5 },
                  { key: "saturate", label: "Saturasi", min: 0, max: 200, step: 10 },
                  { key: "blur", label: "Blur", min: 0, max: 10, step: 1 },
                ] as const
              ).map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{f.label}</span>
                    <span className="text-[var(--text-muted)]">
                      {f.key === "blur" ? `${filters[f.key]}px` : `${filters[f.key]}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={filters[f.key]}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        [f.key]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[var(--accent-gold)]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
