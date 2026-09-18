// Halaman Tren — tren pencarian Google Indonesia + AI generate ide konten
// + chart lagu Apple Music ID + video populer YouTube ID (semua data nyata)
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Flame, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MediaTrendsSection } from "@/components/trends/media-trends-section";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type TrendItem = {
  title: string;
  approxTraffic: string | null;
  articles: { title: string; url: string; source: string }[];
  pictureUrl: string | null;
};

type TrendIdea = {
  title: string;
  angle: string;
  caption: string;
  hashtags: string[];
};

export function TrendsPage() {
  const [platform, setPlatform] = useState("instagram");
  const [ideas, setIdeas] = useState<Record<string, TrendIdea[]>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["trends"],
    queryFn: () => api.get<{ trends: TrendItem[]; available: boolean }>("/trends?limit=20"),
    staleTime: 30 * 60 * 1000, // tren harian — refresh 30 menit cukup
  });

  const generateIdeas = useMutation({
    mutationFn: (trend: string) =>
      api.post<{ ideas: TrendIdea[] }>("/trends/ideas", { trend, platform }),
    onSuccess: (res, trend) => {
      setIdeas((prev) => ({ ...prev, [trend]: res.ideas }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trends = data?.trends ?? [];

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Flame className="h-6 w-6 text-orange-500" />
            Tren Hari Ini
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Pencarian populer Google Indonesia — manfaatkan untuk konten yang ikut relevan
          </p>
        </div>
        {/* Pilihan platform untuk generate ide */}
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-sm"
          aria-label="Platform untuk ide konten"
        >
          {Object.entries(PLATFORMS)
            .filter(
              ([key]) =>
                key !== "manual" &&
                key !== "google_business" &&
                key !== "bluesky" &&
                key !== "instagram_standalone",
            )
            .map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
        </select>
      </div>

      {/* Tren musik (Apple Music chart) + video populer YouTube — data nyata */}
      <MediaTrendsSection />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]"
            />
          ))}
        </div>
      ) : !data?.available ? (
        <div className="card p-8 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 text-[var(--text-secondary)] text-sm">
            Tren Google belum bisa diambil saat ini — coba beberapa saat lagi.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {trends.map((trend, idx) => {
            const cfg = PLATFORMS[platform as keyof typeof PLATFORMS];
            void cfg;
            const trendIdeas = ideas[trend.title];
            return (
              <li key={trend.title} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-600 text-xs dark:bg-orange-900/40 dark:text-orange-300">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{trend.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[var(--text-muted)] text-xs">
                        {trend.approxTraffic && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {trend.approxTraffic} pencarian
                          </span>
                        )}
                        {trend.articles[0] && (
                          <a
                            href={trend.articles[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-[var(--accent-gold)] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {trend.articles[0].source}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={generateIdeas.isPending}
                    onClick={() => generateIdeas.mutate(trend.title)}
                  >
                    {generateIdeas.isPending && generateIdeas.variables === trend.title ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Ide Konten
                  </Button>
                </div>

                {/* Ide konten hasil AI */}
                {trendIdeas && (
                  <div className="mt-4 space-y-3 border-[var(--border-light)] border-t pt-4">
                    {trendIdeas.map((idea, i) => (
                      <div
                        key={`${idea.title}-${i}`}
                        className={cn(
                          "rounded-[var(--radius-md)] border border-[var(--border)] p-3",
                          i === 0 && "border-[var(--accent-gold)]/50",
                        )}
                      >
                        <p className="font-semibold text-sm">{idea.title}</p>
                        <p className="mt-0.5 text-[var(--text-muted)] text-xs italic">
                          {idea.angle}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm">{idea.caption}</p>
                        {idea.hashtags?.length > 0 && (
                          <p className="mt-1.5 text-[var(--accent-gold)] text-xs">
                            {idea.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
