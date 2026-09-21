// Panel Repurpose AI — adaptasi konten ke multiple platform sekaligus.
// Setiap platform target dipanggil secara paralel via /ai/repurpose.
// Hasil ditampilkan sebagai tab per platform, editable sebelum kirim ke Compose.
// Riwayat generate disimpan ke localStorage — bisa di-restore tanpa habis credit.
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Clock, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAiHistory } from "@/hooks/use-ai-history";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Platform target yang didukung fitur repurpose — harus sinkron dengan schema /ai/repurpose */
export const REPURPOSE_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "linkedin_org", label: "LinkedIn (Company)" },
  { value: "pinterest", label: "Pinterest" },
  { value: "threads", label: "Threads" },
  { value: "x", label: "X" },
] as const;

type RepurposeTarget = (typeof REPURPOSE_PLATFORMS)[number]["value"];

/** Hasil per platform: teks adaptasi yang bisa di-edit */
type PlatformResult = {
  platform: RepurposeTarget;
  text: string;
};

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
  const [targets, setTargets] = useState<Set<RepurposeTarget>>(new Set(["tiktok"]));
  const [results, setResults] = useState<PlatformResult[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const { history, add: addHistory, remove: removeHistory } = useAiHistory();

  // Cek apakah brand voice aktif (diinject backend ke prompt)
  const { data: brandVoiceData } = useQuery({
    queryKey: ["brand-voice"],
    queryFn: () => api.get<{ brandVoice: { description: string | null } | null }>("/strategy/brand-voice"),
    staleTime: 60 * 1000,
  });
  const brandVoiceActive = !!brandVoiceData?.brandVoice?.description?.trim();

  function toggleTarget(t: RepurposeTarget) {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // Generate untuk semua platform terpilih secara paralel
  const repurposeAll = useMutation({
    mutationFn: async () => {
      const targetList = [...targets];
      const promises = targetList.map((target) =>
        api
          .post<{ content: string }>("/ai/repurpose", {
            content: source,
            targetPlatform: target,
          })
          .then((res) => ({ platform: target, text: res.content }) as PlatformResult)
          .catch((e: Error) => {
            toast.error(`${target}: ${e.message}`);
            return null;
          }),
      );
      const settled = await Promise.all(promises);
      return settled.filter((r): r is PlatformResult => r !== null);
    },
    onSuccess: (data) => {
      setResults(data);
      setActiveTab(0);
      onCreditsUsed();
      const count = data.length;
      toast.success(count === 1 ? "Konten berhasil diadaptasi" : `${count} platform berhasil diadaptasi`);
      // Simpan ke history
      const platformLabel = count === 1
        ? REPURPOSE_PLATFORMS.find((p) => p.value === data[0].platform)?.label ?? data[0].platform
        : `${count} platform`;
      addHistory({
        type: "repurpose",
        label: `${platformLabel} — ${source.slice(0, 40)}...`,
        content: data.map((r) => {
          const label = REPURPOSE_PLATFORMS.find((p) => p.value === r.platform)?.label ?? r.platform;
          return `--- ${label} ---\n${r.text}`;
        }).join("\n\n"),
        metadata: { source: source.slice(0, 200) },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateResult(platform: RepurposeTarget, text: string) {
    setResults((prev) => prev.map((r) => (r.platform === platform ? { ...r, text } : r)));
  }

  const hasResults = results.length > 0;
  const activeResult = results[activeTab];

  return (
    <div className="space-y-4">
      {/* Indikator brand voice */}
      {brandVoiceActive && (
        <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] px-2.5 py-1 text-[var(--accent-gold)] text-xs">
          <Check className="h-3 w-3" />
          Brand voice aktif — nada & gaya merek diterapkan ke hasil
        </div>
      )}

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
        <Label>Platform Target (pilih satu atau lebih)</Label>
        <div className="flex flex-wrap gap-1.5">
          {REPURPOSE_PLATFORMS.map((p) => {
            const selected = targets.has(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggleTarget(p.value)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  selected
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                    : "border-[var(--border)] hover:border-[var(--accent-gold)]",
                )}
              >
                {selected && <Check className="h-3 w-3" />}
                {p.label}
              </button>
            );
          })}
        </div>
        {targets.size === 0 && (
          <p className="text-[var(--text-muted)] text-xs">Pilih minimal satu platform target</p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || repurposeAll.isPending || source.trim().length < 10 || targets.size === 0}
        onClick={() => repurposeAll.mutate()}
      >
        {repurposeAll.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCcw className="h-4 w-4" />
        )}
        Adaptasi ke {targets.size} Platform
      </Button>

      {/* Hasil per platform — tab + textarea editable */}
      {hasResults && (
        <div className="space-y-3">
          {/* Tab platform */}
          {results.length > 1 && (
            <div className="flex flex-wrap gap-1 border-[var(--border-light)] border-b">
              {results.map((r, i) => {
                const label = REPURPOSE_PLATFORMS.find((p) => p.value === r.platform)?.label ?? r.platform;
                return (
                  <button
                    key={r.platform}
                    type="button"
                    onClick={() => setActiveTab(i)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                      i === activeTab
                        ? "border-[var(--accent-gold)] font-medium text-[var(--accent-gold)]"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Textarea editable */}
          {activeResult && (
            <>
              <Textarea
                rows={8}
                value={activeResult.text}
                onChange={(e) => updateResult(activeResult.platform, e.target.value)}
                className="text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(activeResult.text);
                    toast.success("Hasil dicopy");
                  }}
                >
                  Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onApplyContent(activeResult.text)}
                >
                  Pakai di Compose
                </Button>
                {results.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const all = results.map((r) => {
                        const label = REPURPOSE_PLATFORMS.find((p) => p.value === r.platform)?.label ?? r.platform;
                        return `--- ${label} ---\n${r.text}`;
                      }).join("\n\n");
                      void navigator.clipboard.writeText(all);
                      toast.success("Semua hasil dicopy");
                    }}
                  >
                    Copy Semua
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Riwayat generate — restore tanpa habis credit */}
      {history.filter((h) => h.type === "repurpose").length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[var(--text-secondary)] text-xs font-medium">
              <Clock className="h-3 w-3" />
              Riwayat
            </p>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {history.filter((h) => h.type === "repurpose").map((h) => (
              <div
                key={h.id}
                className="group flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    // Parse hasil multi-platform dari history
                    const parts = h.content.split(/---\s/).filter(Boolean);
                    if (parts.length > 1) {
                      const parsed = parts.map((part) => {
                        const match = part.match(/^([^-\n]+)\s*---\n?([\s\S]*)/);
                        if (match) {
                          const platformLabel = match[1].trim();
                          const platformValue = REPURPOSE_PLATFORMS.find(
                            (p) => p.label === platformLabel,
                          )?.value;
                          if (platformValue) {
                            return { platform: platformValue, text: match[2].trim() } as PlatformResult;
                          }
                        }
                        return null;
                      }).filter((r): r is PlatformResult => r !== null);
                      if (parsed.length > 0) {
                        setResults(parsed);
                        setActiveTab(0);
                        toast.success("Riwayat dimuat");
                      }
                    } else {
                      setResults([{ platform: "tiktok", text: h.content }]);
                      setActiveTab(0);
                      toast.success("Riwayat dimuat");
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
