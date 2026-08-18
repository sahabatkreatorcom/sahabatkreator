import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ArrowRight, CheckCircle, Facebook, Instagram, Mail, Phone, Twitter } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tentang Kami | Sahabat Kreator",
  description: "Kenali Sahabat Kreator - platform manajemen media sosial AI-powered untuk kreator Indonesia",
};

export default function AboutPage() {
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
            <Link href="/fitur" className="text-sm text-muted-foreground hover:text-foreground">
              Fitur
            </Link>
            <Link href="/harga" className="text-sm text-muted-foreground hover:text-foreground">
              Harga
            </Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">
              Blog
            </Link>
            <Link href="/tentang" className="text-sm font-medium text-foreground">
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

      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Tentang <span className="text-primary">Sahabat Kreator</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Kami percaya bahwa setiap kreator berhak memiliki alat yang powerful untuk mengembangkan bisnis mereka di era digital.
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
                Sahabat Kreator didirikan dengan satu visi: memberdayakan kreator konten Indonesia dengan teknologi AI yang accessible dan mudah digunakan.
              </p>
              <p className="mt-4 text-muted-foreground">
                Kami memahami tantangan yang dihadapi kreator dalam mengelola banyak platform sosial media secara simultan. Dari membuat konten, menjadwalkan posting, hingga menganalisis performa — semua bisa dilakukan di satu tempat.
              </p>
            </div>
            <div className="space-y-6">
              {[
                { title: "Mudah Digunakan", desc: "Interface yang intuitif untuk semua level kreator" },
                { title: "AI-Powered", desc: "Teknologi AI untuk membantu kreativitas Anda" },
                { title: "Lokal & Global", desc: "Didesain untuk kreator Indonesia dengan standar global" },
              ].map((item) => (
                <div key={item.title} className="flex gap-4">
                  <CheckCircle className="mt-1 h-6 w-6 shrink-0 text-primary" />
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

      {/* Team */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold md:text-4xl">Tim Kami</h2>
          <p className="mt-4 text-center text-muted-foreground">Dibangun oleh kreator, untuk kreator</p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { name: "Rizky Fadillah", role: "CEO & Co-Founder", bio: "Berpengalaman 10 tahun di digital marketing" },
              { name: "Maya Sari", role: "CTO & Co-Founder", bio: "Ex-Google, ahli AI & Machine Learning" },
              { name: "Dimas Aditya", role: "Head of Product", bio: "Product leader dari Tokopedia" },
            ].map((member) => (
              <div key={member.name} className="text-center">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                  {member.name[0]}
                </div>
                <h3 className="text-lg font-semibold">{member.name}</h3>
                <p className="text-sm text-primary">{member.role}</p>
                <p className="mt-2 text-sm text-muted-foreground">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-primary py-20 text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: "10,000+", label: "Pengguna Aktif" },
              { value: "1M+", label: "Post Terpublish" },
              { value: "12", label: "Platform Didukung" },
              { value: "99.9%", label: "Uptime" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold">{stat.value}</div>
                <div className="mt-2 text-primary-foreground/80">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold">Hubungi Kami</h2>
            <p className="mt-4 text-muted-foreground">Punya pertanyaan? Kami siap membantu.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { icon: Mail, label: "Email", value: "hello@sahabatkreator.id" },
                { icon: Phone, label: "Telepon", value: "+62 812 3456 7890" },
                { icon: Twitter, label: "Twitter", value: "@sahabatkreator" },
              ].map((contact) => (
                <div key={contact.label} className="flex flex-col items-center gap-2 rounded-lg border border-border p-6">
                  <contact.icon className="h-8 w-8 text-primary" />
                  <span className="font-semibold">{contact.label}</span>
                  <span className="text-sm text-muted-foreground">{contact.value}</span>
                </div>
              ))}
            </div>
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
                <li><Link href="/fitur" className="text-muted-foreground hover:text-foreground">Fitur</Link></li>
                <li><Link href="/harga" className="text-muted-foreground hover:text-foreground">Harga</Link></li>
                <li><Link href="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Perusahaan</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li><Link href="/tentang" className="text-muted-foreground hover:text-foreground">Tentang Kami</Link></li>
                <li><Link href="/karir" className="text-muted-foreground hover:text-foreground">Karir</Link></li>
                <li><Link href="/kontak" className="text-muted-foreground hover:text-foreground">Kontak</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Ikuti Kami</h4>
              <div className="mt-4 flex gap-4">
                <Link href="#" className="text-muted-foreground hover:text-primary"><Instagram className="h-5 w-5" /></Link>
                <Link href="#" className="text-muted-foreground hover:text-primary"><Twitter className="h-5 w-5" /></Link>
                <Link href="#" className="text-muted-foreground hover:text-primary"><Facebook className="h-5 w-5" /></Link>
              </div>
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
