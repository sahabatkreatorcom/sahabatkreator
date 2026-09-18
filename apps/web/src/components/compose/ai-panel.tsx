// Asisten AI caption — dipakai inline di tab "Caption Utama" dan "Variasi per Platform".
// Fokus generate caption/hashtag + tulis ulang. Fitur Repurpose & Carousel kini punya
// halaman mandiri (menu navigasi Generator AI).
// Saat variant="inline", panel tampil sebagai tombol toggle (mirip EmojiPicker) yang
// membuka popover berisi form — bukan langsung expand menjadi form penuh.
import { useMutation } from "@tanstack/react-query";
import { Hash, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const TONES = ["santai", "profesional", "lucu", "inspiratif", "promosi"] as const;
const REWRITE_STYLES = [
  { value: "lebih-santai", label: "Lebih Santai" },
  { value: "lebih-formal", label: "Lebih Formal" },
  { value: "lebih-pendek", label: "Lebih Pendek" },
  { value: "lebih-panjang", label: "Lebih Panjang" },
  { value: "hook-kuat", label: "Hook Kuat" },
  { value: "seo", label: "SEO" },
] as const;

/** Platform yang diterima endpoint AI (zod enum server) — selain ini di-fallback */
const AI_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "linkedin_org",
  "pinterest",
  "threads",
  "x",
]);

function normalizePlatform(platform: string): string {
  const base = platform.replace("instagram_standalone", "instagram");
  return AI_PLATFORMS.has(base) ? base : "instagram";
}

/** Peringatan saat AI belum dikonfigurasi admin atau kuota habis */
export function AiUnavailableNotice({ configured }: { configured: boolean }) {
  return (
    <p className="rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-3 text-[var(--text-secondary)] text-sm">
      {configured
        ? "Kuota kredit AI Anda habis. Upgrade plan untuk melanjutkan."
        : "Fitur AI belum dikonfigurasi oleh admin platform."}
    </p>
  );
}

export function AiComposerPanel({
  platform,
  content,
  hashtags,
  onApplyContent,
  onApplyHashtags,
  variant = "card",
  title = "Asisten AI",
}: {
  platform: string;
  content: string;
  hashtags: string;
  onApplyContent: (text: string) => void;
  onApplyHashtags: (tags: string) => void;
  /** "card" = panel mandiri; "inline" = menempel di dalam kartu Konten */
  variant?: "card" | "inline";
  title?: string;
}) {
  const { usage, disabled, refetchUsage } = useAiUsage();
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("santai");
  const [rewriteStyle, setRewriteStyle] =
    useState<(typeof REWRITE_STYLES)[number]["value"]>("hook-kuat");
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Tutup popover saat klik di luar (hanya relevan untuk variant="inline")
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const aiPlatform = normalizePlatform(platform);

  const generateCaption = useMutation({
    mutationFn: () =>
      api.post<{ caption: string; hashtags: string[] }>("/ai/caption", {
        prompt,
        platform: aiPlatform,
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
        platform: aiPlatform,
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
        platform: aiPlatform,
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
    // Saat inline, tampilkan sebagai teksas kecil agar tidak mengambil ruang
    if (variant === "inline") {
      return (
        <span className="text-[var(--text-muted)] text-xs" title="AI belum dikonfigurasi admin">
          AI belum aktif
        </span>
      );
    }
    return <AiUnavailableNotice configured={false} />;
  }

  // --- Form dalam popover (variant="inline") ---
  const formContent = (
    <>
      {disabled && usage?.configured && (
        <p className="text-[var(--text-secondary)] text-xs">
          Plan Anda tidak termasuk kredit AI. Upgrade plan untuk menggunakan asisten AI.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="ai-prompt" className="text-xs">
          Ide Konten
        </Label>
        <Textarea
          id="ai-prompt"
          placeholder="Contoh: promo diskon 20% untuk koleksi baju baru di toko kami"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Nada Bahasa</Label>
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
            <Label className="text-xs">Tulis Ulang Konten</Label>
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
              <Label className="text-xs">Saran Hashtag</Label>
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
              <p className="text-[var(--text-muted)] text-xs">Belum ada saran — klik Generate</p>
            )}
          </div>
        </>
      )}
    </>
  );

  // --- variant="inline": tombol toggle + popover (mirip EmojiPicker) ---
  if (variant === "inline") {
    return (
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
          title="Buka asisten AI"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
            open
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          Asisten AI
          {usage && (
            <Badge
              variant={disabled ? "destructive" : "secondary"}
              className="ml-0.5 px-1 py-0 text-[9px]"
            >
              {usage.used}/{usage.limit}
            </Badge>
          )}
        </button>

        {open && (
          <div className="card absolute bottom-full left-0 z-20 mb-2 w-80 space-y-3 p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
                {title}
              </h3>
            </div>
            {formContent}
          </div>
        )}
      </div>
    );
  }

  // --- variant="card" (default): panel mandiri seperti sebelumnya ---
  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
          {title}
        </h3>
        {usage && (
          <Badge variant={disabled ? "destructive" : "secondary"} className="text-[10px]">
            {usage.used}/{usage.limit} kredit
          </Badge>
        )}
      </div>

      {disabled && usage?.configured && (
        <p className="text-[var(--text-secondary)] text-xs">
          Plan Anda tidak termasuk kredit AI. Upgrade plan untuk menggunakan asisten AI.
        </p>
      )}

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
              <p className="text-[var(--text-muted)] text-xs">Belum ada saran — klik Generate</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
