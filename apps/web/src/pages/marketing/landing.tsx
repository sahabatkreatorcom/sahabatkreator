import type { FeatureKey } from "@sahabatkreator/db";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Check,
  FileText,
  Image,
  MessageCircle,
  Plug,
  Radar,
  Share2,
  Sparkles,
  Users,
  Video,
  Workflow,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { FEATURE_CATALOG, GLOBAL_FEATURES } from "@/lib/feature-catalog";
import { PLATFORMS } from "@/lib/platforms";
import { useSeo } from "@/lib/seo";
import { queryKeys } from "../../lib/query-keys";
import { ctaFor, type Plan, priceLabel, priceSuffix, TIER_LABEL } from "./pricing-shared";

/**
 * Fitur yang dipromosikan sebagai kartu utama di landing.
 *
 * Key HARUS ada di katalog fitur (FeatureKey) atau GLOBAL_FEATURES — `satisfies`
 * membuat key asing jadi error `tsc`, jadi landing tidak bisa menyebut fitur
 * yang tidak ada di aplikasi (kebalikan dari grid hard-code yang dulu drift:
 * automation, laporan, dan Public API sudah ada tapi tidak pernah dipromosikan).
 */
const CARD_KEYS = [
  "multi_platform",
  "scheduling",
  "ai_caption",
  "video_render",
  "analytics",
  "engagement_inbox",
  "automation",
  "listening",
  "reports_export",
  "team",
  "media_library",
  "api_access",
] as const satisfies readonly (FeatureKey | "video_render" | "holiday_ideas" | "qris_payment")[];

type CardKey = (typeof CARD_KEYS)[number];

const CARD_CONTENT: Record<CardKey, { icon: LucideIcon; title: string; description: string }> = {
  multi_platform: {
    icon: Share2,
    title: "Publish Multi-Platform",
    description:
      "Hubungkan Instagram, Facebook, Threads, TikTok, YouTube, Pinterest, LinkedIn, Bluesky, dan Google Business. Satu komposer untuk semuanya.",
  },
  scheduling: {
    icon: CalendarDays,
    title: "Kalender & Penjadwalan",
    description:
      "Rencanakan konten dengan kalender visual. Jadwalkan posting sekali, tayang otomatis — lengkap dengan antrian dan retry otomatis.",
  },
  ai_caption: {
    icon: Sparkles,
    title: "AI Caption, Hashtag & Coach",
    description:
      "Generate dan rewrite caption plus hashtag dengan AI. Coach AI mingguan menganalisa performa dan memberi saran strategi konten.",
  },
  video_render: {
    icon: Video,
    title: "Auto-clip & Render Video",
    description:
      "Ubah video panjang jadi klip pendek siap posting — momen terbaik dipotong otomatis, dibatasi kredit render bulanan.",
  },
  analytics: {
    icon: BarChart3,
    title: "Analitik Terpadu",
    description:
      "Reach, engagement, followers, dan waktu posting optimal lintas akun dalam satu dashboard — dibandingkan dengan periode sebelumnya.",
  },
  engagement_inbox: {
    icon: MessageCircle,
    title: "Inbox Engagement",
    description:
      "Balas komentar, mention, DM, dan review dari satu inbox. Tidak ada interaksi yang terlewat.",
  },
  automation: {
    icon: Workflow,
    title: "Automation Rules",
    description:
      "Auto-reply dan auto-like berdasarkan trigger yang Anda tentukan — interaksi masuk tertangani sesuai aturan Anda.",
  },
  listening: {
    icon: Radar,
    title: "Social Listening & Kompetitor",
    description:
      "Pantau kata kunci, sebutan brand, dan pergerakan akun kompetitor. Ketahui tren sebelum melewatinya.",
  },
  reports_export: {
    icon: FileText,
    title: "Laporan CSV & PDF",
    description:
      "Export laporan performa ke CSV atau PDF, plus jadwal email laporan otomatis untuk klien atau tim.",
  },
  team: {
    icon: Users,
    title: "Kolaborasi Tim",
    description:
      "Undang anggota tim dengan role dan permission yang jelas. Setiap perubahan konten tercatat.",
  },
  media_library: {
    icon: Image,
    title: "Pustaka Media",
    description:
      "Simpan semua aset visual di satu tempat dengan folder dan alt text. Upload sekali, pakai di semua postingan.",
  },
  api_access: {
    icon: Plug,
    title: "Public API, Webhook & MCP",
    description:
      "Buat dan jadwalkan konten lewat API, terima notifikasi event lewat webhook, atau hubungkan AI assistant Anda via MCP.",
  },
};

