import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, Rocket, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Karir | Sahabat Kreator",
  description:
    "Bergabunglah dengan tim Sahabat Kreator dalam membangun platform manajemen media sosial untuk kreator Indonesia.",
  robots: {
    index: true,
    follow: true,
  },
};

const roles = [
  {
    icon: Building2,
    title: "Full-Stack Engineer",
    type: "Full-time · Remote",
    desc: "Bangun fitur publish multi-platform, kalender, dan infrastruktur yang melayani ribuan kreator.",
  },
  {
    icon: Rocket,
    title: "AI Engineer",
    type: "Full-time · Remote",
    desc: "Kembangkan asisten Seb: rekomendasi konten, analisis media vision, dan chat konsultan.",
  },
  {
    icon: Users,
    title: "Community Manager",
    type: "Full-time · Remote",
    desc: "Jembatani kreator dan produk, kumpulkan feedback, dan kembangkan komunitas pengguna.",
  },
];

export default function CareersPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Karir di <span className="text-primary">Sahabat Kreator</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Bangun karier Anda bersama kami dan bantu kreator Indonesia tumbuh.
          </p>
        </div>
      </section>

      {/* Open roles */}
      <section className="pb-20">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-bold tracking-tight">Posisi Terbuka</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {roles.map((role) => (
              <div key={role.title} className="rounded-lg border border-border bg-card p-6">
                <role.icon className="mb-4 h-7 w-7 text-primary" />
                <h3 className="font-semibold">{role.title}</h3>
                <p className="mt-1 text-xs font-medium text-primary">{role.type}</p>
                <p className="mt-3 text-sm text-muted-foreground">{role.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-lg bg-muted p-8 text-center">
            <h3 className="text-xl font-semibold">Tidak menemukan yang cocok?</h3>
            <p className="mt-2 text-muted-foreground">
              Kirimkan CV dan surat lamaran spontan Anda, kami selalu terbuka untuk talenta hebat.
            </p>
            <Link href="/kontak" className="mt-6 inline-block">
              <Button>
                Kirim Lamaran
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
