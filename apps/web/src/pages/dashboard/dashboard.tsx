// Halaman Overview — ringkasan performa, upcoming posts, engagement
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Eye,
  Heart,
  MessageCircle,
  PenSquare,
  Rocket,
  Share2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { HolidayIdeasWidget } from "@/components/dashboard/holiday-ideas-widget";
import { TodayFocusCard } from "@/components/dashboard/today-focus-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { meQueryOptions } from "@/layouts/require-auth";
import { api } from "@/lib/api";
import { formatCompact, formatRelativeTime } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { isOnboardingDone, markOnboardingDone } from "@/pages/onboarding";

type Overview = {
  totals: {
    followers: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    impressions: number;
  };
  accounts: {
    id: string;
    platform: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    followers: number | null;
  }[];
};

type PostGroups = {
  groups: {
    id: string;
    content: string;
    scheduledAt: string | null;
    posts: {
      id: string;
      platform: string;
      status: string;
      username: string | null;
    }[];
  }[];
};

type Engagement = {
  unreadByType: Record<string, number>;
};

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Heart;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link to={href} className="card card-hover flex items-center gap-4 p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-2xl">{formatCompact(value)}</p>
        <p className="text-[var(--text-muted)] text-sm">{label}</p>
      </div>
    </Link>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-[var(--radius-lg)] lg:col-span-2" />
        <Skeleton className="h-72 rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: me } = useQuery(meQueryOptions);
  const { data: overview } = useQuery({
    queryKey: ["analytics-overview", 30],
    queryFn: () => api.get<Overview>("/analytics/overview?days=30"),
  });
  const { data: postsData } = useQuery({
    queryKey: ["posts-upcoming"],
    queryFn: () =>
      api.get<PostGroups>(`/posts?from=${encodeURIComponent(new Date().toISOString())}`),
  });
  const { data: engagement } = useQuery({
    queryKey: ["engagement-inbox"],
    queryFn: () => api.get<Engagement>("/engagement?status=unread"),
  });

  const firstName = me?.user.name.split(" ")[0] ?? "Kreator";
  const totals = overview?.totals;
  const unread =
    engagement?.unreadByType && Object.values(engagement.unreadByType).reduce((a, b) => a + b, 0);

  const upcoming = (postsData?.groups ?? [])
    .filter((g) => g.scheduledAt && new Date(g.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    .slice(0, 5);

  const accounts = overview?.accounts ?? [];

  return (
    <div className="space-y-6">
      {/* Banner setup awal — user baru tanpa akun sosmed (dismissible, localStorage) */}
      {accounts.length === 0 && !isOnboardingDone() && <SetupBanner />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">
            Halo, {firstName}! <span className="inline-block">👋</span>
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Ringkasan performa 30 hari terakhir
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/performance/analitik">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4" />
              Analitik Detail
            </Button>
          </Link>
          <Link to="/compose">
            <Button size="sm">
              <PenSquare className="h-4 w-4" />
              Buat Konten
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {!totals ? (
        <OverviewSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total Followers"
              value={totals.followers}
              href="/performance/analitik"
            />
            <StatCard icon={Eye} label="Views" value={totals.views} href="/performance/analitik" />
            <StatCard
              icon={Heart}
              label="Likes"
              value={totals.likes}
              href="/performance/analitik"
            />
            <StatCard
              icon={Share2}
              label="Shares"
              value={totals.shares}
              href="/performance/analitik"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Upcoming posts */}
            <div className="card p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Jadwal Berikutnya</h2>
                <Link
                  to="/calendar"
                  className="flex items-center gap-1 text-[var(--accent-gold)] text-sm hover:underline"
                >
                  Lihat kalender
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-6 w-6" />}
                  title="Belum ada jadwal"
                  description="Buat konten pertama Anda dan jadwalkan tayangnya."
                  action={
                    <Link to="/compose">
                      <Button size="sm">
                        <PenSquare className="h-3.5 w-3.5" />
                        Buat Konten
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-[var(--border-light)]">
                  {upcoming.map((group) => (
                    <li key={group.id} className="flex items-center gap-4 py-3">
                      <div className="flex -space-x-2">
                        {group.posts.slice(0, 3).map((p) => {
                          const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                          const Icon = cfg?.icon;
                          return Icon ? (
                            <div
                              key={p.id}
                              title={`${cfg.label} @${p.username ?? ""}`}
                              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--bg-primary)] bg-[var(--bg-secondary)]"
                            >
                              <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                            </div>
                          ) : null;
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{group.content || "(tanpa caption)"}</p>
                        <p className="text-[var(--text-muted)] text-xs">
                          {group.scheduledAt && formatRelativeTime(group.scheduledAt)}
                        </p>
                      </div>
                      <Badge variant="secondary">terjadwal</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Sidebar kanan */}
            <div className="space-y-6">
              {/* Fokus hari ini — post terjadwal + insight best time */}
              <TodayFocusCard />

              {/* Ide konten hari besar */}
              <HolidayIdeasWidget />

              {/* Akun terhubung */}
              <div className="card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Akun Terhubung</h2>
                  <Link
                    to="/accounts"
                    className="text-[var(--accent-gold)] text-sm hover:underline"
                  >
                    Kelola
                  </Link>
                </div>
                {accounts.length === 0 ? (
                  <p className="text-[var(--text-secondary)] text-sm">
                    Belum ada akun terhubung.{" "}
                    <Link to="/accounts" className="text-[var(--accent-gold)] underline">
                      Hubungkan sekarang
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {accounts.slice(0, 5).map((account) => {
                      const cfg = PLATFORMS[account.platform as keyof typeof PLATFORMS];
                      const Icon = cfg?.icon;
                      return (
                        <li key={account.id} className="flex items-center gap-3">
                          {Icon && (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                              <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-sm">@{account.username}</p>
                            <p className="text-[var(--text-muted)] text-xs">
                              {cfg?.label ?? account.platform}
                            </p>
                          </div>
                          <span className="font-semibold text-sm">
                            {account.followers != null ? formatCompact(account.followers) : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Engagement */}
              <div className="card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Engagement</h2>
                  <Link
                    to="/engagement"
                    className="text-[var(--accent-gold)] text-sm hover:underline"
                  >
                    Buka Inbox
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-2xl">{unread ?? 0}</p>
                    <p className="text-[var(--text-muted)] text-sm">interaksi belum dibalas</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[var(--text-secondary)] text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {formatCompact(totals.comments)} komentar diterima
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Banner setup awal — tampil saat user belum punya akun sosmed & belum selesai onboarding */
function SetupBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--accent-gold)] bg-[var(--accent-gold-light)] p-4">
      <div className="flex items-center gap-3">
        <Rocket className="h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
        <div>
          <p className="font-medium text-sm">Selesaikan setup awal Anda</p>
          <p className="text-[var(--text-muted)] text-xs">
            Hubungkan akun sosmed pertama untuk mulai posting — hanya butuh 2 menit.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link to="/onboarding">
          <Button size="sm">Mulai Setup</Button>
        </Link>
        <button
          type="button"
          className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          title="Jangan tampilkan lagi"
          onClick={() => {
            markOnboardingDone();
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