const FEATURES = CARD_KEYS.map((key) => ({ key, ...CARD_CONTENT[key] }));

/**
 * Sisa fitur katalog + global yang tidak jadi kartu utama — DITURUNKAN
 * otomatis (bukan daftar manual) supaya fitur baru di katalog langsung
 * muncul di landing tanpa edit tambahan, dan fitur yang dihapus katalog
 * otomatis hilang dari landing juga.
 */
const CARD_KEY_SET = new Set<string>(CARD_KEYS);
const EXTRA_FEATURES: string[] = [
  ...FEATURE_CATALOG.filter((f) => !CARD_KEY_SET.has(f.key)).map((f) => f.label),
  ...GLOBAL_FEATURES.filter((g) => !CARD_KEY_SET.has(g.key)).map((g) => g.label),
  // Bukan fitur tergerbang, tapi janji keamanan platform tetap disebut.
  "Keamanan 2FA & audit log",
];

const PLATFORM_LIST = Object.entries(PLATFORMS).filter(([key]) => key !== "manual");

// Hitung platform UNIK — varian koneksi ("Instagram (Akun Bisnis)",
// "LinkedIn (Halaman Company)") tetap dihitung satu platform yang sama,
// jadi klaim jumlah di hero tidak bisa lebih dari platform yang benar-benar ada.
const PLATFORM_COUNT = new Set(
  PLATFORM_LIST.map(([, config]) => config.label.replace(/\s*\(.*\)\s*$/, "")),
).size;

