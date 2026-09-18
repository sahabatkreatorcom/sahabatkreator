// Halaman mandiri Repurpose AI — adaptasi konten antar platform.
// (Sebelumnya hanya panel di dalam Compose; kini punya menu navigasi Generator AI.)
import { Copy, PenSquare } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AiUnavailableNotice } from "@/components/compose/ai-panel";
import { RepurposePanel } from "@/components/compose/repurpose-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiUsage } from "@/hooks/use-ai-usage";

export function RepurposePage() {
  const { usage, disabled, refetchUsage } = useAiUsage();
  const [result, setResult] = useState("");
  const navigate = useNavigate();

  const aiUnavailable = usage && !usage.configured;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Repurpose Konten</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Adaptasi satu konten ke format platform lain — caption, panjang, dan gaya disesuaikan
          otomatis oleh AI.
        </p>
      </div>

      {aiUnavailable ? (
        <AiUnavailableNotice configured={false} />
      ) : (
        <div className="card max-w-2xl p-5">
          <RepurposePanel
            content=""
            disabled={disabled}
            onApplyContent={setResult}
            onCreditsUsed={refetchUsage}
          />
        </div>
      )}

      {result && (
        <div className="card max-w-2xl space-y-3 p-5">
          <h2 className="font-semibold">Hasil Adaptasi</h2>
          <Textarea rows={8} readOnly value={result} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(result);
                toast.success("Hasil dicopy");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => navigate("/compose", { state: { content: result } })}
            >
              <PenSquare className="h-3.5 w-3.5" />
              Pakai di Compose
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
