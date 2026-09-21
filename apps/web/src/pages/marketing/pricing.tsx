// Halaman Pricing — fetch plan dari API billing (data riil, bukan mock)
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatCurrencyIdr, formatNumber } from "@/lib/format";
import { useSeo } from "@/lib/seo";

type Plan = {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  priceIdr: number;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  aiCreditsPerMonth: number;
  features: string[] | null;
};

const HIGHLIGHT_TIER = "pro";

function PlanCard({ plan, highlight }: { plan: Plan; highlight: boolean }) {
  return (
    <div
      className={`card relative flex flex-col p-6 ${
        highlight ? "border-2 border-[var(--accent-gold)] shadow-lg" : ""
      }`}
    >
      {highlight && (
        <Badge variant="primary" className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Sparkles className="h-3 w-3" />
          Paling Populer
        </Badge>
      )}
      <h3 className="font-semibold text-lg">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-[var(--text-secondary)] text-sm">{plan.description}</p>
      <div className="mt-4">
        <span className="font-bold text-3xl">
          {plan.priceIdr === 0 ? "Gratis" : formatCurrencyIdr(plan.priceIdr)}
        </span>
        {plan.priceIdr > 0 && <span className="text-[var(--text-muted)] text-sm"> /bulan</span>}
      </div>
      <ul className="mt-6 flex-1 space-y-3 text-sm">
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
          {plan.maxSocialAccounts >= 9999
            ? "Akun social media tanpa batas"
            : `${plan.maxSocialAccounts} akun social media`}
        </li>
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
          {plan.maxScheduledPostsPerMonth >= 9999
            ? "Jadwal posting tanpa batas"
            : `${formatNumber(plan.maxScheduledPostsPerMonth)} posting terjadwal /bulan`}
        </li>
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
          {plan.maxTeamMembers >= 9999
            ? "Anggota tim tanpa batas"
            : `${plan.maxTeamMembers} anggota tim`}
        </li>
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
          {plan.maxMediaStorageMb >= 9999
            ? "Storage media tanpa batas"
            : `${formatNumber(plan.maxMediaStorageMb)} MB storage media`}
        </li>
        {plan.aiCreditsPerMonth > 0 && (
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
            {formatNumber(plan.aiCreditsPerMonth)} kredit AI /bulan
          </li>
        )}
        {(plan.features ?? []).map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
            {f}
          </li>
        ))}
      </ul>
      <Link to="/register" className="mt-6">
        <Button className="w-full" variant={highlight ? "primary" : "outline"}>
          {plan.priceIdr === 0 ? "Mulai Gratis" : `Pilih ${plan.name}`}
        </Button>
      </Link>
    </div>
  );
}

export function PricingPage() {
  useSeo({
    title: "Harga — Paket untuk Semua Kebutuhan",
    description:
      "Pilih paket Sahabat Kreator sesuai kebutuhan. Mulai gratis, upgrade kapan saja. Pembayaran QRIS dan transfer bank Indonesia.",
    path: "/harga",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Apakah ada paket gratis?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ya, paket Free bisa dipakai selamanya dengan 2 akun social media dan 15 posting terjadwal per bulan.",
          },
        },
        {
          "@type": "Question",
          name: "Metode pembayaran apa yang didukung?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Kami mendukung pembayaran QRIS dan transfer virtual account dari semua bank besar di Indonesia.",
          },
        },
      ],
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<{ plans: Plan[] }>("/billing/plans"),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <div className="mb-12 text-center">
        <h1 className="font-bold text-4xl md:text-5xl">
          Harga <span className="text-gradient">transparan</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)] text-lg">
          Mulai gratis dan upgrade saat Anda tumbuh. Semua paket berbayar termasuk semua fitur inti.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {(data?.plans ?? []).map((plan) => (
            <PlanCard key={plan.id} plan={plan} highlight={plan.tier === HIGHLIGHT_TIER} />
          ))}
        </div>
      )}

      <div className="mt-16 text-center text-[var(--text-muted)] text-sm">
        <p>
          Pembayaran via QRIS & virtual account. Butuh paket khusus?{" "}
          <Link to="/kontak" className="text-[var(--accent-gold)] underline">
            Hubungi kami
          </Link>
        </p>
      </div>
    </div>
  );
}