export function LandingPage() {
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: queryKeys.plans,
    queryFn: () => api.get<{ plans: Plan[] }>("/billing/plans"),
  });

  // Satu kartu per tier (plan bulanan — default endpoint interval=1).
  const tierPlans = ["free", "pro", "business", "enterprise"]
    .map((tier) => (plansData?.plans ?? []).find((p) => p.tier === tier))
    .filter((p): p is Plan => Boolean(p));

  useSeo({
    title: "Sahabat Kreator — Kelola Semua Konten Social Media di Satu Tempat",
    description:
      "Jadwalkan posting, pantau analitik, dan kelola semua akun social media Anda dari satu dashboard. Gratis untuk memulai.",
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Sahabat Kreator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "IDR",
        description: "Paket gratis untuk memulai",
      },
    },
  });

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
          <Badge variant="primary" className="mx-auto mb-6">
            <Sparkles className="h-3 w-3" />
            Dibuat khusus untuk kreator Indonesia
          </Badge>
          <h1 className="mx-auto max-w-3xl font-bold text-4xl leading-tight tracking-tight md:text-6xl">
            Semua konten social media Anda, <span className="text-gradient">dalam satu tempat</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[var(--text-secondary)] text-lg">
            Sahabat Kreator membantu Anda menjadwalkan posting, memantau analitik, dan membalas
            audiens — dari Instagram sampai TikTok, tanpa berpindah aplikasi.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register">
              <Button size="lg" className="min-w-[200px]">
                <Zap className="h-4 w-4" />
                Mulai Gratis Sekarang
              </Button>
            </Link>
            <Link to="/harga">
              <Button size="lg" variant="outline" className="min-w-[200px]">
                Lihat Harga
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-[var(--text-muted)] text-sm">
            Tanpa kartu kredit. Paket gratis selamanya.
          </p>

          {/* Platform badges */}
          <div className="mt-12">
            <p className="mb-4 font-medium text-[var(--text-muted)] text-sm">
              Mendukung {PLATFORM_COUNT} platform sosial media
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {PLATFORM_LIST.map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <div
                    key={key}
                    title={config.label}
                    className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-transform hover:scale-110"
                  >
                    <Icon className="h-5 w-5" style={{ color: config.color }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Fitur */}
      <section
        id="fitur"
        className="border-[var(--border-light)] border-t bg-[var(--bg-secondary)]"
      >
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="font-bold text-3xl md:text-4xl">Fitur lengkap untuk kreator & bisnis</h2>
            <p className="mt-3 text-[var(--text-secondary)]">
              Semua yang Anda butuhkan untuk tumbuh di social media
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card card-hover p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-[var(--text-secondary)] text-sm">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Sisa fitur (diturunkan otomatis dari katalog — lihat EXTRA_FEATURES). */}
          {EXTRA_FEATURES.length > 0 && (
            <div className="mt-10 rounded-[var(--radius-lg)] border border-[var(--border)] p-6">
              <p className="text-center font-medium text-[var(--text-secondary)] text-sm">
                Dan masih ada lagi:
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {EXTRA_FEATURES.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3.5 py-1.5 text-[var(--text-secondary)] text-sm"
                  >
                    <Check className="h-3.5 w-3.5 text-[var(--accent-gold)]" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Harga mini */}
      <section id="harga" className="border-[var(--border-light)] border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="font-bold text-3xl md:text-4xl">Harga transparan, mulai Rp0</h2>
            <p className="mt-3 text-[var(--text-secondary)]">
              Gratis selamanya untuk memulai. Upgrade kapan saja saat Anda tumbuh.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plansLoading || tierPlans.length === 0
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card animate-pulse p-6">
                    <div className="h-4 w-20 rounded bg-[var(--bg-tertiary)]" />
                    <div className="mt-4 h-8 w-32 rounded bg-[var(--bg-tertiary)]" />
                    <div className="mt-6 h-9 w-full rounded bg-[var(--bg-tertiary)]" />
                  </div>
                ))
              : tierPlans.map((plan) => {
                  const link = ctaFor(plan.tier);
                  const highlight = plan.tier === "pro";
                  return (
                    <div
                      key={plan.tier}
                      className={`card p-6 text-center ${
                        highlight ? "border-2 border-[var(--accent-gold)]" : ""
                      }`}
                    >
                      <div className="font-semibold text-lg">{TIER_LABEL[plan.tier]}</div>
                      <div className="mt-3 font-bold text-3xl">{priceLabel(plan)}</div>
                      {priceSuffix(plan, 1) && (
                        <div className="text-[var(--text-muted)] text-xs">
                          {priceSuffix(plan, 1)}
                        </div>
                      )}
                      <p className="mt-3 text-[var(--text-secondary)] text-sm">
                        {plan.description}
                      </p>
                      <Link to={link.to} className="mt-5 block">
                        <Button className="w-full" variant={highlight ? "primary" : "outline"}>
                          {link.label}
                        </Button>
                      </Link>
                    </div>
                  );
                })}
          </div>
          <p className="mt-6 text-center text-[var(--text-muted)] text-sm">
            <Link to="/harga" className="text-[var(--accent-gold)] underline">
              Bandingkan semua fitur paket →
            </Link>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-[var(--border-light)] border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="font-bold text-3xl md:text-4xl">Siap naik level konten Anda?</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--text-secondary)]">
            Bergabung dengan ribuan kreator yang sudah menghemat waktu dengan Sahabat Kreator.
          </p>
          <Link to="/register" className="mt-8 inline-block">
            <Button size="lg">
              Daftar Gratis
              <Check className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
