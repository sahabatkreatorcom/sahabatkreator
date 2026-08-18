import { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan | Sahabat Kreator",
  description: "Syarat dan ketentuan penggunaan platform Sahabat Kreator",
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Syarat & Ketentuan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: {new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="prose prose-lg dark:prose-invert mt-8 max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold">1. Penerimaan Syarat</h2>
            <p className="text-muted-foreground">Dengan mengakses dan menggunakan platform Sahabat Kreator, Anda menyetujui untuk terikat dengan Syarat & Ketentuan ini. Jika Anda tidak menyetujui bagian mana pun dari syarat-syarat ini, maka Anda tidak diperkenankan mengakses platform kami.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">2. Deskripsi Layanan</h2>
            <p className="text-muted-foreground">Sahabat Kreator adalah platform manajemen media sosial yang menyediakan fitur untuk pengelolaan akun, penjadwalan konten, analisis performa, dan tools lainnya untuk konten kreator.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">3. Pendaftaran Akun</h2>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Anda wajib menyediakan informasi yang akurat dan lengkap saat pendaftaran</li>
              <li>Anda bertanggung jawab untuk menjaga kerahasiaan akun dan kata sandi Anda</li>
              <li>Anda dilarang menyalahgunakan akun orang lain tanpa otorisasi</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">4. Kebijakan Pembatalan & Pengembalian Dana</h2>
            <p className="text-muted-foreground">Sesuai dengan kebijakan yang berlaku, pembayaran yang telah dilakukan tidak dapat dikembalikan (non-refundable). Mohon untuk memperhatikan ketentuan ini sebelum melakukan pembelian layanan.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">5. Konten Pengguna</h2>
            <p className="text-muted-foreground">Anda bertanggung jawab penuh atas konten yang Anda unggah dan kelola melalui platform kami. Anda menjamin bahwa konten yang Anda unggah tidak melanggar hak kekayaan intelektual atau hukum yang berlaku.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">6. Batasan Tanggung Jawab</h2>
            <p className="text-muted-foreground">Sahabat Kreator tidak bertanggung jawab atas kerugian langsung maupun tidak langsung yang timbul dari penggunaan platform ini, termasuk tetapi tidak terbatas pada kehilangan data, keuntungan, atau peluang bisnis.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">7. Perubahan Syarat</h2>
            <p className="text-muted-foreground">Kami berhak mengubah Syarat & Ketentuan ini sewaktu-waktu. Perubahan akan berlaku segera setelah dipublikasikan di halaman ini. Penggunaan berkelanjutan atas layanan kami setelah perubahan merupakan penerimaan Anda atas perubahan tersebut.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold">8. Kontak</h2>
            <p className="text-muted-foreground">Jika Anda memiliki pertanyaan mengenai Syarat & Ketentuan ini, silakan hubungi kami di support@sahabatkreator.id</p>
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
