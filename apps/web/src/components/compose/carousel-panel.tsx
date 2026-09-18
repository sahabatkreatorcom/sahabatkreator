// Panel Carousel AI — generate outline carousel IG via /ai/carousel
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Clock, Copy, Download, GalleryHorizontalEnd, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAiHistory } from "@/hooks/use-ai-history";
import { api } from "@/lib/api";

const CAROUSEL_STYLES = [
  { value: "edukasi", label: "Edukasi" },
  { value: "promosi", label: "Promosi" },
  { value: "storytelling", label: "Storytelling" },
] as const;

type CarouselStyle = (typeof CAROUSEL_STYLES)[number]["value"];

type CarouselResult = {
  slides: { title: string; body: string }[];
  caption: string;
  designTips: string;
};

/** Label ramah untuk kode platform */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  linkedin_org: "LinkedIn (Halaman Company)",
  pinterest: "Pinterest",
  threads: "Threads",
  x: "X",
};

/** Platform yang tidak mendukung upload multi-gambar (carousel) */
const NO_CAROUSEL_PLATFORMS = new Set(["tiktok", "youtube", "threads"]);

export function CarouselPanel({
  platform,
  disabled,
  onApplyContent,
  onCreditsUsed,
}: {
  /** Platform konteks — carousel multi-gambar relevan untuk beberapa platform */
  platform: string;
  disabled: boolean;
  onApplyContent: (text: string) => void;
  onCreditsUsed: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [style, setStyle] = useState<CarouselStyle>("edukasi");
  const [result, setResult] = useState<CarouselResult | null>(null);

  // Cek apakah brand voice aktif (diinject backend ke prompt)
  const { data: brandVoiceData } = useQuery({
    queryKey: ["brand-voice"],
    queryFn: () => api.get<{ brandVoice: { description: string | null } | null }>("/strategy/brand-voice"),
    staleTime: 60 * 1000,
  });
  const brandVoiceActive = !!brandVoiceData?.brandVoice?.description?.trim();

  const { history, add: addHistory, remove: removeHistory } = useAiHistory();

  const generate = useMutation({
    mutationFn: () =>
      api.post<CarouselResult>("/ai/carousel", {
        topic,
        slideCount,
        style,
        platform,
      }),
    onSuccess: (data) => {
      setResult(data);
      onCreditsUsed();
      toast.success("Outline carousel dihasilkan");
      // Simpan ke history
      const slidesText = data.slides.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join("\n\n");
      addHistory({
        type: "carousel",
        label: `${topic.slice(0, 40)} — ${data.slides.length} slide`,
        content: `${slidesText}\n\n---\nCaption: ${data.caption}\n\nTips Desain: ${data.designTips}`,
        metadata: { topic, style, platform: String(platform), slideCount: String(data.slides.length) },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Copy teks slide per slide */
  function copySlide(slide: { title: string; body: string }, index: number) {
    void navigator.clipboard.writeText(`${index + 1}. ${slide.title}\n${slide.body}`);
    toast.success(`Slide ${index + 1} dicopy`);
  }

  /** Export hasil sebagai Markdown */
  function exportMarkdown() {
    if (!result) return;
    const lines: string[] = [`# Carousel: ${topic}`, ""];
    result.slides.forEach((slide, i) => {
      lines.push(`## Slide ${i + 1}: ${slide.title}`);
      lines.push("");
      lines.push(slide.body);
      lines.push("");
    });
    if (result.designTips) {
      lines.push("## Tips Desain");
      lines.push("");
      lines.push(result.designTips);
      lines.push("");
    }
    if (result.caption) {
      lines.push("## Caption");
      lines.push("");
      lines.push(result.caption);
    }
    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carousel-${topic.slice(0, 30).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Carousel diexport sebagai Markdown");
  }

  return (
    <div className="space-y-4">
      {/* Indikator brand voice */}
      {brandVoiceActive && (
        <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] px-2.5 py-1 text-[var(--accent-gold)] text-xs">
          <Check className="h-3 w-3" />
          Brand voice aktif — nada & gaya merek diterapkan ke hasil
        </div>
      )}

      <p className="text-[var(--text-muted)] text-xs">
        Outline dibuat untuk konteks{" "}
        <span className="font-medium text-[var(--text-secondary)]">
          {PLATFORM_LABELS[platform] ?? platform}
        </span>
        {NO_CAROUSEL_PLATFORMS.has(platform) && (
          <span className="text-[var(--warning)]">
            {" "}
            — platform ini tidak mendukung upload multi-gambar; gunakan outline sebagai storyboard
            video/slide.
          </span>
        )}
      </p>
      <div className="space-y-2">
        <Label htmlFor="carousel-topic">Topik Carousel</Label>
        <Input
          id="carousel-topic"
          placeholder="Contoh: 5 cara packaging produk UMKM biar estetik"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="carousel-count">Jumlah Slide</Label>
          <Input
            id="carousel-count"
            type="number"
            min={4}
            max={10}
            value={slideCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              setSlideCount(Math.min(10, Math.max(4, Number.isFinite(n) ? n : 4)));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Gaya</Label>
          <div className="flex flex-wrap gap-1.5">
            {CAROUSEL_STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  style === s.value
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                    : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || generate.isPending || topic.trim().length < 3}
        onClick={() => generate.mutate()}
      >
        {generate.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GalleryHorizontalEnd className="h-4 w-4" />
        )}
        Generate Carousel
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {result.slides.map((slide, i) => (
              <div
                key={i}
                className="group rounded-[var(--radius-md)] border border-[var(--border-light)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">
                    <span className="text-[var(--accent-gold)]">{i + 1}.</span> {slide.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => copySlide(slide, i)}
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--accent-gold)]"
                    aria-label={`Copy slide ${i + 1}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[var(--text-secondary)] text-xs">{slide.body}</p>
              </div>
            ))}
          </div>

          {result.designTips && (
            <div className="rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3">
              <p className="font-medium text-xs">Tips Desain</p>
              <p className="mt-1 text-[var(--text-secondary)] text-xs">{result.designTips}</p>
            </div>
          )}

          {result.caption && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  // Kirim caption + slide titles sebagai context ke Compose
                  const slideContext = result.slides
                    .map((s, i) => `${i + 1}. ${s.title}`)
                    .join("\n");
                  const fullContent = `${result.caption}\n\n---\n[Carousel Outline]\n${slideContext}`;
                  onApplyContent(fullContent);
                  toast.success("Caption + outline carousel dibuka di Compose");
                }}
              >
                Pakai Caption + Outline ke Compose
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={exportMarkdown}
              >
                <Download className="h-3.5 w-3.5" />
                Export sebagai Markdown
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Riwayat generate — restore tanpa habis credit */}
      {history.filter((h) => h.type === "carousel").length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[var(--text-secondary)] text-xs font-medium">
            <Clock className="h-3 w-3" />
            Riwayat
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {history.filter((h) => h.type === "carousel").map((h) => (
              <div
                key={h.id}
                className="group flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    // Parse carousel dari history: slides + caption + tips
                    const parts = h.content.split("\n\n---\n");
                    const slidesText = parts[0] ?? "";
                    const captionMatch = parts[1]?.match(/^Caption:\s*([\s\S]*)/);
                    const tipsMatch = parts[1]?.match(/Tips Desain:\s*([\s\S]*)/);
                    const slides = slidesText
                      .split(/\n\n(?=\d+\.\s)/)
                      .filter(Boolean)
                      .map((block) => {
                        const match = block.match(/^\d+\.\s*(.+?)\n([\s\S]*)/);
                        return match
                          ? { title: match[1].trim(), body: match[2].trim() }
                          : { title: block.trim(), body: "" };
                      });
                    const meta = h.metadata;
                    const slideCount = Number(meta.slideCount) || slides.length;
                    if (slides.length > 0) {
                      setResult({
                        slides,
                        caption: captionMatch?.[1]?.trim() ?? "",
                        designTips: tipsMatch?.[1]?.trim() ?? "",
                      });
                      setTopic(meta.topic ?? "");
                      void slideCount;
                      toast.success("Riwayat carousel dimuat");
                    }
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs">{h.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeHistory(h.id)}
                  className="shrink-0 text-[var(--text-muted)] opacity-0 hover:text-red-500 group-hover:opacity-100"
                  aria-label="Hapus riwayat"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
