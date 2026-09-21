// Halaman Tentang — misi & nilai Sahabat Kreator
import { Heart, Rocket, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/lib/seo";

const VALUES = [
  {
    icon: Heart,
    title: "Kreator Dulu",
    description:
      "Setiap keputusan produk kami mulai dari satu pertanyaan: apakah ini membantu kreator Indonesia berkarya?",
  },
  {
    icon: ShieldCheck,
    title: "Aman & Terpercaya",
    description:
      "Data Anda dienkripsi end-to-end. Token social media tidak pernah tampil dalam bentuk plain text.",
  },
  {
    icon: Rocket,
    title: "Selalu Berkembang",
    description:
      "Kami merilis perbaikan dan fitur baru secara berkala berdasarkan masukan komunitas kreator.",
  },
  {
    icon: Users,
    title: "Komunitas",
    description:
      "Kami percaya kolaborasi. Sahabat Kreator dibangun bersama kreatornya, untuk kreatornya.",
  },
];

export function AboutPage() {
  useSeo({
    title: "Tentang Kami — Sahabat Kreator",
    description:
      "Kenali Sahabat Kreator — platform manajemen social media yang dibangun khusus untuk kreator dan bisnis Indonesia.",
    path: "/tentang",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "Tentang Sahabat Kreator",
      inLanguage: "id-ID",
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
      <div className="text-center">
        <h1 className="font-bold text-4xl md:text-5xl">
          Sahabat terbaik untuk <span className="text-gradient">perjalanan kreator Anda</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[var(--text-secondary)] text-lg">
          Kami melihat kreator Indonesia menghabiskan berjam-jam untuk tugas teknis — memindah tab,
          copy-paste caption, cek notifikasi satu per satu. Sahabat Kreator lahir untuk mengubah itu
          semua.
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        {VALUES.map((value) => (
          <div key={value.title} className="card p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
              <value.icon className="h-5 w-5" />
            </div>
            <h2 className="mb-2 font-semibold">{value.title}</h2>
            <p className="text-[var(--text-secondary)] text-sm">{value.description}</p>
          </div>
        ))}
      </div>

      <div className="card mt-16 bg-gradient p-10 text-center text-white">
        <h2 className="font-bold text-2xl">Ayo berkenalan lebih jauh</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/80">
          Punya pertanyaan, masukan, atau ide kolaborasi? Tim kami siap membantu.
        </p>
        <Link to="/kontak" className="mt-6 inline-block">
          <Button variant="secondary" size="lg">
            Hubungi Kami
          </Button>
        </Link>
      </div>
    </div>
  );
}
