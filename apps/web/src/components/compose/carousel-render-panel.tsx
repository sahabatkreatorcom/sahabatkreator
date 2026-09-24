// Panel Render Carousel — ubah outline (dari /ai/carousel) jadi slide gambar
// siap upload via POST /carousel (Modal Pillow). RFC docs/rfc-carousel-render.md.
//
// Menerima slides + caption dari parent (hasil CarouselPanel), tawarkan kontrol
// desain, submit job, polling status, lalu tampilkan grid slide + download.
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ImageDown, Images, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type OutlineSlide = { title: string; body: string };

type RenderStyle = "outline" | "box" | "box_title_content" | "plain";
type RenderFormat = "portrait" | "portrait4_5" | "square";
type BackgroundMode = "solid" | "stock" | "library";

const RENDER_STYLES: { value: RenderStyle; label: string; hint: string }[] = [
  { value: "box", label: "Box", hint: "Teks dalam kotak semi-transparan" },
  { value: "outline", label: "Outline", hint: "Teks putih dengan stroke hitam" },
  {
    value: "box_title_content",
    label: "Judul + Isi",
    hint: "Judul kotak atas, isi baris melayang",
  },
  { value: "plain", label: "Polos", hint: "Teks polos + drop shadow" },
];

const RENDER_FORMATS: { value: RenderFormat; label: string; hint: string }[] = [
  { value: "portrait4_5", label: "Feed 4:5", hint: "1080×1350 — rekomendasi feed IG/FB" },
  { value: "square", label: "Feed 1:1", hint: "1080×1080 — feed IG/FB" },
  { value: "portrait", label: "Story 9:16", hint: "1080×1920 — story/reels (fase 3 export video)" },
];

const FONT_FAMILIES = ["Fredoka", "Cinzel", "Bangers", "Caveat", "Montserrat"] as const;

type CarouselJobStatus =
  | "queued"
  | "sourcing"
  | "rendering"
  | "uploading"
  | "done"
  | "failed"
  | "canceled";

type JobDetail = {
  job: {
    id: string;
    topic: string;
    status: CarouselJobStatus;
    progress: number;
    caption: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  };
  slides: {
    urutan: number;
    title: string;
    body: string | null;
    stockCredit: string | null;
    url: string | null;
    width: number | null;
    height: number | null;
    sizeBytes: number | null;
  }[];
};

const STATUS_LABEL: Record<CarouselJobStatus, string> = {
  queued: "Menunggu antrian",
  sourcing: "Mencari background",
  rendering: "Merender slide",
  uploading: "Menyimpan ke pustaka media",
  done: "Selesai",
  failed: "Gagal",
  canceled: "Dibatalkan",
};

