import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import {
  ChevronDown,
  MessageSquare,
  CalendarClock,
  BarChart3,
  Zap,
  ShieldCheck,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ - Pertanyaan Umum | Sahabat Kreator",
  description: "Temukan jawaban untuk pertanyaan umum tentang Sahabat Kreator, fitur, harga, dan cara kerja platform.",
};

const faqs = [
  {
    question: "Apa itu Sahabat Kreator?",
    answer: "Sahabat Kreator adalah platform manajemen media sosial AI-powered yang membantu kreator dan bisnis mengelola konten di berbagai platform sosial media dalam satu dashboard.",
  },
  {
    question: "Platform apa saja yang didukung?",
    answer: "Kami mendukung 12 platform: Instagram, Instagram Page, TikTok, Facebook, Meta, YouTube, Pinterest, Google Business, LinkedIn, Bluesky, Threads, dan Manual posting.",
  },
  {
    question: "Apakah ada masa percobaan gratis?",
    answer: "Ya! Semua paket termasuk 14 hari gratis tanpa memerlukan kartu kredit. Anda bisa mencoba semua fitur premium selama masa percobaan.",
  },
  {
    question: "Bagaimana cara menggunakan AI Content Generator?",
    answer: "AI Content Generator tersedia di paket Pro dan Business. Cukup masukkan topik atau ide, dan AI akan membuatkan caption, hashtag, dan saran konten untuk Anda.",
  },
  {
    question: "Apakah data saya aman?",
    answer: "Keamanan adalah prioritas kami. Kami menggunakan enkripsi end-to-end, 2FA, dan storage yang aman di Cloudflare R2. Data Anda tidak akan dibagikan ke pihak ketiga.",
  },
  {
    question: "Bagaimana cara mengaktifkan 2FA?",
    answer: "Anda bisa mengaktifkan 2FA dari Settings > Security. Kami mendukung TOTP (Google Authenticator) dan email OTP.",
  },
  {
    question: "Bisa menggunakan untuk tim?",
    answer: "Ya! Paket Business mendukung kolaborasi tim dengan fitur invite member, role management, dan approval workflow untuk konten.",
  },
  {
    question: "Bagaimana cara membatalkan subscription?",
    answer: "Anda bisa membatalkan subscription kapan saja dari halaman Billing. Akses akan tetap aktif hingga akhir cycle billing saat ini.",
  },
  {
    question: "Apakah ada dukungan untuk Bahasa Indonesia?",
    answer: "Tentu! Sahabat Kreator didesain khusus untuk kreator Indonesia dengan UI dan support dalam Bahasa Indonesia.",
  },
  {
    question: "Bagaimana cara menghubungi support?",
    answer: "Anda bisa menghubungi kami melalui email di support@sahabatkreator.id atau live chat yang tersedia di dashboard.",
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} />
            <span className="text-lg font-semibold">Sahabat Kreator</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link href="/fitur" className="text-sm text-muted-foreground hover:text-foreground">Fitur</Link>
            <Link href="/harga" className="text-sm text-muted-foreground hover:text-foreground">Harga</Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">Blog</Link>
            <Link href="/tentang" className="text-sm text-muted-foreground hover:text-foreground">Tentang</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" size="sm">Masuk</Button></Link>
            <Link href="/register"><Button size="sm">Coba Gratis</Button></Link>
          </div>
        </div>
      </header>

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
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
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

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Sahabat Kreator. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex items-start gap-4">
        <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h3 className="font-semibold">{question}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{answer}</p>
        </div>
      </div>
    </div>
  );
}
