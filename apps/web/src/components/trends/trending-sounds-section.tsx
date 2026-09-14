// Section Trending Sounds — kurasi sound viral Instagram & TikTok.
// Tidak ada API publik resmi untuk tren sound, jadi data bersifat statis
// dan dikurasi manual (lihat lib/trending-sounds.ts).
import { ChevronDown, Lightbulb, Music2, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { formatCompact } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import {
  TRENDING_CATEGORY_LABELS,
  TRENDING_SOUNDS,
  type TrendingCategory,
  type TrendingPlatform,
  type TrendingSound,
} from "@/lib/trending-sounds";
import { cn } from "@/lib/utils";

/** Gaya badge per platform — warna khas masing-masing platform */
const PLATFORM_BADGES: Record<
  TrendingPlatform,
  { label: string; icon: React.ReactNode; className: string }
> = {
  instagram: {
    label: "Instagram",
    icon: <PLATFORMS.instagram.icon className="h-3 w-3" />,
    className: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
  },
  tiktok: {
    label: "TikTok",
    icon: <Music2 className="h-3 w-3" />,
    className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200",
  },
};

/** Saran format konten per kategori — panduan cepat untuk kreator */
const FORMAT_SUGGESTIONS: Record<TrendingCategory, string[]> = {
  lifestyle: [
    "Reels 15–30 detik dengan transisi OOTD",
    "Story vlog singkat harian",
    "TikTok before–after yang estetik",
  ],
  edukasi: [
    "Reels tutorial 15 detik langkah demi langkah",
    "Carousel infografis 5–7 slide",
    "TikTok penjelasan cepat dengan teks besar",
  ],
  hiburan: [
    "Sketsa komedi 20–30 detik",
    "TikTok lip sync kreatif",
    "Reels reaction dengan punchline di 3 detik pertama",
  ],
  bisnis: [
    "Reels demo produk 30 detik",
    "TikTok unboxing dengan transisi cepat",
    "Carousel benefit produk + CTA di slide terakhir",
  ],
  musik: [
    "Reels lip sync di momen puncak lagu",
    "TikTok cover 15 detik",
    "Story teaser lagu + lanjut ke konten utama",
  ],
};

type CategoryFilter = TrendingCategory | "semua";
type PlatformFilter = TrendingPlatform | "semua";

function SoundCard({
  sound,
  expanded,
  onToggle,
}: {
  sound: TrendingSound;
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const badge = PLATFORM_BADGES[sound.platform];

  function pakaiIde() {
    // Prefill compose dengan ide dari sound tren — dibaca compose.tsx
    // via location.state.content
    navigate("/compose", {
      state: {
        content: [
          `Ide konten dari tren sound "${sound.title}" — ${sound.artist}`,
          "",
          `Sound "${sound.title}" (${sound.genre}) sedang tren di ${badge.label}:`,
          `±${formatCompact(sound.usageCount)} digunakan, tumbuh +${sound.growth}% minggu ini.`,
          "",
          sound.hook,
          "",
          "Format yang disarankan:",
          ...FORMAT_SUGGESTIONS[sound.category].map((f) => `- ${f}`),
        ].join("\n"),
      },
    });
  }

  return (
    <div className="card flex flex-col p-5">
      {/* Badge platform + genre */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs",
            badge.className,
          )}
        >
          {badge.icon}
          {badge.label}
        </span>
        <span className="text-[var(--text-muted)] text-xs">{sound.genre}</span>
      </div>

      {/* Judul + artis */}
      <h3 className="mt-2.5 truncate font-semibold" title={sound.title}>
        {sound.title}
      </h3>
      <p className="truncate text-[var(--text-secondary)] text-sm">{sound.artist}</p>

      {/* Statistik pemakaian */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[var(--text-muted)] text-xs">
          {formatCompact(sound.usageCount)} digunakan
        </span>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 text-xs dark:bg-emerald-500/15 dark:text-emerald-300">
          <TrendingUp className="h-3 w-3" />+{sound.growth}%
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-secondary)] text-xs">
          {TRENDING_CATEGORY_LABELS[sound.category]}
        </span>
      </div>

      {/* Expand ide konten + aksi pakai ide */}
      <div className="mt-4 flex items-center gap-2 border-[var(--border-light)] border-t pt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-1.5 font-medium text-[var(--accent-gold)] text-sm hover:underline"
        >
          <Lightbulb className="h-4 w-4" />
          Ide konten
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>
        <Button variant="outline" size="sm" onClick={pakaiIde}>
          <Sparkles className="h-3.5 w-3.5" />
          Pakai ide
        </Button>
      </div>

      {/* Detail ide — hook + saran format */}
      {expanded && (
        <div className="mt-3 space-y-3 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3">
          <p className="text-sm leading-relaxed">{sound.hook}</p>
          <div>
            <p className="font-semibold text-[var(--text-secondary)] text-xs">Saran format:</p>
            <ul className="mt-1.5 space-y-1">
              {FORMAT_SUGGESTIONS[sound.category].map((format) => (
                <li
                  key={format}
                  className="flex items-start gap-1.5 text-[var(--text-secondary)] text-xs"
                >
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--accent-gold)]" />
                  {format}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function TrendingSoundsSection() {
  const [category, setCategory] = useState<CategoryFilter>("semua");
  const [platform, setPlatform] = useState<PlatformFilter>("semua");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = TRENDING_SOUNDS.filter(
    (s) =>
      (category === "semua" || s.category === category) &&
      (platform === "semua" || s.platform === platform),
    // Urutkan berdasarkan pertumbuhan mingguan — paling viral duluan
  ).sort((a, b) => b.growth - a.growth);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-xl">
          <Music2 className="h-5 w-5 text-[var(--accent-gold)]" />
          Trending Sounds
        </h2>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Sound viral di Instagram & TikTok yang cocok untuk konten Anda — dikurasi manual tim kami
          (tidak ada API publik resmi untuk tren sound).
        </p>
      </div>

      {/* Filter kategori */}
      <div className="flex flex-wrap gap-2">
        {(["semua", ...Object.keys(TRENDING_CATEGORY_LABELS)] as CategoryFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              category === key
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                : "border-[var(--border)] hover:border-[var(--accent-gold)]",
            )}
          >
            {key === "semua" ? "Semua kategori" : TRENDING_CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Filter platform */}
      <div className="flex flex-wrap gap-2">
        {(["semua", "instagram", "tiktok"] as PlatformFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPlatform(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              platform === key
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                : "border-[var(--border)] hover:border-[var(--accent-gold)]",
            )}
          >
            {key === "semua" ? "Semua platform" : PLATFORM_BADGES[key].label}
          </button>
        ))}
      </div>

      {/* Grid kartu sound */}
      {filtered.length === 0 ? (
        <p className="card p-6 text-center text-[var(--text-secondary)] text-sm">
          Tidak ada sound yang cocok dengan filter ini.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((sound) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              expanded={expandedId === sound.id}
              onToggle={() => setExpandedId((prev) => (prev === sound.id ? null : sound.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
