import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Film,
  MessageSquare,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Sahabat Kreator | Platform Manajemen Media Sosial AI-Powered",
  applicationName: "Sahabat Kreator",
  description:
    "Sahabat Kreator adalah platform manajemen media sosial AI-powered untuk kreator dan bisnis Indonesia: jadwalkan konten, pantau analitik, balas komentar, dan tingkatkan engagement dalam satu dashboard.",
  openGraph: {
    title: "Sahabat Kreator | Platform Manajemen Media Sosial",
    description:
      "Jadwalkan konten ke Instagram, TikTok, YouTube, Facebook, LinkedIn, dan lainnya, pantau analitik, dan dapatkan rekomendasi asisten AI dalam satu dashboard.",
    url: "https://sahabatkreator.com",
    siteName: "Sahabat Kreator",
    type: "website",
    locale: "id_ID",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const heroStats = [
  { value: "12+", label: "Platform Didukung" },
  { value: "8", label: "Platform Bisa Publish" },
  { value: "1", label: "Dashboard Terpadu" },
  { value: "AI", label: "Asisten Seb" },
];

const features = [
  {
    icon: CalendarClock,
    title: "Jadwal & Publish Multi-Platform",
    desc: "Buat satu konten, terbitkan ke Instagram, TikTok, Facebook, YouTube, Pinterest, LinkedIn, dan Threads. Jadwalkan otomatis dengan kalender.",
  },
  {
    icon: Film,
    title: "Pustaka Media & Stock",
    desc: "Kelola media di Cloudflare R2, upload batch, dan cari stok dari Pixabay, Pexels, dan Unsplash tanpa keluar dashboard.",
  },
  {
    icon: MessageSquare,
    title: "Inbox Komentar Terpusat",
    desc: "Kumpulkan dan balas komentar dari banyak akun dalam satu inbox, plus auto-reply otomatis berdasarkan kata kunci.",
  },
  {
    icon: BarChart3,
    title: "Analitik Real-Time",
    desc: "Pantau follower, impressions, dan reach per platform. Lihat tren dan bandingkan performa konten Anda.",
  },
  {
    icon: TrendingUp,
    title: "Competitor & Social Listening",
    desc: "Lacak pertumbuhan follower dan engagement kompetitor, pantau sentimen keyword, dan temukan peluang konten.",
  },
  {
    icon: Sparkles,
    title: "Seb AI Assistant",
    desc: "Laporan strategi bulanan, rekomendasi konten, chat konsultasi, scan website brand, dan analisis visual media Anda.",
  },
  {
    icon: Users,
    title: "Kolaborasi Tim",
    desc: "Undang member, atur role OWNER/ADMIN/MEMBER/VIEWER, dan kelola approval konten bersama tim Anda.",
  },
  {
    icon: Zap,
    title: "Content Tools",
    desc: "Pilar konten, template caption, dan koleksi hashtag untuk mempercepat produksi konten yang konsisten.",
  },
];

const steps = [
  {
    number: "01",
    title: "Hubungkan Akun",
    desc: "Login ke platform, hubungkan akun Instagram, TikTok, Facebook, YouTube, dan lainnya lewat OAuth sekali klik.",
  },
  {
    number: "02",
    title: "Buat & Jadwalkan",
    desc: "Compose konten dengan media dari pustaka atau stok, pilih akun tujuan, dan jadwalkan di kalender.",
  },
  {
    number: "03",
    title: "Pantau & Optimasi",
    desc: "Balas komentar dari inbox, pantau analitik, dan biarkan Seb memberi rekomendasi strategi berikutnya.",
  },
];

const testimonials = [
  {
    quote:
      "Sekarang saya bisa mengelola 6 akun klien dari satu dashboard. Fitur Seb AI bikin laporan bulanan jadi cepat banget.",
    author: "Rina Wahyuni",
    role: "Social Media Manager, Jakarta",
  },
  {
    quote:
      "Inbox komentar terpusat menyelamatkan tim kami. Balas komentar IG dan TikTok tanpa pindah-pindah aplikasi.",
    author: "Andi Firmansyah",
    role: "Owner Agency, Surabaya",
  },
  {
    quote:
      "Jadwal multi-platform + media library bikin workflow konten jadi jauh lebih rapi. Recommended untuk kreator serius.",
    author: "Sinta Dewi",
    role: "Content Creator, Bandung",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 py-20 text-center md:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Platform Manajemen Media Sosial AI-Powered
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              Sahabat Kreator: Kelola Semua Akun Sosial Media dalam{" "}
              <span className="text-primary">Satu Dashboard</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Platform manajemen media sosial untuk kreator Indonesia. Jadwalkan konten,
              balas komentar, pantau analitik, dan dapatkan rekomendasi dari asisten AI —
              untuk Instagram, TikTok, YouTube, Facebook, LinkedIn, dan lainnya.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="md" className="h-12 px-8 text-base">
                  Mulai Gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/fitur">
                <Button variant="secondary" size="md" className="h-12 px-8 text-base">
                  Lihat Fitur
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Tanpa kartu kredit · Batalkan kapan saja
            </p>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 md:grid-cols-4">
            {heroStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-primary">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Semua yang Anda Butuhkan
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Fitur lengkap untuk mengelola konten sosial media Anda secara efisien
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <feature.icon className="mb-4 h-8 w-8 text-primary" />
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link href="/fitur">
              <Button variant="secondary">
                Lihat Semua Fitur
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Mulai dalam 3 Langkah
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Tidak perlu instalasi. Langsung berproduksi.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="relative rounded-lg border border-border bg-card p-6">
                <div className="text-sm font-bold text-primary">{step.number}</div>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Dipercaya Kreator & Bisnis Indonesia
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <div key={testimonial.author} className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">"{testimonial.quote}"</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {testimonial.author[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{testimonial.author}</div>
                    <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Mulai Gratis, Upgrade Kapan Saja
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Paket Free sudah bisa hubungkan 3 akun dan jadwalkan konten. Lihat semua pilihan
            paket sesuai kebutuhan Anda.
          </p>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Free", "Pro", "Business", "Enterprise"].map((plan) => (
              <li key={plan} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {plan}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Link href="/harga">
              <Button size="md" className="h-12 px-8 text-base">
                Lihat Harga
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Siap Meningkatkan Produktivitas Konten Anda?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Bergabung dengan kreator dan tim yang sudah mengelola sosial media lebih rapi
            bersama Sahabat Kreator.
          </p>
          <div className="mt-8">
            <Link href="/register">
              <Button
                variant="secondary"
                size="md"
                className="h-12 bg-white px-8 text-base text-primary hover:bg-white/90"
              >
                Coba Gratis Sekarang
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