export function CarouselRenderPanel({
  topic,
  slides,
  caption,
}: {
  topic: string;
  slides: OutlineSlide[];
  caption: string;
}) {
  const [style, setStyle] = useState<RenderStyle>("box");
  const [format, setFormat] = useState<RenderFormat>("portrait4_5");
  const [boxOpacity, setBoxOpacity] = useState(235);
  const [titleFont, setTitleFont] = useState<string>("Fredoka");
  const [contentFont, setContentFont] = useState<string>("Fredoka");
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("solid");
  const [backgroundQuery, setBackgroundQuery] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const usesBox = style === "box" || style === "box_title_content";

  // Cek status fitur + job list
  const { data: listData } = useQuery({
    queryKey: ["carousel-jobs"],
    queryFn: () => api.get<{ jobs: unknown[]; carouselEnabled: boolean }>("/carousel"),
    staleTime: 30_000,
  });
  const carouselEnabled = listData?.carouselEnabled ?? false;

  // Polling job aktif sampai terminal
  const { data: jobData } = useQuery({
    queryKey: ["carousel-job", jobId],
    queryFn: () => api.get<JobDetail>(`/carousel/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "done" || st === "failed" || st === "canceled" ? false : 2000;
    },
  });

  useEffect(() => {
    if (!jobData) return;
    const st = jobData.job.status;
    if (st === "done") {
      toast.success(`Carousel selesai — ${jobData.slides.length} slide siap diunduh`);
      setJobId(null);
    } else if (st === "failed") {
      toast.error(`Render gagal: ${jobData.job.errorMessage ?? "error tidak diketahui"}`);
      setJobId(null);
    } else if (st === "canceled") {
      setJobId(null);
    }
  }, [jobData]);

  const createJob = useMutation({
    mutationFn: () =>
      api.post<{ jobId: string; status: string; slideCount: number }>("/carousel", {
        topic,
        slides: slides.map((s) => ({ title: s.title, body: s.body })),
        caption,
        settings: {
          style,
          format,
          slideCount: slides.length,
          boxOpacity,
          titleFontFamily: titleFont,
          contentFontFamily: contentFont,
          backgroundMode,
          backgroundQuery,
        },
      }),
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success(`Job render dibuat — ${data.slideCount} slide`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = !!jobId;
  const doneSlides = jobData && jobData.job.status === "done" ? jobData.slides : [];
  const failedJob = jobData && jobData.job.status === "failed" ? jobData.job : null;

  function downloadSlide(s: JobDetail["slides"][number], index: number) {
    if (!s.url) return;
    const a = document.createElement("a");
    a.href = s.url;
    a.download = `carousel-${topic
      .slice(0, 30)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase()}-slide-${index + 1}.jpg`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  function downloadAll() {
    doneSlides.forEach((s, i) => {
      // Stagger sedikit agar browser tidak memblokir multi-download
      setTimeout(() => downloadSlide(s, i), i * 250);
    });
    toast.success(`Mengunduh ${doneSlides.length} slide`);
  }

  // Fitur belum dikonfigurasi di server
  if (!carouselEnabled) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-4">
        <p className="flex items-center gap-1.5 text-sm">
          <Images className="h-4 w-4 text-[var(--text-muted)]" />
          Render slide gambar belum dikonfigurasi di server
        </p>
        <p className="mt-1 text-[var(--text-muted)] text-xs">
          Admin perlu set <code>MODAL_TOKEN</code> dan <code>MODAL_CAROUSEL_URL</code>. Outline
          tetap bisa dipakai sebagai storyboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border-light)] p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
        <h3 className="font-medium text-sm">Render jadi slide gambar</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cr-style">Gaya Slide</Label>
          <Select
            id="cr-style"
            value={style}
            onChange={(e) => setStyle(e.target.value as RenderStyle)}
          >
            {RENDER_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} — {s.hint}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cr-format">Format</Label>
          <Select
            id="cr-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as RenderFormat)}
          >
            {RENDER_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} — {f.hint}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {usesBox && (
        <div className="space-y-1.5">
          <Label htmlFor="cr-opacity">Opacity Kotak: {boxOpacity}</Label>
          <input
            id="cr-opacity"
            type="range"
            min={60}
            max={255}
            value={boxOpacity}
            onChange={(e) => setBoxOpacity(Number(e.target.value))}
            className="w-full accent-[var(--accent-gold)]"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cr-title-font">Font Judul</Label>
          <Select
            id="cr-title-font"
            value={titleFont}
            onChange={(e) => setTitleFont(e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cr-content-font">Font Isi</Label>
          <Select
            id="cr-content-font"
            value={contentFont}
            onChange={(e) => setContentFont(e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cr-bg">Background</Label>
        <Select
          id="cr-bg"
          value={backgroundMode}
          onChange={(e) => setBackgroundMode(e.target.value as BackgroundMode)}
        >
          <option value="solid">Gradient solid (tanpa foto)</option>
          <option value="stock">Stock foto otomatis (Pixabay)</option>
          <option value="library">Pilih dari pustaka media</option>
        </Select>
        <p className="text-[var(--text-muted)] text-xs">
          {backgroundMode === "solid" && "Background gradient ungu default — cepat, tanpa biaya."}
          {backgroundMode === "stock" &&
            "Foto dari Pixabay di-download sekali ke server (no hotlink, sesuai ToS). Credit masuk caption."}
          {backgroundMode === "library" &&
            "Setiap slide pakai gambar dari pustaka media org (brand konsisten)."}
        </p>
      </div>

      {backgroundMode === "stock" && (
        <div className="space-y-1.5">
          <Label htmlFor="cr-bg-query">Kata Kunci Stock</Label>
          <Input
            id="cr-bg-query"
            placeholder="Contoh: kopi, makanan indonesia, toko bunga"
            value={backgroundQuery}
            onChange={(e) => setBackgroundQuery(e.target.value)}
          />
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={
          busy ||
          createJob.isPending ||
          (backgroundMode === "stock" && backgroundQuery.trim().length < 2)
        }
        onClick={() => createJob.mutate()}
      >
        {createJob.isPending || busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Images className="h-4 w-4" />
        )}
        {busy
          ? `${STATUS_LABEL[jobData?.job.status ?? "rendering"]}… ${jobData?.job.progress ?? 0}%`
          : `Render ${slides.length} slide`}
      </Button>

      {failedJob?.errorMessage && (
        <p className="text-[var(--danger)] text-xs">
          {failedJob.errorMessage}
          {failedJob.errorCode === "stock_no_results" &&
            " — coba kata kunci lain atau gunakan background solid/pustaka."}
        </p>
      )}

      {/* Grid slide hasil */}
      {doneSlides.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-[var(--text-secondary)] text-xs">
              {doneSlides.length} slide siap upload
            </p>
            <Button type="button" variant="outline" size="sm" onClick={downloadAll}>
              <ImageDown className="h-3.5 w-3.5" />
              Unduh semua
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {doneSlides.map((s, i) => (
              <button
                key={s.urutan}
                type="button"
                onClick={() => downloadSlide(s, i)}
                className="group relative aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)]"
                title={`Slide ${i + 1}: ${s.title}`}
              >
                {s.url ? (
                  <img
                    src={s.url}
                    alt={s.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Images className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>
                )}
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-medium text-[10px] text-white">
                  {i + 1}
                </span>
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/70 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Download className="h-3 w-3" /> Unduh
                </span>
              </button>
            ))}
          </div>
          {jobData?.job.caption && (
            <div className="rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-xs">Caption (sudah termasuk credit stock)</p>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(jobData.job.caption ?? "");
                    toast.success("Caption disalin");
                  }}
                  className="text-[var(--text-muted)] text-xs hover:text-[var(--accent-gold)]"
                >
                  Salin
                </button>
              </div>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[var(--text-secondary)] text-xs">
                {jobData.job.caption}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
