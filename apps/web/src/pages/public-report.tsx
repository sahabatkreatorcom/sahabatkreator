// Halaman Laporan Publik — /r/:token (TANPA auth).
// Menampilkan ringkasan performa read-only dari link yang dibagikan:
// branded (logo, metrik utama), footer "Dibuat dengan Sahabat Kreator".
// noIndex: link berisi token rahasia — jangan diindeks mesin pencari.
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Eye, FileBarChart, Heart, LinkIcon, MessageCircle, Users } from "lucide-react";
import { useParams } from "react-router";
import { Logo } from "@/components/ui/logo";
import { api } from "@/lib/api";
import { formatCompact, formatDate } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { useSeo } from "@/lib/seo";

type PublicReport = {
  title: string;
  days: number;
  accountUsername: string | null;
  generatedAt: string;
  range: { from: string; to: string };
  data: {
    followers: number;
    posts: number;
    engagement: number;
    impressions: number;
    views: number;
    accounts: { username: string; platform: string; followers: number }[];
  };
};

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Heart;
  label: string;
  value: number;
}) {
  return (
    <div className="card p-6 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-bold text-2xl">{formatCompact(value)}</p>
      <p className="mt-1 text-[var(--text-muted)] text-xs">{label}</p>
    </div>
  );
}

export function PublicReportPage() {
  const { token } = useParams<{ token: string }>();

  useSeo({
    title: "Laporan Performa",
    path: "/r",
    noIndex: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-report", token],
    queryFn: () => api.get<PublicReport>(`/reports/share/${token}`),
    retry: false,
    enabled: Boolean(token),
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header branded */}
      <header className="border-[var(--border-light)] border-b bg-[var(--bg-secondary)]">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-bold text-lg tracking-tight">
              Sahabat <span className="text-gradient">Kreator</span>
            </span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent-gold-light)] px-3 py-1 font-medium text-[var(--accent-gold)] text-xs">
            <FileBarChart className="h-3.5 w-3.5" />
            Laporan Publik
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-gold)]" />
          </div>
        ) : error || !data ? (
          <div className="card mx-auto max-w-md p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <LinkIcon className="h-7 w-7" />
            </div>
            <h1 className="font-bold text-xl">Link Tidak Tersedia</h1>
            <p className="mt-2 text-[var(--text-secondary)] text-sm">
              {error instanceof Error
                ? error.message
                : "Link laporan tidak ditemukan, sudah dicabut, atau kedaluwarsa."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Judul laporan */}
            <div className="text-center">
              <h1 className="font-bold text-3xl">{data.title}</h1>
              <p className="mt-2 text-[var(--text-secondary)] text-sm">
                Ringkasan {data.days} hari terakhir
                {data.accountUsername && ` · akun @${data.accountUsername}`}
              </p>
              <p className="mt-1 text-[var(--text-muted)] text-xs">
                Periode {formatDate(data.range.from, "short")} –{" "}
                {formatDate(data.range.to, "short")} · di generate {formatDate(data.generatedAt)}
              </p>
            </div>

            {/* Metrik utama */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={Users} label="Total Followers" value={data.data.followers} />
              <MetricCard icon={BarChart3} label="Post Tayang" value={data.data.posts} />
              <MetricCard icon={Heart} label="Engagement" value={data.data.engagement} />
              <MetricCard icon={Eye} label="Impressions" value={data.data.impressions} />
            </div>

            {/* Views tambahan */}
            <div className="card flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                  <Eye className="h-5 w-5 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-[var(--text-secondary)] text-sm">Total Views</p>
                  <p className="font-bold text-lg">{formatCompact(data.data.views)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                  <MessageCircle className="h-5 w-5 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-[var(--text-secondary)] text-sm">Rentang Data</p>
                  <p className="font-bold text-lg">{data.days} hari</p>
                </div>
              </div>
            </div>

            {/* Akun */}
            {data.data.accounts.length > 0 && (
              <div className="card p-6">
                <h2 className="mb-4 font-semibold">Akun Terhubung</h2>
                <ul className="divide-y divide-[var(--border-light)]">
                  {data.data.accounts.map((a) => {
                    const cfg = PLATFORMS[a.platform as keyof typeof PLATFORMS];
                    const Icon = cfg?.icon;
                    return (
                      <li
                        key={`${a.platform}-${a.username}`}
                        className="flex items-center gap-3 py-3"
                      >
                        {Icon && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                            <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                          </div>
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium text-sm">
                          @{a.username}
                        </span>
                        <span className="text-[var(--text-muted)] text-xs">
                          {cfg?.label ?? a.platform}
                        </span>
                        <span className="font-semibold text-sm">{formatCompact(a.followers)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="text-center text-[var(--text-muted)] text-xs">
              Data ringkasan read-only — angka diperbarui setiap kali halaman dibuka.
            </p>
          </div>
        )}
      </main>

      {/* Footer branded */}
      <footer className="border-[var(--border-light)] border-t bg-[var(--bg-secondary)] py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 text-center">
          <Logo size={28} />
          <p className="text-[var(--text-secondary)] text-sm">
            Dibuat dengan{" "}
            <a href="/" className="font-semibold text-[var(--accent-gold)] hover:underline">
              Sahabat Kreator
            </a>
          </p>
          <p className="text-[var(--text-muted)] text-xs">
            Kelola konten social media Anda dari satu tempat
          </p>
        </div>
      </footer>
    </div>
  );
}
