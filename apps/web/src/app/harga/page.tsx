import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { CheckCircle, ArrowRight, CreditCard } from "lucide-react";

export const metadata: Metadata = {
  title: "Harga | Sahabat Kreator",
  description: "Pilih paket harga yang sesuai untuk kebutuhan manajemen media sosial Anda",
};

export default function PricingPage() {
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
            <Link href="/harga" className="text-sm font-medium text-foreground">Harga</Link>
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
            Harga yang <span className="text-primary">Transparan</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Pilih paket yang sesuai dengan kebutuhan Anda. Semua paket termasuk 14 hari gratis.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Starter */}
            <div className="rounded-lg border border-border bg-card p-8">
              <h3 className="text-xl font-semibold">Starter</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">Gratis</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Untuk kreator pemula</p>
              <ul className="mt-8 space-y-4">
                {["3 Akun Sosial Media", "10 Post/bulan", "Analitik Dasar", "Support Email", "Jadwal Konten"].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block">
                <Button variant="outline" className="w-full">Mulai Gratis</Button>
              </Link>
            </div>

            {/* Pro */}
            <div className="relative rounded-lg border-2 border-primary bg-card p-8 shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-sm font-semibold text-white">
                Populer
              </div>
              <h3 className="text-xl font-semibold">Pro</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">Rp 199.000</span>
                <span className="text-muted-foreground">/bulan</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Untuk kreator profesional</p>
              <ul className="mt-8 space-y-4">
                {["15 Akun Sosial Media", "Unlimited Post", "AI Content Generator", "Analitik Lanjutan", "Priority Support", "Calendar View", "Hashtag Generator"].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block">
                <Button className="w-full">Mulai 14 Hari Gratis</Button>
              </Link>
            </div>

            {/* Business */}
            <div className="rounded-lg border border-border bg-card p-8">
              <h3 className="text-xl font-semibold">Business</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">Rp 499.000</span>
                <span className="text-muted-foreground">/bulan</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Untuk tim dan agensi</p>
              <ul className="mt-8 space-y-4">
                {["Unlimited Akun", "Unlimited Post", "AI Content Generator", "Team Collaboration", "Social Listening", "Dedicated Support", "Custom Branding", "API Access"].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block">
                <Button variant="outline" className="w-full">Hubungi Sales</Button>
              </Link>
            </div>
          </div>

          {/* FAQ */}
          <div className="mx-auto mt-20 max-w-3xl">
            <h2 className="text-center text-3xl font-bold">FAQ</h2>
            <div className="mt-8 space-y-6">
              {[
                { q: "Apakah ada masa percobaan gratis?", a: "Ya, semua paket termasuk 14 hari gratis tanpa memerlukan kartu kredit." },
                { q: "Bagaimana cara Upgrade atau Downgrade?", a: "Anda bisa mengubah paket kapan saja dari halaman settings. Perubahan akan berlaku di cycle billing berikutnya." },
                { q: "Apakah data saya aman?", a: "Kami menggunakan enkripsi end-to-end dan 2FA untuk memastikan keamanan data Anda." },
                { q: "Platform apa saja yang didukung?", a: "Kami mendukung Instagram, TikTok, Facebook, LinkedIn, YouTube, Pinterest, Bluesky, Threads, dan Google Business." },
              ].map((item) => (
                <div key={item.q} className="rounded-lg border border-border p-6">
                  <h3 className="font-semibold">{item.q}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
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
