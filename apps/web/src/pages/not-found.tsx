// Halaman 404 — soft-404 diperbaiki: URL tidak dikenal menampilkan konten
// "tidak ditemukan" nyata dengan meta noindex (bukan redirect ke /).
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useSeo } from "@/lib/seo";

export function NotFoundPage() {
  useSeo({
    title: "Halaman Tidak Ditemukan (404)",
    description: "Halaman yang Anda cari tidak ditemukan di Sahabat Kreator.",
    noIndex: true,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-24">
      <EmptyState
        icon="alert"
        title="404 — Halaman tidak ditemukan"
        description="Halaman yang Anda cari mungkin sudah dipindahkan atau dihapus. Silakan kembali ke beranda atau jelajahi blog kami."
        action={
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Link to="/">
              <Button>Kembali ke Beranda</Button>
            </Link>
            <Link to="/blog">
              <Button variant="outline">Jelajahi Blog</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
