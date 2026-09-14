// Admin: Dashboard — statistik platform
import { useQuery } from "@tanstack/react-query";
import { Building2, Link2, TrendingUp, Users, Wallet } from "lucide-react";
import { PageLoader, Skeleton } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCurrencyIdr, formatNumber } from "@/lib/format";

type Stats = {
  totalUsers: number;
  totalOrganizations: number;
  totalSocialAccounts: number;
  totalRevenue: number;
  newUsers30d: number;
  tierDistribution: { tier: string; total: number }[];
};

type BillingStats = {
  mrr: number;
  totalRevenue: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
};

const TIER_COLORS: Record<string, string> = {
  free: "var(--text-muted)",
  pro: "#08A5FC",
  business: "#FD9501",
  enterprise: "#8B5CF6",
};

export function AdminDashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Stats>("/admin/stats"),
  });
  const { data: billing } = useQuery({
    queryKey: ["admin-billing-stats"],
    queryFn: () => api.get<BillingStats>("/admin/billing/stats"),
  });

  if (!stats && !billing) return <PageLoader />;

  const cards = [
    {
      icon: Users,
      label: "Total Pengguna",
      value: formatNumber(stats?.totalUsers ?? 0),
      sub: `+${formatNumber(stats?.newUsers30d ?? 0)} baru (30 hari)`,
    },
    {
      icon: Building2,
      label: "Organisasi",
      value: formatNumber(stats?.totalOrganizations ?? 0),
      sub: `${formatNumber(stats?.totalSocialAccounts ?? 0)} akun sosmed terhubung`,
    },
    {
      icon: Wallet,
      label: "Pendapatan Total",
      value: formatCurrencyIdr(billing?.totalRevenue ?? 0),
      sub: `${billing?.completedCount ?? 0} transaksi sukses`,
    },
    {
      icon: TrendingUp,
      label: "MRR",
      value: formatCurrencyIdr(billing?.mrr ?? 0),
      sub: `${billing?.pendingCount ?? 0} pembayaran pending`,
    },
  ];

  const totalTier = (stats?.tierDistribution ?? []).reduce((s, t) => s + t.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Statistik Platform</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Ringkasan pertumbuhan Sahabat Kreator
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card p-6">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <card.icon className="h-4 w-4" />
              <span className="text-xs">{card.label}</span>
            </div>
            <p className="mt-2 font-bold text-2xl">{card.value}</p>
            <p className="mt-1 text-[var(--text-muted)] text-xs">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Distribusi tier */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Distribusi Paket Langganan Aktif</h2>
        {totalTier === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">Belum ada langganan aktif.</p>
        ) : (
          <div className="space-y-3">
            {(stats?.tierDistribution ?? []).map((tier) => (
              <div key={tier.tier} className="flex items-center gap-3">
                <span className="w-24 text-sm capitalize">{tier.tier}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(tier.total / totalTier) * 100}%`,
                      backgroundColor: TIER_COLORS[tier.tier] ?? "var(--accent-gold)",
                    }}
                  />
                </div>
                <span className="w-16 text-right font-medium text-sm">{tier.total} org</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
