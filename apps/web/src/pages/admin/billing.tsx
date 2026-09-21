// Admin: Billing & Pendapatan — ringkasan pendapatan + daftar langganan organisasi
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCurrencyIdr, formatDate, formatNumber } from "@/lib/format";

type BillingStats = {
  totalRevenue: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  mrr: number;
};

type BillingOrg = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: string;
  tier: string | null;
  status: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  planName: string | null;
  memberCount: number;
  mrr: number;
};

type OverviewResponse = {
  organizations: BillingOrg[];
  summary: {
    totalMrr: number;
    activeCount: number;
    trialingCount: number;
    pastDueCount: number;
  };
  total: number;
  page: number;
  perPage: number;
};

/** Label + varian badge untuk status langganan */
function statusStyle(status: string | null): {
  label: string;
  variant: Parameters<typeof Badge>[0]["variant"];
} {
  switch (status) {
    case "active":
      return { label: "Aktif", variant: "success" };
    case "trialing":
      return { label: "Trial", variant: "warning" };
    case "past_due":
      return { label: "Past Due", variant: "destructive" };
    case "inactive":
    case "canceled":
      return { label: "Nonaktif", variant: "secondary" };
    default:
      return { label: "—", variant: "secondary" };
  }
}

export function AdminBillingPage() {
  // Search debounce sederhana: input lokal → nilai ter-commit setelah 350ms
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: stats } = useQuery({
    queryKey: ["admin-billing-stats"],
    queryFn: () => api.get<BillingStats>("/admin/billing/stats"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-billing-overview", search, page],
    queryFn: () =>
      api.get<OverviewResponse>(
        `/admin/billing/overview?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });

  const orgs = data?.organizations ?? [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 20;
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  // Kartu ringkasan — nilai utama dari /stats, jumlah langganan dari /overview summary
  const cards = [
    {
      icon: TrendingUp,
      label: "MRR",
      value: formatCurrencyIdr(summary?.totalMrr ?? stats?.mrr ?? 0),
    },
    {
      icon: Wallet,
      label: "Pendapatan Total",
      value: formatCurrencyIdr(stats?.totalRevenue ?? 0),
    },
    {
      icon: Users,
      label: "Langganan Aktif",
      value: formatNumber(summary?.activeCount ?? 0),
    },
    {
      icon: Clock,
      label: "Trial",
      value: formatNumber(summary?.trialingCount ?? 0),
    },
    {
      icon: AlertTriangle,
      label: "Past Due",
      value: formatNumber(summary?.pastDueCount ?? 0),
    },
    {
      icon: CreditCard,
      label: "Pembayaran Gagal",
      value: formatNumber(stats?.failedCount ?? 0),
    },
    {
      icon: Clock,
      label: "Pending",
      value: formatNumber(stats?.pendingCount ?? 0),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Billing & Pendapatan</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Ringkasan pendapatan dan langganan seluruh organisasi
        </p>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => (
          <div key={card.label} className="card p-6">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <card.icon className="h-4 w-4" />
              <span className="text-xs">{card.label}</span>
            </div>
            <p className="mt-2 font-bold text-xl">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Pencarian */}
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari organisasi…"
          className="pl-9"
          aria-label="Cari organisasi"
        />
      </div>

      {/* Tabel organisasi */}
      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <PageLoader />
        ) : orgs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="Tidak ada organisasi"
              description={
                search
                  ? `Tidak ada hasil untuk pencarian "${search}".`
                  : "Belum ada data langganan organisasi."
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs">
                <th className="px-5 py-3 font-medium">Organisasi</th>
                <th className="px-5 py-3 font-medium">Paket</th>
                <th className="px-5 py-3 font-medium">Tier</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">MRR</th>
                <th className="px-5 py-3 font-medium">Anggota</th>
                <th className="px-5 py-3 font-medium">Periode Berjalan</th>
                <th className="px-5 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {orgs.map((org) => {
                const style = statusStyle(org.status);
                return (
                  <tr key={org.id} className="hover:bg-[var(--bg-secondary)]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={org.name} src={org.logo ?? undefined} className="h-9 w-9" />
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-[var(--text-muted)] text-xs">{org.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)] text-xs">
                      {org.planName ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={org.tier === "free" ? "secondary" : "primary"}>
                        {org.tier ?? "free"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={style.variant}>{style.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{formatCurrencyIdr(org.mrr)}</td>
                    <td className="px-5 py-3">{org.memberCount}</td>
                    <td className="px-5 py-3 text-[var(--text-muted)] text-xs">
                      {org.currentPeriodStart && org.currentPeriodEnd ? (
                        <span
                          title={
                            org.trialEndsAt
                              ? `Trial berakhir: ${formatDate(org.trialEndsAt)}`
                              : undefined
                          }
                        >
                          {formatDate(org.currentPeriodStart)} — {formatDate(org.currentPeriodEnd)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link to="/admin/organizations">
                        <Button size="sm" variant="outline">
                          Detail
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginasi */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Sebelumnya
          </Button>
          <span className="text-[var(--text-muted)] text-sm">
            Halaman {page} dari {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Berikutnya
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
