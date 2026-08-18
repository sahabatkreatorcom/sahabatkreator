import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import {
  CalendarClock,
  TrendingUp,
  Users,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Star,
  Zap,
  ShieldCheck,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} />
            <span className="text-lg font-semibold">Sahabat Kreator</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link href="/fitur" className="text-sm text-muted-foreground hover:text-foreground">
              Fitur
            </Link>
            <Link href="/harga" className="text-sm text-muted-foreground hover:text-foreground">
              Harga
            </Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">
              Blog
            </Link>
            <Link href="/tentang" className="text-sm text-muted-foreground hover:text-foreground">
              Tentang
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Masuk
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Coba Gratis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center md:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm text-primary">
            <Zap className="h-4 w-4" />
            Platform Manajemen Media Sosial #1 di Indonesia
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Kelola Semua Akun Sosial Media dalam
            <span className="text-primary"> Satu Dashboard</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            Buat jadwal konten dengan AI, analisis performa, dan tingkatkan engagement
            — semua dalam satu platform yang mudah digunakan.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 text-base">
                Mulai Gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/fitur">
              <Button variant="secondary" size="lg" className="h-12 px-8 text-base">
                Lihat Fitur
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Gratis 14 hari, tanpa kartu kredit</p>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { label: "Kreator Aktif", value: "10.000+" },
            { label: "Post Terjadwal", value: "1M+" },
            { label: "Platform Didukung", value: "12+" },
            { label: "Pengalaman AI", value: "100K+" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
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
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: CalendarClock,
                title: "Jadwal Konten",
                desc: "Jadwalkan post untuk Instagram, TikTok, Facebook, LinkedIn, dan lainnya secara otomatis.",
              },
              {
                icon: Zap,
                title: "AI Content Generator",
                desc: "Buat caption, hashtag, dan ide konten dengan bantuan AI secara instan.",
              },
              {
                icon: BarChart3,
                title: "Analitik Lengkap",
                desc: "Pantau performa akun dan konten dengan dashboard analitik real-time.",
              },
              {
                icon: Users,
                title: "Kolaborasi Tim",
                desc: "Undang anggota tim, atur role, dan kelola approval konten bersama.",
              },
              {
                icon: TrendingUp,
                title: "Social Listening",
                desc: "Pantau tren dan competitor untuk strategi konten yang lebih baik.",
              },
              {
                icon: ShieldCheck,
                title: "Keamanan Terjamin",
                desc: "Data Anda aman dengan enkripsi end-to-end dan 2FA.",
              },
            ].map((feature) => (
              <div key={feature.title} className="rounded-lg border border-border bg-card p-6">
                <feature.icon className="mb-4 h-8 w-8 text-primary" />
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="harga" className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Harga Transparan</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Pilih paket yang sesuai dengan kebutuhan Anda
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Starter",
                price: "Gratis",
                features: ["3 Akun Sosial Media", "10 Post/month", "Analitik Dasar", "Support Email"],
              },
              {
                name: "Pro",
                price: "Rp 199.000",
                popular: true,
                features: [
                  "15 Akun Sosial Media",
                  "Unlimited Post",
                  "AI Content Generator",
                  "Analitik Lanjutan",
                  "Priority Support",
                ],
              },
              {
                name: "Business",
                price: "Rp 499.000",
                features: [
                  "Unlimited Akun",
                  "Unlimited Post",
                  "AI Content Generator",
                  "Team Collaboration",
                  "Social Listening",
                  "Dedicated Support",
                ],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-lg border border-border bg-card p-6 ${
                  plan.popular ? "border-primary shadow-lg" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                    Populer
                  </div>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-2 text-3xl font-bold">{plan.price}</div>
                <div className="mt-1 text-sm text-muted-foreground">/bulan</div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="mt-6 block">
                  <Button className="w-full" variant={plan.popular ? "primary" : "secondary"}>
                    Mulai Sekarang
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            Dipercaya oleh 10.000+ Kreator
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                quote: "Sahabat Kreator membantu saya mengelola 5 akun Instagram dengan lebih efisien. Time saving banget!",
                author: "Andi Pratama",
                role: "Content Creator",
              },
              {
                quote: "Fitur AI-nya luar biasa. Caption dan hashtag otomatis yang relevan.",
                author: "Siti Nurhaliza",
                role: "Social Media Manager",
              },
              {
                quote: "Platform terbaik untuk scheduling konten. UI-nya user-friendly dan analytics-nya lengkap.",
                author: "Budi Santoso",
                role: "Marketing Director",
              },
            ].map((testimonial) => (
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
                    <div className="font-semibold text-sm">{testimonial.author}</div>
                    <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            Siap Meningkatkan Produktivitas Anda?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Bergabung dengan 10.000+ kreator yang telah menggunakan Sahabat Kreator
          </p>
          <div className="mt-8">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 text-base">
                Coba Gratis 14 Hari
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <Logo size={24} />
                <span className="font-semibold">Sahabat Kreator</span>
              </Link>
              <p className="mt-4 text-sm text-muted-foreground">
                Platform manajemen media sosial AI-powered untuk kreator Indonesia.
              </p>
            </div>
            <div>
              <h4 className="font-semibold">Produk</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link href="/fitur" className="text-muted-foreground hover:text-foreground">
                    Fitur
                  </Link>
                </li>
                <li>
                  <Link href="/harga" className="text-muted-foreground hover:text-foreground">
                    Harga
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="text-muted-foreground hover:text-foreground">
                    Blog
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Perusahaan</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link href="/tentang" className="text-muted-foreground hover:text-foreground">
                    Tentang Kami
                  </Link>
                </li>
                <li>
                  <Link href="/karir" className="text-muted-foreground hover:text-foreground">
                    Karir
                  </Link>
                </li>
                <li>
                  <Link href="/kontak" className="text-muted-foreground hover:text-foreground">
                    Kontak
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Legal</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Sahabat Kreator. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
