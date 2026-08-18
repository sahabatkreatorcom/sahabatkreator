import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Minus } from "lucide-react";

export const metadata: Metadata = {
  title: "Harga | Sahabat Kreator",
  description:
    "Pilih paket Sahabat Kreator: Free, Pro, Business, atau Enterprise. Semua paket mendukung publish multi-platform, analitik, dan bantuan AI.",
  robots: {
    index: true,
    follow: true,
  },
};

interface PlanFeature {
  label: string;
  values: Record<string, string>;
}

const plans = [
  {
    id: "FREE",
    name: "Free",
    tagline: "Untuk kreator yang baru memulai",
    price: "Rp 0",
    cta: "Mulai Gratis",
    highlight: false,
  },
  {
    id: "PRO",
    name: "Pro",
    tagline: "Untuk kreator profesional",
    price: "Rp 99.000",
    cta: "Mulai 14 Hari Gratis",
    highlight: true,
  },
  {
    id: "BUSINESS",
    name: "Business",
    tagline: "Untuk tim & agensi",
    price: "Rp 249.000",
    cta: "Mulai 14 Hari Gratis",
    highlight: false,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Untuk organisasi besar",
    price: "Custom",
    cta: "Hubungi Sales",
    highlight: false,
  },
];

const featureRows: PlanFeature[] = [
  { label: "Akun sosial media", values: { FREE: "3", PRO: "10", BUSINESS: "25", ENTERPRISE: "Unlimited" } },
  { label: "Anggota tim", values: { FREE: "2", PRO: "5", BUSINESS: "15", ENTERPRISE: "Unlimited" } },
  { label: "Post terjadwal / bulan", values: { FREE: "30", PRO: "150", BUSINESS: "500", ENTERPRISE: "Unlimited" } },
  { label: "Generasi AI / bulan", values: { FREE: "10", PRO: "100", BUSINESS: "500", ENTERPRISE: "Unlimited" } },
  { label: "Tracking kompetitor", values: { FREE: "—", PRO: "3", BUSINESS: "10", ENTERPRISE: "Unlimited" } },
  { label: "Ekspor analitik", values: { FREE: "—", PRO: "✓", BUSINESS: "✓", ENTERPRISE: "✓" } },
  { label: "Custom branding", values: { FREE: "—", PRO: "—", BUSINESS: "✓", ENTERPRISE: "✓" } },
  { label: "Priority support", values: { FREE: "—", PRO: "—", BUSINESS: "—", ENTERPRISE: "✓" } },
];

function FeatureValue({ value }: { value: string }) {
  if (value === "—") {
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />;
  }
  if (value === "✓") {
    return <Check className="mx-auto h-4 w-4 text-primary" />;
  }
  return <span className="text-sm">{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Harga yang <span className="text-primary">Transparan</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Pilih paket yang sesuai kebutuhan Anda. Semua paket menyertakan publish
            multi-platform, inbox komentar, dan analitik.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="pb-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-lg border bg-card p-6 ${
                  plan.highlight ? "border-primary shadow-lg" : "border-border"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                    Populer
                  </div>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.id !== "ENTERPRISE" && (
                    <span className="text-sm text-muted-foreground">/bulan</span>
                  )}
                </div>
                <Link href="/register" className="mt-6 block">
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "primary" : "secondary"}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
            Bandingkan Paket
          </h2>
          <p className="mt-2 text-center text-muted-foreground">
            Batas pemakaian per akun organisasi, berdasarkan konfigurasi paket di platform.
          </p>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-center">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 text-left text-sm font-semibold">Fitur</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="px-4 py-3 text-sm font-semibold">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/60">
                    <td className="py-3 text-left text-sm">{row.label}</td>
                    {plans.map((plan) => (
                      <td key={plan.id} className="px-4 py-3">
                        <FeatureValue value={row.values[plan.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Pertanyaan Umum
          </h2>
          <div className="mt-10 space-y-4">
            {[
              {
                q: "Apakah ada masa percobaan gratis?",
                a: "Ya, semua paket berbayar menyertakan 14 hari gratis tanpa memerlukan kartu kredit. Anda bisa membatalkan kapan saja.",
              },
              {
                q: "Platform apa saja yang didukung?",
                a: "Kami mendukung 12 platform: Instagram, Instagram Page, Facebook, TikTok, YouTube, Pinterest, Google Business, LinkedIn, Bluesky, Threads, dan manual. Delapan di antaranya sudah bisa publish langsung.",
              },
              {
                q: "Bagaimana cara upgrade atau downgrade?",
                a: "Anda bisa mengubah paket kapan saja dari halaman Billing di dashboard. Perubahan akan berlaku sesuai cycle billing.",
              },
              {
                q: "Apakah data saya aman?",
                a: "Ya. Token sosial dienkripsi AES-256-GCM, mendukung 2FA (TOTP + email OTP), dan media disimpan di Cloudflare R2. Kami tidak menjual data Anda.",
              },
              {
                q: "Bagaimana jika saya butuh lebih dari paket Business?",
                a: "Pilih Enterprise untuk batas unlimited dan priority support. Hubungi kami untuk penawaran khusus.",
              },
            ].map((item) => (
              <div key={item.q} className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
