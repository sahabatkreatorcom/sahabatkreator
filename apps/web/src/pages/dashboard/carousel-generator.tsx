// Halaman mandiri Carousel Generator — outline carousel via /ai/carousel,
// lalu render jadi slide gambar siap upload via /carousel (Modal Pillow).
// RFC docs/rfc-carousel-render.md.
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AiUnavailableNotice } from "@/components/compose/ai-panel";
import { CarouselPanel } from "@/components/compose/carousel-panel";
import { CarouselRenderPanel } from "@/components/compose/carousel-render-panel";
import { REPURPOSE_PLATFORMS } from "@/components/compose/repurpose-panel";
import { Label } from "@/components/ui/label";
import { useAiUsage } from "@/hooks/use-ai-usage";

type CarouselResult = {
  slides: { title: string; body: string }[];
  caption: string;
  designTips: string;
};

export function CarouselGeneratorPage() {
  const { usage, disabled, refetchUsage } = useAiUsage();
  const [platform, setPlatform] = useState("instagram");
  const [outline, setOutline] = useState<{ topic: string; result: CarouselResult } | null>(null);
  const navigate = useNavigate();

  const aiUnavailable = usage && !usage.configured;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Carousel Generator</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Buat outline carousel multi-slide (judul, isi per slide, tips desain, dan caption), lalu
          render langsung jadi slide gambar siap upload.
        </p>
      </div>

      {aiUnavailable ? (
        <AiUnavailableNotice configured={false} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card max-w-2xl space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="carousel-platform">Platform</Label>
              <select
                id="carousel-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-sm"
              >
                {REPURPOSE_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <CarouselPanel
              platform={platform}
              disabled={disabled}
              onApplyContent={(caption) => {
                toast.success("Caption + slide context dibuka di Compose");
                navigate("/compose", { state: { content: caption } });
              }}
              onCreditsUsed={refetchUsage}
              onResult={(result, topic) => setOutline({ topic, result })}
            />
          </div>

          <div className="max-w-2xl">
            {outline ? (
              <CarouselRenderPanel
                topic={outline.topic}
                slides={outline.result.slides}
                caption={outline.result.caption}
              />
            ) : (
              <div className="card p-5">
                <p className="text-[var(--text-muted)] text-sm">
                  Generate outline di kiri dulu — setelah slide jadi, panel render slide gambar
                  muncul di sini.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
