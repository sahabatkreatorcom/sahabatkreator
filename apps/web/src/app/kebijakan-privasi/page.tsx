import { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | Sahabat Kreator",
  description: "Kebijakan privasi dan perlindungan data pengguna Sahabat Kreator",
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} />
            <span className="text-lg font-semibold">Sahabat Kreator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost" size="sm">Masuk</Button></Link>
            <Link href="/register"><Button size="sm">Coba Gratis</Button></Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Kebijakan Privasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: {new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="prose prose-lg dark:prose-invert mt-8 max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold">1. Informasi yang Kami Kumpulkan</h2>
            <p className="text-muted-foreground">Kami mengumpulkan informasi yang Anda berikan secara langsung, termasuk:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Identitas (nama, email, nomor telepon)</li>
              <li>Informasi akun dan preferensi</li>
              <li>Konten yang Anda unggah dan kelola</li>
              <li>Data penggunaan platform</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">2. Cara Kami Menggunakan Informasi</h2>
            <p className="text-muted-foreground">Informasi Anda digunakan untuk:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Memberikan dan meningkatkan layanan kami</li>
              <li>Mengelola akun dan komunikasi dengan Anda</li>
              <li>Menganalisis penggunaan platform</li>
              <li>Mengirim notifikasi dan pembaruan penting</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">3. berbagi Informasi</h2>
            <p className="text-muted-foreground">Kami tidak menjual atau menyewakan informasi pribadi Anda kepada pihak ketiga. Informasi hanya dibagikan kepada:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Pihak ketiga yang diperlukan untuk operasional layanan (hosting, payment processor)</li>
              <li>otoritas hukum jika diwajibkan oleh hukum</li>
              <li>Pihak lain dengan persetujuan Anda</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">4. Keamanan Data</h2>
            <p className="text-muted-foreground">Kami menerapkan langkah-langkah keamanan teknis dan organisasi yang sesuai untuk melindungi data pribadi Anda dari akses yang tidak sah, kehilangan, atau penyalahgunaan.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">5. Hak Anda</h2>
            <p className="text-muted-foreground">Anda memiliki hak untuk:</p>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Mengakses, memperbaiki, atau menghapus data pribadi Anda</li>
              <li>Mengundurkan diri dari berlangganan layanan</li>
              <li>Menolak pemrosesan data untuk tujuan pemasaran</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">6. Cookies</h2>
            <p className="text-muted-foreground">Platform kami menggunakan cookies untuk meningkatkan pengalaman pengguna, menganalisis penggunaan, dan menyampaikan konten yang relevan.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">7. Perubahan Kebijakan</h2>
            <p className="text-muted-foreground">Kami dapat memperbarui kebijakan privasi ini sewaktu-waktu. Perubahan material akan diinformasikan melalui email atau notifikasi di platform.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">8. Kontak</h2>
            <p className="text-muted-foreground">Untuk pertanyaan mengenai kebijakan privasi ini, silakan hubungi kami di privacy@sahabatkreator.id</p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Sahabat Kreator. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
