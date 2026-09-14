// Panel Repurpose AI — adaptasi konten antar platform via /ai/repurpose
import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

/** Platform target yang didukung fitur repurpose */
export const REPURPOSE_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "X/Twitter" },
] as const;

type RepurposeTarget = (typeof REPURPOSE_PLATFORMS)[number]["value"];

export function RepurposePanel({
  content,
  disabled,
  onApplyContent,
  onCreditsUsed,
}: {
  /** Konten utama compose sebagai sumber default (bisa di-override di textarea) */
  content: string;
  disabled: boolean;
  onApplyContent: (text: string) => void;
  onCreditsUsed: () => void;
}) {
  const [source, setSource] = useState(content);
  const [target, setTarget] = useState<RepurposeTarget>("tiktok");

  const repurpose = useMutation({
    mutationFn: () =>
      api.post<{ content: string }>("/ai/repurpose", {
        content: source,
        targetPlatform: target,
      }),
    onSuccess: (data) => {
      onApplyContent(data.content);
      onCreditsUsed();
      toast.success(`Konten berhasil diadaptasi untuk ${target}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="repurpose-source">Konten Sumber</Label>
        <Textarea
          id="repurpose-source"
          placeholder="Tempel konten yang mau diadaptasi (caption blog, TikTok, dll)..."
          rows={4}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        {content.trim().length >= 10 && source !== content && (
          <button
            type="button"
            className="text-[var(--accent-gold)] text-xs hover:underline"
            onClick={() => setSource(content)}
          >
            Gunakan konten utama
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label>Platform Target</Label>
        <div className="flex flex-wrap gap-1.5">
          {REPURPOSE_PLATFORMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setTarget(p.value)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                target === p.value
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                  : "border-[var(--border)] hover:border-[var(--accent-gold)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || repurpose.isPending || source.trim().length < 10}
        onClick={() => repurpose.mutate()}
      >
        {repurpose.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCcw className="h-4 w-4" />
        )}
        Adaptasi Konten
      </Button>
    </div>
  );
}
