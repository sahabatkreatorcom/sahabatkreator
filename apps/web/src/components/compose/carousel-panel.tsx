// Panel Carousel AI — generate outline carousel IG via /ai/carousel
import { useMutation } from "@tanstack/react-query";
import { Copy, GalleryHorizontalEnd, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function CarouselPanel({
  disabled,
  onApplyContent,
  onCreditsUsed,
}: {
  disabled: boolean;
  onApplyContent: (text: string) => void;
  onCreditsUsed: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [style, setStyle] = useState<CarouselStyle>("edukasi");
  const [result, setResult] = useState<CarouselResult | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api.post<CarouselResult>("/ai/carousel", {
        topic,
        slideCount,
        style,
      }),
    onSuccess: (data) => {
      setResult(data);
      onCreditsUsed();
      toast.success("Outline carousel dihasilkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Copy teks slide per slide */
  function copySlide(slide: { title: string; body: string }, index: number) {
    void navigator.clipboard.writeText(`${index + 1}. ${slide.title}\n${slide.body}`);
    toast.success(`Slide ${index + 1} dicopy`);
  }

  return (
    <div className="space-y-4">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onApplyContent(result.caption);
                toast.success("Caption carousel diterapkan");
              }}
            >
              Pakai Caption ke Konten
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
