import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string[] }>;
}

// Halaman yang benar-benar punya versi English
const EN_PAGES = ["", "kebijakan-privasi", "penghapusan-data", "syarat-ketentuan"];

export default async function EnglishFallbackPage({ params }: Props) {
  const { slug } = await params;
  const path = slug.join("/");

  // Kalau path tersedia di list EN_PAGES, lanjut render
  if (EN_PAGES.includes(path)) {
    // Untuk halaman root /en, tampilkan landing page
    if (path === "") {
      const { default: ENLanding } = await import("../../page");
      return <ENLanding />;
    }
    
    // Untuk halaman legal, cari komponen yang sesuai
    const moduleName = path.replace("-", "");
    try {
      const module = await import(`@/components/en/${path}/page`);
      const Component = module.default;
      return <Component />;
    } catch {
      // Jika komponen tidak ditemukan, fallback ke notFound
      notFound();
    }
  }

  // Untuk halaman lain yang belum ada versi English, tampilkan pesan
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Page Not Available in English</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This page is currently only available in Indonesian.
        </p>
        <div className="mt-8">
          <a
            href={`/${path}`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View in Indonesian →
          </a>
        </div>
      </div>
    </main>
  );
}
