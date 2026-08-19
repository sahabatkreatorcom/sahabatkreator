import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronDown, MessageSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ - Pertanyaan Umum | Sahabat Kreator",
  description:
    "Temukan jawaban untuk pertanyaan umum tentang Sahabat Kreator: fitur, harga, keamanan, platform didukung, dan cara kerja.",
};

const faqs = [
  {
    question: "Apa itu Sahabat Kreator?",
    answer:
      "Sahabat Kreator adalah platform manajemen media sosial AI-powered untuk kreator dan bisnis Indonesia. Anda bisa menjadwalkan konten, balas komentar, pantau analitik, dan dapatkan rekomendasi AI dalam satu dashboard.",
  },
  {
    question: "Platform apa saja yang didukung?",
    answer:
      "Kami mendukung 12 platform: Instagram, Instagram Page, Facebook, TikTok, YouTube, Pinterest, Google Business, LinkedIn, Bluesky, Threads, dan posting manual. Delapan di antaranya sudah bisa publish langsung: Instagram, Facebook, TikTok, YouTube, Pinterest, LinkedIn, dan Threads.",
  },
  {
    question: "Apakah ada masa percobaan gratis?",
    answer:
      "Ya! Semua paket berbayar termasuk 14 hari gratis tanpa memerlukan kartu kredit. Paket Free tersedia permanen untuk mulai mencoba.",
  },
  {
    question: "Apa itu Seb AI?",
    answer:
      "Seb adalah asisten AI bawaan. Seb bisa membuat laporan strategi 90 hari, memberi rekomendasi konten, menjawab pertanyaan tentang akun Anda lewat chat, menganalisis media (gambar/video), dan membaca website brand Anda.",
  },
  {
    question: "Bagaimana cara connect akun sosial media?",
    answer:
      "Masuk ke dashboard, buka Settings > Connections, lalu pilih platform. Anda akan diarahkan ke OAuth resmi masing-masing platform. Token disimpan terenkripsi.",
  },
  {
    question: "Apakah data saya aman?",
    answer:
      "Keamanan adalah prioritas kami: token sosial dienkripsi AES-256-GCM, dukungan 2FA (TOTP dan email OTP), dan media disimpan di Cloudflare R2. Data Anda tidak dijual ke pihak ketiga.",
  },
  {
    question: "Bisa digunakan untuk tim?",
    answer:
      "Ya! Paket Pro ke atas mendukung anggota tim. Paket Business mendukung hingga 15 member dengan peran Owner, Admin, Member, dan Viewer, plus jejak aktivitas tim.",
  },
  {
    question: "Bagaimana cara membatalkan subscription?",
    answer:
      "Anda bisa membatalkan subscription kapan saja dari halaman Billing di dashboard. Akses tetap aktif hingga akhir cycle billing saat ini.",
  },
  {
    question: "Apakah ada dukungan Bahasa Indonesia?",
    answer:
      "Tentu! Sahabat Kreator didesain khusus untuk kreator Indonesia dengan UI dan dukungan dalam Bahasa Indonesia.",
  },
  {
    question: "Bagaimana cara menghubungi support?",
    answer:
      "Anda bisa menghubungi kami lewat halaman Kontak, email ke support@sahabatkreator.com, atau lihat FAQ ini untuk jawaban cepat.",
  },
];

export default function FAQPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Pertanyaan yang Sering <span className="text-primary">Ditanyakan</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Temukan jawaban untuk pertanyaan umum tentang Sahabat Kreator
          </p>
        </div>
      </section>

      {/* FAQ List */}
      <section className="pb-20">
        <div className="container mx-auto max-w-3xl px-4">
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-start gap-4">
                  <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold">{faq.question}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Contact CTA */}
          <div className="mt-16 rounded-lg bg-muted p-8 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-primary" />
            <h2 className="mt-4 text-2xl font-semibold">Masih punya pertanyaan?</h2>
            <p className="mt-2 text-muted-foreground">Tim support kami siap membantu Anda</p>
            <Link href="/kontak" className="mt-6 inline-block">
              <Button>Hubungi Kami</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
