// Halaman mandiri Repurpose AI — adaptasi konten antar platform.
// Multi-platform: pilih beberapa target sekaligus, hasil editable per platform.
import { useNavigate } from "react-router";
import { AiUnavailableNotice } from "@/components/compose/ai-panel";
import { RepurposePanel } from "@/components/compose/repurpose-panel";
import { useAiUsage } from "@/hooks/use-ai-usage";

export function RepurposePage() {
  const { usage, disabled, refetchUsage } = useAiUsage();
  const navigate = useNavigate();

  const aiUnavailable = usage && !usage.configured;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Repurpose Konten</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Adaptasi satu konten ke format platform lain — caption, panjang, dan gaya disesuaikan
          otomatis oleh AI. Pilih multiple platform sekaligus untuk hasil paralel.
        </p>
      </div>

      {aiUnavailable ? (
        <AiUnavailableNotice configured={false} />
      ) : (
        <div className="card max-w-2xl p-5">
          <RepurposePanel
            content=""
            disabled={disabled}
            onApplyContent={(text) => {
              navigate("/compose", { state: { content: text } });
            }}
            onCreditsUsed={refetchUsage}
          />
        </div>
      )}
    </div>
  );
}
