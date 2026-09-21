// Panel Performa Hashtag — agregasi engagement per hashtag dari data post lokal
import { useQuery } from "@tanstack/react-query";
import { Hash } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCompact, formatNumber } from "@/lib/format";

type HashtagStat = {
  hashtag: string;
  posts: number;
  totalEngagement: number;
  avgEngagement: number;
};

type HashtagsResponse = {
  days: number;
  hashtags: HashtagStat[];
};

export function HashtagPerformancePanel({ days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-hashtags", days],
    queryFn: () => api.get<HashtagsResponse>(`/analytics/hashtags?days=${days}`),
  });

  const hashtags = data?.hashtags ?? [];
  const maxEngagement = Math.max(1, ...hashtags.map((h) => h.totalEngagement));

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Hash className="h-4 w-4 text-[var(--accent-gold)]" />
        <h2 className="font-semibold">Performa Hashtag</h2>
      </div>
      <p className="mb-4 text-[var(--text-secondary)] text-xs">
        Top 20 hashtag dari konten tayang {days} hari terakhir, diurutkan berdasarkan total
        engagement (likes + komentar + share).
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : hashtags.length === 0 ? (
        <EmptyState
          title="Belum ada data hashtag"
          description="Publish konten dengan hashtag — performanya akan muncul di sini setelah metrik tersinkron."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs">
                <th className="pr-3 pb-2 font-medium">Hashtag</th>
                <th className="pr-3 pb-2 text-right font-medium">Post</th>
                <th className="pr-3 pb-2 font-medium">Total Engagement</th>
                <th className="pb-2 text-right font-medium">Rata-rata</th>
              </tr>
            </thead>
            <tbody>
              {hashtags.map((h) => {
                // Bar mini inline — width % dari max engagement
                const widthPct = Math.max(2, Math.round((h.totalEngagement / maxEngagement) * 100));
                return (
                  <tr
                    key={h.hashtag}
                    className="border-[var(--border-light)] border-b last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <span className="text-[var(--accent-gold)]">{h.hashtag}</span>
                    </td>
                    <td className="py-2 pr-3 text-right text-[var(--text-secondary)]">
                      {formatNumber(h.posts)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                          {formatCompact(h.totalEngagement)}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent-gold)]"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-right text-[var(--text-secondary)] tabular-nums">
                      {formatCompact(h.avgEngagement)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
