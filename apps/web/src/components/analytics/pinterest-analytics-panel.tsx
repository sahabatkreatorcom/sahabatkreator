// Panel Analytics Pinterest — fetch on-demand (Developer Guidelines melarang
// penyimpanan data analytics Pinterest, jadi data hanya muncul saat user minta).
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCompact } from "@/lib/format";

type PinterestPin = {
  id: string;
  title: string;
  thumbnail: string | null;
  createdAt: string;
  impressions: number | null;
  engagements: number | null;
  link: string | null;
};

type PinterestResponse = {
  account: {
    username: string;
    followerCount: number | null;
    pinCount: number | null;
    boardCount: number | null;
  } | null;
  pins: PinterestPin[];
  error?: string;
  needsReconnect?: boolean;
  cachedAt?: string;
  sandbox?: boolean;
};

function cacheAgeLabel(cachedAt?: string): string | null {
  if (!cachedAt) return null;
  const ageMs = Date.now() - new Date(cachedAt).getTime();
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return "baru saja diperbarui";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  return `${hours} jam lalu`;
}

export function PinterestAnalyticsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [forceCount, setForceCount] = useState(0);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["analytics-pinterest", forceCount],
    queryFn: () => api.get<PinterestResponse>("/analytics/pinterest"),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const account = data?.account;
  const pins = data?.pins ?? [];
  const cacheLabel = cacheAgeLabel(data?.cachedAt);
  const totalImpressions = pins.reduce((sum, p) => sum + (p.impressions ?? 0), 0);
  const totalEngagements = pins.reduce((sum, p) => sum + (p.engagements ?? 0), 0);

  // Belum ada akun Pinterest atau belum pernah di-fetch
  if (!enabled) {
    return (
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base">📌</span>
          <h2 className="font-semibold">Analytics Pinterest</h2>
        </div>
        <p className="mb-4 text-[var(--text-secondary)] text-xs">
          Pinterest melarang penyimpanan data analytics menurut Developer Guidelines, jadi
          metrik di-fetch langsung dari API hanya saat Anda memintanya.
        </p>
        <Button onClick={() => setEnabled(true)} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Fetch Analytics Pinterest
        </Button>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-base">📌</span>
        <h2 className="font-semibold">Analytics Pinterest</h2>
        {data?.sandbox && (
          <Badge variant="secondary" className="text-[10px]" title="Aplikasi Pinterest belum memiliki akses API standard">
            Mode Sandbox
          </Badge>
        )}
        {cacheLabel && (
          <span className="text-[var(--text-muted)] text-xs">diperbarui {cacheLabel}</span>
        )}
        <Button
          onClick={() => {
            setForceCount((c) => c + 1);
            refetch();
          }}
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={isFetching}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Mengambil..." : "Muat Ulang"}
        </Button>
      </div>

      {data?.sandbox && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)] text-xs">
          Akun Pinterest terhubung dalam <strong>mode sandbox</strong>. Data pin &amp; followers
          tersedia, tetapi metrik analytics (impressions/engagement) hanya tersedia setelah
          aplikasi mendapatkan akses API standard dari Pinterest.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data?.needsReconnect ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
          <div>
            <p className="font-medium text-sm">Tidak dapat mengambil analytics</p>
            <p className="mt-1 text-[var(--text-secondary)] text-xs">
              {data.error ??
                "Gagal mengautentikasi ke Pinterest. Hubungkan ulang akun Anda."}
            </p>
          </div>
        </div>
      ) : !account ? (
        <EmptyState
          title="Akun Pinterest tidak ditemukan"
          description="Hubungkan akun Pinterest di halaman Koneksi untuk melihat analytics-nya."
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3">
              <p className="text-[var(--text-muted)] text-xs">Followers</p>
              <p className="mt-1 font-bold text-lg">
                {formatCompact(account.followerCount ?? 0)}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3">
              <p className="text-[var(--text-muted)] text-xs">Pin</p>
              <p className="mt-1 font-bold text-lg">{formatCompact(account.pinCount ?? 0)}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3">
              <p className="text-[var(--text-muted)] text-xs">Impressions (7d)</p>
              <p className="mt-1 font-bold text-lg">
                {data?.sandbox ? "—" : formatCompact(totalImpressions)}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] p-3">
              <p className="text-[var(--text-muted)] text-xs">Engagement (7d)</p>
              <p className="mt-1 font-bold text-lg">
                {data?.sandbox ? "—" : formatCompact(totalEngagements)}
              </p>
            </div>
          </div>

          {pins.length === 0 ? (
            <EmptyState
              title="Belum ada pin"
              description="Pin yang Anda buat akan muncul di sini dengan metriknya."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {pins.map((pin) => (
                <a
                  key={pin.id}
                  href={pin.link ?? `https://www.pinterest.com/pin/${pin.id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-light)] transition-colors hover:border-[var(--accent-gold)]/60"
                >
                  {pin.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pin.thumbnail}
                      alt={pin.title || "pin"}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-muted)] text-xs">
                      tanpa gambar
                    </div>
                  )}
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs" title={pin.title}>
                      {pin.title || "(tanpa judul)"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pin.impressions !== null && (
                        <Badge variant="secondary" className="text-[10px]">
                          {formatCompact(pin.impressions)} impressions
                        </Badge>
                      )}
                      {pin.engagements !== null && (
                        <Badge variant="secondary" className="text-[10px]">
                          {formatCompact(pin.engagements)} engagement
                        </Badge>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
