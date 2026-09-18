// Halaman mandiri Carousel Generator — outline carousel via /ai/carousel.
// (Sebelumnya hanya panel di dalam Compose; kini punya menu navigasi Generator AI.)
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AiUnavailableNotice } from "@/components/compose/ai-panel";
import { CarouselPanel } from "@/components/compose/carousel-panel";
import { REPURPOSE_PLATFORMS } from "@/components/compose/repurpose-panel";
import { Label } from "@/components/ui/label";
import { useAiUsage } from "@/hooks/use-ai-usage";

export function CarouselGeneratorPage() {
  const { usage, disabled, refetchUsage } = useAiUsage();
  const [platform, setPlatform] = useState("instagram");
  const navigate = useNavigate();

  const aiUnavailable = usage && !usage.configured;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Carousel Generator</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Buat outline carousel multi-slide (judul, isi per slide, tips desain, dan caption) untuk
          konten yang lebih informatif.
        </p>
      </div>

      {aiUnavailable ? (
        <AiUnavailableNotice configured={false} />
      ) : (
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
          />
        </div>
      )}
    </div>
  );
}
