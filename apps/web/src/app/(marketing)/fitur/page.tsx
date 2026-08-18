import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarClock,
  Ear,
  Eye,
  Film,
  Globe,
  Images,
  Lightbulb,
  MessageSquare,
  PanelLeft,
  ShieldCheck,
  Tags,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Fitur | Sahabat Kreator",
  description:
    "Fitur Sahabat Kreator: publish multi-platform, kalender, inbox komentar, analitik, competitor tracking, social listening, dan asisten AI Seb.",
  robots: {
    index: true,
    follow: true,
  },
};

const featureGroups = [
  {
    title: "Publish & Jadwalkan",
    desc: "Kelola siklus konten dari ide hingga terbit.",
    items: [
      {
        icon: Film,
        title: "Publish Multi-Platform",
        desc: "Terbitkan satu konten ke Instagram (Feed/Reel/Story), Facebook Page, TikTok, YouTube, Pinterest, LinkedIn, dan Threads. Satu post per akun, dikelompokkan dalam satu group konten.",
      },
      {
        icon: CalendarClock,
        title: "Kalender Konten",
        desc: "Lihat jadwal konten per hari dalam grid bulanan. Klik tanggal untuk langsung membuat atau menerbitkan post.",
      },
      {
        icon: Images,
        title: "Pustaka Media & Stock",
        desc: "Upload media ke Cloudflare R2, atur folder, dan cari stok dari Pixabay, Pexels, dan Unsplash langsung dari composer.",
      },
    ],
  },
  {
    title: "Engage & Monitor",
    desc: "Balas audiens dan pahami performa akun.",
    items: [
      {
        icon: MessageSquare,
        title: "Inbox Komentar Terpusat",
        desc: "Kumpulkan komentar dari Instagram, Facebook, TikTok, YouTube, dan Threads dalam satu inbox. Balas langsung, tandai dibaca, atau sembunyikan.",
      },
      {
        icon: Zap,
        title: "Automasi Inbox",
        desc: "Simpan balasan cepat dan buat aturan auto-reply berbasis kata kunci untuk membalas komentar otomatis.",
      },
      {
        icon: BarChart3,
        title: "Analitik Real-Time",
        desc: "Pantau followers, impressions, dan reach per platform. Lihat tren kenaikan dan bandingkan performa.",
      },
      {
        icon: Ear,
        title: "Competitor & Social Listening",
        desc: "Lacak follower growth dan engagement kompetitor, serta monitor keyword dan sentimen di media sosial.",
      },
    ],
  },
  {
    title: "AI & Produktivitas",
    desc: "Dipercepat asisten AI dan alat konten.",
    items: [
      {
        icon: BrainCircuit,
        title: "Seb AI — Laporan & Rekomendasi",
        desc: "Generate laporan strategi 90 hari, skor performa, dan rekomendasi konten yang bisa di-track statusnya.",
      },
      {
        icon: PanelLeft,
        title: "Seb AI — Chat Konsultan",
        desc: "Tanya apa saja tentang akun Anda. Seb membaca konteks organisasi, posting, analitik, dan kompetitor.",
      },
      {
        icon: Globe,
        title: "Seb AI — Brand Knowledge & Scan Website",
        desc: "Simpan identitas brand dan scan website Anda untuk memperkaya saran konten yang konsisten dengan brand.",
      },
      {
        icon: Eye,
        title: "Seb AI — Analisis Media",
        desc: "Analisis visual gambar dan video (via frame hasil worker) untuk saran caption, visual hooks, dan skor best practice.",
      },
      {
        icon: Lightbulb,
        title: "Content Tools",
        desc: "Pilar konten, template caption, dan koleksi hashtag untuk produksi konten yang konsisten dan cepat.",
      },
    ],
  },
  {
    title: "Kolaborasi & Keamanan",
    desc: "Bekerja bersama tim tanpa khawatir.",
    items: [
      {
        icon: Users,
        title: "Kolaborasi Tim",
        desc: "Undang member dengan peran Owner, Admin, Member, atau Viewer. Pantau jejak aktivitas seluruh tim.",
      },
      {
        icon: ShieldCheck,
        title: "Keamanan Berlapis",
        desc: "2FA (TOTP + email OTP), token sosial terenkripsi AES-256-GCM, dan penyimpanan media di Cloudflare R2.",
      },
      {
        icon: Tags,
        title: "Kredensial Platform Terpusat",
        desc: "Kelola kredensial OAuth secara global untuk semua akun tim dalam satu tempat.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Fitur <span className="text-primary">Sahabat Kreator</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Dari publish multi-platform, inbox komentar, analitik, hingga asisten AI —
            semua dalam satu dashboard untuk kreator Indonesia.
          </p>
        </div>
      </section>

      {featureGroups.map((group) => (
        <section key={group.title} className="py-16 odd:bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">{group.title}</h2>
              <p className="mt-2 text-lg text-muted-foreground">{group.desc}</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
                >
                  <item.icon className="mb-4 h-7 w-7 text-primary" />
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Coba Semua Fitur Secara Gratis
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
            Buat akun gratis dan rasakan kemudahan mengelola sosial media dalam satu dashboard.
          </p>
          <div className="mt-8">
            <Link href="/register">
              <Button
                variant="secondary"
                size="md"
                className="h-12 bg-white px-8 text-base text-primary hover:bg-white/90"
              >
                Mulai Gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
