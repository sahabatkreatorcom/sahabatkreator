import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  HeartHandshake,
  Lightbulb,
  Rocket,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Tentang | Sahabat Kreator",
  description:
    "Sahabat Kreator adalah platform manajemen media sosial AI-powered untuk kreator dan bisnis Indonesia.",
  robots: {
    index: true,
    follow: true,
  },
};

const values = [
  {
    icon: Rocket,
    title: "Memberdayakan Kreator",
    desc: "Setiap kreator berhak memiliki alat yang powerful untuk mengembangkan bisnis mereka di era digital.",
  },
  {
    icon: Lightbulb,
    title: "AI yang Berguna",
    desc: "AI bukan gimmick — dipakai untuk rekomendasi strategi, analisis konten, dan saran yang benar-benar actionable.",
  },
  {
    icon: HeartHandshake,
    title: "Dibuat untuk Indonesia",
    desc: "Didesain khusus untuk kreator dan UMKM Indonesia dengan dukungan Bahasa Indonesia.",
  },
  {
    icon: ShieldCheck,
    title: "Keamanan & Kepercayaan",
    desc: "Enkripsi token, 2FA, dan penyimpanan aman di Cloudflare R2 adalah standar, bukan bonus.",
  },
];

const stats = [
  { value: "12+", label: "Platform Sosial Media" },
  { value: "8", label: "Platform Bisa Publish" },
  { value: "4", label: "Paket Langganan" },
  { value: "24/7", label: "Asisten AI Seb" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Tentang <span className="text-primary">Sahabat Kreator</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Kami percaya setiap kreator berhak memiliki alat yang powerful untuk
            mengembangkan bisnis mereka di era digital.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Misi Kami</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Sahabat Kreator hadir untuk memberdayakan kreator konten Indonesia dengan
                teknologi AI yang accessible dan mudah digunakan.
              </p>
              <p className="mt-4 text-muted-foreground">
                Kami memahami tantangan kreator dalam mengelola banyak platform sosial media
                secara simultan. Dari membuat konten, menjadwalkan posting, hingga menganalisis
                performa — semua bisa dilakukan di satu tempat.
              </p>
              <ul className="mt-8 space-y-4">
                {values.map((value) => (
                  <li key={value.title} className="flex gap-4">
                    <value.icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-semibold">{value.title}</h3>
                      <p className="text-sm text-muted-foreground">{value.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-6">
              {[
                {
                  title: "Jadwalkan & Publish",
                  desc: "Terbitkan konten ke 8 platform dari satu composer, lengkap dengan kalender konten.",
                },
                {
                  title: "Balas Komentar",
                  desc: "Inbox terpusat untuk komentar Instagram, TikTok, Facebook, YouTube, dan Threads.",
                },
                {
                  title: "Pantau Performa",
                  desc: "Analitik followers, impressions, reach, tracking kompetitor, dan social listening.",
                },
                {
                  title: "Dapat Rekomendasi AI",
                  desc: "Asisten Seb memberi laporan strategi, analisis media, dan saran konten.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-4">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-primary py-20 text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold">{stat.value}</div>
                <div className="mt-2 text-primary-foreground/80">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Mari Bekerja Sama
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Ingin berkolaborasi atau sekadar bertanya? Kami siap membantu.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/kontak">
              <Button size="md" className="h-12 px-8 text-base">
                Hubungi Kami
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="secondary" size="md" className="h-12 px-8 text-base">
                Coba Gratis
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
