// Panel asisten AI di Compose — generate caption/hashtag, rewrite, repurpose & carousel via OpenRouter
import { useMutation, useQuery } from "@tanstack/react-query";
import { Hash, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CarouselPanel } from "@/components/compose/carousel-panel";
import { RepurposePanel } from "@/components/compose/repurpose-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

type AiUsage = {
  configured: boolean;
  used: number;
  limit: number;
  period: string;
};

type PanelTab = "caption" | "repurpose" | "carousel";

const TABS: { key: PanelTab; label: string }[] = [
  { key: "caption", label: "Caption" },
  { key: "repurpose", label: "Repurpose" },
  { key: "carousel", label: "Carousel" },
];

const TONES = ["santai", "profesional", "lucu", "inspiratif", "promosi"] as const;
const REWRITE_STYLES = [
  { value: "lebih-santai", label: "Lebih Santai" },
  { value: "lebih-formal", label: "Lebih Formal" },
  { value: "lebih-pendek", label: "Lebih Pendek" },
  { value: "lebih-panjang", label: "Lebih Panjang" },
  { value: "hook-kuat", label: "Hook Kuat" },
  { value: "seo", label: "SEO" },
] as const;

export function AiComposerPanel({
  platform,
  content,
  hashtags,
  onApplyContent,
  onApplyHashtags,
}: {
  platform: string;
  content: string;
  hashtags: string;
  onApplyContent: (text: string) => void;
  onApplyHashtags: (tags: string) => void;
}) {
  const [tab, setTab] = useState<PanelTab>("caption");
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("santai");
  const [rewriteStyle, setRewriteStyle] =
    useState<(typeof REWRITE_STYLES)[number]["value"]>("hook-kuat");
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);

  const { data: usage, refetch: refetchUsage } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api.get<AiUsage>("/ai/usage"),
  });

  const disabled = !usage?.configured || usage.limit === 0;

  const generateCaption = useMutation({
    mutationFn: () =>
      api.post<{ caption: string; hashtags: string[] }>("/ai/caption", {
        prompt,
        platform,
        tone,
        includeHashtags: true,
      }),
    onSuccess: (data) => {
      onApplyContent(data.caption);
      setSuggestedHashtags(data.hashtags);
      refetchUsage();
      toast.success("Caption dihasilkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateHashtags = useMutation({
    mutationFn: () =>
      api.post<{ hashtags: string[] }>("/ai/hashtag", {
        prompt: prompt || content.slice(0, 200),
        platform,
        count: 10,
      }),
    onSuccess: (data) => {
      setSuggestedHashtags(data.hashtags);
      refetchUsage();
      toast.success("Hashtag dihasilkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rewrite = useMutation({
    mutationFn: () =>
      api.post<{ text: string }>("/ai/rewrite", {
        text: content,
        platform,
        style: rewriteStyle,
      }),
    onSuccess: (data) => {
      onApplyContent(data.text);
      refetchUsage();
      toast.success("Konten ditulis ulang");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (usage && !usage.configured) {
    return (
      <div className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" />
          Asisten AI
        </h2>
        <p className="mt-2 text-[var(--text-secondary)] text-sm">
          Fitur AI belum dikonfigurasi oleh admin platform.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" />
          Asisten AI
        </h2>
        {usage && (
          <Badge variant={disabled ? "destructive" : "secondary"} className="text-[10px]">
            {usage.used}/{usage.limit} kredit
          </Badge>
        )}
      </div>

      {disabled && (
        <p className="text-[var(--text-secondary)] text-xs">
          Plan Anda tidak termasuk kredit AI. Upgrade plan untuk menggunakan asisten AI.
        </p>
      )}

      {/* Tab fitur AI */}
      <div className="flex gap-1 border-[var(--border-light)] border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key
                ? "border-[var(--accent-gold)] font-medium text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "caption" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Ide Konten</Label>
            <Textarea
              id="ai-prompt"
              placeholder="Contoh: promo diskon 20% untuk koleksi baju baru di toko kami"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Nada Bahasa</Label>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                    tone === t
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled || generateCaption.isPending || prompt.trim().length < 3}
            onClick={() => generateCaption.mutate()}
          >
            {generateCaption.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Generate Caption
          </Button>

          {content.trim().length >= 10 && (
            <>
              <hr className="border-[var(--border-light)]" />
              <div className="space-y-2">
                <Label>Tulis Ulang Konten</Label>
                <div className="flex flex-wrap gap-1.5">
                  {REWRITE_STYLES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setRewriteStyle(s.value)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        rewriteStyle === s.value
                          ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                          : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={disabled || rewrite.isPending}
                  onClick={() => rewrite.mutate()}
                >
                  {rewrite.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Tulis Ulang
                </Button>
              </div>
            </>
          )}

          {(suggestedHashtags.length > 0 || hashtags.length > 0) && (
            <>
              <hr className="border-[var(--border-light)]" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Saran Hashtag</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || generateHashtags.isPending}
                    onClick={() => generateHashtags.mutate()}
                  >
                    {generateHashtags.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Hash className="h-3.5 w-3.5" />
                    )}
                    Generate
                  </Button>
                </div>
                {suggestedHashtags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedHashtags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          // Toggle: tambah jika belum ada, hapus jika sudah
                          const current = hashtags
                            .split(/[,\s]+/)
                            .map((t) => t.replace(/^#/, "").trim())
                            .filter(Boolean);
                          const exists = current.includes(tag.replace(/^#/, ""));
                          const next = exists
                            ? current.filter((t) => t !== tag.replace(/^#/, ""))
                            : [...current, tag.replace(/^#/, "")];
                          onApplyHashtags(next.join(", "));
                        }}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          hashtags.includes(tag.replace(/^#/, ""))
                            ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                            : "border-[var(--border)] hover:border-[var(--accent-gold)]"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)] text-xs">
                    Belum ada saran — klik Generate
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === "repurpose" && (
        <RepurposePanel
          content={content}
          disabled={disabled}
          onApplyContent={onApplyContent}
          onCreditsUsed={() => void refetchUsage()}
        />
      )}

      {tab === "carousel" && (
        <CarouselPanel
          platform={platform}
          disabled={disabled}
          onApplyContent={onApplyContent}
          onCreditsUsed={() => void refetchUsage()}
        />
      )}
    </div>
  );
}
