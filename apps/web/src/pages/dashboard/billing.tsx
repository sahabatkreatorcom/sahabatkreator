// Halaman Billing — status langganan, upgrade plan, riwayat pembayaran
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCurrencyIdr, formatDate, formatNumber } from "@/lib/format";

type BillingStatus = {
  tier: string;
  limits: Record<string, number>;
  subscription: {
    id: string;
    tier: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
  configured: boolean;
};

type Plan = {
  id: string;
  tier: string;
  name: string;
  priceIdr: number;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  features: string[] | null;
};

type Payment = {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  paymentLinkUrl: string | null;
  paymentCode: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const TIER_LABELS: Record<string, string> = {
  free: "Gratis",
  pro: "Pro",
  business: "Bisnis",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  completed: "Lunas",
  failed: "Gagal",
  expired: "Kedaluwarsa",
  active: "Aktif",
  canceled: "Dibatalkan",
  past_due: "Jatuh Tempo",
};

export function BillingPage() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const { data: status, isLoading } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => api.get<BillingStatus>("/billing/status"),
  });
  const { data: plansData } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<{ plans: Plan[] }>("/billing/plans"),
  });
  const { data: paymentsData } = useQuery({
    queryKey: ["billing-payments"],
    queryFn: () => api.get<{ payments: Payment[] }>("/billing/payments"),
  });

  // Notifikasi hasil pembayaran dari redirect
  useEffect(() => {
    const result = params.get("status");
    if (result === "success") {
      toast.success("Pembayaran berhasil! Paket Anda segera aktif.");
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      queryClient.invalidateQueries({ queryKey: ["billing-payments"] });
    } else if (result === "cancel") {
      toast.info("Pembayaran dibatalkan");
    }
  }, [params, queryClient]);

  const checkout = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ paymentLinkUrl: string }>("/billing/checkout", { planId }),
    onSuccess: (data) => {
      if (data.paymentLinkUrl) {
        window.location.href = data.paymentLinkUrl;
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !status) return <PageLoader />;

  const plans = plansData?.plans ?? [];
  const payments = paymentsData?.payments ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Langganan & Tagihan</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Kelola paket langganan organisasi Anda
        </p>
      </div>

      {/* Status langganan */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-gradient text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg">Paket {TIER_LABELS[status.tier] ?? status.tier}</p>
              {status.subscription && (
                <Badge variant={status.subscription.status === "active" ? "success" : "secondary"}>
                  {STATUS_LABELS[status.subscription.status] ?? status.subscription.status}
                </Badge>
              )}
            </div>
            <p className="text-[var(--text-muted)] text-sm">
              {status.subscription?.currentPeriodEnd
                ? `Periode berakhir: ${formatDate(status.subscription.currentPeriodEnd)}`
                : "Paket gratis selamanya"}
            </p>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <div>
            <p className="font-semibold">{formatNumber(status.limits.social_accounts ?? 0)}</p>
            <p className="text-[var(--text-muted)] text-xs">akun sosmed</p>
          </div>
          <div>
            <p className="font-semibold">{formatNumber(status.limits.scheduled_posts ?? 0)}</p>
            <p className="text-[var(--text-muted)] text-xs">post/bulan</p>
          </div>
          <div>
            <p className="font-semibold">{formatNumber(status.limits.team_members ?? 0)}</p>
            <p className="text-[var(--text-muted)] text-xs">anggota tim</p>
          </div>
        </div>
      </div>

      {/* Pilih plan */}
      <div>
        <h2 className="mb-3 font-semibold">Ubah Paket</h2>
        {!status.configured ? (
          <div className="rounded-[var(--radius-lg)] border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
            Sistem pembayaran belum dikonfigurasi. Hubungi administrator.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = plan.tier === status.tier;
              return (
                <div
                  key={plan.id}
                  className={`card p-5 ${isCurrent ? "border-2 border-[var(--accent-gold)]" : ""}`}
                >
                  <p className="font-semibold">{plan.name}</p>
                  <p className="mt-1 font-bold text-2xl">
                    {plan.priceIdr === 0 ? "Gratis" : formatCurrencyIdr(plan.priceIdr)}
                    {plan.priceIdr > 0 && (
                      <span className="font-normal text-[var(--text-muted)] text-xs">/bulan</span>
                    )}
                  </p>
                  <ul className="mt-4 space-y-1.5 text-[var(--text-secondary)] text-xs">
                    <li>{plan.maxSocialAccounts} akun sosmed</li>
                    <li>{formatNumber(plan.maxScheduledPostsPerMonth)} post/bulan</li>
                    <li>{plan.maxTeamMembers} anggota tim</li>
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    size="sm"
                    variant={isCurrent ? "outline" : "primary"}
                    disabled={isCurrent || checkout.isPending}
                    onClick={() => checkout.mutate(plan.id)}
                  >
                    {checkout.isPending && checkout.variables === plan.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isCurrent ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    {isCurrent ? "Paket Aktif" : "Pilih Paket"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Riwayat pembayaran */}
      <div>
        <h2 className="mb-3 font-semibold">Riwayat Pembayaran</h2>
        {payments.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">Belum ada transaksi.</p>
        ) : (
          <div className="card divide-y divide-[var(--border-light)] p-0">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{p.orderId}</p>
                  <p className="text-[var(--text-muted)] text-xs">{formatDate(p.createdAt)}</p>
                </div>
                {p.paymentLinkUrl && p.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => (window.location.href = p.paymentLinkUrl!)}
                  >
                    Bayar Sekarang
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Badge
                  variant={
                    p.status === "completed"
                      ? "success"
                      : p.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {STATUS_LABELS[p.status] ?? p.status}
                </Badge>
                <span className="font-semibold">{formatCurrencyIdr(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
