import {
  BarChart3,
  CalendarDays,
  Check,
  Image,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLATFORMS } from "@/lib/platforms";
import { useSeo } from "@/lib/seo";

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Kalender & Penjadwalan",
    description:
      "Rencanakan konten dengan kalender visual. Jadwalkan posting sekali, tayang otomatis di semua platform.",
  },
  {
    icon: BarChart3,
    title: "Analitik Terpadu",
    description:
      "Pantau performa lintas platform dalam satu dashboard. Followers, engagement, reach — semua terdata.",
  },
  {
    icon: MessageCircle,
    title: "Inbox Engagement",
    description:
      "Balas komentar, mention, DM, dan review dari satu inbox. Tidak ada interaksi yang terlewat.",
  },
  {
    icon: Users,
    title: "Kolaborasi Tim",
    description:
      "Undang anggota tim dengan role dan permission yang jelas. Audit setiap perubahan konten.",
  },
  {
    icon: Image,
    title: "Pustaka Media",
    description:
      "Simpan semua aset visual di satu tempat. Upload sekali, pakai di semua postingan.",
  },
  {
    icon: ShieldCheck,
    title: "Keamanan Berlapis",
    description: "2FA, enkripsi token, dan audit log. Data akun sosmed Anda aman bersama kami.",
  },
];

const PLATFORM_LIST = Object.entries(PLATFORMS).filter(([key]) => key !== "manual");

export function LandingPage() {
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
              Mendukung 10+ platform
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
